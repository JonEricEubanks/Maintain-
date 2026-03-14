"""
MAINTAIN AI — NLP Dashboard Agent with Code Interpreter

Uses the Model Router for AI-powered intent parsing (routes to gpt-4o
for multimodal dashboard generation). Code Interpreter uses the
Assistants API via AzureOpenAI for server-side Python execution.

 1. Parse natural language prompts into dashboard specs via Model Router
 2. Execute Python code server-side with Code Interpreter (Assistants API)
 3. Return base64 PNG chart images + AI reasoning + narratives
"""

import os
import json
import base64
import time
import re
import traceback
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Optional
from collections import Counter, defaultdict

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

from openai import AzureOpenAI  # Kept for Code Interpreter (Assistants API only)

# ── Model Router (Foundry SDK) ──
from model_router import chat_completion, route

# ============================================
# Configuration
# ============================================

# These are still needed for the Assistants API (Code Interpreter)
AZURE_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
# Strip project path for OpenAI compat
if "/api/projects" in AZURE_ENDPOINT:
    AZURE_ENDPOINT = AZURE_ENDPOINT.split("/api/projects")[0]
API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
MODEL_NAME = os.environ.get("MODEL_DEPLOYMENT_NAME", "gpt-4.1-mini")
API_KEY = os.environ.get("AZURE_AI_API_KEY", "")
MCP_ENDPOINT = os.environ.get("INFRAWATCH_MCP_ENDPOINT", "")


# ============================================
# MCP Data Fetching
# ============================================

def _mcp_call(tool_name: str) -> dict[str, Any]:
    import requests
    try:
        resp = requests.post(
            MCP_ENDPOINT,
            json={
                "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                "params": {"name": tool_name, "arguments": {}},
            },
            headers={"Content-Type": "application/json"},
            timeout=60,
        )
        result = resp.json()
        if "result" in result and "content" in result["result"]:
            return json.loads(result["result"]["content"][0]["text"])
    except Exception as e:
        print(f"   ⚠️ MCP {tool_name} failed: {e}")
    return {"error": f"Failed to retrieve {tool_name}"}


def fetch_all_data() -> dict[str, Any]:
    data = {}
    for tool in ["get_work_orders", "get_potholes", "get_sidewalk_issues", "get_schools"]:
        print(f"   📡 Fetching: {tool}")
        data[tool] = _mcp_call(tool)
    return data


def normalize_issues(mcp_data: dict[str, Any]) -> list[dict[str, Any]]:
    all_issues = []
    for key, source_type in [
        ("get_potholes", "pothole"),
        ("get_sidewalk_issues", "sidewalk"),
        ("get_work_orders", "work_order"),
    ]:
        raw = mcp_data.get(key, {})
        items = []
        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict) and "features" in raw:
            items = [f.get("properties", f) for f in raw["features"]]
        for item in items:
            sev = (item.get("severity") or "medium").lower()
            if sev not in ("critical", "high", "medium", "low"):
                sev = "medium"
            all_issues.append({
                "type": source_type,
                "severity": sev,
                "address": item.get("address") or item.get("street") or "",
                "nearSchool": bool(item.get("nearSchool") or item.get("near_school")),
                "cost": item.get("estimatedCost") or item.get("cost") or _default_cost(source_type, sev),
                "status": (item.get("status") or "open").lower(),
                "zone": item.get("zone") or "",
                "createdAt": item.get("reportedDate") or item.get("createdDate") or item.get("createdAt") or "",
            })
    return all_issues


def _default_cost(issue_type: str, severity: str) -> float:
    costs = {
        ("pothole", "critical"): 3500, ("pothole", "high"): 2200,
        ("pothole", "medium"): 1200, ("pothole", "low"): 600,
        ("sidewalk", "critical"): 5500, ("sidewalk", "high"): 3800,
        ("sidewalk", "medium"): 2000, ("sidewalk", "low"): 900,
        ("work_order", "critical"): 4000, ("work_order", "high"): 2500,
        ("work_order", "medium"): 1500, ("work_order", "low"): 700,
    }
    return costs.get((issue_type, severity), 1500)


# ============================================
# Data helpers
# ============================================

def build_data_summary(issues: list[dict]) -> str:
    sev_counts = Counter(i["severity"] for i in issues)
    type_counts = Counter(i["type"] for i in issues)
    total_cost = sum(i["cost"] for i in issues)
    school_count = sum(1 for i in issues if i["nearSchool"])
    status_counts = Counter(i["status"] for i in issues)
    zone_counts = Counter(i["zone"] or "Unknown" for i in issues)
    return (
        f"Total issues: {len(issues)}\n"
        f"Severity: critical={sev_counts.get('critical',0)}, high={sev_counts.get('high',0)}, "
        f"medium={sev_counts.get('medium',0)}, low={sev_counts.get('low',0)}\n"
        f"Types: pothole={type_counts.get('pothole',0)}, sidewalk={type_counts.get('sidewalk',0)}, "
        f"work_order={type_counts.get('work_order',0)}\n"
        f"Total cost: ${total_cost:,.0f}\n"
        f"Near schools: {school_count}\n"
        f"Status: {dict(status_counts)}\n"
        f"Zones: {dict(zone_counts.most_common(8))}\n"
    )


def build_data_csv(issues: list[dict]) -> str:
    lines = ["type,severity,address,nearSchool,cost,status,zone,createdAt"]
    for i in issues:
        addr = i['address'].replace('"', "'")
        zone = i['zone'].replace('"', "'")
        lines.append(
            f"{i['type']},{i['severity']},\"{addr}\","
            f"{i['nearSchool']},{i['cost']},{i['status']},"
            f"\"{zone}\",{i['createdAt']}"
        )
    return "\n".join(lines)


# ============================================
# Phase 1: AI Intent Parsing
# ============================================

INTENT_SYSTEM_PROMPT = """You are an expert data analyst for Lake Forest, IL infrastructure.

The user will describe a dashboard or report they want in natural language.
Parse their intent into a structured dashboard specification.

Respond with valid JSON only (no markdown fences, no explanation outside JSON).

JSON schema:
{
  "title": "string — dashboard title",
  "description": "string — 1-sentence summary",
  "reasoning": ["string — step-by-step reasoning about what the user wants"],
  "filters": {
    "severity": ["critical","high","medium","low"] or null,
    "issueType": ["pothole","sidewalk","work_order"] or null,
    "nearSchool": true/false or null,
    "status": ["open","assigned","in_progress","completed","deferred"] or null
  },
  "widgets": [
    {
      "type": "kpi|bar-chart|pie-chart|table|trend-line|severity-gauge|narrative|cost-waterfall|hotspot-bar|heatmap|code-interpreter-chart",
      "title": "string",
      "metric": "count|cost|avg-cost|severity-breakdown|type-breakdown|school-proximity|status-breakdown|zone-breakdown|top-n|trend|geographic-hotspots|severity-type-matrix|custom-analysis",
      "size": "sm|md|lg",
      "insight": "string — 1-sentence AI insight",
      "chart_instruction": "string — what Python chart to generate (only for code-interpreter-chart type)"
    }
  ],
  "code_interpreter_instructions": "string — detailed instructions for what Python visualizations to generate. Be very specific about chart types, colors, and data dimensions."
}

RULES:
- Always include 3 KPI widgets first (total count, total cost, contextual metric)
- Include at least 2 standard chart widgets (pie-chart, bar-chart, severity-gauge, etc.)
- Include 2-4 'code-interpreter-chart' widgets — these get REAL Python-generated visualizations
  Use them for the most impactful analyses: correlation scatter plots, multi-axis charts,
  radar charts, Pareto charts, box plots, violin plots, stacked area, heat maps, etc.
- Include a narrative widget at the end
- Be generous — rich dashboards of 8-14 widgets
- code_interpreter_instructions should be comprehensive Python instructions for ALL code-interpreter widgets
"""


def parse_intent_with_ai(prompt: str, data_summary: str) -> tuple[dict[str, Any] | None, dict]:
    """Returns (parsed_spec, token_usage) where token_usage has prompt/completion/total keys."""
    try:
        decision = route("nlp_dashboard")
        print(f"   🔀 Model Router: {decision.model_id} ({decision.profile.display_name}) for NLP intent parsing")
        
        resp = chat_completion(
            agent="nlp_dashboard",
            messages=[
                {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"User prompt: \"{prompt}\"\n\n"
                    f"Available data summary:\n{data_summary}\n\n"
                    "Generate the dashboard JSON specification."
                )},
            ],
            temperature=0.3,
            max_tokens=4096,
        )
        raw = resp.content
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
        parsed = json.loads(raw)
        tokens = {"prompt": resp.prompt_tokens, "completion": resp.completion_tokens, "total": resp.total_tokens}
        print(f"   ✅ AI parsed intent: {parsed.get('title', 'Dashboard')} "
              f"with {len(parsed.get('widgets', []))} widgets "
              f"({resp.total_tokens} tokens, {resp.latency_ms:.0f}ms)")
        return parsed, tokens
    except Exception as e:
        print(f"   ⚠️ AI intent parsing failed: {e}")
        traceback.print_exc()
        return None, {"prompt": 0, "completion": 0, "total": 0}


# ============================================
# Phase 2: Code Interpreter — Dynamic Python Charts
# ============================================

CODE_INTERPRETER_SYSTEM = """You are a senior data visualization engineer creating charts for Lake Forest, IL infrastructure.

You receive infrastructure data as CSV. Write Python code that generates gorgeous charts.

MANDATORY STYLE:
- Dark theme: background '#1a1a2e', text '#e5e5e5', grid '#333355'
- Severity colors: critical='#ef4444', high='#f59e0b', medium='#3b82f6', low='#22c55e'
- Type colors: pothole='#f59e0b', sidewalk='#6366f1', work_order='#3b82f6'
- Use matplotlib/seaborn, DPI 150, tight_layout, sans-serif font
- Make charts publication-quality with annotations, legends, clear labels

CODE FORMAT:
1. Import pandas and read the CSV from 'data.csv'
2. Generate each requested chart, saving as chart_1.png, chart_2.png, etc.
3. After each chart, print "CHART_INSIGHT: <one-sentence data insight>"
4. After ALL charts, print the narrative:
   NARRATIVE_START
   <markdown narrative with **bold** stats and recommendations>
   NARRATIVE_END

Available CSV columns: type, severity, address, nearSchool, cost, status, zone, createdAt
The nearSchool column has values True/False (string).
Convert cost to float. Handle missing values gracefully.
"""


def run_code_interpreter(
    issues: list[dict],
    chart_instructions: str,
    widget_chart_instructions: list[dict],
) -> dict[str, Any]:
    """
    Run Azure OpenAI Assistants API with Code Interpreter.
    Returns { charts: [...], narrative: str, success: bool }
    """
    result = {"charts": [], "narrative": "", "code_executed": "", "success": False}

    if not AZURE_ENDPOINT or not API_KEY:
        print("   ℹ️ No Azure credentials — skipping Code Interpreter")
        return result

    client = None
    assistant_id = None
    file_id = None

    try:
        client = AzureOpenAI(
            azure_endpoint=AZURE_ENDPOINT,
            api_key=API_KEY,
            api_version=API_VERSION,
            timeout=180,
            max_retries=2,
        )

        csv_data = build_data_csv(issues)

        # Upload CSV as a file for Code Interpreter
        print("   📁 Uploading data file...")
        csv_bytes = csv_data.encode("utf-8")
        upload_file = client.files.create(
            file=("data.csv", csv_bytes),
            purpose="assistants",
        )
        file_id = upload_file.id
        print(f"   ✅ File uploaded: {file_id}")

        # Build chart instructions
        chart_detail = "\n".join([
            f"Chart {i+1}: {w.get('chart_instruction', w.get('title', 'Analysis'))}"
            for i, w in enumerate(widget_chart_instructions)
        ])

        full_instructions = (
            f"Generate the following visualizations from data.csv:\n\n"
            f"{chart_instructions}\n\n"
            f"Specific charts:\n{chart_detail}\n\n"
            f"Total charts to generate: {len(widget_chart_instructions)}\n"
            f"Save them as chart_1.png, chart_2.png, etc."
        )

        # Create Assistant with Code Interpreter
        print("   🤖 Creating Code Interpreter assistant...")
        assistant = client.beta.assistants.create(
            model=MODEL_NAME,
            name="InfraWatch Chart Generator",
            instructions=CODE_INTERPRETER_SYSTEM,
            tools=[{"type": "code_interpreter"}],
            tool_resources={
                "code_interpreter": {"file_ids": [file_id]}
            },
        )
        assistant_id = assistant.id

        # Create Thread and Message
        thread = client.beta.threads.create()
        client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=full_instructions,
            attachments=[{
                "file_id": file_id,
                "tools": [{"type": "code_interpreter"}],
            }],
        )

        # Run
        print("   ⚡ Running Code Interpreter...")
        run = client.beta.threads.runs.create(
            thread_id=thread.id,
            assistant_id=assistant_id,
        )

        # Poll for completion
        max_wait = 180
        start = time.time()
        while time.time() - start < max_wait:
            run_status = client.beta.threads.runs.retrieve(
                thread_id=thread.id,
                run_id=run.id,
            )
            status = run_status.status
            if status in ("completed", "failed", "cancelled", "expired"):
                break
            print(f"      ... status: {status} ({int(time.time()-start)}s)")
            time.sleep(3)

        if run_status.status != "completed":
            print(f"   ⚠️ Code Interpreter status: {run_status.status}")
            if hasattr(run_status, 'last_error') and run_status.last_error:
                print(f"   ⚠️ Error: {run_status.last_error}")
        else:
            print("   ✅ Code Interpreter completed")

        # Extract results
        messages = client.beta.threads.messages.list(
            thread_id=thread.id, order="asc"
        )

        insights = []
        narrative_parts = []
        in_narrative = False

        for msg in messages.data:
            if msg.role != "assistant":
                continue

            for block in msg.content:
                if block.type == "text":
                    text = block.text.value or ""
                    for line in text.split("\n"):
                        stripped = line.strip()
                        if stripped.startswith("CHART_INSIGHT:"):
                            insights.append(stripped.replace("CHART_INSIGHT:", "").strip())
                        elif "NARRATIVE_START" in stripped:
                            in_narrative = True
                            continue
                        elif "NARRATIVE_END" in stripped:
                            in_narrative = False
                            continue
                        elif in_narrative:
                            narrative_parts.append(line)

                    # If no markers, treat long text as narrative
                    if not narrative_parts and not insights and len(text) > 300:
                        narrative_parts.append(text)

                elif block.type == "image_file":
                    fid = block.image_file.file_id
                    try:
                        file_content = client.files.content(fid)
                        img_bytes = file_content.read()
                        b64 = base64.b64encode(img_bytes).decode()
                        idx = len(result["charts"])
                        ci_w = widget_chart_instructions[idx] if idx < len(widget_chart_instructions) else {}
                        result["charts"].append({
                            "name": f"ai_chart_{idx+1}",
                            "base64_png": b64,
                            "title": ci_w.get("title", f"AI Chart {idx+1}"),
                            "insight": insights[idx] if idx < len(insights) else ci_w.get("insight", ""),
                            "chart_instruction": ci_w.get("chart_instruction", ""),
                        })
                        print(f"   📊 Extracted chart {idx+1}: {ci_w.get('title', 'chart')}")
                    except Exception as e:
                        print(f"   ⚠️ Failed to extract chart: {e}")

        result["narrative"] = "\n".join(narrative_parts).strip()
        result["success"] = len(result["charts"]) > 0

        print(f"   ✅ Code Interpreter: {len(result['charts'])} charts, "
              f"{len(result['narrative'])} char narrative")

    except Exception as e:
        print(f"   ⚠️ Code Interpreter failed: {e}")
        traceback.print_exc()

    finally:
        # Cleanup
        if client and assistant_id:
            try:
                client.beta.assistants.delete(assistant_id)
            except:
                pass
        if client and file_id:
            try:
                client.files.delete(file_id)
            except:
                pass

    return result


# ============================================
# Phase 3: AI Narrative
# ============================================

NARRATIVE_SYSTEM = """You are a senior infrastructure analyst writing a dashboard narrative for Lake Forest, IL city officials.

Write a clear, data-driven narrative:
1. Summarize key findings
2. Highlight critical issues and risks
3. Provide actionable recommendations
4. Use specific numbers and percentages
5. Professional but accessible

Format as Markdown with **bold** for key stats. 3-5 paragraphs.
Do NOT use <think> tags."""


def generate_ai_narrative(prompt: str, issues: list[dict], filters: dict) -> tuple[str, dict]:
    """Returns (narrative_text, token_usage)."""
    try:
        total = len(issues)
        sev_counts = Counter(i["severity"] for i in issues)
        type_counts = Counter(i["type"] for i in issues)
        total_cost = sum(i["cost"] for i in issues)
        school_count = sum(1 for i in issues if i["nearSchool"])
        data_ctx = (
            f"Total issues: {total}\n"
            f"Severity: critical={sev_counts.get('critical',0)}, high={sev_counts.get('high',0)}, "
            f"medium={sev_counts.get('medium',0)}, low={sev_counts.get('low',0)}\n"
            f"Types: {dict(type_counts)}\n"
            f"Total cost: ${total_cost:,.0f}\n"
            f"Near schools: {school_count}\n"
            f"Filters: {json.dumps(filters)}\n"
        )
        resp = chat_completion(
            agent="nlp_dashboard",
            messages=[
                {"role": "system", "content": NARRATIVE_SYSTEM},
                {"role": "user", "content": f"User asked: \"{prompt}\"\n\nData:\n{data_ctx}\n\nWrite the narrative."},
            ],
            temperature=0.4,
            max_tokens=2048,
        )
        tokens = {"prompt": resp.prompt_tokens, "completion": resp.completion_tokens, "total": resp.total_tokens}
        return resp.content, tokens
    except Exception as e:
        print(f"   ⚠️ AI narrative failed: {e}")
        return _local_narrative(issues), {"prompt": 0, "completion": 0, "total": 0}


def _local_narrative(issues: list[dict]) -> str:
    total = len(issues)
    sev = Counter(i["severity"] for i in issues)
    cost = sum(i["cost"] for i in issues)
    school = sum(1 for i in issues if i["nearSchool"])
    c = sev.get("critical", 0)
    return (
        f"Analysis of **{total}** infrastructure issues reveals "
        f"{'**' + str(c) + ' critical** items requiring immediate attention, ' if c else ''}"
        f"with an estimated total repair cost of **${cost/1000:,.0f}K**. "
        f"{'**' + str(school) + '** issues are near schools. ' if school else ''}"
        "Recommend prioritizing high-severity items and school-zone repairs first."
    )


# ============================================
# Local Charts (Fallback)
# ============================================

def generate_local_charts(issues: list[dict], widgets: list[dict]) -> dict[str, str]:
    charts = {}
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib.ticker as ticker
        from io import BytesIO
    except ImportError:
        return charts

    dark_bg = '#1a1a2e'
    text_color = '#e5e5e5'
    accent = {'critical': '#ef4444', 'high': '#f59e0b', 'medium': '#3b82f6', 'low': '#22c55e'}
    type_colors = {'pothole': '#f59e0b', 'sidewalk': '#6366f1', 'work_order': '#3b82f6'}
    palette = ['#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#14b8a6', '#f43f5e']

    plt.rcParams.update({
        'figure.facecolor': dark_bg, 'axes.facecolor': dark_bg,
        'text.color': text_color, 'axes.labelcolor': text_color,
        'xtick.color': text_color, 'ytick.color': text_color,
        'axes.edgecolor': '#333355', 'grid.color': '#333355',
        'font.family': 'sans-serif', 'font.size': 11,
    })

    def to_b64(fig):
        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=dark_bg, edgecolor='none')
        plt.close(fig)
        buf.seek(0)
        return base64.b64encode(buf.read()).decode()

    for idx, w in enumerate(widgets):
        wtype = w.get("type", "")
        metric = w.get("metric", "")
        title = w.get("title", "")

        try:
            if wtype == "pie-chart":
                if metric == "severity-breakdown":
                    counts = Counter(i["severity"] for i in issues)
                    order = ['critical', 'high', 'medium', 'low']
                elif metric == "type-breakdown":
                    counts = Counter(i["type"] for i in issues)
                    order = list(counts.keys())
                elif metric == "status-breakdown":
                    counts = Counter(i["status"] for i in issues)
                    order = list(counts.keys())
                else:
                    continue
                sizes = [counts.get(k, 0) for k in order if counts.get(k, 0) > 0]
                labels = [f"{k.replace('_',' ').title()}\n({counts[k]})" for k in order if counts.get(k, 0) > 0]
                keys_used = [k for k in order if counts.get(k, 0) > 0]
                colors = [accent.get(k, type_colors.get(k, palette[i % len(palette)])) for i, k in enumerate(keys_used)]
                fig, ax = plt.subplots(figsize=(7, 5))
                ax.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%',
                       startangle=90, pctdistance=0.78,
                       wedgeprops=dict(width=0.4, edgecolor=dark_bg, linewidth=2),
                       textprops=dict(color=text_color, fontsize=10))
                ax.set_title(title, fontsize=14, fontweight='bold', pad=18)
                centre = plt.Circle((0, 0), 0.55, fc=dark_bg)
                ax.add_artist(centre)
                ax.text(0, 0, str(sum(sizes)), ha='center', va='center',
                        fontsize=24, fontweight='bold', color=text_color)
                charts[str(idx)] = to_b64(fig)

            elif wtype in ("bar-chart", "hotspot-bar"):
                if metric == "type-breakdown":
                    counts = Counter(i["type"] for i in issues)
                elif metric == "severity-breakdown":
                    counts = Counter(i["severity"] for i in issues)
                elif metric == "zone-breakdown":
                    counts = Counter(i["zone"] or "Unknown" for i in issues)
                elif metric in ("cost", "cost-by-type"):
                    cost_by = defaultdict(float)
                    for i in issues:
                        cost_by[i["type"]] += i["cost"]
                    counts = dict(cost_by)
                elif metric == "geographic-hotspots":
                    street_counts = Counter()
                    for i in issues:
                        addr = i["address"]
                        if addr:
                            parts = addr.split()
                            street = " ".join(p for p in parts if not p.isdigit() and p not in ("N","S","E","W","IL"))
                            if street and len(street) > 2:
                                street_counts[street] += 1
                    counts = dict(street_counts.most_common(10))
                else:
                    continue
                sorted_items = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:12]
                labels_b = [s[0].replace("_", " ").title()[:25] for s in sorted_items]
                values_b = [s[1] for s in sorted_items]
                keys_b = [s[0] for s in sorted_items]
                bar_colors = [accent.get(k, type_colors.get(k, palette[j % len(palette)])) for j, k in enumerate(keys_b)]
                fig, ax = plt.subplots(figsize=(8, max(3, len(labels_b) * 0.55 + 1.5)))
                bars = ax.barh(labels_b, values_b, color=bar_colors, edgecolor='none', height=0.55)
                ax.set_title(title, fontsize=14, fontweight='bold', pad=15)
                is_cost = metric in ("cost", "cost-by-type")
                if is_cost:
                    ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'${x/1000:,.0f}K'))
                ax.invert_yaxis()
                ax.spines['top'].set_visible(False)
                ax.spines['right'].set_visible(False)
                ax.grid(axis='x', alpha=0.2)
                for bar, val in zip(bars, values_b):
                    lbl = f'${val/1000:,.0f}K' if is_cost else f'{val:,}'
                    ax.text(bar.get_width() + max(values_b)*0.02, bar.get_y()+bar.get_height()/2,
                            lbl, va='center', fontsize=10, fontweight='bold', color=text_color)
                charts[str(idx)] = to_b64(fig)

        except Exception as e:
            print(f"   ⚠️ Local chart {idx} ({wtype}) failed: {e}")

    return charts


# ============================================
# Compute widget values
# ============================================

def _compute_widget_values(widget: dict, issues: list[dict]) -> dict:
    metric = widget.get("metric", "count")
    values = {}
    rows = None
    total = len(issues)

    if metric == "count":
        values["Total"] = total
    elif metric in ("cost", "cost-by-type"):
        values["Total Cost"] = sum(i["cost"] for i in issues)
        for t in set(i["type"] for i in issues):
            values[t] = sum(i["cost"] for i in issues if i["type"] == t)
    elif metric == "avg-cost":
        values["Average"] = round(sum(i["cost"] for i in issues) / max(total, 1))
    elif metric == "severity-breakdown":
        for s in ["critical", "high", "medium", "low"]:
            values[s] = sum(1 for i in issues if i["severity"] == s)
    elif metric == "type-breakdown":
        for t in set(i["type"] for i in issues):
            values[t] = sum(1 for i in issues if i["type"] == t)
    elif metric == "school-proximity":
        values["Near School"] = sum(1 for i in issues if i["nearSchool"])
        values["Not Near School"] = total - values["Near School"]
    elif metric == "status-breakdown":
        for s in set(i["status"] for i in issues):
            values[s] = sum(1 for i in issues if i["status"] == s)
    elif metric == "zone-breakdown":
        for z in set(i["zone"] or "Unknown" for i in issues):
            values[z] = sum(1 for i in issues if (i["zone"] or "Unknown") == z)
    elif metric == "top-n":
        sorted_issues = sorted(issues, key=lambda x: x["cost"], reverse=True)[:10]
        rows = [{"type": i["type"], "severity": i["severity"],
                 "address": i["address"][:40], "cost": i["cost"],
                 "status": i["status"], "school": "Yes" if i["nearSchool"] else "No"}
                for i in sorted_issues]
    elif metric == "trend":
        monthly = defaultdict(int)
        for i in issues:
            dt = i.get("createdAt", "")
            if dt:
                try:
                    d = datetime.fromisoformat(dt.replace("Z", "+00:00"))
                    monthly[f"{d.year}-{d.month:02d}"] += 1
                except:
                    pass
        values = dict(sorted(monthly.items()))
    elif metric == "geographic-hotspots":
        sc = Counter()
        for i in issues:
            addr = i["address"]
            if addr:
                parts = addr.split()
                street = " ".join(p for p in parts if not p.isdigit() and p not in ("N","S","E","W","IL"))
                if street and len(street) > 2:
                    sc[street] += 1
        values = dict(sc.most_common(10))
    # For custom-analysis and code-interpreter, just pass total
    elif metric == "custom-analysis":
        values["Total"] = total

    return {**widget, "values": values, "rows": rows, "total": total}


def _apply_filters(issues: list[dict], filters: dict) -> list[dict]:
    data = list(issues)
    if filters.get("severity"):
        data = [i for i in data if i["severity"] in filters["severity"]]
    if filters.get("issueType"):
        data = [i for i in data if i["type"] in filters["issueType"]]
    if filters.get("nearSchool") is True:
        data = [i for i in data if i["nearSchool"]]
    if filters.get("status"):
        data = [i for i in data if i["status"] in filters["status"]]
    return data


# ============================================
# Local Intent Parser (Fallback)
# ============================================

def _local_intent_parse(prompt: str):
    p = prompt.lower()
    widgets = []
    order = 0

    def w(wtype, title, metric, size="md", ci=""):
        nonlocal order; order += 1
        return {"type": wtype, "title": title, "metric": metric,
                "size": size, "insight": "", "chart_instruction": ci}

    widgets.append(w("kpi", "Total Issues", "count", "sm"))
    widgets.append(w("kpi", "Estimated Cost", "cost", "sm"))
    widgets.append(w("kpi", "Avg. Cost per Issue", "avg-cost", "sm"))

    if any(k in p for k in ["budget", "cost", "spend", "dollar", "money"]):
        widgets.append(w("bar-chart", "Cost by Type", "cost", "lg"))
        widgets.append(w("code-interpreter-chart", "Cost Deep Dive",
                         "custom-analysis", "lg",
                         "Stacked bar of costs by type+severity, plus Pareto of cumulative cost"))

    if any(k in p for k in ["severity", "critical", "priority", "urgent", "risk"]):
        widgets.append(w("severity-gauge", "Severity Overview", "severity-breakdown"))
        widgets.append(w("pie-chart", "Severity Distribution", "severity-breakdown"))
        widgets.append(w("code-interpreter-chart", "Risk Matrix",
                         "custom-analysis", "lg",
                         "Heatmap of severity vs type annotated with costs and issue counts"))

    if any(k in p for k in ["type", "breakdown", "distribution", "category"]):
        widgets.append(w("pie-chart", "Issue Type Distribution", "type-breakdown"))
        widgets.append(w("bar-chart", "Issues by Type", "type-breakdown"))

    if "school" in p:
        widgets.append(w("kpi", "Near Schools", "school-proximity", "sm"))
        widgets.append(w("code-interpreter-chart", "School Zone Risk",
                         "custom-analysis", "lg",
                         "Grouped bar: severity distribution near schools vs not near schools"))

    if any(k in p for k in ["trend", "forecast", "timeline", "over time", "month"]):
        widgets.append(w("code-interpreter-chart", "Trend Analysis",
                         "custom-analysis", "lg",
                         "Time series with monthly counts, 3-month moving average, and linear trend projection"))

    if any(k in p for k in ["table", "list", "top", "worst", "detail", "ranking"]):
        widgets.append(w("table", "Top Issues", "top-n", "lg"))

    if any(k in p for k in ["zone", "area", "geography", "location", "street", "hotspot"]):
        widgets.append(w("bar-chart", "Geographic Hotspots", "geographic-hotspots", "lg"))

    if len(widgets) <= 3:
        widgets.append(w("pie-chart", "Severity Distribution", "severity-breakdown"))
        widgets.append(w("bar-chart", "Issues by Type", "type-breakdown"))
        widgets.append(w("code-interpreter-chart", "Full Analysis",
                         "custom-analysis", "lg",
                         "Multi-panel: severity donut, type bar chart, cost waterfall, severity*type heatmap"))
        widgets.append(w("table", "Top Issues", "top-n", "lg"))

    widgets.append(w("narrative", "AI Analysis", "count", "lg"))

    filters = {}
    for s in ["critical", "high", "medium", "low"]:
        if s in p:
            filters.setdefault("severity", []).append(s)
    for t in ["pothole", "sidewalk", "concrete"]:
        if t in p:
            filters.setdefault("issueType", []).append(t)
    if "school" in p:
        filters["nearSchool"] = True

    title = "Custom Infrastructure Dashboard"
    for kw, t in [("budget", "Budget Analysis"), ("cost", "Cost Analysis"),
                   ("severity", "Severity Analysis"), ("critical", "Critical Issues"),
                   ("school", "School Safety"), ("pothole", "Pothole Analysis"),
                   ("trend", "Trend Analysis")]:
        if kw in p:
            title = f"{t} Dashboard"
            break

    ci_instructions = f"Generate publication-quality charts analyzing infrastructure data. Focus on: {prompt}"
    return title, f'Generated from: "{prompt}"', widgets, filters, ci_instructions


# ============================================
# Main Entry Point
# ============================================

def generate_nlp_dashboard(
    prompt: str,
    work_orders_json: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """
    Generate a complete AI-powered dashboard from natural language.

    Pipeline:
      1. Fetch data (MCP or pre-supplied)
      2. AI Intent Parsing (GPT-4.1-mini)
      3. Apply filters
      4. Code Interpreter — dynamic Python charts
      5. Local matplotlib fallbacks
      6. AI Narrative
      7. Assemble response
    """
    start_time = datetime.now()
    reasoning = []

    # ── Phase 1: Data ──
    print("   📡 Phase 1: Gathering data...")
    reasoning.append({"step": 1, "phase": "Data Collection",
                      "description": "Fetching infrastructure data", "status": "started"})

    if work_orders_json:
        issues = []
        for wo in work_orders_json:
            sev = (wo.get("severity") or "medium").lower()
            issues.append({
                "type": wo.get("issueType", "pothole"),
                "severity": sev,
                "address": wo.get("address", ""),
                "nearSchool": wo.get("nearSchool", False),
                "cost": wo.get("estimatedCost", _default_cost(wo.get("issueType", "pothole"), sev)),
                "status": (wo.get("status") or "open").lower(),
                "zone": wo.get("zone", ""),
                "createdAt": wo.get("createdAt", ""),
            })
        reasoning[-1]["description"] = f"Using {len(issues)} pre-supplied work orders"
    else:
        mcp_data = fetch_all_data()
        issues = normalize_issues(mcp_data)
        reasoning[-1]["description"] = f"Fetched {len(issues)} issues from MCP"
    reasoning[-1]["status"] = "complete"
    print(f"   ✅ {len(issues)} issues loaded")

    data_summary = build_data_summary(issues)

    # Token tracking across all AI calls
    _token_totals = {"prompt": 0, "completion": 0, "total": 0}

    def _accum_tokens(usage: dict):
        _token_totals["prompt"] += usage.get("prompt", 0)
        _token_totals["completion"] += usage.get("completion", 0)
        _token_totals["total"] += usage.get("total", 0)

    # ── Phase 2: AI Intent Parsing ──
    print("   🧠 Phase 2: AI intent parsing...")
    reasoning.append({"step": 2, "phase": "AI Intent Parsing",
                      "description": f"Sending prompt via Model Router", "status": "started"})

    ai_spec, intent_tokens = parse_intent_with_ai(prompt, data_summary)
    _accum_tokens(intent_tokens)
    if ai_spec:
        title = ai_spec.get("title", "AI Dashboard")
        description = ai_spec.get("description", f'Generated from: "{prompt}"')
        widgets = ai_spec.get("widgets", [])
        filters = ai_spec.get("filters", {})
        ai_reasoning = ai_spec.get("reasoning", [])
        ci_instructions = ai_spec.get("code_interpreter_instructions", "")
        reasoning[-1]["description"] = f"AI parsed: '{title}' with {len(widgets)} widgets"
        reasoning[-1]["status"] = "complete"
        reasoning[-1]["ai_reasoning"] = ai_reasoning
    else:
        title, description, widgets, filters, ci_instructions = _local_intent_parse(prompt)
        reasoning[-1]["description"] = "Used local parser (AI unavailable)"
        reasoning[-1]["status"] = "complete"

    # ── Phase 3: Filters ──
    filtered = _apply_filters(issues, filters or {})
    reasoning.append({"step": 3, "phase": "Data Filtering",
                      "description": f"{len(filtered)}/{len(issues)} issues after filters",
                      "status": "complete"})

    # ── Phase 4: Code Interpreter ──
    ci_widgets = [w for w in widgets if w.get("type") == "code-interpreter-chart"]
    ci_result = {"charts": [], "narrative": "", "success": False}

    if ci_widgets:
        print(f"   ⚡ Phase 4: Code Interpreter ({len(ci_widgets)} charts)...")
        reasoning.append({"step": 4, "phase": "Code Interpreter",
                          "description": f"Executing Python for {len(ci_widgets)} dynamic charts",
                          "status": "started"})

        ci_result = run_code_interpreter(filtered, ci_instructions, ci_widgets)

        if ci_result["success"]:
            reasoning[-1]["description"] = f"Generated {len(ci_result['charts'])} AI charts via Code Interpreter"
            reasoning[-1]["status"] = "complete"
        else:
            reasoning[-1]["description"] = "Code Interpreter unavailable — will use local charts"
            reasoning[-1]["status"] = "fallback"
    else:
        reasoning.append({"step": 4, "phase": "Code Interpreter",
                          "description": "No code-interpreter widgets in spec", "status": "skipped"})

    # ── Phase 5: Local Charts ──
    print("   📊 Phase 5: Local charts...")
    standard_widgets = [w for w in widgets
                        if w.get("type") not in ("kpi", "table", "narrative", "code-interpreter-chart")]
    local_charts = generate_local_charts(filtered, standard_widgets)
    reasoning.append({"step": 5, "phase": "Local Charts",
                      "description": f"Generated {len(local_charts)} matplotlib charts",
                      "status": "complete"})

    # ── Phase 6: AI Narrative ──
    print("   📝 Phase 6: AI narrative...")
    reasoning.append({"step": 6, "phase": "AI Narrative",
                      "description": f"Generating narrative via Model Router", "status": "started"})
    narrative = ci_result.get("narrative", "")
    if not narrative:
        narrative, narr_tokens = generate_ai_narrative(prompt, filtered, filters or {})
        _accum_tokens(narr_tokens)
    reasoning[-1]["description"] = f"Generated {len(narrative)} char narrative"
    reasoning[-1]["status"] = "complete"

    # ── Assemble widgets ──
    widget_data = []
    ci_idx = 0
    local_idx = 0

    for w in widgets:
        wd = _compute_widget_values(w, filtered)

        if w.get("type") == "code-interpreter-chart":
            if ci_idx < len(ci_result["charts"]):
                ci = ci_result["charts"][ci_idx]
                wd["chart_base64"] = ci["base64_png"]
                wd["insight"] = ci.get("insight") or w.get("insight", "")
                wd["source"] = "code-interpreter"
            ci_idx += 1
        elif w.get("type") in ("pie-chart", "bar-chart", "hotspot-bar", "severity-gauge"):
            if str(local_idx) in local_charts:
                wd["chart_base64"] = local_charts[str(local_idx)]
                wd["source"] = "matplotlib"
            local_idx += 1
        elif w.get("type") == "narrative":
            wd["narrative_text"] = narrative

        widget_data.append(wd)

    ms = (datetime.now() - start_time).total_seconds() * 1000

    return {
        "success": True,
        "title": title,
        "description": description,
        "widgets": widget_data,
        "narrative": narrative,
        "reasoning": reasoning,
        "filters_applied": filters or {},
        "prompt": prompt,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "model": route("nlp_dashboard").model_id,
            "model_display": route("nlp_dashboard").profile.display_name,
            "total_issues": len(issues),
            "filtered_issues": len(filtered),
            "code_interpreter_charts": len(ci_result["charts"]),
            "local_charts": len(local_charts),
            "processing_time_ms": ms,
            "ai_powered": True,
            "code_interpreter_used": ci_result["success"],
            "prompt_tokens": _token_totals["prompt"],
            "completion_tokens": _token_totals["completion"],
            "total_tokens": _token_totals["total"],
        },
    }


if __name__ == "__main__":
    import sys
    prompt = sys.argv[1] if len(sys.argv) > 1 else "Show me a budget breakdown with severity analysis for potholes near schools"
    print(f"🧠 NLP Dashboard Agent (Code Interpreter)")
    print(f"📝 Prompt: {prompt}\n")
    result = generate_nlp_dashboard(prompt)
    print(f"\n{'='*60}")
    print(f"📊 {result['title']}")
    print(f"🧩 Widgets: {len(result['widgets'])}")
    print(f"⚡ Code Interpreter: {result['metadata']['code_interpreter_charts']} charts")
    print(f"📊 Local: {result['metadata']['local_charts']} charts")
    print(f"⏱️  {result['metadata']['processing_time_ms']:.0f}ms")
    for s in result["reasoning"]:
        print(f"  [{s['phase']}] {s['description']}")

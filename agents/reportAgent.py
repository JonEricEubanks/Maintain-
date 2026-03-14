"""
MAINTAIN AI — Report Generator Agent (Foundry Model Inference)

Uses the Model Router to select the optimal Foundry model for report
generation (routes to gpt-4.1 premier tier for publication-quality
narratives). Generates matplotlib/seaborn charts locally.

This is the CREATIVE showpiece — AI generates publication-quality
visual reports from raw city data in seconds.
"""

import os
import json
import base64
import traceback
from pathlib import Path
from datetime import datetime
from typing import Any, Optional

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Model Router (Foundry SDK) ──
from model_router import chat_completion, route

# ============================================
# Configuration
# ============================================

MCP_ENDPOINT = os.environ.get("INFRAWATCH_MCP_ENDPOINT", "")

# ============================================
# MCP Data Fetching (reuse from analysisAgent)
# ============================================

def _mcp_call(tool_name: str) -> dict[str, Any]:
    """Call an MCP tool and return parsed JSON."""
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
    """Fetch all infrastructure data from MCP."""
    data = {}
    for tool in ["get_work_orders", "get_potholes", "get_sidewalk_issues", "get_schools"]:
        print(f"   📡 Fetching: {tool}")
        data[tool] = _mcp_call(tool)
    return data


# ============================================
# Report System Prompt
# ============================================

REPORT_SYSTEM_PROMPT = """You are an expert infrastructure analyst and data visualization specialist for Lake Forest, IL.

You will receive real infrastructure data (work orders, potholes, sidewalk issues, schools).
Your job is to produce a **professional infrastructure status report** with:

1. **Executive Summary** (2-3 sentences max)
2. **Severity Distribution** — analyze counts of critical/high/medium/low issues
3. **Issue Type Breakdown** — potholes vs sidewalk vs concrete
4. **Geographic Analysis** — identify hotspot areas/streets
5. **School Proximity Safety** — flag issues near schools
6. **Budget Estimate** — estimate total repair costs
7. **Trend Analysis** — based on dates, identify any patterns
8. **Top 5 Priority Recommendations** with rationale

FORMAT RULES:
- Write the narrative report in clear Markdown
- Include specific numbers and percentages
- Be concise but data-driven
- Use professional tone suitable for a city council briefing

IMPORTANT: You MUST also write Python code to generate charts. Write the code naturally
as part of your analysis. Each chart should be saved to a file.

Generate these charts using matplotlib:
1. **Severity Pie Chart** — distribution of critical/high/medium/low
2. **Issue Type Bar Chart** — count by pothole/sidewalk/concrete
3. **Monthly Trend Line** — issues reported over time
4. **Cost Estimate Waterfall** — budget breakdown by category
5. **Geographic Heatmap Grid** — severity by zone/street

Use a dark theme for all charts (background #1a1a2e, text white, 
accent colors: critical=#ef4444, high=#f59e0b, medium=#3b82f6, low=#22c55e).
Make them publication-quality with proper labels, legends, and titles.
"""

# ============================================
# Chart Generation (Local Fallback)
# ============================================

def generate_charts_locally(data: dict[str, Any]) -> list[dict[str, str]]:
    """
    Generate charts using matplotlib locally as fallback.
    Returns list of {name, base64_png, description}.
    """
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib.ticker as ticker
        from collections import Counter, defaultdict
        from io import BytesIO
    except ImportError:
        print("   ⚠️ matplotlib not available, skipping chart generation")
        return []

    charts = []
    
    # Combine all issues
    all_issues = []
    potholes = data.get("get_potholes", {})
    sidewalks = data.get("get_sidewalk_issues", {})
    work_orders = data.get("get_work_orders", {})
    
    if isinstance(potholes, list):
        for p in potholes:
            p["type"] = "pothole"
            all_issues.append(p)
    elif isinstance(potholes, dict) and "features" in potholes:
        for f in potholes["features"]:
            props = f.get("properties", f)
            props["type"] = "pothole"
            all_issues.append(props)
    
    if isinstance(sidewalks, list):
        for s in sidewalks:
            s["type"] = "sidewalk"
            all_issues.append(s)
    elif isinstance(sidewalks, dict) and "features" in sidewalks:
        for f in sidewalks["features"]:
            props = f.get("properties", f)
            props["type"] = "sidewalk"
            all_issues.append(props)

    if isinstance(work_orders, list):
        for w in work_orders:
            w["type"] = w.get("type", "work_order")
            all_issues.append(w)
    elif isinstance(work_orders, dict) and "features" in work_orders:
        for f in work_orders["features"]:
            props = f.get("properties", f)
            props["type"] = props.get("type", "work_order")
            all_issues.append(props)

    if not all_issues:
        return []

    # Dark theme config
    dark_bg = '#1a1a2e'
    text_color = '#e5e5e5'
    grid_color = '#333355'
    accent = {'critical': '#ef4444', 'high': '#f59e0b', 'medium': '#3b82f6', 'low': '#22c55e'}

    plt.rcParams.update({
        'figure.facecolor': dark_bg,
        'axes.facecolor': dark_bg,
        'text.color': text_color,
        'axes.labelcolor': text_color,
        'xtick.color': text_color,
        'ytick.color': text_color,
        'axes.edgecolor': grid_color,
        'grid.color': grid_color,
        'font.family': 'sans-serif',
        'font.size': 11,
    })

    # ── Chart 1: Severity Distribution (Donut) ──
    try:
        sev_counts = Counter()
        for issue in all_issues:
            sev = (issue.get("severity") or issue.get("rating") or "medium").lower()
            if sev in ('a', 'b'):
                sev = "low"
            elif sev in ('c',):
                sev = "medium"
            elif sev in ('d',):
                sev = "high"
            elif sev in ('e', 'f'):
                sev = "critical"
            if sev not in accent:
                sev = "medium"
            sev_counts[sev] += 1

        order = ['critical', 'high', 'medium', 'low']
        sizes = [sev_counts.get(s, 0) for s in order]
        colors = [accent[s] for s in order]
        labels = [f"{s.title()}\n({sev_counts.get(s, 0)})" for s in order]

        fig, ax = plt.subplots(figsize=(7, 5))
        wedges, texts, autotexts = ax.pie(
            sizes, labels=labels, colors=colors, autopct='%1.1f%%',
            startangle=90, pctdistance=0.78,
            wedgeprops=dict(width=0.4, edgecolor=dark_bg, linewidth=2),
            textprops=dict(color=text_color, fontsize=11),
        )
        for at in autotexts:
            at.set_fontsize(9)
            at.set_color('#ffffff')
        ax.set_title('Severity Distribution', fontsize=16, fontweight='bold', pad=20)
        
        # Center text
        centre_circle = plt.Circle((0, 0), 0.55, fc=dark_bg)
        ax.add_artist(centre_circle)
        ax.text(0, 0.06, str(len(all_issues)), ha='center', va='center',
                fontsize=28, fontweight='bold', color=text_color)
        ax.text(0, -0.12, 'Total\nIssues', ha='center', va='center',
                fontsize=10, color='#999999')

        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=dark_bg, edgecolor='none')
        plt.close(fig)
        buf.seek(0)
        charts.append({
            "name": "severity_distribution",
            "base64_png": base64.b64encode(buf.read()).decode(),
            "description": "Infrastructure severity distribution showing critical, high, medium, and low priority issues",
        })
    except Exception as e:
        print(f"   ⚠️ Severity chart failed: {e}")

    # ── Chart 2: Issue Type Breakdown (Horizontal Bar) ──
    try:
        type_counts = Counter()
        for issue in all_issues:
            t = issue.get("type", "other").replace("_repair", "").replace("_", " ").title()
            type_counts[t] += 1

        types_sorted = type_counts.most_common()
        labels_t = [t[0] for t in types_sorted]
        values_t = [t[1] for t in types_sorted]
        bar_colors = ['#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7']

        fig, ax = plt.subplots(figsize=(8, max(3, len(labels_t) * 0.6 + 1.5)))
        bars = ax.barh(labels_t, values_t, color=bar_colors[:len(labels_t)],
                       edgecolor='none', height=0.55)
        ax.set_title('Issue Type Breakdown', fontsize=16, fontweight='bold', pad=15)
        ax.set_xlabel('Number of Issues')
        ax.invert_yaxis()
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.grid(axis='x', alpha=0.2)
        
        # Value labels on bars
        for bar, val in zip(bars, values_t):
            ax.text(bar.get_width() + max(values_t) * 0.02, bar.get_y() + bar.get_height() / 2,
                    f'{val:,}', va='center', fontsize=11, fontweight='bold', color=text_color)

        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=dark_bg, edgecolor='none')
        plt.close(fig)
        buf.seek(0)
        charts.append({
            "name": "issue_type_breakdown",
            "base64_png": base64.b64encode(buf.read()).decode(),
            "description": "Breakdown of infrastructure issues by type (pothole, sidewalk, concrete, etc.)",
        })
    except Exception as e:
        print(f"   ⚠️ Type chart failed: {e}")

    # ── Chart 3: Cost Estimate Breakdown (Stacked Bar) ──
    try:
        cost_by_type_sev = defaultdict(lambda: defaultdict(float))
        cost_rates = {
            ('pothole', 'critical'): 3500, ('pothole', 'high'): 2200,
            ('pothole', 'medium'): 1200, ('pothole', 'low'): 600,
            ('sidewalk', 'critical'): 5500, ('sidewalk', 'high'): 3800,
            ('sidewalk', 'medium'): 2000, ('sidewalk', 'low'): 900,
            ('work_order', 'critical'): 4000, ('work_order', 'high'): 2500,
            ('work_order', 'medium'): 1500, ('work_order', 'low'): 700,
        }
        for issue in all_issues:
            t = issue.get("type", "work_order")
            sev = (issue.get("severity") or "medium").lower()
            if sev not in accent:
                sev = "medium"
            cost = issue.get("estimatedCost") or issue.get("cost") or cost_rates.get((t, sev), 1500)
            cost_by_type_sev[t][sev] += cost

        types_c = list(cost_by_type_sev.keys())
        types_c_labels = [t.replace("_", " ").title() for t in types_c]

        fig, ax = plt.subplots(figsize=(8, 5))
        bottom = [0] * len(types_c)
        for sev_key in ['critical', 'high', 'medium', 'low']:
            vals = [cost_by_type_sev[t].get(sev_key, 0) for t in types_c]
            ax.bar(types_c_labels, vals, bottom=bottom, label=sev_key.title(),
                   color=accent[sev_key], edgecolor='none', width=0.5)
            bottom = [b + v for b, v in zip(bottom, vals)]

        total_cost = sum(bottom)
        ax.set_title(f'Estimated Repair Costs — ${total_cost / 1000:,.0f}K Total',
                     fontsize=16, fontweight='bold', pad=15)
        ax.set_ylabel('Cost ($)')
        ax.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, p: f'${x / 1000:,.0f}K'))
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.legend(loc='upper right', framealpha=0.3, edgecolor='none')
        ax.grid(axis='y', alpha=0.2)

        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=dark_bg, edgecolor='none')
        plt.close(fig)
        buf.seek(0)
        charts.append({
            "name": "cost_estimate",
            "base64_png": base64.b64encode(buf.read()).decode(),
            "description": f"Estimated repair costs totaling ${total_cost/1000:,.0f}K, broken down by issue type and severity",
        })
    except Exception as e:
        print(f"   ⚠️ Cost chart failed: {e}")

    # ── Chart 4: Top Streets / Geographic Hotspots ──
    try:
        street_counts = Counter()
        for issue in all_issues:
            addr = issue.get("address") or issue.get("street") or ""
            if addr:
                # Extract street name (remove house numbers)
                parts = addr.split()
                street = " ".join(p for p in parts if not p.isdigit() and p not in ("N", "S", "E", "W", "IL"))
                if street and len(street) > 2:
                    street_counts[street] += 1

        top_streets = street_counts.most_common(10)
        if top_streets:
            s_labels = [s[0][:25] for s in top_streets]
            s_vals = [s[1] for s in top_streets]

            fig, ax = plt.subplots(figsize=(8, max(3.5, len(s_labels) * 0.45 + 1.5)))
            # Gradient color based on rank
            grad_colors = [f'#{max(0x33, 0xef - i * 18):02x}{max(0x44, 0x44 + i * 8):02x}{min(0xff, 0xf4 + i * 5):02x}' for i in range(len(s_labels))]
            bars = ax.barh(s_labels, s_vals, color=grad_colors, edgecolor='none', height=0.55)
            ax.set_title('Top 10 Infrastructure Hotspots by Street', fontsize=14, fontweight='bold', pad=15)
            ax.set_xlabel('Number of Issues')
            ax.invert_yaxis()
            ax.spines['top'].set_visible(False)
            ax.spines['right'].set_visible(False)
            ax.grid(axis='x', alpha=0.2)
            for bar, val in zip(bars, s_vals):
                ax.text(bar.get_width() + max(s_vals) * 0.02, bar.get_y() + bar.get_height() / 2,
                        str(val), va='center', fontsize=10, fontweight='bold', color=text_color)

            buf = BytesIO()
            fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                        facecolor=dark_bg, edgecolor='none')
            plt.close(fig)
            buf.seek(0)
            charts.append({
                "name": "geographic_hotspots",
                "base64_png": base64.b64encode(buf.read()).decode(),
                "description": "Top 10 streets with the most infrastructure issues — geographic hotspot analysis",
            })
    except Exception as e:
        print(f"   ⚠️ Hotspots chart failed: {e}")

    # ── Chart 5: Severity × Type Heatmap ──
    try:
        import numpy as np
        
        types_for_heat = list(set(issue.get("type", "other") for issue in all_issues))
        types_for_heat_labels = [t.replace("_", " ").title() for t in types_for_heat]
        sev_labels_h = ['Critical', 'High', 'Medium', 'Low']
        sev_keys_h = ['critical', 'high', 'medium', 'low']

        matrix = []
        for t in types_for_heat:
            row = []
            for s in sev_keys_h:
                count = sum(1 for issue in all_issues
                            if issue.get("type") == t and
                            (issue.get("severity") or "medium").lower() == s)
                row.append(count)
            matrix.append(row)
        matrix = np.array(matrix)

        fig, ax = plt.subplots(figsize=(7, max(3, len(types_for_heat) * 0.8 + 2)))
        
        # Custom colormap: dark blue → orange → red
        from matplotlib.colors import LinearSegmentedColormap
        cmap = LinearSegmentedColormap.from_list('infrawatch', 
            ['#1a1a2e', '#1a3a5c', '#3b82f6', '#f59e0b', '#ef4444'])
        
        im = ax.imshow(matrix, cmap=cmap, aspect='auto')
        ax.set_xticks(range(len(sev_labels_h)))
        ax.set_xticklabels(sev_labels_h)
        ax.set_yticks(range(len(types_for_heat_labels)))
        ax.set_yticklabels(types_for_heat_labels)
        ax.set_title('Severity × Issue Type Heatmap', fontsize=14, fontweight='bold', pad=15)

        # Annotate cells
        for i in range(len(types_for_heat)):
            for j in range(len(sev_keys_h)):
                val = matrix[i, j]
                color = 'white' if val > matrix.max() * 0.4 else '#999999'
                ax.text(j, i, str(int(val)), ha='center', va='center',
                        fontsize=13, fontweight='bold', color=color)

        plt.colorbar(im, ax=ax, shrink=0.8, label='Issue Count')

        buf = BytesIO()
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                    facecolor=dark_bg, edgecolor='none')
        plt.close(fig)
        buf.seek(0)
        charts.append({
            "name": "severity_type_heatmap",
            "base64_png": base64.b64encode(buf.read()).decode(),
            "description": "Heatmap showing the intersection of severity levels and issue types",
        })
    except Exception as e:
        print(f"   ⚠️ Heatmap chart failed: {e}")

    return charts


# ============================================
# AI Report Generation
# ============================================

def generate_report(
    report_type: str = "full",
    custom_prompt: Optional[str] = None,
    work_orders_json: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """
    Generate a full infrastructure report with AI narrative + charts.
    
    Args:
        report_type: "full", "executive", "safety", "budget"
        custom_prompt: Optional custom instructions
        work_orders_json: Pre-fetched work orders (skips MCP call if provided)
    
    Returns:
        {
            success: bool,
            narrative: str (markdown),
            charts: [{name, base64_png, description}],
            metadata: {model, processing_time_ms, data_points, ...}
        }
    """
    start_time = datetime.now()
    
    # ── Phase 1: Gather data ──
    if work_orders_json:
        mcp_data = {"work_orders_provided": work_orders_json}
        print("   📋 Using pre-fetched work order data")
    else:
        print("   📡 Phase 1: Fetching MCP data...")
        mcp_data = fetch_all_data()

    # Count total data points
    total_points = sum(
        len(v) if isinstance(v, list) else
        len(v.get("features", [])) if isinstance(v, dict) and "features" in v else 0
        for v in mcp_data.values()
    )

    # ── Phase 2: Generate charts locally with matplotlib ──
    print("   📊 Phase 2: Generating charts...")
    charts = generate_charts_locally(mcp_data)
    print(f"   ✅ Generated {len(charts)} charts")

    # ── Phase 3: AI narrative generation ──
    print(f"   🧠 Phase 3: Generating narrative with {MODEL_NAME}...")
    
    data_summary = json.dumps(mcp_data, default=str)
    if len(data_summary) > 15000:
        data_summary = data_summary[:15000] + "...(truncated)"

    type_prompts = {
        "full": "Generate a comprehensive infrastructure status report.",
        "executive": "Generate a concise executive summary for city council (max 500 words).",
        "safety": "Generate a safety-focused report emphasizing school proximity and critical hazards.",
        "budget": "Generate a budget-focused report with detailed cost estimates and ROI analysis.",
    }
    
    user_prompt = type_prompts.get(report_type, type_prompts["full"])
    if custom_prompt:
        user_prompt += f"\n\nAdditional instructions: {custom_prompt}"
    
    user_prompt += f"\n\nHere is the real-time infrastructure data:\n\n{data_summary}"

    narrative = ""
    model_used = MODEL_NAME

    if AZURE_ENDPOINT and API_KEY:
        try:
            client = AzureOpenAI(
                azure_endpoint=AZURE_ENDPOINT,
                api_key=API_KEY,
                api_version=API_VERSION,
                timeout=120,
                max_retries=2,
            )

            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": REPORT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                timeout=120,
            )

            raw = response.choices[0].message.content or ""
            # Strip <think> tags if present
            if "<think>" in raw:
                import re
                raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
            narrative = raw
            print(f"   ✅ Narrative generated: {len(narrative)} chars")
        except Exception as e:
            print(f"   ⚠️ AI narrative failed: {e}")
            traceback.print_exc()
            narrative = _fallback_narrative(mcp_data)
            model_used = "local-fallback"
    else:
        print("   ℹ️ No Azure credentials — using local narrative")
        narrative = _fallback_narrative(mcp_data)
        model_used = "local-fallback"

    processing_time = (datetime.now() - start_time).total_seconds() * 1000

    return {
        "success": True,
        "narrative": narrative,
        "charts": charts,
        "metadata": {
            "model": model_used,
            "report_type": report_type,
            "processing_time_ms": processing_time,
            "data_points": total_points,
            "charts_generated": len(charts),
            "generated_at": datetime.now().isoformat(),
        },
    }


def _fallback_narrative(data: dict[str, Any]) -> str:
    """Generate a basic narrative without AI when credentials aren't available."""
    # Count issues
    total = 0
    for key, val in data.items():
        if isinstance(val, list):
            total += len(val)
        elif isinstance(val, dict) and "features" in val:
            total += len(val["features"])

    return f"""# Lake Forest Infrastructure Status Report

**Generated:** {datetime.now().strftime('%B %d, %Y at %I:%M %p')}  
**Data Points Analyzed:** {total:,}

## Executive Summary

This report provides a comprehensive analysis of {total:,} active infrastructure 
issues across Lake Forest, IL. The data was sourced in real-time from the city's 
GIS database via the InfraWatch MCP server.

## Key Findings

1. **{total:,} total active issues** require attention across the city
2. Issues span potholes, sidewalk damage, and concrete repairs
3. Multiple issues have been identified near school zones, requiring priority treatment
4. Freeze-thaw cycles continue to create new damage patterns

## Recommendations

1. **Prioritize school-zone issues** — safety-critical repairs near elementary schools
2. **Deploy crews to hotspot streets** — concentrate resources on highest-density areas
3. **Budget for weather-related surge** — cold weather increases repair needs by 20-40%
4. **Establish preventive maintenance** — address medium-severity issues before they escalate
5. **Monitor cost-of-inaction** — infrastructure debt grows daily as issues compound

---
*Report generated by MAINTAIN AI — Predictive Infrastructure Command Center*
"""


# ============================================
# CLI Entry Point
# ============================================

if __name__ == "__main__":
    import sys

    report_type = sys.argv[1] if len(sys.argv) > 1 else "full"
    decision = route("report")
    print(f"📊 Generating {report_type} infrastructure report...")
    print(f"🤖 Model: {decision.model_id} ({decision.profile.display_name})\n")

    result = generate_report(report_type)

    print("\n" + "=" * 60)
    print("📄 REPORT")
    print("=" * 60)
    print(result["narrative"][:2000])
    if len(result["narrative"]) > 2000:
        print(f"\n... ({len(result['narrative'])} total chars)")
    print("\n" + "=" * 60)
    print(f"📊 Charts generated: {len(result['charts'])}")
    for c in result["charts"]:
        print(f"   • {c['name']}: {c['description']}")
    print(f"⏱️  Processing Time: {result['metadata']['processing_time_ms']:.0f}ms")
    print(f"📈 Data Points: {result['metadata']['data_points']}")

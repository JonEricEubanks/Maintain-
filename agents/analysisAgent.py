"""
MAINTAIN AI — Analysis Agent (Foundry Model Inference)

Uses the Model Router for multi-model inference via Azure AI Foundry:
- Routes to gpt-4.1 for complex analysis (premier tier)
- Supports Phi-4-reasoning traces when overridden
- Function calling to fetch MCP data
- Structured analysis output
"""

import os
import json
from pathlib import Path
from datetime import datetime
from typing import Any

from dotenv import load_dotenv

# Load .env from the agents directory
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Model Router (Foundry SDK) ──
from model_router import chat_completion, route, get_router_status

# ============================================
# Configuration
# ============================================

MCP_ENDPOINT = os.environ.get(
    "INFRAWATCH_MCP_ENDPOINT",
    ""
)

# ============================================
# MCP Tool Functions
# ============================================

def get_work_orders() -> dict[str, Any]:
    """Retrieve all work orders from Lake Forest infrastructure database."""
    import requests
    response = requests.post(
        MCP_ENDPOINT,
        json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
              "params": {"name": "get_work_orders", "arguments": {}}},
        headers={"Content-Type": "application/json"},
        timeout=60
    )
    result = response.json()
    if "result" in result and "content" in result["result"]:
        return json.loads(result["result"]["content"][0]["text"])
    return {"error": "Failed to retrieve work orders"}


def get_potholes() -> dict[str, Any]:
    """Retrieve all pothole reports from the city database."""
    import requests
    response = requests.post(
        MCP_ENDPOINT,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/call",
              "params": {"name": "get_potholes", "arguments": {}}},
        headers={"Content-Type": "application/json"},
        timeout=60
    )
    result = response.json()
    if "result" in result and "content" in result["result"]:
        return json.loads(result["result"]["content"][0]["text"])
    return {"error": "Failed to retrieve potholes"}


def get_sidewalk_issues() -> dict[str, Any]:
    """Retrieve all sidewalk issues from the city database."""
    import requests
    response = requests.post(
        MCP_ENDPOINT,
        json={"jsonrpc": "2.0", "id": 3, "method": "tools/call",
              "params": {"name": "get_sidewalk_issues", "arguments": {}}},
        headers={"Content-Type": "application/json"},
        timeout=60
    )
    result = response.json()
    if "result" in result and "content" in result["result"]:
        return json.loads(result["result"]["content"][0]["text"])
    return {"error": "Failed to retrieve sidewalk issues"}


def get_schools() -> dict[str, Any]:
    """Retrieve all schools for proximity analysis."""
    import requests
    response = requests.post(
        MCP_ENDPOINT,
        json={"jsonrpc": "2.0", "id": 4, "method": "tools/call",
              "params": {"name": "get_schools", "arguments": {}}},
        headers={"Content-Type": "application/json"},
        timeout=60
    )
    result = response.json()
    if "result" in result and "content" in result["result"]:
        return json.loads(result["result"]["content"][0]["text"])
    return {"error": "Failed to retrieve schools"}


# ============================================
# Tool Definitions (OpenAI format)
# ============================================

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_work_orders",
            "description": "Retrieve all infrastructure work orders from Lake Forest, IL. Returns severity, type, location, status.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_potholes",
            "description": "Retrieve all pothole reports. Includes location, severity, school proximity.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_sidewalk_issues",
            "description": "Retrieve all sidewalk damage reports. Includes trip hazards, cracks, ADA issues.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_schools",
            "description": "Retrieve all schools in Lake Forest for proximity-based prioritization.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
]

TOOL_HANDLERS = {
    "get_work_orders": get_work_orders,
    "get_potholes": get_potholes,
    "get_sidewalk_issues": get_sidewalk_issues,
    "get_schools": get_schools,
}

# ============================================
# System Prompt
# ============================================

SYSTEM_PROMPT = """You are the Infrastructure Analysis Agent for Lake Forest, IL.

Use the available tools to retrieve real data, then provide a thorough analysis.

Your analysis MUST include:
1. **Summary**: Brief overview of infrastructure state
2. **Key Findings**: Numbered list of important discoveries
3. **Severity Distribution**: Count of critical/high/medium/low issues
4. **Geographic Hotspots**: Areas with clustered problems
5. **School Proximity**: Safety concerns near schools
6. **Recommendations**: Top 3 suggested actions

Start by calling the tools to get the latest data. Be concise but data-driven.
"""

# ============================================
# Agent Execution
# ============================================

def run_analysis(user_query: str = "Analyze current infrastructure status") -> dict[str, Any]:
    """
    Run the analysis agent with Phi-4-reasoning.
    Two-phase approach:
      1. Fetch all MCP data directly (Phi-4 doesn't support tool_choice=auto)
      2. Feed data to Phi-4-reasoning for analysis with real reasoning traces
    """
    start_time = datetime.now()
    reasoning_steps = []
    tool_calls_log = []

    # ── Phase 1: Gather MCP data ──────────────────────────────
    print("   \U0001f4e1 Phase 1: Fetching MCP data...")

    mcp_data = {}
    for tool_name, handler in TOOL_HANDLERS.items():
        tool_start = datetime.now()
        print(f"   \U0001f527 Fetching: {tool_name}")
        try:
            result = handler()
            mcp_data[tool_name] = result
            result_str = json.dumps(result, default=str)
            duration = (datetime.now() - tool_start).total_seconds() * 1000
            tool_calls_log.append({
                "tool": tool_name,
                "parameters": {},
                "result_length": len(result_str),
                "duration_ms": duration,
            })
            reasoning_steps.append({
                "step": len(reasoning_steps) + 1,
                "description": f"Fetched {tool_name}: {len(result_str)} chars",
                "confidence": 0.95,
                "data_source": "MCP",
            })
        except Exception as e:
            print(f"   \u26a0\ufe0f {tool_name} failed: {e}")
            mcp_data[tool_name] = {"error": str(e)}

    # Build a data summary to feed to the model
    data_payload = json.dumps(mcp_data, default=str)
    # Truncate if massive
    if len(data_payload) > 12000:
        data_payload = data_payload[:12000] + "...(truncated)"

    # ── Phase 2: Foundry Model Inference via Model Router ─────
    decision = route("analysis")
    model_name = decision.model_id
    print(f"\n   \U0001f9e0 Phase 2: Calling {model_name} via Model Router...")
    print(f"   \U0001f4cb Route: {decision.reason} ({decision.profile.tier} tier)")

    reasoning_steps.append({
        "step": len(reasoning_steps) + 1,
        "description": f"Model Router selected {model_name} ({decision.profile.display_name}) — {decision.reason}",
        "confidence": 1.0,
        "data_source": "Model Router",
    })

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"{user_query}\n\nHere is the real-time infrastructure data:\n\n{data_payload}"},
    ]

    resp = chat_completion(
        agent="analysis",
        messages=messages,
        max_tokens=4096,
        temperature=0.7,
    )

    final_output = resp.content
    reasoning_trace = resp.reasoning_trace or ""

    if reasoning_trace:
        reasoning_steps.append({
            "step": len(reasoning_steps) + 1,
            "description": f"Reasoning trace from {model_name}: {len(reasoning_trace)} chars",
            "confidence": 0.95,
            "data_source": model_name,
            "trace": reasoning_trace[:500],
        })

    reasoning_steps.append({
        "step": len(reasoning_steps) + 1,
        "description": f"Model produced final analysis ({resp.total_tokens} tokens, {resp.latency_ms:.0f}ms)",
        "confidence": 0.95,
        "data_source": model_name,
    })

    processing_time = (datetime.now() - start_time).total_seconds() * 1000

    return {
        "success": True,
        "output": final_output,
        "reasoning_trace": reasoning_trace,
        "reasoning": reasoning_steps,
        "tool_calls": tool_calls_log,
        "confidence": 0.88,
        "processing_time_ms": processing_time,
        "model": model_name,
        "model_display": resp.model_display,
        "model_provider": resp.provider,
        "model_tier": decision.profile.tier,
        "token_usage": {
            "prompt": resp.prompt_tokens,
            "completion": resp.completion_tokens,
            "total": resp.total_tokens,
        },
        "latency_ms": resp.latency_ms,
    }


# ============================================
# CLI Entry Point
# ============================================

if __name__ == "__main__":
    import sys

    query = sys.argv[1] if len(sys.argv) > 1 else "Analyze current infrastructure status for Lake Forest, IL"

    decision = route("analysis")
    print(f"\U0001f50d Running Analysis Agent ({decision.model_id} via Model Router)...")
    print(f"\U0001f4dd Query: {query}\n")

    result = run_analysis(query)

    print("\n" + "=" * 60)
    print("\U0001f4ca ANALYSIS RESULT")
    print("=" * 60)
    print(result["output"])
    print("\n" + "=" * 60)
    print(f"\u23f1\ufe0f  Processing Time: {result['processing_time_ms']:.0f}ms")
    print(f"\U0001f3af Confidence: {result['confidence']:.0%}")
    print(f"\U0001f527 Tools Called: {len(result['tool_calls'])}")
    print(f"\U0001f9e0 Model: {result['model']} ({result.get('model_display', '')})")
    print(f"\U0001f4ca Tokens: {result.get('token_usage', {}).get('total', 'N/A')}")
    print(f"\u26a1 Latency: {result.get('latency_ms', 'N/A')}ms")

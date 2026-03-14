"""
MAINTAIN AI — Shared MCP Client

Centralized MCP (Model Context Protocol) client used by all agents.
Eliminates duplication and ensures consistent error handling, timeouts,
and JSON-RPC 2.0 compliance across all agent modules.

All MCP calls are READ-ONLY — agents never modify MCP server data.
"""

import os
import json
import threading
from pathlib import Path
from typing import Any, Optional

import requests
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ============================================
# Configuration
# ============================================

MCP_ENDPOINT = os.environ.get("INFRAWATCH_MCP_ENDPOINT", "")
MCP_TIMEOUT = int(os.environ.get("MCP_TIMEOUT_SECONDS", "60"))

# Thread-safe request ID counter
_request_id_lock = threading.Lock()
_request_id = 0


def _next_request_id() -> int:
    global _request_id
    with _request_id_lock:
        _request_id += 1
        return _request_id


# ============================================
# Core MCP Call
# ============================================

def mcp_call(tool_name: str, arguments: Optional[dict] = None) -> dict[str, Any]:
    """
    Call an MCP tool via JSON-RPC 2.0 and return parsed JSON.

    This is the single shared implementation used by all agents.
    All calls are READ-ONLY — the MCP server is never modified.

    Args:
        tool_name: The MCP tool to invoke (e.g. "get_work_orders")
        arguments: Optional dict of arguments to pass to the tool

    Returns:
        Parsed JSON response, or {"error": "..."} on failure
    """
    if not MCP_ENDPOINT:
        return {"error": "MCP endpoint not configured"}

    try:
        resp = requests.post(
            MCP_ENDPOINT,
            json={
                "jsonrpc": "2.0",
                "id": _next_request_id(),
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments or {},
                },
            },
            headers={"Content-Type": "application/json"},
            timeout=MCP_TIMEOUT,
        )
        result = resp.json()
        if "result" in result and "content" in result["result"]:
            return json.loads(result["result"]["content"][0]["text"])
        if "error" in result:
            return {"error": result["error"].get("message", "MCP error")}
    except requests.Timeout:
        print(f"   ⚠️ MCP {tool_name} timed out after {MCP_TIMEOUT}s")
    except Exception as e:
        print(f"   ⚠️ MCP {tool_name} failed: {e}")

    return {"error": f"Failed to retrieve {tool_name}"}


# ============================================
# Convenience Helpers
# ============================================

def fetch_all_data() -> dict[str, Any]:
    """Fetch all infrastructure data sources from MCP."""
    data = {}
    for tool in ["get_work_orders", "get_potholes", "get_sidewalk_issues", "get_schools"]:
        print(f"   📡 Fetching: {tool}")
        data[tool] = mcp_call(tool)
    return data


def get_work_orders() -> list[dict]:
    """Fetch work orders and normalize to a list."""
    data = mcp_call("get_work_orders")
    if isinstance(data, dict) and "error" not in data:
        return data.get("work_orders", data.get("data", []))
    if isinstance(data, list):
        return data
    return []


def get_potholes() -> dict[str, Any]:
    """Fetch pothole reports."""
    return mcp_call("get_potholes")


def get_sidewalk_issues() -> dict[str, Any]:
    """Fetch sidewalk issue reports."""
    return mcp_call("get_sidewalk_issues")


def get_schools() -> list[dict]:
    """Fetch school locations for proximity analysis."""
    data = mcp_call("get_schools")
    if isinstance(data, dict):
        return data.get("schools", data.get("data", []))
    if isinstance(data, list):
        return data
    return []

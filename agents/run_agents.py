"""
InfraWatch AI - Agent Runner & Setup Validator

Usage:
    python run_agents.py setup          # Validate all credentials & connections
    python run_agents.py analysis       # Run Analysis Agent
    python run_agents.py crew           # Run Crew Estimation Agent
    python run_agents.py priority       # Run Prioritization Agent
    python run_agents.py all            # Run all agents
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv

# Load .env
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ============================================
# Color helpers (Windows terminal safe)
# ============================================

def green(t): return f"\033[92m{t}\033[0m"
def red(t):   return f"\033[91m{t}\033[0m"
def yellow(t): return f"\033[93m{t}\033[0m"
def cyan(t):  return f"\033[96m{t}\033[0m"
def bold(t):  return f"\033[1m{t}\033[0m"


# ============================================
# Setup Validator
# ============================================

def validate_setup() -> bool:
    """Check all required config is in place."""
    print(bold("\n🔍 InfraWatch AI — Setup Validator"))
    print("=" * 55)
    
    all_good = True
    
    # 1. Check connection string
    conn_str = os.environ.get("AZURE_AI_PROJECT_CONNECTION_STRING", "")
    if conn_str and conn_str != "your-connection-string-here":
        parts = conn_str.split(";")
        if len(parts) >= 4:
            print(green("✅ AZURE_AI_PROJECT_CONNECTION_STRING"))
            print(f"   Endpoint:  {parts[0][:40]}...")
            print(f"   Project:   {parts[3]}")
        else:
            print(red("❌ AZURE_AI_PROJECT_CONNECTION_STRING — invalid format"))
            print("   Expected: <endpoint>;<subscription>;<resource-group>;<project-name>")
            all_good = False
    else:
        print(red("❌ AZURE_AI_PROJECT_CONNECTION_STRING — not set"))
        print("   Get from: ai.azure.com → Project → Settings → Properties")
        all_good = False
    
    # 2. Check MCP endpoint
    mcp = os.environ.get("INFRAWATCH_MCP_ENDPOINT", "")
    if mcp:
        print(green(f"✅ INFRAWATCH_MCP_ENDPOINT"))
        print(f"   {mcp}")
        
        # Quick health check
        try:
            import requests
            resp = requests.post(
                mcp,
                json={"jsonrpc": "2.0", "id": 0, "method": "tools/list", "params": {}},
                headers={"Content-Type": "application/json"},
                timeout=15
            )
            if resp.status_code == 200:
                tools = resp.json().get("result", {}).get("tools", [])
                print(green(f"   🟢 MCP reachable — {len(tools)} tools available"))
            else:
                print(yellow(f"   ⚠️  MCP responded with status {resp.status_code}"))
        except requests.exceptions.Timeout:
            print(yellow("   ⚠️  MCP timed out (may be cold-starting, try again)"))
        except Exception as e:
            print(red(f"   ❌ MCP unreachable: {e}"))
            all_good = False
    else:
        print(red("❌ INFRAWATCH_MCP_ENDPOINT — not set"))
        all_good = False
    
    # 3. Check Azure auth
    print()
    auth_method = "none"
    
    client_id = os.environ.get("AZURE_CLIENT_ID", "")
    tenant_id = os.environ.get("AZURE_TENANT_ID", "")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET", "")
    
    if client_id and tenant_id and client_secret:
        auth_method = "service_principal"
        print(green("✅ Service Principal credentials found"))
        print(f"   Client ID: {client_id[:8]}...{client_id[-4:]}")
        print(f"   Tenant ID: {tenant_id[:8]}...{tenant_id[-4:]}")
    else:
        # Check az login
        try:
            import subprocess
            result = subprocess.run(
                ["az", "account", "show", "--query", "user.name", "-o", "tsv"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout.strip():
                auth_method = "az_cli"
                user = result.stdout.strip()
                print(green(f"✅ Azure CLI authenticated as: {user}"))
            else:
                print(red("❌ Azure CLI — not logged in"))
                print("   Run: az login")
                all_good = False
        except FileNotFoundError:
            print(red("❌ Azure CLI — not installed"))
            print("   Install from: https://aka.ms/install-azure-cli")
            all_good = False
        except Exception as e:
            print(yellow(f"⚠️  Could not check Azure CLI: {e}"))
    
    # 4. Check Python packages
    print()
    missing = []
    for pkg, import_name in [
        ("azure-ai-projects", "azure.ai.projects"),
        ("azure-ai-agents", "azure.ai.agents"),
        ("azure-identity", "azure.identity"),
        ("requests", "requests"),
        ("python-dotenv", "dotenv"),
    ]:
        try:
            __import__(import_name)
            print(green(f"✅ {pkg}"))
        except ImportError:
            print(red(f"❌ {pkg} — not installed"))
            missing.append(pkg)
            all_good = False
    
    if missing:
        print(f"\n   Install with: pip install {' '.join(missing)}")
    
    # Summary
    print("\n" + "=" * 55)
    if all_good:
        print(green(bold("✅ All checks passed! Agents are ready to run.")))
        print(f"   Auth method: {auth_method}")
    else:
        print(red(bold("❌ Some checks failed. Fix the issues above.")))
    print()
    
    return all_good


# ============================================
# Agent Runners
# ============================================

def run_analysis_agent():
    """Run the infrastructure analysis agent."""
    print(bold("\n🔍 Running Analysis Agent..."))
    print("=" * 55)
    
    from analysisAgent import run_analysis
    result = run_analysis("Analyze current Lake Forest infrastructure: identify hotspots, severity distribution, and issues near schools.")
    
    print(f"\n{result['output']}")
    print(f"\n⏱️  {result['processing_time_ms']:.0f}ms | 🎯 {result['confidence']:.0%} confidence | 🔧 {len(result['tool_calls'])} tool calls")
    return result


def run_crew_agent():
    """Run the crew estimation agent."""
    print(bold("\n👷 Running Crew Estimation Agent..."))
    print("=" * 55)
    
    # First get work orders from MCP
    try:
        import requests
        mcp = os.environ.get("INFRAWATCH_MCP_ENDPOINT", "")
        resp = requests.post(
            mcp,
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_potholes", "arguments": {}}},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        data = resp.json()
        potholes = json.loads(data["result"]["content"][0]["text"]) if "result" in data else []
        
        # Convert to work order format
        work_orders = [
            {"id": f"p-{i}", "issueType": "pothole", "severity": p.get("severity", "medium")}
            for i, p in enumerate(potholes)
        ]
        
        if not work_orders:
            work_orders = [
                {"id": "1", "issueType": "pothole", "severity": "critical"},
                {"id": "2", "issueType": "pothole", "severity": "high"},
                {"id": "3", "issueType": "sidewalk", "severity": "medium"},
            ]
            print(yellow("   Using sample data (MCP returned no potholes)"))
    except Exception:
        work_orders = [
            {"id": "1", "issueType": "pothole", "severity": "critical"},
            {"id": "2", "issueType": "pothole", "severity": "high"},
            {"id": "3", "issueType": "sidewalk", "severity": "medium"},
        ]
        print(yellow("   Using sample data (MCP unreachable)"))
    
    from crewEstimationAgent import run_crew_estimation
    result = run_crew_estimation(work_orders, weather="cloudy", temperature=35.0, days=7, availability=80.0)
    
    est = result["estimation"]
    print(f"\n👷 Crews: {est['totalCrews']} total ({est['potholeCrew']}P / {est['sidewalkCrews']}S / {est['concreteCrews']}C)")
    print(f"🎯 Confidence: {est['confidence']:.0%}")
    for r in est["reasoning"]:
        print(f"   → {r}")
    print(f"\n⏱️  {result['processing_time_ms']:.0f}ms")
    return result


def run_priority_agent():
    """Run the prioritization agent."""
    print(bold("\n🎯 Running Prioritization Agent..."))
    print("=" * 55)
    
    # Get work orders from MCP
    try:
        import requests
        mcp = os.environ.get("INFRAWATCH_MCP_ENDPOINT", "")
        resp = requests.post(
            mcp,
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_potholes", "arguments": {}}},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        data = resp.json()
        potholes = json.loads(data["result"]["content"][0]["text"]) if "result" in data else []
        
        work_orders = [
            {
                "id": f"p-{i}",
                "address": p.get("address", "Unknown"),
                "issueType": "pothole",
                "severity": p.get("severity", "medium"),
                "nearSchool": p.get("nearSchool", False),
                "createdAt": p.get("reportedDate", datetime.now().isoformat()),
            }
            for i, p in enumerate(potholes)
        ]
        
        if not work_orders:
            raise ValueError("No data")
    except Exception:
        work_orders = [
            {"id": "1", "address": "123 Main St", "issueType": "pothole", "severity": "critical", "nearSchool": True, "createdAt": "2026-01-15T10:00:00Z"},
            {"id": "2", "address": "456 Oak Ave", "issueType": "sidewalk", "severity": "medium", "nearSchool": False, "createdAt": "2026-01-28T10:00:00Z"},
            {"id": "3", "address": "789 School Rd", "issueType": "pothole", "severity": "high", "nearSchool": True, "createdAt": "2026-01-20T10:00:00Z"},
        ]
        print(yellow("   Using sample data (MCP unreachable)"))
    
    from prioritizationAgent import run_prioritization
    result = run_prioritization(work_orders, temperature=35.0)
    
    print(f"\n{result['output']}")
    print("\n📋 Top Priorities:")
    for i, order in enumerate(result["prioritized_orders"][:5], 1):
        print(f"  {i}. [{order['priorityTier']}] {order.get('address', 'N/A')} — Score: {order['priorityScore']}")
    print(f"\n⏱️  {result['processing_time_ms']:.0f}ms | 🎯 {result['confidence']:.0%}")
    return result


# ============================================
# CLI
# ============================================

def main():
    if len(sys.argv) < 2:
        print(bold("InfraWatch AI — Agent Runner"))
        print()
        print("Usage:")
        print("  python run_agents.py setup      Validate credentials & connections")
        print("  python run_agents.py analysis    Run Analysis Agent")
        print("  python run_agents.py crew        Run Crew Estimation Agent")
        print("  python run_agents.py priority    Run Prioritization Agent")
        print("  python run_agents.py all         Run all agents")
        print()
        sys.exit(0)
    
    command = sys.argv[1].lower()
    
    if command == "setup":
        validate_setup()
    
    elif command == "analysis":
        run_analysis_agent()
    
    elif command == "crew":
        run_crew_agent()
    
    elif command == "priority":
        run_priority_agent()
    
    elif command == "all":
        print(bold("\n🚀 Running All InfraWatch AI Agents"))
        print("=" * 55)
        
        results = {}
        for name, runner in [("analysis", run_analysis_agent), ("crew", run_crew_agent), ("priority", run_priority_agent)]:
            try:
                results[name] = runner()
            except Exception as e:
                print(red(f"\n❌ {name} agent failed: {e}"))
                results[name] = {"success": False, "error": str(e)}
        
        print(bold("\n📊 Summary"))
        print("=" * 55)
        for name, result in results.items():
            status = green("✅") if result.get("success") else red("❌")
            time_ms = result.get("processing_time_ms", 0)
            print(f"  {status} {name:15s} — {time_ms:.0f}ms")
    
    else:
        print(red(f"Unknown command: {command}"))
        print("Run without arguments for usage info.")
        sys.exit(1)


if __name__ == "__main__":
    main()

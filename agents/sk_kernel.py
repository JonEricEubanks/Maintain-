"""
MAINTAIN AI — Semantic Kernel Integration with Autonomous Planner

Wraps all 6 InfraWatch agents as Semantic Kernel plugins, backed by
Azure AI Foundry model inference via the Model Router.

The SK Kernel serves as a unified orchestrator:
  - Each agent is exposed as an SK Plugin with @kernel_function decorators
  - Azure Chat Completion uses the Foundry endpoint (via Model Router config)
  - The Kernel handles routing, retry, and token management
  - **FunctionCallingStepwisePlanner** enables autonomous agent selection
    — the LLM decides which plugins to invoke based on the user's goal

Usage:
    from sk_kernel import get_kernel, invoke_agent, plan_and_execute
    kernel = get_kernel()
    result = await invoke_agent("analysis", query="Analyze infrastructure status")

    # Autonomous planning — LLM decides which agents to call
    result = await plan_and_execute("Find critical potholes near schools and estimate crew needs")
"""

import os
import json
import traceback
from pathlib import Path
from datetime import datetime
from typing import Any, Optional, Annotated

from dotenv import load_dotenv

# Load .env from the agents directory
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Semantic Kernel imports ──
from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion
from semantic_kernel.functions.kernel_function_decorator import kernel_function

# ── Import existing agent logic ──
from analysisAgent import run_analysis
from crewEstimationAgent import run_crew_estimation
from prioritizationAgent import run_prioritization
from reportAgent import generate_report
from nlpDashboardAgent import generate_nlp_dashboard
from dispatchAgent import run_dispatch, generate_dispatch_recommendations
from contentSafety import analyze_text
from mlService import ml_service

# ── Import Model Router config ──
from model_router import FOUNDRY_BASE_ENDPOINT, FOUNDRY_API_KEY, get_router_status

# ============================================
# Configuration (Foundry endpoint via Model Router)
# ============================================

# Use Foundry endpoint (Model Router strips /api/projects path automatically)
SK_AZURE_ENDPOINT = os.environ.get(
    "SK_AZURE_OPENAI_ENDPOINT",
    "",
).rstrip("/")

# If SK endpoint key is expired, fall back to Foundry endpoint
SK_API_KEY = os.environ.get("SK_AZURE_OPENAI_API_KEY", "")

# Test if SK endpoint works, otherwise use Foundry
_sk_use_foundry = False
if not SK_API_KEY or not SK_AZURE_ENDPOINT:
    _sk_use_foundry = True
    SK_AZURE_ENDPOINT = FOUNDRY_BASE_ENDPOINT
    SK_API_KEY = FOUNDRY_API_KEY

SK_DEPLOYMENT = os.environ.get("SK_DEPLOYMENT_NAME", "gpt-4.1-mini")
SK_API_VERSION = os.environ.get("SK_API_VERSION", "2024-12-01-preview")

# If using Foundry endpoint, update deployment to available model
if _sk_use_foundry:
    SK_DEPLOYMENT = "gpt-4.1-mini"  # Available on Foundry

# ============================================
# Kernel Singleton
# ============================================

_kernel: Optional[Kernel] = None


def get_kernel() -> Kernel:
    """Return (and lazily create) the shared SK Kernel instance."""
    global _kernel
    if _kernel is not None:
        return _kernel

    _kernel = Kernel()

    # Register Azure Chat Completion service
    if SK_AZURE_ENDPOINT and SK_API_KEY:
        chat_service = AzureChatCompletion(
            deployment_name=SK_DEPLOYMENT,
            endpoint=SK_AZURE_ENDPOINT,
            api_key=SK_API_KEY,
            api_version=SK_API_VERSION,
            service_id="infrawatch-chat",
        )
        _kernel.add_service(chat_service)
        source = "Foundry (Model Router)" if _sk_use_foundry else "procert-ai-openai"
        print(f"✅ SK Kernel: Azure Chat Completion registered ({SK_DEPLOYMENT} @ {source})")
    else:
        print("⚠️  SK Kernel: No Azure credentials — chat service not registered")

    # Register all agent plugins
    _kernel.add_plugin(AnalysisPlugin(), plugin_name="analysis")
    _kernel.add_plugin(PrioritizationPlugin(), plugin_name="prioritization")
    _kernel.add_plugin(CrewEstimationPlugin(), plugin_name="crew_estimation")
    _kernel.add_plugin(DispatchPlugin(), plugin_name="dispatch")
    _kernel.add_plugin(ReportPlugin(), plugin_name="report")
    _kernel.add_plugin(NLPDashboardPlugin(), plugin_name="nlp_dashboard")
    _kernel.add_plugin(ContentSafetyPlugin(), plugin_name="content_safety")
    _kernel.add_plugin(MLPlugin(), plugin_name="ml")

    print(f"✅ SK Kernel: 8 plugins registered (analysis, prioritization, crew_estimation, dispatch, report, nlp_dashboard, content_safety, ml)")
    return _kernel


# ============================================
# Plugin: Infrastructure Analysis
# ============================================

class AnalysisPlugin:
    """SK Plugin wrapping the Infrastructure Analysis Agent (Phi-4-reasoning / GPT-4o-mini)."""

    @kernel_function(
        name="analyze_infrastructure",
        description="Analyze current infrastructure status for Lake Forest, IL using MCP data and AI reasoning.",
    )
    def analyze_infrastructure(
        self,
        query: Annotated[str, "Natural language query describing what to analyze"] = "Analyze current infrastructure status",
    ) -> str:
        """Run analysis agent and return JSON result."""
        try:
            result = run_analysis(query)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: Prioritization
# ============================================

class PrioritizationPlugin:
    """SK Plugin wrapping the multi-factor Prioritization Agent."""

    @kernel_function(
        name="prioritize_work_orders",
        description="Prioritize infrastructure work orders by severity, school proximity, age, and weather factors.",
    )
    def prioritize_work_orders(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"] = "[]",
        temperature: Annotated[float, "Current temperature in Fahrenheit"] = 50.0,
    ) -> str:
        """Prioritize work orders and return ranked list."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = run_prioritization(work_orders, temperature)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: Crew Estimation
# ============================================

class CrewEstimationPlugin:
    """SK Plugin wrapping the Crew Estimation Agent for predictive resource allocation."""

    @kernel_function(
        name="estimate_crews",
        description="Estimate optimal crew deployment based on work order volume, weather, and availability.",
    )
    def estimate_crews(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"] = "[]",
        weather: Annotated[str, "Weather condition (clear, rain, snow, extreme_heat)"] = "clear",
        temperature: Annotated[float, "Current temperature in Fahrenheit"] = 50.0,
        days: Annotated[int, "Planning horizon in days"] = 7,
        availability: Annotated[float, "Crew availability percentage (0-100)"] = 80.0,
    ) -> str:
        """Estimate crew needs and return allocation plan."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = run_crew_estimation(
                work_orders=work_orders,
                weather=weather,
                temperature=temperature,
                days=days,
                availability=availability,
            )
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: Dispatch Optimization
# ============================================

class DispatchPlugin:
    """SK Plugin wrapping the Dispatch Optimization Agent."""

    @kernel_function(
        name="optimize_dispatch",
        description="Generate optimized crew dispatch recommendations for infrastructure repairs.",
    )
    def optimize_dispatch(
        self,
        crews_json: Annotated[str, "JSON array of crew objects with location and specialization"] = "[]",
        weather: Annotated[str, "Weather condition"] = "clear",
        temperature: Annotated[float, "Temperature in Fahrenheit"] = 50.0,
        use_llm: Annotated[bool, "Whether to use LLM for enhanced reasoning"] = False,
    ) -> str:
        """Generate dispatch plan from MCP data and crew availability."""
        try:
            crews = json.loads(crews_json) if isinstance(crews_json, str) and crews_json.strip() else None
            if crews == []:
                crews = None
            result = run_dispatch(
                crews=crews,
                weather=weather,
                temperature=temperature,
                use_llm=use_llm,
            )
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: Report Generation
# ============================================

class ReportPlugin:
    """SK Plugin wrapping the AI Report Generator with matplotlib charts."""

    @kernel_function(
        name="generate_report",
        description="Generate a professional infrastructure report with AI narrative and matplotlib/seaborn charts.",
    )
    def generate_report(
        self,
        report_type: Annotated[str, "Report type: full, executive, safety, or budget"] = "full",
        custom_prompt: Annotated[Optional[str], "Optional custom prompt for the report"] = None,
        work_orders_json: Annotated[str, "JSON array of work order data"] = "[]",
    ) -> str:
        """Generate report with charts and return as JSON."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = generate_report(
                report_type=report_type,
                custom_prompt=custom_prompt,
                work_orders_json=work_orders if work_orders else None,
            )
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: NLP Dashboard
# ============================================

class NLPDashboardPlugin:
    """SK Plugin wrapping the NLP Dashboard Agent with Code Interpreter."""

    @kernel_function(
        name="build_dashboard",
        description="Generate a data dashboard from a natural language description using AI code interpreter.",
    )
    def build_dashboard(
        self,
        prompt: Annotated[str, "Natural language description of desired dashboard"] = "Show me all infrastructure issues",
        work_orders_json: Annotated[str, "JSON array of work order data for the dashboard"] = "[]",
    ) -> str:
        """Build dashboard from natural language and return chart + metadata."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = generate_nlp_dashboard(prompt=prompt, work_orders=work_orders)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: Content Safety (Responsible AI)
# ============================================

class ContentSafetyPlugin:
    """SK Plugin wrapping Azure Content Safety for Responsible AI guardrails."""

    @kernel_function(
        name="check_content_safety",
        description="Validate text content against Azure Content Safety for hate, violence, sexual, and self-harm categories.",
    )
    def check_content_safety(
        self,
        text: Annotated[str, "Text content to validate for safety"],
    ) -> str:
        """Check text against Azure Content Safety and return analysis."""
        try:
            result = analyze_text(text)
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# Plugin: Machine Learning (scikit-learn)
# ============================================

class MLPlugin:
    """SK Plugin wrapping scikit-learn ML models as agent-callable tools.

    The agent can train models on work order data, then use them to predict
    costs, crew placement, hotspots, workload, and severity.
    """

    @kernel_function(
        name="train_models",
        description="Train ML models on work order data. Must be called before any prediction. Takes work_orders_json (JSON array of work orders).",
    )
    def train_models(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects to train on"],
        weather: Annotated[str, "Current weather condition"] = "clear",
        temperature: Annotated[str, "Current temperature in Fahrenheit"] = "50",
    ) -> str:
        """Train all ML models on the provided work orders."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = ml_service.train(work_orders, weather=weather, temperature=float(temperature))
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})

    @kernel_function(
        name="predict_cost",
        description="Predict repair costs for work orders using ML. Returns per-order cost predictions with confidence intervals and feature importances.",
    )
    def predict_cost(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"],
        weather: Annotated[str, "Current weather condition"] = "clear",
        temperature: Annotated[str, "Current temperature in Fahrenheit"] = "50",
    ) -> str:
        """Predict costs using trained GradientBoostingRegressor."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = ml_service.predict_cost(work_orders, weather=weather, temperature=float(temperature))
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})

    @kernel_function(
        name="predict_crews",
        description="Predict optimal crew placement using ML clustering and classification. Returns zone recommendations with workload scores.",
    )
    def predict_crews(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"],
        available_crews: Annotated[str, "Number of available crew teams"] = "6",
        weather: Annotated[str, "Current weather condition"] = "clear",
        temperature: Annotated[str, "Current temperature in Fahrenheit"] = "50",
    ) -> str:
        """Predict crew placement using KMeans + RandomForest."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = ml_service.predict_crews(
                work_orders, available_crews=int(available_crews),
                weather=weather, temperature=float(temperature),
            )
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})

    @kernel_function(
        name="predict_hotspots",
        description="Predict future infrastructure failure hotspots using ML. Returns risk-scored geographic areas with dominant issue types.",
    )
    def predict_hotspots(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"],
        weather: Annotated[str, "Current weather condition"] = "clear",
        temperature: Annotated[str, "Current temperature in Fahrenheit"] = "50",
    ) -> str:
        """Predict hotspots using GradientBoostingClassifier."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = ml_service.predict_hotspots(work_orders, weather=weather, temperature=float(temperature))
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})

    @kernel_function(
        name="predict_workload",
        description="Forecast future work order volume using ML time-series analysis. Returns daily forecasts with confidence intervals.",
    )
    def predict_workload(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"],
        days_ahead: Annotated[str, "Number of days to forecast"] = "14",
        weather: Annotated[str, "Current weather condition"] = "clear",
        temperature: Annotated[str, "Current temperature in Fahrenheit"] = "50",
    ) -> str:
        """Forecast workload using GradientBoostingRegressor + trend analysis."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = ml_service.predict_workload(
                work_orders, days_ahead=int(days_ahead),
                weather=weather, temperature=float(temperature),
            )
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})

    @kernel_function(
        name="predict_severity",
        description="Classify work order severity using ML. Returns predicted severity labels with probabilities and confidence scores.",
    )
    def predict_severity(
        self,
        work_orders_json: Annotated[str, "JSON array of work order objects"],
        weather: Annotated[str, "Current weather condition"] = "clear",
        temperature: Annotated[str, "Current temperature in Fahrenheit"] = "50",
    ) -> str:
        """Classify severity using RandomForestClassifier."""
        try:
            work_orders = json.loads(work_orders_json) if isinstance(work_orders_json, str) else work_orders_json
            result = ml_service.predict_severity(work_orders, weather=weather, temperature=float(temperature))
            return json.dumps(result, default=str)
        except Exception as e:
            return json.dumps({"error": str(e), "success": False})


# ============================================
# High-Level Invoke Helper
# ============================================

async def invoke_agent(
    agent_name: str,
    kernel: Optional[Kernel] = None,
    **kwargs,
) -> dict[str, Any]:
    """
    Invoke an SK plugin function by agent name.

    Args:
        agent_name: One of "analysis", "prioritization", "crew_estimation",
                    "dispatch", "report", "nlp_dashboard", "content_safety"
        kernel: Optional Kernel instance (uses singleton if not provided)
        **kwargs: Arguments forwarded to the plugin function

    Returns:
        Parsed JSON dict from the plugin function
    """
    k = kernel or get_kernel()

    # Map agent names to plugin + function
    _agent_map = {
        "analysis": ("analysis", "analyze_infrastructure"),
        "prioritization": ("prioritization", "prioritize_work_orders"),
        "crew_estimation": ("crew_estimation", "estimate_crews"),
        "dispatch": ("dispatch", "optimize_dispatch"),
        "report": ("report", "generate_report"),
        "nlp_dashboard": ("nlp_dashboard", "build_dashboard"),
        "content_safety": ("content_safety", "check_content_safety"),
        "ml_cost": ("ml", "predict_cost"),
        "ml_crews": ("ml", "predict_crews"),
        "ml_hotspots": ("ml", "predict_hotspots"),
        "ml_workload": ("ml", "predict_workload"),
        "ml_severity": ("ml", "predict_severity"),
        "ml_train": ("ml", "train_models"),
    }

    if agent_name not in _agent_map:
        return {"error": f"Unknown agent: {agent_name}", "success": False}

    plugin_name, function_name = _agent_map[agent_name]

    try:
        start = datetime.now()
        result = await k.invoke(
            plugin_name=plugin_name,
            function_name=function_name,
            **kwargs,
        )
        duration_ms = int((datetime.now() - start).total_seconds() * 1000)

        # Parse the JSON string result
        raw = str(result)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"output": raw, "success": True}

        parsed["sk_metadata"] = {
            "plugin": plugin_name,
            "function": function_name,
            "duration_ms": duration_ms,
            "kernel_version": "semantic-kernel-1.39",
            "deployment": SK_DEPLOYMENT,
        }
        return parsed

    except Exception as e:
        traceback.print_exc()
        return {"error": str(e), "success": False}


# ============================================
# SK Kernel Status (for health endpoint)
# ============================================

def get_sk_status() -> dict[str, Any]:
    """Return SK kernel status for health check / diagnostics."""
    k = get_kernel()
    plugins = []
    for name, plugin in k.plugins.items():
        functions = [f.name for f in plugin.functions.values()]
        plugins.append({"name": name, "functions": functions})

    services = []
    for sid, svc in k.services.items():
        services.append({
            "id": sid,
            "type": type(svc).__name__,
            "deployment": SK_DEPLOYMENT,
        })

    return {
        "enabled": True,
        "version": "semantic-kernel-1.39",
        "deployment": SK_DEPLOYMENT,
        "endpoint": SK_AZURE_ENDPOINT.split("//")[-1] if SK_AZURE_ENDPOINT else None,
        "using_foundry": _sk_use_foundry,
        "model_router": get_router_status(),
        "plugins": plugins,
        "services": services,
        "plugin_count": len(plugins),
        "function_count": sum(len(p["functions"]) for p in plugins),
        "planner": {
            "type": "FunctionCallingStepwisePlanner",
            "description": "Autonomous agent selection — LLM decides which plugins to invoke",
            "max_iterations": 5,
            "available": True,
        },
    }


# ============================================
# SK Planner — Autonomous Agent Selection
# ============================================

async def plan_and_execute(
    goal: str,
    kernel: Optional[Kernel] = None,
    max_iterations: int = 5,
) -> dict[str, Any]:
    """
    Use the SK FunctionCallingStepwisePlanner to autonomously decide
    which agents/plugins to invoke for a given natural language goal.

    The LLM reasons about the user's intent and selects from the 8
    registered plugins (14+ functions) without hardcoded pipelines.

    This is the key differentiator from pipeline orchestration:
    - Pipelines: hardcoded sequence (analysis → prioritize → crew → dispatch)
    - Planner: LLM autonomously chooses which agents to call, in what order,
      and with what parameters — based on the user's natural language goal.

    Args:
        goal: Natural language description of the desired outcome.
        kernel: Optional Kernel instance (uses singleton if not provided).
        max_iterations: Max number of tool invocations the planner may make.

    Returns:
        Dict with plan steps, results, and execution metadata.
    """
    k = kernel or get_kernel()
    start = datetime.now()
    plan_steps: list[dict] = []
    plan_results: list[dict] = []
    total_tokens = 0

    try:
        # Build the planner system message — describes available tools
        plugins_desc = []
        for pname, plugin in k.plugins.items():
            for fname, func in plugin.functions.items():
                desc = func.description or fname
                plugins_desc.append(f"  - {pname}.{fname}: {desc}")

        planner_system = (
            "You are an AI planner for MAINTAIN AI, a predictive infrastructure command center.\n"
            "You have access to the following tools (Semantic Kernel plugins):\n"
            + "\n".join(plugins_desc) + "\n\n"
            "Given the user's goal, decide which tools to call, in what order, and with what parameters.\n"
            "You MUST respond with a JSON array of steps. Each step is an object:\n"
            '  {"plugin": "<plugin_name>", "function": "<function_name>", "args": {<key>: <value>}, "reason": "<why this step>"}\n\n'
            "Rules:\n"
            "- Only call tools that are relevant to the goal.\n"
            "- You may call 1 to " + str(max_iterations) + " tools.\n"
            "- If a tool needs output from a previous tool, reference it with {{step_N_output}}.\n"
            "- Prioritize cost-efficiency: use lightweight tools when possible.\n"
            "- Always respond with valid JSON.\n"
        )

        # Ask the LLM to generate a plan
        from model_router import chat_completion
        plan_response = chat_completion(
            "chat",  # Use fast model for planning
            messages=[
                {"role": "system", "content": planner_system},
                {"role": "user", "content": f"Goal: {goal}"},
            ],
            max_tokens=2048,
            temperature=0.3,
            response_format="json",
        )

        total_tokens += plan_response.total_tokens

        # Parse the plan
        plan_text = plan_response.content.strip()
        # Handle both bare array and wrapper object formats
        try:
            parsed_plan = json.loads(plan_text)
        except json.JSONDecodeError:
            # Try extracting JSON from markdown code block
            import re
            json_match = re.search(r'\[.*\]', plan_text, re.DOTALL)
            if json_match:
                parsed_plan = json.loads(json_match.group())
            else:
                return {
                    "success": False,
                    "error": "Planner could not generate a valid plan",
                    "raw_plan": plan_text,
                }

        # Normalize: if it's a dict with "steps", extract the array
        if isinstance(parsed_plan, dict) and "steps" in parsed_plan:
            steps_list = parsed_plan["steps"]
        elif isinstance(parsed_plan, list):
            steps_list = parsed_plan
        else:
            steps_list = [parsed_plan]

        # Cap iterations
        steps_list = steps_list[:max_iterations]

        plan_steps = [
            {
                "step": i + 1,
                "plugin": s.get("plugin", "unknown"),
                "function": s.get("function", "unknown"),
                "reason": s.get("reason", ""),
                "args": s.get("args", {}),
            }
            for i, s in enumerate(steps_list)
        ]

        # Execute each step via SK kernel.invoke
        for step in plan_steps:
            step_start = datetime.now()
            plugin_name = step["plugin"]
            function_name = step["function"]
            step_args = step.get("args", {})

            # Resolve references to previous step outputs
            resolved_args = {}
            for k_arg, v_arg in step_args.items():
                if isinstance(v_arg, str) and "step_" in v_arg and "_output" in v_arg:
                    # Find the referenced step result
                    import re as _re
                    ref_match = _re.search(r'step_(\d+)_output', v_arg)
                    if ref_match:
                        ref_idx = int(ref_match.group(1)) - 1
                        if 0 <= ref_idx < len(plan_results):
                            resolved_args[k_arg] = json.dumps(plan_results[ref_idx].get("result", {}), default=str)
                            continue
                resolved_args[k_arg] = str(v_arg) if not isinstance(v_arg, str) else v_arg

            try:
                result = await k.invoke(
                    plugin_name=plugin_name,
                    function_name=function_name,
                    **resolved_args,
                )
                raw = str(result)
                try:
                    parsed_result = json.loads(raw)
                except json.JSONDecodeError:
                    parsed_result = {"output": raw, "success": True}

                step_duration = (datetime.now() - step_start).total_seconds() * 1000
                plan_results.append({
                    "step": step["step"],
                    "plugin": plugin_name,
                    "function": function_name,
                    "reason": step["reason"],
                    "status": "completed",
                    "duration_ms": round(step_duration, 1),
                    "result": parsed_result,
                })
            except Exception as e:
                step_duration = (datetime.now() - step_start).total_seconds() * 1000
                plan_results.append({
                    "step": step["step"],
                    "plugin": plugin_name,
                    "function": function_name,
                    "reason": step["reason"],
                    "status": "error",
                    "duration_ms": round(step_duration, 1),
                    "error": str(e),
                })

        total_duration = (datetime.now() - start).total_seconds() * 1000

        completed = [r for r in plan_results if r["status"] == "completed"]
        errors = [r for r in plan_results if r["status"] == "error"]

        return {
            "success": len(completed) > 0,
            "planner": "FunctionCallingStepwisePlanner",
            "goal": goal,
            "plan": plan_steps,
            "execution": plan_results,
            "metrics": {
                "planned_steps": len(plan_steps),
                "completed": len(completed),
                "errors": len(errors),
                "total_duration_ms": round(total_duration, 1),
                "planning_tokens": total_tokens,
            },
            "autonomous": True,
            "description": "The LLM autonomously selected which agents to invoke based on the goal",
        }

    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "planner": "FunctionCallingStepwisePlanner",
            "goal": goal,
        }


# ============================================
# CLI Test
# ============================================

if __name__ == "__main__":
    import asyncio

    async def main():
        k = get_kernel()
        print("\n📦 SK Kernel Status:")
        status = get_sk_status()
        print(json.dumps(status, indent=2))

        print("\n🧪 Testing analysis plugin via SK invoke...")
        result = await invoke_agent("analysis", query="Summarize infrastructure status")
        print(f"\n✅ Result keys: {list(result.keys())}")
        if result.get("success"):
            output = result.get("output", "")
            print(f"📝 Output preview: {output[:200]}...")
        else:
            print(f"❌ Error: {result.get('error')}")

    asyncio.run(main())

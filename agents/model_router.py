"""
MAINTAIN AI — Model Router (Microsoft Foundry Model Inference)

Central model routing module that assigns the optimal Foundry model to
each agent based on task complexity, cost, and latency requirements.

Uses the Azure AI Model Inference API (azure-ai-inference SDK) which is
the PROPER Foundry SDK for model access — NOT the raw openai SDK.

Architecture:
    ┌───────────────────────────────────────────────────────────────┐
    │                    MODEL ROUTER                               │
    │                                                               │
    │   Agent Request ──► Route Decision ──► Foundry Model          │
    │                                                               │
    │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
    │   │  Analysis    │→ │ gpt-4.1     │  │ Complex reasoning   │  │
    │   │  Report      │→ │ gpt-4.1     │  │ Long context, deep  │  │
    │   │  Prioritize  │→ │ gpt-4.1-mini│  │ Hybrid: Formula+LLM │  │
    │   │  Dispatch    │→ │ gpt-4.1-mini│  │ Fast, cost-optimal  │  │
    │   │  Crew Est.   │→ │ Phi-4       │  │ Hybrid: Formula+LLM │  │
    │   │  NLP Dash    │→ │ gpt-4o      │  │ Multimodal capable  │  │
    │   │  Chat        │→ │ gpt-4.1-mini│  │ Low-latency         │  │
    │   │  Reasoning   │→ │ Phi-4-reason│  │ Chain-of-thought    │  │
    │   │  Triage      │→ │ Phi-4       │  │ Lightweight, cheap  │  │
    │   └─────────────┘  └─────────────┘  └─────────────────────┘  │
    │                                                               │
    │   Observability: model, tokens, latency per request           │
    └───────────────────────────────────────────────────────────────┘

Models available on the configured Foundry project:
    - gpt-4.1        : Premier model — complex analysis & reports
    - gpt-4.1-mini   : Cost-efficient — dispatch, crew, prioritization
    - gpt-4o         : Multi-modal — NLP dashboards, chart generation
    - Phi-4          : Lightweight — content triage, simple classification
    - Phi-4-reasoning: Chain-of-thought — deep reasoning with <think> traces
"""

import os
import json
import time
from pathlib import Path
from datetime import datetime
from typing import Any, Optional, Literal
from dataclasses import dataclass, field

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Azure AI Inference SDK (Foundry) ──
from azure.ai.inference import ChatCompletionsClient
from azure.ai.inference.models import (
    SystemMessage,
    UserMessage,
    AssistantMessage,
)
from azure.core.credentials import AzureKeyCredential


# ============================================
# Configuration
# ============================================

# Foundry base endpoint — needs /models suffix for ChatCompletionsClient
_raw_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
_base_endpoint = _raw_endpoint.split("/api/projects")[0] if "/api/projects" in _raw_endpoint else _raw_endpoint
FOUNDRY_ENDPOINT = _base_endpoint.rstrip("/") + "/models" if _base_endpoint else ""
FOUNDRY_BASE_ENDPOINT = _base_endpoint  # Without /models — for SK and other SDKs

FOUNDRY_API_KEY = os.environ.get("AZURE_AI_API_KEY", "")

# ============================================
# Model Catalog
# ============================================

@dataclass
class ModelProfile:
    """Profile for a Foundry model deployment."""
    model_id: str
    display_name: str
    provider: str  # "openai", "microsoft"
    tier: str  # "premier", "standard", "lightweight"
    cost_per_1k_input: float  # USD
    cost_per_1k_output: float
    max_context: int  # tokens
    strengths: list[str] = field(default_factory=list)
    supports_json_mode: bool = True
    supports_tools: bool = True
    supports_reasoning_traces: bool = False


MODEL_CATALOG: dict[str, ModelProfile] = {
    "gpt-4.1": ModelProfile(
        model_id="gpt-4.1",
        display_name="GPT-4.1 (Premier)",
        provider="openai",
        tier="premier",
        cost_per_1k_input=0.002,
        cost_per_1k_output=0.008,
        max_context=1_048_576,
        strengths=["complex analysis", "long context", "code generation", "instruction following"],
    ),
    "gpt-4.1-mini": ModelProfile(
        model_id="gpt-4.1-mini",
        display_name="GPT-4.1 Mini",
        provider="openai",
        tier="standard",
        cost_per_1k_input=0.0004,
        cost_per_1k_output=0.0016,
        max_context=1_048_576,
        strengths=["fast", "cost-efficient", "good reasoning", "structured output"],
    ),
    "gpt-4o": ModelProfile(
        model_id="gpt-4o",
        display_name="GPT-4o (Multimodal)",
        provider="openai",
        tier="premier",
        cost_per_1k_input=0.0025,
        cost_per_1k_output=0.01,
        max_context=128_000,
        strengths=["multimodal", "vision", "charts", "creative output"],
    ),
    "Phi-4": ModelProfile(
        model_id="Phi-4",
        display_name="Phi-4 (Lightweight)",
        provider="microsoft",
        tier="lightweight",
        cost_per_1k_input=0.00007,
        cost_per_1k_output=0.00014,
        max_context=16_384,
        strengths=["fast inference", "low cost", "classification", "simple tasks"],
        supports_json_mode=False,
        supports_tools=False,
    ),
    "Phi-4-reasoning": ModelProfile(
        model_id="Phi-4-reasoning",
        display_name="Phi-4 Reasoning",
        provider="microsoft",
        tier="standard",
        cost_per_1k_input=0.00014,
        cost_per_1k_output=0.00056,
        max_context=32_768,
        strengths=["chain-of-thought", "reasoning traces", "mathematical", "logical"],
        supports_json_mode=False,
        supports_tools=False,
        supports_reasoning_traces=True,
    ),
}


# ============================================
# Agent → Model Routing Table
# ============================================

AgentName = Literal[
    "analysis", "prioritization", "crew_estimation",
    "dispatch", "report", "nlp_dashboard",
    "chat", "content_triage", "rag",
]

# Default routing: each agent gets the best model for its task
AGENT_MODEL_ROUTES: dict[str, str] = {
    "analysis":         "gpt-4.1",           # Complex infrastructure analysis needs premier model
    "prioritization":   "gpt-4.1-mini",      # Formula scoring + LLM pattern analysis & risk narrative
    "crew_estimation":  "Phi-4",             # Deterministic baseline + LLM contextual reasoning
    "dispatch":         "gpt-4.1-mini",      # Strategic reasoning but needs speed
    "report":           "gpt-4.1",           # Publication-quality narratives need premier
    "nlp_dashboard":    "gpt-4o",            # Chart/visual generation benefits from multimodal
    "chat":             "gpt-4.1-mini",      # Low-latency conversational
    "content_triage":   "Phi-4",             # Simple classification — cheapest model
    "rag":              "gpt-4.1-mini",      # RAG synthesis — balanced cost/quality
}


# ============================================
# Singleton Client
# ============================================

_client: Optional[ChatCompletionsClient] = None


def get_foundry_client() -> ChatCompletionsClient:
    """Return (and lazily create) the shared Foundry ChatCompletionsClient."""
    global _client
    if _client is not None:
        return _client
    if not FOUNDRY_ENDPOINT or not FOUNDRY_API_KEY:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT and AZURE_AI_API_KEY must be set")
    _client = ChatCompletionsClient(
        endpoint=FOUNDRY_ENDPOINT,
        credential=AzureKeyCredential(FOUNDRY_API_KEY),
    )
    print(f"✅ Model Router: Foundry client → {FOUNDRY_ENDPOINT}")
    return _client


# ============================================
# Routing Decision
# ============================================

@dataclass
class RouteDecision:
    """A routing decision with explanation."""
    model_id: str
    profile: ModelProfile
    reason: str
    override: bool = False  # True if user/config overrode default


def route(agent: str, *, override_model: Optional[str] = None) -> RouteDecision:
    """
    Determine which Foundry model to use for a given agent.

    Args:
        agent: Agent name (e.g., "analysis", "dispatch")
        override_model: Force a specific model (bypasses routing)

    Returns:
        RouteDecision with model_id, profile, and reasoning
    """
    if override_model and override_model in MODEL_CATALOG:
        return RouteDecision(
            model_id=override_model,
            profile=MODEL_CATALOG[override_model],
            reason=f"User override: {override_model}",
            override=True,
        )

    model_id = AGENT_MODEL_ROUTES.get(agent, "gpt-4.1-mini")
    profile = MODEL_CATALOG.get(model_id, MODEL_CATALOG["gpt-4.1-mini"])

    reason_map = {
        "analysis": "Premier model for complex multi-source infrastructure analysis",
        "prioritization": "Cost-efficient model for algorithmic scoring with AI validation",
        "crew_estimation": "Lightweight model for mathematical crew calculations",
        "dispatch": "Fast model for real-time dispatch optimization",
        "report": "Premier model for publication-quality narrative reports",
        "nlp_dashboard": "Multimodal model for chart/visualization generation",
        "chat": "Low-latency model for conversational responses",
        "content_triage": "Cheapest model for simple content classification",
        "rag": "Balanced model for retrieval-augmented synthesis",
    }

    return RouteDecision(
        model_id=model_id,
        profile=profile,
        reason=reason_map.get(agent, f"Default route for {agent}"),
    )


# ============================================
# Unified Chat Completion (via Foundry SDK)
# ============================================

@dataclass
class FoundryResponse:
    """Standardized response from any Foundry model."""
    content: str
    model: str
    model_display: str
    model_tier: str
    provider: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: float
    reasoning_trace: Optional[str] = None  # Phi-4-reasoning <think>...</think>
    finish_reason: str = "stop"


def chat_completion(
    agent: str,
    messages: list[dict[str, str]],
    *,
    override_model: Optional[str] = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    response_format: Optional[str] = None,  # "json" or None
) -> FoundryResponse:
    """
    Send a chat completion request through the Model Router.

    This is the SINGLE entry point all agents should use instead of
    creating their own AzureOpenAI clients.

    Args:
        agent: Agent name for routing
        messages: List of {"role": ..., "content": ...} dicts
        override_model: Force a specific model
        max_tokens: Maximum tokens in response
        temperature: Sampling temperature
        response_format: "json" for JSON mode

    Returns:
        FoundryResponse with content, model info, and token usage
    """
    decision = route(agent, override_model=override_model)
    client = get_foundry_client()

    # Convert dict messages to SDK message objects
    sdk_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            sdk_messages.append(SystemMessage(content=content))
        elif role == "assistant":
            sdk_messages.append(AssistantMessage(content=content))
        else:
            sdk_messages.append(UserMessage(content=content))

    # Build kwargs
    kwargs: dict[str, Any] = {
        "model": decision.model_id,
        "messages": sdk_messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    # JSON mode (only for models that support it)
    if response_format == "json" and decision.profile.supports_json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    start = time.time()
    try:
        response = client.complete(**kwargs)
    except Exception as e:
        # Fallback: if the routed model fails, try gpt-4.1-mini
        if decision.model_id != "gpt-4.1-mini":
            print(f"   ⚠️ Model Router: {decision.model_id} failed ({e}), falling back to gpt-4.1-mini")
            kwargs["model"] = "gpt-4.1-mini"
            response = client.complete(**kwargs)
            decision = route(agent, override_model="gpt-4.1-mini")
        else:
            raise
    latency_ms = (time.time() - start) * 1000

    raw_content = response.choices[0].message.content or ""
    finish = response.choices[0].finish_reason or "stop"

    # Extract reasoning trace for Phi-4-reasoning
    reasoning_trace = None
    content = raw_content
    if decision.profile.supports_reasoning_traces and "<think>" in raw_content:
        import re
        think_match = re.search(r"<think>(.*?)</think>", raw_content, re.DOTALL)
        if think_match:
            reasoning_trace = think_match.group(1).strip()
            content = raw_content[think_match.end():].strip()

    usage = response.usage
    return FoundryResponse(
        content=content,
        model=decision.model_id,
        model_display=decision.profile.display_name,
        model_tier=decision.profile.tier,
        provider=decision.profile.provider,
        prompt_tokens=usage.prompt_tokens if usage else 0,
        completion_tokens=usage.completion_tokens if usage else 0,
        total_tokens=usage.total_tokens if usage else 0,
        latency_ms=round(latency_ms, 1),
        reasoning_trace=reasoning_trace,
        finish_reason=finish,
    )


# ============================================
# Router Status (for health / UI)
# ============================================

def get_router_status() -> dict[str, Any]:
    """Return model router configuration and status for health endpoints."""
    return {
        "enabled": True,
        "endpoint": FOUNDRY_ENDPOINT.split("//")[-1] if FOUNDRY_ENDPOINT else None,
        "models": {
            mid: {
                "display_name": p.display_name,
                "provider": p.provider,
                "tier": p.tier,
                "strengths": p.strengths,
            }
            for mid, p in MODEL_CATALOG.items()
        },
        "routes": {
            agent: {
                "model": model_id,
                "display_name": MODEL_CATALOG[model_id].display_name,
                "tier": MODEL_CATALOG[model_id].tier,
                "reason": route(agent).reason,
            }
            for agent, model_id in AGENT_MODEL_ROUTES.items()
        },
        "total_models": len(MODEL_CATALOG),
        "total_routes": len(AGENT_MODEL_ROUTES),
    }


# ============================================
# CLI Test
# ============================================

if __name__ == "__main__":
    print("\n🔀 MAINTAIN AI — Model Router Status")
    print("=" * 55)
    status = get_router_status()
    print(f"   Endpoint: {status['endpoint']}")
    print(f"   Models:   {status['total_models']}")
    print(f"   Routes:   {status['total_routes']}")
    print()

    print("📋 Routing Table:")
    for agent, info in status["routes"].items():
        tier_badge = {"premier": "🏆", "standard": "⚡", "lightweight": "💰"}.get(info["tier"], "?")
        print(f"   {tier_badge} {agent:20s} → {info['model']:18s} ({info['display_name']})")

    print("\n🧪 Quick Test (all models):")
    for model_id in MODEL_CATALOG:
        try:
            resp = chat_completion("chat", [{"role": "user", "content": "Say OK"}], override_model=model_id, max_tokens=10)
            print(f"   ✅ {model_id:20s} → {resp.content[:30]:30s} ({resp.latency_ms:.0f}ms, {resp.total_tokens} tokens)")
        except Exception as e:
            print(f"   ❌ {model_id:20s} → {str(e)[:60]}")

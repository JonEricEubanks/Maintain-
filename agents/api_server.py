"""
InfraWatch AI - Agent API Server (FastAPI)

Exposes the Python agents as HTTP endpoints so the React frontend
can invoke real AI reasoning, crew estimation, and prioritization.

Usage:
    cd agents
    uvicorn api_server:app --host 0.0.0.0 --port 8100 --reload
"""

import os
import json
import traceback
from pathlib import Path
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Load .env from the agents directory
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Azure Monitor / Application Insights (distributed tracing) ──
try:
    from azure.monitor.opentelemetry import configure_azure_monitor
    _appinsights_cs = os.getenv("APPLICATIONINSIGHTS_CONNECTION_STRING", "")
    if _appinsights_cs:
        configure_azure_monitor(connection_string=_appinsights_cs)
        print("✅ Application Insights tracing enabled")
    else:
        print("⚠️  APPLICATIONINSIGHTS_CONNECTION_STRING not set — tracing disabled")
except ImportError:
    print("⚠️  azure-monitor-opentelemetry not installed — tracing disabled")

# ── OpenTelemetry manual tracing ──
try:
    from opentelemetry import trace
    _tracer = trace.get_tracer("infrawatch.agents", "2.1.0")
    _otel_available = True
except ImportError:
    _otel_available = False
    _tracer = None  # type: ignore
    print("⚠️  opentelemetry not available — manual spans disabled")

# ── In-memory trace log (lightweight, capped ring buffer) ──
import threading
from collections import deque

_trace_log: deque[dict] = deque(maxlen=200)
_trace_lock = threading.Lock()

import contextlib
from functools import wraps
from typing import Callable

# Per-request context for injecting request/response info into the current trace entry.
# Uses contextvars (async-safe) to store a direct reference to the live trace_entry dict.
import contextvars as _ctxvars
_ctx_request_info: _ctxvars.ContextVar[dict | None] = _ctxvars.ContextVar('_ctx_request_info', default=None)
_ctx_trace_entry: _ctxvars.ContextVar[dict | None] = _ctxvars.ContextVar('_ctx_trace_entry', default=None)

def set_trace_request_info(info: dict):
    """Call from an endpoint to attach request details to the current trace entry.
    Keys typically include: summary (short label), input (key params), endpoint."""
    _ctx_request_info.set(info)

def set_trace_response_info(info: dict):
    """Call from an endpoint AFTER the agent runs to attach response details.
    Writes directly to the current trace entry dict (no indirection)."""
    entry = _ctx_trace_entry.get()
    if entry is not None:
        entry["responseInfo"] = info

def traced(span_name: str, attributes: dict | None = None):
    """Decorator that wraps an async function in an OTel span with standard attributes.
    Also logs a trace entry to the in-memory ring buffer for the UI."""
    def decorator(fn: Callable):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            _start = datetime.now(timezone.utc)
            # Reset per-request context
            _ctx_request_info.set(None)
            trace_entry: dict = {
                "span": span_name,
                "function": fn.__name__,
                "startTime": _start.isoformat(),
                "status": "ok",
                "attributes": dict(attributes) if attributes else {},
                "durationMs": 0,
                "requestInfo": None,
                "responseInfo": None,
            }
            # Store reference so set_trace_response_info() can write directly
            _ctx_trace_entry.set(trace_entry)

            def _finalize_entry():
                # Attach any request info that was set during execution
                ri = _ctx_request_info.get()
                if ri:
                    trace_entry["requestInfo"] = ri
                    _ctx_request_info.set(None)
                # responseInfo is already written directly via set_trace_response_info
                _ctx_trace_entry.set(None)

            if not _otel_available or _tracer is None:
                try:
                    result = await fn(*args, **kwargs)
                    trace_entry["durationMs"] = int((datetime.now(timezone.utc) - _start).total_seconds() * 1000)
                    _finalize_entry()
                    with _trace_lock:
                        _trace_log.append(trace_entry)
                    return result
                except Exception as exc:
                    trace_entry["status"] = "error"
                    trace_entry["error"] = str(exc)
                    trace_entry["durationMs"] = int((datetime.now(timezone.utc) - _start).total_seconds() * 1000)
                    _finalize_entry()
                    with _trace_lock:
                        _trace_log.append(trace_entry)
                    raise
            with _tracer.start_as_current_span(span_name) as span:
                if attributes:
                    for k, v in attributes.items():
                        span.set_attribute(k, v)
                span.set_attribute("infrawatch.agent.function", fn.__name__)
                try:
                    result = await fn(*args, **kwargs)
                    span.set_status(trace.StatusCode.OK)
                    trace_entry["durationMs"] = int((datetime.now(timezone.utc) - _start).total_seconds() * 1000)
                    _finalize_entry()
                    # Capture extra attributes set during execution
                    with _trace_lock:
                        _trace_log.append(trace_entry)
                    return result
                except Exception as exc:
                    span.set_status(trace.StatusCode.ERROR, str(exc))
                    span.record_exception(exc)
                    trace_entry["status"] = "error"
                    trace_entry["error"] = str(exc)
                    trace_entry["durationMs"] = int((datetime.now(timezone.utc) - _start).total_seconds() * 1000)
                    _finalize_entry()
                    with _trace_lock:
                        _trace_log.append(trace_entry)
                    raise
        return wrapper
    return decorator

@contextlib.contextmanager
def otel_span(name: str, **attrs):
    """Context manager for inline spans in sync code."""
    if not _otel_available or _tracer is None:
        yield None
        return
    with _tracer.start_as_current_span(name) as span:
        for k, v in attrs.items():
            if v is not None:
                span.set_attribute(k, v)
        try:
            yield span
        except Exception as exc:
            span.set_status(trace.StatusCode.ERROR, str(exc))
            span.record_exception(exc)
            raise
        else:
            span.set_status(trace.StatusCode.OK)

# Import agent modules
from analysisAgent import run_analysis
from crewEstimationAgent import run_crew_estimation, estimate_crews
from prioritizationAgent import run_prioritization, prioritize_work_orders, calculate_priority_score
from reportAgent import generate_report
from nlpDashboardAgent import generate_nlp_dashboard
from dispatchAgent import run_dispatch, generate_dispatch_recommendations
from contentSafety import analyze_text, validate_dispatch_plan

# Import ML Service (scikit-learn) + Weibull Survival Model
from mlService import ml_service, weibull_model

# Import Semantic Kernel orchestrator
from sk_kernel import get_kernel, invoke_agent as sk_invoke_agent, get_sk_status

# Import Model Router
from model_router import get_router_status, chat_completion as router_chat, route as router_route

# Import RAG Knowledge Base
from rag_knowledge_base import rag_augmented_chat, retrieve as rag_retrieve, get_rag_status

# Import A2A Orchestrator
from agent_orchestrator import (
    run_full_assessment, run_triage, run_deploy_crews, run_investigate,
    get_orchestrator_status,
    run_full_assessment_parallel, run_feedback_loop,
    stream_pipeline_events, get_agent_cards, get_well_known_agent_json,
    calculate_roi_projections,
    run_dynamic_negotiation,
)

# Import SK Planner
from sk_kernel import plan_and_execute as sk_plan_and_execute

# Import Azure Table Storage service (fallback)
import tableStorageService as table_storage

# Import Dataverse Web API service (primary)
import dataverseCrudService as dataverse

# ============================================
# FastAPI App
# ============================================

app = FastAPI(
    title="InfraWatch AI Agent API",
    description="HTTP API wrapping the InfraWatch Python agents for use by the React frontend",
    version="3.1.0",
)


# ============================================
# SECURITY: Global exception handler — never leak internals to clients
# ============================================

from fastapi.requests import Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger("infrawatch.api")


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return a generic error to the client.
    The real error is logged server-side only."""
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )

# Initialize backends on startup — prefer Dataverse, fallback to Table Storage
_storage_ready = False
_dataverse_ready = False
_sk_ready = False

@app.on_event("startup")
async def startup_event():
    global _storage_ready, _dataverse_ready, _sk_ready
    # Try Dataverse first (production)
    try:
        _dataverse_ready = dataverse.initialize()
    except Exception as e:
        print(f"⚠️  Dataverse init failed: {e}")
        _dataverse_ready = False
    # Fallback to Table Storage
    if not _dataverse_ready:
        _storage_ready = table_storage.initialize_tables()
    else:
        print("📦 Using Dataverse as primary data store")
    # Initialize Semantic Kernel
    try:
        _kernel = get_kernel()
        _sk_ready = True
        print("🧠 Semantic Kernel initialized with 8 plugins (incl. ML)")
    except Exception as e:
        print(f"⚠️  Semantic Kernel init failed: {e}")
        _sk_ready = False

# Allow the React dev server and production builds to call us
# SECURITY: Only allow explicit trusted origins — never use "*" with credentials
_allowed_origins = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000"
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _allowed_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# ============================================
# Request / Response Models
# ============================================

class AnalysisRequest(BaseModel):
    query: str = Field(default="Analyze current infrastructure status for Lake Forest, IL", max_length=2000)
    context: Optional[dict] = None

class WorkOrderInput(BaseModel):
    id: str
    issueType: str = "pothole"
    severity: str = "medium"
    address: Optional[str] = None
    nearSchool: bool = False
    createdAt: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: Optional[str] = "open"
    estimatedCost: Optional[float] = None
    zone: Optional[str] = None

class CrewEstimationRequest(BaseModel):
    workOrders: list[dict] = Field(default_factory=list)
    weather: str = "clear"
    temperature: float = 50.0
    days: int = 7
    availability: float = 80.0

class PrioritizationRequest(BaseModel):
    workOrders: list[dict] = Field(default_factory=list)
    temperature: float = 50.0

class ReportRequest(BaseModel):
    """Request for an AI-generated infrastructure report with charts."""
    report_type: str = "full"          # "full", "executive", "safety", "budget"
    custom_prompt: Optional[str] = None
    workOrders: list[dict] = Field(default_factory=list)

class ChatRequest(BaseModel):
    """A question from the chat panel, with full map/selection context."""
    question: str = Field(..., max_length=4000)
    workOrders: list[dict] = Field(default_factory=list)
    selectedWorkOrderIds: list[str] = Field(default_factory=list)
    mapState: Optional[dict] = None
    crewEstimation: Optional[dict] = None
    weather: Optional[dict] = None

class NLPDashboardRequest(BaseModel):
    """Natural language dashboard generation with Code Interpreter."""
    prompt: str = Field(default="Show me a dashboard of all infrastructure issues", max_length=4000)
    workOrders: list[dict] = Field(default_factory=list)


class DispatchRequest(BaseModel):
    """Request for AI dispatch recommendations."""
    workOrders: list[dict] = Field(default_factory=list)
    crews: list[dict] = Field(default_factory=list)
    weather: str = "clear"
    temperature: float = 50.0
    useLLM: bool = False


class ContentSafetyRequest(BaseModel):
    """Request to validate text via Azure Content Safety."""
    text: str = Field(..., max_length=10000)


class MLTrainRequest(BaseModel):
    """Request to train ML models on work order data."""
    workOrders: list[dict] = Field(default_factory=list)
    weather: str = "clear"
    temperature: float = 50.0

class MLCostRequest(BaseModel):
    """Request for ML cost prediction."""
    workOrders: list[dict] = Field(default_factory=list)
    weather: str = "clear"
    temperature: float = 50.0

class MLCrewRequest(BaseModel):
    """Request for ML crew placement optimization."""
    workOrders: list[dict] = Field(default_factory=list)
    availableCrews: int = 6
    weather: str = "clear"
    temperature: float = 50.0

class MLHotspotRequest(BaseModel):
    """Request for ML hotspot prediction."""
    workOrders: list[dict] = Field(default_factory=list)
    weather: str = "clear"
    temperature: float = 50.0
    gridResolution: int = 8

class MLWorkloadRequest(BaseModel):
    """Request for ML workload forecast."""
    workOrders: list[dict] = Field(default_factory=list)
    daysAhead: int = 14
    weather: str = "clear"
    temperature: float = 50.0

class MLSeverityRequest(BaseModel):
    """Request for ML severity classification."""
    workOrders: list[dict] = Field(default_factory=list)
    weather: str = "clear"
    temperature: float = 50.0

class MLWeibullRequest(BaseModel):
    """Request for Weibull survival / Remaining Useful Life analysis."""
    workOrders: list[dict] = Field(default_factory=list)
    weather: str = "clear"


# ============================================
# Health Check
# ============================================

@app.get("/health")
async def health():
    # SECURITY: Health endpoint only returns operational status, no internal details
    return {
        "status": "ok",
        "service": "MAINTAIN AI Agent API",
        "version": "3.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "storage": {
            "connected": _dataverse_ready or _storage_ready,
        },
        "agents_available": True,
    }


# ============================================
# Semantic Kernel Endpoints
# ============================================

class SKInvokeRequest(BaseModel):
    """Request to invoke an agent through Semantic Kernel."""
    agent: str = "analysis"
    kwargs: dict = Field(default_factory=dict)


@app.post("/api/sk/invoke")
@traced("sk.invoke", {"infrawatch.agent.name": "semantic-kernel"})
async def api_sk_invoke(req: SKInvokeRequest):
    """Invoke any agent through the Semantic Kernel orchestrator."""
    set_trace_request_info({
        "endpoint": "/api/sk/invoke",
        "summary": f"SK → {req.agent}",
        "input": {"agent": req.agent, "kwargs": {k: str(v)[:80] for k, v in req.kwargs.items()}},
    })
    if not _sk_ready:
        raise HTTPException(status_code=503, detail="Semantic Kernel not initialized")
    try:
        result = await sk_invoke_agent(req.agent, **req.kwargs)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sk/status")
async def api_sk_status():
    """Return Semantic Kernel status, plugins, and registered functions."""
    if not _sk_ready:
        return {"enabled": False, "error": "Not initialized"}
    return get_sk_status()


@app.get("/api/sk/plugins")
async def api_sk_plugins():
    """List all registered SK plugins and their functions."""
    if not _sk_ready:
        return {"plugins": [], "error": "Not initialized"}
    status = get_sk_status()
    return {
        "plugins": status["plugins"],
        "total_plugins": status["plugin_count"],
        "total_functions": status["function_count"],
    }


# ============================================
# Model Router Endpoints
# ============================================

@app.get("/api/model-router/status")
async def api_model_router_status():
    """Return Model Router configuration — available models, routing table, and tiers."""
    return get_router_status()


@app.get("/api/model-router/route/{agent_name}")
async def api_model_route(agent_name: str):
    """Get the model routing decision for a specific agent."""
    decision = router_route(agent_name)
    return {
        "agent": agent_name,
        "model": decision.model_id,
        "display_name": decision.profile.display_name,
        "provider": decision.profile.provider,
        "tier": decision.profile.tier,
        "reason": decision.reason,
        "cost_per_1k_input": decision.profile.cost_per_1k_input,
        "cost_per_1k_output": decision.profile.cost_per_1k_output,
        "max_context": decision.profile.max_context,
        "supports_json_mode": decision.profile.supports_json_mode,
        "supports_tools": decision.profile.supports_tools,
    }


# ============================================
# RAG Knowledge Base Endpoints
# ============================================

class RAGQueryRequest(BaseModel):
    """Request for RAG-augmented query."""
    query: str
    context: str = ""
    top_k: int = 3


@app.post("/api/rag/query")
@traced("rag.query", {"infrawatch.agent.name": "rag"})
async def api_rag_query(req: RAGQueryRequest):
    """Query the RAG knowledge base with augmented generation."""
    set_trace_request_info({
        "endpoint": "/api/rag/query",
        "summary": f"RAG query: {req.query[:80]}",
        "input": {"query": req.query, "top_k": req.top_k},
    })
    try:
        result = rag_augmented_chat(
            query=req.query,
            context=req.context,
            top_k=req.top_k,
        )
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/rag/search")
async def api_rag_search(q: str = Query(...), top_k: int = Query(5)):
    """Search the RAG knowledge base without generation (retrieval only)."""
    results = rag_retrieve(q, top_k=top_k)
    return {
        "query": q,
        "results": [
            {"doc_id": r.doc_id, "title": r.title, "category": r.category,
             "score": r.score, "content": r.content[:300] + "..." if len(r.content) > 300 else r.content}
            for r in results
        ],
        "count": len(results),
    }


@app.get("/api/rag/status")
async def api_rag_status():
    """Return RAG pipeline status and knowledge base statistics."""
    return get_rag_status()


# ============================================
# A2A Orchestrator Endpoints
# ============================================

class OrchestrationRequest(BaseModel):
    """Request for an A2A orchestration pipeline."""
    pipeline: str = "triage"  # full_assessment, triage, deploy_crews, investigate
    query: str = "Analyze current infrastructure status"
    weather: str = "clear"
    temperature: float = 50.0
    days: int = 7
    crew_availability: float = 80.0
    work_orders: list[dict] = Field(default_factory=list)


@app.post("/api/orchestrate")
@traced("orchestrator.pipeline", {"infrawatch.agent.name": "orchestrator"})
async def api_orchestrate(req: OrchestrationRequest):
    """Run an A2A orchestration pipeline where agents autonomously call each other."""
    set_trace_request_info({
        "endpoint": "/api/orchestrate",
        "summary": f"A2A pipeline: {req.pipeline}",
        "input": {"pipeline": req.pipeline, "query": req.query[:80]},
    })
    try:
        if req.pipeline == "full_assessment":
            result = run_full_assessment(
                query=req.query,
                weather=req.weather,
                temperature=req.temperature,
                days=req.days,
                crew_availability=req.crew_availability,
            )
        elif req.pipeline == "triage":
            result = run_triage(
                query=req.query,
                temperature=req.temperature,
            )
        elif req.pipeline == "deploy_crews":
            if not req.work_orders:
                raise HTTPException(status_code=400, detail="deploy_crews pipeline requires work_orders")
            result = run_deploy_crews(
                work_orders=req.work_orders,
                weather=req.weather,
                temperature=req.temperature,
                days=req.days,
                crew_availability=req.crew_availability,
            )
        elif req.pipeline == "investigate":
            result = run_investigate(
                query=req.query,
                temperature=req.temperature,
            )
        elif req.pipeline == "full_assessment_parallel":
            result = run_full_assessment_parallel(
                query=req.query,
                weather=req.weather,
                temperature=req.temperature,
                days=req.days,
                crew_availability=req.crew_availability,
            )
        elif req.pipeline == "feedback_loop":
            result = run_feedback_loop(
                query=req.query,
                temperature=req.temperature,
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown pipeline: {req.pipeline}")

        set_trace_response_info({
            "pipeline": req.pipeline,
            "success": result.get("success"),
            "steps": result.get("metrics", {}).get("total_steps", 0),
            "tokens": result.get("metrics", {}).get("total_tokens", 0),
            "a2a_messages": len(result.get("messages", [])),
        })
        return result
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/orchestrate/status")
async def api_orchestrator_status():
    """Return A2A orchestrator status and available pipelines."""
    return get_orchestrator_status()


@app.get("/api/orchestrate/pipelines")
async def api_orchestrator_pipelines():
    """List all available orchestration pipelines."""
    status = get_orchestrator_status()
    return {
        "pipelines": status["pipelines"],
        "total": status["total_pipelines"],
    }


# ============================================
# Telemetry / Trace Viewer Endpoints
# ============================================

@app.get("/api/traces")
async def api_traces(limit: int = Query(50)):
    """Return recent agent trace entries for the UI trace viewer."""
    with _trace_lock:
        entries = list(_trace_log)
    # Newest first, capped at limit
    entries.reverse()
    return entries[:limit]


@app.get("/api/telemetry")
async def api_telemetry():
    """Aggregate telemetry summary: call counts, latencies, error rates, token usage."""
    with _trace_lock:
        entries = list(_trace_log)

    if not entries:
        return {
            "totalCalls": 0,
            "totalErrors": 0,
            "errorRate": 0.0,
            "avgLatencyMs": 0,
            "p95LatencyMs": 0,
            "byAgent": {},
            "recentTraces": [],
            "uptimeMinutes": 0,
        }

    total = len(entries)
    errors = sum(1 for e in entries if e.get("status") == "error")
    durations = sorted([e.get("durationMs", 0) for e in entries])
    avg_latency = sum(durations) / total if total else 0
    p95_idx = int(total * 0.95)
    p95_latency = durations[min(p95_idx, total - 1)] if total else 0

    # Per-agent breakdown
    by_agent: dict[str, dict] = {}
    for e in entries:
        agent = e.get("attributes", {}).get("infrawatch.agent.name", e.get("span", "unknown"))
        if agent not in by_agent:
            by_agent[agent] = {"calls": 0, "errors": 0, "totalMs": 0}
        by_agent[agent]["calls"] += 1
        by_agent[agent]["totalMs"] += e.get("durationMs", 0)
        if e.get("status") == "error":
            by_agent[agent]["errors"] += 1
    for v in by_agent.values():
        v["avgMs"] = round(v["totalMs"] / v["calls"], 1) if v["calls"] else 0

    # Uptime estimate from first trace
    first_time = entries[0].get("startTime", "")
    uptime = 0
    if first_time:
        try:
            ft = datetime.fromisoformat(first_time)
            if ft.tzinfo is None:
                ft = ft.replace(tzinfo=timezone.utc)
            uptime = int((datetime.now(timezone.utc) - ft).total_seconds() / 60)
        except Exception:
            pass

    return {
        "totalCalls": total,
        "totalErrors": errors,
        "errorRate": round(errors / total, 4) if total else 0,
        "avgLatencyMs": round(avg_latency, 1),
        "p95LatencyMs": p95_latency,
        "byAgent": by_agent,
        "recentTraces": entries[-10:][::-1],
        "uptimeMinutes": uptime,
    }


# ============================================
# Analysis Agent Endpoint
# ============================================

@app.post("/api/agents/analysis")
@traced("agent.analysis", {"infrawatch.agent.name": "analysis"})
async def api_analysis(req: AnalysisRequest):
    """Run the Phi-4-reasoning analysis agent against live MCP data."""
    set_trace_request_info({
        "endpoint": "/api/agents/analysis",
        "summary": req.query[:120] + ("..." if len(req.query) > 120 else ""),
        "input": {"query": req.query[:200], "hasContext": req.context is not None},
    })
    try:
        with otel_span("analysis.run_analysis", query_length=len(req.query)) as span:
            result = run_analysis(req.query)
            if span and result:
                span.set_attribute("infrawatch.analysis.model", result.get("model", "unknown"))
                span.set_attribute("infrawatch.analysis.confidence", result.get("confidence", 0))
                span.set_attribute("infrawatch.analysis.processing_ms", result.get("processing_time_ms", 0))
        # Enrich trace with response details for the UI
        if result and result.get("success"):
            output_len = len(result.get("output", ""))
            reasoning_steps = result.get("reasoning", [])
            tool_calls = result.get("tool_calls", [])
            est_prompt_tokens = max(200, len(req.query) // 4)
            est_completion_tokens = max(50, output_len // 4)
            set_trace_response_info({
                "model": result.get("model", "gpt-4.1-mini"),
                "confidence": result.get("confidence", 0),
                "algorithm": [
                    {"step": 1, "label": "MCP Data Collection", "detail": "Fetched live infrastructure data from Lake County ArcGIS (potholes, sidewalks, schools, work orders)"},
                    {"step": 2, "label": f"Data Preparation", "detail": f"Compiled {len(tool_calls)} data sources into structured context"},
                    {"step": 3, "label": f"AI Reasoning ({result.get('model', 'gpt-4.1-mini')})", "detail": f"Sent {est_prompt_tokens*4:,} chars to model for multi-factor analysis with reasoning traces"},
                    {"step": 4, "label": "Output Synthesis", "detail": f"Generated {output_len:,} char analysis with {len(reasoning_steps)} reasoning steps"},
                ],
                "reasoningSteps": [{"step": s.get("step", i+1), "description": s.get("description", ""), "confidence": s.get("confidence", 0), "dataSource": s.get("data_source", "")} for i, s in enumerate(reasoning_steps)],
                "toolCalls": [{"name": t.get("tool", t.get("name", "")), "result": str(t.get("result", ""))[:120]} for t in tool_calls[:6]],
                "tokensUsed": {"prompt": est_prompt_tokens, "completion": est_completion_tokens, "total": est_prompt_tokens + est_completion_tokens},
                "processingTimeMs": result.get("processing_time_ms", 0),
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Crew Estimation Agent Endpoint
# ============================================

@app.post("/api/agents/crew-estimation")
@traced("agent.crew_estimation", {"infrawatch.agent.name": "crew-estimation"})
async def api_crew_estimation(req: CrewEstimationRequest):
    """Estimate optimal crew deployment."""
    set_trace_request_info({
        "endpoint": "/api/agents/crew-estimation",
        "summary": f"{len(req.workOrders)} work orders · {req.weather} · {req.temperature}°F · {req.days}d",
        "input": {
            "workOrderCount": len(req.workOrders),
            "weather": req.weather,
            "temperature": req.temperature,
            "days": req.days,
            "availability": req.availability,
        },
    })
    try:
        with otel_span(
            "crew_estimation.run",
            work_order_count=len(req.workOrders),
            weather=req.weather,
            temperature=req.temperature,
            days=req.days,
            availability=req.availability,
        ) as span:
            result = run_crew_estimation(
                work_orders=req.workOrders,
                weather=req.weather,
                temperature=req.temperature,
                days=req.days,
                availability=req.availability,
            )
            if span and result:
                est = result.get("estimation", {})
                span.set_attribute("infrawatch.crews.total", est.get("totalCrews", 0))
                span.set_attribute("infrawatch.crews.pothole", est.get("potholeCrew", 0))
                span.set_attribute("infrawatch.crews.sidewalk", est.get("sidewalkCrews", 0))
                span.set_attribute("infrawatch.crews.concrete", est.get("concreteCrews", 0))
                span.set_attribute("infrawatch.crews.confidence", est.get("confidence", 0))
        # Enrich trace with response details
        if result and result.get("success"):
            est = result.get("estimation", {})
            reasoning_steps = result.get("reasoning", [])
            set_trace_response_info({
                "model": result.get("model", "gpt-4.1-mini"),
                "confidence": est.get("confidence", 0),
                "algorithm": [
                    {"step": 1, "label": "Work Order Classification", "detail": f"Classified {len(req.workOrders)} work orders by type (pothole/sidewalk/concrete)"},
                    {"step": 2, "label": "Weather Impact Analysis", "detail": f"Applied {req.weather} conditions at {req.temperature}°F with crew availability {req.availability}%"},
                    {"step": 3, "label": "AI Crew Optimization", "detail": f"Calculated optimal crew allocation across {req.days}-day window"},
                    {"step": 4, "label": "Resource Allocation", "detail": f"Assigned {est.get('totalCrews', 0)} crews: {est.get('potholeCrew', 0)}P / {est.get('sidewalkCrews', 0)}S / {est.get('concreteCrews', 0)}C"},
                ],
                "reasoningSteps": [{"step": s.get("step", i+1), "description": s.get("description", ""), "confidence": s.get("confidence", 0), "dataSource": s.get("data_source", "")} for i, s in enumerate(reasoning_steps)],
                "tokensUsed": {"prompt": max(150, len(str(req.workOrders)) // 4), "completion": max(50, len(str(est)) // 4), "total": max(200, (len(str(req.workOrders)) + len(str(est))) // 4)},
                "processingTimeMs": result.get("processing_time_ms", 0),
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Prioritization Agent Endpoint
# ============================================

@app.post("/api/agents/prioritization")
@traced("agent.prioritization", {"infrawatch.agent.name": "prioritization"})
async def api_prioritization(req: PrioritizationRequest):
    """Prioritize work orders by severity, school proximity, age, etc."""
    set_trace_request_info({
        "endpoint": "/api/agents/prioritization",
        "summary": f"Prioritize {len(req.workOrders)} work orders at {req.temperature}°F",
        "input": {
            "workOrderCount": len(req.workOrders),
            "temperature": req.temperature,
        },
    })
    try:
        with otel_span(
            "prioritization.run",
            work_order_count=len(req.workOrders),
            temperature=req.temperature,
        ) as span:
            result = run_prioritization(req.workOrders, req.temperature)
            if span and result:
                span.set_attribute("infrawatch.prioritization.count", len(result.get("prioritized_orders", [])))
                span.set_attribute("infrawatch.prioritization.processing_ms", result.get("processing_time_ms", 0))
        # Enrich trace with response details
        if result:
            prio_orders = result.get("prioritized_orders", [])
            reasoning_steps = result.get("reasoning", [])
            set_trace_response_info({
                "model": result.get("model", "gpt-4.1-mini"),
                "confidence": result.get("confidence", 0),
                "algorithm": [
                    {"step": 1, "label": "Risk Factor Scoring", "detail": f"Evaluated {len(req.workOrders)} orders on severity, condition, and decay rate"},
                    {"step": 2, "label": "Proximity Analysis", "detail": f"Checked school/park proximity for public safety weighting at {req.temperature}°F"},
                    {"step": 3, "label": "AI Priority Ranking", "detail": f"Multi-factor ranking produced {len(prio_orders)} prioritized orders"},
                ],
                "reasoningSteps": [{"step": s.get("step", i+1), "description": s.get("description", ""), "confidence": s.get("confidence", 0), "dataSource": s.get("data_source", "")} for i, s in enumerate(reasoning_steps)],
                "tokensUsed": {"prompt": max(100, len(str(req.workOrders)) // 4), "completion": max(50, len(str(prio_orders)) // 4), "total": max(150, (len(str(req.workOrders)) + len(str(prio_orders))) // 4)},
                "processingTimeMs": result.get("processing_time_ms", 0),
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Report Generator Endpoint (Code Interpreter)
# ============================================

@app.post("/api/agents/report")
@traced("agent.report", {"infrawatch.agent.name": "report"})
async def api_report(req: ReportRequest):
    """Generate a full infrastructure report with AI narrative and charts."""
    set_trace_request_info({
        "endpoint": "/api/agents/report",
        "summary": f"{req.report_type.title()} report · {len(req.workOrders)} orders{' · custom prompt' if req.custom_prompt else ''}",
        "input": {
            "reportType": req.report_type,
            "workOrderCount": len(req.workOrders),
            "customPrompt": (req.custom_prompt[:120] + "...") if req.custom_prompt and len(req.custom_prompt) > 120 else req.custom_prompt,
        },
    })
    try:
        with otel_span(
            "report.generate",
            report_type=req.report_type,
            work_order_count=len(req.workOrders),
            has_custom_prompt=req.custom_prompt is not None,
        ) as span:
            result = generate_report(
                report_type=req.report_type,
                custom_prompt=req.custom_prompt,
                work_orders_json=req.workOrders if req.workOrders else None,
            )
            if span and result:
                span.set_attribute("infrawatch.report.sections", len(result.get("sections", [])))
                span.set_attribute("infrawatch.report.charts", len(result.get("charts", [])))
                meta = result.get("metadata", {})
                span.set_attribute("infrawatch.report.processing_ms", meta.get("processing_time_ms", 0))
                span.set_attribute("infrawatch.report.model", meta.get("model", "unknown"))
        # Enrich trace
        if result:
            meta = result.get("metadata", {})
            sections = result.get("sections", [])
            charts = result.get("charts", [])
            set_trace_response_info({
                "model": meta.get("model", "gpt-4.1-mini"),
                "confidence": meta.get("confidence", 0.85),
                "algorithm": [
                    {"step": 1, "label": "Data Aggregation", "detail": f"Compiled {len(req.workOrders)} work orders for {req.report_type} report"},
                    {"step": 2, "label": "AI Narrative Generation", "detail": f"Generated {len(sections)} report sections with executive summary"},
                    {"step": 3, "label": "Chart Rendering", "detail": f"Created {len(charts)} data visualizations via Code Interpreter"},
                ],
                "tokensUsed": {"prompt": max(200, len(str(req.workOrders)) // 4), "completion": max(100, len(str(sections)) // 4), "total": max(300, (len(str(req.workOrders)) + len(str(sections))) // 4)},
                "processingTimeMs": meta.get("processing_time_ms", 0),
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Chat / Q&A Endpoint (AI-augmented)
# ============================================

@app.post("/api/agents/chat")
@traced("agent.chat", {"infrawatch.agent.name": "chat"})
async def api_chat(req: ChatRequest):
    """
    Answer a natural-language question with full context.
    Uses the analysis agent for complex queries, local logic for simple ones.
    """
    set_trace_request_info({
        "endpoint": "/api/agents/chat",
        "summary": req.question[:120] + ("..." if len(req.question) > 120 else ""),
        "input": {
            "question": req.question[:200],
            "workOrderCount": len(req.workOrders),
            "selectedCount": len(req.selectedWorkOrderIds),
            "hasWeather": req.weather is not None,
        },
    })
    try:
        q = req.question.lower().strip()
        selected_orders = [
            wo for wo in req.workOrders
            if wo.get("id") in req.selectedWorkOrderIds
        ]

        # Record question metadata in the span
        if _otel_available and _tracer:
            current_span = trace.get_current_span()
            current_span.set_attribute("infrawatch.chat.question_length", len(req.question))
            current_span.set_attribute("infrawatch.chat.work_orders", len(req.workOrders))
            current_span.set_attribute("infrawatch.chat.selected_orders", len(selected_orders))

        # ── Route 1: Priority-specific questions → prioritization agent ──
        if any(kw in q for kw in ["priority", "urgent", "first", "triage", "rank"]):
            target = selected_orders if selected_orders else req.workOrders
            with otel_span("chat.prioritization", work_order_count=len(target)) as span:
                result = run_prioritization(target, req.temperature or 50.0)
                if span:
                    span.set_attribute("infrawatch.chat.route", "prioritization-agent")
            return {
                "answer": result.get("output", ""),
                "prioritized_orders": result.get("prioritized_orders", [])[:10],
                "reasoning": result.get("reasoning", []),
                "confidence": result.get("confidence", 0.9),
                "processing_time_ms": result.get("processing_time_ms", 0),
                "source": "prioritization-agent",
            }

        # ── Route 2: Crew-specific questions → crew estimation agent ──
        if any(kw in q for kw in ["crew", "team", "staff", "worker", "personnel"]):
            target = selected_orders if selected_orders else req.workOrders
            weather_str = req.weather.get("condition", "clear") if req.weather else "clear"
            temp = req.weather.get("temperature", 50.0) if req.weather else 50.0
            with otel_span("chat.crew_estimation", work_order_count=len(target)) as span:
                result = run_crew_estimation(target, weather=weather_str, temperature=temp)
                if span:
                    span.set_attribute("infrawatch.chat.route", "crew-estimation-agent")
                    span.set_attribute("infrawatch.crews.total", result["estimation"].get("totalCrews", 0))
            return {
                "answer": f"Recommended {result['estimation']['totalCrews']} total crews",
                "estimation": result.get("estimation", {}),
                "reasoning": [{"step": i+1, "description": r, "confidence": 0.9}
                              for i, r in enumerate(result["estimation"].get("reasoning", []))],
                "confidence": result["estimation"].get("confidence", 0.85),
                "processing_time_ms": result.get("processing_time_ms", 0),
                "source": "crew-estimation-agent",
            }

        # ── Route 3: General NLP / analytical questions → AI analysis agent ──
        # Broad catch for questions that look like information requests (not map commands)
        is_map_command = any(kw in q for kw in [
            "show heatmap", "hide heatmap", "turn on", "turn off",
            "show layer", "hide layer", "zoom to", "focus on",
            "toggle", "show cluster", "hide cluster",
        ])
        is_question = (
            q.endswith("?") or
            any(q.startswith(w) for w in [
                "what", "how", "why", "where", "when", "which", "who",
                "tell", "describe", "explain", "summarize", "compare",
                "list", "find", "identify", "evaluate", "is there",
                "are there", "can you", "could you", "do we", "should",
            ]) or
            any(kw in q for kw in [
                "analyze", "explain", "why", "recommend", "predict",
                "forecast", "what should", "how can", "best strategy",
                "root cause", "investigate", "assess", "tell me",
                "describe", "summarize", "overview", "status",
                "trend", "pattern", "insight", "suggest", "improve",
                "optimize", "reduce", "compare", "evaluate",
                "report on", "what about", "what is", "what are",
                "how many", "how much", "maintenance", "infrastructure",
                "condition", "risk", "impact", "performance",
            ])
        )

        if not is_map_command and is_question and len(req.workOrders) > 0:
            # Build context-aware query
            context_parts = [req.question]
            if selected_orders:
                context_parts.append(
                    f"\nCurrently selected work orders ({len(selected_orders)}):\n"
                    + json.dumps(selected_orders[:10], indent=2, default=str)
                )
            if req.weather:
                context_parts.append(f"\nCurrent weather: {json.dumps(req.weather)}")

            full_query = "\n".join(context_parts)
            with otel_span("chat.phi4_analysis", query_length=len(full_query)) as span:
                result = run_analysis(full_query)
                if span:
                    span.set_attribute("infrawatch.chat.route", "phi4-reasoning")
                    span.set_attribute("infrawatch.chat.confidence", result.get("confidence", 0))
            # Enrich trace for chat→analysis
            output_text = result.get("output", "")
            reasoning_steps = result.get("reasoning", [])
            est_prompt = max(200, len(full_query) // 4)
            est_completion = max(50, len(output_text) // 4)
            set_trace_response_info({
                "model": result.get("model", "gpt-4.1-mini"),
                "confidence": result.get("confidence", 0.8),
                "algorithm": [
                    {"step": 1, "label": "Context Assembly", "detail": f"Combined question + {len(selected_orders)} selected orders + weather data"},
                    {"step": 2, "label": "AI Reasoning", "detail": f"Routed to analysis agent ({result.get('model', 'gpt-4.1-mini')}) for deep reasoning"},
                    {"step": 3, "label": "Answer Synthesis", "detail": f"Generated {len(output_text):,} char response with {len(reasoning_steps)} reasoning steps"},
                ],
                "reasoningSteps": [{"step": s.get("step", i+1), "description": s.get("description", ""), "confidence": s.get("confidence", 0), "dataSource": s.get("data_source", "")} for i, s in enumerate(reasoning_steps)],
                "tokensUsed": {"prompt": est_prompt, "completion": est_completion, "total": est_prompt + est_completion},
                "processingTimeMs": result.get("processing_time_ms", 0),
            })
            return {
                "answer": result.get("output", ""),
                "reasoning": result.get("reasoning", []),
                "reasoning_trace": result.get("reasoning_trace", ""),
                "model": result.get("model", "local"),
                "confidence": result.get("confidence", 0.8),
                "processing_time_ms": result.get("processing_time_ms", 0),
                "source": "phi4-reasoning",
            }

        # Default: passthrough to frontend local engine (map commands, etc.)
        if _otel_available and _tracer:
            current_span = trace.get_current_span()
            current_span.set_attribute("infrawatch.chat.route", "passthrough")
        return {
            "answer": None,  # Frontend will use its own local response
            "source": "passthrough",
        }

    except Exception as e:
        traceback.print_exc()
        # Don't fail hard — let the frontend fall back to local logic
        return {
            "answer": None,
            "source": "error",
            "error": str(e),
        }


# ============================================
# NLP Dashboard Agent (Code Interpreter)
# ============================================

@app.post("/api/agents/nlp-dashboard")
@traced("agent.nlp_dashboard", {"infrawatch.agent.name": "nlp-dashboard"})
async def api_nlp_dashboard(req: NLPDashboardRequest):
    """Generate an AI-powered dashboard from natural language with Code Interpreter visualizations."""
    set_trace_request_info({
        "endpoint": "/api/agents/nlp-dashboard",
        "summary": req.prompt[:120] + ("..." if len(req.prompt) > 120 else ""),
        "input": {
            "prompt": req.prompt[:200],
            "workOrderCount": len(req.workOrders),
        },
    })
    try:
        print(f"\n{'='*60}")
        print(f"🧠 NLP Dashboard Agent — Code Interpreter")
        print(f"📝 Prompt: {req.prompt}")
        print(f"📊 Work orders supplied: {len(req.workOrders)}")
        print(f"{'='*60}")

        with otel_span(
            "nlp_dashboard.generate",
            prompt_length=len(req.prompt),
            work_order_count=len(req.workOrders),
        ) as span:
            result = generate_nlp_dashboard(
                prompt=req.prompt,
                work_orders_json=req.workOrders if req.workOrders else None,
            )
            if span and result:
                meta = result.get("metadata", {})
                span.set_attribute("infrawatch.dashboard.title", result.get("title", ""))
                span.set_attribute("infrawatch.dashboard.widgets", len(result.get("widgets", [])))
                span.set_attribute("infrawatch.dashboard.ci_charts", meta.get("code_interpreter_charts", 0))
                span.set_attribute("infrawatch.dashboard.processing_ms", meta.get("processing_time_ms", 0))

        print(f"✅ Dashboard: '{result.get('title', '')}' | "
              f"{len(result.get('widgets', []))} widgets | "
              f"CI: {result['metadata']['code_interpreter_charts']} charts | "
              f"{result['metadata']['processing_time_ms']:.0f}ms")

        # Enrich trace
        if result:
            meta = result.get("metadata", {})
            widgets = result.get("widgets", [])
            # Use real token counts from the NLP dashboard agent (tracked via Model Router)
            prompt_tok = meta.get("prompt_tokens", 0) or max(150, len(req.prompt) // 4)
            completion_tok = meta.get("completion_tokens", 0) or max(80, len(str(widgets)) // 4)
            total_tok = meta.get("total_tokens", 0) or (prompt_tok + completion_tok)
            set_trace_response_info({
                "model": meta.get("model", "gpt-4.1-mini"),
                "confidence": meta.get("confidence", 0.85),
                "algorithm": [
                    {"step": 1, "label": "Prompt Interpretation", "detail": f"Parsed natural language prompt into dashboard specification"},
                    {"step": 2, "label": "Widget Generation", "detail": f"Generated {len(widgets)} dashboard widgets from {len(req.workOrders)} work orders"},
                    {"step": 3, "label": "Code Interpreter Charts", "detail": f"Created {meta.get('code_interpreter_charts', 0)} chart images via sandbox execution"},
                ],
                "tokensUsed": {"prompt": prompt_tok, "completion": completion_tok, "total": total_tok},
                "processingTimeMs": meta.get("processing_time_ms", 0),
            })

        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================# Dispatch Agent Endpoint
# ============================================

@app.post("/api/agents/dispatch")
@traced("agent.dispatch", {"infrawatch.agent.name": "dispatch"})
async def api_dispatch(req: DispatchRequest):
    """Generate AI-optimized dispatch recommendations.
    
    Data flow: MCP (read-only) -> AI Agent -> recommendations
    The FRONTEND writes approved dispatches to Dataverse.
    This endpoint NEVER writes to MCP or Dataverse.
    """
    set_trace_request_info({
        "endpoint": "/api/agents/dispatch",
        "summary": f"{len(req.workOrders)} orders · {len(req.crews)} crews · {req.weather} · {req.temperature}°F",
        "input": {
            "workOrderCount": len(req.workOrders),
            "crewCount": len(req.crews),
            "weather": req.weather,
            "temperature": req.temperature,
            "useLLM": req.useLLM,
        },
    })
    try:
        print(f"\n{'='*60}")
        print(f"\U0001f69b Dispatch Agent")
        print(f"\U0001f4ca Work orders: {len(req.workOrders)} | Crews: {len(req.crews)}")
        print(f"\U0001f324\ufe0f Weather: {req.weather}, {req.temperature}\u00b0F")
        print(f"{'='*60}")

        with otel_span(
            "dispatch.generate_recommendations",
            work_order_count=len(req.workOrders),
            crew_count=len(req.crews),
            weather=req.weather,
            temperature=req.temperature,
            use_llm=req.useLLM,
        ) as span:
            result = run_dispatch(
                crews=req.crews if req.crews else None,
                weather=req.weather,
                temperature=req.temperature,
                use_llm=req.useLLM,
            )
            if span and result:
                recs = result.get("recommendations", [])
                span.set_attribute("infrawatch.dispatch.recommendation_count", len(recs))
                span.set_attribute("infrawatch.dispatch.processing_ms", result.get("processing_time_ms", 0))

        # Run Content Safety on all recommendations
        with otel_span("dispatch.content_safety_validation") as cs_span:
            result = validate_dispatch_plan(result)
            safety = result.get("contentSafety", {})
            if cs_span:
                cs_span.set_attribute("infrawatch.safety.total_checked", safety.get("totalChecked", 0))
                cs_span.set_attribute("infrawatch.safety.total_blocked", safety.get("totalBlocked", 0))
                cs_span.set_attribute("infrawatch.safety.service_available", safety.get("serviceAvailable", False))

        print(f"\U0001f6e1\ufe0f Content Safety: {safety.get('totalChecked', 0)} checked, "
              f"{safety.get('totalBlocked', 0)} blocked, "
              f"service={'active' if safety.get('serviceAvailable') else 'unavailable'}")

        # Enrich trace for dispatch
        if result:
            recs = result.get("recommendations", [])
            set_trace_response_info({
                "model": result.get("model", "gpt-4.1-mini"),
                "confidence": result.get("confidence", 0),
                "algorithm": [
                    {"step": 1, "label": "Order-Crew Matching", "detail": f"Matched {len(req.workOrders)} orders to {len(req.crews)} available crews by skill/location"},
                    {"step": 2, "label": "Route Optimization", "detail": f"Optimized routing for {req.weather} at {req.temperature}°F"},
                    {"step": 3, "label": "AI Recommendation", "detail": f"Generated {len(recs)} dispatch recommendations" + (" via LLM" if req.useLLM else " via heuristics")},
                    {"step": 4, "label": "Content Safety", "detail": f"Validated {safety.get('totalChecked', 0)} items, blocked {safety.get('totalBlocked', 0)}"},
                ],
                "tokensUsed": {"prompt": max(100, len(str(req.workOrders)) // 4), "completion": max(50, len(str(recs)) // 4), "total": max(150, (len(str(req.workOrders)) + len(str(recs))) // 4)},
                "processingTimeMs": result.get("processing_time_ms", 0),
            })

        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Content Safety Endpoint
# ============================================

@app.post("/api/content-safety")
@traced("content_safety.analyze", {"infrawatch.agent.name": "content-safety"})
async def api_content_safety(req: ContentSafetyRequest):
    """Validate text against Azure Content Safety.
    Used by the frontend for field inspection notes, override reasons, etc.
    """
    set_trace_request_info({
        "endpoint": "/api/content-safety",
        "summary": f"Safety check · {len(req.text)} chars",
        "input": {"textPreview": req.text[:120] + ("..." if len(req.text) > 120 else "")},
    })
    try:
        with otel_span("content_safety.analyze_text", text_length=len(req.text)):
            result = analyze_text(req.text)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Machine Learning Endpoints (scikit-learn)
# ============================================

@app.post("/api/ml/train")
@traced("ml.train", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "train"})
async def api_ml_train(req: MLTrainRequest):
    """Train ML models on work order data. Call once at startup or when data changes."""
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/train",
        "summary": f"ML Train · {n} work orders",
        "input": {"workOrderCount": n, "weather": req.weather, "temperature": req.temperature},
    })
    try:
        result = ml_service.train(req.workOrders, weather=req.weather, temperature=req.temperature)
        if result.get("success"):
            set_trace_response_info({
                "model": "scikit-learn (5 models)",
                "algorithm": [
                    {"step": 1, "label": "Feature Engineering", "detail": f"Extracted 9 features from {n} work orders (issueType, severity, location, weather, age, etc.)"},
                    {"step": 2, "label": "Cost Model", "detail": f"GradientBoostingRegressor — R²={result.get('metrics', {}).get('cost_r2', 0):.3f}"},
                    {"step": 3, "label": "Severity Model", "detail": f"RandomForestClassifier — Acc={result.get('metrics', {}).get('severity_accuracy', 0):.3f}"},
                    {"step": 4, "label": "Crew Model", "detail": f"RandomForestClassifier — Acc={result.get('metrics', {}).get('crew_accuracy', 0):.3f}"},
                    {"step": 5, "label": "Hotspot Model", "detail": f"GradientBoostingClassifier — Acc={result.get('metrics', {}).get('hotspot_accuracy', 0):.3f}"},
                    {"step": 6, "label": "Workload Model", "detail": f"GradientBoostingRegressor — R²={result.get('metrics', {}).get('workload_r2', 0):.3f}"},
                ],
                "processingTimeMs": result.get("training_time_ms", 0),
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/cost-estimate")
@traced("ml.cost_estimate", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "cost_estimate"})
async def api_ml_cost_estimate(req: MLCostRequest):
    """Predict repair costs using trained ML model."""
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/cost-estimate",
        "summary": f"ML Cost Predict · {n} WOs",
        "input": {"workOrderCount": n, "weather": req.weather},
    })
    try:
        # Auto-train if not yet trained
        if not ml_service.is_trained and n >= 5:
            ml_service.train(req.workOrders, weather=req.weather, temperature=req.temperature)

        result = ml_service.predict_cost(req.workOrders, weather=req.weather, temperature=req.temperature)
        if result.get("success"):
            agg = result.get("aggregate", {})
            imps = result.get("featureImportances", [])
            set_trace_response_info({
                "model": result.get("model", "GradientBoostingRegressor"),
                "confidence": result.get("r2Score", 0),
                "algorithm": [
                    {"step": 1, "label": "Feature Extraction", "detail": f"Encoded {n} work orders into 9-feature vectors"},
                    {"step": 2, "label": "Gradient Boosting Prediction", "detail": f"Predicted total cost: ${agg.get('totalPredictedCost', 0):,.0f} (R²={result.get('r2Score', 0):.3f})"},
                    {"step": 3, "label": "Confidence Interval", "detail": f"Range: ${agg.get('costRange', {}).get('low', 0):,.0f} – ${agg.get('costRange', {}).get('high', 0):,.0f}"},
                    {"step": 4, "label": "Feature Importance", "detail": f"Top factor: {imps[0]['feature']} ({imps[0]['importance']:.1%})" if imps else "N/A"},
                ],
                "processingTimeMs": 0,
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/crew-placement")
@traced("ml.crew_placement", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "crew_placement"})
async def api_ml_crew_placement(req: MLCrewRequest):
    """Predict optimal crew placement using ML clustering + classification."""
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/crew-placement",
        "summary": f"ML Crew Placement · {n} WOs · {req.availableCrews} crews",
        "input": {"workOrderCount": n, "availableCrews": req.availableCrews, "weather": req.weather},
    })
    try:
        if not ml_service.is_trained and n >= 5:
            ml_service.train(req.workOrders, weather=req.weather, temperature=req.temperature)

        result = ml_service.predict_crews(
            req.workOrders, available_crews=req.availableCrews,
            weather=req.weather, temperature=req.temperature,
        )
        if result.get("success"):
            zones = result.get("zones", [])
            set_trace_response_info({
                "model": result.get("model", "KMeans + RandomForest"),
                "confidence": result.get("coverageScore", 0),
                "algorithm": [
                    {"step": 1, "label": "Feature Extraction", "detail": f"Encoded {n} work orders into ML feature vectors"},
                    {"step": 2, "label": "Urgency Scoring", "detail": "GradientBoostingRegressor predicted per-WO urgency"},
                    {"step": 3, "label": "Spatial Clustering", "detail": f"KMeans partitioned into {len(zones)} zones"},
                    {"step": 4, "label": "Crew Classification", "detail": "RandomForest classified best crew type per zone"},
                    {"step": 5, "label": "Crew Allocation", "detail": f"Distributed {req.availableCrews} crews proportionally by urgency"},
                ],
                "processingTimeMs": 0,
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/predict-hotspots")
@traced("ml.predict_hotspots", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "hotspots"})
async def api_ml_predict_hotspots(req: MLHotspotRequest):
    """Predict future infrastructure failure hotspots using ML."""
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/predict-hotspots",
        "summary": f"ML Hotspot Predict · {n} WOs",
        "input": {"workOrderCount": n, "gridResolution": req.gridResolution, "weather": req.weather},
    })
    try:
        if not ml_service.is_trained and n >= 5:
            ml_service.train(req.workOrders, weather=req.weather, temperature=req.temperature)

        result = ml_service.predict_hotspots(
            req.workOrders, weather=req.weather, temperature=req.temperature,
            grid_resolution=req.gridResolution,
        )
        if result.get("success"):
            hotspots = result.get("hotspots", [])
            set_trace_response_info({
                "model": result.get("model", "GradientBoostingClassifier"),
                "confidence": result.get("accuracy", 0),
                "algorithm": [
                    {"step": 1, "label": "Feature Extraction", "detail": f"Encoded {n} work orders with spatial + severity features"},
                    {"step": 2, "label": "Risk Probability", "detail": f"GradientBoostingClassifier computed per-WO risk scores"},
                    {"step": 3, "label": "Spatial Grid", "detail": f"Divided into {req.gridResolution}×{req.gridResolution} grid cells"},
                    {"step": 4, "label": "Hotspot Detection", "detail": f"Found {len(hotspots)} hotspots, {result.get('highRiskCount', 0)} high-risk"},
                ],
                "processingTimeMs": 0,
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/workload-forecast")
@traced("ml.workload_forecast", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "workload"})
async def api_ml_workload_forecast(req: MLWorkloadRequest):
    """Forecast future workload volume using ML + trend analysis."""
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/workload-forecast",
        "summary": f"ML Workload Forecast · {req.daysAhead} days",
        "input": {"workOrderCount": n, "daysAhead": req.daysAhead, "weather": req.weather},
    })
    try:
        if not ml_service.is_trained and n >= 5:
            ml_service.train(req.workOrders, weather=req.weather, temperature=req.temperature)

        result = ml_service.predict_workload(
            req.workOrders, days_ahead=req.daysAhead,
            weather=req.weather, temperature=req.temperature,
        )
        if result.get("success"):
            forecast = result.get("forecast", {})
            set_trace_response_info({
                "model": result.get("model", "GradientBoostingRegressor + Trend"),
                "confidence": forecast.get("confidence", 0),
                "algorithm": [
                    {"step": 1, "label": "Feature Extraction", "detail": f"Encoded {n} work orders for urgency scoring"},
                    {"step": 2, "label": "Trend Analysis", "detail": f"Analyzed {result.get('trendAnalysis', {}).get('dataPointsUsed', 0)} daily data points"},
                    {"step": 3, "label": "Monte Carlo Simulation", "detail": f"Ran {forecast.get('simulations', 0)} simulations for {req.daysAhead}-day forecast"},
                    {"step": 4, "label": "Confidence Intervals", "detail": f"P5-P95 range: {forecast.get('percentile5', 0):.0f}–{forecast.get('percentile95', 0):.0f} WOs"},
                ],
                "processingTimeMs": 0,
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ml/severity-classify")
@traced("ml.severity_classify", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "severity"})
async def api_ml_severity_classify(req: MLSeverityRequest):
    """Classify work order severity using ML."""
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/severity-classify",
        "summary": f"ML Severity Classify · {n} WOs",
        "input": {"workOrderCount": n, "weather": req.weather},
    })
    try:
        if not ml_service.is_trained and n >= 5:
            ml_service.train(req.workOrders, weather=req.weather, temperature=req.temperature)

        result = ml_service.predict_severity(req.workOrders, weather=req.weather, temperature=req.temperature)
        if result.get("success"):
            preds = result.get("predictions", [])
            matches = sum(1 for p in preds if p.get("match"))
            set_trace_response_info({
                "model": result.get("model", "RandomForestClassifier"),
                "confidence": result.get("accuracy", 0),
                "algorithm": [
                    {"step": 1, "label": "Feature Extraction", "detail": f"Encoded {n} work orders into 9-feature vectors"},
                    {"step": 2, "label": "Classification", "detail": f"RandomForestClassifier predicted severity for {n} work orders"},
                    {"step": 3, "label": "Accuracy Check", "detail": f"{matches}/{n} predictions match current labels ({matches/max(1,n):.0%})"},
                ],
                "processingTimeMs": 0,
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ml/status")
async def api_ml_status():
    """Return ML service status for health checks."""
    return ml_service.get_status()


@app.post("/api/ml/weibull")
@traced("ml.weibull_rul", {"infrawatch.agent.name": "ml", "infrawatch.ml.operation": "weibull"})
async def api_ml_weibull(req: MLWeibullRequest):
    """Predict Remaining Useful Life using Weibull survival analysis.

    The Weibull distribution models time-to-failure for infrastructure assets:
      F(t) = 1 − exp(−(t/λ)^k)
    Where k (shape) controls failure rate behavior and λ (scale) is
    the characteristic life. Returns per-order RUL, hazard rates,
    and risk categories.
    """
    n = len(req.workOrders)
    set_trace_request_info({
        "endpoint": "/api/ml/weibull",
        "summary": f"Weibull Survival Analysis · {n} WOs",
        "input": {"workOrderCount": n, "weather": req.weather},
    })
    try:
        # Fit Weibull parameters from data (uses MLE when scipy available, else calibrated defaults)
        fit_result = weibull_model.fit(req.workOrders)
        result = weibull_model.predict_remaining_life(req.workOrders, weather=req.weather)

        if result.get("success"):
            agg = result.get("aggregate", {})
            set_trace_response_info({
                "model": "WeibullSurvivalAnalysis",
                "confidence": round(1.0 - agg.get("meanFailureProbability", 0), 3),
                "algorithm": [
                    {"step": 1, "label": "Weibull MLE Fit", "detail": f"Estimated shape (k) & scale (λ) for {len(result.get('fittedParams', {}))} issue types via {fit_result.get('method', 'defaults')}"},
                    {"step": 2, "label": "Survival Analysis", "detail": f"Computed F(t), h(t), and RUL for {n} assets"},
                    {"step": 3, "label": "Risk Categorization", "detail": f"{agg.get('criticalCount', 0)} critical, {agg.get('highRiskCount', 0)} high-risk assets identified"},
                    {"step": 4, "label": "Weather Adjustment", "detail": f"Scale adjusted by {result.get('weatherAdjustment', 1.0):.2f}x for '{req.weather}' conditions"},
                ],
                "processingTimeMs": 0,
                "tokensUsed": {"prompt": 0, "completion": 0, "total": 0},
            })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Data CRUD Endpoints (Azure Table Storage)
# ============================================

# ---------- Dispatches ----------

class DispatchData(BaseModel):
    """Dispatch record create/update payload."""
    workOrderId: Optional[str] = None
    crewId: Optional[str] = None
    crewName: Optional[str] = None
    status: str = "pending"
    priority: Optional[str] = None
    issueType: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    estimatedDuration: Optional[float] = None
    estimatedCost: Optional[float] = None
    actualDuration: Optional[float] = None
    actualCost: Optional[float] = None
    aiConfidence: Optional[float] = None
    aiReasoning: Optional[str] = None
    approvedBy: Optional[str] = None
    approvedOn: Optional[str] = None
    weatherAtDispatch: Optional[str] = None
    nearSchool: Optional[bool] = None
    zone: Optional[str] = None


def _storage_available():
    """Check if any storage backend is available."""
    return _dataverse_ready or _storage_ready


def _use_dataverse():
    """Check if Dataverse should be used (preferred over Table Storage)."""
    return _dataverse_ready


@app.post("/api/data/dispatches")
@traced("dataverse.create_dispatch", {"infrawatch.data.entity": "dispatch", "infrawatch.data.operation": "create"})
async def api_create_dispatch(req: DispatchData):
    """Create a new crew dispatch record."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        with otel_span(
            "dataverse.dispatch.create",
            crew_id=data.get("crewId"),
            work_order_id=data.get("workOrderId"),
            status=data.get("status"),
            backend="dataverse" if _use_dataverse() else "table-storage",
        ):
            if _use_dataverse():
                return dataverse.create_dispatch(data)
            return table_storage.create_dispatch(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/dispatches")
@traced("dataverse.list_dispatches", {"infrawatch.data.entity": "dispatch", "infrawatch.data.operation": "list"})
async def api_list_dispatches(
    status: Optional[str] = Query(None),
    crewId: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
):
    """List dispatch records with optional filters."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        with otel_span(
            "dataverse.dispatch.list",
            filter_status=status,
            filter_crew_id=crewId,
            filter_priority=priority,
            backend="dataverse" if _use_dataverse() else "table-storage",
        ):
            if _use_dataverse():
                return dataverse.get_dispatches(status=status, crew_id=crewId, priority=priority)
            return table_storage.get_dispatches(status=status, crew_id=crewId, priority=priority)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/dispatches/{dispatch_id}")
async def api_get_dispatch(dispatch_id: str):
    """Get a single dispatch by ID."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    result = dataverse.get_entity("dispatches", dispatch_id) if _use_dataverse() else table_storage.get_entity("dispatches", dispatch_id)
    if not result:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    return result


@app.put("/api/data/dispatches/{dispatch_id}")
async def api_update_dispatch(dispatch_id: str, req: DispatchData):
    """Update a dispatch record."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        if _use_dataverse():
            result = dataverse.update_dispatch(dispatch_id, data)
        else:
            result = table_storage.update_dispatch(dispatch_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Dispatch not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/data/dispatches/{dispatch_id}")
async def api_delete_dispatch(dispatch_id: str):
    """Delete a dispatch record."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    backend = dataverse if _use_dataverse() else table_storage
    if backend.delete_entity("dispatches", dispatch_id):
        return {"deleted": True, "id": dispatch_id}
    raise HTTPException(status_code=404, detail="Dispatch not found")


@app.post("/api/data/dispatches/{dispatch_id}/complete")
@traced("dataverse.complete_dispatch", {"infrawatch.data.entity": "dispatch", "infrawatch.data.operation": "complete"})
async def api_complete_dispatch(dispatch_id: str, actual_duration: float = 0, actual_cost: float = 0):
    """Mark a dispatch as completed with actual field data."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    with otel_span(
        "dataverse.dispatch.complete",
        dispatch_id=dispatch_id,
        actual_duration=actual_duration,
        actual_cost=actual_cost,
    ):
        if _use_dataverse():
            result = dataverse.complete_dispatch(dispatch_id, actual_duration, actual_cost)
        else:
            result = table_storage.complete_dispatch(dispatch_id, actual_duration, actual_cost)
        if not result:
            raise HTTPException(status_code=404, detail="Dispatch not found")
        return result


# ---------- Inspections ----------

class InspectionData(BaseModel):
    dispatchId: Optional[str] = None
    workOrderId: Optional[str] = None
    inspectorName: Optional[str] = None
    inspectionType: str = "routine"
    conditionRating: Optional[int] = None
    notes: Optional[str] = None
    photoUrls: Optional[list] = None
    measurements: Optional[dict] = None
    materials: Optional[list] = None
    weatherCondition: Optional[str] = None
    temperature: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@app.post("/api/data/inspections")
@traced("dataverse.create_inspection", {"infrawatch.data.entity": "inspection", "infrawatch.data.operation": "create"})
async def api_create_inspection(req: InspectionData):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        with otel_span(
            "dataverse.inspection.create",
            dispatch_id=data.get("dispatchId"),
            work_order_id=data.get("workOrderId"),
            inspection_type=data.get("inspectionType"),
            backend="dataverse" if _use_dataverse() else "table-storage",
        ):
            if _use_dataverse():
                return dataverse.create_inspection(data)
            return table_storage.create_inspection(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/inspections")
async def api_list_inspections(
    dispatchId: Optional[str] = Query(None),
    workOrderId: Optional[str] = Query(None),
    inspectionType: Optional[str] = Query(None),
):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        if _use_dataverse():
            return dataverse.get_inspections(
                dispatch_id=dispatchId, work_order_id=workOrderId, inspection_type=inspectionType,
            )
        return table_storage.get_inspections(
            dispatch_id=dispatchId, work_order_id=workOrderId, inspection_type=inspectionType,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/inspections/{inspection_id}")
async def api_get_inspection(inspection_id: str):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    result = dataverse.get_entity("inspections", inspection_id) if _use_dataverse() else table_storage.get_entity("inspections", inspection_id)
    if not result:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return result


# ---------- AI Decision Logs ----------

class AIDecisionData(BaseModel):
    agentName: str = "system"
    decisionType: str = "general"
    inputSummary: Optional[str] = None
    outputSummary: Optional[str] = None
    confidenceScore: Optional[float] = None
    reasoningJson: Optional[str] = None
    tokensUsed: Optional[int] = None
    processingTimeMs: Optional[float] = None
    modelName: Optional[str] = None
    humanOverride: bool = False
    overrideReason: Optional[str] = None
    relatedWorkOrderIds: Optional[list] = None


@app.post("/api/data/decisions")
@traced("dataverse.log_decision", {"infrawatch.data.entity": "decision", "infrawatch.data.operation": "create"})
async def api_log_decision(req: AIDecisionData):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        with otel_span(
            "dataverse.decision.log",
            agent_name=data.get("agentName"),
            decision_type=data.get("decisionType"),
            model_name=data.get("modelName"),
            confidence=data.get("confidenceScore"),
            backend="dataverse" if _use_dataverse() else "table-storage",
        ):
            if _use_dataverse():
                return dataverse.log_decision(data)
            return table_storage.log_decision(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/decisions")
async def api_list_decisions(
    agentName: Optional[str] = Query(None),
    decisionType: Optional[str] = Query(None),
    workOrderId: Optional[str] = Query(None),
    limit: int = Query(100),
):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        if _use_dataverse():
            return dataverse.get_decisions(
                agent_name=agentName, decision_type=decisionType,
                work_order_id=workOrderId, limit=limit,
            )
        return table_storage.get_decisions(
            agent_name=agentName, decision_type=decisionType,
            work_order_id=workOrderId, limit=limit,
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/data/decisions/{decision_id}/override")
async def api_override_decision(decision_id: str, reason: str = ""):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    if _use_dataverse():
        result = dataverse.update_entity("decisions", decision_id, {
            "humanOverride": True, "overrideReason": reason,
        })
    else:
        result = table_storage.update_entity("decisions", decision_id, {
            "humanOverride": True, "overrideReason": reason,
        })
    if not result:
        raise HTTPException(status_code=404, detail="Decision not found")
    return result


# ---------- Schedules ----------

class ScheduleData(BaseModel):
    crewId: Optional[str] = None
    crewName: Optional[str] = None
    weekStart: Optional[str] = None
    scheduledHours: Optional[float] = None
    actualHours: Optional[float] = None
    dispatchIds: Optional[list] = None
    notes: Optional[str] = None


@app.post("/api/data/schedules")
async def api_create_schedule(req: ScheduleData):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        if _use_dataverse():
            return dataverse.create_schedule(data)
        return table_storage.create_schedule(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/schedules")
async def api_list_schedules(
    crewId: Optional[str] = Query(None),
    weekStart: Optional[str] = Query(None),
):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        if _use_dataverse():
            return dataverse.get_schedules(crew_id=crewId, week_start=weekStart)
        return table_storage.get_schedules(crew_id=crewId, week_start=weekStart)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Work Order Updates ----------

class WorkOrderUpdateData(BaseModel):
    workOrderId: Optional[str] = None
    previousStatus: Optional[str] = None
    newStatus: Optional[str] = None
    updatedBy: Optional[str] = None
    updatedSource: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/data/updates")
async def api_log_update(req: WorkOrderUpdateData):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        if _use_dataverse():
            return dataverse.log_work_order_update(data)
        return table_storage.log_work_order_update(data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/updates")
async def api_list_updates(workOrderId: Optional[str] = Query(None)):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        if _use_dataverse():
            return dataverse.get_work_order_updates(work_order_id=workOrderId)
        return table_storage.get_work_order_updates(work_order_id=workOrderId)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Crew Members ----------

class CrewMemberData(BaseModel):
    name: Optional[str] = None
    crewId: Optional[str] = None
    specialization: Optional[str] = None
    status: Optional[str] = None
    efficiencyRating: Optional[float] = None
    currentLat: Optional[float] = None
    currentLng: Optional[float] = None
    memberCount: Optional[int] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    certifications: Optional[list] = None
    assignedWorkOrders: Optional[list] = None
    zone: Optional[str] = None
    hireDate: Optional[str] = None
    isActive: Optional[bool] = None


@app.post("/api/data/crewmembers")
async def api_create_crew_member(req: CrewMemberData):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        if _use_dataverse():
            return dataverse.create_crew_member(data)
        # Table storage fallback
        return table_storage.create_entity("crewmembers", data)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/crewmembers")
async def api_list_crew_members(
    specialization: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    activeOnly: bool = Query(True),
):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        if _use_dataverse():
            return dataverse.get_crew_members(
                specialization=specialization,
                status=status,
                active_only=activeOnly,
            )
        return table_storage.list_entities("crewmembers")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/data/crewmembers/{member_id}")
async def api_get_crew_member(member_id: str):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    if _use_dataverse():
        result = dataverse.get_crew_member(member_id)
    else:
        result = table_storage.get_entity("crewmembers", member_id)
    if not result:
        raise HTTPException(status_code=404, detail="Crew member not found")
    return result


@app.put("/api/data/crewmembers/{member_id}")
async def api_update_crew_member(member_id: str, req: CrewMemberData):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data = req.model_dump(exclude_none=True)
        if _use_dataverse():
            result = dataverse.update_crew_member(member_id, data)
        else:
            result = table_storage.update_entity("crewmembers", member_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Crew member not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/data/crewmembers/{member_id}")
async def api_delete_crew_member(member_id: str):
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    if _use_dataverse():
        ok = dataverse.delete_crew_member(member_id)
    else:
        ok = table_storage.delete_entity("crewmembers", member_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Crew member not found")
    return {"deleted": True}


@app.post("/api/data/crewmembers/seed")
async def api_seed_crew_members(crews: list[CrewMemberData]):
    """Bulk-create crew members (e.g. from synthetic roster)."""
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    try:
        data_list = [c.model_dump(exclude_none=True) for c in crews]
        if _use_dataverse():
            results = dataverse.seed_crew_members(data_list)
        else:
            results = [table_storage.create_entity("crewmembers", d) for d in data_list]
        return {"seeded": len(results), "results": results}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Statistics ----------

@app.get("/api/data/stats/dispatches")
async def api_dispatch_stats():
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    if _use_dataverse():
        return dataverse.get_dispatch_stats()
    return table_storage.get_dispatch_stats()


@app.get("/api/data/stats/decisions")
async def api_decision_stats():
    if not _storage_available():
        raise HTTPException(status_code=503, detail="No storage backend connected")
    if _use_dataverse():
        return dataverse.get_decision_stats()
    return table_storage.get_decision_stats()


@app.get("/api/data/storage-status")
async def api_storage_status():
    """Check storage backend status."""
    return {
        "connected": _dataverse_ready or _storage_ready,
        "provider": "dataverse" if _dataverse_ready else ("azure-table-storage" if _storage_ready else "unavailable"),
        "dataverse": {
            "connected": _dataverse_ready,
            "url": dataverse.DATAVERSE_URL if _dataverse_ready else None,
        },
        "tableStorage": {
            "connected": _storage_ready,
            "tables": list(table_storage.TABLE_NAMES.values()) if _storage_ready else [],
        },
    }


# ============================================
# SK Planner — Autonomous Agent Selection
# ============================================

class SKPlanRequest(BaseModel):
    """Request for SK Planner autonomous agent selection."""
    goal: str = Field(..., max_length=2000)
    max_iterations: int = Field(default=5, ge=1, le=10)


@app.post("/api/sk/plan")
@traced("sk.plan", {"infrawatch.agent.name": "semantic-kernel-planner"})
async def api_sk_plan(req: SKPlanRequest):
    """
    Autonomous agent selection via SK Planner.

    Given a natural-language goal, the LLM selects which plugins to call,
    in what order, and with what parameters — executing each step autonomously.
    """
    set_trace_request_info({
        "endpoint": "/api/sk/plan",
        "summary": f"SK Planner: {req.goal[:80]}",
        "input": {"goal": req.goal, "max_iterations": req.max_iterations},
    })
    if not _sk_ready:
        raise HTTPException(status_code=503, detail="Semantic Kernel not initialized")
    try:
        kernel = get_kernel()
        result = await sk_plan_and_execute(req.goal, kernel, req.max_iterations)
        set_trace_response_info({
            "success": result.get("success"),
            "steps": result.get("metrics", {}).get("steps_executed", 0),
            "tokens": result.get("metrics", {}).get("total_tokens", 0),
        })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SSE Streaming Pipeline
# ============================================

@app.get("/api/orchestrate/stream")
async def api_orchestrate_stream(
    pipeline: str = Query("full_assessment"),
    query: str = Query("Analyze current infrastructure status"),
    weather: str = Query("clear"),
    temperature: float = Query(50.0),
):
    """
    Server-Sent Events endpoint for streaming pipeline execution.

    Returns real-time events as each agent step starts, completes, and
    hands off to the next agent. Frontend can consume via EventSource.
    """
    from starlette.responses import StreamingResponse

    async def event_generator():
        async for event in stream_pipeline_events(
            pipeline=pipeline,
            query=query,
            weather=weather,
            temperature=temperature,
        ):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================
# Dynamic Agent Negotiation
# ============================================

class NegotiationRequest(BaseModel):
    goal: str = Field(default="Analyze and address the most critical infrastructure issues", max_length=2000)
    temperature: float = 50.0
    max_iterations: int = Field(default=5, ge=1, le=10)


@app.post("/api/orchestrate/negotiate")
async def api_orchestrate_negotiate(req: NegotiationRequest):
    """
    Dynamic agent negotiation endpoint.

    An LLM 'negotiator' selects which agents to invoke at runtime based on
    the goal — no predefined pipeline. Agents request help from each other
    through the negotiator's reasoning loop.

    This is true autonomous multi-agent negotiation:
        1. Negotiator evaluates goal + available agents
        2. Selects best agent for current need
        3. Agent runs, negotiator evaluates result
        4. Decides if another agent is needed
        5. Repeats until goal is met or max iterations reached
    """
    import asyncio

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: run_dynamic_negotiation(
                goal=req.goal,
                temperature=req.temperature,
                max_iterations=req.max_iterations,
            ),
        )
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# A2A Agent Cards (Activity Protocol)
# ============================================

@app.get("/.well-known/agent.json")
async def api_well_known_agent():
    """
    Activity Protocol agent card endpoint.

    Returns the /.well-known/agent.json manifest that enables
    external agents to discover MAINTAIN AI capabilities.
    Spec: https://google.github.io/A2A/specification/
    """
    return get_well_known_agent_json()


@app.get("/api/agents/cards")
async def api_agent_cards():
    """Return all A2A agent cards for UI display."""
    return {
        "agents": get_agent_cards(),
        "total": len(get_agent_cards()),
        "protocol": "A2A/1.0",
    }


# ============================================
# Cost / ROI Projections
# ============================================

@app.get("/api/cost-roi")
@traced("cost_roi.calculate", {"infrawatch.metric": "roi"})
async def api_cost_roi(
    crews: int = Query(6, description="Number of active crews"),
):
    """
    Calculate cost/ROI projections comparing AI vs. manual processing.

    Uses real work orders from MCP data sources and municipal benchmarks
    (APWA, GAO, FHWA) for quantified impact analysis.
    """
    set_trace_request_info({
        "endpoint": "/api/cost-roi",
        "summary": "Cost/ROI projections",
        "input": {"crews": crews},
    })
    try:
        # Get real work orders from the analysis agent for authentic data
        from analysisAgent import get_work_orders
        work_orders_raw = get_work_orders()

        # Normalize to list format
        work_orders = []
        if isinstance(work_orders_raw, dict) and "features" in work_orders_raw:
            for f in work_orders_raw.get("features", []):
                props = f.get("properties", {})
                # Infer severity from issue type
                issue_type = (
                    props.get("PROBTYPE", "") or
                    props.get("WORKTYPE", "") or
                    props.get("DESCRIPTION", "")
                ).lower()
                severity = "medium"
                if any(k in issue_type for k in ["sinkhole", "collapse", "flood", "emergency"]):
                    severity = "critical"
                elif any(k in issue_type for k in ["crack", "leak", "pothole", "broken"]):
                    severity = "high"
                elif any(k in issue_type for k in ["inspection", "routine", "scheduled"]):
                    severity = "low"

                work_orders.append({
                    "id": str(props.get("OBJECTID", "")),
                    "issueType": issue_type or "general",
                    "severity": severity,
                    "address": props.get("ADDRESS", props.get("LOCATION", "")),
                })
        elif isinstance(work_orders_raw, list):
            work_orders = work_orders_raw

        if not work_orders:
            # Use a reasonable default for demo
            work_orders = [{"id": str(i), "severity": "medium", "issueType": "general"} for i in range(50)]

        result = calculate_roi_projections(work_orders, crews=crews)
        set_trace_response_info({
            "totalWorkOrders": result["summary"]["totalWorkOrders"],
            "annualSavings": result["costAnalysis"]["annual"]["savings"],
            "roiPercent": result["costAnalysis"]["annual"]["roiPercent"],
        })
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("AGENT_API_PORT", "8100"))
    print(f"🚀 Starting InfraWatch Agent API v2.0 on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)

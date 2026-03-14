"""
MAINTAIN AI — API Endpoint Tests (httpx + FastAPI TestClient)

Tests the read-only/status endpoints that don't require live LLM calls.
Uses httpx.AsyncClient with FastAPI's ASGITransport for in-process testing.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from starlette.testclient import TestClient

# Must import after adding path
from api_server import app


# ============================================
# Helpers — Starlette TestClient wraps the ASGI app
# ============================================

@pytest.fixture
def client():
    """Synchronous test client for the FastAPI app."""
    return TestClient(app, raise_server_exceptions=False)


# ============================================
# Health Endpoint
# ============================================


class TestHealthEndpoint:
    """Test GET /health."""

    def test_health_returns_200(self, client):
        r = client.get("/health")
        assert r.status_code == 200

    def test_health_status_ok(self, client):
        r = client.get("/health")
        data = r.json()
        assert data["status"] == "ok"

    def test_health_version(self, client):
        r = client.get("/health")
        data = r.json()
        assert data["version"] == "3.1.0"

    def test_health_has_agents_available(self, client):
        r = client.get("/health")
        data = r.json()
        assert "agents_available" in data

    def test_health_has_storage_section(self, client):
        r = client.get("/health")
        data = r.json()
        assert "storage" in data
        assert "connected" in data["storage"]

    def test_health_has_timestamp(self, client):
        r = client.get("/health")
        data = r.json()
        assert "timestamp" in data


# ============================================
# Model Router Endpoints
# ============================================


class TestModelRouterEndpoints:
    """Test model router status and route lookup endpoints."""

    def test_model_router_status(self, client):
        r = client.get("/api/model-router/status")
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert data["total_models"] == 5
        assert data["total_routes"] == 9

    def test_model_router_route_analysis(self, client):
        r = client.get("/api/model-router/route/analysis")
        assert r.status_code == 200
        data = r.json()
        assert data["model"] == "gpt-4.1"
        assert data["tier"] == "premier"

    def test_model_router_route_dispatch(self, client):
        r = client.get("/api/model-router/route/dispatch")
        assert r.status_code == 200
        data = r.json()
        assert data["model"] == "gpt-4.1-mini"

    def test_model_router_route_unknown(self, client):
        r = client.get("/api/model-router/route/unknown_agent")
        assert r.status_code == 200
        data = r.json()
        # Should fall back to gpt-4.1-mini
        assert data["model"] == "gpt-4.1-mini"


# ============================================
# RAG Endpoints
# ============================================


class TestRAGEndpoints:
    """Test RAG status and search endpoints."""

    def test_rag_status(self, client):
        r = client.get("/api/rag/status")
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert data["knowledge_base"]["total_documents"] >= 10

    def test_rag_search(self, client):
        r = client.get("/api/rag/search", params={"q": "pothole repair", "top_k": 3})
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert isinstance(data["results"], list)


# ============================================
# A2A Orchestrator Endpoints
# ============================================


class TestOrchestratorEndpoints:
    """Test orchestrator status and pipeline list endpoints."""

    def test_orchestrator_status(self, client):
        r = client.get("/api/orchestrate/status")
        assert r.status_code == 200
        data = r.json()
        assert data["enabled"] is True
        assert data["total_pipelines"] == 7
        assert "A2A" in data["protocol"]

    def test_orchestrator_pipelines(self, client):
        r = client.get("/api/orchestrate/pipelines")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 7
        assert "full_assessment" in data["pipelines"]
        assert "triage" in data["pipelines"]
        assert "investigate" in data["pipelines"]


# ============================================
# Telemetry / Traces Endpoints
# ============================================


class TestTelemetryEndpoints:
    """Test trace/telemetry endpoints."""

    def test_traces_endpoint(self, client):
        r = client.get("/api/traces")
        assert r.status_code == 200

    def test_telemetry_endpoint(self, client):
        r = client.get("/api/telemetry")
        assert r.status_code == 200


# ============================================
# ML Status Endpoint
# ============================================


class TestMLEndpoints:
    """Test ML service status endpoint."""

    def test_ml_status(self, client):
        r = client.get("/api/ml/status")
        assert r.status_code == 200
        data = r.json()
        assert "available_models" in data or "models" in data or "status" in data

"""
MAINTAIN AI — Model Router Unit Tests

Tests routing decisions, model catalog completeness, tier classification,
and the route() function behavior including overrides.
Does NOT call the live Foundry API (no network required).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from model_router import (
    MODEL_CATALOG,
    AGENT_MODEL_ROUTES,
    ModelProfile,
    RouteDecision,
    route,
    get_router_status,
    FOUNDRY_ENDPOINT,
)


# ============================================
# Model Catalog Tests
# ============================================


class TestModelCatalog:
    """Verify the model catalog is complete and well-formed."""

    def test_catalog_has_five_models(self):
        assert len(MODEL_CATALOG) == 5

    def test_catalog_model_ids(self):
        expected = {"gpt-4.1", "gpt-4.1-mini", "gpt-4o", "Phi-4", "Phi-4-reasoning"}
        assert set(MODEL_CATALOG.keys()) == expected

    def test_all_models_have_required_fields(self):
        for model_id, profile in MODEL_CATALOG.items():
            assert isinstance(profile, ModelProfile), f"{model_id}: not a ModelProfile"
            assert profile.model_id == model_id
            assert profile.display_name, f"{model_id}: missing display_name"
            assert profile.provider in ("openai", "microsoft"), f"{model_id}: bad provider"
            assert profile.tier in ("premier", "standard", "lightweight"), f"{model_id}: bad tier"
            assert profile.cost_per_1k_input > 0, f"{model_id}: invalid cost_per_1k_input"
            assert profile.cost_per_1k_output > 0, f"{model_id}: invalid cost_per_1k_output"
            assert profile.max_context > 0, f"{model_id}: invalid max_context"
            assert len(profile.strengths) >= 1, f"{model_id}: no strengths listed"

    def test_premier_models(self):
        premier = [m for m, p in MODEL_CATALOG.items() if p.tier == "premier"]
        assert "gpt-4.1" in premier
        assert "gpt-4o" in premier

    def test_lightweight_model(self):
        lightweight = [m for m, p in MODEL_CATALOG.items() if p.tier == "lightweight"]
        assert "Phi-4" in lightweight

    def test_phi4_reasoning_has_reasoning_traces(self):
        assert MODEL_CATALOG["Phi-4-reasoning"].supports_reasoning_traces is True
        assert MODEL_CATALOG["Phi-4"].supports_reasoning_traces is False

    def test_phi4_no_json_mode(self):
        assert MODEL_CATALOG["Phi-4"].supports_json_mode is False
        assert MODEL_CATALOG["Phi-4-reasoning"].supports_json_mode is False

    def test_gpt_models_support_json_and_tools(self):
        for mid in ("gpt-4.1", "gpt-4.1-mini", "gpt-4o"):
            assert MODEL_CATALOG[mid].supports_json_mode is True
            assert MODEL_CATALOG[mid].supports_tools is True


# ============================================
# Routing Table Tests
# ============================================


class TestRoutingTable:
    """Verify the agent → model routing table."""

    EXPECTED_ROUTES = {
        "analysis": "gpt-4.1",
        "prioritization": "gpt-4.1-mini",
        "crew_estimation": "Phi-4",
        "dispatch": "gpt-4.1-mini",
        "report": "gpt-4.1",
        "nlp_dashboard": "gpt-4o",
        "chat": "gpt-4.1-mini",
        "content_triage": "Phi-4",
        "rag": "gpt-4.1-mini",
    }

    def test_nine_routes_defined(self):
        assert len(AGENT_MODEL_ROUTES) == 9

    def test_all_routes_point_to_valid_models(self):
        for agent, model in AGENT_MODEL_ROUTES.items():
            assert model in MODEL_CATALOG, f"Route {agent} → {model} not in catalog"

    def test_expected_route_assignments(self):
        for agent, expected_model in self.EXPECTED_ROUTES.items():
            assert AGENT_MODEL_ROUTES[agent] == expected_model, (
                f"Expected {agent} → {expected_model}, got {AGENT_MODEL_ROUTES[agent]}"
            )


# ============================================
# route() Function Tests
# ============================================


class TestRouteFunction:
    """Test the route() function logic."""

    def test_route_returns_route_decision(self):
        result = route("analysis")
        assert isinstance(result, RouteDecision)

    def test_route_analysis_uses_gpt41(self):
        result = route("analysis")
        assert result.model_id == "gpt-4.1"
        assert result.profile.tier == "premier"
        assert result.override is False

    def test_route_dispatch_uses_mini(self):
        result = route("dispatch")
        assert result.model_id == "gpt-4.1-mini"
        assert result.profile.tier == "standard"

    def test_route_nlp_dashboard_uses_gpt4o(self):
        result = route("nlp_dashboard")
        assert result.model_id == "gpt-4o"

    def test_route_crew_estimation_uses_phi4(self):
        result = route("crew_estimation")
        assert result.model_id == "Phi-4"
        assert result.profile.tier == "lightweight"

    def test_route_unknown_agent_defaults_to_mini(self):
        result = route("nonexistent_agent")
        assert result.model_id == "gpt-4.1-mini"

    def test_route_override_model(self):
        result = route("analysis", override_model="Phi-4")
        assert result.model_id == "Phi-4"
        assert result.override is True

    def test_route_override_invalid_model_ignored(self):
        result = route("analysis", override_model="nonexistent-model")
        # Should fall back to default routing
        assert result.model_id == "gpt-4.1"
        assert result.override is False

    def test_route_includes_reason(self):
        result = route("analysis")
        assert result.reason
        assert isinstance(result.reason, str)
        assert len(result.reason) > 10


# ============================================
# Router Status Tests
# ============================================


class TestRouterStatus:
    """Test get_router_status() output structure."""

    def test_status_has_required_keys(self):
        status = get_router_status()
        assert "enabled" in status
        assert "models" in status
        assert "routes" in status
        assert "total_models" in status
        assert "total_routes" in status

    def test_status_enabled(self):
        status = get_router_status()
        assert status["enabled"] is True

    def test_status_counts(self):
        status = get_router_status()
        assert status["total_models"] == 5
        assert status["total_routes"] == 9

    def test_status_endpoint_includes_models(self):
        status = get_router_status()
        endpoint = status.get("endpoint", "")
        assert endpoint.endswith("/models") or endpoint == ""


# ============================================
# Foundry Endpoint Configuration
# ============================================


class TestEndpointConfig:
    """Test that the Foundry endpoint is configured correctly."""

    def test_endpoint_has_models_suffix(self):
        if FOUNDRY_ENDPOINT:
            assert FOUNDRY_ENDPOINT.endswith("/models")

    def test_endpoint_no_project_path(self):
        if FOUNDRY_ENDPOINT:
            assert "/api/projects" not in FOUNDRY_ENDPOINT

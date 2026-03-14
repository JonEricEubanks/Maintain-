"""
MAINTAIN AI — A2A Orchestrator Unit Tests

Tests orchestrator pipeline definitions, context management, helper
functions, and the get_orchestrator_status() output. Does NOT invoke 
live agent calls (no network required).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agent_orchestrator import (
    AgentContext,
    AgentMessage,
    PIPELINES,
    _handoff,
    _infer_issue_type,
    _infer_severity,
    _build_pipeline_result,
    get_orchestrator_status,
)
from dataclasses import asdict


# ============================================
# AgentContext Tests
# ============================================


class TestAgentContext:
    """Verify the shared A2A state dataclass."""

    def test_context_creation(self):
        ctx = AgentContext(pipeline_id="test-1", pipeline_name="triage")
        assert ctx.pipeline_id == "test-1"
        assert ctx.pipeline_name == "triage"

    def test_context_defaults(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        assert ctx.weather == "clear"
        assert ctx.temperature == 50.0
        assert ctx.query == "Analyze current infrastructure status"
        assert ctx.messages == []
        assert ctx.steps == []
        assert ctx.errors == []
        assert ctx.total_tokens == 0

    def test_context_results_initially_none(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        assert ctx.analysis_result is None
        assert ctx.prioritization_result is None
        assert ctx.crew_result is None
        assert ctx.dispatch_result is None
        assert ctx.rag_result is None

    def test_context_accepts_custom_params(self):
        ctx = AgentContext(
            pipeline_id="t",
            pipeline_name="custom",
            weather="rain",
            temperature=35.0,
            query="Check roads after storm",
        )
        assert ctx.weather == "rain"
        assert ctx.temperature == 35.0
        assert ctx.query == "Check roads after storm"


# ============================================
# AgentMessage Tests
# ============================================


class TestAgentMessage:
    """Test the A2A message dataclass."""

    def test_message_creation(self):
        msg = AgentMessage(
            from_agent="analysis",
            to_agent="prioritization",
            content="Analyzed 5 work orders",
        )
        assert msg.from_agent == "analysis"
        assert msg.to_agent == "prioritization"
        assert msg.content == "Analyzed 5 work orders"
        assert msg.timestamp  # auto-populated

    def test_message_serializes_to_dict(self):
        msg = AgentMessage(
            from_agent="a",
            to_agent="b",
            content="test",
        )
        d = asdict(msg)
        assert isinstance(d, dict)
        assert d["from_agent"] == "a"
        assert d["to_agent"] == "b"

    def test_message_metadata_default(self):
        msg = AgentMessage(from_agent="a", to_agent="b", content="c")
        assert msg.metadata == {}


# ============================================
# Handoff Tests
# ============================================


class TestHandoff:
    """Test the _handoff() helper that records A2A messages."""

    def test_handoff_adds_message_to_context(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        _handoff(ctx, "analysis", "prioritization", "Passing 3 issues")
        assert len(ctx.messages) == 1
        assert ctx.messages[0]["from_agent"] == "analysis"
        assert ctx.messages[0]["to_agent"] == "prioritization"

    def test_multiple_handoffs(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        _handoff(ctx, "analysis", "prioritization", "Step 1")
        _handoff(ctx, "prioritization", "crew_estimation", "Step 2")
        _handoff(ctx, "crew_estimation", "dispatch", "Step 3")
        assert len(ctx.messages) == 3

    def test_handoff_preserves_pipeline_metadata(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="triage")
        _handoff(ctx, "analysis", "prioritization", "test")
        assert ctx.messages[0]["metadata"]["pipeline"] == "triage"


# ============================================
# Pipeline Definitions Tests
# ============================================


class TestPipelineDefinitions:
    """Verify the PIPELINES constant is well-formed."""

    def test_seven_pipelines_defined(self):
        assert len(PIPELINES) == 7

    def test_pipeline_keys(self):
        expected = {
            "full_assessment", "full_assessment_parallel", "triage",
            "deploy_crews", "investigate", "feedback_loop", "dynamic_negotiation",
        }
        assert set(PIPELINES.keys()) == expected

    def test_pipelines_have_required_fields(self):
        for key, p in PIPELINES.items():
            assert "name" in p, f"{key}: missing name"
            assert "description" in p, f"{key}: missing description"
            assert "agents" in p, f"{key}: missing agents"
            assert "estimated_duration" in p, f"{key}: missing estimated_duration"

    def test_full_assessment_has_four_agents(self):
        agents = PIPELINES["full_assessment"]["agents"]
        assert len(agents) == 4
        assert "analysis" in agents
        assert "dispatch" in agents

    def test_triage_has_two_agents(self):
        agents = PIPELINES["triage"]["agents"]
        assert len(agents) == 2

    def test_investigate_includes_rag(self):
        agents = PIPELINES["investigate"]["agents"]
        assert "rag" in agents


# ============================================
# Helper Function Tests
# ============================================


class TestHelperFunctions:
    """Test _infer_issue_type() and _infer_severity()."""

    def test_infer_issue_type_pothole(self):
        assert _infer_issue_type({"ISSUETYPE": "Pothole"}) == "pothole"

    def test_infer_issue_type_from_description(self):
        result = _infer_issue_type({"DESCRIPTION": "Large pothole on Main Street"})
        assert result == "pothole"

    def test_infer_issue_type_sidewalk(self):
        result = _infer_issue_type({"DESCRIPTION": "Cracked sidewalk near park"})
        assert result == "sidewalk"

    def test_infer_issue_type_default(self):
        result = _infer_issue_type({})
        assert result == "pothole"  # default when nothing matches

    def test_infer_severity_critical(self):
        assert _infer_severity({"SEVERITY": "critical"}) == "critical"
        assert _infer_severity({"SEVERITY": "emergency"}) == "critical"

    def test_infer_severity_high(self):
        assert _infer_severity({"SEVERITY": "high"}) == "high"
        assert _infer_severity({"SEVERITY": "urgent"}) == "high"

    def test_infer_severity_low(self):
        assert _infer_severity({"SEVERITY": "low"}) == "low"
        assert _infer_severity({"SEVERITY": "minor"}) == "low"

    def test_infer_severity_default(self):
        assert _infer_severity({}) == "medium"
        assert _infer_severity({"SEVERITY": "moderate"}) == "medium"


# ============================================
# Build Pipeline Result Tests
# ============================================


class TestBuildPipelineResult:
    """Test the _build_pipeline_result() function."""

    def test_empty_context_result(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        result = _build_pipeline_result(ctx)
        assert result["success"] is False  # no completed steps
        assert result["pipeline"]["name"] == "test"
        assert result["metrics"]["total_steps"] == 0

    def test_with_completed_step(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        ctx.steps.append({"step": 1, "name": "Analysis", "agent": "analysis", "status": "completed"})
        result = _build_pipeline_result(ctx)
        assert result["success"] is True
        assert result["metrics"]["completed"] == 1

    def test_with_error_step(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        ctx.steps.append({"step": 1, "name": "Analysis", "agent": "analysis", "status": "error"})
        result = _build_pipeline_result(ctx)
        assert result["success"] is False
        assert result["metrics"]["errors"] == 1

    def test_result_includes_messages(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        _handoff(ctx, "a", "b", "test msg")
        result = _build_pipeline_result(ctx)
        assert len(result["messages"]) == 1

    def test_result_includes_agent_outputs(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        ctx.analysis_result = {"success": True, "output": "Infrastructure looks good"}
        ctx.steps.append({"step": 1, "name": "Analysis", "agent": "analysis", "status": "completed"})
        result = _build_pipeline_result(ctx)
        assert result["agents"]["analysis"] is not None
        assert result["agents"]["prioritization"] is None

    def test_partial_flag(self):
        ctx = AgentContext(pipeline_id="t", pipeline_name="test")
        result = _build_pipeline_result(ctx, partial=True)
        assert result["partial"] is True


# ============================================
# Orchestrator Status Tests
# ============================================


class TestOrchestratorStatus:
    """Test get_orchestrator_status() output."""

    def test_status_has_required_keys(self):
        status = get_orchestrator_status()
        assert "enabled" in status
        assert "protocol" in status
        assert "pipelines" in status
        assert "total_pipelines" in status

    def test_status_enabled(self):
        status = get_orchestrator_status()
        assert status["enabled"] is True

    def test_status_protocol(self):
        status = get_orchestrator_status()
        assert "A2A" in status["protocol"]

    def test_status_pipeline_count(self):
        status = get_orchestrator_status()
        assert status["total_pipelines"] == 7

    def test_status_models_available(self):
        status = get_orchestrator_status()
        assert status["models_available"] == 5

    def test_status_agents_available(self):
        status = get_orchestrator_status()
        assert status["agents_available"] == 9

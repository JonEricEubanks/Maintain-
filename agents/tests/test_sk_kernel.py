"""
MAINTAIN AI — Semantic Kernel Integration Unit Tests

Tests plugin registration, kernel singleton, plugin class structure,
and kernel_function decorators. Verifies all 8 plugins are wired up
correctly without making any Azure/AI calls.
"""

import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sk_kernel import (
    get_kernel,
    AnalysisPlugin,
    PrioritizationPlugin,
    CrewEstimationPlugin,
    DispatchPlugin,
    ReportPlugin,
    NLPDashboardPlugin,
    ContentSafetyPlugin,
    MLPlugin,
)


# ============================================
# Kernel Initialization
# ============================================


class TestGetKernel:
    """Verify the SK Kernel singleton initializes correctly."""

    def test_returns_kernel_instance(self):
        kernel = get_kernel()
        assert kernel is not None

    def test_singleton_same_object(self):
        k1 = get_kernel()
        k2 = get_kernel()
        assert k1 is k2

    def test_has_plugins(self):
        kernel = get_kernel()
        assert kernel.plugins is not None

    def test_eight_plugins_registered(self):
        kernel = get_kernel()
        plugin_names = list(kernel.plugins.keys()) if hasattr(kernel.plugins, 'keys') else [p for p in kernel.plugins]
        assert len(plugin_names) >= 8

    def test_expected_plugin_names(self):
        kernel = get_kernel()
        expected = {
            "analysis", "prioritization", "crew_estimation",
            "dispatch", "report", "nlp_dashboard",
            "content_safety", "ml",
        }
        plugin_names = set(kernel.plugins.keys()) if hasattr(kernel.plugins, 'keys') else set(p for p in kernel.plugins)
        assert expected.issubset(plugin_names)


# ============================================
# Plugin Classes — Instantiation
# ============================================


class TestPluginInstantiation:
    """Verify each plugin class can be instantiated."""

    def test_analysis_plugin(self):
        p = AnalysisPlugin()
        assert p is not None

    def test_prioritization_plugin(self):
        p = PrioritizationPlugin()
        assert p is not None

    def test_crew_estimation_plugin(self):
        p = CrewEstimationPlugin()
        assert p is not None

    def test_dispatch_plugin(self):
        p = DispatchPlugin()
        assert p is not None

    def test_report_plugin(self):
        p = ReportPlugin()
        assert p is not None

    def test_nlp_dashboard_plugin(self):
        p = NLPDashboardPlugin()
        assert p is not None

    def test_content_safety_plugin(self):
        p = ContentSafetyPlugin()
        assert p is not None

    def test_ml_plugin(self):
        p = MLPlugin()
        assert p is not None


# ============================================
# Plugin Methods Exist
# ============================================


class TestPluginMethods:
    """Verify each plugin exposes the expected kernel function method."""

    def test_analysis_has_analyze(self):
        assert callable(getattr(AnalysisPlugin, "analyze_infrastructure", None))

    def test_prioritization_has_prioritize(self):
        assert callable(getattr(PrioritizationPlugin, "prioritize_work_orders", None))

    def test_crew_estimation_has_estimate(self):
        assert callable(getattr(CrewEstimationPlugin, "estimate_crews", None))

    def test_dispatch_has_optimize(self):
        assert callable(getattr(DispatchPlugin, "optimize_dispatch", None))

    def test_report_has_generate(self):
        assert callable(getattr(ReportPlugin, "generate_report", None))

    def test_nlp_dashboard_has_build(self):
        assert callable(getattr(NLPDashboardPlugin, "build_dashboard", None))

    def test_content_safety_has_check(self):
        assert callable(getattr(ContentSafetyPlugin, "check_content_safety", None))

    def test_ml_has_train(self):
        assert callable(getattr(MLPlugin, "train_models", None))

    def test_ml_has_predict_cost(self):
        assert callable(getattr(MLPlugin, "predict_cost", None))

    def test_ml_has_predict_crews(self):
        assert callable(getattr(MLPlugin, "predict_crews", None))

    def test_ml_has_predict_hotspots(self):
        assert callable(getattr(MLPlugin, "predict_hotspots", None))


# ============================================
# Content Safety Plugin — Offline Execution
# ============================================


class TestContentSafetyPluginExecution:
    """Test the ContentSafetyPlugin wrapper returns valid JSON."""

    def test_returns_json_string(self):
        plugin = ContentSafetyPlugin()
        result = plugin.check_content_safety(text="Dispatch crew to fix pothole")
        parsed = json.loads(result)
        assert isinstance(parsed, dict)

    def test_safe_result(self):
        plugin = ContentSafetyPlugin()
        result = json.loads(plugin.check_content_safety(text="Routine maintenance"))
        assert result["safe"] is True

    def test_has_analysis_available_key(self):
        plugin = ContentSafetyPlugin()
        result = json.loads(plugin.check_content_safety(text="Test text"))
        assert "analysis_available" in result


# ============================================
# Prioritization Plugin — Offline Execution
# ============================================


class TestPrioritizationPluginExecution:
    """Test the PrioritizationPlugin wrapper returns valid JSON."""

    def test_empty_orders_returns_json(self):
        plugin = PrioritizationPlugin()
        result = plugin.prioritize_work_orders(work_orders_json="[]", temperature=50.0)
        parsed = json.loads(result)
        assert isinstance(parsed, dict)
        assert parsed.get("success") is True

    def test_with_sample_orders(self):
        orders = json.dumps([
            {"id": "wo-1", "severity": "high", "issueType": "pothole",
             "daysOpen": 5, "nearSchool": True},
        ])
        plugin = PrioritizationPlugin()
        result = json.loads(plugin.prioritize_work_orders(
            work_orders_json=orders, temperature=45.0,
        ))
        assert result.get("success") is True
        assert "output" in result


# ============================================
# Crew Estimation Plugin — Offline Execution
# ============================================


class TestCrewEstimationPluginExecution:
    """Test the CrewEstimationPlugin wrapper returns valid JSON."""

    def test_empty_orders(self):
        plugin = CrewEstimationPlugin()
        result = json.loads(plugin.estimate_crews(work_orders_json="[]"))
        assert isinstance(result, dict)
        assert result.get("success") is True

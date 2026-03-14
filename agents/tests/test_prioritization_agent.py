"""
MAINTAIN AI — Prioritization Agent Unit Tests

Tests the priority scoring formula, tier classification, factor breakdowns,
work order sorting, and edge cases. Pure logic — no network calls.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prioritizationAgent import (
    calculate_priority_score,
    prioritize_work_orders,
    run_prioritization,
    PRIORITIZATION_TOOLS,
    TOOL_HANDLERS,
)


# ============================================
# Priority Score Calculation
# ============================================


class TestCalculatePriorityScore:
    """Verify the multi-factor priority formula."""

    def test_critical_severity_base_score(self):
        result = calculate_priority_score("critical", "pothole", 0, False)
        assert result["factors"]["severity_base"] == 100

    def test_high_severity_base_score(self):
        result = calculate_priority_score("high", "pothole", 0, False)
        assert result["factors"]["severity_base"] == 75

    def test_medium_severity_base_score(self):
        result = calculate_priority_score("medium", "pothole", 0, False)
        assert result["factors"]["severity_base"] == 50

    def test_low_severity_base_score(self):
        result = calculate_priority_score("low", "pothole", 0, False)
        assert result["factors"]["severity_base"] == 25

    def test_unknown_severity_defaults_to_50(self):
        result = calculate_priority_score("unknown", "pothole", 0, False)
        assert result["factors"]["severity_base"] == 50

    def test_school_proximity_adds_30(self):
        near = calculate_priority_score("medium", "pothole", 0, True)
        far = calculate_priority_score("medium", "pothole", 0, False)
        assert near["factors"]["school_proximity"] == 30
        assert far["factors"]["school_proximity"] == 0
        assert near["score"] > far["score"]

    def test_age_factor_increases_with_days(self):
        day0 = calculate_priority_score("medium", "pothole", 0, False)
        day10 = calculate_priority_score("medium", "pothole", 10, False)
        day20 = calculate_priority_score("medium", "pothole", 20, False)
        assert day0["factors"]["age_factor"] == 0
        assert day10["factors"]["age_factor"] == 20
        assert day20["factors"]["age_factor"] == 40
        assert day20["score"] > day10["score"] > day0["score"]

    def test_age_factor_caps_at_40(self):
        result = calculate_priority_score("medium", "pothole", 100, False)
        assert result["factors"]["age_factor"] == 40

    def test_pothole_type_modifier(self):
        result = calculate_priority_score("medium", "pothole", 0, False)
        assert result["factors"]["type_modifier"] == 1.2

    def test_sidewalk_type_modifier(self):
        result = calculate_priority_score("medium", "sidewalk", 0, False)
        assert result["factors"]["type_modifier"] == 1.0

    def test_concrete_type_modifier(self):
        result = calculate_priority_score("medium", "concrete", 0, False)
        assert result["factors"]["type_modifier"] == 0.9

    def test_unknown_type_defaults_to_1(self):
        result = calculate_priority_score("medium", "drainage", 0, False)
        assert result["factors"]["type_modifier"] == 1.0

    def test_high_traffic_multiplier(self):
        result = calculate_priority_score("medium", "pothole", 0, False, traffic_level="high")
        assert result["factors"]["traffic_multiplier"] == 1.3

    def test_low_traffic_multiplier(self):
        result = calculate_priority_score("medium", "pothole", 0, False, traffic_level="low")
        assert result["factors"]["traffic_multiplier"] == 0.8

    def test_freezing_adds_weather_risk_20(self):
        result = calculate_priority_score("medium", "pothole", 0, False, temperature=25.0)
        assert result["factors"]["weather_risk"] == 20

    def test_cold_adds_weather_risk_10(self):
        result = calculate_priority_score("medium", "pothole", 0, False, temperature=35.0)
        assert result["factors"]["weather_risk"] == 10

    def test_warm_no_weather_risk(self):
        result = calculate_priority_score("medium", "pothole", 0, False, temperature=70.0)
        assert result["factors"]["weather_risk"] == 0

    def test_score_capped_at_200(self):
        # Critical + school + 20 days + pothole + high traffic + freezing
        result = calculate_priority_score(
            "critical", "pothole", 20, True, traffic_level="high", temperature=20.0
        )
        assert result["score"] <= 200


# ============================================
# Priority Tier Classification
# ============================================


class TestPriorityTiers:
    """Verify tier assignment thresholds."""

    def test_critical_tier_above_150(self):
        # Critical + school + age + pothole + high traffic => CRITICAL tier
        result = calculate_priority_score(
            "critical", "pothole", 10, True, traffic_level="high", temperature=30.0
        )
        assert result["priority_tier"] == "CRITICAL"
        assert result["score"] >= 150

    def test_high_tier_100_to_149(self):
        result = calculate_priority_score("high", "pothole", 5, False, temperature=50.0)
        assert result["priority_tier"] == "HIGH"
        assert 100 <= result["score"] < 150

    def test_medium_tier_60_to_99(self):
        result = calculate_priority_score("medium", "sidewalk", 5, False, temperature=50.0)
        assert result["priority_tier"] == "MEDIUM"
        assert 60 <= result["score"] < 100

    def test_low_tier_below_60(self):
        result = calculate_priority_score("low", "concrete", 0, False, traffic_level="low", temperature=70.0)
        assert result["priority_tier"] == "LOW"
        assert result["score"] < 60

    def test_critical_near_school_freezing_is_critical_tier(self):
        result = calculate_priority_score("critical", "pothole", 15, True, temperature=20.0)
        assert result["priority_tier"] == "CRITICAL"


# ============================================
# Return Structure
# ============================================


class TestScoreReturnStructure:
    """Verify the score result dict has all required keys."""

    def test_has_score_key(self):
        result = calculate_priority_score("medium", "pothole", 0, False)
        assert "score" in result
        assert isinstance(result["score"], (int, float))

    def test_has_factors_dict(self):
        result = calculate_priority_score("medium", "pothole", 0, False)
        factors = result["factors"]
        expected_keys = {"severity_base", "school_proximity", "age_factor",
                         "traffic_multiplier", "weather_risk", "type_modifier"}
        assert expected_keys == set(factors.keys())

    def test_has_priority_tier(self):
        result = calculate_priority_score("medium", "pothole", 0, False)
        assert result["priority_tier"] in ("CRITICAL", "HIGH", "MEDIUM", "LOW")


# ============================================
# Work Order List Prioritization
# ============================================


class TestPrioritizeWorkOrders:
    """Verify sorting and annotation of work order lists."""

    def test_empty_list_returns_empty(self):
        result = prioritize_work_orders([], temperature=50.0)
        assert result == []

    def test_orders_sorted_by_score_descending(self):
        orders = [
            {"id": "1", "severity": "low", "issueType": "concrete", "createdAt": "2026-03-05T10:00:00"},
            {"id": "2", "severity": "critical", "issueType": "pothole", "nearSchool": True, "createdAt": "2026-01-01T10:00:00"},
            {"id": "3", "severity": "medium", "issueType": "sidewalk", "createdAt": "2026-03-01T10:00:00"},
        ]
        result = prioritize_work_orders(orders, temperature=50.0)
        scores = [r["priorityScore"] for r in result]
        assert scores == sorted(scores, reverse=True)
        assert result[0]["id"] == "2"  # Critical near school should be first

    def test_annotates_with_priority_fields(self):
        orders = [{"id": "1", "severity": "medium", "issueType": "pothole", "createdAt": "2026-03-01T10:00:00"}]
        result = prioritize_work_orders(orders)
        assert "priorityScore" in result[0]
        assert "priorityTier" in result[0]
        assert "priorityFactors" in result[0]

    def test_preserves_original_fields(self):
        orders = [{"id": "WO-99", "severity": "high", "issueType": "sidewalk",
                    "address": "456 Oak Ave", "createdAt": "2026-03-01T10:00:00"}]
        result = prioritize_work_orders(orders)
        assert result[0]["id"] == "WO-99"
        assert result[0]["address"] == "456 Oak Ave"

    def test_temperature_affects_ordering(self):
        orders = [
            {"id": "1", "severity": "high", "issueType": "pothole", "createdAt": "2026-03-01T10:00:00"},
            {"id": "2", "severity": "high", "issueType": "pothole", "createdAt": "2026-03-01T10:00:00"},
        ]
        warm = prioritize_work_orders(orders, temperature=70.0)
        cold = prioritize_work_orders(orders, temperature=25.0)
        # Both should have higher scores in cold weather
        assert cold[0]["priorityScore"] > warm[0]["priorityScore"]


# ============================================
# run_prioritization() Integration
# ============================================


class TestRunPrioritization:
    """Verify the full agent entry point."""

    def test_returns_success(self):
        orders = [{"id": "1", "severity": "medium", "issueType": "pothole", "createdAt": "2026-03-01T10:00:00"}]
        result = run_prioritization(orders, temperature=50.0)
        assert result["success"] is True

    def test_returns_tier_counts(self):
        orders = [
            {"id": "1", "severity": "critical", "issueType": "pothole", "nearSchool": True, "createdAt": "2026-01-01T10:00:00"},
            {"id": "2", "severity": "low", "issueType": "concrete", "createdAt": "2026-03-05T10:00:00"},
        ]
        result = run_prioritization(orders, temperature=50.0)
        tc = result["tier_counts"]
        assert set(tc.keys()) == {"CRITICAL", "HIGH", "MEDIUM", "LOW"}
        assert sum(tc.values()) == 2

    def test_returns_reasoning_steps(self):
        orders = [{"id": "1", "severity": "medium", "issueType": "pothole", "createdAt": "2026-03-01T10:00:00"}]
        result = run_prioritization(orders)
        assert len(result["reasoning"]) >= 3  # 3 formula steps + optional LLM step(s)
        assert result["reasoning"][0]["step"] == 1

    def test_returns_processing_time(self):
        result = run_prioritization([], temperature=50.0)
        assert "processing_time_ms" in result
        assert result["processing_time_ms"] >= 0

    def test_empty_input_still_succeeds(self):
        result = run_prioritization([], temperature=50.0)
        assert result["success"] is True
        assert result["prioritized_orders"] == []

    def test_output_includes_summary_text(self):
        orders = [{"id": "1", "severity": "critical", "issueType": "pothole", "createdAt": "2026-03-01T10:00:00"}]
        result = run_prioritization(orders, temperature=50.0)
        assert isinstance(result["output"], str)
        assert "1 work order" in result["output"] or "Prioritized" in result["output"]


# ============================================
# Tool Definition Completeness
# ============================================


class TestToolDefinitions:
    """Verify tool definitions match the actual functions."""

    def test_two_tools_defined(self):
        assert len(PRIORITIZATION_TOOLS) == 2

    def test_tool_names(self):
        names = {t["function"]["name"] for t in PRIORITIZATION_TOOLS}
        assert names == {"calculate_priority_score", "prioritize_work_orders"}

    def test_tool_handlers_match_definitions(self):
        defined_names = {t["function"]["name"] for t in PRIORITIZATION_TOOLS}
        assert set(TOOL_HANDLERS.keys()) == defined_names

    def test_handler_callable(self):
        for name, handler in TOOL_HANDLERS.items():
            assert callable(handler), f"Handler for {name} is not callable"

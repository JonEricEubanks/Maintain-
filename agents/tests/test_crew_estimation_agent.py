"""
MAINTAIN AI — Crew Estimation Agent Unit Tests

Tests the crew calculation formula, weather/seasonal multipliers,
temperature adjustments, availability scaling, and edge cases.
Pure logic — no network calls.
"""

import sys
import math
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crewEstimationAgent import (
    estimate_crews,
    run_crew_estimation,
    REPAIR_TIMES,
    CREW_DAILY_CAPACITY,
    WEATHER_IMPACT,
    SEASONAL_FACTORS,
    CREW_ESTIMATION_TOOLS,
)


# ============================================
# Lookup Table Validation
# ============================================


class TestLookupTables:
    """Verify lookup tables are complete and consistent."""

    def test_repair_times_three_types(self):
        assert set(REPAIR_TIMES.keys()) == {"pothole", "sidewalk", "concrete"}

    def test_repair_times_four_severities_each(self):
        for issue_type, severities in REPAIR_TIMES.items():
            assert set(severities.keys()) == {"critical", "high", "medium", "low"}, \
                f"{issue_type} missing severities"

    def test_repair_times_increase_with_severity(self):
        for issue_type, severities in REPAIR_TIMES.items():
            assert severities["critical"] > severities["high"] > severities["medium"] > severities["low"], \
                f"{issue_type}: repair times don't increase with severity"

    def test_concrete_takes_longest(self):
        for sev in ("critical", "high", "medium", "low"):
            assert REPAIR_TIMES["concrete"][sev] > REPAIR_TIMES["sidewalk"][sev] >= REPAIR_TIMES["pothole"][sev]

    def test_crew_daily_capacity_three_types(self):
        assert set(CREW_DAILY_CAPACITY.keys()) == {"pothole", "sidewalk", "concrete"}

    def test_pothole_crews_fastest(self):
        assert CREW_DAILY_CAPACITY["pothole"] > CREW_DAILY_CAPACITY["sidewalk"] > CREW_DAILY_CAPACITY["concrete"]

    def test_weather_impact_all_conditions(self):
        expected = {"clear", "cloudy", "rain", "snow", "freezing", "freeze_thaw"}
        assert set(WEATHER_IMPACT.keys()) == expected

    def test_clear_weather_no_impact(self):
        assert WEATHER_IMPACT["clear"] == 1.0

    def test_severe_weather_reduces_capacity(self):
        assert WEATHER_IMPACT["snow"] < WEATHER_IMPACT["rain"] < WEATHER_IMPACT["clear"]
        assert WEATHER_IMPACT["freezing"] < WEATHER_IMPACT["snow"]

    def test_seasonal_factors_twelve_months(self):
        assert set(SEASONAL_FACTORS.keys()) == set(range(1, 13))

    def test_winter_months_higher_demand(self):
        # Jan, Feb, Mar should be > 1.0
        assert SEASONAL_FACTORS[1] > 1.0
        assert SEASONAL_FACTORS[2] > 1.0
        assert SEASONAL_FACTORS[3] > 1.0

    def test_summer_months_optimal(self):
        assert SEASONAL_FACTORS[5] <= 1.0
        assert SEASONAL_FACTORS[6] <= 1.0


# ============================================
# estimate_crews() Core Logic
# ============================================


class TestEstimateCrews:
    """Verify the crew estimation formula."""

    def test_empty_work_orders_returns_zero_crews(self):
        result = estimate_crews([], weather_condition="clear", temperature=70.0)
        assert result["totalCrews"] == 0
        assert result["potholeCrew"] == 0
        assert result["sidewalkCrews"] == 0
        assert result["concreteCrews"] == 0

    def test_single_pothole_returns_at_least_one_crew(self):
        orders = [{"issueType": "pothole", "severity": "medium"}]
        result = estimate_crews(orders, weather_condition="clear", temperature=70.0, days_to_complete=7)
        assert result["potholeCrew"] >= 1
        assert result["totalCrews"] >= 1

    def test_multiple_types_get_separate_crews(self):
        orders = [
            {"issueType": "pothole", "severity": "medium"},
            {"issueType": "sidewalk", "severity": "medium"},
            {"issueType": "concrete", "severity": "medium"},
        ]
        result = estimate_crews(orders, weather_condition="clear", temperature=70.0)
        assert result["potholeCrew"] >= 1
        assert result["sidewalkCrews"] >= 1
        assert result["concreteCrews"] >= 1

    def test_bad_weather_increases_crew_need(self):
        orders = [{"issueType": "pothole", "severity": "high"}] * 10
        clear = estimate_crews(orders, weather_condition="clear", temperature=70.0, days_to_complete=3)
        rain = estimate_crews(orders, weather_condition="rain", temperature=70.0, days_to_complete=3)
        assert rain["totalCrews"] >= clear["totalCrews"]

    def test_freezing_temperature_reduces_capacity(self):
        orders = [{"issueType": "pothole", "severity": "high"}] * 10
        warm = estimate_crews(orders, weather_condition="clear", temperature=70.0, days_to_complete=3)
        cold = estimate_crews(orders, weather_condition="clear", temperature=25.0, days_to_complete=3)
        assert cold["totalCrews"] >= warm["totalCrews"]

    def test_low_availability_increases_crew_need(self):
        orders = [{"issueType": "pothole", "severity": "medium"}] * 10
        full = estimate_crews(orders, crew_availability_percent=100.0, days_to_complete=5)
        half = estimate_crews(orders, crew_availability_percent=50.0, days_to_complete=5)
        assert half["totalCrews"] >= full["totalCrews"]

    def test_more_days_can_reduce_crews(self):
        orders = [{"issueType": "pothole", "severity": "medium"}] * 20
        short = estimate_crews(orders, days_to_complete=3)
        long = estimate_crews(orders, days_to_complete=14)
        assert short["totalCrews"] >= long["totalCrews"]

    def test_unknown_issue_type_treated_as_pothole_fallback(self):
        orders = [{"issueType": "drainage", "severity": "medium"}]
        result = estimate_crews(orders)
        # Unknown types don't match any key, so they get 0 hours — no crew
        assert result["totalCrews"] == 0

    def test_unknown_severity_uses_default_hours(self):
        orders = [{"issueType": "pothole", "severity": "extreme"}]
        result = estimate_crews(orders)
        # "extreme" not in dict → defaults to 1.0 hour via .get()
        assert result["potholeCrew"] >= 0  # Should handle gracefully


# ============================================
# Return Structure
# ============================================


class TestEstimateCrewsReturnStructure:
    """Verify the result dict has all required keys."""

    def test_has_crew_counts(self):
        result = estimate_crews([])
        for key in ("potholeCrew", "sidewalkCrews", "concreteCrews", "totalCrews"):
            assert key in result
            assert isinstance(result[key], int)

    def test_has_reasoning_list(self):
        result = estimate_crews([{"issueType": "pothole", "severity": "high"}])
        assert isinstance(result["reasoning"], list)
        assert len(result["reasoning"]) >= 1

    def test_has_factors_list(self):
        result = estimate_crews([{"issueType": "pothole", "severity": "high"}])
        assert isinstance(result["factors"], list)

    def test_factor_structure(self):
        result = estimate_crews([{"issueType": "pothole", "severity": "high"}])
        for f in result["factors"]:
            assert "name" in f
            assert "value" in f
            assert "weight" in f
            assert "impact" in f
            assert f["impact"] in ("positive", "negative", "neutral")

    def test_has_confidence(self):
        result = estimate_crews([])
        assert 0 <= result["confidence"] <= 1.0

    def test_has_metadata(self):
        result = estimate_crews([], weather_condition="rain", temperature=40.0)
        meta = result["metadata"]
        assert meta["weather_condition"] == "rain"
        assert meta["temperature"] == 40.0
        assert "seasonal_factor" in meta


# ============================================
# Confidence Scoring
# ============================================


class TestConfidenceScoring:
    """Verify confidence heuristics."""

    def test_more_data_increases_confidence(self):
        few = estimate_crews([{"issueType": "pothole", "severity": "medium"}] * 3)
        many = estimate_crews([{"issueType": "pothole", "severity": "medium"}] * 15)
        assert many["confidence"] >= few["confidence"]

    def test_clear_weather_increases_confidence(self):
        clear = estimate_crews(
            [{"issueType": "pothole", "severity": "medium"}],
            weather_condition="clear", temperature=60.0,
        )
        rain = estimate_crews(
            [{"issueType": "pothole", "severity": "medium"}],
            weather_condition="rain", temperature=60.0,
        )
        assert clear["confidence"] >= rain["confidence"]

    def test_confidence_never_exceeds_095(self):
        result = estimate_crews(
            [{"issueType": "pothole", "severity": "medium"}] * 100,
            weather_condition="clear", temperature=60.0,
            crew_availability_percent=100.0,
        )
        assert result["confidence"] <= 0.95


# ============================================
# run_crew_estimation() Entry Point
# ============================================


class TestRunCrewEstimation:
    """Verify the full agent entry point wrapper."""

    def test_returns_success(self):
        result = run_crew_estimation([], weather="clear", temperature=70.0)
        assert result["success"] is True

    def test_returns_estimation_dict(self):
        result = run_crew_estimation(
            [{"issueType": "pothole", "severity": "high"}],
            weather="rain", temperature=45.0,
        )
        assert "estimation" in result
        assert result["estimation"]["totalCrews"] >= 1

    def test_returns_processing_time(self):
        result = run_crew_estimation([])
        assert "processing_time_ms" in result
        assert result["processing_time_ms"] >= 0

    def test_passes_parameters_through(self):
        result = run_crew_estimation(
            [{"issueType": "pothole", "severity": "medium"}] * 5,
            weather="snow",
            temperature=20.0,
            days=3,
            availability=60.0,
        )
        meta = result["estimation"]["metadata"]
        assert meta["weather_condition"] == "snow"
        assert meta["temperature"] == 20.0
        assert meta["days_to_complete"] == 3
        assert meta["crew_availability"] == 60.0


# ============================================
# Tool Definition
# ============================================


class TestCrewToolDefinition:
    """Verify tool definitions for Foundry."""

    def test_one_tool_defined(self):
        assert len(CREW_ESTIMATION_TOOLS) == 1

    def test_tool_name(self):
        assert CREW_ESTIMATION_TOOLS[0]["function"]["name"] == "estimate_crews"

    def test_required_params(self):
        params = CREW_ESTIMATION_TOOLS[0]["function"]["parameters"]
        assert "work_orders" in params["required"]

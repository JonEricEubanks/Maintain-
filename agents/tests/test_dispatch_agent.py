"""
MAINTAIN AI — Dispatch Agent Unit Tests

Tests haversine distance calculation, crew scoring/selection,
dispatch recommendation generation, repair estimation tables,
confidence factors, and edge cases. Pure logic — no network calls.
"""

import sys
import math
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dispatchAgent import (
    haversine_miles,
    _find_best_crew,
    generate_dispatch_recommendations,
    REPAIR_DURATION,
    REPAIR_COST,
)


# ============================================
# Haversine Distance Calculation
# ============================================


class TestHaversineMiles:
    """Verify the haversine great-circle distance formula."""

    def test_same_point_returns_zero(self):
        assert haversine_miles(42.23, -87.84, 42.23, -87.84) == 0.0

    def test_known_distance_new_york_to_la(self):
        # NYC (40.7128, -74.0060) to LA (34.0522, -118.2437) ≈ 2451 miles
        dist = haversine_miles(40.7128, -74.0060, 34.0522, -118.2437)
        assert 2440 < dist < 2470

    def test_short_distance_lake_forest_area(self):
        # Two points ~1 mile apart in Lake Forest, IL
        dist = haversine_miles(42.236, -87.842, 42.250, -87.842)
        assert 0.5 < dist < 1.5

    def test_symmetry(self):
        d1 = haversine_miles(42.0, -87.0, 43.0, -88.0)
        d2 = haversine_miles(43.0, -88.0, 42.0, -87.0)
        assert abs(d1 - d2) < 0.001

    def test_returns_float(self):
        result = haversine_miles(0.0, 0.0, 1.0, 1.0)
        assert isinstance(result, float)

    def test_equator_one_degree_longitude(self):
        # 1 degree of longitude at equator ≈ 69.17 miles
        dist = haversine_miles(0.0, 0.0, 0.0, 1.0)
        assert 68 < dist < 70

    def test_always_positive(self):
        dist = haversine_miles(42.0, -88.0, 42.0, -87.0)
        assert dist > 0


# ============================================
# Crew Selection Logic
# ============================================


class TestFindBestCrew:
    """Verify _find_best_crew scoring and selection."""

    def _make_crew(self, crew_id="crew-1", specialization="pothole",
                   lat=42.23, lng=-87.84, efficiency=0.85):
        return {
            "id": crew_id,
            "name": f"Crew {crew_id}",
            "specialization": specialization,
            "currentLat": lat,
            "currentLng": lng,
            "efficiencyRating": efficiency,
        }

    def _make_wo(self, issue_type="pothole", lat=42.23, lng=-87.84):
        return {
            "id": "wo-1",
            "issueType": issue_type,
            "latitude": lat,
            "longitude": lng,
        }

    def test_empty_crews_returns_none(self):
        assert _find_best_crew(self._make_wo(), [], {}) is None

    def test_single_crew_returned(self):
        crew = self._make_crew()
        result = _find_best_crew(self._make_wo(), [crew], {"crew-1": 0.0})
        assert result["id"] == "crew-1"

    def test_specialization_match_preferred(self):
        """Matching specialization (+40) should beat general (+20)."""
        pothole_crew = self._make_crew("crew-a", "pothole", 42.23, -87.84, 0.7)
        general_crew = self._make_crew("crew-b", "general", 42.23, -87.84, 0.7)
        wo = self._make_wo("pothole")
        result = _find_best_crew(wo, [general_crew, pothole_crew], {"crew-a": 0, "crew-b": 0})
        assert result["id"] == "crew-a"

    def test_general_specialization_gets_partial_score(self):
        """General crew still scores 20 points for specialization."""
        gen_crew = self._make_crew("crew-g", "general", 42.23, -87.84, 0.7)
        wrong_crew = self._make_crew("crew-w", "sidewalk", 42.23, -87.84, 0.7)
        wo = self._make_wo("pothole")
        # Both at same location, same efficiency — general should win
        result = _find_best_crew(wo, [wrong_crew, gen_crew], {"crew-g": 0, "crew-w": 0})
        assert result["id"] == "crew-g"

    def test_proximity_matters(self):
        """Closer crew gets higher proximity score."""
        near = self._make_crew("crew-near", "pothole", 42.231, -87.841, 0.85)
        far = self._make_crew("crew-far", "pothole", 42.30, -87.90, 0.85)
        wo = self._make_wo("pothole", 42.23, -87.84)
        result = _find_best_crew(wo, [far, near], {"crew-near": 0, "crew-far": 0})
        assert result["id"] == "crew-near"

    def test_high_workload_penalized(self):
        """A crew with 36h load should be penalized vs a crew with 0h load."""
        fresh = self._make_crew("crew-fresh", "pothole", 42.23, -87.84, 0.85)
        tired = self._make_crew("crew-tired", "pothole", 42.23, -87.84, 0.85)
        wo = self._make_wo("pothole")
        result = _find_best_crew(
            wo, [tired, fresh],
            {"crew-fresh": 0.0, "crew-tired": 36.0},
        )
        assert result["id"] == "crew-fresh"

    def test_efficiency_contributes_to_score(self):
        """Higher efficiency rating should contribute more points."""
        efficient = self._make_crew("crew-e", "pothole", 42.23, -87.84, 1.0)
        lazy = self._make_crew("crew-l", "pothole", 42.23, -87.84, 0.1)
        wo = self._make_wo("pothole")
        result = _find_best_crew(wo, [lazy, efficient], {"crew-e": 0, "crew-l": 0})
        assert result["id"] == "crew-e"


# ============================================
# Repair Estimation Tables
# ============================================


class TestRepairTables:
    """Verify lookup tables have expected structure and values."""

    def test_duration_table_has_all_types(self):
        assert set(REPAIR_DURATION.keys()) == {"pothole", "sidewalk", "concrete"}

    def test_cost_table_has_all_types(self):
        assert set(REPAIR_COST.keys()) == {"pothole", "sidewalk", "concrete"}

    def test_each_type_has_all_severities(self):
        expected_sevs = {"critical", "high", "medium", "low"}
        for itype in REPAIR_DURATION:
            assert set(REPAIR_DURATION[itype].keys()) == expected_sevs
            assert set(REPAIR_COST[itype].keys()) == expected_sevs

    def test_critical_costs_more_than_low(self):
        for itype in REPAIR_COST:
            assert REPAIR_COST[itype]["critical"] > REPAIR_COST[itype]["low"]

    def test_critical_takes_longer_than_low(self):
        for itype in REPAIR_DURATION:
            assert REPAIR_DURATION[itype]["critical"] > REPAIR_DURATION[itype]["low"]

    def test_all_durations_positive(self):
        for itype in REPAIR_DURATION:
            for sev in REPAIR_DURATION[itype]:
                assert REPAIR_DURATION[itype][sev] > 0

    def test_all_costs_positive(self):
        for itype in REPAIR_COST:
            for sev in REPAIR_COST[itype]:
                assert REPAIR_COST[itype][sev] > 0


# ============================================
# Dispatch Recommendations Generation
# ============================================


class TestGenerateDispatchRecommendations:
    """Verify the core dispatch recommendation engine."""

    def _make_crews(self):
        return [
            {"id": "crew-alpha", "name": "Alpha", "specialization": "pothole",
             "currentLat": 42.236, "currentLng": -87.842, "efficiencyRating": 0.92},
            {"id": "crew-bravo", "name": "Bravo", "specialization": "sidewalk",
             "currentLat": 42.241, "currentLng": -87.835, "efficiencyRating": 0.88},
        ]

    def _make_work_orders(self, count=3):
        orders = []
        for i in range(count):
            orders.append({
                "id": f"wo-{i+1}",
                "issueType": "pothole",
                "severity": "high",
                "status": "open",
                "priorityScore": 100 - i * 10,
                "latitude": 42.23 + i * 0.005,
                "longitude": -87.84,
                "address": f"{100+i} Main St",
                "nearSchool": i == 0,
                "zone": "north",
            })
        return orders

    def test_empty_work_orders_returns_success(self):
        result = generate_dispatch_recommendations([], self._make_crews())
        assert result["success"] is True
        assert result["recommendations"] == []

    def test_empty_crews_returns_no_recommendations(self):
        result = generate_dispatch_recommendations(self._make_work_orders(), [])
        assert result["success"] is True
        assert result["recommendations"] == []

    def test_basic_dispatch_returns_recommendations(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(), self._make_crews(),
        )
        assert result["success"] is True
        assert len(result["recommendations"]) > 0

    def test_result_has_expected_keys(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(), self._make_crews(),
        )
        assert "summary" in result
        assert "recommendations" in result
        assert "reasoning" in result
        assert "processingTimeMs" in result
        assert "dataFlowNote" in result

    def test_summary_structure(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(), self._make_crews(),
        )
        summary = result["summary"]
        assert "totalRecommendations" in summary
        assert "totalEstimatedCost" in summary
        assert "totalEstimatedHours" in summary
        assert "crewUtilization" in summary
        assert "weather" in summary
        assert "openWorkOrders" in summary

    def test_recommendation_has_confidence_factors(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(1), self._make_crews(),
        )
        rec = result["recommendations"][0]
        assert "factors" in rec
        factors = rec["factors"]
        for key in ["proximity", "specialization", "workload", "urgency", "weather"]:
            assert key in factors
            assert 0.0 <= factors[key] <= 1.0

    def test_confidence_between_zero_and_one(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(), self._make_crews(),
        )
        for rec in result["recommendations"]:
            assert 0.0 <= rec["confidence"] <= 1.0

    def test_recommendations_sorted_by_confidence(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(5), self._make_crews(),
        )
        recs = result["recommendations"]
        confidences = [r["confidence"] for r in recs]
        assert confidences == sorted(confidences, reverse=True)

    def test_closed_work_orders_excluded(self):
        orders = self._make_work_orders()
        orders[0]["status"] = "closed"
        result = generate_dispatch_recommendations(orders, self._make_crews())
        wo_ids = [r["workOrderId"] for r in result["recommendations"]]
        assert "wo-1" not in wo_ids

    def test_max_15_recommendations(self):
        orders = self._make_work_orders(20)
        result = generate_dispatch_recommendations(orders, self._make_crews())
        assert len(result["recommendations"]) <= 15

    def test_weather_affects_weather_factor(self):
        orders = self._make_work_orders(1)
        clear_result = generate_dispatch_recommendations(orders, self._make_crews(), "clear")
        rain_result = generate_dispatch_recommendations(orders, self._make_crews(), "rain")
        clear_weather = clear_result["recommendations"][0]["factors"]["weather"]
        rain_weather = rain_result["recommendations"][0]["factors"]["weather"]
        assert clear_weather > rain_weather

    def test_total_cost_sums_correctly(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(), self._make_crews(),
        )
        expected = sum(r["estimatedCost"] for r in result["recommendations"])
        assert result["summary"]["totalEstimatedCost"] == expected

    def test_total_hours_sums_correctly(self):
        result = generate_dispatch_recommendations(
            self._make_work_orders(), self._make_crews(),
        )
        expected = round(sum(r["estimatedDuration"] for r in result["recommendations"]), 1)
        assert result["summary"]["totalEstimatedHours"] == expected

    def test_utilization_capped_at_100(self):
        # Many work orders with few crews should cap utilization
        orders = self._make_work_orders(15)
        for o in orders:
            o["severity"] = "critical"  # longest duration
            o["issueType"] = "concrete"  # 8h each
        crews = [self._make_crews()[0]]  # Single crew
        result = generate_dispatch_recommendations(orders, crews)
        assert result["summary"]["crewUtilization"] <= 100.0


# ============================================
# Recommendation Detail Structure
# ============================================


class TestRecommendationStructure:
    """Verify each recommendation has the required fields."""

    def test_recommendation_fields(self):
        crews = [
            {"id": "crew-1", "name": "Alpha", "specialization": "pothole",
             "currentLat": 42.236, "currentLng": -87.842, "efficiencyRating": 0.9},
        ]
        orders = [{
            "id": "wo-1", "issueType": "pothole", "severity": "high",
            "status": "open", "priorityScore": 90,
            "latitude": 42.23, "longitude": -87.84,
            "address": "123 Main St", "nearSchool": True, "zone": "north",
        }]
        result = generate_dispatch_recommendations(orders, crews)
        rec = result["recommendations"][0]
        expected_keys = {
            "workOrderId", "recommendedCrewId", "crewName", "priority",
            "issueType", "address", "latitude", "longitude",
            "estimatedDuration", "estimatedCost", "confidence",
            "reasoning", "factors", "nearSchool", "zone",
        }
        assert expected_keys.issubset(set(rec.keys()))

    def test_reasoning_steps_present(self):
        crews = [
            {"id": "crew-1", "name": "Alpha", "specialization": "pothole",
             "currentLat": 42.236, "currentLng": -87.842, "efficiencyRating": 0.9},
        ]
        orders = [{
            "id": "wo-1", "issueType": "pothole", "severity": "high",
            "status": "open", "priorityScore": 90,
            "latitude": 42.23, "longitude": -87.84,
            "address": "123 Main St",
        }]
        result = generate_dispatch_recommendations(orders, crews)
        rec = result["recommendations"][0]
        assert len(rec["reasoning"]) == 4
        for step in rec["reasoning"]:
            assert "step" in step
            assert "description" in step
            assert "confidence" in step
            assert "dataSource" in step

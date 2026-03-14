"""
MAINTAIN AI — Content Safety Unit Tests

Tests the Azure Content Safety integration in offline mode (no API key).
Uses unittest.mock.patch to override module-level credentials so we
always test the "not configured" code path.
Pure logic — no Azure calls.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import contentSafety
from contentSafety import (
    analyze_text,
    validate_dispatch_recommendation,
    validate_dispatch_plan,
)


# Helper: patch credentials to empty so analyze_text hits the offline path
def _offline(fn):
    """Decorator that forces the Content Safety module into offline mode."""
    def wrapper(*args, **kwargs):
        with patch.object(contentSafety, "CONTENT_SAFETY_ENDPOINT", ""), \
             patch.object(contentSafety, "CONTENT_SAFETY_KEY", ""):
            return fn(*args, **kwargs)
    return wrapper


# ============================================
# analyze_text — Offline Path
# ============================================


class TestAnalyzeTextOffline:
    """When credentials are empty, analyze_text should pass-through safely."""

    @_offline
    def test_returns_safe_true(self):
        result = analyze_text("Some normal dispatch text")
        assert result["safe"] is True

    @_offline
    def test_analysis_not_available(self):
        result = analyze_text("Any text here")
        assert result["analysis_available"] is False

    @_offline
    def test_empty_categories(self):
        result = analyze_text("Dispatch crew alpha to 123 Main St")
        assert result["categories"] == {}

    @_offline
    def test_no_blocked_categories(self):
        result = analyze_text("Standard infrastructure text")
        assert result["blocked_categories"] == []

    @_offline
    def test_includes_reason(self):
        result = analyze_text("Test")
        assert "reason" in result
        assert "not configured" in result["reason"].lower() or "skipped" in result["reason"].lower()

    @_offline
    def test_empty_string_input(self):
        result = analyze_text("")
        assert result["safe"] is True

    @_offline
    def test_none_like_handling(self):
        """Even though API checks for empty text, offline path triggers first."""
        result = analyze_text("   ")
        assert result["safe"] is True
        assert result["analysis_available"] is False

    @_offline
    def test_long_text_still_safe(self):
        long_text = "repair pothole " * 1000
        result = analyze_text(long_text)
        assert result["safe"] is True


# ============================================
# validate_dispatch_recommendation
# ============================================


class TestValidateDispatchRecommendation:
    """Verify that recommendations get a contentSafety field added."""

    def _make_recommendation(self, **overrides):
        rec = {
            "workOrderId": "wo-1",
            "recommendedCrewId": "crew-alpha",
            "crewName": "Alpha",
            "priority": "high",
            "issueType": "pothole",
            "address": "123 Main St, Lake Forest IL",
            "reasoning": [
                {"step": 1, "description": "Pothole at 123 Main St — critical severity"},
                {"step": 2, "description": "Alpha crew is closest — 0.3mi away"},
            ],
        }
        rec.update(overrides)
        return rec

    @_offline
    def test_adds_content_safety_field(self):
        rec = self._make_recommendation()
        result = validate_dispatch_recommendation(rec)
        assert "contentSafety" in result

    @_offline
    def test_content_safety_structure(self):
        rec = self._make_recommendation()
        result = validate_dispatch_recommendation(rec)
        cs = result["contentSafety"]
        assert "checked" in cs
        assert "safe" in cs
        assert "blockedCategories" in cs

    @_offline
    def test_marked_safe_offline(self):
        rec = self._make_recommendation()
        result = validate_dispatch_recommendation(rec)
        assert result["contentSafety"]["safe"] is True

    @_offline
    def test_checked_false_when_offline(self):
        rec = self._make_recommendation()
        result = validate_dispatch_recommendation(rec)
        assert result["contentSafety"]["checked"] is False

    @_offline
    def test_no_blocked_categories_offline(self):
        rec = self._make_recommendation()
        result = validate_dispatch_recommendation(rec)
        assert result["contentSafety"]["blockedCategories"] == []

    @_offline
    def test_original_fields_preserved(self):
        rec = self._make_recommendation()
        result = validate_dispatch_recommendation(rec)
        assert result["workOrderId"] == "wo-1"
        assert result["crewName"] == "Alpha"
        assert result["address"] == "123 Main St, Lake Forest IL"

    @_offline
    def test_recommendation_with_notes_field(self):
        rec = self._make_recommendation(notes="Urgent repair needed before winter")
        result = validate_dispatch_recommendation(rec)
        assert result["contentSafety"]["safe"] is True

    @_offline
    def test_recommendation_with_empty_reasoning(self):
        rec = self._make_recommendation(reasoning=[])
        result = validate_dispatch_recommendation(rec)
        assert "contentSafety" in result


# ============================================
# validate_dispatch_plan
# ============================================


class TestValidateDispatchPlan:
    """Verify full dispatch plan validation and aggregation."""

    def _make_plan(self, num_recs=2, include_llm=False):
        recs = []
        for i in range(num_recs):
            recs.append({
                "workOrderId": f"wo-{i+1}",
                "recommendedCrewId": f"crew-{i+1}",
                "crewName": f"Crew {i+1}",
                "address": f"{100+i} Elm St",
                "reasoning": [
                    {"step": 1, "description": f"Work order {i+1} needs dispatch"},
                ],
            })
        plan = {
            "success": True,
            "recommendations": recs,
            "summary": {"totalRecommendations": num_recs},
        }
        if include_llm:
            plan["llmAnalysis"] = {
                "strategicNotes": "Prioritize school-zone repairs before 3PM.",
                "riskAlerts": ["Rain expected tomorrow — schedule indoor work"],
                "optimizationSuggestions": ["Combine nearby orders for crew-2"],
                "overallAssessment": "yellow",
            }
        return plan

    @_offline
    def test_adds_content_safety_to_plan(self):
        plan = self._make_plan()
        result = validate_dispatch_plan(plan)
        assert "contentSafety" in result

    @_offline
    def test_plan_safety_structure(self):
        plan = self._make_plan()
        result = validate_dispatch_plan(plan)
        cs = result["contentSafety"]
        assert "totalChecked" in cs
        assert "totalBlocked" in cs
        assert "allSafe" in cs
        assert "serviceAvailable" in cs

    @_offline
    def test_all_safe_when_offline(self):
        plan = self._make_plan(3)
        result = validate_dispatch_plan(plan)
        assert result["contentSafety"]["allSafe"] is True

    @_offline
    def test_total_checked_matches_rec_count(self):
        plan = self._make_plan(4)
        result = validate_dispatch_plan(plan)
        assert result["contentSafety"]["totalChecked"] == 4

    @_offline
    def test_zero_blocked_offline(self):
        plan = self._make_plan()
        result = validate_dispatch_plan(plan)
        assert result["contentSafety"]["totalBlocked"] == 0

    @_offline
    def test_each_rec_gets_content_safety(self):
        plan = self._make_plan(3)
        result = validate_dispatch_plan(plan)
        for rec in result["recommendations"]:
            assert "contentSafety" in rec

    @_offline
    def test_service_unavailable_offline(self):
        plan = self._make_plan()
        result = validate_dispatch_plan(plan)
        assert result["contentSafety"]["serviceAvailable"] is False

    @_offline
    def test_empty_plan_no_recommendations(self):
        plan = {"recommendations": []}
        result = validate_dispatch_plan(plan)
        assert result["contentSafety"]["totalChecked"] == 0
        assert result["contentSafety"]["allSafe"] is True

    @_offline
    def test_llm_analysis_checked(self):
        plan = self._make_plan(2, include_llm=True)
        result = validate_dispatch_plan(plan)
        assert "llmContentSafety" in result
        assert result["llmContentSafety"]["safe"] is True

    @_offline
    def test_llm_content_safety_structure(self):
        plan = self._make_plan(1, include_llm=True)
        result = validate_dispatch_plan(plan)
        llm_cs = result["llmContentSafety"]
        assert "checked" in llm_cs
        assert "safe" in llm_cs
        assert "blockedCategories" in llm_cs

    @_offline
    def test_plan_without_llm_no_llm_safety_field(self):
        plan = self._make_plan(2, include_llm=False)
        result = validate_dispatch_plan(plan)
        assert "llmContentSafety" not in result

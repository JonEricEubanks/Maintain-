"""
InfraWatch AI — Azure Content Safety Integration

Validates AI-generated dispatch recommendations before they reach
operations managers. This is a Responsible AI guardrail that ensures
no harmful, biased, or inappropriate content is presented.

Uses Azure AI Content Safety API to check text for:
- Hate speech
- Violence
- Self-harm
- Sexual content

Every dispatch recommendation and AI decision log entry is validated
before being shown in the UI.
"""

import os
import json
import requests
from pathlib import Path
from typing import Any, Optional
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ============================================
# Configuration
# ============================================

CONTENT_SAFETY_ENDPOINT = os.environ.get(
    "AZURE_CONTENT_SAFETY_ENDPOINT", ""
).rstrip("/")
CONTENT_SAFETY_KEY = os.environ.get("AZURE_CONTENT_SAFETY_KEY", "")

# Severity threshold (0-6). Reject if ANY category >= threshold.
# 0 = block nothing, 2 = moderate, 4 = strict, 6 = block everything
SEVERITY_THRESHOLD = 2


# ============================================
# Content Safety Check
# ============================================

def analyze_text(text: str) -> dict[str, Any]:
    """
    Run Azure Content Safety analysis on text.

    Returns:
        {
            "safe": True/False,
            "categories": { "Hate": 0, "Violence": 0, "SelfHarm": 0, "Sexual": 0 },
            "blocked_categories": [],
            "analysis_available": True/False
        }
    """
    if not CONTENT_SAFETY_ENDPOINT or not CONTENT_SAFETY_KEY:
        # SECURITY: Fail-closed — do not pass unchecked content through
        return {
            "safe": False,
            "categories": {},
            "blocked_categories": ["unchecked"],
            "analysis_available": False,
            "reason": "Content Safety not configured — content blocked by default",
        }

    if not text or not text.strip():
        return {
            "safe": True,
            "categories": {},
            "blocked_categories": [],
            "analysis_available": True,
        }

    try:
        url = f"{CONTENT_SAFETY_ENDPOINT}/contentsafety/text:analyze?api-version=2024-09-01"
        headers = {
            "Ocp-Apim-Subscription-Key": CONTENT_SAFETY_KEY,
            "Content-Type": "application/json",
        }
        body = {
            "text": text[:10000],  # API limit
            "categories": ["Hate", "Violence", "SelfHarm", "Sexual"],
            "outputType": "FourSeverityLevels",
        }

        resp = requests.post(url, headers=headers, json=body, timeout=10)

        if resp.status_code == 200:
            result = resp.json()
            categories = {}
            blocked = []

            for cat_result in result.get("categoriesAnalysis", []):
                name = cat_result.get("category", "Unknown")
                severity = cat_result.get("severity", 0)
                categories[name] = severity
                if severity >= SEVERITY_THRESHOLD:
                    blocked.append(name)

            return {
                "safe": len(blocked) == 0,
                "categories": categories,
                "blocked_categories": blocked,
                "analysis_available": True,
            }

        # Non-200 — fail-closed: do not pass unchecked content
        print(f"   \u26a0\ufe0f Content Safety API returned {resp.status_code}: {resp.text[:200]}")
        return {
            "safe": False,
            "categories": {},
            "blocked_categories": ["api_error"],
            "analysis_available": False,
            "reason": f"API returned {resp.status_code} — content blocked by default",
        }

    except Exception as e:
        print(f"   \u26a0\ufe0f Content Safety check failed: {e}")
        return {
            "safe": False,
            "categories": {},
            "blocked_categories": ["service_error"],
            "analysis_available": False,
            "reason": "Content Safety service error — content blocked by default",
        }


def validate_dispatch_recommendation(recommendation: dict) -> dict[str, Any]:
    """
    Validate a single dispatch recommendation for content safety.
    Checks the reasoning text and any free-form fields.

    Returns the recommendation with a 'contentSafety' field added.
    """
    # Build text to check from all free-form fields
    text_parts = []

    # Check reasoning steps
    for step in recommendation.get("reasoning", []):
        desc = step.get("description", "")
        if desc:
            text_parts.append(desc)

    # Check address and notes
    for field in ["address", "notes", "description", "strategicNotes"]:
        val = recommendation.get(field, "")
        if val:
            text_parts.append(val)

    combined_text = " | ".join(text_parts)
    result = analyze_text(combined_text)

    # Add content safety result to the recommendation
    recommendation["contentSafety"] = {
        "checked": result.get("analysis_available", False),
        "safe": result.get("safe", True),
        "blockedCategories": result.get("blocked_categories", []),
    }

    return recommendation


def validate_dispatch_plan(plan: dict) -> dict[str, Any]:
    """
    Validate an entire dispatch plan. Checks each recommendation
    and the LLM analysis (if present).

    Returns the plan with content safety metadata added.
    """
    checked_count = 0
    blocked_count = 0

    # Check each recommendation
    recommendations = plan.get("recommendations", [])
    for rec in recommendations:
        validate_dispatch_recommendation(rec)
        checked_count += 1
        if not rec.get("contentSafety", {}).get("safe", True):
            blocked_count += 1

    # Check LLM strategic analysis if present
    llm_analysis = plan.get("llmAnalysis", {})
    if llm_analysis:
        llm_text_parts = [
            llm_analysis.get("strategicNotes", ""),
            " ".join(llm_analysis.get("riskAlerts", [])),
            " ".join(llm_analysis.get("optimizationSuggestions", [])),
        ]
        llm_text = " | ".join(t for t in llm_text_parts if t)
        llm_safety = analyze_text(llm_text)
        plan["llmContentSafety"] = {
            "checked": llm_safety.get("analysis_available", False),
            "safe": llm_safety.get("safe", True),
            "blockedCategories": llm_safety.get("blocked_categories", []),
        }
        if not llm_safety.get("safe", True):
            blocked_count += 1

    # Add summary to plan
    plan["contentSafety"] = {
        "totalChecked": checked_count,
        "totalBlocked": blocked_count,
        "allSafe": blocked_count == 0,
        "serviceAvailable": any(
            rec.get("contentSafety", {}).get("checked", False)
            for rec in recommendations
        ) if recommendations else False,
    }

    return plan


# ============================================
# Quick Test
# ============================================

if __name__ == "__main__":
    print("🛡️ Azure Content Safety — Quick Test")
    print("=" * 50)

    # Safe text
    safe_result = analyze_text(
        "Dispatch crew Alpha to repair pothole at 123 Main St, Lake Forest IL. "
        "Estimated 2 hours, $800 cost."
    )
    print(f"Safe text: {json.dumps(safe_result, indent=2)}")

    print("\n✅ Content Safety module loaded successfully")
    print(f"   Endpoint: {'configured' if CONTENT_SAFETY_ENDPOINT else 'NOT SET'}")
    print(f"   Key: {'configured' if CONTENT_SAFETY_KEY else 'NOT SET'}")

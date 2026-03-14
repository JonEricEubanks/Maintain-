"""
InfraWatch AI - Crew Estimation Agent

Azure AI Foundry agent that estimates optimal crew deployment using a
hybrid approach: deterministic formulas for reliable baseline estimation
plus LLM reasoning (via Model Router → Phi-4) for contextual insights,
risk identification, and natural-language justification.

Architecture:
    Deterministic Engine  →  baseline crew counts (formulas, lookup tables)
    LLM Reasoning Layer   →  contextual analysis, risk flags, recommendations
    Combined Output       →  formula numbers + AI insights + confidence

The LLM layer enriches every response with:
- Contextual risk factors the formula can't capture
- Natural-language justification for city managers
- Scheduling recommendations based on weather patterns
- Edge-case detection (ADA zones, school proximity clusters)
"""

import os
import json
from pathlib import Path
from datetime import datetime
from typing import Any

from dotenv import load_dotenv

# Load .env from the agents directory
_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Model Router (Foundry SDK) — LLM reasoning layer ──
from model_router import chat_completion, route

# ============================================
# Configuration
# ============================================

AZURE_PROJECT_CONNECTION = os.environ.get("AZURE_AI_PROJECT_CONNECTION_STRING", "")

# ============================================
# Historical Metrics (Based on Lake Forest Data)
# ============================================

# Average repair times by type and severity (hours)
REPAIR_TIMES = {
    "pothole": {
        "critical": 2.0,
        "high": 1.5,
        "medium": 1.0,
        "low": 0.5
    },
    "sidewalk": {
        "critical": 4.0,
        "high": 3.0,
        "medium": 2.0,
        "low": 1.0
    },
    "concrete": {
        "critical": 8.0,
        "high": 6.0,
        "medium": 4.0,
        "low": 2.0
    }
}

# Crew capacity (work orders per day per crew)
CREW_DAILY_CAPACITY = {
    "pothole": 8,   # Pothole crews can fix ~8 per day
    "sidewalk": 4,  # Sidewalk crews ~4 per day
    "concrete": 2   # Concrete crews ~2 per day
}

# Weather impact multipliers
WEATHER_IMPACT = {
    "clear": 1.0,
    "cloudy": 1.05,
    "rain": 0.4,       # 60% reduction in productivity
    "snow": 0.3,       # 70% reduction
    "freezing": 0.2,   # 80% reduction
    "freeze_thaw": 0.6 # 40% reduction
}

# Seasonal adjustment (winter = more damage, less work capacity)
SEASONAL_FACTORS = {
    1: 1.4,   # January - peak winter
    2: 1.5,   # February - freeze-thaw peak
    3: 1.3,   # March - thaw damage visible
    4: 1.1,   # April - catch-up season
    5: 1.0,   # May - optimal
    6: 1.0,   # June - optimal
    7: 0.95,  # July - heat considerations
    8: 0.95,  # August - heat considerations
    9: 1.0,   # September - optimal
    10: 1.05, # October - prep for winter
    11: 1.2,  # November - early freeze
    12: 1.3   # December - winter onset
}


# ============================================
# Crew Estimation Functions
# ============================================

def estimate_crews(
    work_orders: list[dict],
    weather_condition: str = "clear",
    temperature: float = 50.0,
    days_to_complete: int = 7,
    crew_availability_percent: float = 100.0
) -> dict[str, Any]:
    """
    Estimate the number of crews needed to complete work orders.
    
    Returns breakdown by type and total, with detailed reasoning.
    """
    reasoning = []
    factors = []
    
    # Count work orders by type
    by_type = {"pothole": [], "sidewalk": [], "concrete": []}
    for order in work_orders:
        issue_type = order.get("issueType", "pothole").lower()
        if issue_type in by_type:
            by_type[issue_type].append(order)
    
    reasoning.append(f"Analyzing {len(work_orders)} work orders: {len(by_type['pothole'])} potholes, {len(by_type['sidewalk'])} sidewalk, {len(by_type['concrete'])} concrete")
    
    # Calculate total work hours needed
    total_hours = {"pothole": 0, "sidewalk": 0, "concrete": 0}
    
    for issue_type, orders in by_type.items():
        for order in orders:
            severity = order.get("severity", "medium").lower()
            hours = REPAIR_TIMES.get(issue_type, {}).get(severity, 1.0)
            total_hours[issue_type] += hours
    
    reasoning.append(f"Total estimated hours: {total_hours['pothole']:.1f}h pothole, {total_hours['sidewalk']:.1f}h sidewalk, {total_hours['concrete']:.1f}h concrete")
    
    # Apply weather impact
    weather_mult = WEATHER_IMPACT.get(weather_condition.lower(), 1.0)
    effective_capacity = {
        k: v * weather_mult for k, v in CREW_DAILY_CAPACITY.items()
    }
    
    if weather_mult < 1.0:
        reasoning.append(f"Weather ({weather_condition}): Crew productivity at {weather_mult*100:.0f}%")
        factors.append({
            "name": f"Weather ({weather_condition})",
            "value": weather_mult,
            "weight": 0.25,
            "impact": "negative" if weather_mult < 0.8 else "neutral"
        })
    else:
        reasoning.append("Weather conditions: Optimal for outdoor work")
        factors.append({
            "name": "Weather (Clear)",
            "value": 1.0,
            "weight": 0.25,
            "impact": "positive"
        })
    
    # Temperature adjustment
    temp_factor = 1.0
    if temperature < 32:
        temp_factor = 0.5  # Below freezing - minimal work
        reasoning.append(f"Temperature {temperature}°F: Below freezing, asphalt/concrete work severely limited")
    elif temperature < 45:
        temp_factor = 0.75
        reasoning.append(f"Temperature {temperature}°F: Cold conditions affect material curing")
    elif temperature > 95:
        temp_factor = 0.8
        reasoning.append(f"Temperature {temperature}°F: Heat safety protocols reduce capacity")
    else:
        reasoning.append(f"Temperature {temperature}°F: Optimal working conditions")
    
    factors.append({
        "name": "Temperature",
        "value": temp_factor,
        "weight": 0.15,
        "impact": "negative" if temp_factor < 0.8 else "positive" if temp_factor == 1.0 else "neutral"
    })
    
    # Seasonal adjustment
    current_month = datetime.now().month
    seasonal_factor = SEASONAL_FACTORS.get(current_month, 1.0)
    
    if seasonal_factor > 1.1:
        reasoning.append(f"Seasonal factor: Winter conditions typically increase demand by {(seasonal_factor-1)*100:.0f}%")
    
    factors.append({
        "name": "Seasonal Demand",
        "value": seasonal_factor,
        "weight": 0.15,
        "impact": "negative" if seasonal_factor > 1.2 else "neutral"
    })
    
    # Calculate crews needed
    work_hours_per_crew_per_day = 8 * temp_factor * weather_mult
    
    crews_needed = {}
    for issue_type, hours in total_hours.items():
        if hours > 0:
            # Hours needed / (hours per crew per day * days available)
            daily_output = effective_capacity[issue_type] * days_to_complete
            crews = max(1, int(math.ceil(len(by_type[issue_type]) / daily_output)))
            crews_needed[issue_type] = int(crews * seasonal_factor)
        else:
            crews_needed[issue_type] = 0
    
    # Adjust for crew availability
    availability_factor = 100 / max(crew_availability_percent, 10)
    if availability_factor > 1.1:
        reasoning.append(f"Crew availability at {crew_availability_percent}%: Need to account for reduced capacity")
        for issue_type in crews_needed:
            crews_needed[issue_type] = int(math.ceil(crews_needed[issue_type] * availability_factor))
    
    factors.append({
        "name": "Crew Availability",
        "value": availability_factor,
        "weight": 0.2,
        "impact": "negative" if crew_availability_percent < 70 else "positive"
    })
    
    total_crews = sum(crews_needed.values())
    
    reasoning.append(f"Final recommendation: {total_crews} total crews ({crews_needed['pothole']} pothole, {crews_needed['sidewalk']} sidewalk, {crews_needed['concrete']} concrete)")
    
    # Calculate confidence
    confidence = 0.7
    if len(work_orders) >= 10:
        confidence += 0.1  # More data = higher confidence
    if weather_condition == "clear" and 40 <= temperature <= 80:
        confidence += 0.1  # Predictable conditions
    if crew_availability_percent >= 80:
        confidence += 0.05
    
    return {
        "potholeCrew": crews_needed.get("pothole", 0),
        "sidewalkCrews": crews_needed.get("sidewalk", 0),
        "concreteCrews": crews_needed.get("concrete", 0),
        "totalCrews": total_crews,
        "reasoning": reasoning,
        "factors": factors,
        "confidence": min(confidence, 0.95),
        "metadata": {
            "work_orders_analyzed": len(work_orders),
            "days_to_complete": days_to_complete,
            "weather_condition": weather_condition,
            "temperature": temperature,
            "crew_availability": crew_availability_percent,
            "seasonal_factor": seasonal_factor
        }
    }


# Need math for ceiling calculations
import math


# ============================================
# Tool Definitions for Foundry
# ============================================

CREW_ESTIMATION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "estimate_crews",
            "description": "Estimate optimal crew deployment based on work orders, weather, and availability.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_orders": {
                        "type": "array",
                        "description": "Array of work order objects with issueType, severity, etc."
                    },
                    "weather_condition": {
                        "type": "string",
                        "enum": ["clear", "cloudy", "rain", "snow", "freezing", "freeze_thaw"],
                        "description": "Current weather condition"
                    },
                    "temperature": {
                        "type": "number",
                        "description": "Current temperature in Fahrenheit"
                    },
                    "days_to_complete": {
                        "type": "integer",
                        "description": "Target number of days to complete all work"
                    },
                    "crew_availability_percent": {
                        "type": "number",
                        "description": "Percentage of normal crew capacity available (0-100)"
                    }
                },
                "required": ["work_orders"]
            }
        }
    }
]

# ============================================
# Agent Instructions
# ============================================

CREW_ESTIMATION_AGENT_INSTRUCTIONS = """
You are the Crew Estimation Agent for Lake Forest, IL infrastructure management. Your role is to:

1. **Analyze Workload**: Calculate total repair hours needed based on work order types and severities.

2. **Consider Environmental Factors**:
   - Weather conditions (rain/snow reduce productivity)
   - Temperature (freezing limits asphalt work)
   - Seasonal patterns (winter increases damage and reduces capacity)

3. **Account for Capacity**:
   - Different crew types have different daily capacities
   - Pothole crews: ~8 repairs/day
   - Sidewalk crews: ~4 repairs/day
   - Concrete crews: ~2 repairs/day

4. **Provide Recommendations**:
   - Crew counts by type
   - Reasoning for the estimate
   - Confidence level based on data quality

## Key Metrics:
- Historical repair times inform hour estimates
- Weather reduces effective capacity (rain = 40% productivity)
- Seasonal factors account for winter damage surge
- Crew availability impacts total capacity

Always explain YOUR reasoning process so city managers understand the estimate.
"""


# ============================================
# Agent Execution
# ============================================

# ============================================
# LLM Reasoning Layer
# ============================================

def _llm_crew_reasoning(
    estimation: dict[str, Any],
    work_orders: list[dict],
    weather: str,
    temperature: float,
    days: int,
    availability: float,
) -> dict[str, Any]:
    """
    Use the Model Router to get AI-enhanced reasoning about the crew estimate.
    The LLM receives the deterministic baseline and adds contextual insights.
    Routes to Phi-4 (lightweight, fast) by default.
    """
    # Build severity distribution for context
    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    type_counts = {"pothole": 0, "sidewalk": 0, "concrete": 0}
    for wo in work_orders:
        sev = wo.get("severity", "medium").lower()
        itype = wo.get("issueType", "pothole").lower()
        if sev in sev_counts:
            sev_counts[sev] += 1
        if itype in type_counts:
            type_counts[itype] += 1

    prompt = f"""You are a municipal infrastructure crew planning advisor for Lake Forest, IL.

A deterministic formula has produced the following crew estimate:
- Pothole crews: {estimation.get('potholeCrew', 0)}
- Sidewalk crews: {estimation.get('sidewalkCrews', 0)}
- Concrete crews: {estimation.get('concreteCrews', 0)}
- Total crews: {estimation.get('totalCrews', 0)}
- Confidence: {estimation.get('confidence', 0):.0%}

Conditions:
- Weather: {weather}, Temperature: {temperature}°F
- Target completion: {days} days, Crew availability: {availability}%
- Work orders: {len(work_orders)} total
  Severity: {json.dumps(sev_counts)}
  Types: {json.dumps(type_counts)}

Provide a JSON response with:
{{
  "risk_factors": ["list of 2-3 contextual risks the formula may not capture (e.g., freeze-thaw cycling, school zone overlaps, material supply constraints)"],
  "scheduling_recommendation": "one sentence on optimal scheduling approach given current conditions",
  "adjustment_rationale": "one sentence explaining whether the formula estimate looks reasonable or needs human review",
  "crew_deployment_tip": "one practical tip for the dispatch manager"
}}
Respond ONLY with valid JSON."""

    try:
        resp = chat_completion(
            agent="crew_estimation",
            messages=[
                {"role": "system", "content": CREW_ESTIMATION_AGENT_INSTRUCTIONS},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0.4,
        )
        # Parse LLM response
        content = resp.content.strip()
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        llm_insights = json.loads(content)
        return {
            "llm_insights": llm_insights,
            "model": resp.model,
            "model_display": resp.model_display,
            "model_tier": resp.model_tier,
            "llm_tokens": resp.total_tokens,
            "llm_latency_ms": resp.latency_ms,
        }
    except Exception as e:
        print(f"   ⚠️ Crew estimation LLM reasoning skipped: {e}")
        return {
            "llm_insights": None,
            "model": route("crew_estimation").model_id,
            "model_display": route("crew_estimation").profile.display_name,
            "model_tier": route("crew_estimation").profile.tier,
            "llm_tokens": 0,
            "llm_latency_ms": 0,
            "llm_error": str(e),
        }


def run_crew_estimation(
    work_orders: list[dict],
    weather: str = "clear",
    temperature: float = 50.0,
    days: int = 7,
    availability: float = 100.0
) -> dict[str, Any]:
    """
    Run crew estimation with full reasoning chain:
    1. Deterministic formula computes baseline crew counts
    2. LLM reasoning layer adds contextual insights via Model Router
    3. Combined result includes both formula outputs and AI analysis
    """
    start_time = datetime.now()
    
    # Step 1: Deterministic baseline (always runs, always reliable)
    result = estimate_crews(
        work_orders=work_orders,
        weather_condition=weather,
        temperature=temperature,
        days_to_complete=days,
        crew_availability_percent=availability
    )
    
    # Step 2: LLM reasoning enrichment (non-blocking — fails gracefully)
    llm_result = _llm_crew_reasoning(
        estimation=result,
        work_orders=work_orders,
        weather=weather,
        temperature=temperature,
        days=days,
        availability=availability,
    )
    
    # Merge LLM insights into reasoning chain
    if llm_result.get("llm_insights"):
        insights = llm_result["llm_insights"]
        result["reasoning"].append(
            f"AI Analysis ({llm_result['model_display']}): {insights.get('adjustment_rationale', 'Analysis complete')}"
        )
        if insights.get("risk_factors"):
            for risk in insights["risk_factors"]:
                result["reasoning"].append(f"⚠️ Risk factor: {risk}")
        result["ai_insights"] = insights
    
    processing_time = (datetime.now() - start_time).total_seconds() * 1000
    
    return {
        "success": True,
        "estimation": result,
        "processing_time_ms": processing_time,
        "model": llm_result.get("model", "Phi-4"),
        "model_display": llm_result.get("model_display", "Phi-4 (Lightweight)"),
        "model_tier": llm_result.get("model_tier", "lightweight"),
        "token_usage": {
            "total": llm_result.get("llm_tokens", 0),
            "llm_latency_ms": llm_result.get("llm_latency_ms", 0),
        },
    }


# ============================================
# CLI Entry Point
# ============================================

if __name__ == "__main__":
    # Test with sample data
    test_orders = [
        {"id": "1", "issueType": "pothole", "severity": "critical"},
        {"id": "2", "issueType": "pothole", "severity": "high"},
        {"id": "3", "issueType": "pothole", "severity": "medium"},
        {"id": "4", "issueType": "pothole", "severity": "medium"},
        {"id": "5", "issueType": "pothole", "severity": "low"},
        {"id": "6", "issueType": "sidewalk", "severity": "high"},
        {"id": "7", "issueType": "sidewalk", "severity": "medium"},
        {"id": "8", "issueType": "sidewalk", "severity": "medium"},
        {"id": "9", "issueType": "concrete", "severity": "critical"},
        {"id": "10", "issueType": "concrete", "severity": "medium"},
    ]
    
    print("👷 Running Crew Estimation Agent...")
    print(f"📝 Processing {len(test_orders)} work orders\n")
    
    result = run_crew_estimation(
        work_orders=test_orders,
        weather="cloudy",
        temperature=38.0,
        days=5,
        availability=75.0
    )
    
    est = result["estimation"]
    
    print("=" * 60)
    print("📊 CREW ESTIMATION RESULT")
    print("=" * 60)
    print(f"\n👷 Crews Recommended:")
    print(f"   • Pothole Crews: {est['potholeCrew']}")
    print(f"   • Sidewalk Crews: {est['sidewalkCrews']}")
    print(f"   • Concrete Crews: {est['concreteCrews']}")
    print(f"   • TOTAL: {est['totalCrews']}")
    
    print(f"\n📝 Reasoning:")
    for step in est["reasoning"]:
        print(f"   → {step}")
    
    print(f"\n🎯 Confidence: {est['confidence']:.0%}")
    print(f"⏱️  Processing Time: {result['processing_time_ms']:.0f}ms")

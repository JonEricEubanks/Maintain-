"""
MAINTAIN AI — Dispatch Optimization Agent

Uses the Model Router for AI-enhanced dispatch reasoning.
Routes to gpt-4.1-mini (fast, cost-efficient) for dispatch optimization.
Reads from MCP (READ-ONLY), outputs dispatch plans for the frontend
to persist to Dataverse (WRITE).

Data flow:
    MCP (read-only) → Agent (reason) → Frontend → Dataverse (write)
    Never writes to MCP from this agent.
"""

import os
import json
from pathlib import Path
from datetime import datetime
from typing import Any, Optional
from math import radians, sin, cos, sqrt, atan2

from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(_env_path)

# ── Model Router (Foundry SDK) ──
from model_router import chat_completion, route

# ── Shared MCP Client ──
from mcp_client import mcp_call as _mcp_call, get_work_orders, get_schools

# ============================================
# Repair Estimation Tables
# ============================================

REPAIR_DURATION = {
    "pothole":  {"critical": 2.0, "high": 1.5, "medium": 1.0, "low": 0.5},
    "sidewalk": {"critical": 4.0, "high": 3.0, "medium": 2.0, "low": 1.0},
    "concrete": {"critical": 8.0, "high": 6.0, "medium": 4.0, "low": 2.0},
}

REPAIR_COST = {
    "pothole":  {"critical": 2000, "high": 1500, "medium": 800,  "low": 400},
    "sidewalk": {"critical": 4500, "high": 3500, "medium": 2000, "low": 1000},
    "concrete": {"critical": 8000, "high": 6000, "medium": 4000, "low": 2000},
}

# ============================================
# Haversine Distance
# ============================================

def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3959  # Earth radius in miles
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1 - a))

# ============================================
# Core Dispatch Logic (Local Algorithm)
# ============================================

def generate_dispatch_recommendations(
    work_orders: list[dict],
    crews: list[dict],
    weather: str = "clear",
    temperature: float = 50.0,
) -> dict[str, Any]:
    """
    Generate AI-powered dispatch recommendations.
    
    Reads work orders from MCP (read-only).
    Returns a dispatch plan — the FRONTEND writes it to Dataverse.
    """
    start = datetime.now()
    
    # Filter to open work orders, sort by priority
    open_wos = [
        wo for wo in work_orders
        if wo.get("status", "open") in ("open", "assigned")
    ]
    open_wos.sort(key=lambda w: w.get("priorityScore", 0), reverse=True)
    
    # Track crew workload
    crew_load: dict[str, float] = {c["id"]: 0.0 for c in crews}
    
    recommendations = []
    reasoning_steps = []
    
    for wo in open_wos[:15]:  # Top 15 priority
        best_crew = _find_best_crew(wo, crews, crew_load)
        if not best_crew:
            continue
        
        issue_type = wo.get("issueType", "pothole")
        severity = wo.get("severity", "medium")
        est_duration = REPAIR_DURATION.get(issue_type, {}).get(severity, 2.0)
        est_cost = REPAIR_COST.get(issue_type, {}).get(severity, 1500)
        
        # Calculate confidence factors
        dist = haversine_miles(
            wo.get("latitude", 42.23), wo.get("longitude", -87.84),
            best_crew.get("currentLat", 42.23), best_crew.get("currentLng", -87.84),
        )
        proximity_score = max(0, 1 - dist / 5)
        spec_score = 1.0 if best_crew.get("specialization") == issue_type else 0.5
        load = crew_load.get(best_crew["id"], 0)
        workload_score = max(0, 1 - load / 40)
        urgency_score = {"critical": 1.0, "high": 0.8, "medium": 0.5, "low": 0.25}.get(severity, 0.5)
        weather_score = 1.0 if weather == "clear" else 0.7 if weather == "cloudy" else 0.4
        
        confidence = (
            proximity_score * 0.2 +
            spec_score * 0.25 +
            workload_score * 0.15 +
            urgency_score * 0.25 +
            weather_score * 0.15
        )
        
        step_reasoning = [
            {
                "step": 1,
                "description": f"Work order {wo.get('id')}: {issue_type} ({severity}) at {wo.get('address', 'unknown')}",
                "confidence": urgency_score,
                "dataSource": "MCP (read-only)",
            },
            {
                "step": 2,
                "description": f"Best crew: {best_crew.get('name')} — {best_crew.get('specialization')} specialist, {dist:.1f}mi away",
                "confidence": spec_score,
                "dataSource": "Algorithm",
            },
            {
                "step": 3,
                "description": f"Weather: {weather}, {temperature}°F — workability {weather_score*100:.0f}%",
                "confidence": weather_score,
                "dataSource": "Weather API",
            },
            {
                "step": 4,
                "description": f"Est. {est_duration:.1f}h / ${est_cost:,} — crew has {40-load:.1f}h available",
                "confidence": workload_score,
                "dataSource": "Historical Data",
            },
        ]
        
        recommendations.append({
            "workOrderId": wo.get("id"),
            "recommendedCrewId": best_crew["id"],
            "crewName": best_crew.get("name", "Unknown"),
            "priority": severity,
            "issueType": issue_type,
            "address": wo.get("address", ""),
            "latitude": wo.get("latitude", 0),
            "longitude": wo.get("longitude", 0),
            "estimatedDuration": est_duration,
            "estimatedCost": est_cost,
            "confidence": round(confidence, 3),
            "reasoning": step_reasoning,
            "factors": {
                "proximity": round(proximity_score, 3),
                "specialization": round(spec_score, 3),
                "workload": round(workload_score, 3),
                "urgency": round(urgency_score, 3),
                "weather": round(weather_score, 3),
            },
            "nearSchool": wo.get("nearSchool", False),
            "zone": wo.get("zone", ""),
        })
        
        crew_load[best_crew["id"]] = load + est_duration
        reasoning_steps.extend(step_reasoning)
    
    # Sort by confidence
    recommendations.sort(key=lambda r: r["confidence"], reverse=True)
    
    total_cost = sum(r["estimatedCost"] for r in recommendations)
    total_hours = sum(r["estimatedDuration"] for r in recommendations)
    utilization = (total_hours / (len(crews) * 40) * 100) if crews else 0
    
    elapsed_ms = int((datetime.now() - start).total_seconds() * 1000)
    
    return {
        "success": True,
        "recommendations": recommendations,
        "summary": {
            "totalRecommendations": len(recommendations),
            "totalEstimatedCost": total_cost,
            "totalEstimatedHours": round(total_hours, 1),
            "crewUtilization": round(min(utilization, 100), 1),
            "weather": f"{weather}, {temperature}°F",
            "openWorkOrders": len(open_wos),
        },
        "reasoning": reasoning_steps,
        "processingTimeMs": elapsed_ms,
        "dataFlowNote": "MCP data read-only. Dispatch records should be written to Dataverse by the frontend.",
    }


def _find_best_crew(
    wo: dict,
    crews: list[dict],
    crew_load: dict[str, float],
) -> Optional[dict]:
    if not crews:
        return None
    
    scored = []
    for crew in crews:
        score = 0.0
        # Specialization
        if crew.get("specialization") == wo.get("issueType"):
            score += 40
        elif crew.get("specialization") == "general":
            score += 20
        
        # Proximity
        dist = haversine_miles(
            wo.get("latitude", 42.23), wo.get("longitude", -87.84),
            crew.get("currentLat", 42.23), crew.get("currentLng", -87.84),
        )
        score += max(0, 30 - dist * 10)
        
        # Efficiency
        score += crew.get("efficiencyRating", 0.7) * 15
        
        # Workload
        load = crew_load.get(crew["id"], 0)
        score += max(0, 15 - load / 4)
        
        scored.append((crew, score))
    
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0] if scored else None


# ============================================
# LLM-Enhanced Dispatch (Optional)
# ============================================

def generate_dispatch_with_llm(
    work_orders: list[dict],
    crews: list[dict],
    weather: str = "clear",
    temperature: float = 50.0,
) -> dict[str, Any]:
    """
    Enhanced version using Model Router for natural-language reasoning.
    Falls back to local algorithm if LLM unavailable.
    """
    try:
        decision = route("dispatch")
        
        # First, get the algorithmic recommendations
        algo_result = generate_dispatch_recommendations(work_orders, crews, weather, temperature)
        
        # Then ask the LLM to add strategic reasoning
        prompt = f"""You are an AI infrastructure operations advisor for Lake Forest, IL.

Given these dispatch recommendations (generated by algorithm), provide STRATEGIC COMMENTARY:
- Are there any scheduling conflicts or optimization opportunities?
- Should any dispatches be re-prioritized due to weather or proximity?
- What risks should the operations manager be aware of?

Recommendations:
{json.dumps(algo_result['recommendations'][:5], indent=2)}

Weather: {weather}, {temperature}°F
Open work orders: {len(work_orders)}
Available crews: {len(crews)}

Respond with a JSON object:
{{
  "strategicNotes": "...",
  "riskAlerts": ["..."],
  "optimizationSuggestions": ["..."],
  "overallAssessment": "green|yellow|red"
}}"""

        resp = chat_completion(
            agent="dispatch",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000,
            response_format="json",
        )
        
        llm_analysis = json.loads(resp.content)
        algo_result["llmAnalysis"] = llm_analysis
        algo_result["modelUsed"] = resp.model
        algo_result["modelDisplay"] = resp.model_display
        algo_result["modelTier"] = decision.profile.tier
        algo_result["llmTokens"] = resp.total_tokens
        algo_result["llmLatencyMs"] = resp.latency_ms
        
        return algo_result
        
    except Exception as e:
        print(f"   ⚠️ LLM dispatch enhancement failed: {e}, falling back to algorithm")
        return generate_dispatch_recommendations(work_orders, crews, weather, temperature)


# ============================================
# Main Entry Point
# ============================================

def run_dispatch(
    crews: Optional[list[dict]] = None,
    weather: str = "clear",
    temperature: float = 50.0,
    use_llm: bool = False,
) -> dict[str, Any]:
    """
    Main entry point for dispatch agent.
    
    1. Reads work orders from MCP (READ-ONLY)
    2. Generates dispatch recommendations
    3. Returns plan for frontend to persist to Dataverse
    """
    print("\n🚛 InfraWatch AI — Dispatch Optimization Agent")
    print("=" * 50)
    print("📖 MCP: READ-ONLY (fetching work orders)")
    print("📝 Dataverse: Writes handled by frontend")
    print()
    
    # Read work orders from MCP
    work_orders = get_work_orders()
    print(f"   📊 Loaded {len(work_orders)} work orders from MCP")
    
    # Use provided crews or defaults
    if not crews:
        crews = [
            {"id": "crew-alpha", "name": "Alpha - Pothole Specialists", "specialization": "pothole",
             "currentLat": 42.236, "currentLng": -87.842, "efficiencyRating": 0.92, "status": "available"},
            {"id": "crew-bravo", "name": "Bravo - Sidewalk Team", "specialization": "sidewalk",
             "currentLat": 42.241, "currentLng": -87.835, "efficiencyRating": 0.88, "status": "available"},
            {"id": "crew-charlie", "name": "Charlie - Concrete Crew", "specialization": "concrete",
             "currentLat": 42.228, "currentLng": -87.829, "efficiencyRating": 0.85, "status": "available"},
        ]
    
    print(f"   👷 {len(crews)} crews available")
    print(f"   🌤️ Weather: {weather}, {temperature}°F")
    print()
    
    if use_llm:
        result = generate_dispatch_with_llm(work_orders, crews, weather, temperature)
    else:
        result = generate_dispatch_recommendations(work_orders, crews, weather, temperature)
    
    if result.get("success"):
        summary = result.get("summary", {})
        print(f"   ✅ Generated {summary.get('totalRecommendations', 0)} dispatch recommendations")
        print(f"   💰 Total estimated cost: ${summary.get('totalEstimatedCost', 0):,}")
        print(f"   ⏱️ Total estimated hours: {summary.get('totalEstimatedHours', 0)}")
        print(f"   📊 Crew utilization: {summary.get('crewUtilization', 0):.1f}%")
    else:
        print(f"   ❌ Dispatch generation failed")
    
    return result


if __name__ == "__main__":
    result = run_dispatch()
    print("\n" + json.dumps(result, indent=2, default=str))

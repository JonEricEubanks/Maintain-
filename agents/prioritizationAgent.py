"""
InfraWatch AI - Prioritization Agent

Azure AI Foundry agent that prioritizes work orders using a hybrid approach:
deterministic multi-factor scoring for reliable baseline ranking plus LLM
reasoning (via Model Router → GPT-4.1-mini) for contextual risk analysis,
cluster detection, and natural-language justification.

Architecture:
    Deterministic Scorer  →  formula-based priority scores & tier assignment
    LLM Reasoning Layer   →  pattern detection, risk narratives, re-ranking advice
    Combined Output       →  scored orders + AI summary + actionable recommendations

The LLM layer enriches every prioritization with:
- Pattern detection across work orders (geographic clusters, severity spikes)
- Risk narratives explaining WHY certain items are critical
- Recommendations for city managers on action sequencing
- Edge-case flags the formula can't capture (liability exposure, ADA zones)
"""

import os
import json
import math
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
MCP_ENDPOINT = os.environ.get(
    "INFRAWATCH_MCP_ENDPOINT",
    ""
)

# ============================================
# Priority Calculation Functions
# ============================================

def calculate_priority_score(
    severity: str,
    issue_type: str,
    days_open: int,
    near_school: bool,
    traffic_level: str = "medium",
    temperature: float = 50.0
) -> dict[str, Any]:
    """
    Calculate priority score for a work order.
    
    Score formula:
    - Base severity score (critical=100, high=75, medium=50, low=25)
    - School proximity bonus (+30 if near school)
    - Age factor (+2 per day, max +40)
    - Traffic multiplier (high=1.3, medium=1.0, low=0.8)
    - Weather risk (freeze conditions add +20)
    - Issue type modifier (pothole=1.2, sidewalk=1.0, concrete=0.9)
    """
    
    # Base severity scores
    severity_scores = {
        "critical": 100,
        "high": 75,
        "medium": 50,
        "low": 25
    }
    base_score = severity_scores.get(severity.lower(), 50)
    
    # Issue type modifiers
    type_modifiers = {
        "pothole": 1.2,  # More dangerous to vehicles
        "sidewalk": 1.0,  # Pedestrian safety
        "concrete": 0.9   # Usually less urgent
    }
    type_modifier = type_modifiers.get(issue_type.lower(), 1.0)
    
    # School proximity
    school_bonus = 30 if near_school else 0
    
    # Age factor (older issues get higher priority)
    age_factor = min(days_open * 2, 40)
    
    # Traffic level multiplier
    traffic_multipliers = {
        "high": 1.3,
        "medium": 1.0,
        "low": 0.8
    }
    traffic_mult = traffic_multipliers.get(traffic_level.lower(), 1.0)
    
    # Weather risk (freeze conditions)
    weather_risk = 20 if temperature < 32 else (10 if temperature < 40 else 0)
    
    # Calculate final score
    raw_score = (base_score + school_bonus + age_factor + weather_risk) * type_modifier * traffic_mult
    final_score = min(raw_score, 200)  # Cap at 200
    
    return {
        "score": round(final_score, 1),
        "factors": {
            "severity_base": base_score,
            "school_proximity": school_bonus,
            "age_factor": age_factor,
            "traffic_multiplier": traffic_mult,
            "weather_risk": weather_risk,
            "type_modifier": type_modifier
        },
        "priority_tier": (
            "CRITICAL" if final_score >= 150 else
            "HIGH" if final_score >= 100 else
            "MEDIUM" if final_score >= 60 else
            "LOW"
        )
    }


def prioritize_work_orders(work_orders: list[dict], temperature: float = 50.0) -> list[dict]:
    """
    Prioritize a list of work orders and return them sorted by priority.
    """
    prioritized = []
    
    for order in work_orders:
        # Calculate days open
        created_at = datetime.fromisoformat(order.get("createdAt", datetime.now().isoformat()).replace("Z", ""))
        days_open = (datetime.now() - created_at).days
        
        priority = calculate_priority_score(
            severity=order.get("severity", "medium"),
            issue_type=order.get("issueType", "pothole"),
            days_open=days_open,
            near_school=order.get("nearSchool", False),
            traffic_level=order.get("trafficLevel", "medium"),
            temperature=temperature
        )
        
        prioritized.append({
            **order,
            "priorityScore": priority["score"],
            "priorityTier": priority["priority_tier"],
            "priorityFactors": priority["factors"]
        })
    
    # Sort by priority score (highest first)
    prioritized.sort(key=lambda x: x["priorityScore"], reverse=True)
    
    return prioritized


# ============================================
# MCP Integration
# ============================================

def call_mcp_calculate_priority(
    work_order_id: str,
    issue_type: str,
    severity: str,
    near_school: bool,
    days_open: int
) -> dict[str, Any]:
    """Call the MCP calculate_priority_score tool."""
    import requests
    
    response = requests.post(
        MCP_ENDPOINT,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "calculate_priority_score",
                "arguments": {
                    "work_order_id": work_order_id,
                    "issue_type": issue_type,
                    "severity": severity,
                    "near_school": near_school,
                    "days_open": days_open
                }
            }
        },
        headers={"Content-Type": "application/json"},
        timeout=30
    )
    
    result = response.json()
    if "result" in result and "content" in result["result"]:
        return json.loads(result["result"]["content"][0]["text"])
    
    # Fallback to local calculation
    return calculate_priority_score(severity, issue_type, days_open, near_school)


# ============================================
# Tool Definitions for Foundry
# ============================================

PRIORITIZATION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_priority_score",
            "description": "Calculate priority score for a work order based on severity, type, age, school proximity, and weather conditions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                        "description": "Issue severity level"
                    },
                    "issue_type": {
                        "type": "string",
                        "enum": ["pothole", "sidewalk", "concrete"],
                        "description": "Type of infrastructure issue"
                    },
                    "days_open": {
                        "type": "integer",
                        "description": "Number of days since issue was reported"
                    },
                    "near_school": {
                        "type": "boolean",
                        "description": "Whether issue is within 500m of a school"
                    },
                    "traffic_level": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "Traffic level in the area"
                    },
                    "temperature": {
                        "type": "number",
                        "description": "Current temperature in Fahrenheit"
                    }
                },
                "required": ["severity", "issue_type", "days_open", "near_school"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "prioritize_work_orders",
            "description": "Take a list of work orders and return them sorted by calculated priority score.",
            "parameters": {
                "type": "object",
                "properties": {
                    "work_orders": {
                        "type": "array",
                        "description": "Array of work order objects to prioritize"
                    },
                    "temperature": {
                        "type": "number",
                        "description": "Current temperature for weather factor calculation"
                    }
                },
                "required": ["work_orders"]
            }
        }
    }
]

TOOL_HANDLERS = {
    "calculate_priority_score": lambda **kwargs: calculate_priority_score(
        kwargs.get("severity", "medium"),
        kwargs.get("issue_type", "pothole"),
        kwargs.get("days_open", 0),
        kwargs.get("near_school", False),
        kwargs.get("traffic_level", "medium"),
        kwargs.get("temperature", 50.0)
    ),
    "prioritize_work_orders": lambda **kwargs: prioritize_work_orders(
        kwargs.get("work_orders", []),
        kwargs.get("temperature", 50.0)
    )
}

# ============================================
# Agent Instructions
# ============================================

PRIORITIZATION_AGENT_INSTRUCTIONS = """
You are the Prioritization Agent for Lake Forest, IL infrastructure management. Your role is to:

1. **Calculate Priority Scores**: Use the priority algorithm that considers:
   - Severity (critical > high > medium > low)
   - School proximity (issues near schools get +30 priority)
   - Issue age (older issues escalate)
   - Traffic patterns (high-traffic areas prioritized)
   - Weather conditions (freeze risk adds urgency)
   - Issue type (potholes slightly higher than sidewalks)

2. **Rank Work Orders**: Sort all issues by priority score to determine repair order.

3. **Explain Prioritization**: Provide clear reasoning for why items are prioritized.

## Priority Tiers:
- **CRITICAL** (150+): Immediate action required, safety hazard
- **HIGH** (100-149): Address within 24-48 hours
- **MEDIUM** (60-99): Schedule for this week
- **LOW** (<60): Can be batched with other work

## Output Format:
Provide prioritized lists with explanations for the top items. Always mention:
- The priority score and tier
- Key factors influencing the ranking
- Recommended action timeline
"""

# ============================================
# Agent Execution
# ============================================

# ============================================
# LLM Reasoning Layer
# ============================================

def _llm_prioritization_reasoning(
    prioritized: list[dict],
    tier_counts: dict[str, int],
    temperature: float,
) -> dict[str, Any]:
    """
    Use the Model Router to get AI-enhanced analysis of the prioritized work orders.
    The LLM receives the deterministic ranking and adds contextual intelligence.
    Routes to gpt-4.1-mini (fast, cost-efficient) by default.
    """
    # Build a concise summary of top items for the LLM
    top_items_summary = []
    for wo in prioritized[:10]:  # Send top 10 for context
        top_items_summary.append({
            "id": wo.get("id", "?"),
            "address": wo.get("address", "Unknown"),
            "type": wo.get("issueType", "unknown"),
            "severity": wo.get("severity", "medium"),
            "score": wo.get("priorityScore", 0),
            "tier": wo.get("priorityTier", "MEDIUM"),
            "near_school": wo.get("nearSchool", False),
        })

    prompt = f"""You are a municipal infrastructure prioritization advisor for Lake Forest, IL.

A deterministic algorithm has scored and ranked {len(prioritized)} work orders:
- CRITICAL: {tier_counts.get('CRITICAL', 0)}
- HIGH: {tier_counts.get('HIGH', 0)}
- MEDIUM: {tier_counts.get('MEDIUM', 0)}
- LOW: {tier_counts.get('LOW', 0)}
- Temperature: {temperature}°F

Top-ranked items:
{json.dumps(top_items_summary, indent=2)}

Provide a JSON response with:
{{
  "pattern_analysis": "one sentence describing any notable patterns (geographic clusters, severity concentrations, school-zone overlaps)",
  "critical_risk_narrative": "1-2 sentences explaining the most urgent risks and WHY immediate action matters (cite liability, safety, or compliance)",
  "recommended_action_sequence": ["list of 2-3 specific action steps for the operations manager, in priority order"],
  "formula_validation": "one sentence on whether the algorithmic ranking looks reasonable or if any items seem mis-ranked based on context"
}}
Respond ONLY with valid JSON."""

    try:
        resp = chat_completion(
            agent="prioritization",
            messages=[
                {"role": "system", "content": PRIORITIZATION_AGENT_INSTRUCTIONS},
                {"role": "user", "content": prompt},
            ],
            max_tokens=600,
            temperature=0.4,
        )
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
        print(f"   ⚠️ Prioritization LLM reasoning skipped: {e}")
        return {
            "llm_insights": None,
            "model": route("prioritization").model_id,
            "model_display": route("prioritization").profile.display_name,
            "model_tier": route("prioritization").profile.tier,
            "llm_tokens": 0,
            "llm_latency_ms": 0,
            "llm_error": str(e),
        }


def run_prioritization(work_orders: list[dict], temperature: float = 50.0) -> dict[str, Any]:
    """
    Run prioritization on a list of work orders:
    1. Deterministic formula scores and ranks all work orders
    2. LLM reasoning layer analyzes patterns and adds contextual insights
    3. Combined result includes scored orders + AI-generated risk narrative
    """
    start_time = datetime.now()
    reasoning_steps = []
    
    reasoning_steps.append({
        "step": 1,
        "description": f"Received {len(work_orders)} work orders for prioritization",
        "confidence": 1.0,
        "data_source": "Input"
    })
    
    # Step 1: Deterministic scoring (always runs, always reliable)
    prioritized = prioritize_work_orders(work_orders, temperature)
    
    reasoning_steps.append({
        "step": 2,
        "description": f"Applied multi-factor priority algorithm with temperature={temperature}°F",
        "confidence": 0.95,
        "data_source": "Algorithm"
    })
    
    # Count by tier
    tier_counts = {
        "CRITICAL": len([w for w in prioritized if w["priorityTier"] == "CRITICAL"]),
        "HIGH": len([w for w in prioritized if w["priorityTier"] == "HIGH"]),
        "MEDIUM": len([w for w in prioritized if w["priorityTier"] == "MEDIUM"]),
        "LOW": len([w for w in prioritized if w["priorityTier"] == "LOW"])
    }
    
    reasoning_steps.append({
        "step": 3,
        "description": f"Distribution: {tier_counts['CRITICAL']} critical, {tier_counts['HIGH']} high, {tier_counts['MEDIUM']} medium, {tier_counts['LOW']} low",
        "confidence": 0.98,
        "data_source": "Algorithm"
    })
    
    # Step 2: LLM reasoning enrichment (non-blocking — fails gracefully)
    llm_result = _llm_prioritization_reasoning(prioritized, tier_counts, temperature)
    
    if llm_result.get("llm_insights"):
        insights = llm_result["llm_insights"]
        reasoning_steps.append({
            "step": 4,
            "description": f"AI Pattern Analysis ({llm_result['model_display']}): {insights.get('pattern_analysis', 'Analysis complete')}",
            "confidence": 0.88,
            "data_source": f"LLM ({llm_result['model']})"
        })
        if insights.get("critical_risk_narrative"):
            reasoning_steps.append({
                "step": 5,
                "description": f"Risk Assessment: {insights['critical_risk_narrative']}",
                "confidence": 0.85,
                "data_source": f"LLM ({llm_result['model']})"
            })
    else:
        reasoning_steps.append({
            "step": 4,
            "description": "LLM reasoning layer unavailable — using formula-only results",
            "confidence": 0.92,
            "data_source": "Fallback"
        })
    
    processing_time = (datetime.now() - start_time).total_seconds() * 1000
    
    # Generate summary
    top_items = prioritized[:5]
    summary = f"Prioritized {len(work_orders)} work orders. "
    summary += f"Found {tier_counts['CRITICAL']} critical and {tier_counts['HIGH']} high priority items requiring immediate attention. "
    
    if top_items:
        summary += f"Top priority: {top_items[0].get('address', 'Unknown')} (Score: {top_items[0]['priorityScore']})"
    
    # Append AI insight to summary if available
    _insights = llm_result.get("llm_insights") or {}
    if _insights.get("critical_risk_narrative"):
        summary += f" | AI Insight: {_insights['critical_risk_narrative']}"
    
    return {
        "success": True,
        "output": summary,
        "prioritized_orders": prioritized,
        "tier_counts": tier_counts,
        "reasoning": reasoning_steps,
        "ai_insights": llm_result.get("llm_insights"),
        "confidence": 0.92,
        "processing_time_ms": processing_time,
        "model": llm_result.get("model", "gpt-4.1-mini"),
        "model_display": llm_result.get("model_display", "GPT-4.1 Mini"),
        "model_tier": llm_result.get("model_tier", "standard"),
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
        {
            "id": "WO-001",
            "address": "123 Main St",
            "issueType": "pothole",
            "severity": "critical",
            "nearSchool": True,
            "createdAt": "2026-01-15T10:00:00Z"
        },
        {
            "id": "WO-002",
            "address": "456 Oak Ave",
            "issueType": "sidewalk",
            "severity": "medium",
            "nearSchool": False,
            "createdAt": "2026-01-28T10:00:00Z"
        },
        {
            "id": "WO-003",
            "address": "789 School Rd",
            "issueType": "pothole",
            "severity": "high",
            "nearSchool": True,
            "createdAt": "2026-01-20T10:00:00Z"
        }
    ]
    
    print("🎯 Running Prioritization Agent...")
    print(f"📝 Processing {len(test_orders)} work orders\n")
    
    result = run_prioritization(test_orders, temperature=35.0)
    
    print("=" * 60)
    print("📊 PRIORITIZATION RESULT")
    print("=" * 60)
    print(result["output"])
    print("\n📋 Top 5 Priorities:")
    for i, order in enumerate(result["prioritized_orders"][:5], 1):
        print(f"  {i}. [{order['priorityTier']}] {order['address']} - Score: {order['priorityScore']}")
    print(f"\n⏱️  Processing Time: {result['processing_time_ms']:.0f}ms")

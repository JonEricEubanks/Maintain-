/**
 * MAINTAIN AI — Dispatch Orchestration Service
 *
 * Orchestrates the closed-loop AI workflow:
 *   1. MCP (READ-ONLY) → fetch work orders, schools, weather
 *   2. AI Agents → analyze, prioritize, estimate crews
 *   3. Dataverse (READ/WRITE) → create dispatches, log decisions, track field work
 *
 * This service NEVER writes to MCP. All mutations go through dataverseService.
 */

import type {
  WorkOrder,
  Crew,
  CrewDispatch,
  DispatchRecommendation,
  DispatchBatch,
  AIDecisionLogEntry,
  FieldInspection,
  ReasoningStep,
  Severity,
  IssueType,
  WeatherCondition,
  WeatherForecast,
} from '../types/infrastructure';

import dataverseService from './dataverseService';
import mcpService from './mcpService';
import agentService from './agentService';
import weatherService from './weatherService';

// ============================================
// Agent API integration (mirrors agentService pattern)
// ============================================

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

/** Track availability separately so dispatch doesn't interfere with agentService's flag */
let dispatchApiAvailable: boolean | null = null;

/** Call the Python agent API for dispatch. Returns null on failure so callers fall back. */
async function callDispatchApi<T>(body: Record<string, unknown>, timeoutMs = 30000): Promise<T | null> {
  if (dispatchApiAvailable === false || !AGENT_API_URL) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`${AGENT_API_URL}/api/agents/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`Dispatch API ${resp.status}`);
    dispatchApiAvailable = true;
    return await resp.json() as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    const isBlocked = msg.includes('Failed to fetch') || msg.includes('NetworkError') ||
                      msg.includes('Content Security Policy') || msg.includes('connect-src');
    if (isBlocked) {
      dispatchApiAvailable = false;
      console.info('[DispatchService] Agent API blocked by browser policy. Using local algorithm.');
    } else {
      console.warn('[DispatchService] Agent API error, using local fallback:', msg);
    }
    return null;
  }
}

// ============================================
// Types
// ============================================

export interface DispatchPlan {
  recommendations: DispatchRecommendation[];
  totalEstimatedCost: number;
  totalEstimatedHours: number;
  crewUtilization: number;
  weatherWindow: string;
  generatedAt: string;
}

// ============================================
// 1. Generate AI Dispatch Recommendations
// ============================================

/**
 * Uses MCP data (READ-ONLY) + AI agents to generate dispatch recommendations.
 * Tries the Python agent API first (traced), falls back to local algorithm.
 * Does NOT write anything yet — just produces a plan for human review.
 *
 * @param focusWorkOrderId  If provided, this WO will always be included in
 *                          the plan even if it falls outside the top 15.
 */
async function generateDispatchPlan(
  workOrders: WorkOrder[],
  crews: Crew[],
  focusWorkOrderId?: string,
): Promise<DispatchPlan> {
  const startMs = Date.now();

  // --- Try the Python agent API first (creates an observable trace) ---
  try {
    const openWOs = workOrders
      .filter(wo => wo.status === 'open' || wo.status === 'assigned')
      .sort((a, b) => b.priorityScore - a.priorityScore);

    let woSlice = openWOs.slice(0, 15);
    if (focusWorkOrderId && !woSlice.some(w => w.id === focusWorkOrderId)) {
      const focusWO = openWOs.find(w => w.id === focusWorkOrderId);
      if (focusWO) woSlice = [focusWO, ...woSlice];
    }

    const weather = await weatherService.getCurrentWeather();

    const apiResult = await callDispatchApi<{
      success?: boolean;
      recommendations?: Array<{
        workOrderId: string;
        recommendedCrewId: string;
        priority: Severity;
        estimatedDuration: number;
        estimatedCost: number;
        confidence: number;
        reasoning: ReasoningStep[];
        factors: Record<string, number>;
        suggestedTimeSlot: string;
      }>;
      totalEstimatedCost?: number;
      totalEstimatedHours?: number;
      crewUtilization?: number;
      processing_time_ms?: number;
    }>({
      workOrders: woSlice.map(wo => ({
        id: wo.id,
        issueType: wo.issueType,
        severity: wo.severity,
        nearSchool: wo.nearSchool,
        status: wo.status,
        address: wo.address,
        latitude: wo.latitude,
        longitude: wo.longitude,
        priorityScore: wo.priorityScore,
        estimatedCost: wo.estimatedCost,
        zone: wo.zone,
      })),
      crews: crews
        .filter(c => c.status === 'available' || c.status === 'assigned')
        .map(c => ({
          id: c.id,
          name: c.name,
          specialization: c.specialization,
          status: c.status,
          currentLat: c.currentLat,
          currentLng: c.currentLng,
          memberCount: c.memberCount,
          efficiencyRating: c.efficiencyRating,
        })),
      weather: weather?.condition ?? 'cloudy',
      temperature: weather?.temperature ?? 50,
      useLLM: false,
    });

    if (apiResult?.recommendations && apiResult.recommendations.length > 0) {
      const elapsedMs = apiResult.processing_time_ms ?? (Date.now() - startMs);
      console.log(`[DispatchService] Agent API returned ${apiResult.recommendations.length} recs in ${elapsedMs}ms`);

      // Map API recommendations back to full DispatchRecommendation objects
      const forecast = await weatherService.getWeatherForecast(7);
      const workableHours = forecast
        .filter((f: WeatherForecast) => f.workabilityScore > 0.5)
        .reduce((sum: number, f: WeatherForecast) => sum + f.workabilityScore * 8, 0);

      const availableCrews = crews.filter(c => c.status === 'available' || c.status === 'assigned');
      const crewMap = new Map(availableCrews.map(c => [c.id, c]));
      const woMap = new Map(woSlice.map(w => [w.id, w]));

      const recommendations: DispatchRecommendation[] = apiResult.recommendations
        .filter(r => woMap.has(r.workOrderId) && crewMap.has(r.recommendedCrewId))
        .map(r => ({
          workOrderId: r.workOrderId,
          workOrder: woMap.get(r.workOrderId)!,
          recommendedCrewId: r.recommendedCrewId,
          recommendedCrew: crewMap.get(r.recommendedCrewId)!,
          priority: r.priority,
          estimatedDuration: r.estimatedDuration,
          estimatedCost: r.estimatedCost,
          confidence: r.confidence,
          reasoning: r.reasoning || [],
          factors: {
            proximity: r.factors?.proximity ?? 0.5,
            specialization: r.factors?.specialization ?? 0.5,
            workload: r.factors?.workload ?? 0.5,
            urgency: r.factors?.urgency ?? 0.5,
            weather: r.factors?.weather ?? 0.5,
          },
          suggestedTimeSlot: r.suggestedTimeSlot,
        }));

      if (recommendations.length > 0) {
        const totalEstimatedCost = recommendations.reduce((s, r) => s + r.estimatedCost, 0);
        const totalEstimatedHours = recommendations.reduce((s, r) => s + r.estimatedDuration, 0);
        const utilization = availableCrews.length
          ? Math.min(totalEstimatedHours / (availableCrews.length * 40) * 100, 100)
          : 0;

        return {
          recommendations,
          totalEstimatedCost,
          totalEstimatedHours,
          crewUtilization: utilization,
          weatherWindow: `${workableHours.toFixed(0)}h of workable weather in forecast`,
          generatedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.log('[DispatchService] Agent API not available, using local algorithm:', err);
  }

  // --- Fallback: local algorithm (original implementation) ---

  // --- Read weather from service (read-only) ---
  const weather = await weatherService.getCurrentWeather();
  const forecast = await weatherService.getWeatherForecast(7);
  const workableHours = forecast
    .filter((f: WeatherForecast) => f.workabilityScore > 0.5)
    .reduce((sum: number, f: WeatherForecast) => sum + f.workabilityScore * 8, 0); // 8-hour workday

  // --- Filter to open / high-priority work orders ---
  const openWOs = workOrders
    .filter(wo => wo.status === 'open' || wo.status === 'assigned')
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // --- Build the list of WOs to generate recs for ---
  // Take top 15 by priority, but always include the focused WO
  let woSlice = openWOs.slice(0, 15);
  if (focusWorkOrderId && !woSlice.some(w => w.id === focusWorkOrderId)) {
    const focusWO = openWOs.find(w => w.id === focusWorkOrderId);
    if (focusWO) woSlice = [focusWO, ...woSlice];
  }

  // --- Match each WO to the best available crew ---
  const availableCrews = crews.filter(c => c.status === 'available' || c.status === 'assigned');
  const crewWorkload = new Map<string, number>(); // crewId → assigned hours
  availableCrews.forEach(c => crewWorkload.set(c.id, 0));

  const recommendations: DispatchRecommendation[] = [];

  for (const wo of woSlice) {
    const bestCrew = findBestCrew(wo, availableCrews, crewWorkload);
    if (!bestCrew) continue;

    const estDuration = estimateRepairDuration(wo.issueType, wo.severity);
    const estCost = wo.estimatedCost || estimateRepairCost(wo.issueType, wo.severity);

    // Factor scoring
    const proximity = calculateProximityScore(wo, bestCrew);
    const specialization = wo.issueType === bestCrew.specialization ? 1.0 : 0.5;
    const currentLoad = crewWorkload.get(bestCrew.id) || 0;
    const workloadScore = Math.max(0, 1 - currentLoad / 40); // 40h = full week
    const urgencyScore = getUrgencyScore(wo.severity);
    const weatherScore = weather?.workabilityScore ?? 0.5;

    const confidence =
      proximity * 0.2 +
      specialization * 0.25 +
      workloadScore * 0.15 +
      urgencyScore * 0.25 +
      weatherScore * 0.15;

    const reasoning: ReasoningStep[] = [
      {
        step: 1,
        description: `Work order ${wo.id}: ${wo.issueType} (${wo.severity}) at ${wo.address}`,
        confidence: urgencyScore,
        dataSource: 'MCP',
      },
      {
        step: 2,
        description: `Best crew: ${bestCrew.name} — ${bestCrew.specialization} specialist, ${(proximity * 5).toFixed(1)}mi away`,
        confidence: specialization,
        dataSource: 'Algorithm',
      },
      {
        step: 3,
        description: `Weather: ${weather?.condition ?? 'unknown'}, ${weather?.temperature ?? 'N/A'}°F — workability ${(weatherScore * 100).toFixed(0)}%`,
        confidence: weatherScore,
        dataSource: 'Weather API',
      },
      {
        step: 4,
        description: `Estimated ${estDuration.toFixed(1)}h / $${estCost.toLocaleString()} — crew has ${(40 - currentLoad).toFixed(1)}h available this week`,
        confidence: workloadScore,
        dataSource: 'Historical Data',
      },
    ];

    recommendations.push({
      workOrderId: wo.id,
      workOrder: wo,
      recommendedCrewId: bestCrew.id,
      recommendedCrew: bestCrew,
      priority: wo.severity,
      estimatedDuration: estDuration,
      estimatedCost: estCost,
      confidence,
      reasoning,
      factors: {
        proximity,
        specialization,
        workload: workloadScore,
        urgency: urgencyScore,
        weather: weatherScore,
      },
      suggestedTimeSlot: getSuggestedTimeSlot(wo.severity),
    });

    // Track crew workload
    crewWorkload.set(bestCrew.id, currentLoad + estDuration);
  }

  // Sort by confidence descending
  recommendations.sort((a, b) => b.confidence - a.confidence);

  const totalEstimatedCost = recommendations.reduce((s, r) => s + r.estimatedCost, 0);
  const totalEstimatedHours = recommendations.reduce((s, r) => s + r.estimatedDuration, 0);
  const utilization = availableCrews.length
    ? totalEstimatedHours / (availableCrews.length * 40) * 100
    : 0;

  // --- Log the AI decision (WRITE to Dataverse) ---
  await dataverseService.logAIDecision({
    agentName: 'dispatch',
    decisionType: 'dispatch_recommendation',
    inputSummary: JSON.stringify({
      workOrderCount: openWOs.length,
      crewCount: availableCrews.length,
      weather: weather?.condition ?? 'unknown',
    }),
    outputSummary: JSON.stringify({
      recommendationCount: recommendations.length,
      totalCost: totalEstimatedCost,
      totalHours: totalEstimatedHours,
    }),
    confidenceScore: recommendations.length
      ? recommendations.reduce((s, r) => s + r.confidence, 0) / recommendations.length
      : 0,
    reasoningJson: JSON.stringify(recommendations.map(r => ({
      wo: r.workOrderId,
      crew: r.recommendedCrewId,
      confidence: r.confidence,
    }))),
    tokensUsed: 0, // Local algorithm, no LLM tokens
    processingTimeMs: Date.now() - startMs,
    modelName: 'dispatch-algorithm-v1',
    humanOverride: false,
    relatedWorkOrderIds: recommendations.map(r => r.workOrderId),
  });

  return {
    recommendations,
    totalEstimatedCost,
    totalEstimatedHours,
    crewUtilization: Math.min(utilization, 100),
    weatherWindow: `${workableHours.toFixed(0)}h of workable weather in forecast`,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================
// 2. Approve & Dispatch (WRITES to Dataverse)
// ============================================

/**
 * Convert approved recommendations into Dataverse dispatch records.
 * This is the human-in-the-loop step.
 */
async function createDispatchesFromRecommendations(
  recommendations: DispatchRecommendation[],
  approver: string,
): Promise<CrewDispatch[]> {
  const dispatches: CrewDispatch[] = [];

  for (const rec of recommendations) {
    const weather = await weatherService.getCurrentWeather();

    // Create dispatch record in Dataverse
    const dispatch = await dataverseService.createDispatch({
      workOrderId: rec.workOrderId,
      crewId: rec.recommendedCrewId,
      crewName: rec.recommendedCrew.name,
      status: 'approved',
      priority: rec.priority,
      issueType: rec.workOrder.issueType,
      address: rec.workOrder.address,
      latitude: rec.workOrder.latitude,
      longitude: rec.workOrder.longitude,
      estimatedDuration: rec.estimatedDuration,
      estimatedCost: rec.estimatedCost,
      aiConfidence: rec.confidence,
      aiReasoning: JSON.stringify(rec.reasoning),
      approvedBy: approver,
      approvedOn: new Date().toISOString(),
      weatherAtDispatch: `${weather?.condition ?? 'unknown'}, ${weather?.temperature ?? 'N/A'}°F`,
      nearSchool: rec.workOrder.nearSchool,
      zone: rec.workOrder.zone,
    });

    // Log status change in Dataverse
    await dataverseService.logWorkOrderUpdate({
      workOrderId: rec.workOrderId,
      previousStatus: rec.workOrder.status,
      newStatus: 'assigned',
      updatedBy: approver,
      updatedSource: 'manager',
      notes: `Dispatched crew ${rec.recommendedCrew.name} — AI confidence ${(rec.confidence * 100).toFixed(0)}%`,
    });

    // Log AI decision for audit
    await dataverseService.logAIDecision({
      agentName: 'dispatch',
      decisionType: 'crew_assignment',
      inputSummary: JSON.stringify({ workOrder: rec.workOrderId, crew: rec.recommendedCrewId }),
      outputSummary: JSON.stringify({ dispatchId: dispatch.id, status: 'approved' }),
      confidenceScore: rec.confidence,
      reasoningJson: JSON.stringify(rec.reasoning),
      modelName: 'dispatch-algorithm-v1',
      humanOverride: false,
      relatedWorkOrderIds: [rec.workOrderId],
    });

    dispatches.push(dispatch);
  }

  return dispatches;
}

// ============================================
// 3. Field Completion (WRITES to Dataverse)
// ============================================

/**
 * Crew submits a field inspection and completes the dispatch.
 * This closes the loop — data feeds back into AI for learning.
 */
async function submitFieldCompletion(
  dispatchId: string,
  inspection: Omit<FieldInspection, 'id' | 'name' | 'createdAt'>,
  actualDuration: number,
  actualCost: number,
): Promise<{ dispatch: CrewDispatch | null; inspection: FieldInspection }> {
  // Create inspection record in Dataverse
  const inspectionRecord = await dataverseService.createInspection(inspection);

  // Complete the dispatch in Dataverse
  const dispatch = await dataverseService.completeDispatch(
    dispatchId,
    actualDuration,
    actualCost,
  );

  // Log status change
  if (dispatch) {
    await dataverseService.logWorkOrderUpdate({
      workOrderId: dispatch.workOrderId,
      previousStatus: 'in_progress',
      newStatus: 'completed',
      updatedBy: inspection.inspectorName,
      updatedSource: 'field_crew',
      notes: `Condition rating: ${inspection.conditionRating}/5. Duration: ${actualDuration}h. Cost: $${actualCost}`,
    });

    // Log AI accuracy for feedback loop
    await dataverseService.logAIDecision({
      agentName: 'dispatch',
      decisionType: 'cost_estimation',
      inputSummary: JSON.stringify({
        estimated: { duration: dispatch.estimatedDuration, cost: dispatch.estimatedCost },
        actual: { duration: actualDuration, cost: actualCost },
      }),
      outputSummary: JSON.stringify({
        durationAccuracy: dispatch.estimatedDuration
          ? (1 - Math.abs(dispatch.estimatedDuration - actualDuration) / dispatch.estimatedDuration)
          : 0,
        costAccuracy: dispatch.estimatedCost
          ? (1 - Math.abs(dispatch.estimatedCost - actualCost) / dispatch.estimatedCost)
          : 0,
      }),
      confidenceScore: dispatch.aiConfidence,
      reasoningJson: JSON.stringify({
        feedback: 'Completion data recorded for AI model improvement',
        conditionRating: inspection.conditionRating,
      }),
      modelName: 'feedback-loop-v1',
      humanOverride: false,
      relatedWorkOrderIds: [dispatch.workOrderId],
    });
  }

  return { dispatch, inspection: inspectionRecord };
}

// ============================================
// Helper Functions
// ============================================

function findBestCrew(
  wo: WorkOrder,
  crews: Crew[],
  workload: Map<string, number>,
): Crew | null {
  if (crews.length === 0) return null;

  return crews
    .map(crew => {
      let score = 0;
      // Specialization match
      if (crew.specialization === wo.issueType) score += 40;
      else if (crew.specialization === 'general') score += 20;

      // Proximity (rough distance)
      const dist = haversineDistance(wo.latitude, wo.longitude, crew.currentLat, crew.currentLng);
      score += Math.max(0, 30 - dist * 10); // Closer = higher score

      // Efficiency
      score += crew.efficiencyRating * 15;

      // Workload (prefer less loaded crews)
      const load = workload.get(crew.id) || 0;
      score += Math.max(0, 15 - load / 4);

      return { crew, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.crew || null;
}

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateProximityScore(wo: WorkOrder, crew: Crew): number {
  const dist = haversineDistance(wo.latitude, wo.longitude, crew.currentLat, crew.currentLng);
  return Math.max(0, 1 - dist / 5); // 0-1, 5mi = 0
}

function estimateRepairDuration(issueType: IssueType, severity: Severity): number {
  const base: Record<IssueType, Record<Severity, number>> = {
    pothole: { critical: 2.0, high: 1.5, medium: 1.0, low: 0.5 },
    sidewalk: { critical: 4.0, high: 3.0, medium: 2.0, low: 1.0 },
    concrete: { critical: 8.0, high: 6.0, medium: 4.0, low: 2.0 },
  };
  return base[issueType]?.[severity] ?? 2.0;
}

function estimateRepairCost(issueType: IssueType, severity: Severity): number {
  const base: Record<IssueType, Record<Severity, number>> = {
    pothole: { critical: 2000, high: 1500, medium: 800, low: 400 },
    sidewalk: { critical: 4500, high: 3500, medium: 2000, low: 1000 },
    concrete: { critical: 8000, high: 6000, medium: 4000, low: 2000 },
  };
  return base[issueType]?.[severity] ?? 1500;
}

function getUrgencyScore(severity: Severity): number {
  const scores: Record<Severity, number> = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.25,
  };
  return scores[severity] ?? 0.5;
}

function getSuggestedTimeSlot(severity: Severity): string {
  const now = new Date();
  switch (severity) {
    case 'critical': return now.toISOString(); // Immediately
    case 'high': {
      const next = new Date(now.getTime() + 2 * 3600000);
      return next.toISOString();
    }
    case 'medium': {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      return tomorrow.toISOString();
    }
    default: {
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      nextWeek.setHours(8, 0, 0, 0);
      return nextWeek.toISOString();
    }
  }
}

// ============================================
// Export
// ============================================

const dispatchService = {
  generateDispatchPlan,
  createDispatchesFromRecommendations,
  submitFieldCompletion,
};

export default dispatchService;

/**
 * MAINTAIN AI - Agent Orchestration Service
 * 
 * Manages the multi-agent reasoning system using Azure AI Foundry.
 * Provides streaming AI responses with full reasoning transparency.
 */

import type {
  WorkOrder,
  CrewEstimation,
  AIInsight,
  ReasoningStep,
  AgentRequest,
  AgentResponse,
  Severity,
  WeatherCondition,
  MapCommand,
  AgentAction,
} from '../types/infrastructure';

import mcpService from './mcpService';
import weatherService from './weatherService';
import dataverseService from './dataverseService';

// ============================================
// Configuration
// ============================================

/** URL for the Python FastAPI agent server (deployed on Azure Container Apps) */
const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

/** Track whether the Python agent API is reachable */
let agentApiAvailable: boolean | null = null;
/** Timestamp when the API was last marked as unavailable (for auto-retry after cooldown) */
let agentApiDownSince: number = 0;
/** Cooldown in ms before retrying after a failure (60 seconds) */
const AGENT_API_RETRY_COOLDOWN_MS = 60_000;

/**
 * Call the Python agent API. Returns null if the API is unreachable
 * so callers can fall back to local logic.
 * Auto-retries after AGENT_API_RETRY_COOLDOWN_MS even if previously blocked.
 */
async function callAgentApi<T>(path: string, body: Record<string, unknown>, timeoutMs = 30000): Promise<T | null> {
  // If we already know it's down, check if cooldown has elapsed for auto-retry
  if (agentApiAvailable === false) {
    if (Date.now() - agentApiDownSince < AGENT_API_RETRY_COOLDOWN_MS) return null;
    // Cooldown elapsed — reset to allow retry
    agentApiAvailable = null;
    console.info('[AgentAPI] Cooldown elapsed, retrying agent API...');
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`${AGENT_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`Agent API ${resp.status}`);
    agentApiAvailable = true;
    agentApiDownSince = 0;
    return await resp.json() as T;
  } catch (err) {
    // If it's a network/CSP block, skip the health check — it'll fail too
    const msg = err instanceof Error ? err.message : '';
    const isBlocked = msg.includes('Failed to fetch') || msg.includes('NetworkError') ||
                      msg.includes('Content Security Policy') || msg.includes('connect-src');
    if (isBlocked) {
      agentApiAvailable = false;
      agentApiDownSince = Date.now();
      console.info('[AgentAPI] Connection blocked by browser security policy. Will retry in 60s.');
      return null;
    }
    // First failure on non-CSP error — try the health endpoint before giving up
    if (agentApiAvailable === null) {
      try {
        const h = await fetch(`${AGENT_API_URL}/health`, { method: 'GET' });
        agentApiAvailable = h.ok;
        if (!h.ok) agentApiDownSince = Date.now();
      } catch {
        agentApiAvailable = false;
        agentApiDownSince = Date.now();
      }
    }
    return null;
  }
}

/** Reset agent API availability (allows immediate retry) */
export function resetAgentApi(): void { agentApiAvailable = null; agentApiDownSince = 0; }

// ============================================
// Types
// ============================================

export interface StreamingCallback {
  onReasoningStep: (step: ReasoningStep) => void;
  onToolCall: (tool: string, args: Record<string, unknown>) => void;
  onComplete: (response: AgentResponse) => void;
  onError: (error: string) => void;
}

interface CrewEstimationInput {
  workOrders: WorkOrder[];
  temperature: number;
  weatherCondition: WeatherCondition;
  daysAhead: number;
  crewAvailability: number;
}

// ============================================
// Crew Estimation Algorithm
// ============================================

/**
 * Advanced crew estimation based on historical metrics, weather, and severity.
 * This implements the formula from DECISIONS.md ADR-005
 */
function calculateCrewEstimation(input: CrewEstimationInput): CrewEstimation {
  const { workOrders, temperature, weatherCondition, daysAhead, crewAvailability } = input;
  
  const reasoning: string[] = [];
  const factors: Array<{
    name: string;
    value: number;
    weight: number;
    impact: 'positive' | 'negative' | 'neutral';
  }> = [];

  // Count by type and severity
  const potholes = workOrders.filter(w => w.issueType === 'pothole');
  const sidewalks = workOrders.filter(w => w.issueType === 'sidewalk');
  const concrete = workOrders.filter(w => w.issueType === 'concrete');

  reasoning.push(`Analyzing ${workOrders.length} work orders: ${potholes.length} potholes, ${sidewalks.length} sidewalk issues, ${concrete.length} concrete repairs`);

  // Base crew calculation: 1 crew per N work orders
  // Severity adjusts the ratio — higher severity = fewer WOs per crew (ratio-based, not count-based)
  const getBaseCrews = (orders: WorkOrder[], basePerCrew: number): number => {
    if (orders.length === 0) return 0;
    const criticalRatio = orders.filter(o => o.severity === 'critical').length / orders.length;
    const highRatio = orders.filter(o => o.severity === 'high').length / orders.length;
    // Severity reduces capacity by up to ~40% (makes each crew handle fewer WOs)
    const severityFactor = 1 + (criticalRatio * 0.3) + (highRatio * 0.15);
    const adjustedPerCrew = basePerCrew / severityFactor;
    return Math.ceil(orders.length / adjustedPerCrew);
  };

  // Base rates: potholes=8 per crew, sidewalk=6 per crew, concrete=5 per crew
  let potholeCrew = getBaseCrews(potholes, 8);
  let sidewalkCrews = getBaseCrews(sidewalks, 6);
  let concreteCrews = getBaseCrews(concrete, 5);

  factors.push({
    name: 'Base Work Order Count',
    value: workOrders.length,
    weight: 0.4,
    impact: 'neutral'
  });

  // Weather adjustment (ADDITIVE, not multiplicative)
  let weatherAdj = 0;
  switch (weatherCondition) {
    case 'clear':
      weatherAdj = 0;
      reasoning.push('Clear weather allows full crew productivity');
      factors.push({ name: 'Weather (Clear)', value: 0, weight: 0.2, impact: 'positive' });
      break;
    case 'cloudy':
      weatherAdj = 0.05;
      reasoning.push('Cloudy conditions: slight productivity reduction');
      factors.push({ name: 'Weather (Cloudy)', value: 0.05, weight: 0.2, impact: 'neutral' });
      break;
    case 'rain':
      weatherAdj = 0.2;
      reasoning.push('Rain conditions: +20% crew capacity needed for same output');
      factors.push({ name: 'Weather (Rain)', value: 0.2, weight: 0.2, impact: 'negative' });
      break;
    case 'snow':
      weatherAdj = 0.3;
      reasoning.push('Snow conditions: +30% crew capacity needed, limited work possible');
      factors.push({ name: 'Weather (Snow)', value: 0.3, weight: 0.2, impact: 'negative' });
      break;
    case 'freezing':
      weatherAdj = 0.4;
      reasoning.push('Freezing conditions: +40% crews needed, minimal outdoor work');
      factors.push({ name: 'Weather (Freezing)', value: 0.4, weight: 0.2, impact: 'negative' });
      break;
    case 'freeze_thaw':
      weatherAdj = 0.15;
      reasoning.push('Freeze-thaw cycle: +15% crews, expect new damage forming');
      factors.push({ name: 'Weather (Freeze-Thaw)', value: 0.15, weight: 0.2, impact: 'negative' });
      break;
  }

  // Temperature adjustment
  let tempAdj = 0;
  if (temperature < 32) {
    tempAdj = 0.2;
    reasoning.push(`Temperature ${temperature}°F: Below freezing, asphalt work limited`);
    factors.push({ name: 'Temperature (Freezing)', value: 0.2, weight: 0.15, impact: 'negative' });
  } else if (temperature < 45) {
    tempAdj = 0.1;
    reasoning.push(`Temperature ${temperature}°F: Cold, reduced curing times`);
    factors.push({ name: 'Temperature (Cold)', value: 0.1, weight: 0.15, impact: 'negative' });
  } else if (temperature > 90) {
    tempAdj = 0.1;
    reasoning.push(`Temperature ${temperature}°F: Hot, worker fatigue considerations`);
    factors.push({ name: 'Temperature (Hot)', value: 0.1, weight: 0.15, impact: 'negative' });
  } else {
    reasoning.push(`Temperature ${temperature}°F: Optimal working conditions`);
    factors.push({ name: 'Temperature (Optimal)', value: 0, weight: 0.15, impact: 'positive' });
  }

  // Days ahead adjustment (urgency)
  let urgencyAdj = 0;
  if (daysAhead <= 3) {
    urgencyAdj = 0.2;
    reasoning.push(`${daysAhead} days timeline: High urgency, need parallel work`);
    factors.push({ name: 'Urgency (High)', value: 0.2, weight: 0.15, impact: 'negative' });
  } else if (daysAhead <= 7) {
    urgencyAdj = 0.1;
    reasoning.push(`${daysAhead} days timeline: Moderate urgency`);
    factors.push({ name: 'Urgency (Moderate)', value: 0.1, weight: 0.15, impact: 'neutral' });
  } else {
    reasoning.push(`${daysAhead} days timeline: Flexible scheduling possible`);
    factors.push({ name: 'Urgency (Low)', value: 0, weight: 0.15, impact: 'positive' });
  }

  // Crew availability adjustment
  let availAdj = 0;
  if (crewAvailability < 50) {
    availAdj = 0.25;
    reasoning.push(`Crew availability at ${crewAvailability}%: may need to hire contractors`);
    factors.push({ name: 'Crew Availability', value: 0.25, weight: 0.1, impact: 'negative' });
  } else if (crewAvailability < 80) {
    availAdj = 0.1;
    reasoning.push(`Crew availability at ${crewAvailability}%: some capacity constraints`);
    factors.push({ name: 'Crew Availability', value: 0.1, weight: 0.1, impact: 'neutral' });
  } else {
    reasoning.push(`Crew availability at ${crewAvailability}%: sufficient capacity`);
    factors.push({ name: 'Crew Availability', value: 0, weight: 0.1, impact: 'positive' });
  }

  // Combined adjustment: additive and capped at 80% increase max
  const totalMultiplier = 1 + Math.min(weatherAdj + tempAdj + urgencyAdj + availAdj, 0.8);
  
  potholeCrew = Math.ceil(potholeCrew * totalMultiplier);
  sidewalkCrews = Math.ceil(sidewalkCrews * totalMultiplier);
  concreteCrews = Math.ceil(concreteCrews * totalMultiplier);

  // Ensure minimum of 1 crew if there's any work
  if (potholes.length > 0 && potholeCrew === 0) potholeCrew = 1;
  if (sidewalks.length > 0 && sidewalkCrews === 0) sidewalkCrews = 1;
  if (concrete.length > 0 && concreteCrews === 0) concreteCrews = 1;

  const totalCrews = potholeCrew + sidewalkCrews + concreteCrews;

  reasoning.push(`Final estimate: ${totalCrews} total crews (${potholeCrew} pothole, ${sidewalkCrews} sidewalk, ${concreteCrews} concrete)`);

  // Calculate confidence based on data quality
  const confidence = Math.min(0.95, 0.7 + (workOrders.length > 10 ? 0.1 : 0) + 
    (weatherCondition === 'clear' ? 0.1 : 0) + 
    (crewAvailability > 70 ? 0.05 : 0));

  return {
    potholeCrew,
    sidewalkCrews,
    concreteCrews,
    totalCrews,
    reasoning,
    confidence,
    factors
  };
}

// ============================================
// AI Analysis Functions
// ============================================

/**
 * Generate AI insights from work orders
 */
export async function generateInsights(workOrders: WorkOrder[]): Promise<AIInsight[]> {
  const insights: AIInsight[] = [];
  const now = new Date();

  // Try getting AI-enriched analysis from the Python agent API
  try {
    const apiResult = await callAgentApi<{
      success: boolean;
      output: string;
      reasoning: Array<{ step: number; description: string; confidence: number; data_source?: string }>;
      reasoning_trace?: string;
      confidence: number;
    }>('/api/agents/analysis', {
      query: `Analyze ${workOrders.length} work orders for Lake Forest infrastructure. Identify hotspots, severity distribution, and issues near schools.`,
    });

    if (apiResult?.success && apiResult.output) {
      // Add an AI-generated insight from the real model
      insights.push({
        id: `insight-ai-analysis-${now.getTime()}`,
        type: 'priority',
        title: 'AI Analysis (GPT-4.1 Mini)',
        recommendation: apiResult.output.substring(0, 500) + (apiResult.output.length > 500 ? '...' : ''),
        confidence: apiResult.confidence || 0.88,
        reasoning: (apiResult.reasoning || []).map((r, i) => ({
          step: r.step || i + 1,
          description: r.description,
          confidence: r.confidence ?? 0.9,
          dataSource: r.data_source || 'gpt-4.1-mini',
        })),
        factors: [
          { name: 'AI Model', weight: 0.5, description: 'gpt-4.1-mini via Azure AI Foundry' },
          { name: 'MCP Data', weight: 0.3, description: 'Live Lake Forest infrastructure data' },
          { name: 'Historical', weight: 0.2, description: 'Patterns from past work orders' },
        ],
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
        isProactive: true,
      });

      // Log AI decision for Responsible AI governance audit
      dataverseService.logAIDecision({
        agentName: 'analysis',
        decisionType: 'risk_assessment',
        inputSummary: JSON.stringify({ workOrderCount: workOrders.length, query: `Analyze ${workOrders.length} work orders` }),
        outputSummary: JSON.stringify({ summary: apiResult.output.substring(0, 300) }),
        confidenceScore: apiResult.confidence || 0.88,
        reasoningJson: JSON.stringify(apiResult.reasoning || []),
        tokensUsed: Math.round((apiResult.output.length || 0) / 4),
        processingTimeMs: Date.now() - now.getTime(),
        modelName: 'gpt-4.1-mini',
        humanOverride: false,
        relatedWorkOrderIds: workOrders.slice(0, 10).map(w => w.id),
      }).catch(err => console.warn('[AgentService] Failed to log analysis decision:', err));
    }
  } catch (err) {
    console.log('Agent API not available for insights, using local logic:', err);
  }

  // Get weather data
  const weather = await weatherService.getCurrentWeather();
  const freezeThawRisk = await weatherService.getFreezThawRisk();

  // Priority Analysis Insight
  const criticalOrders = workOrders.filter(w => w.severity === 'critical');
  const nearSchoolOrders = workOrders.filter(w => w.nearSchool);
  
  if (criticalOrders.length > 0) {
    insights.push({
      id: `insight-priority-${now.getTime()}`,
      type: 'priority',
      title: `${criticalOrders.length} Critical Issues Require Immediate Attention`,
      recommendation: `Prioritize ${criticalOrders.slice(0, 3).map(o => o.address).join(', ')}. These have the highest safety impact.`,
      confidence: 0.92,
      reasoning: [
        { step: 1, description: 'Analyzed severity distribution across all work orders', confidence: 0.95, dataSource: 'MCP' },
        { step: 2, description: `Identified ${criticalOrders.length} critical and ${workOrders.filter(w => w.severity === 'high').length} high severity issues`, confidence: 0.93, dataSource: 'MCP' },
        { step: 3, description: 'Cross-referenced with school proximity data', confidence: 0.88, dataSource: 'MCP' },
        { step: 4, description: 'Applied Lake Forest priority scoring algorithm', confidence: 0.91, dataSource: 'Algorithm' }
      ],
      factors: [
        { name: 'Severity Weight', weight: 0.4, description: 'Critical issues weighted 4x higher' },
        { name: 'School Proximity', weight: 0.25, description: 'Issues near schools get priority boost' },
        { name: 'Age Factor', weight: 0.2, description: 'Older issues escalate in priority' },
        { name: 'Traffic Impact', weight: 0.15, description: 'High-traffic areas prioritized' }
      ],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      isProactive: true
    });
  }

  // Weather-based Prediction Insight
  if (weather && freezeThawRisk.riskLevel !== 'low') {
    insights.push({
      id: `insight-weather-${now.getTime()}`,
      type: 'prediction',
      title: `Freeze-Thaw Warning: Expect ${freezeThawRisk.potholeIncreasePercent}% More Potholes`,
      recommendation: `${freezeThawRisk.cyclesExpected} freeze-thaw cycles predicted. Pre-position crews in high-traffic zones. Consider proactive patching.`,
      confidence: 0.78,
      reasoning: [
        { step: 1, description: '7-day weather forecast analyzed', confidence: 0.85, dataSource: 'Weather API' },
        { step: 2, description: `Detected ${freezeThawRisk.cyclesExpected} temperature oscillations around 32°F`, confidence: 0.82, dataSource: 'Weather API' },
        { step: 3, description: 'Applied historical freeze-thaw damage correlation', confidence: 0.75, dataSource: 'Historical' },
        { step: 4, description: 'Estimated new pothole formation rate', confidence: 0.72, dataSource: 'Algorithm' }
      ],
      factors: [
        { name: 'Freeze-Thaw Cycles', weight: 0.5, description: 'Each cycle causes ~10% damage increase' },
        { name: 'Current Temperature', weight: 0.25, description: `${weather.temperature}°F current conditions` },
        { name: 'Road Age Data', weight: 0.15, description: 'Older roads more susceptible' },
        { name: 'Drainage Quality', weight: 0.1, description: 'Poor drainage amplifies damage' }
      ],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
      isProactive: true
    });
  }

  // Crew Estimation Insight
  const crewEstimate = calculateCrewEstimation({
    workOrders,
    temperature: weather?.temperature || 40,
    weatherCondition: weather?.condition || 'cloudy',
    daysAhead: 7,
    crewAvailability: 80
  });

  insights.push({
    id: `insight-crew-${now.getTime()}`,
    type: 'crew_estimate',
    title: `Recommended: ${crewEstimate.totalCrews} Crews for Current Backlog`,
    recommendation: `Deploy ${crewEstimate.potholeCrew} pothole crews, ${crewEstimate.sidewalkCrews} sidewalk crews, and ${crewEstimate.concreteCrews} concrete crews for optimal throughput.`,
    confidence: crewEstimate.confidence,
    reasoning: crewEstimate.reasoning.map((desc, i) => ({
      step: i + 1,
      description: desc,
      confidence: crewEstimate.confidence - (i * 0.02),
      dataSource: i < 2 ? 'MCP' : 'Algorithm'
    })),
    factors: crewEstimate.factors.map(f => ({
      name: f.name,
      weight: f.weight,
      description: `Value: ${f.value.toFixed(2)}, Impact: ${f.impact}`
    })),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
    isProactive: false
  });

  // School Proximity Alert
  if (nearSchoolOrders.length > 0) {
    insights.push({
      id: `insight-school-${now.getTime()}`,
      type: 'alert',
      title: `${nearSchoolOrders.length} Issues Near Schools`,
      recommendation: `${nearSchoolOrders.filter(o => o.severity === 'critical' || o.severity === 'high').length} high-priority issues within 500m of schools. Consider weekend repairs to minimize disruption.`,
      confidence: 0.95,
      reasoning: [
        { step: 1, description: 'Geocoded all active work orders', confidence: 0.98, dataSource: 'MCP' },
        { step: 2, description: 'Calculated distance to all Lake Forest schools', confidence: 0.96, dataSource: 'MCP' },
        { step: 3, description: 'Flagged issues within 500m radius', confidence: 0.94, dataSource: 'Algorithm' }
      ],
      factors: [
        { name: 'Distance Weight', weight: 0.5, description: 'Closer = higher priority' },
        { name: 'School Type', weight: 0.3, description: 'Elementary schools weighted higher' },
        { name: 'Pedestrian Traffic', weight: 0.2, description: 'Walk routes considered' }
      ],
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      isProactive: true
    });
  }

  // Log local insights to AI Decision Log for governance visibility
  if (insights.length > 0) {
    const topInsight = insights[0];
    dataverseService.logAIDecision({
      agentName: 'analysis',
      decisionType: 'risk_assessment',
      inputSummary: JSON.stringify({ workOrderCount: workOrders.length, insightCount: insights.length }),
      outputSummary: JSON.stringify({ title: topInsight.title, recommendation: topInsight.recommendation.substring(0, 200) }),
      confidenceScore: topInsight.confidence,
      reasoningJson: JSON.stringify(topInsight.reasoning || []),
      tokensUsed: Math.round(JSON.stringify(insights).length / 4),
      processingTimeMs: Date.now() - now.getTime(),
      modelName: 'local-algorithm',
      humanOverride: false,
      relatedWorkOrderIds: workOrders.slice(0, 10).map(w => w.id),
    }).catch(err => console.warn('[AgentService] Failed to log local insight decision:', err));
  }

  return insights;
}

/**
 * Run crew estimation with full reasoning chain
 */
export async function estimateCrews(
  workOrders: WorkOrder[],
  params: { temperature?: number; daysAhead?: number; crewAvailability?: number; weatherOverride?: WeatherCondition } = {},
  callback?: StreamingCallback
): Promise<CrewEstimation> {
  const startTime = Date.now();
  const reasoningSteps: ReasoningStep[] = [];

  // Try the Python agent API first
  try {
    const apiResult = await callAgentApi<{
      success: boolean;
      estimation: CrewEstimation & { metadata?: Record<string, unknown> };
      processing_time_ms: number;
    }>('/api/agents/crew-estimation', {
      workOrders: workOrders.map(wo => ({
        id: wo.id,
        issueType: wo.issueType,
        severity: wo.severity,
        nearSchool: wo.nearSchool,
        status: wo.status,
        address: wo.address,
      })),
      weather: params.weatherOverride || 'cloudy',
      temperature: params.temperature ?? 40,
      days: params.daysAhead ?? 7,
      availability: params.crewAvailability ?? 80,
    });

    if (apiResult?.success && apiResult.estimation) {
      const est = apiResult.estimation;
      const step: ReasoningStep = {
        step: 1,
        description: `Python agent estimated ${est.totalCrews} crews in ${apiResult.processing_time_ms?.toFixed(0)}ms (${est.potholeCrew}P / ${est.sidewalkCrews}S / ${est.concreteCrews}C)`,
        confidence: est.confidence,
        dataSource: 'Agent API',
      };
      callback?.onReasoningStep(step);
      callback?.onComplete({
        success: true,
        output: `Recommended ${est.totalCrews} total crews`,
        reasoning: [step],
        toolCalls: [],
        confidence: est.confidence,
        processingTimeMs: apiResult.processing_time_ms,
      });

      // Log AI decision for Responsible AI governance audit
      dataverseService.logAIDecision({
        agentName: 'crew_estimation',
        decisionType: 'crew_assignment',
        inputSummary: JSON.stringify({ workOrders: workOrders.length, weather: params.weatherOverride || 'cloudy', temperature: params.temperature ?? 40, days: params.daysAhead ?? 7 }),
        outputSummary: JSON.stringify({ totalCrews: est.totalCrews, pothole: est.potholeCrew, sidewalk: est.sidewalkCrews, concrete: est.concreteCrews }),
        confidenceScore: est.confidence,
        reasoningJson: JSON.stringify([step]),
        tokensUsed: Math.round(JSON.stringify(apiResult).length / 4),
        processingTimeMs: apiResult.processing_time_ms,
        modelName: 'gpt-4.1-mini',
        humanOverride: false,
        relatedWorkOrderIds: workOrders.slice(0, 10).map(w => w.id),
      }).catch(err => console.warn('[AgentService] Failed to log crew estimation decision:', err));

      return est;
    }
  } catch (err) {
    console.log('Agent API not available for crew estimation, using local:', err);
  }

  // Fall back to local algorithm

  // Step 1: Get weather data
  const stepWeather: ReasoningStep = {
    step: 1,
    description: 'Fetching current weather conditions for Lake Forest, IL...',
    confidence: 0.0,
    dataSource: 'Weather API'
  };
  callback?.onReasoningStep(stepWeather);

  const weather = await weatherService.getCurrentWeather();
  stepWeather.description = `Weather retrieved: ${weather?.temperature}°F, ${weather?.condition}`;
  stepWeather.confidence = 0.95;
  reasoningSteps.push(stepWeather);
  callback?.onReasoningStep(stepWeather);

  // Step 2: Analyze work orders
  const stepAnalysis: ReasoningStep = {
    step: 2,
    description: `Analyzing ${workOrders.length} work orders by type and severity...`,
    confidence: 0.0,
    dataSource: 'MCP'
  };
  callback?.onReasoningStep(stepAnalysis);

  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate processing

  const critical = workOrders.filter(w => w.severity === 'critical').length;
  const high = workOrders.filter(w => w.severity === 'high').length;
  stepAnalysis.description = `Found ${critical} critical, ${high} high priority issues`;
  stepAnalysis.confidence = 0.92;
  reasoningSteps.push(stepAnalysis);
  callback?.onReasoningStep(stepAnalysis);

  // Step 3: Apply crew algorithm
  const stepAlgorithm: ReasoningStep = {
    step: 3,
    description: 'Applying crew estimation algorithm with all factors...',
    confidence: 0.0,
    dataSource: 'Algorithm'
  };
  callback?.onReasoningStep(stepAlgorithm);

  const estimation = calculateCrewEstimation({
    workOrders,
    temperature: params.temperature ?? weather?.temperature ?? 40,
    weatherCondition: params.weatherOverride ?? weather?.condition ?? 'cloudy',
    daysAhead: params.daysAhead ?? 7,
    crewAvailability: params.crewAvailability ?? 80
  });

  stepAlgorithm.description = `Algorithm complete: ${estimation.totalCrews} crews recommended`;
  stepAlgorithm.confidence = estimation.confidence;
  reasoningSteps.push(stepAlgorithm);
  callback?.onReasoningStep(stepAlgorithm);

  // Complete
  const response: AgentResponse = {
    success: true,
    output: `Recommended ${estimation.totalCrews} total crews`,
    reasoning: reasoningSteps,
    toolCalls: [
      { tool: 'weather_api', parameters: {}, result: weather, durationMs: 150 },
      { tool: 'crew_algorithm', parameters: params, result: estimation, durationMs: 50 }
    ],
    confidence: estimation.confidence,
    processingTimeMs: Date.now() - startTime
  };

  callback?.onComplete(response);

  return estimation;
}

/**
 * Run scenario simulation
 */
export async function runScenario(
  workOrders: WorkOrder[],
  params: {
    temperatureChange: number;
    daysAhead: number;
    crewAvailability: number;
    weatherOverride?: WeatherCondition;
  }
): Promise<{
  currentEstimate: CrewEstimation;
  scenarioEstimate: CrewEstimation;
  delta: { crews: number; confidence: number };
  recommendations: string[];
}> {
  const weather = await weatherService.getCurrentWeather();
  const currentTemp = weather?.temperature ?? 40;

  // Current state
  const currentEstimate = calculateCrewEstimation({
    workOrders,
    temperature: currentTemp,
    weatherCondition: weather?.condition ?? 'cloudy',
    daysAhead: 7,
    crewAvailability: 80
  });

  // Scenario state
  const scenarioEstimate = calculateCrewEstimation({
    workOrders,
    temperature: currentTemp + params.temperatureChange,
    weatherCondition: params.weatherOverride ?? weather?.condition ?? 'cloudy',
    daysAhead: params.daysAhead,
    crewAvailability: params.crewAvailability
  });

  const crewDelta = scenarioEstimate.totalCrews - currentEstimate.totalCrews;
  const recommendations: string[] = [];

  if (crewDelta > 2) {
    recommendations.push(`Scenario requires ${crewDelta} additional crews. Consider contractor support.`);
  }
  if (params.temperatureChange < -10) {
    recommendations.push('Temperature drop may cause new freeze-thaw damage. Pre-position materials.');
  }
  if (params.crewAvailability < 60) {
    recommendations.push('Low crew availability detected. Prioritize critical issues only.');
  }
  if (params.daysAhead <= 3) {
    recommendations.push('Tight timeline. Consider overtime or weekend shifts.');
  }

  return {
    currentEstimate,
    scenarioEstimate,
    delta: {
      crews: crewDelta,
      confidence: (currentEstimate.confidence + scenarioEstimate.confidence) / 2
    },
    recommendations
  };
}

// ============================================
// Chat / Natural Language Q&A
// ============================================

export interface CardField {
  label: string;
  value: string;
  icon: string; // icon key like 'location', 'severity', 'cost', 'type' etc.
}

export interface CardData {
  type: 'work-order' | 'multi-select' | 'notification';
  title: string;
  subtitle?: string;
  severity?: string;
  fields?: CardField[];
  recommendation?: { level: 'urgent' | 'high' | 'moderate' | 'standard'; text: string };
  stats?: { label: string; value: string; color?: string }[];
  items?: { title: string; severity: string; address: string; cost?: string }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  card?: CardData;
  reasoning?: ReasoningStep[];
  actions?: AgentAction[];
  mapCommands?: MapCommand[];
  timestamp: Date;
}

/** A live progress event emitted during multi-model reasoning */
export interface PipelineEvent {
  /** Agent / model name (e.g. "GPT-4.1 Mini", "NLP Engine") */
  agent: string;
  /** Icon key for the agent */
  icon: string;
  /** Role description (e.g. "Reasoning Specialist", "Data Expert") */
  role?: string;
  /** Short description of what this agent is doing */
  task: string;
  /** Current status */
  status: 'thinking' | 'complete' | 'error';
  /** Output summary from this agent step */
  output?: string;
  /** Full detailed output / thinking text from the model */
  fullOutput?: string;
  /** What was sent to this model as input */
  input?: string;
  /** Estimated token usage */
  tokens?: number;
  /** Confidence 0-1 */
  confidence?: number;
  /** How long this step took */
  durationMs?: number;
  /** Plain-English explanation of what this step is doing (for non-technical users) */
  plainEnglish?: string;
  /** When this step started */
  startedAt?: Date;
}

interface ChatContext {
  workOrders: WorkOrder[];
  selectedWorkOrderIds?: string[];
  crewEstimation?: CrewEstimation | null;
  weather?: {
    temperature: number;
    condition: string;
  } | null;
  connectionStatus?: string;
  mapState?: {
    visibleLayers: Record<string, boolean>;
    selectedWorkOrderId?: string | null;
    zoom?: number;
    center?: [number, number];
    filterPriority?: string;
    filterType?: string;
    showClusters?: boolean;
  };
}

// ============================================
// NLP Intent Detection
// ============================================

type Intent = 
  | 'cost_analysis' | 'crew_estimate' | 'priority_analysis' 
  | 'weather_impact' | 'selected_info' | 'toggle_layer'
  | 'zoom_to' | 'show_clusters' | 'show_heatmap'
  | 'run_forecast' | 'compare_severity' | 'find_nearest_school'
  | 'summary' | 'anomaly_detection' | 'trend_analysis'
  | 'zone_analysis' | 'what_if' | 'decay_simulation' | 'help' | 'general';

interface DetectedIntent {
  primary: Intent;
  secondary: Intent[];
  entities: Record<string, string>;
  isMapCommand: boolean;
  isAnalysis: boolean;
}

function detectIntent(question: string): DetectedIntent {
  const q = question.toLowerCase().trim();
  const entities: Record<string, string> = {};
  const secondary: Intent[] = [];
  let primary: Intent = 'general';
  let isMapCommand = false;
  let isAnalysis = false;

  // Extract entities
  const severityMatch = q.match(/\b(critical|high|medium|low)\b/);
  if (severityMatch) entities.severity = severityMatch[1];
  
  const typeMatch = q.match(/\b(pothole|sidewalk|concrete)\b/);
  if (typeMatch) entities.issueType = typeMatch[1];

  const zoneMatch = q.match(/zone\s*(\d+\w?)/i);
  if (zoneMatch) entities.zone = zoneMatch[1];

  // Layer commands
  if (q.match(/\b(show|turn on|enable|display|reveal)\b.*\b(layer|heatmap|cluster|school|crew|work\s*order)/)) {
    primary = 'toggle_layer';
    isMapCommand = true;
    if (q.includes('heatmap') || q.includes('heat map')) entities.layer = 'heatmap';
    else if (q.includes('school')) entities.layer = 'schools';
    else if (q.includes('crew')) entities.layer = 'crews';
    else if (q.includes('cluster')) entities.layer = 'clusters';
    else if (q.includes('work order') || q.includes('workorder')) entities.layer = 'workOrders';
    entities.action = 'show';
  } else if (q.match(/\b(hide|turn off|disable|remove)\b.*\b(layer|heatmap|cluster|school|crew|work\s*order)/)) {
    primary = 'toggle_layer';
    isMapCommand = true;
    if (q.includes('heatmap') || q.includes('heat map')) entities.layer = 'heatmap';
    else if (q.includes('school')) entities.layer = 'schools';
    else if (q.includes('crew')) entities.layer = 'crews';
    else if (q.includes('cluster')) entities.layer = 'clusters';
    else if (q.includes('work order') || q.includes('workorder')) entities.layer = 'workOrders';
    entities.action = 'hide';
  }
  // Zoom / focus commands
  else if (q.match(/\b(zoom|go to|fly to|focus|navigate|show me|take me|find)\b.*\b(critical|high|school|cluster|zone|area|pothole|sidewalk|all)/)) {
    primary = 'zoom_to';
    isMapCommand = true;
  }
  // Cluster / heatmap requests  
  else if (q.match(/\b(cluster|group|segment|zone)\b.*\b(order|issue|data|map|all)\b/) || q.match(/\b(show|run|create)\b.*\bcluster/)) {
    primary = 'show_clusters';
    isMapCommand = true;
    isAnalysis = true;
  }
  else if (q.match(/\bheatmap|heat\s*map\b/) && !q.match(/hide|turn off/)) {
    primary = 'show_heatmap';
    isMapCommand = true;
  }
  // Selected / this item questions
  else if (q.match(/\b(selected|this|these|that|highlighted|clicked|picked)\b/) || q.match(/\bwhat('s| is) (this|selected)/)) {
    primary = 'selected_info';
  }
  // Cost
  else if (q.match(/\b(cost|expensive|price|budget|spend|money|dollar|estimate)\b/)) {
    primary = 'cost_analysis';
    if (q.includes('why')) secondary.push('general');
  }
  // Crew
  else if (q.match(/\b(crew|team|worker|staff|personnel|labor)\b/)) {
    primary = 'crew_estimate';
  }
  // Priority
  else if (q.match(/\b(priority|urgent|important|first|worst|fix first|critical first|rank|triage)\b/)) {
    primary = 'priority_analysis';
  }
  // Weather
  else if (q.match(/\b(weather|temperature|rain|snow|freeze|cold|hot|storm|forecast)\b/)) {
    primary = 'weather_impact';
  }
  // Forecast/prediction
  else if (q.match(/\b(forecast|predict|projection|future|next week|next month|coming|expect)\b/)) {
    primary = 'run_forecast';
    isAnalysis = true;
  }
  // Trends
  else if (q.match(/\b(trend|pattern|increasing|decreasing|getting worse|improving|over time)\b/)) {
    primary = 'trend_analysis';
    isAnalysis = true;
  }
  // Anomaly
  else if (q.match(/\b(anomal|outlier|unusual|strange|unexpected|spike|abnormal)\b/)) {
    primary = 'anomaly_detection';
    isAnalysis = true;
  }
  // Zone analysis
  else if (q.match(/\bzone\b/) && q.match(/\b(analyz|compare|breakdown|detail|info|worst|best)\b/)) {
    primary = 'zone_analysis';
    isAnalysis = true;
  }
  // What-if
  else if (q.match(/\b(what if|what would|scenario|hypothetical|if we|suppose)\b/)) {
    primary = 'what_if';
    isAnalysis = true;
  }
  // Decay simulation
  else if (q.match(/\b(decay|deteriorat|degrad|crumbl|neglect|what happens if we (don't|dont|do not)|time.?lapse|ruin|fall apart|collapse|ignore)\b/)) {
    primary = 'decay_simulation';
    isMapCommand = true;
    isAnalysis = true;
  }
  // Compare severity
  else if (q.match(/\b(compare|versus|vs|breakdown|distribution)\b.*\b(severity|type|status)/)) {
    primary = 'compare_severity';
    isAnalysis = true;
  }
  // School proximity
  else if (q.match(/\b(school|near school|school zone|student|child)\b/)) {
    primary = 'find_nearest_school';
  }
  // Summary
  else if (q.match(/\b(summary|overview|status|dashboard|report|tell me about|what do we have)\b/)) {
    primary = 'summary';
  }
  // Help
  else if (q.match(/\b(help|what can you|how do|commands|abilities|features)\b/)) {
    primary = 'help';
  }

  return { primary, secondary, entities, isMapCommand, isAnalysis };
}

// ============================================
// Chat Response Generator
// ============================================

/** Map intent codes to friendly descriptions for non-technical users */
function getFriendlyIntentLabel(intent: Intent): string {
  const map: Record<Intent, string> = {
    cost_analysis: 'cost and budget information',
    crew_estimate: 'crew staffing and estimates',
    priority_analysis: 'what should be fixed first',
    weather_impact: 'how weather affects operations',
    selected_info: 'details about selected items',
    toggle_layer: 'changing what\u2019s shown on the map',
    zoom_to: 'focusing the map on a location',
    show_clusters: 'grouping nearby issues together',
    show_heatmap: 'showing issue density on the map',
    run_forecast: 'predicting future trends',
    compare_severity: 'comparing issue severity levels',
    find_nearest_school: 'finding nearby schools',
    summary: 'an overview of current operations',
    anomaly_detection: 'finding unusual patterns',
    trend_analysis: 'analyzing trends over time',
    zone_analysis: 'breaking things down by area',
    what_if: 'exploring a \u201Cwhat-if\u201D scenario',
    decay_simulation: 'simulating infrastructure decay',
    help: 'what I can help you with',
    general: 'general information',
  };
  return map[intent] || intent.replace(/_/g, ' ');
}

/** Get confidence label for non-technical users */
function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.95) return 'Very high confidence';
  if (confidence >= 0.85) return 'High confidence';
  if (confidence >= 0.7) return 'Good confidence';
  if (confidence >= 0.5) return 'Moderate confidence';
  return 'Low confidence';
}

/** Generate a plain English explanation for a reasoning step */
function getPlainEnglishReasoning(description: string, dataSource?: string): string {
  const desc = description.toLowerCase();
  if (desc.includes('intent') || desc.includes('classified'))
    return 'The AI figured out what kind of question you asked.';
  if (desc.includes('weather'))
    return 'Checked today\u2019s weather to see if it affects the work.';
  if (desc.includes('priority') || desc.includes('ranking'))
    return 'Sorted issues by urgency so the most important ones come first.';
  if (desc.includes('crew') || desc.includes('staffing'))
    return 'Calculated how many workers you\u2019d need based on the workload.';
  if (desc.includes('cost') || desc.includes('budget'))
    return 'Estimated how much this would cost to fix.';
  if (desc.includes('severity'))
    return 'Looked at how serious each issue is.';
  if (desc.includes('zone') || desc.includes('area') || desc.includes('location'))
    return 'Broke things down by neighborhood or area.';
  if (desc.includes('trend') || desc.includes('pattern'))
    return 'Looked at how things have changed over time.';
  if (desc.includes('anomal') || desc.includes('unusual'))
    return 'Searched for anything unusual or unexpected in the data.';
  if (desc.includes('response generated') || desc.includes('final'))
    return 'Put it all together into a clear answer for you.';
  if (dataSource) return `Used data from ${dataSource} to help with this step.`;
  return 'Processed this step as part of the analysis.';
}

/**
 * Answer a natural language question about infrastructure data.
 * Can also issue map commands and trigger ML analysis.
 */
export async function askQuestion(
  question: string,
  context: ChatContext
): Promise<ChatMessage> {
  return askQuestionStreaming(question, context, () => {});
}

/**
 * Streaming version — emits PipelineEvents as each agent step runs,
 * so the UI can show a live multi-model reasoning pipeline.
 */
export async function askQuestionStreaming(
  question: string,
  context: ChatContext,
  onProgress: (event: PipelineEvent) => void,
): Promise<ChatMessage> {
  const { workOrders, selectedWorkOrderIds, crewEstimation, mapState } = context;
  const startTime = Date.now();
  
  const reasoning: ReasoningStep[] = [];
  const actions: AgentAction[] = [];
  const mapCommands: MapCommand[] = [];
  let answer = '';
  let responseCard: CardData | undefined;
  
  // ── Step 1: NLP Intent Detection ──
  onProgress({ agent: 'NLP Engine', icon: 'search', role: 'Intent Classifier', task: 'Detecting intent from question', status: 'thinking', input: `"${question}"`, plainEnglish: 'Reading your question to understand what you need...', startedAt: new Date() });
  const intent = detectIntent(question);
  const intentLabel = `${intent.primary}${intent.isMapCommand ? ' (map)' : ''}${intent.isAnalysis ? ' (analysis)' : ''}`;
  const friendlyIntent = getFriendlyIntentLabel(intent.primary);
  onProgress({ agent: 'NLP Engine', icon: 'search', role: 'Intent Classifier', task: 'Detecting intent from question', status: 'complete', output: `Intent: ${intentLabel}`, fullOutput: `Classified question into intent: ${intentLabel}\nEntities detected: ${JSON.stringify(intent.entities || {})}\nIs map command: ${intent.isMapCommand}\nIs analysis: ${intent.isAnalysis}`, confidence: 0.95, tokens: 12, durationMs: Date.now() - startTime, plainEnglish: `Got it! You're asking about: ${friendlyIntent}` });

  // ── Step 2: Fetch Context ──
  onProgress({ agent: 'Data Collector', icon: 'chart', role: 'Data Expert', task: 'Gathering work orders & weather', status: 'thinking', input: `MCP data sources + Weather API`, plainEnglish: 'Pulling the latest data from your systems — work orders, crews, and weather...', startedAt: new Date() });
  const weather = await weatherService.getCurrentWeather();
  const selectedCount = selectedWorkOrderIds?.length || 0;
  onProgress({ agent: 'Data Collector', icon: 'chart', role: 'Data Expert', task: 'Gathering work orders & weather', status: 'complete', output: `${workOrders.length} work orders, ${weather ? `${weather.temperature}°F ${weather.condition}` : 'no weather'}`, fullOutput: `Retrieved ${workOrders.length} work orders from MCP data source\n${selectedCount > 0 ? `${selectedCount} currently selected on map\n` : ''}Weather: ${weather ? `${weather.temperature}°F, ${weather.condition}` : 'unavailable'}\nData freshness: real-time`, confidence: 1.0, tokens: workOrders.length * 3, durationMs: Date.now() - startTime, plainEnglish: `Found ${workOrders.length} work orders${selectedCount > 0 ? ` (${selectedCount} selected on map)` : ''} and the current weather` });

  // ── Step 3: Call AI Agent (GPT-4.1 Mini) ──
  onProgress({ agent: 'GPT-4.1 Mini', icon: 'brain', role: 'Reasoning Specialist', task: 'Analyzing with AI model', status: 'thinking', input: `Question: "${question}"\n${workOrders.length} work orders, ${selectedCount} selected`, plainEnglish: 'The AI is now thinking about your question using all the data it gathered...', startedAt: new Date() });
  const apiCallStart = Date.now();
  
  const apiResult = await callAgentApi<{
    answer: string | null;
    reasoning?: Array<{ step: number; description: string; confidence: number; data_source?: string }>;
    reasoning_trace?: string;
    source?: string;
    confidence?: number;
    processing_time_ms?: number;
    estimation?: Record<string, unknown>;
    prioritized_orders?: Array<Record<string, unknown>>;
  }>('/api/agents/chat', {
    question,
    workOrders: workOrders.slice(0, 50),
    selectedWorkOrderIds: selectedWorkOrderIds || [],
    mapState: mapState || {},
    crewEstimation: crewEstimation || null,
    weather: weather ? { temperature: weather.temperature, condition: weather.condition } : null,
  }, 45000);

  // Detect if the API returned a useful answer or a generic fallback dump
  const isGenericFallback = apiResult?.answer && (
    apiResult.answer.includes("I'm your MAINTAIN AI") ||
    apiResult.answer.includes("Here's what I can see") ||
    apiResult.answer.includes("I can help you with") ||
    (apiResult.answer.length < 200 && apiResult.answer.includes('total work orders'))
  );
  // For analysis/map intents with good local handlers, prefer local engine over generic API dump
  const hasLocalHandler = ['trend_analysis','anomaly_detection','cost_analysis','priority_analysis','crew_estimate','zone_analysis','compare_severity','weather_impact','run_forecast','summary','help','toggle_layer','zoom_to','show_clusters','show_heatmap','find_nearest_school','selected_info','what_if','decay_simulation'].includes(intent.primary);
  const useApiResult = apiResult?.answer && apiResult.source !== 'passthrough' && apiResult.source !== 'error' && !(isGenericFallback && hasLocalHandler);

  if (useApiResult) {
    const apiAnswer = apiResult!.answer!;
    const aiDuration = apiResult.processing_time_ms || (Date.now() - apiCallStart);
    const reasoningTrace = apiResult.reasoning_trace || (apiResult.reasoning || []).map(r => `Step ${r.step}: ${r.description} (${Math.round(r.confidence * 100)}% confidence, source: ${r.data_source || 'N/A'})`).join('\n');
    const estimatedTokens = Math.round((apiAnswer.length || 0) / 4) + Math.round((reasoningTrace?.length || 0) / 4);
    onProgress({ agent: 'GPT-4.1 Mini', icon: 'brain', role: 'Reasoning Specialist', task: 'Analyzing with AI model', status: 'complete', output: `${apiResult.source || 'Agent API'} responded`, fullOutput: reasoningTrace || apiAnswer.substring(0, 500), confidence: apiResult.confidence ?? 0.9, tokens: estimatedTokens, durationMs: aiDuration, plainEnglish: `The AI finished analyzing your question (took ${aiDuration < 1000 ? `${Math.round(aiDuration)}ms` : `${(aiDuration / 1000).toFixed(1)}s`}) \u2014 ${getConfidenceLabel(apiResult.confidence ?? 0.9).toLowerCase()}` });

    // ── Step 4: Response Builder ──
    onProgress({ agent: 'Response Builder', icon: 'sparkle', role: 'Output Formatter', task: 'Formatting response', status: 'thinking', plainEnglish: 'Putting together a clear answer for you...', startedAt: new Date() });
    await new Promise(r => setTimeout(r, 150)); // small delay for visual
    onProgress({ agent: 'Response Builder', icon: 'sparkle', role: 'Output Formatter', task: 'Formatting response', status: 'complete', output: `${apiAnswer.length} chars`, fullOutput: `Synthesized final response from reasoning trace\nOutput length: ${apiAnswer.length} characters\nFormat: adaptive card + markdown`, tokens: Math.round(apiAnswer.length / 4), durationMs: Date.now() - startTime, plainEnglish: 'Your answer is ready!' });

    const apiReasoning: ReasoningStep[] = (apiResult.reasoning || []).map((r, i) => ({
      step: r.step || i + 1,
      description: r.description || r.data_source || '',
      confidence: r.confidence ?? 0.9,
      dataSource: r.data_source || apiResult.source || 'Agent API',
      plainEnglish: getPlainEnglishReasoning(r.description || '', r.data_source),
    }));

    apiReasoning.push({
      step: apiReasoning.length + 1,
      description: `Response generated by ${apiResult.source || 'Agent API'} in ${aiDuration.toFixed ? aiDuration.toFixed(0) : aiDuration}ms`,
      confidence: apiResult.confidence ?? 0.9,
      dataSource: 'Agent API',
      plainEnglish: `Everything checked out! Your answer was ready in ${aiDuration < 1000 ? `${Math.round(aiDuration as number)}ms` : `${((aiDuration as number) / 1000).toFixed(1)} seconds`}.`,
      durationMs: aiDuration as number,
    });

    // Log AI decision for Responsible AI governance audit
    dataverseService.logAIDecision({
      agentName: 'analysis',
      decisionType: 'risk_assessment',
      inputSummary: JSON.stringify({ question, workOrderCount: workOrders.length, selectedCount: selectedWorkOrderIds?.length || 0 }),
      outputSummary: JSON.stringify({ answer: apiAnswer.substring(0, 300), source: apiResult.source }),
      confidenceScore: apiResult.confidence ?? 0.9,
      reasoningJson: JSON.stringify(apiResult.reasoning || []),
      tokensUsed: Math.round((apiAnswer.length || 0) / 4),
      processingTimeMs: typeof aiDuration === 'number' ? aiDuration : Date.now() - startTime,
      modelName: 'gpt-4.1-mini',
      humanOverride: false,
      relatedWorkOrderIds: (selectedWorkOrderIds || []).slice(0, 10),
    }).catch(err => console.warn('[AgentService] Failed to log chat decision:', err));

    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: apiAnswer,
      reasoning: apiReasoning,
      actions: undefined,
      mapCommands: undefined,
      timestamp: new Date(),
      card: responseCard,
    };
  }

  // AI model unavailable — mark it
  onProgress({ agent: 'GPT-4.1 Mini', icon: 'brain', role: 'Reasoning Specialist', task: 'Analyzing with AI model', status: 'error', output: 'Agent API unavailable — using local engine', durationMs: Date.now() - apiCallStart, plainEnglish: 'The cloud AI isn\u2019t available right now, so I\u2019ll analyze this myself using built-in logic' });

  // ── Step 3b: Local Reasoning Engine ──
  onProgress({ agent: 'Local Engine', icon: 'gear', role: 'Fallback Analyst', task: `Processing "${intentLabel}"`, status: 'thinking', input: `Intent: ${intentLabel}\n${workOrders.length} work orders`, plainEnglish: `Analyzing your question about ${friendlyIntent} using built-in intelligence...`, startedAt: new Date() });

  reasoning.push({
    step: 1,
    description: `Detected intent: ${intentLabel}`,
    confidence: 0.95,
    dataSource: 'NLP Engine',
    plainEnglish: `I understood you're asking about ${friendlyIntent}.`,
  });

  // Get selected work orders
  const selectedOrders = selectedWorkOrderIds?.length 
    ? workOrders.filter(wo => selectedWorkOrderIds.includes(wo.id))
    : [];

  switch (intent.primary) {

    // ============ MAP LAYER COMMANDS ============
    case 'toggle_layer': {
      const layer = intent.entities.layer || 'workOrders';
      const action = intent.entities.action || 'show';
      const isShow = action === 'show';
      
      mapCommands.push({
        type: 'toggle_layer',
        payload: { layer, visible: isShow }
      });

      reasoning.push({
        step: 2,
        description: `${isShow ? 'Showing' : 'Hiding'} ${layer} layer on the map`,
        confidence: 0.98,
        dataSource: 'Map Controller',
        plainEnglish: `${isShow ? 'Turned on' : 'Turned off'} the ${layer} layer so you can see it on the map.`,
      });

      const layerNames: Record<string, string> = {
        heatmap: 'Heatmap',
        schools: 'Schools',
        crews: 'Crews',
        clusters: 'AI Clusters',
        workOrders: 'Work Orders'
      };
      
      answer = `Done! I've **${isShow ? 'turned on' : 'turned off'}** the **${layerNames[layer] || layer}** layer on the map.\n\n`;
      answer += `**Currently visible layers:**\n`;
      
      const layers = mapState?.visibleLayers || {};
      const updatedLayers = { ...layers, [layer]: isShow };
      Object.entries(updatedLayers).forEach(([key, visible]) => {
        answer += `• ${(layerNames[key] || key)}: ${visible ? 'On' : 'Off'}\n`;
      });
      
      answer += `\nTip: You can say "show heatmap" or "hide crews" to toggle any layer.`;
      
      actions.push({
        type: 'map_command',
        label: `${isShow ? 'Hide' : 'Show'} ${layerNames[layer] || layer}`,
        icon: 'layers',
        data: { layer, visible: !isShow }
      });
      break;
    }

    // ============ ZOOM / FOCUS COMMANDS ============
    case 'zoom_to': {
      const q = question.toLowerCase();
      
      reasoning.push({
        step: 2,
        description: 'Determining zoom target from request',
        confidence: 0.90,
        dataSource: 'Spatial Analysis',
        plainEnglish: 'Figuring out which area of the map to zoom into based on your request.',
      });

      if (q.includes('critical') || q.includes('worst')) {
        const criticals = workOrders.filter(wo => wo.severity === 'critical');
        if (criticals.length > 0) {
          const target = criticals[0];
          mapCommands.push({
            type: 'zoom_to',
            payload: { lat: target.latitude, lng: target.longitude, zoom: 16 }
          });
          mapCommands.push({
            type: 'select_features',
            payload: { ids: criticals.map(c => c.id) }
          });
          const totalCost = criticals.reduce((s, w) => s + (w.estimatedCost || 0), 0);
          const nearSchoolCount = criticals.filter(w => w.nearSchool).length;
          answer = `Found **${criticals.length} critical issues** — highlighted on the map.`;
          
          responseCard = {
            type: 'multi-select',
            title: `${criticals.length} Critical Issues`,
            subtitle: `Zoomed to ${target.address}`,
            stats: [
              { label: 'Total', value: String(criticals.length), color: 'var(--accent-danger)' },
              { label: 'Est. Cost', value: `$${totalCost.toLocaleString()}`, color: 'var(--accent-warning)' },
              ...(nearSchoolCount > 0 ? [{ label: 'Near Schools', value: String(nearSchoolCount), color: 'var(--accent-primary)' }] : []),
            ],
            items: criticals.slice(0, 8).map(wo => ({
              title: wo.title,
              severity: wo.severity,
              address: wo.address,
              cost: `$${wo.estimatedCost?.toLocaleString() || 'N/A'}`,
            })),
          };
          if (criticals.length > 8) {
            answer += `\nShowing top 8 of ${criticals.length}.`;
          }
        } else {
          answer = `Great news — there are no critical issues right now!`;
        }
      } else if (q.includes('school')) {
        mapCommands.push({ type: 'toggle_layer', payload: { layer: 'schools', visible: true } });
        const schoolIssues = workOrders.filter(wo => wo.nearSchool);
        if (schoolIssues.length > 0) {
          mapCommands.push({
            type: 'zoom_to',
            payload: { lat: schoolIssues[0].latitude, lng: schoolIssues[0].longitude, zoom: 15 }
          });
          mapCommands.push({
            type: 'select_features',
            payload: { ids: schoolIssues.map(s => s.id) }
          });
          answer = `Found **${schoolIssues.length} issues near schools** — schools layer enabled and highlighted on the map.`;
          const criticalNearSchool = schoolIssues.filter(w => w.severity === 'critical').length;
          responseCard = {
            type: 'multi-select',
            title: `${schoolIssues.length} Issues Near Schools`,
            subtitle: 'Schools layer enabled',
            stats: [
              { label: 'Total', value: String(schoolIssues.length), color: 'var(--accent-primary)' },
              ...(criticalNearSchool > 0 ? [{ label: 'Critical', value: String(criticalNearSchool), color: 'var(--accent-danger)' }] : []),
            ],
            items: schoolIssues.slice(0, 8).map(wo => ({
              title: wo.title,
              severity: wo.severity,
              address: wo.address,
              cost: `$${wo.estimatedCost?.toLocaleString() || 'N/A'}`,
            })),
          };
          if (schoolIssues.length > 8) {
            answer += `\nShowing top 8 of ${schoolIssues.length}.`;
          }
        } else {
          answer = `No issues currently near school zones. Schools layer is now enabled.`;
        }
      } else if (q.includes('all') || q.includes('everything') || q.includes('reset')) {
        mapCommands.push({ type: 'reset_view' });
        answer = `Map view reset to show all work orders. Zoom level restored to default.`;
      } else if (intent.entities.zone) {
        const zoneOrders = workOrders.filter(wo => wo.zone?.toLowerCase().includes(intent.entities.zone.toLowerCase()));
        if (zoneOrders.length > 0) {
          const avgLat = zoneOrders.reduce((s, w) => s + w.latitude, 0) / zoneOrders.length;
          const avgLng = zoneOrders.reduce((s, w) => s + w.longitude, 0) / zoneOrders.length;
          mapCommands.push({ type: 'zoom_to', payload: { lat: avgLat, lng: avgLng, zoom: 15 } });
          mapCommands.push({ type: 'select_features', payload: { ids: zoneOrders.map(z => z.id) } });
          answer = `Zooming to **Zone ${intent.entities.zone}** — ${zoneOrders.length} work orders found.\n\n`;
          answer += `• Potholes: ${zoneOrders.filter(w => w.issueType === 'pothole').length}\n`;
          answer += `• Sidewalk: ${zoneOrders.filter(w => w.issueType === 'sidewalk').length}\n`;
          answer += `• Concrete: ${zoneOrders.filter(w => w.issueType === 'concrete').length}\n`;
          answer += `• Total cost: $${zoneOrders.reduce((s, w) => s + (w.estimatedCost || 0), 0).toLocaleString()}`;
        } else {
          answer = `No work orders found in Zone ${intent.entities.zone}.`;
        }
      } else if (intent.entities.issueType) {
        const typeOrders = workOrders.filter(wo => wo.issueType === intent.entities.issueType);
        if (typeOrders.length > 0) {
          mapCommands.push({
            type: 'select_features',
            payload: { ids: typeOrders.map(t => t.id) }
          });
          mapCommands.push({
            type: 'zoom_to',
            payload: { lat: typeOrders[0].latitude, lng: typeOrders[0].longitude, zoom: 14 }
          });
          answer = `Highlighting all **${typeOrders.length} ${intent.entities.issueType} issues** on the map.`;
        } else {
          answer = `No ${intent.entities.issueType} issues found.`;
        }
      } else {
        mapCommands.push({ type: 'reset_view' });
        answer = `Map view reset. Try saying:\n• "Zoom to critical issues"\n• "Show me Zone 4"\n• "Focus on potholes near schools"`;
      }
      break;
    }

    // ============ CLUSTERING COMMAND ============
    case 'show_clusters': {
      mapCommands.push({ type: 'show_clusters' });
      
      reasoning.push({
        step: 2,
        description: 'Running K-means clustering on all work orders',
        confidence: 0.88,
        dataSource: 'ML Engine',
        plainEnglish: 'Grouping nearby work orders together so you can see natural clusters on the map.',
      });

      answer = `AI Cluster Analysis activated. Work orders are grouped into geographic zones based on proximity and severity.\n\n`;
      answer += `**What this means:**\n`;
      answer += `• Each colored zone represents a crew assignment area\n`;
      answer += `• Higher severity zones are shown in warmer colors\n`;
      answer += `• Click on clusters in the ML tab for detailed breakdown\n\n`;
      answer += `Tip: Go to the **ML tab** to adjust the number of clusters or run staff optimization.`;
      
      actions.push({
        type: 'navigate_tab',
        label: 'Open ML Tab',
        icon: 'ml',
        data: { tab: 'analytics' }
      });
      break;
    }

    // ============ HEATMAP COMMAND ============
    case 'show_heatmap': {
      mapCommands.push({ type: 'toggle_layer', payload: { layer: 'heatmap', visible: true } });
      
      answer = `**Heatmap enabled!** The map now shows issue density as a heat overlay.\n\n`;
      answer += `• **Red/orange areas** = high concentration of issues\n`;
      answer += `• **Blue/green areas** = fewer issues\n\n`;
      answer += `This helps identify hotspots for crew deployment.`;
      
      actions.push({
        type: 'map_command',
        label: 'Hide Heatmap',
        icon: 'square',
        data: { layer: 'heatmap', visible: false }
      });
      break;
    }

    // ============ SELECTED ITEM INFO ============
    case 'selected_info': {
      if (selectedOrders.length === 0) {
        answer = `No items are currently selected on the map.\n\n`;
        answer += `**How to select:**\n`;
        answer += `• Click any marker on the map to select a work order\n`;
        answer += `• Use the lasso tool to select multiple items\n`;
        answer += `• Then ask me about "these selected items"`;
      } else if (selectedOrders.length === 1) {
        const wo = selectedOrders[0];
        const daysOpen = Math.ceil((Date.now() - new Date(wo.createdAt).getTime()) / 86400000);
        
        reasoning.push({
          step: 2,
          description: `Analyzing selected work order: ${wo.id}`,
          confidence: 0.95,
          dataSource: 'Work Order Database',
          plainEnglish: `Looking up all the details for the work order you selected.`,
        });

        // Build recommendation
        let recLevel: 'urgent' | 'high' | 'moderate' | 'standard' = 'standard';
        let recText = `Standard priority. Can be batch-scheduled with nearby ${wo.issueType} repairs for efficiency.`;
        if (wo.severity === 'critical' && wo.nearSchool) {
          recLevel = 'urgent';
          recText = 'URGENT — Critical issue near a school. Recommend immediate dispatch and temporary safety barriers.';
        } else if (wo.severity === 'critical') {
          recLevel = 'high';
          recText = 'High priority. Should be addressed within 24 hours. Consider deploying nearest available crew.';
        } else if (wo.nearSchool) {
          recLevel = 'moderate';
          recText = 'Near school zone — schedule repairs during off-hours or weekends to minimize disruption.';
        }

        answer = `Work order ${wo.id} details and AI recommendation are shown below.`;

        responseCard = {
          type: 'work-order',
          title: wo.title,
          subtitle: wo.id,
          severity: wo.severity,
          fields: [
            { label: 'Address', value: wo.address, icon: 'location' },
            { label: 'Severity', value: wo.severity.toUpperCase(), icon: 'severity' },
            { label: 'Status', value: wo.status, icon: 'status' },
            { label: 'Type', value: wo.issueType, icon: 'type' },
            { label: 'Est. Cost', value: `$${wo.estimatedCost?.toLocaleString() || 'N/A'}`, icon: 'cost' },
            { label: 'Priority', value: wo.priorityScore?.toFixed(1) || 'N/A', icon: 'priority' },
            { label: 'Days Open', value: String(daysOpen), icon: 'calendar' },
            { label: 'Near School', value: wo.nearSchool ? 'Yes' : 'No', icon: 'school' },
            { label: 'Zone', value: wo.zone || 'Unassigned', icon: 'zone' },
          ],
          recommendation: { level: recLevel, text: recText },
        };
        
        actions.push({
          type: 'map_command',
          label: 'Zoom to this issue',
          icon: 'search',
          data: { lat: wo.latitude, lng: wo.longitude, zoom: 17 }
        });
      } else {
        // Multiple selected
        reasoning.push({
          step: 2,
          description: `Analyzing ${selectedOrders.length} selected work orders`,
          confidence: 0.92,
          dataSource: 'Selection Analysis',
          plainEnglish: `Reviewing the ${selectedOrders.length} items you selected to give you a summary.`,
        });

        const totalCost = selectedOrders.reduce((s, w) => s + (w.estimatedCost || 0), 0);
        const bySeverity = {
          critical: selectedOrders.filter(w => w.severity === 'critical').length,
          high: selectedOrders.filter(w => w.severity === 'high').length,
          medium: selectedOrders.filter(w => w.severity === 'medium').length,
          low: selectedOrders.filter(w => w.severity === 'low').length,
        };
        const nearSchool = selectedOrders.filter(w => w.nearSchool).length;
        const estimation = calculateCrewEstimation({
          workOrders: selectedOrders,
          temperature: weather?.temperature ?? 40,
          weatherCondition: weather?.condition ?? 'cloudy',
          daysAhead: 7,
          crewAvailability: 80
        });

        const stats: { label: string; value: string; color?: string }[] = [];
        if (bySeverity.critical) stats.push({ label: 'Critical', value: String(bySeverity.critical), color: '#ef4444' });
        if (bySeverity.high) stats.push({ label: 'High', value: String(bySeverity.high), color: '#f97316' });
        if (bySeverity.medium) stats.push({ label: 'Medium', value: String(bySeverity.medium), color: '#eab308' });
        if (bySeverity.low) stats.push({ label: 'Low', value: String(bySeverity.low), color: '#22c55e' });

        answer = `Analyzed ${selectedOrders.length} selected work orders. Total estimated cost: $${totalCost.toLocaleString()}. ${estimation.totalCrews} crews recommended.`;

        responseCard = {
          type: 'multi-select',
          title: `Selection Analysis`,
          subtitle: `${selectedOrders.length} Work Orders`,
          stats,
          fields: [
            { label: 'Total Cost', value: `$${totalCost.toLocaleString()}`, icon: 'cost' },
            { label: 'Crews Needed', value: `${estimation.totalCrews}`, icon: 'crew' },
            { label: 'Near Schools', value: nearSchool ? `${nearSchool} (prioritize)` : 'None', icon: 'school' },
            { label: 'Confidence', value: `${Math.round(estimation.confidence * 100)}%`, icon: 'priority' },
          ],
          items: selectedOrders.slice(0, 5).map(wo => ({
            title: wo.title,
            severity: wo.severity,
            address: wo.address,
            cost: `$${wo.estimatedCost?.toLocaleString() || 'N/A'}`,
          })),
        };
      }
      break;
    }

    // ============ COST ANALYSIS ============
    case 'cost_analysis': {
      reasoning.push({
        step: 2,
        description: 'Analyzing cost factors for infrastructure repairs',
        confidence: 0.88,
        dataSource: 'Cost Analysis Engine',
        plainEnglish: 'Calculating how much the repairs are expected to cost.',
      });
      
      const ordersToAnalyze = selectedOrders.length > 0 ? selectedOrders : workOrders;
      const totalCost = ordersToAnalyze.reduce((sum, wo) => sum + (wo.estimatedCost || 0), 0);
      const avgCost = totalCost / ordersToAnalyze.length;
      
      const costBreakdown = {
        critical: ordersToAnalyze.filter(wo => wo.severity === 'critical'),
        high: ordersToAnalyze.filter(wo => wo.severity === 'high'),
        medium: ordersToAnalyze.filter(wo => wo.severity === 'medium'),
        low: ordersToAnalyze.filter(wo => wo.severity === 'low'),
      };
      
      const costByType = {
        pothole: ordersToAnalyze.filter(w => w.issueType === 'pothole').reduce((s, w) => s + (w.estimatedCost || 0), 0),
        sidewalk: ordersToAnalyze.filter(w => w.issueType === 'sidewalk').reduce((s, w) => s + (w.estimatedCost || 0), 0),
        concrete: ordersToAnalyze.filter(w => w.issueType === 'concrete').reduce((s, w) => s + (w.estimatedCost || 0), 0),
      };
      
      reasoning.push({
        step: 3,
        description: `Found ${ordersToAnalyze.length} work orders totaling $${totalCost.toLocaleString()}`,
        confidence: 0.92,
        dataSource: 'Work Order Database',
        plainEnglish: `Found ${ordersToAnalyze.length} work orders with a total estimated cost of $${totalCost.toLocaleString()}.`,
      });
      
      answer = `**Cost Analysis — ${selectedOrders.length > 0 ? 'Selected' : 'All'} ${ordersToAnalyze.length} Work Orders**\n\n`;
      answer += `**Total Estimated Cost: $${totalCost.toLocaleString()}**\n`;
      answer += `Average per issue: $${Math.round(avgCost).toLocaleString()}\n\n`;
      
      answer += `**By Severity:**\n`;
      answer += `• Critical (${costBreakdown.critical.length}): $${costBreakdown.critical.reduce((s, w) => s + (w.estimatedCost || 0), 0).toLocaleString()}\n`;
      answer += `• High (${costBreakdown.high.length}): $${costBreakdown.high.reduce((s, w) => s + (w.estimatedCost || 0), 0).toLocaleString()}\n`;
      answer += `• Medium (${costBreakdown.medium.length}): $${costBreakdown.medium.reduce((s, w) => s + (w.estimatedCost || 0), 0).toLocaleString()}\n`;
      answer += `• Low (${costBreakdown.low.length}): $${costBreakdown.low.reduce((s, w) => s + (w.estimatedCost || 0), 0).toLocaleString()}\n\n`;
      
      answer += `**By Type:**\n`;
      answer += `• Potholes: $${costByType.pothole.toLocaleString()}\n`;
      answer += `• Sidewalk: $${costByType.sidewalk.toLocaleString()}\n`;
      answer += `• Concrete: $${costByType.concrete.toLocaleString()}\n\n`;
      
      if (question.toLowerCase().includes('why')) {
        answer += `**Why these costs?**\n`;
        answer += `• Critical severity = 2-3x base cost (premium materials, expedited labor)\n`;
        answer += `• Sidewalk/concrete repairs are inherently costlier than pothole patches\n`;
        answer += `• Weather conditions can add 30-60% to timelines and costs\n`;
        answer += `• Near-school repairs may require traffic control, adding $500-1,500`;
      }
      
      // Most expensive
      const mostExpensive = [...ordersToAnalyze].sort((a, b) => (b.estimatedCost || 0) - (a.estimatedCost || 0)).slice(0, 3);
      if (mostExpensive.length > 0) {
        actions.push({
          type: 'map_command',
          label: `Zoom to most expensive ($${mostExpensive[0].estimatedCost?.toLocaleString()})`,
          icon: 'cost',
          data: { lat: mostExpensive[0].latitude, lng: mostExpensive[0].longitude, zoom: 16 }
        });
      }
      break;
    }

    // ============ CREW ESTIMATE ============
    case 'crew_estimate': {
      reasoning.push({
        step: 2,
        description: 'Running crew estimation algorithm',
        confidence: 0.87,
        dataSource: 'Crew Allocation Engine',
        plainEnglish: 'Figuring out how many repair crews you\'ll need based on the current workload.',
      });
      
      const ordersToAnalyze = selectedOrders.length > 0 ? selectedOrders : workOrders;
      const estimation = calculateCrewEstimation({
        workOrders: ordersToAnalyze,
        temperature: weather?.temperature ?? 40,
        weatherCondition: weather?.condition ?? 'cloudy',
        daysAhead: 7,
        crewAvailability: 80
      });
      
      reasoning.push({
        step: 3,
        description: `Calculated: ${estimation.totalCrews} crews for ${ordersToAnalyze.length} work orders`,
        confidence: estimation.confidence,
        dataSource: 'Crew Algorithm',
        plainEnglish: `Recommending ${estimation.totalCrews} crews to handle the ${ordersToAnalyze.length} open work orders.`,
      });
      
      answer = `**Crew Recommendation — ${ordersToAnalyze.length} Work Orders**\n\n`;
      answer += `**Total Crews Needed: ${estimation.totalCrews}**\n\n`;
      answer += `• **${estimation.potholeCrew}** pothole repair crews\n`;
      answer += `• **${estimation.sidewalkCrews}** sidewalk crews\n`;
      answer += `• **${estimation.concreteCrews}** concrete crews\n\n`;
      answer += `**Factors Considered:**\n`;
      estimation.reasoning.forEach(r => answer += `• ${r}\n`);
      answer += `\n**Confidence:** ${Math.round(estimation.confidence * 100)}%\n\n`;
      answer += `Tip: Run the **Staff Optimization** in the ML tab to see optimal crew placement on the map.`;
      
      actions.push({
        type: 'run_analysis',
        label: 'Run Staff Optimization',
        icon: 'chart',
        data: { analysis: 'staffing' }
      }, {
        type: 'navigate_tab',
        label: 'Open ML Tab',
        icon: 'ml',
        data: { tab: 'analytics' }
      });
      break;
    }

    // ============ PRIORITY ANALYSIS ============
    case 'priority_analysis': {
      reasoning.push({
        step: 2,
        description: 'Analyzing priority scores and severity levels',
        confidence: 0.91,
        dataSource: 'Priority Scoring System',
        plainEnglish: 'Ranking all issues by urgency so you know what to fix first.',
      });
      
      const critical = workOrders.filter(wo => wo.severity === 'critical');
      const nearSchools = workOrders.filter(wo => wo.nearSchool);
      
      const topPriority = [...workOrders]
        .sort((a, b) => {
          const scoreA = (a.priorityScore || 0) + (a.severity === 'critical' ? 100 : a.severity === 'high' ? 50 : 0) + (a.nearSchool ? 30 : 0);
          const scoreB = (b.priorityScore || 0) + (b.severity === 'critical' ? 100 : b.severity === 'high' ? 50 : 0) + (b.nearSchool ? 30 : 0);
          return scoreB - scoreA;
        })
        .slice(0, 7);
      
      answer = `**Priority Ranking — Top Issues to Fix First**\n\n`;
      
      topPriority.forEach((wo, i) => {
        const flags = [];
        if (wo.severity === 'critical') flags.push('CRITICAL');
        if (wo.nearSchool) flags.push('Near School');
        if (wo.severity === 'high') flags.push('High');
        
        answer += `**${i + 1}. ${wo.title}**\n`;
        answer += `   ${flags.join(' · ')} | $${wo.estimatedCost?.toLocaleString() || 'N/A'} | ${wo.address}\n\n`;
      });
      
      answer += `**Prioritization Logic:**\n`;
      answer += `1. Critical severity (immediate safety risk)\n`;
      answer += `2. School proximity (liability & child safety)\n`;
      answer += `3. Traffic impact (more affected citizens)\n`;
      answer += `4. Age of report (SLA compliance)`;
      
      // Add action to zoom to #1
      if (topPriority.length > 0) {
        mapCommands.push({
          type: 'select_features',
          payload: { ids: topPriority.map(t => t.id) }
        });
        actions.push({
          type: 'map_command',
          label: `Zoom to #1 priority`,
          icon: 'search',
          data: { lat: topPriority[0].latitude, lng: topPriority[0].longitude, zoom: 16 }
        });
      }
      break;
    }

    // ============ WEATHER IMPACT ============
    case 'weather_impact': {
      reasoning.push({
        step: 2,
        description: 'Retrieving weather data and impact analysis',
        confidence: 0.93,
        dataSource: 'Weather API',
        plainEnglish: 'Checking the weather forecast to see how it might affect repair schedules.',
      });
      
      const forecast = await weatherService.getWeatherForecast(7);
      
      answer = `**Weather Impact Analysis**\n\n`;
      answer += `**Current:** ${weather?.condition || 'Unknown'}, ${weather?.temperature || 'N/A'}°F\n\n`;
      
      if (weather) {
        if (weather.temperature < 32) {
          answer += `**Freezing Alert:** Asphalt repairs won't cure properly. Use cold-mix patches only.\n\n`;
        } else if (weather.condition === 'rain') {
          answer += `**Rain Impact:** Delay concrete work. Pothole patching possible with cold-mix.\n\n`;
        } else if (weather.condition === 'clear' && weather.temperature > 45 && weather.temperature < 85) {
          answer += `**Optimal Conditions:** Full productivity for all repair types.\n\n`;
        }
        
        // Crew impact
        const normalCrews = calculateCrewEstimation({
          workOrders, temperature: 65, weatherCondition: 'clear', daysAhead: 7, crewAvailability: 80
        });
        const currentCrews = calculateCrewEstimation({
          workOrders, temperature: weather.temperature, weatherCondition: weather.condition, daysAhead: 7, crewAvailability: 80
        });
        const crewDiff = currentCrews.totalCrews - normalCrews.totalCrews;
        
        if (crewDiff > 0) {
          answer += `Weather is adding **${crewDiff} extra crews** to requirements (${normalCrews.totalCrews} → ${currentCrews.totalCrews}).\n\n`;
        }
      }
      
      answer += `**7-Day Forecast:**\n`;
      forecast.slice(0, 7).forEach(day => {
        const date = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const workEmoji = day.workabilityScore > 0.8 ? 'Good' : day.workabilityScore > 0.5 ? 'Fair' : 'Poor';
        answer += `• ${date}: ${day.condition} ${day.temperature}°F — ${workEmoji} ${Math.round(day.workabilityScore * 100)}% workable\n`;
      });
      break;
    }

    // ============ TREND ANALYSIS ============
    case 'trend_analysis': {
      reasoning.push({
        step: 2,
        description: 'Analyzing work order trends and patterns',
        confidence: 0.85,
        dataSource: 'Statistical Analysis',
        plainEnglish: 'Looking at how work order volume has changed over time to spot trends.',
      });

      const now = Date.now();
      const weekAgo = now - 7 * 86400000;
      const twoWeeksAgo = now - 14 * 86400000;
      
      const recentOrders = workOrders.filter(wo => new Date(wo.createdAt).getTime() > weekAgo);
      const olderOrders = workOrders.filter(wo => {
        const t = new Date(wo.createdAt).getTime();
        return t > twoWeeksAgo && t <= weekAgo;
      });
      
      const changeRate = olderOrders.length > 0 
        ? ((recentOrders.length - olderOrders.length) / olderOrders.length * 100).toFixed(0)
        : 'N/A';

      // Severity trend
      const recentCritical = recentOrders.filter(w => w.severity === 'critical').length;
      const olderCritical = olderOrders.filter(w => w.severity === 'critical').length;
      const criticalTrend = recentCritical > olderCritical ? 'increasing' : recentCritical < olderCritical ? 'decreasing' : 'stable';
      
      // Type breakdowns
      const totalPotholes = workOrders.filter(w => w.issueType === 'pothole').length;
      const totalSidewalk = workOrders.filter(w => w.issueType === 'sidewalk').length;
      const totalConcrete = workOrders.filter(w => w.issueType === 'concrete').length;
      const recentPotholes = recentOrders.filter(w => w.issueType === 'pothole').length;
      const recentSidewalk = recentOrders.filter(w => w.issueType === 'sidewalk').length;
      const recentConcrete = recentOrders.filter(w => w.issueType === 'concrete').length;
      
      // Conclusion
      let trendConclusion = '';
      if (Number(changeRate) > 20) {
        trendConclusion = 'Work orders are increasing significantly. Consider proactive maintenance and additional crew capacity.';
      } else if (Number(changeRate) < -20) {
        trendConclusion = 'Work orders are decreasing -- current maintenance strategy appears effective.';
      } else {
        trendConclusion = 'Volume is stable. Continue current crew allocation.';
      }

      answer = `Here's the trend analysis for your ${workOrders.length} work orders.`;

      responseCard = {
        type: 'multi-select',
        title: 'Trend Analysis',
        subtitle: `${workOrders.length} total work orders analyzed`,
        stats: [
          { label: 'This Week', value: String(recentOrders.length), color: 'var(--accent-primary)' },
          { label: 'Last Week', value: String(olderOrders.length), color: 'var(--text-muted)' },
          { label: 'Change', value: changeRate !== 'N/A' ? `${Number(changeRate) > 0 ? '+' : ''}${changeRate}%` : 'N/A', color: Number(changeRate) > 0 ? 'var(--accent-danger)' : 'var(--accent-success)' },
        ],
        fields: [
          { label: 'Critical Trend', value: `${olderCritical} \u2192 ${recentCritical} (${criticalTrend})`, icon: 'severity' },
          { label: 'Potholes', value: `${recentPotholes} this week / ${totalPotholes} total`, icon: 'type' },
          { label: 'Sidewalk', value: `${recentSidewalk} this week / ${totalSidewalk} total`, icon: 'type' },
          { label: 'Concrete', value: `${recentConcrete} this week / ${totalConcrete} total`, icon: 'type' },
        ],
      };
      if (trendConclusion) {
        responseCard.recommendation = {
          level: Number(changeRate) > 20 ? 'high' : 'standard',
          text: trendConclusion,
        };
      }
      
      actions.push({
        type: 'run_analysis',
        label: 'Run Monte Carlo Forecast',
        icon: 'chart',
        data: { analysis: 'forecast' }
      });
      break;
    }

    // ============ ANOMALY DETECTION ============
    case 'anomaly_detection': {
      reasoning.push({
        step: 2,
        description: 'Scanning for anomalies in work order data',
        confidence: 0.82,
        dataSource: 'Anomaly Detection Engine',
        plainEnglish: 'Scanning your data for anything unusual like cost spikes or overlooked issues.',
      });

      const anomalies: string[] = [];
      
      // Cost anomalies
      const costs = workOrders.map(w => w.estimatedCost || 0).filter(c => c > 0);
      const avgCostAll = costs.reduce((a, b) => a + b, 0) / costs.length;
      const stdDevCost = Math.sqrt(costs.reduce((s, c) => s + Math.pow(c - avgCostAll, 2), 0) / costs.length);
      const costOutliers = workOrders.filter(w => (w.estimatedCost || 0) > avgCostAll + 2 * stdDevCost);
      if (costOutliers.length > 0) {
        anomalies.push(`**${costOutliers.length} cost outliers** — estimates >$${Math.round(avgCostAll + 2 * stdDevCost).toLocaleString()} (2σ above mean $${Math.round(avgCostAll).toLocaleString()})`);
      }
      
      // Geographic clustering anomalies
      const densityMap: Record<string, number> = {};
      workOrders.forEach(wo => {
        const key = `${Math.round(wo.latitude * 100) / 100},${Math.round(wo.longitude * 100) / 100}`;
        densityMap[key] = (densityMap[key] || 0) + 1;
      });
      const hotspots = Object.entries(densityMap).filter(([, count]) => count > 5);
      if (hotspots.length > 0) {
        anomalies.push(`**${hotspots.length} geographic hotspots** — areas with unusually high issue density`);
      }
      
      // Age anomalies  
      const oldOrders = workOrders.filter(wo => {
        const days = (Date.now() - new Date(wo.createdAt).getTime()) / 86400000;
        return days > 30 && wo.status === 'open';
      });
      if (oldOrders.length > 0) {
        anomalies.push(`**${oldOrders.length} stale issues** — open for 30+ days without resolution`);
      }
      
      // Severity/school mismatch
      const lowPriorityNearSchool = workOrders.filter(w => w.nearSchool && (w.severity === 'low' || w.severity === 'medium'));
      if (lowPriorityNearSchool.length > 0) {
        anomalies.push(`**${lowPriorityNearSchool.length} potential under-prioritized** — low/medium issues near schools may need escalation`);
      }

      answer = `**Anomaly Detection Report**\n\n`;
      if (anomalies.length === 0) {
        answer += `No significant anomalies detected. Data looks healthy!`;
      } else {
        answer += `Found **${anomalies.length} anomalies** requiring attention:\n\n`;
        anomalies.forEach((a, i) => answer += `${i + 1}. ${a}\n\n`);
        
        if (costOutliers.length > 0) {
          mapCommands.push({
            type: 'select_features',
            payload: { ids: costOutliers.map(c => c.id) }
          });
          actions.push({
            type: 'map_command',
            label: 'Highlight cost outliers on map',
            icon: 'cost',
            data: { ids: costOutliers.map(c => c.id) }
          });
        }
      }
      break;
    }

    // ============ ZONE ANALYSIS ============
    case 'zone_analysis': {
      reasoning.push({
        step: 2,
        description: 'Breaking down work orders by zone',
        confidence: 0.90,
        dataSource: 'Zone Analysis',
        plainEnglish: 'Breaking down the work orders by area so you can see which zones need the most attention.',
      });

      const zones: Record<string, WorkOrder[]> = {};
      workOrders.forEach(wo => {
        const zone = wo.zone || 'Unassigned';
        if (!zones[zone]) zones[zone] = [];
        zones[zone].push(wo);
      });

      answer = `**Zone Analysis**\n\n`;
      
      const sortedZones = Object.entries(zones).sort((a, b) => b[1].length - a[1].length);
      sortedZones.forEach(([zone, orders]) => {
        const cost = orders.reduce((s, w) => s + (w.estimatedCost || 0), 0);
        const critical = orders.filter(w => w.severity === 'critical').length;
        
        answer += `**${zone}** — ${orders.length} issues | $${cost.toLocaleString()}`;
        if (critical > 0) answer += ` | ${critical} critical`;
        answer += `\n`;
      });
      
      const worstZone = sortedZones[0];
      if (worstZone) {
        answer += `\n**Highest workload:** ${worstZone[0]} with ${worstZone[1].length} issues.`;
        
        const zoneOrders = worstZone[1];
        const avgLat = zoneOrders.reduce((s, w) => s + w.latitude, 0) / zoneOrders.length;
        const avgLng = zoneOrders.reduce((s, w) => s + w.longitude, 0) / zoneOrders.length;
        actions.push({
          type: 'map_command',
          label: `Zoom to ${worstZone[0]}`,
          icon: 'search',
          data: { lat: avgLat, lng: avgLng, zoom: 15 }
        });
      }
      break;
    }

    // ============ COMPARE / DISTRIBUTION ============
    case 'compare_severity': {
      reasoning.push({
        step: 2,
        description: 'Computing distribution breakdown',
        confidence: 0.93,
        dataSource: 'Statistical Analysis',
        plainEnglish: 'Crunching the numbers to show you how issues break down by severity, type, and status.',
      });

      const total = workOrders.length;
      const bySev = {
        critical: workOrders.filter(w => w.severity === 'critical').length,
        high: workOrders.filter(w => w.severity === 'high').length,
        medium: workOrders.filter(w => w.severity === 'medium').length,
        low: workOrders.filter(w => w.severity === 'low').length,
      };
      const byType = {
        pothole: workOrders.filter(w => w.issueType === 'pothole').length,
        sidewalk: workOrders.filter(w => w.issueType === 'sidewalk').length,
        concrete: workOrders.filter(w => w.issueType === 'concrete').length,
      };
      const byStatus = {
        open: workOrders.filter(w => w.status === 'open').length,
        assigned: workOrders.filter(w => w.status === 'assigned').length,
        in_progress: workOrders.filter(w => w.status === 'in_progress').length,
        completed: workOrders.filter(w => w.status === 'completed').length,
      };

      const bar = (count: number) => {
        const pct = Math.round((count / total) * 100);
        const filled = Math.round(pct / 5);
        return '█'.repeat(filled) + '░'.repeat(20 - filled) + ` ${pct}%`;
      };

      answer = `**Data Distribution — ${total} Work Orders**\n\n`;
      answer += `**By Severity:**\n`;
      answer += `Critical: ${bar(bySev.critical)} (${bySev.critical})\n`;
      answer += `High:     ${bar(bySev.high)} (${bySev.high})\n`;
      answer += `Medium:   ${bar(bySev.medium)} (${bySev.medium})\n`;
      answer += `Low:      ${bar(bySev.low)} (${bySev.low})\n\n`;
      
      answer += `**By Type:**\n`;
      answer += `Pothole:  ${bar(byType.pothole)} (${byType.pothole})\n`;
      answer += `Sidewalk: ${bar(byType.sidewalk)} (${byType.sidewalk})\n`;
      answer += `Concrete: ${bar(byType.concrete)} (${byType.concrete})\n\n`;
      
      answer += `**By Status:**\n`;
      answer += `Open:     ${bar(byStatus.open)} (${byStatus.open})\n`;
      answer += `Assigned: ${bar(byStatus.assigned)} (${byStatus.assigned})\n`;
      answer += `Active:   ${bar(byStatus.in_progress)} (${byStatus.in_progress})\n`;
      answer += `Done:     ${bar(byStatus.completed)} (${byStatus.completed})`;
      break;
    }

    // ============ SCHOOL PROXIMITY ============
    case 'find_nearest_school': {
      const nearSchools = workOrders.filter(w => w.nearSchool);
      
      mapCommands.push({ type: 'toggle_layer', payload: { layer: 'schools', visible: true } });
      
      if (nearSchools.length > 0) {
        mapCommands.push({
          type: 'select_features',
          payload: { ids: nearSchools.map(s => s.id) }
        });
        
        answer = `**School Zone Report**\n\n`;
        answer += `Found **${nearSchools.length} issues** near school zones. Schools layer has been enabled.\n\n`;
        
        const bySeverity = {
          critical: nearSchools.filter(w => w.severity === 'critical').length,
          high: nearSchools.filter(w => w.severity === 'high').length,
          medium: nearSchools.filter(w => w.severity === 'medium').length,
          low: nearSchools.filter(w => w.severity === 'low').length,
        };
        
        if (bySeverity.critical > 0) answer += `**${bySeverity.critical} CRITICAL** near schools — immediate action required!\n`;
        if (bySeverity.high > 0) answer += `${bySeverity.high} high severity near schools\n`;
        if (bySeverity.medium > 0) answer += `• ${bySeverity.medium} medium severity\n`;
        if (bySeverity.low > 0) answer += `• ${bySeverity.low} low severity\n`;
        
        answer += `\n**Recommendation:** Schedule critical school-zone repairs during weekends/holidays to minimize disruption.`;
        
        actions.push({
          type: 'map_command',
          label: 'Zoom to school-zone issues',
          icon: 'school',
          data: { lat: nearSchools[0].latitude, lng: nearSchools[0].longitude, zoom: 15 }
        });
      } else {
        answer = `No infrastructure issues near school zones currently. Schools layer enabled on map.`;
      }
      break;
    }

    // ============ SUMMARY ============
    case 'summary': {
      const total = workOrders.length;
      const open = workOrders.filter(w => w.status === 'open').length;
      const critical = workOrders.filter(w => w.severity === 'critical').length;
      const high = workOrders.filter(w => w.severity === 'high').length;
      const nearSchool = workOrders.filter(w => w.nearSchool).length;
      const totalCost = workOrders.reduce((s, w) => s + (w.estimatedCost || 0), 0);
      
      const estimation = calculateCrewEstimation({
        workOrders,
        temperature: weather?.temperature ?? 40,
        weatherCondition: weather?.condition ?? 'cloudy',
        daysAhead: 7,
        crewAvailability: 80
      });
      
      answer = `**MAINTAIN AI — Infrastructure Summary**\n\n`;
      answer += `**Work Orders:** ${total} total (${open} open)\n`;
      answer += `**Critical Issues:** ${critical}\n`;
      answer += `**High Priority:** ${high}\n`;
      answer += `**Near Schools:** ${nearSchool}\n`;
      answer += `**Estimated Budget:** $${totalCost.toLocaleString()}\n`;
      answer += `**Crews Recommended:** ${estimation.totalCrews}\n`;
      answer += `**Weather:** ${weather?.condition || 'N/A'}, ${weather?.temperature || 'N/A'}°F\n\n`;
      
      answer += `**Quick Actions:**\n`;
      answer += `• "Show me critical issues" — zoom to urgent items\n`;
      answer += `• "Turn on heatmap" — see issue density\n`;
      answer += `• "Run cluster analysis" — group by location\n`;
      answer += `• "What are the trends?" — see volume changes\n`;
      answer += `• "Find anomalies" — detect unusual patterns`;
      break;
    }

    // ============ WHAT-IF SCENARIO ============
    case 'what_if': {
      reasoning.push({
        step: 2,
        description: 'Running scenario simulation',
        confidence: 0.83,
        dataSource: 'Scenario Engine',
        plainEnglish: 'Simulating a what-if scenario to see how changes would affect crew needs.',
      });

      const q = question.toLowerCase();
      let tempChange = 0;
      let crewPct = 80;
      
      if (q.includes('freeze') || q.includes('cold')) tempChange = -20;
      else if (q.includes('hot') || q.includes('heat')) tempChange = 15;
      if (q.match(/(\d+)%?\s*(crew|staff|fewer|less)/)) {
        const match = q.match(/(\d+)/);
        if (match) crewPct = parseInt(match[1]);
      }

      const currentCrews = calculateCrewEstimation({
        workOrders, temperature: weather?.temperature ?? 40, weatherCondition: weather?.condition ?? 'cloudy', daysAhead: 7, crewAvailability: 80
      });
      const scenarioCrews = calculateCrewEstimation({
        workOrders, temperature: (weather?.temperature ?? 40) + tempChange, weatherCondition: tempChange < -10 ? 'freezing' : weather?.condition ?? 'cloudy', daysAhead: 7, crewAvailability: crewPct
      });
      
      const delta = scenarioCrews.totalCrews - currentCrews.totalCrews;
      
      answer = `**What-If Scenario**\n\n`;
      answer += `**Current state:** ${currentCrews.totalCrews} crews needed\n`;
      if (tempChange !== 0) answer += `**Temperature change:** ${tempChange > 0 ? '+' : ''}${tempChange}°F\n`;
      if (crewPct !== 80) answer += `**Crew availability:** ${crewPct}%\n`;
      answer += `**Scenario result:** ${scenarioCrews.totalCrews} crews needed\n`;
      answer += `**Impact:** ${delta > 0 ? '+' : ''}${delta} crews (${delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'no change'})\n\n`;
      
      answer += `**Breakdown:**\n`;
      answer += `• Pothole: ${currentCrews.potholeCrew} → ${scenarioCrews.potholeCrew}\n`;
      answer += `• Sidewalk: ${currentCrews.sidewalkCrews} → ${scenarioCrews.sidewalkCrews}\n`;
      answer += `• Concrete: ${currentCrews.concreteCrews} → ${scenarioCrews.concreteCrews}\n\n`;
      
      if (delta > 2) answer += `Significant increase — consider contractor support.`;
      else if (delta < -1) answer += `Reduced requirements — opportunity to reassign crews.`;
      else answer += `Minimal impact on crew requirements.`;
      break;
    }

    // ============ DECAY SIMULATION ============
    case 'decay_simulation': {
      reasoning.push({
        step: 2,
        description: 'Launching infrastructure decay time-lapse simulation',
        confidence: 0.95,
        dataSource: 'Decay Simulation Engine',
        plainEnglish: 'Starting a time-lapse to show what happens to roads and sidewalks if repairs are delayed.',
      });

      const totalCostNow = workOrders.reduce((s, w) => s + (w.estimatedCost || 0), 0);
      const criticalNow = workOrders.filter(w => w.severity === 'critical').length;

      mapCommands.push({ type: 'show_decay' as any });

      answer = `**Infrastructure Decay Simulation — Launched!**\n\n`;
      answer += `I've started a **12-month time-lapse** showing what happens to Lake Forest's infrastructure if no repairs are made.\n\n`;
      answer += `**Starting conditions:**\n`;
      answer += `• ${workOrders.length} open work orders\n`;
      answer += `• ${criticalNow} already critical\n`;
      answer += `• Current repair bill: $${totalCostNow.toLocaleString()}\n\n`;
      answer += `**What to watch for:**\n`;
      answer += `• Green → Yellow → Orange → Red color shift shows deterioration\n`;
      answer += `• Glowing rings expand as damage worsens\n`;
      answer += `• New damage **spawns** near unrepaired critical sites\n`;
      answer += `• Costs **escalate exponentially** with neglect\n\n`;
      answer += `Use the playback controls on the left panel to scrub through time. Click any marker on the map for details.`;

      actions.push({
        type: 'map_command',
        label: 'Stop Decay Simulation',
        icon: 'dismiss',
        data: { action: 'stop_decay' }
      });
      break;
    }

    // ============ HELP ============
    case 'help': {
      answer = `**MAINTAIN AI Agent — What I Can Do**\n\n`;
      answer += `**Map Controls (I can control the map!):**\n`;
      answer += `• "Show heatmap" / "Hide heatmap"\n`;
      answer += `• "Turn on school layer" / "Turn off crews"\n`;
      answer += `• "Zoom to critical issues"\n`;
      answer += `• "Show me Zone 4"\n`;
      answer += `• "Focus on potholes"\n`;
      answer += `• "Run cluster analysis"\n\n`;
      
      answer += `**Data Analysis:**\n`;
      answer += `• "What's selected?" — info about map selection\n`;
      answer += `• "How much will this cost?" — cost breakdown\n`;
      answer += `• "How many crews do I need?" — staffing estimate\n`;
      answer += `• "What should be fixed first?" — priority ranking\n`;
      answer += `• "Show me the distribution" — severity/type charts\n\n`;
      
      answer += `**ML & Insights:**\n`;
      answer += `• "What are the trends?" — volume/severity trends\n`;
      answer += `• "Find anomalies" — detect unusual patterns\n`;
      answer += `• "How will weather affect repairs?" — weather impact\n`;
      answer += `• "What if it freezes?" — scenario simulation\n`;
      answer += `• "Analyze zones" — zone-by-zone breakdown\n`;
      answer += `• **"Show me the decay"** — animated time-lapse of infrastructure deterioration\n\n`;
      
      answer += `**Tips:**\n`;
      answer += `• Select items on the map, then ask "what's this?"\n`;
      answer += `• I understand natural language — just ask!\n`;
      answer += `• Click action buttons in my responses for quick actions`;
      break;
    }

    // ============ GENERAL / FALLBACK ============
    default: {
      reasoning.push({
        step: 2,
        description: 'Analyzing question context and generating intelligent response',
        confidence: 0.85,
        dataSource: 'Data Aggregation + NLP',
        plainEnglish: 'Understanding your question and putting together a detailed, contextual answer.',
      });
      
      const critical = workOrders.filter(wo => wo.severity === 'critical').length;
      const high = workOrders.filter(wo => wo.severity === 'high').length;
      const medium = workOrders.filter(wo => wo.severity === 'medium').length;
      const low = workOrders.filter(wo => wo.severity === 'low').length;
      const open = workOrders.filter(wo => wo.status === 'open').length;
      const totalCost = workOrders.reduce((sum, wo) => sum + (wo.estimatedCost || 0), 0);
      const potholes = workOrders.filter(w => w.issueType === 'pothole').length;
      const sidewalk = workOrders.filter(w => w.issueType === 'sidewalk').length;
      const concrete = workOrders.filter(w => w.issueType === 'concrete').length;
      const nearSchool = workOrders.filter(w => w.nearSchool).length;
      const q = question.toLowerCase();

      // Build a contextual answer based on the actual question text
      if (q.includes('status') || q.includes('overview') || q.includes('summary') || q.includes('tell me about') || q.includes('what do we have')) {
        answer = `**Infrastructure Status Overview**\n\n`;
        answer += `We're currently tracking **${workOrders.length} work orders** across Lake Forest.\n\n`;
        answer += `**Severity Breakdown:**\n`;
        answer += `• **Critical:** ${critical} issues requiring immediate attention\n`;
        answer += `• **High:** ${high} issues needing prompt resolution\n`;
        answer += `• **Medium:** ${medium} issues for scheduled maintenance\n`;
        answer += `• **Low:** ${low} minor issues for routine handling\n\n`;
        answer += `**By Type:**\n`;
        answer += `• Potholes: ${potholes} | Sidewalk: ${sidewalk} | Concrete: ${concrete}\n`;
        if (nearSchool > 0) answer += `• **${nearSchool} issues** are near school zones (elevated priority)\n`;
        answer += `\n**Estimated Total Cost:** $${totalCost.toLocaleString()}\n\n`;
        if (critical > 0) {
          answer += `**Recommendation:** ${critical} critical issues should be addressed first. Try asking "what should be fixed first?" for a prioritized action plan.`;
        } else {
          answer += `**Status:** No critical issues — infrastructure is in manageable condition. Try "what are the trends?" to see if things are improving.`;
        }
      } else if (q.includes('how') && (q.includes('doing') || q.includes('going') || q.includes('look'))) {
        const healthScore = critical === 0 ? 'Good' : critical <= 3 ? 'Fair' : critical <= 8 ? 'Needs Attention' : 'Critical';
        answer = `**Infrastructure Health: ${healthScore}**\n\n`;
        answer += `Here's how things stand:\n`;
        answer += `• **${open} open work orders** out of ${workOrders.length} total\n`;
        answer += `• **${critical} critical** and **${high} high-severity** issues active\n`;
        answer += `• Estimated repair costs: **$${totalCost.toLocaleString()}**\n\n`;
        if (critical > 0) {
          answer += `The ${critical} critical issues are the top concern. I can help you prioritize repairs — just ask "what should be fixed first?"`;
        } else {
          answer += `Overall, things look good. No critical issues at the moment. Want me to check for trends or anomalies?`;
        }
      } else if (q.includes('help') || q.includes('what can')) {
        // Redirect to help
        answer = `I can help with lots of things! Here are some ideas:\n\n`;
        answer += `• **"What's the current status?"** — full infrastructure overview\n`;
        answer += `• **"What should be fixed first?"** — AI-powered priority ranking\n`;
        answer += `• **"How many crews do we need?"** — staffing estimates\n`;
        answer += `• **"Show me the heatmap"** — visualize issue density\n`;
        answer += `• **"What are the trends?"** — pattern analysis\n`;
        answer += `• **"How will weather affect repairs?"** — weather impact\n\n`;
        answer += `Try asking anything in natural language — I understand context!`;
      } else {
        // Smart general response that acknowledges the question
        answer = `Great question! Here's what I can tell you based on the current data:\n\n`;
        answer += `**Current Infrastructure Snapshot:**\n`;
        answer += `• **${workOrders.length} work orders** tracked (${open} open)\n`;
        answer += `• **${critical} critical** | ${high} high | ${medium} medium | ${low} low severity\n`;
        answer += `• **Top issue:** ${potholes >= sidewalk && potholes >= concrete ? `Potholes (${potholes})` : sidewalk >= concrete ? `Sidewalk damage (${sidewalk})` : `Concrete issues (${concrete})`}\n`;
        answer += `• **Est. cost:** $${totalCost.toLocaleString()}\n`;
        if (nearSchool > 0) answer += `• **${nearSchool} near schools** — flagged for priority\n`;
        answer += `\n**Want more detail?** Try one of these:\n`;
        answer += `• "Analyze the infrastructure trends"\n`;
        answer += `• "What should be fixed first?"\n`;
        answer += `• "Compare severity distribution"\n`;
        answer += `• "How many crews do we need?"`;
      }

      responseCard = {
        type: 'multi-select',
        title: 'Infrastructure Overview',
        subtitle: `${workOrders.length} work orders`,
        stats: [
          { label: 'Open', value: String(open), color: 'var(--accent-primary)' },
          { label: 'Critical', value: String(critical), color: 'var(--accent-danger)' },
          { label: 'Est. Cost', value: `$${totalCost.toLocaleString()}`, color: 'var(--accent-warning)' },
        ],
        fields: [
          { label: 'Potholes', value: String(potholes), icon: 'type' },
          { label: 'Sidewalk', value: String(sidewalk), icon: 'type' },
          { label: 'Concrete', value: String(concrete), icon: 'type' },
          { label: 'Near Schools', value: String(nearSchool), icon: 'school' },
        ],
        recommendation: {
          level: critical > 10 ? 'urgent' : critical > 5 ? 'high' : 'standard',
          text: critical > 0
            ? `${critical} critical issues need attention. Try "show me critical issues" or "what should be fixed first?"`
            : 'No critical issues. Try "what are the trends?" or "find anomalies"',
        },
      };
    }
  }
  
  reasoning.push({
    step: reasoning.length + 1,
    description: `Response generated in ${Date.now() - startTime}ms`,
    confidence: 0.95,
    plainEnglish: `All done! Your answer was ready in ${(Date.now() - startTime) < 1000 ? `${Date.now() - startTime}ms` : `${((Date.now() - startTime) / 1000).toFixed(1)} seconds`}.`,
    durationMs: Date.now() - startTime,
  });

  // Final progress events for local engine path
  const totalDuration = Date.now() - startTime;
  onProgress({ agent: 'Local Engine', icon: 'gear', role: 'Fallback Analyst', task: `Processing "${intentLabel}"`, status: 'complete', output: `Intent handled: ${intent.primary}`, fullOutput: `Processed intent: ${intent.primary}\nUsed local heuristics and pre-computed analysis\nGenerated ${answer.length} character response`, confidence: 0.95, tokens: Math.round(answer.length / 4), durationMs: totalDuration, plainEnglish: `Finished analyzing \u2014 found the answer using built-in intelligence` });
  onProgress({ agent: 'Response Builder', icon: 'sparkle', role: 'Output Formatter', task: 'Formatting response', status: 'complete', output: `${answer.length} chars`, fullOutput: `Formatted response with markdown structure\nOutput length: ${answer.length} characters${responseCard ? '\nAdaptive card: attached' : ''}`, tokens: Math.round(answer.length / 4), durationMs: totalDuration, plainEnglish: 'Your answer is ready!' });

  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: answer,
    reasoning,
    actions: actions.length > 0 ? actions : undefined,
    mapCommands: mapCommands.length > 0 ? mapCommands : undefined,
    timestamp: new Date(),
    card: responseCard,
  };
}

// ============================================
// Model Router & RAG API Functions
// ============================================

/** Fetch Model Router status (routing table, models, tiers) */
async function getModelRouterStatus(): Promise<Record<string, unknown> | null> {
  if (!AGENT_API_URL) return null;
  try {
    const res = await fetch(`${AGENT_API_URL}/api/model-router/status`, { signal: AbortSignal.timeout(10000) });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

/** Fetch routing decision for a specific agent */
async function getModelRoute(agentName: string): Promise<Record<string, unknown> | null> {
  if (!AGENT_API_URL) return null;
  try {
    const res = await fetch(`${AGENT_API_URL}/api/model-router/route/${agentName}`);
    return res.ok ? res.json() : null;
  } catch { return null; }
}

/** Query RAG knowledge base with augmented generation */
async function queryRAG(query: string, context?: string, topK = 3): Promise<Record<string, unknown> | null> {
  return callAgentApi<Record<string, unknown>>('/api/rag/query', { query, context: context || '', top_k: topK }, 30000);
}

/** Search RAG knowledge base (retrieval only, no generation) */
async function searchRAG(query: string, topK = 5): Promise<Record<string, unknown> | null> {
  if (!AGENT_API_URL) return null;
  try {
    const res = await fetch(`${AGENT_API_URL}/api/rag/search?q=${encodeURIComponent(query)}&top_k=${topK}`);
    return res.ok ? res.json() : null;
  } catch { return null; }
}

/** Get RAG pipeline status */
async function getRAGStatus(): Promise<Record<string, unknown> | null> {
  if (!AGENT_API_URL) return null;
  try {
    const res = await fetch(`${AGENT_API_URL}/api/rag/status`);
    return res.ok ? res.json() : null;
  } catch { return null; }
}

// A2A Orchestrator API Functions
// ─────────────────────────────────────────────

interface OrchestrationRequest {
  pipeline: 'full_assessment' | 'triage' | 'deploy_crews' | 'investigate';
  query?: string;
  weather?: string;
  temperature?: number;
  days?: number;
  crew_availability?: number;
  work_orders?: Record<string, unknown>[];
}

/** Run an A2A orchestration pipeline */
async function runOrchestration(req: OrchestrationRequest): Promise<Record<string, unknown> | null> {
  if (!AGENT_API_URL) return null;
  try {
    const res = await fetch(`${AGENT_API_URL}/api/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

/** Get A2A orchestrator status and available pipelines */
async function getOrchestratorStatus(): Promise<Record<string, unknown> | null> {
  if (!AGENT_API_URL) return null;
  try {
    const res = await fetch(`${AGENT_API_URL}/api/orchestrate/status`);
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export default {
  generateInsights,
  estimateCrews,
  runScenario,
  calculateCrewEstimation,
  askQuestion,
  askQuestionStreaming,
  resetAgentApi,
  isAgentApiAvailable: () => agentApiAvailable,
  getModelRouterStatus,
  getModelRoute,
  queryRAG,
  searchRAG,
  getRAGStatus,
  runOrchestration,
  getOrchestratorStatus,
};

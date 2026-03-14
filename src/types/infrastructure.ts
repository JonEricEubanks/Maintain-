/**
 * MAINTAIN AI - Type Definitions
 * 
 * Core types for infrastructure data, AI insights, and crew management
 */

// ============================================
// Work Order Types
// ============================================

export type IssueType = 'pothole' | 'sidewalk' | 'concrete';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderStatus = 'open' | 'assigned' | 'in_progress' | 'completed' | 'deferred';

export interface WorkOrder {
  id: string;
  issueType: IssueType;
  severity: Severity;
  status: WorkOrderStatus;
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  estimatedCost: number;
  priorityScore: number;
  createdAt: string;
  updatedAt: string;
  assignedCrewId?: string;
  nearSchool: boolean;
  zone: string;
}

// ============================================
// Crew Types
// ============================================

export type CrewStatus = 'available' | 'assigned' | 'on_break' | 'off_duty';
export type CrewSpecialization = 'pothole' | 'sidewalk' | 'concrete' | 'general';

export interface Crew {
  id: string;
  name: string;
  specialization: CrewSpecialization;
  status: CrewStatus;
  efficiencyRating: number; // 0.0 - 1.0
  currentLat: number;
  currentLng: number;
  memberCount: number;
  assignedWorkOrders: string[];
}

/**
 * Persistent crew member record stored in Dataverse (iw_crewmember).
 * Extends the runtime Crew interface with contact/admin fields.
 */
export interface CrewMember extends Crew {
  email?: string;
  phone?: string;
  certifications?: string[];
  zone?: string;
  hireDate?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CrewEstimation {
  potholeCrew: number;
  sidewalkCrews: number;
  concreteCrews: number;
  totalCrews: number;
  reasoning: string[];
  confidence: number;
  factors: CrewFactor[];
}

export interface CrewFactor {
  name: string;
  value: number;
  weight: number;
  impact: 'positive' | 'negative' | 'neutral';
}

// ============================================
// Weather Types
// ============================================

export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'snow' | 'freezing' | 'freeze_thaw';

export interface WeatherForecast {
  date: string;
  temperature: number; // Fahrenheit
  condition: WeatherCondition;
  windSpeed: number; // MPH
  precipitation: number; // inches
  workabilityScore: number; // 0.0 - 1.0
}

// ============================================
// AI Insight Types
// ============================================

export type InsightType = 'priority' | 'crew_estimate' | 'prediction' | 'alert';

export interface AIInsight {
  id: string;
  type: InsightType;
  title: string;
  recommendation: string;
  confidence: number; // 0.0 - 1.0
  reasoning: ReasoningStep[];
  factors: InsightFactor[];
  createdAt: string;
  expiresAt: string;
  isProactive: boolean;
}

export interface ReasoningStep {
  step: number;
  description: string;
  confidence: number;
  dataSource?: string;
  /** Friendly plain-English explanation for non-technical users */
  plainEnglish?: string;
  /** How long this particular step took in ms */
  durationMs?: number;
  /** When this step started */
  startedAt?: string;
}

export interface InsightFactor {
  name: string;
  weight: number;
  description: string;
}

// ============================================
// Scenario Simulation Types
// ============================================

export interface ScenarioParams {
  temperatureChange: number;
  daysAhead: number;
  crewAvailability: number; // percentage
  weatherOverride?: WeatherCondition;
}

export interface ScenarioResult {
  predictedWorkOrders: number;
  crewsRequired: number;
  budgetImpact: number;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

// ============================================
// MCP Tool Response Types
// ============================================

export interface MCPToolResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PriorityScoreResponse {
  workOrderId: string;
  score: number;
  factors: {
    severity: number;
    age: number;
    schoolProximity: number;
    trafficImpact: number;
    weatherRisk: number;
  };
}

export interface CostEstimateResponse {
  issueType: IssueType;
  severity: Severity;
  estimatedCost: number;
  laborHours: number;
  materials: string[];
}

// ============================================
// UI State Types
// ============================================

export interface MapState {
  center: [number, number];
  zoom: number;
  selectedWorkOrderId: string | null;
  visibleLayers: {
    workOrders: boolean;
    crews: boolean;
    heatmap: boolean;
    hexbin: boolean;
    schools: boolean;
    parcels: boolean;
    zoning: boolean;
  };
  filterPriority: Severity | 'all';
  filterType: IssueType | 'all';
}

export interface NotificationToast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  duration: number;
  isProactive: boolean;
}

// ============================================
// Dataverse Entity Types
// ============================================

export interface WorkOrderHistoryRecord {
  id: string;
  workOrderId: string;
  issueType: IssueType;
  severity: Severity;
  repairDuration: number; // hours
  crewSize: number;
  weatherCondition: WeatherCondition;
  temperature: number;
  resolvedOn: string;
  cost: number;
}

export interface AIInsightRecord {
  id: string;
  type: InsightType;
  confidence: number;
  reasoning: string; // JSON string
  recommendation: string;
  createdOn: string;
  expiresOn: string;
}

// ============================================
// Agent Communication Types
// ============================================

export interface AgentRequest {
  agentName: 'analysis' | 'prioritization' | 'crew_estimation';
  input: string;
  context?: Record<string, unknown>;
}

export interface AgentResponse {
  success: boolean;
  output: string;
  reasoning: ReasoningStep[];
  toolCalls: ToolCall[];
  confidence: number;
  processingTimeMs: number;
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

// ============================================
// Agent ↔ Map Interaction Types
// ============================================

export type MapCommandType = 
  | 'toggle_layer'
  | 'zoom_to'
  | 'highlight_feature'
  | 'select_features'
  | 'clear_selection'
  | 'show_clusters'
  | 'hide_clusters'
  | 'filter_by_severity'
  | 'filter_by_type'
  | 'reset_view'
  | 'zoom_to_all';

export interface MapCommand {
  type: MapCommandType;
  payload?: Record<string, unknown>;
}

export type AgentActionType =
  | 'map_command'
  | 'run_analysis'
  | 'show_chart'
  | 'navigate_tab';

export interface AgentAction {
  type: AgentActionType;
  label: string;
  icon?: string;
  data: Record<string, unknown>;
}

// ============================================
// Dataverse — Crew Dispatch Types
// ============================================

export type DispatchStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export interface CrewDispatch {
  id: string;
  name: string;               // DISP-2026-0001
  workOrderId: string;
  crewId: string;
  crewName: string;
  status: DispatchStatus;
  priority: Severity;
  issueType: IssueType;
  address: string;
  latitude: number;
  longitude: number;
  estimatedDuration: number;   // hours
  actualDuration?: number;
  estimatedCost: number;
  actualCost?: number;
  aiConfidence: number;        // 0.0-1.0
  aiReasoning: string;         // JSON reasoning steps
  approvedBy?: string;
  approvedOn?: string;
  dispatchedAt?: string;
  completedAt?: string;
  notes?: string;
  weatherAtDispatch?: string;
  nearSchool: boolean;
  zone: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Dataverse — Field Inspection Types
// ============================================

export type InspectionType =
  | 'pre_repair'
  | 'in_progress'
  | 'completion'
  | 'quality_assurance'
  | 'follow_up';

export type ConditionRating = 1 | 2 | 3 | 4 | 5;

export interface FieldInspection {
  id: string;
  name: string;               // INSP-2026-0001
  dispatchId: string;
  workOrderId: string;
  inspectorName: string;
  inspectionType: InspectionType;
  conditionRating: ConditionRating;
  repairCompleted: boolean;
  timeSpent?: number;          // hours
  materialsUsed?: MaterialItem[];
  photoUrls?: string[];
  latitude?: number;
  longitude?: number;
  safetyHazardsFound: boolean;
  hazardDescription?: string;
  notes?: string;
  weatherCondition?: string;
  temperature?: number;
  createdAt: string;
}

export interface MaterialItem {
  name: string;
  quantity: number;
  unit: string;
  cost?: number;
}

// ============================================
// Dataverse — AI Decision Log Types
// ============================================

export type AIAgentName =
  | 'analysis'
  | 'prioritization'
  | 'crew_estimation'
  | 'report'
  | 'nlp_dashboard'
  | 'dispatch';

export type AIDecisionType =
  | 'priority_ranking'
  | 'crew_assignment'
  | 'risk_assessment'
  | 'cost_estimation'
  | 'route_optimization'
  | 'weather_impact'
  | 'proactive_alert'
  | 'dispatch_recommendation'
  | 'weibull_survival_assessment';

export interface AIDecisionLogEntry {
  id: string;
  name: string;                // AID-2026-0001
  agentName: AIAgentName;
  decisionType: AIDecisionType;
  inputSummary: string;        // JSON
  outputSummary: string;       // JSON
  confidenceScore: number;
  reasoningJson: string;       // Full reasoning chain
  tokensUsed?: number;
  processingTimeMs?: number;
  modelName: string;
  humanOverride: boolean;
  overrideReason?: string;
  relatedWorkOrderIds: string[];
  createdAt: string;
}

// ============================================
// Dataverse — Crew Schedule Types
// ============================================

export interface CrewSchedule {
  id: string;
  name: string;               // Alpha-Pothole-Wk08-2026
  crewId: string;
  crewName: string;
  weekStart: string;
  weekEnd: string;
  plannedHours: number;
  actualHours?: number;
  zoneAssignment: string;
  specialization: CrewSpecialization;
  availability: number;        // 0-100%
  plannedDispatches: number;
  completedDispatches: number;
  aiOptimized: boolean;
  notes?: string;
}

// ============================================
// Dataverse — Work Order Update Types
// ============================================

export type UpdateSource = 'ai_agent' | 'manager' | 'field_crew' | 'system';

export interface WorkOrderUpdateRecord {
  id: string;
  name: string;                // UPD-2026-0001
  workOrderId: string;
  previousStatus: WorkOrderStatus;
  newStatus: WorkOrderStatus;
  updatedBy: string;
  updatedSource: UpdateSource;
  notes?: string;
  createdAt: string;
}

// ============================================
// Dispatch Workflow Types
// ============================================

export interface DispatchRecommendation {
  workOrderId: string;
  workOrder: WorkOrder;
  recommendedCrewId: string;
  recommendedCrew: Crew;
  priority: Severity;
  estimatedDuration: number;
  estimatedCost: number;
  confidence: number;
  reasoning: ReasoningStep[];
  factors: {
    proximity: number;         // distance score
    specialization: number;    // skill match score
    workload: number;          // current workload score
    urgency: number;           // time-sensitive score
    weather: number;           // weather feasibility score
  };
  suggestedTimeSlot: string;   // ISO timestamp
}

export interface DispatchBatch {
  id: string;
  dispatches: CrewDispatch[];
  totalEstimatedCost: number;
  totalEstimatedHours: number;
  crewUtilization: number;     // 0-100%
  generatedAt: string;
  generatedBy: AIAgentName;
  approved: boolean;
}

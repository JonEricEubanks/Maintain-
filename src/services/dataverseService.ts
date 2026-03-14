/**
 * MAINTAIN AI — Dataverse Service
 *
 * Wraps the Power Apps SDK generated services for all WRITE operations.
 * MCP remains READ-ONLY for city data; Dataverse handles all mutations.
 *
 * Architecture:
 *   MCP  → READ city work orders, potholes, sidewalks, schools (never writes)
 *   DV   → READ/WRITE dispatches, inspections, AI decision logs, crew schedules
 *
 * After running `pac code add-data-source -a dataverse -t <table>` for each
 * table, the SDK will generate typed model + service files in /generated/.
 * This wrapper provides a unified API and a localStorage demo fallback so
 * the app remains fully functional before the Dataverse tables exist.
 *
 * Setup commands (run once after tables are provisioned):
 *   pac code add-data-source -a dataverse -t iw_crewdispatch
 *   pac code add-data-source -a dataverse -t iw_fieldinspection
 *   pac code add-data-source -a dataverse -t iw_aidecisionlog
 *   pac code add-data-source -a dataverse -t iw_crewschedule
 *   pac code add-data-source -a dataverse -t iw_workorderupdate
 */

import type {
  CrewDispatch,
  DispatchStatus,
  FieldInspection,
  AIDecisionLogEntry,
  CrewSchedule,
  WorkOrderUpdateRecord,
  Severity,
  IssueType,
  WorkOrderStatus,
  AIAgentName,
  AIDecisionType,
  InspectionType,
  ConditionRating,
  UpdateSource,
  CrewSpecialization,
  CrewStatus,
  CrewMember,
} from '../types/infrastructure';

// ============================================
// Backend API Configuration (legacy — kept for backward compatibility)
// ============================================

/** URL for the Python FastAPI backend (locally or on Azure Container Apps) */
const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

// Note: Backend API calls removed — Dataverse SDK is now the primary data layer.
// The AGENT_API_URL is still used by agentService.ts for AI agent calls.

/** Re-check backend availability (call on user action or periodic refresh) */
function resetBackendCheck(): void {
  // No-op — kept for API compatibility
}

// ============================================
// Generated SDK service imports (via pac code add-data-source)
// ============================================

import { Iw_crewdispatchsService } from '../generated/services/Iw_crewdispatchsService';
import { Iw_fieldinspectionsService } from '../generated/services/Iw_fieldinspectionsService';
import { Iw_aidecisionlogsService } from '../generated/services/Iw_aidecisionlogsService';
import { Iw_crewschedulesService } from '../generated/services/Iw_crewschedulesService';
import { Iw_workorderupdatesService } from '../generated/services/Iw_workorderupdatesService';
import { Iw_crewmembersService } from '../generated/services/Iw_crewmembersService';
import type { Iw_crewdispatchs } from '../generated/models/Iw_crewdispatchsModel';
import type { Iw_fieldinspections } from '../generated/models/Iw_fieldinspectionsModel';
import type { Iw_aidecisionlogs } from '../generated/models/Iw_aidecisionlogsModel';
import type { Iw_crewschedules } from '../generated/models/Iw_crewschedulesModel';
import type { Iw_workorderupdates } from '../generated/models/Iw_workorderupdatesModel';
import type { Iw_crewmembers } from '../generated/models/Iw_crewmembersModel';

// ============================================
// Configuration
// ============================================

/**
 * Dataverse is now connected via Power Apps SDK.
 * Each CRUD function tries the SDK first, then falls back to localStorage
 * (for local dev where the Power Apps runtime isn't available).
 */
const USE_DATAVERSE = true;

// ============================================
// Enum Mappings (app string ↔ Dataverse choice value)
// ============================================

const DISPATCH_STATUS_TO_DV: Record<DispatchStatus, number> = {
  draft: 100000000, pending_approval: 100000001, approved: 100000002, dispatched: 100000003,
  in_progress: 100000004, completed: 100000005, cancelled: 100000006, rejected: 100000007,
};
const DV_TO_DISPATCH_STATUS: Record<number, DispatchStatus> = Object.fromEntries(
  Object.entries(DISPATCH_STATUS_TO_DV).map(([k, v]) => [v, k as DispatchStatus]),
) as Record<number, DispatchStatus>;

const PRIORITY_TO_DV: Record<Severity, number> = { critical: 100000000, high: 100000001, medium: 100000002, low: 100000003 };
const DV_TO_PRIORITY: Record<number, Severity> = Object.fromEntries(
  Object.entries(PRIORITY_TO_DV).map(([k, v]) => [v, k as Severity]),
) as Record<number, Severity>;

const ISSUE_TYPE_TO_DV: Record<IssueType, number> = { pothole: 100000000, sidewalk: 100000001, concrete: 100000002 };
const DV_TO_ISSUE_TYPE: Record<number, IssueType> = Object.fromEntries(
  Object.entries(ISSUE_TYPE_TO_DV).map(([k, v]) => [v, k as IssueType]),
) as Record<number, IssueType>;

const AGENT_NAME_MAP: Record<AIAgentName, number> = {
  analysis: 100000000, prioritization: 100000001, crew_estimation: 100000002,
  report: 100000003, nlp_dashboard: 100000004, dispatch: 100000005,
};
const DV_TO_AGENT_NAME: Record<number, AIAgentName> = Object.fromEntries(
  Object.entries(AGENT_NAME_MAP).map(([k, v]) => [v, k as AIAgentName]),
) as Record<number, AIAgentName>;

const DECISION_TYPE_MAP: Record<AIDecisionType, number> = {
  priority_ranking: 100000000, crew_assignment: 100000001, risk_assessment: 100000002,
  cost_estimation: 100000003, route_optimization: 100000004, weather_impact: 100000005,
  proactive_alert: 100000006, dispatch_recommendation: 100000007, weibull_survival_assessment: 100000008,
};
const DV_TO_DECISION_TYPE: Record<number, AIDecisionType> = Object.fromEntries(
  Object.entries(DECISION_TYPE_MAP).map(([k, v]) => [v, k as AIDecisionType]),
) as Record<number, AIDecisionType>;

const INSPECTION_TYPE_MAP: Record<InspectionType, number> = {
  pre_repair: 100000000, in_progress: 100000001, completion: 100000002,
  quality_assurance: 100000003, follow_up: 100000004,
};
const DV_TO_INSPECTION_TYPE: Record<number, InspectionType> = Object.fromEntries(
  Object.entries(INSPECTION_TYPE_MAP).map(([k, v]) => [v, k as InspectionType]),
) as Record<number, InspectionType>;

const WO_STATUS_MAP: Record<WorkOrderStatus, number> = {
  open: 100000000, assigned: 100000001, in_progress: 100000002, completed: 100000003, deferred: 100000004,
};
const DV_TO_WO_STATUS: Record<number, WorkOrderStatus> = Object.fromEntries(
  Object.entries(WO_STATUS_MAP).map(([k, v]) => [v, k as WorkOrderStatus]),
) as Record<number, WorkOrderStatus>;

const UPDATE_SOURCE_MAP: Record<UpdateSource, number> = {
  ai_agent: 100000000, manager: 100000001, field_crew: 100000002, system: 100000003,
};
const DV_TO_UPDATE_SOURCE: Record<number, UpdateSource> = Object.fromEntries(
  Object.entries(UPDATE_SOURCE_MAP).map(([k, v]) => [v, k as UpdateSource]),
) as Record<number, UpdateSource>;

const SPECIALIZATION_MAP: Record<CrewSpecialization, number> = {
  pothole: 100000000, sidewalk: 100000001, concrete: 100000002, general: 100000003,
};
const DV_TO_SPECIALIZATION: Record<number, CrewSpecialization> = Object.fromEntries(
  Object.entries(SPECIALIZATION_MAP).map(([k, v]) => [v, k as CrewSpecialization]),
) as Record<number, CrewSpecialization>;

const CREW_STATUS_MAP: Record<CrewStatus, number> = {
  available: 100000000, assigned: 100000001, on_break: 100000002, off_duty: 100000003,
};
const DV_TO_CREW_STATUS: Record<number, CrewStatus> = Object.fromEntries(
  Object.entries(CREW_STATUS_MAP).map(([k, v]) => [v, k as CrewStatus]),
) as Record<number, CrewStatus>;

// ============================================
// DV ↔ App Type Mappers
// ============================================

function mapDvToDispatch(dv: Iw_crewdispatchs): CrewDispatch {
  return {
    id: dv.iw_crewdispatchid,
    name: dv.iw_name,
    workOrderId: dv.iw_workorderid,
    crewId: dv.iw_crewid,
    crewName: dv.iw_crewname || '',
    status: DV_TO_DISPATCH_STATUS[dv.iw_status as unknown as number] || 'draft',
    priority: DV_TO_PRIORITY[dv.iw_priority as unknown as number] || 'medium',
    issueType: DV_TO_ISSUE_TYPE[dv.iw_issuetype as unknown as number] || 'pothole',
    address: dv.iw_address || '',
    latitude: dv.iw_latitude ? Number(dv.iw_latitude) : 0,
    longitude: dv.iw_longitude ? Number(dv.iw_longitude) : 0,
    estimatedDuration: dv.iw_estimatedduration ? Number(dv.iw_estimatedduration) : 0,
    estimatedCost: dv.iw_estimatedcost ? Number(dv.iw_estimatedcost) : 0,
    actualDuration: dv.iw_actualduration ? Number(dv.iw_actualduration) : undefined,
    actualCost: dv.iw_actualcost ? Number(dv.iw_actualcost) : undefined,
    aiConfidence: dv.iw_aiconfidence ? Number(dv.iw_aiconfidence) : 0,
    aiReasoning: dv.iw_aireasoning || '[]',
    approvedBy: dv.iw_approvedby,
    approvedOn: dv.iw_approvedon,
    dispatchedAt: dv.iw_dispatchedat,
    completedAt: dv.iw_completedat,
    weatherAtDispatch: dv.iw_weatheratdispatch,
    nearSchool: dv.iw_nearschool === (1 as unknown as typeof dv.iw_nearschool),
    zone: dv.iw_zone || '',
    notes: dv.iw_notes,
    createdAt: dv.createdon || new Date().toISOString(),
    updatedAt: dv.modifiedon || new Date().toISOString(),
  };
}

function mapDispatchToDv(input: Record<string, unknown>): Partial<Omit<Iw_crewdispatchs, 'iw_crewdispatchid'>> {
  const rec: Record<string, unknown> = {};
  if (input.name != null) rec.iw_name = input.name;
  if (input.workOrderId != null) rec.iw_workorderid = input.workOrderId;
  if (input.crewId != null) rec.iw_crewid = input.crewId;
  if (input.crewName != null) rec.iw_crewname = input.crewName;
  if (input.status != null) rec.iw_status = DISPATCH_STATUS_TO_DV[input.status as DispatchStatus];
  if (input.priority != null) rec.iw_priority = PRIORITY_TO_DV[input.priority as Severity];
  if (input.issueType != null) rec.iw_issuetype = ISSUE_TYPE_TO_DV[input.issueType as IssueType];
  if (input.address != null) rec.iw_address = input.address;
  if (input.latitude != null) rec.iw_latitude = String(input.latitude);
  if (input.longitude != null) rec.iw_longitude = String(input.longitude);
  if (input.estimatedDuration != null) rec.iw_estimatedduration = String(input.estimatedDuration);
  if (input.estimatedCost != null) rec.iw_estimatedcost = String(input.estimatedCost);
  if (input.actualDuration != null) rec.iw_actualduration = String(input.actualDuration);
  if (input.actualCost != null) rec.iw_actualcost = String(input.actualCost);
  if (input.aiConfidence != null) rec.iw_aiconfidence = String(input.aiConfidence);
  if (input.aiReasoning != null) rec.iw_aireasoning = input.aiReasoning;
  if (input.approvedBy != null) rec.iw_approvedby = input.approvedBy;
  if (input.approvedOn != null) rec.iw_approvedon = input.approvedOn;
  if (input.dispatchedAt != null) rec.iw_dispatchedat = input.dispatchedAt;
  if (input.completedAt != null) rec.iw_completedat = input.completedAt;
  if (input.weatherAtDispatch != null) rec.iw_weatheratdispatch = input.weatherAtDispatch;
  if (input.nearSchool != null) rec.iw_nearschool = input.nearSchool ? 1 : 0;
  if (input.zone != null) rec.iw_zone = input.zone;
  if (input.notes != null) rec.iw_notes = input.notes;
  return rec as Partial<Omit<Iw_crewdispatchs, 'iw_crewdispatchid'>>;
}

function mapDvToInspection(dv: Iw_fieldinspections): FieldInspection {
  return {
    id: dv.iw_fieldinspectionid,
    name: dv.iw_name,
    dispatchId: dv.iw_dispatchid,
    workOrderId: dv.iw_workorderid,
    inspectorName: dv.iw_inspectorname,
    inspectionType: DV_TO_INSPECTION_TYPE[dv.iw_inspectiontype as unknown as number] || 'pre_repair',
    conditionRating: ((dv.iw_conditionrating as unknown as number) || 3) as ConditionRating,
    repairCompleted: dv.iw_repaircompleted === (1 as unknown as typeof dv.iw_repaircompleted),
    timeSpent: dv.iw_timespent ? Number(dv.iw_timespent) : undefined,
    materialsUsed: dv.iw_materialsused ? JSON.parse(dv.iw_materialsused) : [],
    safetyHazardsFound: dv.iw_safetyhazardsfound === (1 as unknown as typeof dv.iw_safetyhazardsfound),
    hazardDescription: dv.iw_hazarddescription,
    notes: dv.iw_notes,
    photoUrls: dv.iw_photourls ? JSON.parse(dv.iw_photourls) : [],
    weatherCondition: dv.iw_weathercondition,
    temperature: dv.iw_temperature ? Number(dv.iw_temperature) : undefined,
    latitude: dv.iw_latitude ? Number(dv.iw_latitude) : undefined,
    longitude: dv.iw_longitude ? Number(dv.iw_longitude) : undefined,
    createdAt: dv.createdon || new Date().toISOString(),
  };
}

function mapDvToDecision(dv: Iw_aidecisionlogs): AIDecisionLogEntry {
  return {
    id: dv.iw_aidecisionlogid,
    name: dv.iw_name,
    agentName: DV_TO_AGENT_NAME[dv.iw_agentname as unknown as number] || 'analysis',
    decisionType: DV_TO_DECISION_TYPE[dv.iw_decisiontype as unknown as number] || 'priority_ranking',
    inputSummary: dv.iw_inputsummary || '',
    outputSummary: dv.iw_outputsummary || '',
    confidenceScore: dv.iw_confidencescore ? Number(dv.iw_confidencescore) : 0,
    reasoningJson: dv.iw_reasoningjson || '[]',
    tokensUsed: dv.iw_tokensused ? Number(dv.iw_tokensused) : undefined,
    processingTimeMs: dv.iw_processingtimems ? Number(dv.iw_processingtimems) : undefined,
    modelName: dv.iw_modelname || 'gpt-4.1-mini',
    humanOverride: dv.iw_humanoverride === (1 as unknown as typeof dv.iw_humanoverride),
    overrideReason: dv.iw_overridereason,
    relatedWorkOrderIds: dv.iw_relatedworkorderids ? JSON.parse(dv.iw_relatedworkorderids) : [],
    createdAt: dv.createdon || new Date().toISOString(),
  };
}

function mapDvToSchedule(dv: Iw_crewschedules): CrewSchedule {
  return {
    id: dv.iw_crewscheduleid,
    name: dv.iw_name,
    crewId: dv.iw_crewid,
    crewName: dv.iw_crewname || '',
    weekStart: dv.iw_weekstart,
    weekEnd: dv.iw_weekend,
    plannedDispatches: dv.iw_planneddispatches ? Number(dv.iw_planneddispatches) : 0,
    completedDispatches: dv.iw_completeddispatches ? Number(dv.iw_completeddispatches) : 0,
    plannedHours: dv.iw_plannedhours ? Number(dv.iw_plannedhours) : 0,
    actualHours: dv.iw_actualhours ? Number(dv.iw_actualhours) : 0,
    availability: dv.iw_availability ? Number(dv.iw_availability) : 1,
    specialization: DV_TO_SPECIALIZATION[dv.iw_specialization as unknown as number] || 'general',
    zoneAssignment: dv.iw_zoneassignment || '',
    aiOptimized: dv.iw_aioptimized === (1 as unknown as typeof dv.iw_aioptimized),
    notes: dv.iw_notes,
  };
}

function mapDvToWOUpdate(dv: Iw_workorderupdates): WorkOrderUpdateRecord {
  return {
    id: dv.iw_workorderupdateid,
    name: dv.iw_name,
    workOrderId: dv.iw_workorderid,
    previousStatus: DV_TO_WO_STATUS[dv.iw_previousstatus as unknown as number] || 'open',
    newStatus: DV_TO_WO_STATUS[dv.iw_newstatus as unknown as number] || 'open',
    updatedBy: dv.iw_updatedby || '',
    updatedSource: DV_TO_UPDATE_SOURCE[dv.iw_updatedsource as unknown as number] || 'system',
    notes: dv.iw_notes,
    createdAt: dv.createdon || new Date().toISOString(),
  };
}

// ---- Crew Member Mappers ----

function mapDvToCrewMember(dv: Iw_crewmembers): CrewMember {
  let parsedWorkOrders: string[] = [];
  if (dv.iw_assignedworkorders) {
    try { parsedWorkOrders = JSON.parse(dv.iw_assignedworkorders); } catch { /* ignore */ }
  }
  let parsedCerts: string[] | undefined;
  if (dv.iw_certifications) {
    try { parsedCerts = JSON.parse(dv.iw_certifications); } catch { /* ignore */ }
  }
  return {
    id: dv.iw_crewmemberid,
    name: dv.iw_name,
    specialization: DV_TO_SPECIALIZATION[dv.iw_specialization as unknown as number] || 'general',
    status: DV_TO_CREW_STATUS[dv.iw_status as unknown as number] || 'available',
    efficiencyRating: parseFloat(dv.iw_efficiencyrating || '0.8'),
    currentLat: parseFloat(dv.iw_currentlat || '0'),
    currentLng: parseFloat(dv.iw_currentlng || '0'),
    memberCount: parseInt(dv.iw_membercount || '3', 10),
    assignedWorkOrders: parsedWorkOrders,
    email: dv.iw_email || undefined,
    phone: dv.iw_phone || undefined,
    certifications: parsedCerts,
    zone: dv.iw_zone || undefined,
    hireDate: dv.iw_hiredate || undefined,
    isActive: dv.iw_isactive !== (0 as any),
    createdAt: dv.createdon || undefined,
    updatedAt: dv.modifiedon || undefined,
  };
}

function mapCrewMemberToDv(input: Record<string, unknown>): Partial<Omit<Iw_crewmembers, 'iw_crewmemberid'>> {
  const dv: Record<string, unknown> = {};
  if (input.name != null) dv.iw_name = input.name;
  if (input.crewId != null) dv.iw_crewid = input.crewId;
  if (input.specialization != null) dv.iw_specialization = SPECIALIZATION_MAP[input.specialization as CrewSpecialization];
  if (input.status != null) dv.iw_status = CREW_STATUS_MAP[input.status as CrewStatus];
  if (input.efficiencyRating != null) dv.iw_efficiencyrating = String(input.efficiencyRating);
  if (input.currentLat != null) dv.iw_currentlat = String(input.currentLat);
  if (input.currentLng != null) dv.iw_currentlng = String(input.currentLng);
  if (input.memberCount != null) dv.iw_membercount = String(input.memberCount);
  if (input.email != null) dv.iw_email = input.email;
  if (input.phone != null) dv.iw_phone = input.phone;
  if (input.certifications != null) dv.iw_certifications = JSON.stringify(input.certifications);
  if (input.assignedWorkOrders != null) dv.iw_assignedworkorders = JSON.stringify(input.assignedWorkOrders);
  if (input.zone != null) dv.iw_zone = input.zone;
  if (input.hireDate != null) dv.iw_hiredate = input.hireDate;
  if (input.isActive != null) dv.iw_isactive = input.isActive ? 1 : 0;
  return dv as Partial<Omit<Iw_crewmembers, 'iw_crewmemberid'>>;
}

/** localStorage keys for demo fallback */
const STORAGE_KEYS = {
  dispatches: 'iw_crewdispatches',
  inspections: 'iw_fieldinspections',
  aiDecisions: 'iw_aidecisionlogs',
  schedules: 'iw_crewschedules',
  woUpdates: 'iw_workorderupdates',
  crewMembers: 'iw_crewmembers',
} as const;

// ============================================
// ID Generation
// ============================================

let dispatchSeq = 0;
let inspectionSeq = 0;
let decisionSeq = 0;
let scheduleSeq = 0;
let updateSeq = 0;

function nextId(prefix: string, seq: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

function guid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ============================================
// Local Storage Helpers (Demo Fallback)
// ============================================

function loadLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocal<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

// ============================================
// CREW DISPATCH — CRUD
// ============================================

async function createDispatch(
  input: Omit<CrewDispatch, 'id' | 'name' | 'createdAt' | 'updatedAt'>
): Promise<CrewDispatch> {
  // Generate local ID/name for both paths
  dispatchSeq++;
  const now = new Date().toISOString();
  const localName = nextId('DISP', dispatchSeq);

  // Try Dataverse SDK first
  if (USE_DATAVERSE) {
    try {
      const dvRecord = mapDispatchToDv({ ...input, name: localName } as Record<string, unknown>);
      dvRecord.iw_name = localName;
      const result = await Iw_crewdispatchsService.create(dvRecord as Omit<Iw_crewdispatchs, 'iw_crewdispatchid'>);
      if (result.data) {
        console.log('[DataverseService] Dispatch created in Dataverse:', result.data.iw_crewdispatchid);
        return mapDvToDispatch(result.data);
      }
    } catch (err) {
      console.warn('[DataverseService] SDK create dispatch failed, falling back to localStorage:', err);
    }
  }

  // Fall back to localStorage
  const record: CrewDispatch = {
    id: guid(),
    name: localName,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  const all = loadLocal<CrewDispatch>(STORAGE_KEYS.dispatches);
  all.push(record);
  saveLocal(STORAGE_KEYS.dispatches, all);
  return record;
}

async function getDispatches(filter?: {
  status?: DispatchStatus;
  crewId?: string;
  priority?: Severity;
}): Promise<CrewDispatch[]> {
  // Try Dataverse SDK
  if (USE_DATAVERSE) {
    try {
      const parts: string[] = [];
      if (filter?.status) parts.push(`iw_status eq ${DISPATCH_STATUS_TO_DV[filter.status]}`);
      if (filter?.crewId) parts.push(`iw_crewid eq '${filter.crewId}'`);
      if (filter?.priority) parts.push(`iw_priority eq ${PRIORITY_TO_DV[filter.priority]}`);
      const result = await Iw_crewdispatchsService.getAll({
        filter: parts.length ? parts.join(' and ') : undefined,
        orderBy: ['createdon desc'],
      });
      if (result.data) return result.data.map(mapDvToDispatch);
    } catch (err) {
      console.warn('[DataverseService] SDK getDispatches failed, falling back:', err);
    }
  }

  // localStorage fallback
  let all = loadLocal<CrewDispatch>(STORAGE_KEYS.dispatches);
  if (filter?.status) all = all.filter(d => d.status === filter.status);
  if (filter?.crewId) all = all.filter(d => d.crewId === filter.crewId);
  if (filter?.priority) all = all.filter(d => d.priority === filter.priority);
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function getDispatch(id: string): Promise<CrewDispatch | null> {
  if (USE_DATAVERSE) {
    try {
      const result = await Iw_crewdispatchsService.get(id);
      return result.data ? mapDvToDispatch(result.data) : null;
    } catch (err) {
      console.warn('[DataverseService] SDK getDispatch failed, falling back:', err);
    }
  }
  const all = loadLocal<CrewDispatch>(STORAGE_KEYS.dispatches);
  return all.find(d => d.id === id) || null;
}

async function updateDispatch(
  id: string,
  changes: Partial<CrewDispatch>
): Promise<CrewDispatch | null> {
  if (USE_DATAVERSE) {
    try {
      const dvChanges = mapDispatchToDv(changes as Record<string, unknown>);
      const result = await Iw_crewdispatchsService.update(id, dvChanges);
      if (result.data) return mapDvToDispatch(result.data);
    } catch (err) {
      console.warn('[DataverseService] SDK updateDispatch failed, falling back:', err);
    }
  }

  const all = loadLocal<CrewDispatch>(STORAGE_KEYS.dispatches);
  const idx = all.findIndex(d => d.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
  saveLocal(STORAGE_KEYS.dispatches, all);
  return all[idx];
}

async function deleteDispatch(id: string): Promise<boolean> {
  if (USE_DATAVERSE) {
    try {
      await Iw_crewdispatchsService.delete(id);
      return true;
    } catch (err) {
      console.warn('[DataverseService] SDK deleteDispatch failed, falling back:', err);
    }
  }

  const all = loadLocal<CrewDispatch>(STORAGE_KEYS.dispatches);
  const filtered = all.filter(d => d.id !== id);
  if (filtered.length === all.length) return false;
  saveLocal(STORAGE_KEYS.dispatches, filtered);
  return true;
}

// ============================================
// Dispatch Workflow Helpers
// ============================================

async function approveDispatch(id: string, approver: string): Promise<CrewDispatch | null> {
  return updateDispatch(id, {
    status: 'approved',
    approvedBy: approver,
    approvedOn: new Date().toISOString(),
  });
}

async function rejectDispatch(id: string, reason: string): Promise<CrewDispatch | null> {
  return updateDispatch(id, {
    status: 'rejected',
    notes: reason,
  });
}

async function markDispatched(id: string): Promise<CrewDispatch | null> {
  return updateDispatch(id, {
    status: 'dispatched',
    dispatchedAt: new Date().toISOString(),
  });
}

async function markInProgress(id: string): Promise<CrewDispatch | null> {
  return updateDispatch(id, {
    status: 'in_progress',
  });
}

async function completeDispatch(
  id: string,
  actualDuration: number,
  actualCost: number
): Promise<CrewDispatch | null> {
  return updateDispatch(id, {
    status: 'completed',
    actualDuration,
    actualCost,
    completedAt: new Date().toISOString(),
  });
}

// ============================================
// FIELD INSPECTION — CRUD
// ============================================

async function createInspection(
  input: Omit<FieldInspection, 'id' | 'name' | 'createdAt'>
): Promise<FieldInspection> {
  inspectionSeq++;
  const localName = nextId('INSP', inspectionSeq);

  if (USE_DATAVERSE) {
    try {
      const dvRecord: Partial<Omit<Iw_fieldinspections, 'iw_fieldinspectionid'>> = {
        iw_name: localName,
        iw_dispatchid: input.dispatchId,
        iw_workorderid: input.workOrderId,
        iw_inspectorname: input.inspectorName,
        iw_inspectiontype: INSPECTION_TYPE_MAP[input.inspectionType] as unknown as Iw_fieldinspections['iw_inspectiontype'],
        iw_conditionrating: (input.conditionRating || 3) as unknown as Iw_fieldinspections['iw_conditionrating'],
        iw_repaircompleted: (input.repairCompleted ? 1 : 0) as unknown as Iw_fieldinspections['iw_repaircompleted'],
        iw_timespent: input.timeSpent != null ? String(input.timeSpent) : undefined,
        iw_materialsused: input.materialsUsed ? JSON.stringify(input.materialsUsed) : undefined,
        iw_safetyhazardsfound: (input.safetyHazardsFound ? 1 : 0) as unknown as Iw_fieldinspections['iw_safetyhazardsfound'],
        iw_hazarddescription: input.hazardDescription,
        iw_notes: input.notes,
        iw_photourls: input.photoUrls ? JSON.stringify(input.photoUrls) : undefined,
        iw_weathercondition: input.weatherCondition,
        iw_temperature: input.temperature != null ? String(input.temperature) : undefined,
        iw_latitude: input.latitude != null ? String(input.latitude) : undefined,
        iw_longitude: input.longitude != null ? String(input.longitude) : undefined,
      };
      const result = await Iw_fieldinspectionsService.create(dvRecord as Omit<Iw_fieldinspections, 'iw_fieldinspectionid'>);
      if (result.data) {
        console.log('[DataverseService] Inspection created in Dataverse:', result.data.iw_fieldinspectionid);
        return mapDvToInspection(result.data);
      }
    } catch (err) {
      console.warn('[DataverseService] SDK create inspection failed, falling back:', err);
    }
  }

  const record: FieldInspection = {
    id: guid(),
    name: localName,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const all = loadLocal<FieldInspection>(STORAGE_KEYS.inspections);
  all.push(record);
  saveLocal(STORAGE_KEYS.inspections, all);
  return record;
}

async function getInspections(filter?: {
  dispatchId?: string;
  workOrderId?: string;
  inspectionType?: InspectionType;
}): Promise<FieldInspection[]> {
  if (USE_DATAVERSE) {
    try {
      const parts: string[] = [];
      if (filter?.dispatchId) parts.push(`iw_dispatchid eq '${filter.dispatchId}'`);
      if (filter?.workOrderId) parts.push(`iw_workorderid eq '${filter.workOrderId}'`);
      if (filter?.inspectionType) parts.push(`iw_inspectiontype eq ${INSPECTION_TYPE_MAP[filter.inspectionType]}`);
      const result = await Iw_fieldinspectionsService.getAll({
        filter: parts.length ? parts.join(' and ') : undefined,
        orderBy: ['createdon desc'],
      });
      if (result.data) return result.data.map(mapDvToInspection);
    } catch (err) {
      console.warn('[DataverseService] SDK getInspections failed, falling back:', err);
    }
  }

  let all = loadLocal<FieldInspection>(STORAGE_KEYS.inspections);
  if (filter?.dispatchId) all = all.filter(i => i.dispatchId === filter.dispatchId);
  if (filter?.workOrderId) all = all.filter(i => i.workOrderId === filter.workOrderId);
  if (filter?.inspectionType) all = all.filter(i => i.inspectionType === filter.inspectionType);
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function getInspection(id: string): Promise<FieldInspection | null> {
  if (USE_DATAVERSE) {
    try {
      const result = await Iw_fieldinspectionsService.get(id);
      return result.data ? mapDvToInspection(result.data) : null;
    } catch (err) {
      console.warn('[DataverseService] SDK getInspection failed, falling back:', err);
    }
  }
  const all = loadLocal<FieldInspection>(STORAGE_KEYS.inspections);
  return all.find(i => i.id === id) || null;
}

async function updateInspection(
  id: string,
  changes: Partial<FieldInspection>
): Promise<FieldInspection | null> {
  if (USE_DATAVERSE) {
    try {
      const dvChanges: Record<string, unknown> = {};
      if (changes.inspectionType) dvChanges.iw_inspectiontype = INSPECTION_TYPE_MAP[changes.inspectionType];
      if (changes.conditionRating != null) dvChanges.iw_conditionrating = changes.conditionRating;
      if (changes.repairCompleted != null) dvChanges.iw_repaircompleted = changes.repairCompleted ? 1 : 0;
      if (changes.notes) dvChanges.iw_notes = changes.notes;
      if (changes.timeSpent != null) dvChanges.iw_timespent = String(changes.timeSpent);
      if (changes.materialsUsed) dvChanges.iw_materialsused = JSON.stringify(changes.materialsUsed);
      const result = await Iw_fieldinspectionsService.update(id, dvChanges as Partial<Omit<Iw_fieldinspections, 'iw_fieldinspectionid'>>);
      if (result.data) return mapDvToInspection(result.data);
    } catch (err) {
      console.warn('[DataverseService] SDK updateInspection failed, falling back:', err);
    }
  }

  const all = loadLocal<FieldInspection>(STORAGE_KEYS.inspections);
  const idx = all.findIndex(i => i.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...changes };
  saveLocal(STORAGE_KEYS.inspections, all);
  return all[idx];
}

// ============================================
// AI DECISION LOG — CRUD
// ============================================

async function logAIDecision(
  input: Omit<AIDecisionLogEntry, 'id' | 'name' | 'createdAt'>
): Promise<AIDecisionLogEntry> {
  decisionSeq++;
  const localName = nextId('AID', decisionSeq);

  if (USE_DATAVERSE) {
    try {
      const dvRecord: Partial<Omit<Iw_aidecisionlogs, 'iw_aidecisionlogid'>> = {
        iw_name: localName,
        iw_agentname: AGENT_NAME_MAP[input.agentName] as unknown as Iw_aidecisionlogs['iw_agentname'],
        iw_decisiontype: DECISION_TYPE_MAP[input.decisionType] as unknown as Iw_aidecisionlogs['iw_decisiontype'],
        iw_inputsummary: input.inputSummary,
        iw_outputsummary: input.outputSummary,
        iw_confidencescore: String(input.confidenceScore),
        iw_reasoningjson: input.reasoningJson,
        iw_tokensused: input.tokensUsed != null ? String(input.tokensUsed) : undefined,
        iw_processingtimems: input.processingTimeMs != null ? String(input.processingTimeMs) : undefined,
        iw_modelname: input.modelName,
        iw_humanoverride: (input.humanOverride ? 1 : 0) as unknown as Iw_aidecisionlogs['iw_humanoverride'],
        iw_overridereason: input.overrideReason,
        iw_relatedworkorderids: JSON.stringify(input.relatedWorkOrderIds),
      };
      const result = await Iw_aidecisionlogsService.create(dvRecord as Omit<Iw_aidecisionlogs, 'iw_aidecisionlogid'>);
      if (result.data) {
        console.log('[DataverseService] AI Decision logged in Dataverse:', result.data.iw_aidecisionlogid);
        return mapDvToDecision(result.data);
      }
    } catch (err) {
      console.warn('[DataverseService] SDK logAIDecision failed, falling back:', err);
    }
  }

  const record: AIDecisionLogEntry = {
    id: guid(),
    name: localName,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const all = loadLocal<AIDecisionLogEntry>(STORAGE_KEYS.aiDecisions);
  all.push(record);
  saveLocal(STORAGE_KEYS.aiDecisions, all);
  return record;
}

async function getAIDecisions(filter?: {
  agentName?: AIAgentName;
  decisionType?: AIDecisionType;
  workOrderId?: string;
  limit?: number;
}): Promise<AIDecisionLogEntry[]> {
  if (USE_DATAVERSE) {
    try {
      const parts: string[] = [];
      if (filter?.agentName) parts.push(`iw_agentname eq ${AGENT_NAME_MAP[filter.agentName]}`);
      if (filter?.decisionType) parts.push(`iw_decisiontype eq ${DECISION_TYPE_MAP[filter.decisionType]}`);
      if (filter?.workOrderId) parts.push(`contains(iw_relatedworkorderids,'${filter.workOrderId}')`);
      const result = await Iw_aidecisionlogsService.getAll({
        filter: parts.length ? parts.join(' and ') : undefined,
        orderBy: ['createdon desc'],
        top: filter?.limit || 100,
      });
      if (result.data) return result.data.map(mapDvToDecision);
    } catch (err) {
      console.warn('[DataverseService] SDK getAIDecisions failed, falling back:', err);
    }
  }

  let all = loadLocal<AIDecisionLogEntry>(STORAGE_KEYS.aiDecisions);
  if (filter?.agentName) all = all.filter(d => d.agentName === filter.agentName);
  if (filter?.decisionType) all = all.filter(d => d.decisionType === filter.decisionType);
  if (filter?.workOrderId) all = all.filter(d => d.relatedWorkOrderIds.includes(filter.workOrderId!));
  all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (filter?.limit) all = all.slice(0, filter.limit);
  return all;
}

async function markAIDecisionOverridden(
  id: string,
  reason: string
): Promise<AIDecisionLogEntry | null> {
  if (USE_DATAVERSE) {
    try {
      const result = await Iw_aidecisionlogsService.update(id, {
        iw_humanoverride: 1 as unknown as Iw_aidecisionlogs['iw_humanoverride'],
        iw_overridereason: reason,
      });
      if (result.data) return mapDvToDecision(result.data);
    } catch (err) {
      console.warn('[DataverseService] SDK markAIDecisionOverridden failed, falling back:', err);
    }
  }

  const all = loadLocal<AIDecisionLogEntry>(STORAGE_KEYS.aiDecisions);
  const idx = all.findIndex(d => d.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], humanOverride: true, overrideReason: reason };
  saveLocal(STORAGE_KEYS.aiDecisions, all);
  return all[idx];
}

// ============================================
// CREW SCHEDULE — CRUD
// ============================================

async function createSchedule(
  input: Omit<CrewSchedule, 'id'>
): Promise<CrewSchedule> {
  scheduleSeq++;

  if (USE_DATAVERSE) {
    try {
      const dvRecord: Partial<Omit<Iw_crewschedules, 'iw_crewscheduleid'>> = {
        iw_name: `${input.crewId}-${input.weekStart}`,
        iw_crewid: input.crewId,
        iw_crewname: input.crewName,
        iw_weekstart: input.weekStart,
        iw_weekend: input.weekEnd,
        iw_planneddispatches: String(input.plannedDispatches || 0),
        iw_completeddispatches: String(input.completedDispatches || 0),
        iw_plannedhours: String(input.plannedHours || 0),
        iw_actualhours: String(input.actualHours || 0),
        iw_availability: String(input.availability ?? 1),
        iw_specialization: input.specialization ? SPECIALIZATION_MAP[input.specialization] as unknown as Iw_crewschedules['iw_specialization'] : undefined,
        iw_zoneassignment: input.zoneAssignment,
        iw_aioptimized: (input.aiOptimized ? 1 : 0) as unknown as Iw_crewschedules['iw_aioptimized'],
        iw_notes: input.notes,
      };
      const result = await Iw_crewschedulesService.create(dvRecord as Omit<Iw_crewschedules, 'iw_crewscheduleid'>);
      if (result.data) {
        console.log('[DataverseService] Schedule created in Dataverse:', result.data.iw_crewscheduleid);
        return mapDvToSchedule(result.data);
      }
    } catch (err) {
      console.warn('[DataverseService] SDK createSchedule failed, falling back:', err);
    }
  }

  const record: CrewSchedule = { id: guid(), ...input };
  const all = loadLocal<CrewSchedule>(STORAGE_KEYS.schedules);
  all.push(record);
  saveLocal(STORAGE_KEYS.schedules, all);
  return record;
}

async function getSchedules(filter?: {
  crewId?: string;
  weekStart?: string;
}): Promise<CrewSchedule[]> {
  if (USE_DATAVERSE) {
    try {
      const parts: string[] = [];
      if (filter?.crewId) parts.push(`iw_crewid eq '${filter.crewId}'`);
      if (filter?.weekStart) parts.push(`iw_weekstart eq '${filter.weekStart}'`);
      const result = await Iw_crewschedulesService.getAll({
        filter: parts.length ? parts.join(' and ') : undefined,
      });
      if (result.data) return result.data.map(mapDvToSchedule);
    } catch (err) {
      console.warn('[DataverseService] SDK getSchedules failed, falling back:', err);
    }
  }

  let all = loadLocal<CrewSchedule>(STORAGE_KEYS.schedules);
  if (filter?.crewId) all = all.filter(s => s.crewId === filter.crewId);
  if (filter?.weekStart) all = all.filter(s => s.weekStart === filter.weekStart);
  return all;
}

async function updateSchedule(
  id: string,
  changes: Partial<CrewSchedule>
): Promise<CrewSchedule | null> {
  if (USE_DATAVERSE) {
    try {
      const dvChanges: Record<string, unknown> = {};
      if (changes.plannedDispatches != null) dvChanges.iw_planneddispatches = String(changes.plannedDispatches);
      if (changes.completedDispatches != null) dvChanges.iw_completeddispatches = String(changes.completedDispatches);
      if (changes.plannedHours != null) dvChanges.iw_plannedhours = String(changes.plannedHours);
      if (changes.actualHours != null) dvChanges.iw_actualhours = String(changes.actualHours);
      if (changes.availability != null) dvChanges.iw_availability = String(changes.availability);
      if (changes.specialization) dvChanges.iw_specialization = SPECIALIZATION_MAP[changes.specialization];
      if (changes.zoneAssignment) dvChanges.iw_zoneassignment = changes.zoneAssignment;
      if (changes.aiOptimized != null) dvChanges.iw_aioptimized = changes.aiOptimized ? 1 : 0;
      if (changes.notes != null) dvChanges.iw_notes = changes.notes;
      const result = await Iw_crewschedulesService.update(id, dvChanges as Partial<Omit<Iw_crewschedules, 'iw_crewscheduleid'>>);
      if (result.data) return mapDvToSchedule(result.data);
    } catch (err) {
      console.warn('[DataverseService] SDK updateSchedule failed, falling back:', err);
    }
  }

  const all = loadLocal<CrewSchedule>(STORAGE_KEYS.schedules);
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...changes };
  saveLocal(STORAGE_KEYS.schedules, all);
  return all[idx];
}

// ============================================
// WORK ORDER STATUS UPDATES — CRUD
// ============================================

async function logWorkOrderUpdate(
  input: Omit<WorkOrderUpdateRecord, 'id' | 'name' | 'createdAt'>
): Promise<WorkOrderUpdateRecord> {
  updateSeq++;
  const localName = nextId('UPD', updateSeq);

  if (USE_DATAVERSE) {
    try {
      const dvRecord: Partial<Omit<Iw_workorderupdates, 'iw_workorderupdateid'>> = {
        iw_name: localName,
        iw_workorderid: input.workOrderId,
        iw_previousstatus: WO_STATUS_MAP[input.previousStatus] as unknown as Iw_workorderupdates['iw_previousstatus'],
        iw_newstatus: WO_STATUS_MAP[input.newStatus] as unknown as Iw_workorderupdates['iw_newstatus'],
        iw_updatedby: input.updatedBy,
        iw_updatedsource: input.updatedSource ? UPDATE_SOURCE_MAP[input.updatedSource] as unknown as Iw_workorderupdates['iw_updatedsource'] : undefined,
        iw_notes: input.notes,
      };
      const result = await Iw_workorderupdatesService.create(dvRecord as Omit<Iw_workorderupdates, 'iw_workorderupdateid'>);
      if (result.data) {
        console.log('[DataverseService] WO Update logged in Dataverse:', result.data.iw_workorderupdateid);
        return mapDvToWOUpdate(result.data);
      }
    } catch (err) {
      console.warn('[DataverseService] SDK logWorkOrderUpdate failed, falling back:', err);
    }
  }

  const record: WorkOrderUpdateRecord = {
    id: guid(),
    name: localName,
    createdAt: new Date().toISOString(),
    ...input,
  };
  const all = loadLocal<WorkOrderUpdateRecord>(STORAGE_KEYS.woUpdates);
  all.push(record);
  saveLocal(STORAGE_KEYS.woUpdates, all);
  return record;
}

async function getWorkOrderUpdates(workOrderId: string): Promise<WorkOrderUpdateRecord[]> {
  if (USE_DATAVERSE) {
    try {
      const result = await Iw_workorderupdatesService.getAll({
        filter: `iw_workorderid eq '${workOrderId}'`,
        orderBy: ['createdon desc'],
      });
      if (result.data) return result.data.map(mapDvToWOUpdate);
    } catch (err) {
      console.warn('[DataverseService] SDK getWorkOrderUpdates failed, falling back:', err);
    }
  }

  return loadLocal<WorkOrderUpdateRecord>(STORAGE_KEYS.woUpdates)
    .filter(u => u.workOrderId === workOrderId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ============================================
// Statistics / Aggregates
// ============================================

async function getDispatchStats(): Promise<{
  total: number;
  byStatus: Record<DispatchStatus, number>;
  avgConfidence: number;
  avgDurationAccuracy: number;
  completionRate: number;
}> {
  const all = await getDispatches();
  const byStatus = {} as Record<DispatchStatus, number>;
  const statuses: DispatchStatus[] = [
    'draft', 'pending_approval', 'approved', 'dispatched',
    'in_progress', 'completed', 'cancelled', 'rejected',
  ];
  statuses.forEach(s => (byStatus[s] = 0));
  all.forEach(d => (byStatus[d.status] = (byStatus[d.status] || 0) + 1));

  const withConfidence = all.filter(d => d.aiConfidence > 0);
  const avgConfidence = withConfidence.length
    ? withConfidence.reduce((sum, d) => sum + d.aiConfidence, 0) / withConfidence.length
    : 0;

  const completed = all.filter(d => d.status === 'completed' && d.actualDuration && d.estimatedDuration);
  const avgDurationAccuracy = completed.length
    ? completed.reduce((sum, d) => {
        const est = d.estimatedDuration;
        const act = d.actualDuration!;
        return sum + (1 - Math.abs(est - act) / Math.max(est, act));
      }, 0) / completed.length
    : 0;

  const actionable = all.filter(d => !['draft', 'cancelled', 'rejected'].includes(d.status));
  const completionRate = actionable.length
    ? all.filter(d => d.status === 'completed').length / actionable.length
    : 0;

  return {
    total: all.length,
    byStatus,
    avgConfidence,
    avgDurationAccuracy,
    completionRate,
  };
}

async function getAIDecisionStats(): Promise<{
  total: number;
  byAgent: Record<string, number>;
  overrideRate: number;
  avgConfidence: number;
  avgProcessingTime: number;
}> {
  const all = await getAIDecisions();
  const byAgent: Record<string, number> = {};
  all.forEach(d => (byAgent[d.agentName] = (byAgent[d.agentName] || 0) + 1));

  const overrides = all.filter(d => d.humanOverride);
  const withConfidence = all.filter(d => d.confidenceScore > 0);
  const withTime = all.filter(d => d.processingTimeMs && d.processingTimeMs > 0);

  return {
    total: all.length,
    byAgent,
    overrideRate: all.length ? overrides.length / all.length : 0,
    avgConfidence: withConfidence.length
      ? withConfidence.reduce((s, d) => s + d.confidenceScore, 0) / withConfidence.length
      : 0,
    avgProcessingTime: withTime.length
      ? withTime.reduce((s, d) => s + (d.processingTimeMs || 0), 0) / withTime.length
      : 0,
  };
}

// ============================================
// Lake Forest DPW Crew Roster
// ============================================

/**
 * Realistic Lake Forest Department of Public Works crew roster.
 * These crews map to the zones used by MCP work orders and are
 * positioned in their home zones within the city boundaries.
 *
 * The roster is seeded once and then persisted to Dataverse / localStorage.
 * When new work orders arrive from MCP, dispatch matchmaking uses
 * these crew records rather than synthetic placeholders.
 */
const LAKE_FOREST_CREW_ROSTER: Array<Omit<CrewMember, 'id' | 'createdAt' | 'updatedAt'>> = [
  // ── Pothole Specialist Crews ──
  {
    name: 'Alpha Pothole Crew',
    specialization: 'pothole',
    status: 'available',
    efficiencyRating: 0.94,
    currentLat: 42.2580,
    currentLng: -87.8405,
    memberCount: 3,
    assignedWorkOrders: [],
    email: 'alpha.crew@lakeforestil.gov',
    phone: '847-555-0101',
    certifications: ['CDL-B', 'OSHA-30', 'Hot Mix Asphalt'],
    zone: 'NW-3',
    hireDate: '2022-03-15',
    isActive: true,
  },
  {
    name: 'Bravo Pothole Crew',
    specialization: 'pothole',
    status: 'assigned',
    efficiencyRating: 0.91,
    currentLat: 42.2345,
    currentLng: -87.8450,
    memberCount: 3,
    assignedWorkOrders: [],
    email: 'bravo.crew@lakeforestil.gov',
    phone: '847-555-0102',
    certifications: ['CDL-B', 'OSHA-10', 'Cold Patch'],
    zone: 'SW-1',
    hireDate: '2023-06-01',
    isActive: true,
  },
  {
    name: 'Echo Pothole Crew',
    specialization: 'pothole',
    status: 'available',
    efficiencyRating: 0.88,
    currentLat: 42.2650,
    currentLng: -87.8380,
    memberCount: 3,
    assignedWorkOrders: [],
    email: 'echo.crew@lakeforestil.gov',
    phone: '847-555-0105',
    certifications: ['CDL-B', 'OSHA-10'],
    zone: 'NE-1',
    hireDate: '2024-01-10',
    isActive: true,
  },
  // ── Sidewalk Specialist Crews ──
  {
    name: 'Sierra Sidewalk Crew',
    specialization: 'sidewalk',
    status: 'available',
    efficiencyRating: 0.92,
    currentLat: 42.2456,
    currentLng: -87.8312,
    memberCount: 4,
    assignedWorkOrders: [],
    email: 'sierra.crew@lakeforestil.gov',
    phone: '847-555-0103',
    certifications: ['ADA Compliance', 'OSHA-30', 'Flatwork Finishing'],
    zone: 'NE-1',
    hireDate: '2021-09-12',
    isActive: true,
  },
  {
    name: 'Tango Sidewalk Crew',
    specialization: 'sidewalk',
    status: 'available',
    efficiencyRating: 0.87,
    currentLat: 42.2200,
    currentLng: -87.8600,
    memberCount: 4,
    assignedWorkOrders: [],
    email: 'tango.crew@lakeforestil.gov',
    phone: '847-555-0106',
    certifications: ['ADA Compliance', 'OSHA-10', 'Mudjacking'],
    zone: 'SW-1',
    hireDate: '2023-11-20',
    isActive: true,
  },
  // ── Concrete Specialist Crews ──
  {
    name: 'Apex Concrete Crew',
    specialization: 'concrete',
    status: 'assigned',
    efficiencyRating: 0.90,
    currentLat: 42.2289,
    currentLng: -87.8267,
    memberCount: 5,
    assignedWorkOrders: [],
    email: 'apex.crew@lakeforestil.gov',
    phone: '847-555-0104',
    certifications: ['ACI Certified', 'OSHA-30', 'Rebar Tying', 'Form Construction'],
    zone: 'SE-2',
    hireDate: '2020-05-08',
    isActive: true,
  },
  {
    name: 'Core Concrete Crew',
    specialization: 'concrete',
    status: 'available',
    efficiencyRating: 0.86,
    currentLat: 42.2500,
    currentLng: -87.8500,
    memberCount: 5,
    assignedWorkOrders: [],
    email: 'core.crew@lakeforestil.gov',
    phone: '847-555-0107',
    certifications: ['ACI Certified', 'OSHA-10', 'Curb & Gutter'],
    zone: 'NW-3',
    hireDate: '2024-04-01',
    isActive: true,
  },
  // ── General / Rapid Response ──
  {
    name: 'Delta Rapid Response',
    specialization: 'general',
    status: 'available',
    efficiencyRating: 0.89,
    currentLat: 42.2430,
    currentLng: -87.8420,
    memberCount: 4,
    assignedWorkOrders: [],
    email: 'delta.crew@lakeforestil.gov',
    phone: '847-555-0108',
    certifications: ['CDL-B', 'OSHA-30', 'First Aid/CPR', 'Flagging'],
    zone: 'NW-3',
    hireDate: '2022-08-15',
    isActive: true,
  },
];

// ============================================
// Demo Data Seeding
// ============================================

async function seedDemoData(): Promise<void> {
  // ── 1. Seed crew members (only if empty) ──
  const existingCrews = await getCrewMembers({ activeOnly: false });
  if (existingCrews.length === 0) {
    console.log('[DataverseService] Seeding Lake Forest DPW crew roster…');
    for (const crew of LAKE_FOREST_CREW_ROSTER) {
      try {
        await createCrewMember(crew);
      } catch (e) {
        console.warn(`[DV] Failed to seed crew '${crew.name}':`, e);
      }
    }
  }

  // ── 2. Seed dispatches (only if empty) ──
  // Use real MCP work order ID patterns (pothole-N, sidewalk-N)
  const existing = await getDispatches();
  const existingDecisions = await getAIDecisions();

  if (existing.length === 0) {
  const demoDispatches: Array<Omit<CrewDispatch, 'id' | 'name' | 'createdAt' | 'updatedAt'>> = [
    {
      workOrderId: 'pothole-0',
      crewId: 'crew-pothole-0',
      crewName: 'Alpha Pothole Crew',
      status: 'dispatched',
      priority: 'critical',
      issueType: 'pothole',
      address: '700 N Western Ave, Lake Forest, IL',
      latitude: 42.2580,
      longitude: -87.8405,
      estimatedDuration: 2.5,
      estimatedCost: 1850,
      aiConfidence: 0.92,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Critical pothole near Deer Path Middle School — priority escalated', confidence: 0.95 },
        { step: 2, description: 'Alpha Pothole Crew in zone NW-3, 0.3mi away, 94% efficiency rating', confidence: 0.91 },
        { step: 3, description: 'Clear weather window — 4h before temperature drop', confidence: 0.88 },
        { step: 4, description: 'Weibull RUL: 14 days remaining life, 87% failure probability', confidence: 0.90 },
      ]),
      approvedBy: 'Mike Rodriguez',
      approvedOn: new Date(Date.now() - 2 * 3600000).toISOString(),
      dispatchedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      weatherAtDispatch: 'Clear, 42°F',
      nearSchool: true,
      zone: 'NW-3',
    },
    {
      workOrderId: 'sidewalk-0',
      crewId: 'crew-sidewalk-0',
      crewName: 'Sierra Sidewalk Crew',
      status: 'pending_approval',
      priority: 'high',
      issueType: 'sidewalk',
      address: '1200 N Green Bay Rd, Lake Forest, IL',
      latitude: 42.2456,
      longitude: -87.8312,
      estimatedDuration: 4.0,
      estimatedCost: 3400,
      aiConfidence: 0.87,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Heaving sidewalk panel — 1.5" trip hazard, ADA non-compliant', confidence: 0.90 },
        { step: 2, description: 'Sierra Sidewalk Crew home zone NE-1, ADA-certified, 1.2mi away', confidence: 0.85 },
        { step: 3, description: 'Temperature dropping below freezing tonight — repair before frost heave worsens', confidence: 0.86 },
        { step: 4, description: 'Weibull RUL: 42 days remaining, scale adjusted for freeze-thaw (λ×0.55)', confidence: 0.83 },
      ]),
      nearSchool: false,
      zone: 'NE-1',
    },
    {
      workOrderId: 'pothole-3',
      crewId: 'crew-concrete-0',
      crewName: 'Apex Concrete Crew',
      status: 'completed',
      priority: 'medium',
      issueType: 'concrete',
      address: '400 E Illinois Rd, Lake Forest, IL',
      latitude: 42.2289,
      longitude: -87.8267,
      estimatedDuration: 6.0,
      actualDuration: 5.5,
      estimatedCost: 5200,
      actualCost: 4800,
      aiConfidence: 0.84,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Concrete curb deterioration — Class C structural damage', confidence: 0.85 },
        { step: 2, description: 'Apex Concrete Crew assigned, ACI-certified, home zone SE-2', confidence: 0.82 },
        { step: 3, description: 'Weibull analysis: k=2.5, λ=365d — 38% failure probability at current age', confidence: 0.84 },
      ]),
      approvedBy: 'Sarah Chen',
      approvedOn: new Date(Date.now() - 48 * 3600000).toISOString(),
      dispatchedAt: new Date(Date.now() - 30 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      weatherAtDispatch: 'Cloudy, 38°F',
      nearSchool: false,
      zone: 'SE-2',
    },
    {
      workOrderId: 'pothole-1',
      crewId: 'crew-pothole-0',
      crewName: 'Alpha Pothole Crew',
      status: 'approved',
      priority: 'high',
      issueType: 'pothole',
      address: '850 Westleigh Rd, Lake Forest, IL',
      latitude: 42.2378,
      longitude: -87.8445,
      estimatedDuration: 1.5,
      estimatedCost: 1200,
      aiConfidence: 0.89,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Cluster of 3 potholes along high-traffic Westleigh Rd', confidence: 0.91 },
        { step: 2, description: 'Alpha Pothole Crew finishes pothole-0 in ~1h, can chain to this site', confidence: 0.87 },
        { step: 3, description: 'Near Lake Forest High School — school-zone priority boost applied', confidence: 0.90 },
      ]),
      approvedBy: 'Mike Rodriguez',
      approvedOn: new Date(Date.now() - 0.5 * 3600000).toISOString(),
      nearSchool: true,
      zone: 'NW-3',
    },
    {
      workOrderId: 'pothole-2',
      crewId: 'crew-pothole-1',
      crewName: 'Bravo Pothole Crew',
      status: 'dispatched',
      priority: 'high',
      issueType: 'pothole',
      address: '200 E Deerpath Rd, Lake Forest, IL',
      latitude: 42.2345,
      longitude: -87.8450,
      estimatedDuration: 2.0,
      estimatedCost: 980,
      aiConfidence: 0.86,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Large pothole on Deerpath Rd — high traffic collector road', confidence: 0.88 },
        { step: 2, description: 'Bravo Pothole Crew dispatched from SW-1 depot, 0.8mi travel', confidence: 0.84 },
        { step: 3, description: 'Cold-patch material suitable for current 35°F conditions', confidence: 0.86 },
      ]),
      approvedBy: 'Sarah Chen',
      approvedOn: new Date(Date.now() - 3 * 3600000).toISOString(),
      dispatchedAt: new Date(Date.now() - 2.5 * 3600000).toISOString(),
      weatherAtDispatch: 'Cloudy, 35°F',
      nearSchool: false,
      zone: 'SW-1',
    },
    {
      workOrderId: 'sidewalk-2',
      crewId: 'crew-sidewalk-1',
      crewName: 'Tango Sidewalk Crew',
      status: 'pending_approval',
      priority: 'medium',
      issueType: 'sidewalk',
      address: '550 Spruce Ave, Lake Forest, IL',
      latitude: 42.2200,
      longitude: -87.8600,
      estimatedDuration: 3.0,
      estimatedCost: 2100,
      aiConfidence: 0.81,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Sidewalk panel uplift — tree root intrusion, medium severity', confidence: 0.82 },
        { step: 2, description: 'Tango Sidewalk Crew home zone SW-1, mudjacking certified', confidence: 0.80 },
        { step: 3, description: 'Weibull RUL: 89 days — can schedule within normal maintenance window', confidence: 0.81 },
      ]),
      nearSchool: false,
      zone: 'SW-1',
    },
    {
      workOrderId: 'sidewalk-1',
      crewId: 'crew-general-0',
      crewName: 'Delta Rapid Response',
      status: 'in_progress',
      priority: 'critical',
      issueType: 'sidewalk',
      address: '95 W Deerpath, Lake Forest, IL',
      latitude: 42.2479,
      longitude: -87.8499,
      estimatedDuration: 1.5,
      estimatedCost: 900,
      aiConfidence: 0.93,
      aiReasoning: JSON.stringify([
        { step: 1, description: 'Emergency sidewalk collapse adjacent to Deer Path Middle School entrance', confidence: 0.96 },
        { step: 2, description: 'Delta Rapid Response deployed — closest available crew, first-aid certified', confidence: 0.92 },
        { step: 3, description: 'Temporary barrier installed, permanent repair underway', confidence: 0.91 },
      ]),
      approvedBy: 'Mike Rodriguez',
      approvedOn: new Date(Date.now() - 4 * 3600000).toISOString(),
      dispatchedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(),
      weatherAtDispatch: 'Clear, 40°F',
      nearSchool: true,
      zone: 'NW-3',
    },
  ];

  for (const d of demoDispatches) {
    await createDispatch(d);
  }

  // Seed a completed inspection for the completed dispatch
  const seededDispatches = await getDispatches();
  const completedDispatch = seededDispatches.find(d => d.status === 'completed');
  if (completedDispatch) {
    await createInspection({
      dispatchId: completedDispatch.id,
      workOrderId: completedDispatch.workOrderId,
      inspectorName: 'James Wilson',
      inspectionType: 'completion',
      conditionRating: 5,
      repairCompleted: true,
      timeSpent: 5.5,
      materialsUsed: [
        { name: 'Concrete mix', quantity: 12, unit: 'bags', cost: 180 },
        { name: 'Rebar (4ft)', quantity: 6, unit: 'pieces', cost: 45 },
        { name: 'Form boards', quantity: 4, unit: 'pieces', cost: 32 },
      ],
      safetyHazardsFound: false,
      notes: 'Curb replaced successfully. Surface smooth, joints sealed. No traffic disruption.',
      weatherCondition: 'Cloudy',
      temperature: 38,
      latitude: completedDispatch.latitude,
      longitude: completedDispatch.longitude,
    });
  }
  } // end dispatch seed guard

  // ── 3. Seed AI decision log entries (only if empty) ──
  if (existingDecisions.length === 0) {
  await logAIDecision({
    agentName: 'prioritization',
    decisionType: 'priority_ranking',
    inputSummary: JSON.stringify({ workOrderCount: 47, factors: ['severity', 'school_proximity', 'weather', 'age', 'weibull_rul'] }),
    outputSummary: JSON.stringify({ topPriority: 'pothole-0', score: 94.2, weibullRUL: '14 days' }),
    confidenceScore: 0.92,
    reasoningJson: JSON.stringify([
      { step: 1, description: 'Scored 47 open work orders using multi-factor algorithm + Weibull RUL' },
      { step: 2, description: 'pothole-0 ranked #1: critical severity + school zone + Weibull failure prob 87%' },
    ]),
    tokensUsed: 2450,
    processingTimeMs: 1840,
    modelName: 'gpt-4.1-mini',
    humanOverride: false,
    relatedWorkOrderIds: ['pothole-0', 'sidewalk-0', 'pothole-1'],
  });

  await logAIDecision({
    agentName: 'crew_estimation',
    decisionType: 'crew_assignment',
    inputSummary: JSON.stringify({ dispatches: 7, crews: 8, weather: 'clear', rosterSource: 'Lake Forest DPW' }),
    outputSummary: JSON.stringify({
      assignments: {
        'Alpha Pothole Crew': 'pothole-0',
        'Bravo Pothole Crew': 'pothole-2',
        'Sierra Sidewalk Crew': 'sidewalk-0',
        'Apex Concrete Crew': 'pothole-3',
        'Delta Rapid Response': 'sidewalk-1',
      },
    }),
    confidenceScore: 0.87,
    reasoningJson: JSON.stringify([
      { step: 1, description: 'Matched crew specialization + zone to issue type and location' },
      { step: 2, description: 'Optimized routes: Alpha → NW-3 (0.3mi), Sierra → NE-1 (1.2mi), Delta → school zone (0.1mi)' },
      { step: 3, description: 'Bravo and Echo crews held in reserve for incoming work orders' },
    ]),
    tokensUsed: 1800,
    processingTimeMs: 1250,
    modelName: 'gpt-4.1-mini',
    humanOverride: false,
    relatedWorkOrderIds: ['pothole-0', 'pothole-2', 'sidewalk-0', 'pothole-3', 'sidewalk-1'],
  });

  await logAIDecision({
    agentName: 'dispatch',
    decisionType: 'weather_impact',
    inputSummary: JSON.stringify({ forecast: 'freeze-thaw cycle expected in 48h', riskModel: 'Weibull λ×0.55' }),
    outputSummary: JSON.stringify({ alert: 'Accelerate NW-3 zone repairs before freeze — Weibull scale reduced 45%' }),
    confidenceScore: 0.78,
    reasoningJson: JSON.stringify([
      { step: 1, description: 'Weather API: temperature dropping to 28°F overnight' },
      { step: 2, description: 'Weibull model: freeze-thaw reduces characteristic life by 45% (λ×0.55)' },
      { step: 3, description: 'Pothole failure probability increases from 62% → 89% under freeze-thaw for NW-3 assets' },
      { step: 4, description: 'Recommend prioritizing all NW-3 zone potholes before tonight' },
    ]),
    tokensUsed: 1200,
    processingTimeMs: 980,
    modelName: 'gpt-4.1-mini',
    humanOverride: true,
    overrideReason: 'Manager deployed Delta Rapid Response to school zone sidewalk-1 instead of holding for NW-3',
    relatedWorkOrderIds: ['pothole-0', 'pothole-1', 'sidewalk-1'],
  });

  await logAIDecision({
    agentName: 'analysis',
    decisionType: 'weibull_survival_assessment',
    inputSummary: JSON.stringify({ analysisType: 'Weibull RUL', assetsAnalyzed: 47, weather: 'clear' }),
    outputSummary: JSON.stringify({
      criticalAssets: 8,
      highRisk: 12,
      avgRemainingLife: '67 days',
      shortestRUL: { id: 'pothole-0', rul: '14 days', failureProb: 0.87 },
    }),
    confidenceScore: 0.85,
    reasoningJson: JSON.stringify([
      { step: 1, description: 'Fitted Weibull parameters via MLE: pothole k=1.8 λ=120d, sidewalk k=2.2 λ=240d, concrete k=2.5 λ=365d' },
      { step: 2, description: '8 assets in critical risk category (failure probability > 85% or RUL < 14 days)' },
      { step: 3, description: 'Freeze-thaw weather adjustment reduces scale parameter by up to 45%' },
      { step: 4, description: 'Recommended maintenance window: schedule all high-risk assets within 30 days' },
    ]),
    tokensUsed: 0,
    processingTimeMs: 420,
    modelName: 'WeibullSurvivalAnalysis',
    humanOverride: false,
    relatedWorkOrderIds: ['pothole-0', 'pothole-1', 'pothole-2', 'sidewalk-0', 'sidewalk-1'],
  });
  } // end decisions seed guard

  console.log('[DataverseService] Demo data seeded (crews + dispatches + decisions)');
}

// ============================================
// Reset (for demo)
// ============================================

function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  dispatchSeq = 0;
  inspectionSeq = 0;
  decisionSeq = 0;
  scheduleSeq = 0;
  updateSeq = 0;
}

// ============================================
// CREW MEMBER — CRUD
// ============================================

let crewMemberSeq = 0;

async function createCrewMember(
  input: Omit<CrewMember, 'id' | 'createdAt' | 'updatedAt'>
): Promise<CrewMember> {
  crewMemberSeq++;
  const id = guid();
  const now = new Date().toISOString();
  const record: CrewMember = {
    id,
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  if (USE_DATAVERSE) {
    try {
      const dvRecord = mapCrewMemberToDv(record as unknown as Record<string, unknown>);
      (dvRecord as Record<string, unknown>).iw_crewid = input.name.replace(/\s+/g, '-').toLowerCase();
      const result = await Iw_crewmembersService.create(dvRecord as Omit<Iw_crewmembers, 'iw_crewmemberid'>);
      if (result?.data) return mapDvToCrewMember(result.data);
    } catch (e) {
      console.warn('[DV] createCrewMember fallback to localStorage', e);
    }
  }
  const all = loadLocal<CrewMember>(STORAGE_KEYS.crewMembers);
  all.push(record);
  saveLocal(STORAGE_KEYS.crewMembers, all);
  return record;
}

async function getCrewMembers(filter?: {
  specialization?: CrewSpecialization;
  status?: CrewStatus;
  activeOnly?: boolean;
}): Promise<CrewMember[]> {
  if (USE_DATAVERSE) {
    try {
      const result = await Iw_crewmembersService.getAll();
      if (result?.data) {
        let members = (result.data as unknown as Iw_crewmembers[]).map(mapDvToCrewMember);
        if (filter?.specialization) members = members.filter(m => m.specialization === filter.specialization);
        if (filter?.status) members = members.filter(m => m.status === filter.status);
        if (filter?.activeOnly !== false) members = members.filter(m => m.isActive);
        return members;
      }
    } catch (e) {
      console.warn('[DV] getCrewMembers fallback to localStorage', e);
    }
  }
  let all = loadLocal<CrewMember>(STORAGE_KEYS.crewMembers);
  if (filter?.specialization) all = all.filter(m => m.specialization === filter.specialization);
  if (filter?.status) all = all.filter(m => m.status === filter.status);
  if (filter?.activeOnly !== false) all = all.filter(m => m.isActive);
  return all;
}

async function getCrewMember(id: string): Promise<CrewMember | null> {
  if (USE_DATAVERSE) {
    try {
      const result = await Iw_crewmembersService.get(id);
      if (result?.data) return mapDvToCrewMember(result.data as unknown as Iw_crewmembers);
    } catch (e) {
      console.warn('[DV] getCrewMember fallback to localStorage', e);
    }
  }
  const all = loadLocal<CrewMember>(STORAGE_KEYS.crewMembers);
  return all.find(m => m.id === id) || null;
}

async function updateCrewMember(
  id: string,
  changes: Partial<Omit<CrewMember, 'id' | 'createdAt'>>
): Promise<CrewMember | null> {
  if (USE_DATAVERSE) {
    try {
      const dvChanges = mapCrewMemberToDv(changes as Record<string, unknown>);
      const result = await Iw_crewmembersService.update(id, dvChanges);
      if (result?.data) return mapDvToCrewMember(result.data as unknown as Iw_crewmembers);
    } catch (e) {
      console.warn('[DV] updateCrewMember fallback to localStorage', e);
    }
  }
  const all = loadLocal<CrewMember>(STORAGE_KEYS.crewMembers);
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...changes, updatedAt: new Date().toISOString() };
  saveLocal(STORAGE_KEYS.crewMembers, all);
  return all[idx];
}

async function deleteCrewMember(id: string): Promise<boolean> {
  if (USE_DATAVERSE) {
    try {
      await Iw_crewmembersService.delete(id);
      return true;
    } catch (e) {
      console.warn('[DV] deleteCrewMember fallback to localStorage', e);
    }
  }
  const all = loadLocal<CrewMember>(STORAGE_KEYS.crewMembers);
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  saveLocal(STORAGE_KEYS.crewMembers, all);
  return true;
}

/**
 * Persist an array of Crew objects as crew members.
 * Skips duplicates by name match. Returns persisted records.
 */
async function seedCrewMembers(crews: import('../types/infrastructure').Crew[]): Promise<CrewMember[]> {
  const existing = await getCrewMembers({ activeOnly: false });
  const existingNames = new Set(existing.map(m => m.name));
  const results: CrewMember[] = [...existing];
  for (const c of crews) {
    if (existingNames.has(c.name)) continue;
    const member = await createCrewMember({
      name: c.name,
      specialization: c.specialization,
      status: c.status,
      efficiencyRating: c.efficiencyRating,
      currentLat: c.currentLat,
      currentLng: c.currentLng,
      memberCount: c.memberCount,
      assignedWorkOrders: c.assignedWorkOrders,
      isActive: true,
    });
    results.push(member);
  }
  return results;
}

// ============================================
// Export
// ============================================

const dataverseService = {
  // Config
  isDataverseConnected: () => USE_DATAVERSE,

  // Crew Dispatch
  createDispatch,
  getDispatches,
  getDispatch,
  updateDispatch,
  deleteDispatch,
  approveDispatch,
  rejectDispatch,
  markDispatched,
  markInProgress,
  completeDispatch,

  // Field Inspection
  createInspection,
  getInspections,
  getInspection,
  updateInspection,

  // AI Decision Log
  logAIDecision,
  getAIDecisions,
  markAIDecisionOverridden,

  // Crew Schedule
  createSchedule,
  getSchedules,
  updateSchedule,

  // Work Order Updates
  logWorkOrderUpdate,
  getWorkOrderUpdates,

  // Crew Members
  createCrewMember,
  getCrewMembers,
  getCrewMember,
  updateCrewMember,
  deleteCrewMember,
  seedCrewMembers,

  // Stats
  getDispatchStats,
  getAIDecisionStats,

  // Demo
  seedDemoData,
  clearAllData,
};

export default dataverseService;

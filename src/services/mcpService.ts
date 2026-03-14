/**
 * MAINTAIN AI - MCP Service
 * 
 * Connects to the MAINTAIN MCP server for real Lake Forest infrastructure data.
 * Implements caching, retry logic, and error handling.
 */

import type {
  WorkOrder,
  IssueType,
  Severity,
  PriorityScoreResponse,
  CostEstimateResponse,
  MCPToolResponse
} from '../types/infrastructure';

// ============================================
// Configuration
// ============================================

const MCP_ENDPOINT = process.env.REACT_APP_INFRAWATCH_MCP_ENDPOINT || 
  process.env.REACT_APP_MCP_ENDPOINT || 
  '';

const INITIAL_TIMEOUT = 10000; // 10 seconds - fail fast, don't block the UI
const SUBSEQUENT_TIMEOUT = 5000; // 5 seconds - even faster once we know the state
const MAX_RETRIES = 2; // Two quick retries - handles brief network hiccups
const CACHE_TTL = 60000; // 1 minute

// Track if MCP is available (avoid repeated failed attempts)
let mcpAvailable: boolean | null = null;
let firstRequest = true; // Track if this is the first request (cold start tolerance)

// ============================================
// Types
// ============================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

interface MCPResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content: Array<{
      type: 'text';
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// ============================================
// Cache
// ============================================

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ============================================
// Request ID Generator
// ============================================

let requestId = 0;
function getRequestId(): number {
  return ++requestId;
}

// ============================================
// Core MCP Call Function
// ============================================

async function callMCPTool<T>(
  toolName: string,
  args?: Record<string, unknown>,
  retries = MAX_RETRIES
): Promise<MCPToolResponse<T>> {
  // If MCP was already determined unavailable (CORS/CSP), skip immediately
  if (mcpAvailable === false) {
    return {
      success: false,
      error: 'MCP unavailable (blocked by browser security policy). Using demo mode.',
      timestamp: new Date().toISOString()
    };
  }

  const callId = getRequestId();

  const cacheKey = `${toolName}:${JSON.stringify(args || {})}`;
  const cached = getCached<T>(cacheKey);
  
  if (cached) {
    return {
      success: true,
      data: cached,
      timestamp: new Date().toISOString()
    };
  }

  const request: MCPRequest = {
    jsonrpc: '2.0',
    id: callId,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };

  try {
    const controller = new AbortController();
    const currentTimeout = firstRequest ? INITIAL_TIMEOUT : SUBSEQUENT_TIMEOUT;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, currentTimeout);

    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
      mode: 'cors',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`MCP request failed: ${response.status} ${response.statusText}`);
    }

    const mcpResponse: MCPResponse<T> = await response.json();

    if (mcpResponse.error) {
      throw new Error(`MCP error: ${mcpResponse.error.message}`);
    }

    if (!mcpResponse.result?.content?.[0]?.text) {
      throw new Error('Invalid MCP response format');
    }

    const data = JSON.parse(mcpResponse.result.content[0].text) as T;
    setCache(cacheKey, data);
    mcpAvailable = true;
    firstRequest = false; // Container is warm now

    return {
      success: true,
      data,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const currentTimeout = firstRequest ? INITIAL_TIMEOUT : SUBSEQUENT_TIMEOUT;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for timeout (abort)
    const isTimeout = errorMessage.includes('abort') || errorMessage.includes('aborted');
    
    // Check for real CORS errors (not timeouts)
    const isCorsError = !isTimeout && (
                            errorMessage.includes('Failed to fetch') ||
                            errorMessage.includes('NetworkError') ||
                            errorMessage.includes('CORS') ||
                            errorMessage.includes('Content Security Policy') ||
                            errorMessage.includes('connect-src'));
    
    if (isTimeout) {
      // Timeouts can be retried - server might be cold starting
      if (retries > 0) {
        firstRequest = false; // Subsequent retries use shorter timeout
        await new Promise(resolve => setTimeout(resolve, 2000));
        return callMCPTool<T>(toolName, args, retries - 1);
      }
      
      return {
        success: false,
        error: `MCP request timed out after ${currentTimeout}ms. Server may be cold starting - try refreshing.`,
        timestamp: new Date().toISOString()
      };
    }
    
    if (isCorsError) {
      mcpAvailable = false; // Permanently block — all subsequent calls skip immediately
      console.info('[MCP] Connection blocked by browser security policy. Using demo mode with mock data.');
      return {
        success: false,
        error: 'MCP connection blocked by browser (CORS/CSP). Using demo mode.',
        timestamp: new Date().toISOString()
      };
    }
    
    // Other errors - retry
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return callMCPTool<T>(toolName, args, retries - 1);
    }

    return {
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================
// MCP Tool Wrappers
// ============================================

export interface Pothole {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  severity: Severity;
  reportedDate: string;
  status: string;
  nearSchool: boolean;
}

export interface SidewalkIssue {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  severity: Severity;
  issueDescription: string;
  reportedDate: string;
  status: string;
}

export interface School {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: 'elementary' | 'middle' | 'high';
}

export interface Zone {
  id: string;
  name: string;
  boundaries: Array<[number, number]>;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Get all work orders from the MAINTAIN MCP
 */
export async function getWorkOrders(): Promise<MCPToolResponse<WorkOrder[]>> {
  return callMCPTool<WorkOrder[]>('get_work_orders');
}

/**
 * Get all pothole reports
 */
export async function getPotholes(): Promise<MCPToolResponse<Pothole[]>> {
  return callMCPTool<Pothole[]>('get_potholes');
}

/**
 * Get all sidewalk issues
 */
export async function getSidewalkIssues(): Promise<MCPToolResponse<SidewalkIssue[]>> {
  return callMCPTool<SidewalkIssue[]>('get_sidewalk_issues');
}

/**
 * Get schools for proximity calculations
 */
export async function getSchools(): Promise<MCPToolResponse<School[]>> {
  return callMCPTool<School[]>('get_schools');
}

/**
 * Get zone definitions
 */
export async function getZones(): Promise<MCPToolResponse<Zone[]>> {
  return callMCPTool<Zone[]>('get_zones');
}

/**
 * Calculate priority score for a work order
 */
export async function calculatePriorityScore(
  workOrderId: string,
  issueType: IssueType,
  severity: Severity,
  nearSchool: boolean,
  daysOpen: number
): Promise<MCPToolResponse<PriorityScoreResponse>> {
  return callMCPTool<PriorityScoreResponse>('calculate_priority_score', {
    work_order_id: workOrderId,
    issue_type: issueType,
    severity,
    near_school: nearSchool,
    days_open: daysOpen
  });
}

/**
 * Get cost estimate for a work order
 */
export async function getCostEstimate(
  issueType: IssueType,
  severity: Severity
): Promise<MCPToolResponse<CostEstimateResponse>> {
  return callMCPTool<CostEstimateResponse>('get_cost_estimate', {
    issue_type: issueType,
    severity
  });
}

/**
 * Get infrastructure summary
 */
export async function getInfrastructureSummary(): Promise<MCPToolResponse<{
  totalWorkOrders: number;
  openWorkOrders: number;
  criticalCount: number;
  nearSchoolCount: number;
  estimatedBudget: number;
}>> {
  return callMCPTool('get_infrastructure_summary');
}

// ============================================
// Batch Operations
// ============================================

export interface InfrastructureData {
  workOrders: WorkOrder[];
  potholes: Pothole[];
  sidewalkIssues: SidewalkIssue[];
  schools: School[];
  zones: Zone[];
}

/**
 * Fetch all infrastructure data in parallel
 */
export async function fetchAllInfrastructureData(): Promise<MCPToolResponse<InfrastructureData>> {
  const timestamp = new Date().toISOString();
  
  // Pre-flight: if MCP availability is unknown, do a single probe first
  // This prevents 5 parallel calls from all failing with CSP errors
  if (mcpAvailable === null) {
    try {
      const probe = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list', params: {} }),
        signal: AbortSignal.timeout(5000),
        mode: 'cors',
      });
      if (probe.ok) {
        mcpAvailable = true;
      }
    } catch {
      mcpAvailable = false;
      console.info('[MCP] Connection blocked by browser security policy. Using demo mode with mock data.');
      return {
        success: false,
        error: 'MCP connection blocked by browser (CORS/CSP). Using demo mode.',
        timestamp
      };
    }
  }

  // If already known unavailable, skip immediately
  if (mcpAvailable === false) {
    return {
      success: false,
      error: 'MCP unavailable (blocked by browser security policy). Using demo mode.',
      timestamp
    };
  }

  try {
    const [workOrdersRes, potholesRes, sidewalkRes, schoolsRes, zonesRes] = await Promise.all([
      getWorkOrders(),
      getPotholes(),
      getSidewalkIssues(),
      getSchools(),
      getZones()
    ]);

    // Check for any failures
    const errors: string[] = [];
    if (!workOrdersRes.success) errors.push(`Work Orders: ${workOrdersRes.error}`);
    if (!potholesRes.success) errors.push(`Potholes: ${potholesRes.error}`);
    if (!sidewalkRes.success) errors.push(`Sidewalk: ${sidewalkRes.error}`);
    if (!schoolsRes.success) errors.push(`Schools: ${schoolsRes.error}`);
    if (!zonesRes.success) errors.push(`Zones: ${zonesRes.error}`);

    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join('; '),
        timestamp
      };
    }

    return {
      success: true,
      data: {
        workOrders: workOrdersRes.data || [],
        potholes: potholesRes.data || [],
        sidewalkIssues: sidewalkRes.data || [],
        schools: schoolsRes.data || [],
        zones: zonesRes.data || []
      },
      timestamp
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    };
  }
}

// ============================================
// Health Check
// ============================================

export async function checkMCPHealth(): Promise<boolean> {
  try {
    const response = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: getRequestId(),
        method: 'tools/list',
        params: {}
      })
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Clear the MCP cache
 */
export function clearCache(): void {
  cache.clear();
}

/**
 * Reset MCP availability flag (allows retry after CORS fix)
 */
export function resetMCPAvailability(): void {
  mcpAvailable = null;
}

/**
 * Check if MCP is currently available
 */
export function isMCPAvailable(): boolean | null {
  return mcpAvailable;
}

export default {
  getWorkOrders,
  getPotholes,
  getSidewalkIssues,
  getSchools,
  getZones,
  calculatePriorityScore,
  getCostEstimate,
  getInfrastructureSummary,
  fetchAllInfrastructureData,
  checkMCPHealth,
  clearCache,
  resetMCPAvailability,
  isMCPAvailable
};

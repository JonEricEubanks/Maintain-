/**
 * MAINTAIN AI — NLP Dashboard Generation Service
 *
 * Parses natural language requests into dashboard widget configurations.
 * Uses the Python agent API with Code Interpreter when available,
 * falls back to local keyword matching + heuristic intent extraction.
 */

import type { WorkOrder } from '../types/infrastructure';

// ============================================
// Types
// ============================================

export type WidgetType =
  | 'stat-card'
  | 'kpi'
  | 'bar-chart'
  | 'horizontal-bar'
  | 'stacked-bar'
  | 'pie-chart'
  | 'donut-chart'
  | 'radar-chart'
  | 'scatter-chart'
  | 'composed-chart'
  | 'radial-bar'
  | 'table'
  | 'trend-line'
  | 'heatmap-summary'
  | 'severity-gauge'
  | 'narrative'
  | 'code-interpreter-chart'
  | 'cost-waterfall'
  | 'hotspot-bar'
  | 'heatmap';

export type MetricKind =
  | 'count'
  | 'cost'
  | 'avg-cost'
  | 'severity-breakdown'
  | 'type-breakdown'
  | 'school-proximity'
  | 'status-breakdown'
  | 'zone-breakdown'
  | 'top-n'
  | 'trend'
  | 'geographic-hotspots'
  | 'severity-type-matrix'
  | 'custom-analysis'
  | 'status-by-type'
  | 'zone-severity-radar'
  | 'cost-by-type'
  | 'cost-by-severity'
  | 'cost-by-zone';

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  metric: MetricKind;
  filters: WidgetFilter;
  size: 'sm' | 'md' | 'lg';
  order: number;
  color?: string;
  insight?: string;
  chartInstruction?: string;
  colSpan?: 1 | 2 | 3;
}

export interface WidgetFilter {
  severity?: string[];
  issueType?: string[];
  nearSchool?: boolean;
  status?: string[];
  zone?: string[];
}

export interface DashboardSpec {
  title: string;
  description: string;
  widgets: WidgetConfig[];
  generatedAt: string;
  prompt: string;
}

export interface WidgetData {
  widget: WidgetConfig;
  values: Record<string, number>;
  rows?: Array<Record<string, unknown>>;
  total?: number;
  narrative?: string;
  chart_base64?: string;
  insight?: string;
  source?: 'code-interpreter' | 'matplotlib' | 'local';
}

export interface AIReasoningStep {
  step: number;
  phase: string;
  description: string;
  status: string;
  ai_reasoning?: string[];
}

export interface AIDashboardResponse {
  success: boolean;
  title: string;
  description: string;
  widgets: WidgetData[];
  narrative: string;
  reasoning: AIReasoningStep[];
  filters_applied: Record<string, unknown>;
  prompt: string;
  generatedAt: string;
  metadata: {
    model: string;
    total_issues: number;
    filtered_issues: number;
    code_interpreter_charts: number;
    local_charts: number;
    processing_time_ms: number;
    ai_powered: boolean;
    code_interpreter_used: boolean;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// ============================================
// Agent API URL
// ============================================

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';
let apiAvailable: boolean | null = null;

// ============================================
// NLP Parsing — Local Heuristic Engine
// ============================================

/** Extract filters from a natural language prompt.
 *  Only set filters when the user clearly intends to narrow results —
 *  skip generic overview / dashboard prompts to avoid false positives.
 */
function extractFilters(prompt: string): WidgetFilter {
  const p = prompt.toLowerCase();
  const filters: WidgetFilter = {};

  // If the prompt is a general overview / dashboard request, skip filtering
  const isGeneral = /\b(overview|full|all|complete|comprehensive|entire|every|general|overall|whole|dashboard|report|review|summary)\b/i.test(p);
  // Only suppress filters if the prompt DOESN'T also contain explicit filter targets
  const hasExplicitFilter = /\b(only|just|filter|where|limit|restrict|show me)\b.*\b(open|critical|high|medium|low|completed|deferred|assigned|pothole|sidewalk|concrete|school)/i.test(p)
    || /\b(open|critical|high|medium|low|completed|deferred|assigned|pothole|sidewalk|concrete)\s+(issue|work.?order|item|ticket|case|problem)/i.test(p);

  if (isGeneral && !hasExplicitFilter) {
    return filters; // empty — no filters for general prompts
  }

  // Severity — require word-boundary and exclude "high-level", "high-quality" etc.
  const sevs: string[] = [];
  if (/\bcritical\b/.test(p)) sevs.push('critical');
  if (/\bhigh\b(?![\s-]*(?:level|quality|resolution|performance|volume))/.test(p)) sevs.push('high');
  if (/\bmedium\b/.test(p)) sevs.push('medium');
  if (/\blow\b(?![\s-]*(?:level|quality|resolution|latency))/.test(p)) sevs.push('low');
  if (sevs.length) filters.severity = sevs;

  // Issue type
  const types: string[] = [];
  if (/\bpothole/.test(p)) types.push('pothole');
  if (/\bsidewalk/.test(p)) types.push('sidewalk');
  if (/\bconcrete/.test(p)) types.push('concrete');
  if (types.length) filters.issueType = types;

  // School proximity
  if (/\bschool/.test(p) || /\bnear school/.test(p) || /\bschool.?zone/.test(p)) {
    filters.nearSchool = true;
  }

  // Status — require context (e.g. "open issues", "only open", "status: open")
  // to avoid matching the verb "open" in "open a dashboard"
  const stats: string[] = [];
  if (/(?:only|just|show|filter|status)\s+open\b|\bopen\s+(?:issue|work|item|ticket|order|case|problem)/i.test(p)) stats.push('open');
  if (/\bassigned\b/.test(p)) stats.push('assigned');
  if (/\bin[\s-]?progress/.test(p)) stats.push('in_progress');
  if (/\bcompleted\b/.test(p)) stats.push('completed');
  if (/\bdeferred\b/.test(p)) stats.push('deferred');
  if (stats.length) filters.status = stats;

  return filters;
}

/** Assign layout colSpan properties based on widget type */
function assignLayouts(widgets: WidgetConfig[]): WidgetConfig[] {
  return widgets.map(w => {
    if (w.colSpan) return w; // already assigned
    if (w.type === 'stat-card' || w.type === 'kpi') return { ...w, colSpan: 1 as const, size: 'sm' as const };
    if (['table', 'narrative', 'trend-line', 'stacked-bar', 'composed-chart'].includes(w.type)) return { ...w, colSpan: 2 as const, size: 'lg' as const };
    if (w.type === 'severity-gauge') return { ...w, colSpan: 2 as const, size: 'lg' as const };
    return { ...w, colSpan: 1 as const, size: 'md' as const };
  });
}

/** Deduplicate widgets by metric + type combination */
function deduplicateWidgets(widgets: WidgetConfig[]): WidgetConfig[] {
  const seen = new Set<string>();
  return widgets.filter(w => {
    if (w.type === 'stat-card' || w.type === 'kpi') {
      const key = `${w.type}-${w.metric}-${w.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }
    const key = `${w.type}-${w.metric}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Infer which widgets the user wants — curated diverse sets with no duplication. */
function inferWidgets(prompt: string, filters: WidgetFilter): WidgetConfig[] {
  const p = prompt.toLowerCase();
  let widgets: WidgetConfig[] = [];
  let order = 0;
  const id = () => `w-${Date.now()}-${order}`;

  const isBudget = /budget|cost|spend|financ|dollar|money|\$/.test(p);
  const isSeverity = /severity|critical|priority|urgent|risk/.test(p);
  const isStatus = /status|progress|assign|complet|open|defer/.test(p);
  const isTrend = /trend|forecast|timeline|history|over time|month|week/.test(p);
  const isZone = /zone|area|region|geography|location|neighborhood/.test(p);
  const isSchool = /school/.test(p);
  const isType = /type|breakdown|distribution|category/.test(p);
  const isTable = /table|list|detail|top|worst|ranking/.test(p);
  const isOverview = /overview|full|all|complete|comprehensive|general|overall/.test(p);

  // ── Top KPI row — always present ──
  widgets.push({ id: id(), type: 'stat-card', title: 'Total Issues', metric: 'count', filters, size: 'sm', order: order++, colSpan: 1, color: '#6366f1' });
  widgets.push({ id: id(), type: 'stat-card', title: 'Estimated Cost', metric: 'cost', filters, size: 'sm', order: order++, colSpan: 1, color: '#ef4444' });
  widgets.push({ id: id(), type: 'stat-card', title: 'Avg Cost / Issue', metric: 'avg-cost', filters, size: 'sm', order: order++, colSpan: 1, color: '#f59e0b' });

  // ── Budget-focused ──
  if (isBudget) {
    widgets.push({ id: id(), type: 'horizontal-bar', title: 'Cost by Issue Type', metric: 'cost', filters, size: 'lg', order: order++, colSpan: 2 });
    widgets.push({ id: id(), type: 'donut-chart', title: 'Cost Distribution', metric: 'cost', filters, size: 'md', order: order++, colSpan: 1 });
  }

  // ── Severity-focused ──
  if (isSeverity) {
    widgets.push({ id: id(), type: 'severity-gauge', title: 'Severity Overview', metric: 'severity-breakdown', filters, size: 'lg', order: order++, colSpan: 2 });
    widgets.push({ id: id(), type: 'donut-chart', title: 'Severity Distribution', metric: 'severity-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
    widgets.push({ id: id(), type: 'radar-chart', title: 'Severity by Zone', metric: 'zone-severity-radar', filters, size: 'md', order: order++, colSpan: 1 });
  }

  // ── Status ──
  if (isStatus) {
    widgets.push({ id: id(), type: 'stacked-bar', title: 'Status by Issue Type', metric: 'status-by-type', filters, size: 'lg', order: order++, colSpan: 2 });
    widgets.push({ id: id(), type: 'donut-chart', title: 'Status Breakdown', metric: 'status-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
  }

  // ── Type breakdown ──
  if (isType) {
    widgets.push({ id: id(), type: 'bar-chart', title: 'Issues by Type', metric: 'type-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
    widgets.push({ id: id(), type: 'donut-chart', title: 'Type Distribution', metric: 'type-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
  }

  // ── Trend ──
  if (isTrend) {
    widgets.push({ id: id(), type: 'trend-line', title: 'Issue Trend Over Time', metric: 'trend', filters, size: 'lg', order: order++, colSpan: 2 });
  }

  // ── Zone / geographic ──
  if (isZone) {
    widgets.push({ id: id(), type: 'bar-chart', title: 'Issues by Zone', metric: 'zone-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
    widgets.push({ id: id(), type: 'radar-chart', title: 'Zone Severity Profile', metric: 'zone-severity-radar', filters, size: 'md', order: order++, colSpan: 1 });
  }

  // ── School proximity ──
  if (isSchool) {
    widgets.push({ id: id(), type: 'stat-card', title: 'Near Schools', metric: 'school-proximity', filters, size: 'sm', order: order++, colSpan: 1, color: '#ec4899' });
    widgets.push({ id: id(), type: 'donut-chart', title: 'School Proximity', metric: 'school-proximity', filters, size: 'md', order: order++, colSpan: 1 });
  }

  // ── Table ──
  if (isTable) {
    widgets.push({ id: id(), type: 'table', title: 'Top Issues by Cost', metric: 'top-n', filters, size: 'lg', order: order++, colSpan: 2 });
  }

  // ── Full overview: fill in any missing chart diversity ──
  if (isOverview || widgets.length <= 3) {
    const hasType = (t: string) => widgets.some(w => w.type === t);
    const hasMetric = (m: string) => widgets.some(w => w.metric === m);

    if (!hasType('donut-chart') && !hasType('pie-chart')) {
      widgets.push({ id: id(), type: 'donut-chart', title: 'Severity Distribution', metric: 'severity-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
    }
    if (!hasMetric('type-breakdown')) {
      widgets.push({ id: id(), type: 'bar-chart', title: 'Issues by Type', metric: 'type-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
    }
    if (!hasType('stacked-bar')) {
      widgets.push({ id: id(), type: 'stacked-bar', title: 'Status by Issue Type', metric: 'status-by-type', filters, size: 'lg', order: order++, colSpan: 2 });
    }
    if (!hasType('horizontal-bar') && !isBudget) {
      widgets.push({ id: id(), type: 'horizontal-bar', title: 'Cost by Issue Type', metric: 'cost', filters, size: 'md', order: order++, colSpan: 1 });
    }
    if (!hasType('radar-chart')) {
      widgets.push({ id: id(), type: 'radar-chart', title: 'Zone Severity Profile', metric: 'zone-severity-radar', filters, size: 'md', order: order++, colSpan: 1 });
    }
    if (!hasType('trend-line')) {
      widgets.push({ id: id(), type: 'trend-line', title: 'Monthly Trend', metric: 'trend', filters, size: 'lg', order: order++, colSpan: 2 });
    }
    if (!hasMetric('zone-breakdown')) {
      widgets.push({ id: id(), type: 'bar-chart', title: 'Issues by Zone', metric: 'zone-breakdown', filters, size: 'md', order: order++, colSpan: 1 });
    }
    if (!hasMetric('school-proximity')) {
      widgets.push({ id: id(), type: 'donut-chart', title: 'School Proximity', metric: 'school-proximity', filters, size: 'md', order: order++, colSpan: 1 });
    }
    if (!hasType('table')) {
      widgets.push({ id: id(), type: 'table', title: 'Top Issues by Cost', metric: 'top-n', filters, size: 'lg', order: order++, colSpan: 2 });
    }
  }

  // ── Always add narrative at end ──
  if (!widgets.find(w => w.type === 'narrative')) {
    widgets.push({ id: id(), type: 'narrative', title: 'AI Narrative Summary', metric: 'count', filters, size: 'lg', order: order++, colSpan: 2 });
  }

  // Deduplicate, then assign layouts for any that don't have colSpan yet
  widgets = deduplicateWidgets(widgets);
  widgets = assignLayouts(widgets);

  return widgets;
}

/** Generate a dashboard title from the prompt. */
function inferTitle(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/budget|cost|spend/.test(p)) return 'Budget Analysis Dashboard';
  if (/severity|critical/.test(p)) return 'Severity Analysis Dashboard';
  if (/school/.test(p)) return 'School Zone Safety Dashboard';
  if (/pothole/.test(p)) return 'Pothole Analysis Dashboard';
  if (/sidewalk/.test(p)) return 'Sidewalk Infrastructure Dashboard';
  if (/status|progress/.test(p)) return 'Work Order Status Dashboard';
  if (/trend|forecast/.test(p)) return 'Trend & Forecast Dashboard';
  if (/zone|area/.test(p)) return 'Geographic Analysis Dashboard';
  return 'Custom Infrastructure Dashboard';
}

// ============================================
// Dashboard Generation
// ============================================

/**
 * Parse a natural language prompt and generate a DashboardSpec.
 * Tries the Python agent API first, falls back to local parsing.
 */
async function generateDashboard(
  prompt: string,
  workOrders: WorkOrder[],
): Promise<DashboardSpec> {
  // Try agent API first
  const agentResult = await callAgentApi(prompt, workOrders);
  if (agentResult) return agentResult;

  // Local fallback
  const filters = extractFilters(prompt);
  const widgets = inferWidgets(prompt, filters);
  const title = inferTitle(prompt);

  return {
    title,
    description: `Generated from: "${prompt}"`,
    widgets,
    generatedAt: new Date().toISOString(),
    prompt,
  };
}

/** Call the Python agent for NLP dashboard generation with Code Interpreter. */
async function callAgentApi(
  prompt: string,
  workOrders: WorkOrder[],
): Promise<DashboardSpec | null> {
  if (apiAvailable === false || !AGENT_API_URL) {
    console.warn('[NLP Dashboard] API skipped — apiAvailable:', apiAvailable, 'URL:', AGENT_API_URL ? 'set' : 'empty');
    return null;
  }
  try {
    const controller = new AbortController();
    // Allow enough time for multi-agent pipeline (intent + code-interpreter + narrative)
    const timer = setTimeout(() => controller.abort(), 45_000);
    console.log('[NLP Dashboard] Calling agent API...');
    const resp = await fetch(`${AGENT_API_URL}/api/agents/nlp-dashboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        workOrders: workOrders.map(wo => ({
          id: wo.id,
          issueType: wo.issueType,
          severity: wo.severity,
          address: wo.address,
          nearSchool: wo.nearSchool,
          estimatedCost: wo.estimatedCost,
          status: wo.status,
          zone: wo.zone,
          createdAt: wo.createdAt,
        })),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`NLP Dashboard API ${resp.status}`);
    apiAvailable = true;

    const aiResp = await resp.json() as AIDashboardResponse;
    console.log('[NLP Dashboard] API response received:', {
      title: aiResp.title,
      widgetCount: aiResp.widgets?.length,
      metadata: aiResp.metadata,
      hasReasoning: !!aiResp.reasoning?.length,
    });

    // Store AI metadata on the spec for the component to use
    const widgets: WidgetConfig[] = (aiResp.widgets || []).map((wd: any, idx: number) => ({
      id: `ai-${Date.now()}-${idx}`,
      type: wd.type || 'kpi',
      title: wd.title || `Widget ${idx + 1}`,
      metric: wd.metric || 'count',
      filters: {},
      size: wd.size || 'md',
      order: idx,
      insight: wd.insight || '',
      chartInstruction: wd.chart_instruction || '',
    }));

    const spec: DashboardSpec & {
      _aiResponse?: AIDashboardResponse;
      _widgetData?: WidgetData[];
    } = {
      title: aiResp.title,
      description: aiResp.description,
      widgets,
      generatedAt: aiResp.generatedAt || new Date().toISOString(),
      prompt: aiResp.prompt || prompt,
    };

    // Attach full AI response for the component to consume
    spec._aiResponse = aiResp;

    // Pre-build widget data from AI response
    spec._widgetData = (aiResp.widgets || []).map((wd: any, idx: number) => ({
      widget: widgets[idx],
      values: wd.values || {},
      rows: wd.rows || undefined,
      total: wd.total,
      narrative: wd.narrative_text || wd.narrative || undefined,
      chart_base64: wd.chart_base64 || undefined,
      insight: wd.insight || '',
      source: wd.source || 'local',
    }));

    return spec;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    // Only mark permanently unavailable for non-timeout errors
    // Timeouts can happen on cold starts but the API may work next time
    if (msg !== 'The operation was aborted' && !msg.includes('aborted')) {
      apiAvailable = false;
    }
    console.warn('[NLP Dashboard] Agent API error, falling back to local:', msg);
    return null;
  }
}

// ============================================
// Data Computation — Apply widgets to work orders
// ============================================

function applyFilters(workOrders: WorkOrder[], filters: WidgetFilter): WorkOrder[] {
  let data = [...workOrders];
  if (filters.severity?.length) data = data.filter(w => filters.severity!.includes(w.severity));
  if (filters.issueType?.length) data = data.filter(w => filters.issueType!.includes(w.issueType));
  if (filters.nearSchool !== undefined) data = data.filter(w => w.nearSchool === filters.nearSchool);
  if (filters.status?.length) data = data.filter(w => filters.status!.includes(w.status));
  if (filters.zone?.length) data = data.filter(w => filters.zone!.includes(w.zone));
  return data;
}

function computeWidgetData(widget: WidgetConfig, workOrders: WorkOrder[]): WidgetData {
  let filtered = applyFilters(workOrders, widget.filters);

  // Safety net: only fall back to unfiltered if no explicit filters were set
  const hasExplicitFilters = (widget.filters.severity?.length ?? 0) > 0
    || (widget.filters.issueType?.length ?? 0) > 0
    || widget.filters.nearSchool !== undefined
    || (widget.filters.status?.length ?? 0) > 0
    || (widget.filters.zone?.length ?? 0) > 0;
  if (filtered.length === 0 && workOrders.length > 0 && !hasExplicitFilters) {
    console.warn('[NLP] Filters eliminated all data for widget', widget.title, '— using unfiltered. Filters:', widget.filters);
    filtered = [...workOrders];
  }

  const values: Record<string, number> = {};
  let rows: Array<Record<string, unknown>> | undefined;
  let total: number | undefined;
  let narrative: string | undefined;

  switch (widget.metric) {
    case 'count':
      total = filtered.length;
      // Per-type counts for richer breakdown
      for (const wo of filtered) {
        values[wo.issueType] = (values[wo.issueType] || 0) + 1;
      }
      break;

    case 'cost':
      total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
      // Compute cost by issue type (charts filter 'Total Cost' so put specifics first)
      for (const wo of filtered) {
        const key = wo.issueType;
        values[key] = (values[key] || 0) + wo.estimatedCost;
      }
      break;

    case 'avg-cost': {
      total = filtered.length > 0
        ? Math.round(filtered.reduce((s, w) => s + w.estimatedCost, 0) / filtered.length)
        : 0;
      // Per-type averages for richer stat-card breakdown
      const typeBuckets: Record<string, { sum: number; count: number }> = {};
      for (const wo of filtered) {
        if (!typeBuckets[wo.issueType]) typeBuckets[wo.issueType] = { sum: 0, count: 0 };
        typeBuckets[wo.issueType].sum += wo.estimatedCost;
        typeBuckets[wo.issueType].count += 1;
      }
      for (const [t, b] of Object.entries(typeBuckets)) {
        values[t] = Math.round(b.sum / b.count);
      }
      break;
    }

    case 'severity-breakdown':
      for (const sev of ['critical', 'high', 'medium', 'low']) {
        values[sev] = filtered.filter(w => w.severity === sev).length;
      }
      total = filtered.length;
      break;

    case 'type-breakdown':
      for (const t of ['pothole', 'sidewalk', 'concrete']) {
        values[t] = filtered.filter(w => w.issueType === t).length;
      }
      total = filtered.length;
      break;

    case 'school-proximity':
      values['Near School'] = filtered.filter(w => w.nearSchool).length;
      values['Not Near School'] = filtered.filter(w => !w.nearSchool).length;
      total = values['Near School'];
      break;

    case 'status-breakdown':
      for (const wo of filtered) {
        values[wo.status] = (values[wo.status] || 0) + 1;
      }
      total = filtered.length;
      break;

    case 'zone-breakdown':
      for (const wo of filtered) {
        values[wo.zone] = (values[wo.zone] || 0) + 1;
      }
      total = filtered.length;
      break;

    case 'top-n':
      rows = filtered
        .sort((a, b) => b.estimatedCost - a.estimatedCost)
        .slice(0, 10)
        .map(w => ({
          id: w.id,
          type: w.issueType,
          severity: w.severity,
          address: w.address,
          cost: w.estimatedCost,
          status: w.status,
          school: w.nearSchool ? 'Yes' : 'No',
        }));
      total = filtered.length;
      break;

    case 'trend': {
      // Group by month from createdAt
      const monthly: Record<string, number> = {};
      for (const wo of filtered) {
        const d = new Date(wo.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthly[key] = (monthly[key] || 0) + 1;
      }
      Object.assign(values, monthly);
      total = filtered.length;
      break;
    }

    case 'geographic-hotspots': {
      const streetCounts: Record<string, number> = {};
      for (const wo of filtered) {
        if (wo.address) {
          const parts = wo.address.split(' ');
          const street = parts.filter(p => isNaN(Number(p)) && !['N','S','E','W','IL'].includes(p)).join(' ');
          if (street.length > 2) streetCounts[street] = (streetCounts[street] || 0) + 1;
        }
      }
      const topStreets = Object.entries(streetCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
      for (const [s, c] of topStreets) values[s] = c;
      total = filtered.length;
      break;
    }

    case 'severity-type-matrix': {
      for (const wo of filtered) {
        const key = `${wo.severity}-${wo.issueType}`;
        values[key] = (values[key] || 0) + 1;
      }
      total = filtered.length;
      break;
    }

    case 'custom-analysis':
      total = filtered.length;
      // Produce something chart-friendly: count by type + severity
      for (const wo of filtered) {
        values[wo.issueType] = (values[wo.issueType] || 0) + 1;
      }
      break;

    case 'status-by-type': {
      const types = [...new Set(filtered.map(w => w.issueType))];
      const statuses = [...new Set(filtered.map(w => w.status))];
      rows = types.map(t => {
        const row: Record<string, unknown> = { name: t };
        for (const s of statuses) {
          row[s] = filtered.filter(w => w.issueType === t && w.status === s).length;
        }
        return row;
      });
      total = filtered.length;
      break;
    }

    case 'zone-severity-radar': {
      const zones = [...new Set(filtered.map(w => w.zone))].slice(0, 8);
      rows = zones.map(z => {
        const row: Record<string, unknown> = { subject: z };
        for (const sev of ['critical', 'high', 'medium', 'low']) {
          row[sev] = filtered.filter(w => w.zone === z && w.severity === sev).length;
        }
        return row;
      });
      total = filtered.length;
      break;
    }

    case 'cost-by-type': {
      for (const wo of filtered) {
        values[wo.issueType] = (values[wo.issueType] || 0) + wo.estimatedCost;
      }
      total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
      break;
    }

    case 'cost-by-severity': {
      for (const sev of ['critical', 'high', 'medium', 'low']) {
        const cost = filtered.filter(w => w.severity === sev).reduce((s, w) => s + w.estimatedCost, 0);
        if (cost > 0) values[sev] = cost;
      }
      total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
      break;
    }

    case 'cost-by-zone': {
      for (const wo of filtered) {
        const zone = wo.zone || 'Unknown';
        values[zone] = (values[zone] || 0) + wo.estimatedCost;
      }
      total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
      break;
    }
  }

  // Generate narrative
  const critCount = filtered.filter(w => w.severity === 'critical').length;
  const totalCost = filtered.reduce((s, w) => s + w.estimatedCost, 0);
  const schoolCount = filtered.filter(w => w.nearSchool).length;
  narrative = `Analysis of **${filtered.length}** infrastructure issues` +
    (critCount > 0 ? ` includes **${critCount} critical** items requiring immediate attention.` : '.') +
    ` Estimated total repair cost is **$${(totalCost / 1000).toFixed(0)}K**.` +
    (schoolCount > 0 ? ` **${schoolCount}** issues are near schools and should be prioritized for safety.` : '') +
    ` The most common issue type is **${getMostCommon(filtered)}**.`;

  return { widget, values, rows, total, narrative };
}

function getMostCommon(workOrders: WorkOrder[]): string {
  const counts: Record<string, number> = {};
  for (const wo of workOrders) {
    counts[wo.issueType] = (counts[wo.issueType] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.length > 0 ? sorted[0][0] : 'N/A';
}

/** Compute data for all widgets in a dashboard spec. */
function computeAllWidgets(spec: DashboardSpec, workOrders: WorkOrder[]): WidgetData[] {
  return spec.widgets.map(w => computeWidgetData(w, workOrders));
}

// ============================================
// Prompt Suggestions
// ============================================

// ============================================
// Metric & Type Inference for AI Widgets
// ============================================

/** Infer the correct local metric for an AI-returned widget based on its title. */
function inferCorrectMetric(widget: WidgetConfig): MetricKind {
  const t = widget.title.toLowerCase();

  // KPI / stat-card widgets
  if (widget.type === 'kpi' || widget.type === 'stat-card') {
    if (t.includes('cost') || t.includes('budget') || t.includes('repair') || t.includes('spend')) {
      if (t.includes('average') || t.includes('avg') || t.includes('per issue')) return 'avg-cost';
      return 'cost';
    }
    if (t.includes('school')) return 'school-proximity';
    if (t.includes('total') && (t.includes('issue') || t.includes('count') || t.includes('report'))) return 'count';
    return widget.metric;
  }

  // Chart widgets — cost-related
  if (t.includes('cost') || t.includes('budget') || t.includes('spend') || t.includes('dollar')) {
    if (t.includes('severity')) return 'cost-by-severity';
    if (t.includes('zone') || t.includes('area') || t.includes('region')) return 'cost-by-zone';
    if (t.includes('type') || t.includes('issue type') || t.includes('category')) return 'cost-by-type';
    return 'cost';
  }

  // Non-cost chart widgets
  if (t.includes('severity') && !t.includes('cost')) return 'severity-breakdown';
  if (t.includes('type') && t.includes('distribution')) return 'type-breakdown';
  if (t.includes('status')) return 'status-breakdown';
  if (t.includes('zone') && !t.includes('cost')) return 'zone-breakdown';
  if (t.includes('school')) return 'school-proximity';
  if (t.includes('trend')) return 'trend';

  return widget.metric;
}

/**
 * Resolve a code-interpreter-chart widget (no base64 image) to a local
 * interactive chart by inferring the best type & metric from its title,
 * then computing data from workOrders.
 */
function resolveCodeInterpreterWidget(
  widget: WidgetConfig,
  workOrders: WorkOrder[],
): WidgetData {
  const filtered = applyFilters(workOrders, widget.filters);
  const t = widget.title.toLowerCase();
  const values: Record<string, number> = {};
  let rows: Array<Record<string, unknown>> | undefined;
  let total: number | undefined;
  let resolvedType: WidgetType = 'bar-chart';
  let resolvedMetric: MetricKind = widget.metric;
  const sevs = ['critical', 'high', 'medium', 'low'];

  if (t.includes('stack') && (t.includes('severity') || t.includes('type'))) {
    // Stacked bar: cost by severity × issue type
    const types = [...new Set(filtered.map(w => w.issueType))];
    rows = types.map(tp => {
      const row: Record<string, unknown> = { name: tp };
      for (const sev of sevs) {
        row[sev] = filtered
          .filter(w => w.issueType === tp && w.severity === sev)
          .reduce((s, w) => s + w.estimatedCost, 0);
      }
      return row;
    });
    total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
    resolvedType = 'stacked-bar';
    resolvedMetric = 'severity-type-matrix';
  } else if (t.includes('pareto')) {
    // Pareto: counts by zone with cumulative line
    for (const wo of filtered) {
      values[wo.zone || 'Unknown'] = (values[wo.zone || 'Unknown'] || 0) + 1;
    }
    total = filtered.length;
    resolvedType = 'composed-chart';
    resolvedMetric = 'zone-breakdown';
  } else if (t.includes('scatter')) {
    // Scatter approximation: average cost per severity
    for (const sev of sevs) {
      const items = filtered.filter(w => w.severity === sev);
      if (items.length > 0) {
        values[sev] = Math.round(
          items.reduce((s, w) => s + w.estimatedCost, 0) / items.length,
        );
      }
    }
    total = filtered.length;
    resolvedType = 'bar-chart';
    resolvedMetric = 'cost-by-severity';
  } else if (t.includes('box')) {
    // Box plot approximation: total cost per zone
    for (const wo of filtered) {
      values[wo.zone || 'Unknown'] =
        (values[wo.zone || 'Unknown'] || 0) + wo.estimatedCost;
    }
    total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
    resolvedType = 'bar-chart';
    resolvedMetric = 'cost-by-zone';
  } else if (t.includes('cost') && t.includes('severity')) {
    for (const sev of sevs) {
      const cost = filtered
        .filter(w => w.severity === sev)
        .reduce((s, w) => s + w.estimatedCost, 0);
      if (cost > 0) values[sev] = cost;
    }
    total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
    resolvedType = 'pie-chart';
    resolvedMetric = 'cost-by-severity';
  } else if (t.includes('cost') && t.includes('zone')) {
    for (const wo of filtered) {
      values[wo.zone || 'Unknown'] =
        (values[wo.zone || 'Unknown'] || 0) + wo.estimatedCost;
    }
    total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
    resolvedType = 'bar-chart';
    resolvedMetric = 'cost-by-zone';
  } else if (t.includes('cost') && t.includes('type')) {
    for (const wo of filtered) {
      values[wo.issueType] = (values[wo.issueType] || 0) + wo.estimatedCost;
    }
    total = filtered.reduce((s, w) => s + w.estimatedCost, 0);
    resolvedType = 'pie-chart';
    resolvedMetric = 'cost-by-type';
  } else if (t.includes('radar') || t.includes('spider')) {
    return computeWidgetData(
      { ...widget, type: 'radar-chart', metric: 'zone-severity-radar' },
      workOrders,
    );
  } else if (t.includes('trend') || t.includes('time') || t.includes('line')) {
    return computeWidgetData(
      { ...widget, type: 'trend-line', metric: 'trend' },
      workOrders,
    );
  } else if (t.includes('severity')) {
    return computeWidgetData(
      { ...widget, type: 'donut-chart', metric: 'severity-breakdown' },
      workOrders,
    );
  } else if (t.includes('zone')) {
    return computeWidgetData(
      { ...widget, type: 'bar-chart', metric: 'zone-breakdown' },
      workOrders,
    );
  } else if (t.includes('type')) {
    return computeWidgetData(
      { ...widget, type: 'bar-chart', metric: 'type-breakdown' },
      workOrders,
    );
  } else {
    return computeWidgetData(
      { ...widget, type: 'bar-chart', metric: 'type-breakdown' },
      workOrders,
    );
  }

  const updatedWidget: WidgetConfig = {
    ...widget,
    type: resolvedType,
    metric: resolvedMetric,
  };
  return { widget: updatedWidget, values, rows, total };
}

const PROMPT_SUGGESTIONS = [
  'Show me a budget breakdown for all critical issues near schools',
  'Create a severity analysis dashboard with trend over time',
  'What is the cost distribution across all issue types?',
  'Show me the top 10 most expensive pothole repairs',
  'Give me a status overview of all open high-priority work orders',
  'Create a geographic breakdown of issues by zone',
  'Show a school safety dashboard with nearby critical and high severity issues',
  'Give me a full infrastructure overview with all key metrics',
  'What does the monthly trend look like for sidewalk issues?',
  'Build a budget request dashboard for the city council',
];

// ============================================
// Export
// ============================================

const nlpDashboardService = {
  generateDashboard,
  computeAllWidgets,
  computeWidgetData,
  applyFilters,
  inferCorrectMetric,
  resolveCodeInterpreterWidget,
  PROMPT_SUGGESTIONS,
};

export type { AIDashboardResponse as AIDashboardResponseType };
export default nlpDashboardService;

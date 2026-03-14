/**
 * MAINTAIN AI — NLP Dashboard Builder (v3)
 *
 * Complete redesign with:
 * - Executive summary banner with key findings & confidence
 * - Quick stats strip with animated counters & inline sparklines
 * - Combined AI Processing & Telemetry collapsible panel
 * - Editable widget grid (remove, reorder, edit titles)
 * - Rich multi-section narrative (findings, recommendations, data notes)
 * - Report export integration with reportService
 * - Glass morphism with premium gradient accents
 * - Smooth motion animations throughout
 * - MCP-validated data accuracy for all counts
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Brain, BarChart3, Zap, Palette, PenTool, DollarSign, AlertTriangle,
  ClipboardList, MapPin, TrendingUp, AlertCircle, School, FolderOpen,
  Timer, Type, Bot, Lightbulb, Search, X, XCircle, Check, ArrowRight,
  LayoutGrid, PieChartIcon, Activity, Map,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Sector,
  AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  RadialBarChart, RadialBar,
  ScatterChart, Scatter,
  ComposedChart, Line,
  Legend,
} from 'recharts';
import nlpDashboardService from '../services/nlpDashboardService';
import type {
  DashboardSpec, WidgetData, WidgetConfig, WidgetFilter,
  AIReasoningStep, AIDashboardResponseType,
} from '../services/nlpDashboardService';
import { useApp } from '../context/AppContext';
import type { WorkOrder } from '../types/infrastructure';

/* ═══════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════ */

interface NLPDashboardBuilderProps {
  workOrders: WorkOrder[];
  isVisible: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

interface AgentPhase {
  id: string;
  agent: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'running' | 'complete' | 'error';
  durationMs: number;
  tokens?: number;
  detail?: string;
}

interface TelemetryData {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  totalDurationMs: number;
  model: string;
  agentCount: number;
  ciChartsGenerated: number;
}

interface ExecSummary {
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  totalCost: number;
  schoolRiskCount: number;
  openCount: number;
  openRatio: number;
  topIssueType: string;
  topIssueCount: number;
  avgCost: number;
  keyFindings: string[];
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  severityCounts: Record<string, number>;
  typeCounts: Record<string, number>;
}

interface NarrativeSections {
  overview: string;
  findings: string[];
  recommendations: string[];
  dataNote: string;
}

/* ═══════════════════════════════════════════════
   Color Palettes
   ═══════════════════════════════════════════════ */

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e',
};
const TYPE_COLORS: Record<string, string> = {
  pothole: '#f59e0b', sidewalk: '#6366f1', concrete: '#ec4899',
};
const STATUS_COLORS: Record<string, string> = {
  open: '#ef4444', assigned: '#f59e0b', in_progress: '#3b82f6',
  completed: '#22c55e', deferred: '#6b7280',
};
const CHART_PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#22c55e',
  '#3b82f6', '#a855f7', '#14b8a6', '#f43f5e',
];

function getColorForKey(key: string, index: number): string {
  return SEVERITY_COLORS[key] || TYPE_COLORS[key] || STATUS_COLORS[key]
    || CHART_PALETTE[index % CHART_PALETTE.length];
}

/* ═══════════════════════════════════════════════
   Agent Pipeline Configuration
   ═══════════════════════════════════════════════ */

const AGENT_PHASES: Omit<AgentPhase, 'status' | 'durationMs'>[] = [
  { id: 'reasoning',   agent: 'Reasoning Agent',        label: 'Intent Parsing & Planning',    icon: <Brain size={16} /> },
  { id: 'analysis',    agent: 'Analysis Agent',         label: 'Data Filtering & Metrics',     icon: <BarChart3 size={16} /> },
  { id: 'code-interp', agent: 'Code Interpreter',       label: 'Python Execution & Charts',    icon: <Zap size={16} /> },
  { id: 'chart-gen',   agent: 'Chart Generation Agent', label: 'Visualization Refinement',     icon: <Palette size={16} /> },
  { id: 'narrative',   agent: 'Narrative Agent',        label: 'AI Insights & Summary',        icon: <PenTool size={16} /> },
];

const QUICK_TEMPLATES = [
  { label: 'Full Overview', icon: <BarChart3 size={22} />, prompt: 'Complete infrastructure overview with severity, cost, status, and trend analysis' },
  { label: 'Budget Analysis', icon: <DollarSign size={22} />, prompt: 'Budget breakdown dashboard showing cost by issue type, severity, and zone with total estimates' },
  { label: 'Safety Report', icon: <AlertTriangle size={22} />, prompt: 'Safety dashboard focusing on critical issues near schools with severity analysis' },
  { label: 'Status Tracker', icon: <ClipboardList size={22} />, prompt: 'Work order status overview showing open, assigned, in progress, and completed with trend' },
  { label: 'Zone Analysis', icon: <MapPin size={22} />, prompt: 'Geographic breakdown of issues by zone with severity distribution per area' },
  { label: 'Trend & Forecast', icon: <TrendingUp size={22} />, prompt: 'Monthly trend analysis with forecast projection and severity trends over time' },
];

/* ═══════════════════════════════════════════════
   Utility Hooks & Helper Functions
   ═══════════════════════════════════════════════ */

function useAnimatedCounter(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    let frame: number;
    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function computeExecSummary(workOrders: WorkOrder[]): ExecSummary {
  const criticalCount = workOrders.filter(w => w.severity === 'critical').length;
  const highCount = workOrders.filter(w => w.severity === 'high').length;
  const totalCost = workOrders.reduce((s, w) => s + w.estimatedCost, 0);
  const schoolRiskCount = workOrders.filter(w => w.nearSchool).length;
  const openCount = workOrders.filter(w => w.status === 'open').length;
  const openRatio = workOrders.length > 0 ? openCount / workOrders.length : 0;

  const typeCounts: Record<string, number> = {};
  workOrders.forEach(w => { typeCounts[w.issueType] = (typeCounts[w.issueType] || 0) + 1; });
  const topEntry = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  const severityCounts: Record<string, number> = {};
  ['critical', 'high', 'medium', 'low'].forEach(s => {
    severityCounts[s] = workOrders.filter(w => w.severity === s).length;
  });

  const keyFindings: string[] = [];
  if (criticalCount > 0) keyFindings.push(`${criticalCount} critical issues require immediate attention`);
  if (highCount > 0) keyFindings.push(`${highCount} high-severity issues should be scheduled within 30 days`);
  if (schoolRiskCount > 0) keyFindings.push(`${schoolRiskCount} issues near school zones pose safety risks`);
  if (totalCost > 100000) keyFindings.push(`Total repair backlog exceeds $${(totalCost / 1000).toFixed(0)}K`);
  if (topEntry) keyFindings.push(`${topEntry[0]} is the most prevalent type (${topEntry[1]} occurrences)`);
  if (openRatio > 0.3) keyFindings.push(`${(openRatio * 100).toFixed(0)}% of issues remain open`);

  let riskLevel: ExecSummary['riskLevel'] = 'low';
  if (criticalCount > 10 || openRatio > 0.7) riskLevel = 'critical';
  else if (criticalCount > 5 || openRatio > 0.5) riskLevel = 'high';
  else if (criticalCount > 0 || openRatio > 0.3) riskLevel = 'moderate';

  return {
    totalIssues: workOrders.length,
    criticalCount, highCount, totalCost,
    schoolRiskCount, openCount, openRatio,
    topIssueType: topEntry?.[0] || 'N/A',
    topIssueCount: topEntry?.[1] || 0,
    avgCost: workOrders.length > 0 ? totalCost / workOrders.length : 0,
    keyFindings, riskLevel, severityCounts, typeCounts,
  };
}

function generateAccurateNarrative(
  workOrders: WorkOrder[],
  prompt: string,
  spec: DashboardSpec | null,
): NarrativeSections {
  const total = workOrders.length;
  const critical = workOrders.filter(w => w.severity === 'critical').length;
  const high = workOrders.filter(w => w.severity === 'high').length;
  const totalCost = workOrders.reduce((s, w) => s + w.estimatedCost, 0);
  const schoolCount = workOrders.filter(w => w.nearSchool).length;
  const openCount = workOrders.filter(w => w.status === 'open').length;
  const completedCount = workOrders.filter(w => w.status === 'completed').length;

  const typeCounts: Record<string, number> = {};
  workOrders.forEach(w => { typeCounts[w.issueType] = (typeCounts[w.issueType] || 0) + 1; });
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  const zoneCounts: Record<string, number> = {};
  workOrders.forEach(w => { zoneCounts[w.zone] = (zoneCounts[w.zone] || 0) + 1; });
  const topZone = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0];

  const overview = `Comprehensive analysis of **${total}** infrastructure records from the Lake Forest MCP data source. ` +
    `The estimated total repair backlog is **$${(totalCost / 1000).toFixed(1)}K** with ` +
    `**${critical + high}** high-priority items requiring attention. ` +
    `Currently **${openCount}** issues are open and **${completedCount}** have been completed` +
    (spec ? `. Dashboard generated for: "${spec.prompt}".` : '.');

  const findings: string[] = [];
  if (critical > 0) findings.push(`**${critical}** critical-severity issues need immediate remediation — estimated cost $${(workOrders.filter(w => w.severity === 'critical').reduce((s, w) => s + w.estimatedCost, 0) / 1000).toFixed(0)}K`);
  if (high > 0) findings.push(`**${high}** high-severity issues should be scheduled within 30 days`);
  if (schoolCount > 0) findings.push(`**${schoolCount}** issue${schoolCount !== 1 ? 's' : ''} within school zones — prioritize for child safety`);
  if (topType) findings.push(`**${topType[0]}** accounts for ${((topType[1] / total) * 100).toFixed(0)}% of issues (${topType[1]} of ${total})`);
  if (topZone) findings.push(`**${topZone[0]}** is the most affected zone with ${topZone[1]} reported issues`);
  findings.push(`Average repair cost per issue: **$${(totalCost / Math.max(total, 1)).toFixed(0)}**`);
  const compRate = total > 0 ? ((completedCount / total) * 100).toFixed(0) : '0';
  findings.push(`Completion rate: **${compRate}%** (${completedCount} of ${total})`);

  const recommendations: string[] = [];
  if (critical > 3) recommendations.push('Deploy emergency response crews to address critical backlog immediately');
  if (schoolCount > 5) recommendations.push('Prioritize all school zone repairs before the next academic semester');
  if (totalCost > 200000) recommendations.push('Request supplemental budget allocation — current backlog exceeds $200K');
  if (openCount > total * 0.5) recommendations.push('Increase crew capacity or overtime to reduce the open issue ratio');
  if (topType && topType[1] > total * 0.4) recommendations.push(`Investigate root cause of high ${topType[0]} concentration`);
  recommendations.push('Implement preventive maintenance schedule for high-density zones');
  recommendations.push('Enable real-time field reporting to accelerate response times');

  const dataNote = `Data sourced from Lake Forest MCP infrastructure server • ` +
    `${total} total records • Last synced: ${new Date().toLocaleDateString()} • ` +
    `Widgets: ${spec?.widgets.length || 0} generated`;

  return { overview, findings, recommendations, dataNote };
}

function getMonthlySparkData(workOrders: WorkOrder[], filterFn?: (wo: WorkOrder) => boolean): number[] {
  const filtered = filterFn ? workOrders.filter(filterFn) : workOrders;
  const monthly: Record<string, number> = {};
  filtered.forEach(wo => {
    const d = new Date(wo.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = (monthly[key] || 0) + 1;
  });
  return Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

/* ═══════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════ */

const NLPDashboardBuilder: React.FC<NLPDashboardBuilderProps> = ({
  workOrders, isVisible, onClose, theme = 'dark',
}) => {
  const { openOverlay } = useApp();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [dashboardSpec, setDashboardSpec] = useState<DashboardSpec | null>(null);
  const [widgetData, setWidgetData] = useState<WidgetData[]>([]);
  const [history, setHistory] = useState<DashboardSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState<AIReasoningStep[]>([]);
  const [aiMetadata, setAiMetadata] = useState<AIDashboardResponseType['metadata'] | null>(null);
  const [agentPhases, setAgentPhases] = useState<AgentPhase[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [aiPanelExpanded, setAiPanelExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const startTimeRef = useRef<number>(0);
  const pipelineTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const isDark = theme === 'dark';

  // Computed values
  const execSummary = useMemo(() => computeExecSummary(workOrders), [workOrders]);
  const narrativeSections = useMemo(
    () => dashboardSpec ? generateAccurateNarrative(workOrders, dashboardSpec.prompt, dashboardSpec) : null,
    [workOrders, dashboardSpec],
  );

  // ── Focus input on open ──
  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isVisible]);

  // ── Simulate agent pipeline phases ──
  const simulateAgentPipeline = useCallback(() => {
    // Clear any existing timers
    pipelineTimersRef.current.forEach(t => clearTimeout(t));
    pipelineTimersRef.current = [];

    const phases: AgentPhase[] = AGENT_PHASES.map(p => ({
      ...p, status: 'pending' as const, durationMs: 0,
    }));
    setAgentPhases(phases);

    // Faster timings that align better with real API latency
    const timings = [0, 1200, 3200, 5800, 8200];
    const durations = [1100, 1900, 2500, 2300, 2400];
    const detailMessages = [
      'Analyzing your prompt to understand intent, identifying required data dimensions and chart types...',
      `Querying ${workOrders.length} infrastructure records — computing severity, cost, status, and trend metrics...`,
      'Running Python analysis cells — generating statistical breakdowns and matplotlib visualizations...',
      'Refining chart palettes, responsive grid layout, and glass-morphism styling for each widget...',
      'Composing executive summary with key findings, risk assessment, and actionable recommendations...',
    ];

    timings.forEach((delay, i) => {
      const t1 = setTimeout(() => {
        setAgentPhases(prev => prev.map((p, j) =>
          j === i ? { ...p, status: 'running' as const } : p
        ));
      }, delay);
      pipelineTimersRef.current.push(t1);

      const t2 = setTimeout(() => {
        const tokens = [120, 340, 890, 210, 450][i];
        setAgentPhases(prev => prev.map((p, j) =>
          j === i ? {
            ...p, status: 'complete' as const, durationMs: durations[i], tokens,
            detail: detailMessages[i],
          } : p
        ));
      }, delay + durations[i]);
      pipelineTimersRef.current.push(t2);
    });
  }, [workOrders.length]);

  // ── Generate Dashboard ──
  const handleGenerate = useCallback(async (customPrompt?: string) => {
    const text = customPrompt || prompt.trim();
    if (!text) return;

    setIsGenerating(true);
    setError(null);
    setReasoning([]);
    setAiMetadata(null);
    setTelemetry(null);
    setEditMode(false);
    startTimeRef.current = performance.now();
    simulateAgentPipeline();

    try {
      const spec = await nlpDashboardService.generateDashboard(text, workOrders);
      const elapsed = Math.round(performance.now() - startTimeRef.current);
      setDashboardSpec(spec);

      const aiSpec = spec as DashboardSpec & {
        _aiResponse?: AIDashboardResponseType;
        _widgetData?: WidgetData[];
      };

      let meta: AIDashboardResponseType['metadata'] | null = null;
      let finalData: WidgetData[];

      if (aiSpec._aiResponse) {
        console.log('[NLPDash] AI response present, metadata:', aiSpec._aiResponse.metadata);
        // AI provided spec — always recompute data locally for accuracy.
        // The AI spec gives us layout, titles, and ordering; data comes from local workOrders.
        const aiData = aiSpec._widgetData || [];
        finalData = aiData
          .filter(wd => wd.widget.type !== 'narrative') // Remove narrative widgets from dashboard
          .map(wd => {
            const hasChart = !!wd.chart_base64;

            // For code-interpreter-chart with no base64 image, resolve to local interactive chart
            if (wd.widget.type === 'code-interpreter-chart' && !hasChart) {
              const resolved = nlpDashboardService.resolveCodeInterpreterWidget(wd.widget, workOrders);
              return { ...resolved, insight: wd.insight || resolved.insight, source: wd.source };
            }

            // For all other widgets, correct the metric from title and recompute locally
            const correctedMetric = nlpDashboardService.inferCorrectMetric(wd.widget);
            const correctedWidget = { ...wd.widget, metric: correctedMetric };
            const localData = nlpDashboardService.computeWidgetData(correctedWidget, workOrders);
            return {
              ...localData,
              insight: wd.insight || localData.insight,
              source: wd.source,
              chart_base64: hasChart ? wd.chart_base64 : undefined,
            };
          });
        setReasoning(aiSpec._aiResponse.reasoning || []);
        meta = aiSpec._aiResponse.metadata || null;
        setAiMetadata(meta);
      } else {
        console.log('[NLPDash] No _aiResponse — fell back to local. spec keys:', Object.keys(spec));
        finalData = nlpDashboardService.computeAllWidgets(spec, workOrders);
      }

      // Filter out narrative widgets from dashboard view
      finalData = finalData.filter(wd => wd.widget.type !== 'narrative');

      setWidgetData(finalData);

      // Build telemetry — use real token counts from the AI agent when available
      // Use ?? (nullish coalescing) so 0 is treated as a valid value, not a fallback trigger
      console.log('[NLPDash] Building telemetry. meta:', meta);
      const totalTokens = meta?.total_tokens ?? (meta ? Math.round(meta.processing_time_ms / 2) : 0);
      const promptTok = meta?.prompt_tokens ?? Math.round(totalTokens * 0.35);
      const completionTok = meta?.completion_tokens ?? (totalTokens - promptTok);
      // GPT-4.1 mini pricing — must match AgentTraceViewer ($0.40/1M input, $1.60/1M output)
      const costPerMInput = 0.40;
      const costPerMOutput = 1.60;
      const estimatedCost = (promptTok / 1_000_000) * costPerMInput + (completionTok / 1_000_000) * costPerMOutput;

      const telemetryFromMeta: TelemetryData = {
        totalTokens, promptTokens: promptTok, completionTokens: completionTok, estimatedCost,
        totalDurationMs: meta?.processing_time_ms ?? elapsed,
        model: meta?.model || 'gpt-4.1-mini',
        agentCount: 5,
        ciChartsGenerated: meta?.code_interpreter_charts ?? 0,
      };
      console.log('[NLPDash] Initial telemetry:', telemetryFromMeta);
      setTelemetry(telemetryFromMeta);

      // Reconcile with real trace data from the agent backend
      // This ensures CombinedAIPanel shows the same numbers as AgentTraceViewer
      const agentApiUrl = process.env.REACT_APP_AGENT_API_URL || '';
      if (agentApiUrl) {
        try {
          console.log('[NLPDash] Fetching traces for reconciliation...');
          const traceResp = await fetch(`${agentApiUrl}/api/traces?limit=10`, { signal: AbortSignal.timeout(8000) });
          if (traceResp.ok) {
            const traces = await traceResp.json();
            console.log('[NLPDash] Traces received:', traces.length, 'entries. NLP traces:', 
              traces.filter((t: any) => t.span?.includes('nlp') || t.attributes?.['infrawatch.agent.name'] === 'nlp-dashboard').map((t: any) => ({
                span: t.span, agent: t.attributes?.['infrawatch.agent.name'],
                hasResponse: !!t.responseInfo, hasTokens: !!t.responseInfo?.tokensUsed,
                tokens: t.responseInfo?.tokensUsed, model: t.responseInfo?.model,
                durationMs: t.durationMs,
              }))
            );
            const nlpTrace = traces.find((t: any) =>
              (t.attributes?.['infrawatch.agent.name'] === 'nlp-dashboard' ||
               t.span === 'agent.nlp_dashboard') &&
              t.responseInfo?.tokensUsed
            );
            if (nlpTrace?.responseInfo?.tokensUsed) {
              const tu = nlpTrace.responseInfo.tokensUsed;
              const traceModel = nlpTrace.responseInfo.model || telemetryFromMeta.model;
              const traceCost = (tu.prompt / 1_000_000) * costPerMInput + (tu.completion / 1_000_000) * costPerMOutput;
              console.log('[NLPDash] Reconciling with trace data:', { prompt: tu.prompt, completion: tu.completion, total: tu.total, model: traceModel, cost: traceCost });
              setTelemetry(prev => prev ? {
                ...prev,
                totalTokens: tu.total || (tu.prompt + tu.completion),
                promptTokens: tu.prompt,
                completionTokens: tu.completion,
                estimatedCost: traceCost,
                model: traceModel,
                totalDurationMs: nlpTrace.durationMs || prev.totalDurationMs,
              } : prev);
            } else {
              console.warn('[NLPDash] No NLP trace with tokensUsed found in recent traces');
            }
          } else {
            console.warn('[NLPDash] Trace fetch failed:', traceResp.status);
          }
        } catch (traceErr) {
          console.warn('[NLPDash] Trace reconciliation error:', traceErr);
        }
      } else {
        console.warn('[NLPDash] No AGENT_API_URL — skipping trace reconciliation');
      }

      // Clear stale pipeline timers, then mark all phases complete with real token distribution
      pipelineTimersRef.current.forEach(t => clearTimeout(t));
      pipelineTimersRef.current = [];
      // Distribute real total tokens proportionally across 5 pipeline phases
      const tokenWeights = [0.06, 0.17, 0.44, 0.10, 0.23]; // intent, analysis, code-interp, chart-gen, narrative
      setAgentPhases(prev => prev.map((p, i) => ({
        ...p, status: 'complete' as const, durationMs: p.durationMs || 1000,
        tokens: Math.round(totalTokens * (tokenWeights[i] ?? 0.2)),
      })));
      setHistory(prev => [spec, ...prev.slice(0, 9)]);
      setPromptCollapsed(true);
    } catch (err) {
      pipelineTimersRef.current.forEach(t => clearTimeout(t));
      pipelineTimersRef.current = [];
      setError(err instanceof Error ? err.message : 'Failed to generate dashboard');
      setAgentPhases(prev => prev.map(p =>
        p.status === 'running' ? { ...p, status: 'error' } : p
      ));
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, workOrders, simulateAgentPipeline]);

  // ── Edit mode handlers ──
  const handleRemoveWidget = useCallback((widgetId: string) => {
    setWidgetData(prev => prev.filter(wd => wd.widget.id !== widgetId));
  }, []);

  const handleMoveWidget = useCallback((widgetId: string, direction: 'up' | 'down') => {
    setWidgetData(prev => {
      const idx = prev.findIndex(wd => wd.widget.id === widgetId);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }, []);

  // ── Report export — open the full Report Generator overlay ──
  const handleExportReport = useCallback(() => {
    onClose();                 // close NLP Dashboard
    openOverlay('report');     // open the rich Report Generator
  }, [onClose, openOverlay]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
  }, [handleGenerate]);

  const handlePrint = useCallback(() => window.print(), []);

  if (!isVisible) return null;

  return (
    <div className={`nlpdb-overlay ${isDark ? 'nlpdb-dark' : 'nlpdb-light'}`}>
      {/* ── Header ── */}
      <header className="nlpdb-header">
        <div className="nlpdb-header-left">
          <div className="nlpdb-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#nlpdb-grad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <defs><linearGradient id="nlpdb-grad" x1="2" y1="2" x2="22" y2="22"><stop stopColor="#818cf8"/><stop offset="1" stopColor="#c084fc"/></linearGradient></defs>
            </svg>
          </div>
          <div>
            <h2 className="nlpdb-title">AI Dashboard Builder</h2>
            <p className="nlpdb-subtitle">Multi-agent reasoning • {workOrders.length} MCP records • Azure Foundry • <span style={{opacity:0.45,fontSize:'0.7em'}}>b20260302</span></p>
          </div>
        </div>
        <div className="nlpdb-header-actions">
          {dashboardSpec && (
            <>
              <button
                className={`nlpdb-btn-ghost ${editMode ? 'nlpdb-btn-active' : ''}`}
                onClick={() => setEditMode(!editMode)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                {editMode ? 'Done Editing' : 'Edit'}
              </button>
              <button className="nlpdb-btn-ghost" onClick={handleExportReport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                Export Report
              </button>
              <button className="nlpdb-btn-ghost" onClick={handlePrint}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg>
                Print
              </button>
            </>
          )}
          <button className="nlpdb-btn-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </header>

      {/* ── Prompt Bar (collapsible after generation) ── */}
      {promptCollapsed && dashboardSpec ? (
        <div className="nlpdb-prompt-collapsed">
          <span className="nlpdb-prompt-collapsed-query" title={prompt}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {prompt.length > 80 ? prompt.slice(0, 80) + '…' : prompt}
          </span>
          <div className="nlpdb-prompt-collapsed-actions">
            <button className="nlpdb-btn-ghost nlpdb-btn-sm" onClick={() => setPromptCollapsed(false)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Query
            </button>
            <button className="nlpdb-btn-ghost nlpdb-btn-sm" onClick={() => { setDashboardSpec(null); setWidgetData([]); setPrompt(''); setPromptCollapsed(false); setError(null); }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="nlpdb-prompt-bar">
          <div className="nlpdb-prompt-inner">
            <div className={`nlpdb-prompt-input-wrap ${isGenerating ? 'nlpdb-active' : ''}`}>
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Try: "Show me a budget breakdown for critical potholes near schools"'
                rows={2}
                className="nlpdb-prompt-input"
              />
              <span className="nlpdb-prompt-hint">Press Enter to generate • Shift+Enter for new line</span>
            </div>
            <button
              className="nlpdb-generate-btn"
              onClick={() => handleGenerate()}
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? (
                <><span className="nlpdb-spinner" /> Generating...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Generate
                </>
              )}
            </button>
          </div>
          <div className="nlpdb-suggestions">
            {nlpDashboardService.PROMPT_SUGGESTIONS.slice(0, 5).map((s, i) => (
              <button key={i} className="nlpdb-chip" onClick={() => { setPrompt(s); handleGenerate(s); }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="nlpdb-content">
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="nlpdb-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {error}
          </motion.div>
        )}

        {/* ── Empty State ── */}
        {!dashboardSpec && !isGenerating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="nlpdb-empty">
            {/* Data overview at top */}
            <DataOverviewStrip summary={execSummary} isDark={isDark} />

            <div className="nlpdb-empty-icon">
              <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="38" stroke="url(#emptyGrad)" strokeWidth="2" strokeDasharray="6 4" opacity="0.5"/>
                <path d="M28 48l12-16 12 16M24 56h32" stroke="url(#emptyGrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="52" cy="28" r="6" stroke="url(#emptyGrad)" strokeWidth="2"/>
                <defs><linearGradient id="emptyGrad" x1="10" y1="10" x2="70" y2="70"><stop stopColor="#818cf8"/><stop offset="1" stopColor="#c084fc"/></linearGradient></defs>
              </svg>
            </div>
            <h2 className="nlpdb-empty-title">AI-Powered Dashboard Builder</h2>
            <p className="nlpdb-empty-desc">
              Describe what you want to see in plain English. A multi-agent pipeline
              analyzes your <strong>{workOrders.length}</strong> infrastructure records
              using Azure Foundry + Code Interpreter to generate interactive visualizations.
            </p>

            {/* Quick Templates */}
            <div className="nlpdb-template-grid">
              {QUICK_TEMPLATES.map((t, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                  className="nlpdb-template-card"
                  onClick={() => { setPrompt(t.prompt); handleGenerate(t.prompt); }}
                >
                  <span className="nlpdb-template-icon">{t.icon}</span>
                  <span className="nlpdb-template-label">{t.label}</span>
                </motion.button>
              ))}
            </div>

            {/* Agent showcase */}
            <div className="nlpdb-agent-showcase">
              {AGENT_PHASES.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="nlpdb-agent-card"
                >
                  <span className="nlpdb-agent-card-icon">{a.icon}</span>
                  <span className="nlpdb-agent-card-name">{a.agent}</span>
                  <span className="nlpdb-agent-card-label">{a.label}</span>
                </motion.div>
              ))}
            </div>

            {/* Suggestion grid */}
            <div className="nlpdb-suggestion-grid">
              {nlpDashboardService.PROMPT_SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.04 }}
                  className="nlpdb-suggestion-card"
                  onClick={() => { setPrompt(s); handleGenerate(s); }}
                >
                  <span className="nlpdb-suggestion-arrow"><ArrowRight size={14} /></span>
                  {s}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Generating State — Agent Pipeline over Skeleton Background ── */}
        {isGenerating && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="nlpdb-generating">
            {/* Skeleton sits behind as dimmed background preview */}
            <div className="nlpdb-generating-skeleton-bg">
              <SkeletonDashboard />
            </div>
            {/* Pipeline floats centered on top */}
            <div className="nlpdb-generating-pipeline-fg">
              <AgentPipelineVisualizer phases={agentPhases} isDark={isDark} />
            </div>
          </motion.div>
        )}

        {/* ── Generated Dashboard ── */}
        {dashboardSpec && !isGenerating && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="nlpdb-dashboard">

            {/* Executive Summary Banner */}
            <ExecutiveSummaryBanner
              spec={dashboardSpec}
              summary={execSummary}
              isDark={isDark}
              metadata={aiMetadata}
            />

            {/* Quick Stats Strip */}
            <QuickStatsStrip workOrders={workOrders} isDark={isDark} summary={execSummary} />

            {/* Combined AI Processing & Telemetry Panel */}
            {telemetry && (
              <CombinedAIPanel
                telemetry={telemetry}
                phases={agentPhases}
                reasoning={reasoning}
                expanded={aiPanelExpanded}
                onToggle={() => setAiPanelExpanded(!aiPanelExpanded)}
                isDark={isDark}
              />
            )}

            {/* Tabbed Widget View */}
            <TabbedWidgetView
              widgetData={widgetData}
              isDark={isDark}
              editMode={editMode}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onRemoveWidget={handleRemoveWidget}
              onMoveWidget={handleMoveWidget}
            />
          </motion.div>
        )}

        {/* ── History ── */}
        {history.length > 1 && !isGenerating && (
          <div className="nlpdb-history">
            <h4 className="nlpdb-history-title">Previous Dashboards</h4>
            <div className="nlpdb-history-list">
              {history.slice(1).map((h, i) => (
                <button
                  key={i}
                  className="nlpdb-history-item"
                  onClick={() => {
                    setDashboardSpec(h);
                    setWidgetData(nlpDashboardService.computeAllWidgets(h, workOrders));
                    setPrompt(h.prompt);
                  }}
                >
                  {h.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Data Overview Strip (Empty State)
   ═══════════════════════════════════════════════ */

const DataOverviewStrip: React.FC<{
  summary: ExecSummary; isDark: boolean;
}> = ({ summary, isDark }) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
    className="nlpdb-data-overview"
  >
    <span className="nlpdb-data-overview-tag">MCP Data Loaded</span>
    <div className="nlpdb-data-items">
      <span className="nlpdb-data-item">
        <strong>{summary.totalIssues}</strong> Records
      </span>
      <span className="nlpdb-data-divider">•</span>
      <span className="nlpdb-data-item" style={{ color: '#ef4444' }}>
        <strong>{summary.criticalCount}</strong> Critical
      </span>
      <span className="nlpdb-data-divider">•</span>
      <span className="nlpdb-data-item" style={{ color: '#22c55e' }}>
        <strong>${(summary.totalCost / 1000).toFixed(0)}K</strong> Total Cost
      </span>
      <span className="nlpdb-data-divider">•</span>
      <span className="nlpdb-data-item" style={{ color: '#ec4899' }}>
        <strong>{summary.schoolRiskCount}</strong> Near Schools
      </span>
      <span className="nlpdb-data-divider">•</span>
      <span className="nlpdb-data-item">
        Risk: <span className={`nlpdb-risk-${summary.riskLevel}`}>{summary.riskLevel.toUpperCase()}</span>
      </span>
    </div>
  </motion.div>
);

/* ═══════════════════════════════════════════════
   Executive Summary Banner
   ═══════════════════════════════════════════════ */

const ExecutiveSummaryBanner: React.FC<{
  spec: DashboardSpec;
  summary: ExecSummary;
  isDark: boolean;
  metadata: AIDashboardResponseType['metadata'] | null;
}> = ({ spec, summary, isDark, metadata }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
    className="nlpdb-exec-banner"
  >
    <div className="nlpdb-exec-top">
      <div className="nlpdb-exec-title-area">
        <h2 className="nlpdb-exec-title">{spec.title}</h2>
        <p className="nlpdb-exec-desc">{spec.description}</p>
        <div className="nlpdb-exec-tags">
          {metadata?.ai_powered && <span className="nlpdb-badge nlpdb-badge-ai">AI-Powered</span>}
          {metadata?.code_interpreter_used && <span className="nlpdb-badge nlpdb-badge-ci"><Zap size={12} /> Code Interpreter</span>}
          <span className="nlpdb-badge nlpdb-badge-foundry">Azure Foundry</span>
          <span className="nlpdb-badge nlpdb-badge-mcp">MCP Data</span>
          <span className="nlpdb-exec-date">{new Date(spec.generatedAt).toLocaleString()}</span>
        </div>
      </div>
      <div className="nlpdb-exec-risk">
        <RiskIndicator level={summary.riskLevel} />
      </div>
    </div>
    {/* Key metrics row */}
    <div className="nlpdb-exec-metrics">
      <ExecMetricCard label="Total Issues" value={summary.totalIssues} color="#818cf8" icon={<ClipboardList size={18} />} />
      <ExecMetricCard label="Critical + High" value={summary.criticalCount + summary.highCount} color="#ef4444" icon={<AlertCircle size={18} />} />
      <ExecMetricCard label="Total Cost" value={summary.totalCost} isCurrency color="#f59e0b" icon={<DollarSign size={18} />} />
      <ExecMetricCard label="Near Schools" value={summary.schoolRiskCount} color="#ec4899" icon={<School size={18} />} />
      <ExecMetricCard label="Open Issues" value={summary.openCount} color="#3b82f6" icon={<FolderOpen size={18} />} />
      <ExecMetricCard label="Avg Cost" value={summary.avgCost} isCurrency color="#22c55e" icon={<BarChart3 size={18} />} />
    </div>
    {/* Key findings */}
    {summary.keyFindings.length > 0 && (
      <div className="nlpdb-exec-findings">
        <h4 className="nlpdb-exec-findings-title">Key Findings</h4>
        <div className="nlpdb-exec-findings-list">
          {summary.keyFindings.slice(0, 4).map((f, i) => (
            <div key={i} className="nlpdb-exec-finding">
              <span className="nlpdb-exec-finding-dot" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
              {f}
            </div>
          ))}
        </div>
      </div>
    )}
  </motion.div>
);

const ExecMetricCard: React.FC<{
  label: string; value: number; color: string; icon: React.ReactNode; isCurrency?: boolean;
}> = ({ label, value, color, icon, isCurrency }) => {
  const displayed = useAnimatedCounter(value);
  const formatted = isCurrency
    ? `$${displayed >= 1000 ? (displayed / 1000).toFixed(0) + 'K' : displayed.toLocaleString()}`
    : displayed.toLocaleString();
  return (
    <div className="nlpdb-exec-metric">
      <span className="nlpdb-exec-metric-icon">{icon}</span>
      <div className="nlpdb-exec-metric-value" style={{ color }}>{formatted}</div>
      <div className="nlpdb-exec-metric-label">{label}</div>
    </div>
  );
};

const RiskIndicator: React.FC<{ level: ExecSummary['riskLevel'] }> = ({ level }) => {
  const colors = { low: '#22c55e', moderate: '#f59e0b', high: '#ef4444', critical: '#dc2626' };
  const angles = { low: 45, moderate: 90, high: 135, critical: 170 };
  const radius = 36;
  const circumference = Math.PI * radius;
  const pct = angles[level] / 180;
  const offset = circumference - circumference * pct;
  return (
    <div className="nlpdb-risk-indicator">
      <svg viewBox="0 0 80 48" width="100" height="60">
        <path d="M 4 44 A 36 36 0 0 1 76 44" fill="none" stroke="currentColor" strokeWidth="5" className="nlpdb-risk-track" />
        <path d="M 4 44 A 36 36 0 0 1 76 44" fill="none" stroke={colors[level]} strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="nlpdb-risk-label" style={{ color: colors[level] }}>
        {level.toUpperCase()}
      </div>
      <div className="nlpdb-risk-sub">Risk Level</div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Quick Stats Strip
   ═══════════════════════════════════════════════ */

const QuickStatsStrip: React.FC<{
  workOrders: WorkOrder[]; isDark: boolean; summary: ExecSummary;
}> = ({ workOrders, isDark, summary }) => {
  const sparkAll = useMemo(() => getMonthlySparkData(workOrders), [workOrders]);
  const sparkCritical = useMemo(() => getMonthlySparkData(workOrders, w => w.severity === 'critical'), [workOrders]);
  const sparkOpen = useMemo(() => getMonthlySparkData(workOrders, w => w.status === 'open'), [workOrders]);

  const stats = [
    { label: 'Severity Split', type: 'severity-ring' as const },
    { label: 'Monthly Trend', value: workOrders.length, spark: sparkAll, color: '#818cf8', type: 'spark' as const },
    { label: 'Critical Trend', value: summary.criticalCount, spark: sparkCritical, color: '#ef4444', type: 'spark' as const },
    { label: 'Open Trend', value: summary.openCount, spark: sparkOpen, color: '#3b82f6', type: 'spark' as const },
    { label: 'Type Distribution', type: 'type-bar' as const },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      className="nlpdb-quick-stats"
    >
      {stats.map((s, i) => (
        <div key={i} className="nlpdb-qstat-card">
          {s.type === 'spark' && (
            <>
              <div className="nlpdb-qstat-top">
                <span className="nlpdb-qstat-label">{s.label}</span>
                <span className="nlpdb-qstat-value" style={{ color: s.color }}>{s.value}</span>
              </div>
              <SparklineSVG data={s.spark!} color={s.color!} />
            </>
          )}
          {s.type === 'severity-ring' && (
            <>
              <span className="nlpdb-qstat-label">{s.label}</span>
              <SeverityMiniRing counts={summary.severityCounts} total={summary.totalIssues} />
            </>
          )}
          {s.type === 'type-bar' && (
            <>
              <span className="nlpdb-qstat-label">{s.label}</span>
              <TypeMiniBar counts={summary.typeCounts} total={summary.totalIssues} />
            </>
          )}
        </div>
      ))}
    </motion.div>
  );
};

const SparklineSVG: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (data.length < 2) return <div className="nlpdb-spark-empty">—</div>;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 90, h = 28;
  const points = data.map((v, i) =>
    `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(' ');
  const safeId = color.replace('#', 'sp');
  return (
    <svg width={w} height={h} className="nlpdb-sparkline">
      <defs>
        <linearGradient id={`${safeId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#${safeId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
};

const SeverityMiniRing: React.FC<{ counts: Record<string, number>; total: number }> = ({ counts, total }) => {
  const segs = ['critical', 'high', 'medium', 'low'];
  let rotation = -90;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      {segs.map(sev => {
        const pct = total > 0 ? (counts[sev] || 0) / total : 0;
        if (pct === 0) return null;
        const circumference = 2 * Math.PI * 20;
        const segLen = circumference * pct;
        const el = (
          <circle
            key={sev} cx="26" cy="26" r="20" fill="none"
            stroke={SEVERITY_COLORS[sev]} strokeWidth="5"
            strokeDasharray={`${segLen} ${circumference - segLen}`}
            transform={`rotate(${rotation} 26 26)`}
            strokeLinecap="round"
          />
        );
        rotation += pct * 360;
        return el;
      })}
      <text x="26" y="27" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="currentColor">{total}</text>
    </svg>
  );
};

const TypeMiniBar: React.FC<{ counts: Record<string, number>; total: number }> = ({ counts, total }) => (
  <div className="nlpdb-type-minibar">
    {Object.entries(counts).map(([type, count]) => (
      <div key={type} className="nlpdb-type-minibar-seg"
        style={{ width: `${total > 0 ? (count / total) * 100 : 0}%`, background: TYPE_COLORS[type] || '#6366f1' }}
        title={`${type}: ${count}`}
      />
    ))}
  </div>
);

/* ═══════════════════════════════════════════════
   Combined AI Processing & Telemetry Panel
   ═══════════════════════════════════════════════ */

const CombinedAIPanel: React.FC<{
  telemetry: TelemetryData;
  phases: AgentPhase[];
  reasoning: AIReasoningStep[];
  expanded: boolean;
  onToggle: () => void;
  isDark: boolean;
}> = ({ telemetry, phases, reasoning, expanded, onToggle, isDark }) => {
  const durationDisplay = useAnimatedCounter(Math.round(telemetry.totalDurationMs));
  const tokensDisplay = useAnimatedCounter(telemetry.totalTokens);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="nlpdb-ai-panel"
    >
      {/* Collapsed header strip */}
      <button className="nlpdb-ai-panel-header" onClick={onToggle}>
        <div className="nlpdb-ai-panel-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span className="nlpdb-ai-panel-label">AI Processing & Telemetry</span>
          <span className="nlpdb-ai-panel-badge">{phases.filter(p => p.status === 'complete').length}/{phases.length} agents</span>
        </div>
        <div className="nlpdb-ai-panel-strip">
          <span className="nlpdb-ai-strip-stat"><Timer size={12} /> {(durationDisplay / 1000).toFixed(1)}s</span>
          <span className="nlpdb-ai-strip-stat"><Type size={12} /> {tokensDisplay.toLocaleString()} tokens</span>
          <span className="nlpdb-ai-strip-stat"><DollarSign size={12} /> ${telemetry.estimatedCost.toFixed(4)}</span>
          <span className="nlpdb-ai-strip-stat"><Bot size={12} /> {telemetry.model}</span>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : '', transition: 'transform 0.2s', flexShrink: 0 }}
        ><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {/* Expanded body */}
      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="nlpdb-ai-panel-body">
          {/* Telemetry stats grid */}
          <div className="nlpdb-telemetry-grid">
            <TelemetryStatCard label="Total Duration" value={`${(telemetry.totalDurationMs / 1000).toFixed(1)}s`} icon={<Timer size={20} />} color="#818cf8" />
            <TelemetryStatCard label="Total Tokens" value={telemetry.totalTokens.toLocaleString()} icon={<Type size={20} />} color="#f59e0b"
              sub={`${telemetry.promptTokens} prompt / ${telemetry.completionTokens} completion`} />
            <TelemetryStatCard label="Estimated Cost" value={`$${telemetry.estimatedCost.toFixed(4)}`} icon={<DollarSign size={20} />} color="#22c55e"
              sub={`Based on ${telemetry.model} pricing`} />
            <TelemetryStatCard label="Agents Used" value={String(telemetry.agentCount)} icon={<Bot size={20} />} color="#ec4899"
              sub={`${telemetry.ciChartsGenerated} Code Interpreter charts`} />
          </div>

          {/* Token breakdown bar */}
          <div className="nlpdb-token-bar-wrap">
            <div className="nlpdb-token-bar">
              <div className="nlpdb-token-seg" style={{ width: '35%', background: 'rgba(129,140,248,0.6)' }} />
              <div className="nlpdb-token-seg" style={{ width: '45%', background: 'rgba(192,132,252,0.6)' }} />
              <div className="nlpdb-token-seg" style={{ width: '20%', background: 'rgba(34,197,94,0.4)' }} />
            </div>
            <div className="nlpdb-token-legend">
              <span><span className="nlpdb-dot" style={{ background: '#818cf8' }} />Prompt</span>
              <span><span className="nlpdb-dot" style={{ background: '#c084fc' }} />Completion</span>
              <span><span className="nlpdb-dot" style={{ background: '#22c55e' }} />Code Interpreter</span>
            </div>
          </div>

          {/* Agent pipeline timeline */}
          <div className="nlpdb-ai-timeline">
            <h5 className="nlpdb-ai-timeline-title">Agent Pipeline</h5>
            <div className="nlpdb-ai-timeline-nodes">
              {phases.map((phase, i) => (
                <div key={phase.id} className={`nlpdb-ai-timeline-node nlpdb-phase-${phase.status}`}>
                  <div className="nlpdb-ai-timeline-icon">
                    {phase.status === 'complete' ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : phase.status === 'error' ? <XCircle size={14} /> : (
                      <span className="nlpdb-ai-timeline-num">{i + 1}</span>
                    )}
                  </div>
                  <div className="nlpdb-ai-timeline-body">
                    <span className="nlpdb-ai-timeline-agent">{phase.icon} {phase.agent}</span>
                    {phase.detail && <span className="nlpdb-ai-timeline-detail">{phase.detail}</span>}
                    <span className="nlpdb-ai-timeline-meta">
                      {phase.durationMs > 0 && <span>{(phase.durationMs / 1000).toFixed(1)}s</span>}
                      {phase.tokens ? <span>{phase.tokens} tokens</span> : null}
                    </span>
                  </div>
                  {i < phases.length - 1 && <div className="nlpdb-ai-timeline-connector" />}
                </div>
              ))}
            </div>
          </div>

          {/* AI Reasoning Trace */}
          {reasoning.length > 0 && (
            <div className="nlpdb-ai-reasoning">
              <h5 className="nlpdb-ai-reasoning-title">AI Reasoning Trace</h5>
              {reasoning.map((r, i) => (
                <div key={i} className={`nlpdb-ai-reasoning-step nlpdb-rstep-${r.status}`}>
                  <div className="nlpdb-ai-reasoning-icon">
                    {r.status === 'complete' ? <Check size={12} /> : r.status === 'fallback' ? '!' : r.step}
                  </div>
                  <div>
                    <div className="nlpdb-ai-reasoning-phase">{r.phase}</div>
                    <div className="nlpdb-ai-reasoning-desc">{r.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

const TelemetryStatCard: React.FC<{
  label: string; value: string; icon: React.ReactNode; color: string; sub?: string;
}> = ({ label, value, icon, color, sub }) => (
  <div className="nlpdb-stat-card">
    <div className="nlpdb-stat-icon" style={{ color }}>{icon}</div>
    <div className="nlpdb-stat-body">
      <div className="nlpdb-stat-value">{value}</div>
      <div className="nlpdb-stat-label">{label}</div>
      {sub && <div className="nlpdb-stat-sub">{sub}</div>}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════
   Agent Pipeline Visualizer (Loading State)
   ═══════════════════════════════════════════════ */

const PHASE_DESCRIPTIONS: Record<string, string> = {
  reasoning:    'Understanding your query to determine the best dashboard layout, data dimensions, and chart types',
  analysis:     'Filtering and aggregating infrastructure records to compute severity, cost, and status metrics',
  'code-interp':'Running Python analysis cells to generate statistical breakdowns and chart images',
  'chart-gen':  'Refining visualizations with premium palettes, responsive layouts, and glass-morphism styling',
  narrative:    'Composing an executive narrative with key findings, risk level, and recommendations',
};

const AgentPipelineVisualizer: React.FC<{
  phases: AgentPhase[]; isDark: boolean;
}> = ({ phases, isDark }) => {
  const completedCount = phases.filter(p => p.status === 'complete').length;
  const runningIdx = phases.findIndex(p => p.status === 'running');
  const currentStep = runningIdx >= 0 ? runningIdx + 1 : completedCount > 0 ? completedCount : 0;
  const progressPct = (completedCount / phases.length) * 100;

  return (
    <div className="nlpdb-pipeline">
      <div className="nlpdb-pipeline-header">
        <span className="nlpdb-pipeline-spinner" />
        <h3>Multi-Agent Pipeline Active</h3>
        <p className="nlpdb-pipeline-step-counter">
          Step {currentStep || 1} of {phases.length} — {runningIdx >= 0
            ? PHASE_DESCRIPTIONS[phases[runningIdx].id]
            : completedCount === phases.length
            ? 'All agents complete — assembling dashboard...'
            : 'Initializing pipeline...'}
        </p>
        {/* Overall progress bar */}
        <div className="nlpdb-pipeline-overall-progress">
          <div className="nlpdb-pipeline-overall-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
      <div className="nlpdb-pipeline-nodes">
        {phases.map((phase, i) => (
          <motion.div
            key={phase.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.12 }}
            className={`nlpdb-pipeline-node nlpdb-phase-${phase.status}`}
          >
            <div className="nlpdb-pipeline-node-icon">
              {phase.status === 'complete' ? (
                <div className="nlpdb-phase-done-dot">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              ) : phase.status === 'running' ? (
                <span className="nlpdb-node-spinner" />
              ) : phase.status === 'error' ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              ) : (
                <span className="nlpdb-node-pending-num">{i + 1}</span>
              )}
            </div>
            <div className="nlpdb-pipeline-node-body">
              <div className="nlpdb-pipeline-node-top">
                <span className="nlpdb-pipeline-node-agent">{phase.icon} {phase.agent}</span>
                <span className="nlpdb-pipeline-node-badges">
                  {phase.status === 'complete' && phase.durationMs > 0 && (
                    <span className="nlpdb-pipeline-node-time">{(phase.durationMs / 1000).toFixed(1)}s</span>
                  )}
                  {phase.status === 'complete' && phase.tokens && phase.tokens > 0 && (
                    <span className="nlpdb-pipeline-node-tokens">{phase.tokens} tokens</span>
                  )}
                  {phase.status === 'running' && (
                    <span className="nlpdb-pipeline-node-status-badge">Processing...</span>
                  )}
                  {phase.status === 'pending' && (
                    <span className="nlpdb-pipeline-node-status-badge nlpdb-badge-pending">Waiting</span>
                  )}
                </span>
              </div>
              <div className="nlpdb-pipeline-node-label">
                {phase.status === 'running'
                  ? PHASE_DESCRIPTIONS[phase.id] || phase.label
                  : phase.label}
              </div>
              {phase.status === 'running' && (
                <div className="nlpdb-pipeline-progress"><div className="nlpdb-pipeline-progress-bar" /></div>
              )}
              {phase.status === 'complete' && phase.detail && (
                <div className="nlpdb-pipeline-node-detail">
                  {phase.detail}
                </div>
              )}
            </div>
            {i < phases.length - 1 && <div className="nlpdb-pipeline-connector" />}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Skeleton Dashboard (Loading Placeholder)
   ═══════════════════════════════════════════════ */

const SkeletonDashboard: React.FC = () => (
  <div className="nlpdb-skeleton-dash">
    {/* Skeleton exec summary */}
    <div className="nlpdb-skeleton-banner nlpdb-skeleton-pulse">
      <div className="nlpdb-skeleton-line nlpdb-skeleton-line-lg" />
      <div className="nlpdb-skeleton-line nlpdb-skeleton-line-md" />
      <div className="nlpdb-skeleton-line nlpdb-skeleton-line-sm" />
    </div>

    {/* Skeleton quick stats */}
    <div className="nlpdb-skeleton-stats">
      {[1, 2, 3, 4, 5].map(n => (
        <div key={n} className="nlpdb-skeleton-stat nlpdb-skeleton-pulse">
          <div className="nlpdb-skeleton-circle" />
          <div className="nlpdb-skeleton-line nlpdb-skeleton-line-sm" />
        </div>
      ))}
    </div>

    {/* Skeleton widget grid */}
    <div className="nlpdb-skeleton-grid">
      {[1, 2, 3, 4, 5, 6].map(n => (
        <motion.div
          key={n}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: n * 0.1 }}
          className={`nlpdb-skeleton-card nlpdb-skeleton-pulse ${n <= 2 ? 'nlpdb-skeleton-card-lg' : ''}`}
        >
          <div className="nlpdb-skeleton-card-header">
            <div className="nlpdb-skeleton-line nlpdb-skeleton-line-md" />
          </div>
          <div className="nlpdb-skeleton-card-body">
            {n % 2 === 0 ? (
              /* Bar-chart skeleton */
              <div className="nlpdb-skeleton-bars">
                {[65, 85, 45, 70, 55].map((h, j) => (
                  <div key={j} className="nlpdb-skeleton-bar" style={{ height: `${h}%` }} />
                ))}
              </div>
            ) : (
              /* Pie/circle skeleton */
              <div className="nlpdb-skeleton-donut" />
            )}
          </div>
          <div className="nlpdb-skeleton-card-footer">
            <div className="nlpdb-skeleton-line nlpdb-skeleton-line-full" />
            <div className="nlpdb-skeleton-line nlpdb-skeleton-line-md" />
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════
   Tabbed Widget View
   ═══════════════════════════════════════════════ */

interface TabDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const DASHBOARD_TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutGrid size={15} /> },
  { id: 'cost', label: 'Cost Analysis', icon: <DollarSign size={15} /> },
  { id: 'charts', label: 'Distributions', icon: <PieChartIcon size={15} /> },
  { id: 'trends', label: 'Trends & Status', icon: <Activity size={15} /> },
  { id: 'geo', label: 'Geographic', icon: <Map size={15} /> },
];

/** Categorize a widget into a tab based on its type & metric */
function categorizeWidget(wd: WidgetData): string[] {
  const { widget } = wd;
  const t = widget.title.toLowerCase();
  const m = widget.metric;
  const ty = widget.type;
  const tabs: string[] = [];

  // KPIs / stat cards always go in overview
  if (ty === 'stat-card' || ty === 'kpi') {
    tabs.push('overview');
    return tabs;
  }
  // Severity gauge → overview
  if (ty === 'severity-gauge') { tabs.push('overview'); return tabs; }

  // Cost-related
  if (m === 'cost' || m === 'avg-cost' || m === 'cost-by-type' || m === 'cost-by-severity' || m === 'cost-by-zone'
    || t.includes('cost') || t.includes('budget') || t.includes('spend')) {
    tabs.push('cost');
  }

  // Distribution / breakdown charts
  if (ty === 'pie-chart' || ty === 'donut-chart' || m === 'severity-breakdown' || m === 'type-breakdown'
    || m === 'status-breakdown' || t.includes('distribution') || t.includes('breakdown')) {
    tabs.push('charts');
  }

  // Trend / status over time
  if (ty === 'trend-line' || m === 'trend' || ty === 'stacked-bar' || t.includes('trend') || t.includes('time')
    || t.includes('status') || t.includes('stacked') || m === 'status-by-type') {
    tabs.push('trends');
  }

  // Geographic / zone
  if (m === 'zone-breakdown' || m === 'zone-severity-radar' || m === 'cost-by-zone' || m === 'geographic-hotspots'
    || t.includes('zone') || t.includes('area') || t.includes('geographic') || ty === 'radar-chart') {
    tabs.push('geo');
  }

  // Pareto / composed / scatter
  if (ty === 'composed-chart' || t.includes('pareto') || t.includes('scatter') || t.includes('box')) {
    if (!tabs.length) tabs.push('charts');
  }

  // Table → overview
  if (ty === 'table') { tabs.push('overview'); }

  // Fallback: if no category matched, put in overview
  if (!tabs.length) tabs.push('overview');
  return tabs;
}

/** Check if a widget has meaningful renderable data */
function hasRenderableData(wd: WidgetData): boolean {
  const { widget, values, rows, chart_base64 } = wd;
  // stat-card / kpi always render (they show 0 at minimum)
  if (widget.type === 'stat-card' || widget.type === 'kpi') return true;
  if (widget.type === 'severity-gauge') return true;
  if (chart_base64) return true;
  if (rows && rows.length > 0) return true;
  // Filter out widgets with only zero values or keys that are summary labels
  const meaningfulEntries = Object.entries(values || {})
    .filter(([k, v]) => v > 0 && !['Total', 'Total Cost', 'Average'].includes(k));
  return meaningfulEntries.length > 0;
}

const TabbedWidgetView: React.FC<{
  widgetData: WidgetData[];
  isDark: boolean;
  editMode: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onRemoveWidget: (id: string) => void;
  onMoveWidget: (id: string, dir: 'up' | 'down') => void;
}> = ({ widgetData, isDark, editMode, activeTab, onTabChange, onRemoveWidget, onMoveWidget }) => {
  // Filter to widgets with renderable data
  const renderableWidgets = widgetData.filter(hasRenderableData);

  // Build tab→widgets mapping
  const tabWidgets = useMemo(() => {
    const map: Record<string, WidgetData[]> = {};
    for (const tab of DASHBOARD_TABS) { map[tab.id] = []; }
    for (const wd of renderableWidgets) {
      const tabs = categorizeWidget(wd);
      for (const tabId of tabs) {
        if (map[tabId]) map[tabId].push(wd);
      }
    }
    return map;
  }, [renderableWidgets]);

  // Only show tabs that have widgets
  const visibleTabs = DASHBOARD_TABS.filter(tab => tabWidgets[tab.id]?.length > 0);
  const currentWidgets = tabWidgets[activeTab] || [];

  // Auto-select first visible tab if current is empty
  useEffect(() => {
    if (currentWidgets.length === 0 && visibleTabs.length > 0 && visibleTabs[0].id !== activeTab) {
      onTabChange(visibleTabs[0].id);
    }
  }, [currentWidgets.length, visibleTabs, activeTab, onTabChange]);

  return (
    <div className="nlpdb-tabbed-view">
      {/* Tab bar */}
      <div className="nlpdb-tab-bar">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={`nlpdb-tab-btn ${activeTab === tab.id ? 'nlpdb-tab-active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className="nlpdb-tab-count">{tabWidgets[tab.id]?.length || 0}</span>
          </button>
        ))}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="nlpdb-edit-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Mode — Click X to remove widgets, arrows to reorder
        </motion.div>
      )}

      {/* Widget Grid for active tab */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`nlpdb-widget-grid ${editMode ? 'nlpdb-edit-active' : ''}`}
      >
        {currentWidgets.map((wd, i) => (
          <motion.div
            key={wd.widget.id}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.04, duration: 0.3 }}
            className={`nlpdb-widget-card${wd.widget.colSpan === 2 ? ' nlpdb-col-2' : wd.widget.colSpan === 3 ? ' nlpdb-col-3' : ''}${wd.widget.size === 'lg' ? ' nlpdb-widget-lg' : ''}`}
          >
            {editMode && (
              <EditOverlay
                widgetId={wd.widget.id}
                index={i}
                total={currentWidgets.length}
                onRemove={onRemoveWidget}
                onMove={onMoveWidget}
              />
            )}
            <WidgetCard data={wd} isDark={isDark} index={i} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Edit Overlay for Widget Cards
   ═══════════════════════════════════════════════ */

const EditOverlay: React.FC<{
  widgetId: string;
  index: number;
  total: number;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
}> = ({ widgetId, index, total, onRemove, onMove }) => (
  <div className="nlpdb-edit-overlay">
    <button className="nlpdb-edit-btn nlpdb-edit-remove" onClick={() => onRemove(widgetId)} title="Remove widget">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div className="nlpdb-edit-arrows">
      {index > 0 && (
        <button className="nlpdb-edit-btn" onClick={() => onMove(widgetId, 'up')} title="Move up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
        </button>
      )}
      {index < total - 1 && (
        <button className="nlpdb-edit-btn" onClick={() => onMove(widgetId, 'down')} title="Move down">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════
   Stat Card Widget (replaces KPI gauge for stat-card type)
   ═══════════════════════════════════════════════ */

const StatCardWidget: React.FC<{
  values: Record<string, number>; total?: number; color?: string; metric: string; title: string;
}> = ({ values, total, color, metric, title }) => {
  const mainVal = total ?? Object.values(values)[0] ?? 0;
  const isCost = metric === 'cost' || metric === 'avg-cost';
  const displayed = useAnimatedCounter(mainVal);
  const formatted = isCost
    ? (displayed >= 1000 ? `$${(displayed / 1000).toFixed(1)}K` : `$${displayed.toLocaleString()}`)
    : displayed.toLocaleString();

  // Pick a contextual subtitle
  const subtitle = metric === 'count' ? 'infrastructure issues'
    : metric === 'cost' ? 'estimated repair cost'
    : metric === 'avg-cost' ? 'per issue average'
    : metric === 'school-proximity' ? 'near school zones'
    : 'total';

  return (
    <div className="nlpdb-stat-card">
      <div className="nlpdb-stat-icon" style={{ background: `${color || '#6366f1'}18`, color: color || '#6366f1' }}>
        {metric === 'cost' ? <DollarSign size={20} /> : metric === 'avg-cost' ? <TrendingUp size={20} />
          : metric === 'school-proximity' ? <School size={20} /> : <BarChart3 size={20} />}
      </div>
      <div className="nlpdb-stat-value" style={{ color: color || '#6366f1' }}>{formatted}</div>
      <div className="nlpdb-stat-label">{subtitle}</div>
      {Object.keys(values).length > 1 && (
        <div className="nlpdb-stat-breakdown">
          {Object.entries(values).filter(([k]) => !['Total', 'Total Cost', 'Average'].includes(k)).slice(0, 4).map(([k, v]) => (
            <span key={k} className="nlpdb-kpi-pill">
              <span className="nlpdb-pill-dot" style={{ background: SEVERITY_COLORS[k] || TYPE_COLORS[k] || color || '#6366f1' }} />
              {k}: {isCost ? `$${(v/1000).toFixed(1)}K` : v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Donut Chart Widget (enhanced pie with center stat)
   ═══════════════════════════════════════════════ */

const DonutChartWidget: React.FC<{
  values: Record<string, number>; isDark: boolean; metric: string;
}> = ({ values, isDark, metric }) => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const isCost = metric === 'cost' || metric === 'cost-by-type' || metric === 'cost-by-severity' || metric === 'cost-by-zone';
  const entries = Object.entries(values)
    .filter(([k, v]) => v > 0 && !['Total Cost', 'Total', 'Average'].includes(k));
  if (!entries.length) return <div className="nlpdb-no-data">No data</div>;

  const data = entries.map(([key, val], i) => ({
    name: key.replace(/_/g, ' '), value: val, fill: getColorForKey(key, i),
  }));
  const total = data.reduce((s, d) => s + d.value, 0);

  const renderDonutCenter = () => (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
      <tspan x="50%" dy="-6" fill={isDark ? '#e2e8f0' : '#1e293b'} fontSize="18" fontWeight="800">
        {isCost ? `$${(total/1000).toFixed(0)}K` : total.toLocaleString()}
      </tspan>
      <tspan x="50%" dy="18" fill={isDark ? '#64748b' : '#9ca3af'} fontSize="10">total</tspan>
    </text>
  );

  return (
    <div className="nlpdb-pie-container">
      <div style={{ flex: 1, minWidth: 200, minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              {...{ activeIndex, activeShape: renderActiveShape } as any}
              data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
              dataKey="value" isAnimationActive={false} paddingAngle={2}
              onMouseEnter={(_, index) => setActiveIndex(index)}
            >
              {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="nlpdb-pie-legend">
        {data.map((d, i) => {
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0';
          return (
            <div key={i} className="nlpdb-pie-legend-item"
              style={{ opacity: activeIndex === i ? 1 : 0.6 }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="nlpdb-pie-dot" style={{ background: d.fill }} />
              <span>{d.name} — {isCost ? `$${(d.value/1000).toFixed(1)}K` : d.value} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Radar Chart Widget
   ═══════════════════════════════════════════════ */

const RadarChartWidget: React.FC<{
  rows?: Array<Record<string, unknown>>; values: Record<string, number>; isDark: boolean;
}> = ({ rows, values, isDark }) => {
  // Use rows if available (zone-severity-radar), otherwise transform values
  let radarData: Array<Record<string, unknown>>;
  let dataKeys: string[];

  if (rows && rows.length > 0 && rows[0].subject) {
    radarData = rows;
    dataKeys = Object.keys(rows[0]).filter(k => k !== 'subject');
  } else {
    // Convert flat values to radar format
    radarData = Object.entries(values).map(([k, v]) => ({ subject: k.replace(/_/g, ' '), value: v }));
    dataKeys = ['value'];
  }

  if (!radarData.length) return <div className="nlpdb-no-data">No data</div>;

  const radarColors = ['#6366f1', '#ef4444', '#f59e0b', '#22c55e', '#ec4899'];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke={isDark ? '#334155' : '#e2e8f0'} />
        {/* @ts-ignore Recharts v3 JSX typing */}
        <PolarAngleAxis dataKey="subject" tick={{ fill: isDark ? '#94a3b8' : '#64748b', fontSize: 11 }} />
        {/* @ts-ignore Recharts v3 JSX typing */}
        <PolarRadiusAxis tick={{ fill: isDark ? '#475569' : '#9ca3af', fontSize: 9 }} />
        {dataKeys.map((dk, i) => (
          <Radar key={dk} name={dk} dataKey={dk} stroke={SEVERITY_COLORS[dk] || radarColors[i % radarColors.length]}
            fill={SEVERITY_COLORS[dk] || radarColors[i % radarColors.length]} fillOpacity={0.15} strokeWidth={2}
            isAnimationActive={false} />
        ))}
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        <Tooltip content={<GlassTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

/* ═══════════════════════════════════════════════
   Stacked Bar Widget
   ═══════════════════════════════════════════════ */

const StackedBarWidget: React.FC<{
  rows?: Array<Record<string, unknown>>; values: Record<string, number>; isDark: boolean;
}> = ({ rows, values, isDark }) => {
  let chartData: Array<Record<string, unknown>>;
  let categories: string[];

  if (rows && rows.length > 0 && rows[0].name) {
    chartData = rows;
    categories = Object.keys(rows[0]).filter(k => k !== 'name');
  } else {
    // Reshape severity-type-matrix into stacked data
    const grouped: Record<string, Record<string, number>> = {};
    for (const [k, v] of Object.entries(values)) {
      const parts = k.split('-');
      if (parts.length === 2) {
        const [cat, sub] = parts;
        if (!grouped[sub]) grouped[sub] = {};
        grouped[sub][cat] = v;
      } else {
        if (!grouped[k]) grouped[k] = {};
        grouped[k]['value'] = v;
      }
    }
    chartData = Object.entries(grouped).map(([name, vals]) => ({ name, ...vals }));
    categories = [...new Set(chartData.flatMap(d => Object.keys(d).filter(k => k !== 'name')))];
  }

  if (!chartData.length) return <div className="nlpdb-no-data">No data</div>;

  const stackColors = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#6b7280', '#a855f7', '#ec4899'];

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 50 + 60)}>
      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e5e7eb'} />
        <XAxis dataKey="name" tick={{ fill: isDark ? '#94a3b8' : '#6b7280', fontSize: 12 }}
          axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }} />
        <YAxis tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<GlassTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {categories.map((cat, i) => (
          <Bar key={cat} dataKey={cat} stackId="a"
            fill={STATUS_COLORS[cat] || SEVERITY_COLORS[cat] || stackColors[i % stackColors.length]}
            radius={i === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ═══════════════════════════════════════════════
   Horizontal Bar Widget (explicit horizontal bars with gradients)
   ═══════════════════════════════════════════════ */

let _hbarId = 0;
const HorizontalBarWidget: React.FC<{
  values: Record<string, number>; isDark: boolean; metric: string;
}> = ({ values, isDark, metric }) => {
  const [uid] = React.useState(() => `hb${++_hbarId}`);
  const entries = Object.entries(values)
    .filter(([k]) => !['Total Cost', 'Total', 'Average'].includes(k))
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="nlpdb-no-data">No data</div>;

  const isCost = metric === 'cost' || metric === 'cost-by-type' || metric === 'cost-by-severity' || metric === 'cost-by-zone';
  const data = entries.map(([key, val], i) => ({
    name: key.replace(/_/g, ' '), value: val, fill: getColorForKey(key, i),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
        <defs>
          {data.map((d, i) => (
            <linearGradient key={i} id={`${uid}-g${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={d.fill} stopOpacity={0.9} />
              <stop offset="100%" stopColor={d.fill} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e5e7eb'} horizontal={false} />
        <XAxis type="number" tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 11 }}
          axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }}
          tickFormatter={isCost ? (v: number) => `$${(v / 1000).toFixed(0)}K` : undefined} />
        <YAxis dataKey="name" type="category" tick={{ fill: isDark ? '#94a3b8' : '#6b7280', fontSize: 12 }}
          axisLine={false} tickLine={false} width={100} />
        <Tooltip content={<GlassTooltip isCost={isCost} />} cursor={{ fill: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)' }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {data.map((entry, i) => <Cell key={i} fill={`url(#${uid}-g${i})`} cursor="pointer" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ═══════════════════════════════════════════════
   Composed Chart Widget (Bar + Line pareto style)
   ═══════════════════════════════════════════════ */

const ComposedChartWidget: React.FC<{
  values: Record<string, number>; isDark: boolean;
}> = ({ values, isDark }) => {
  const entries = Object.entries(values)
    .filter(([k]) => !['Total Cost', 'Total', 'Average'].includes(k))
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="nlpdb-no-data">No data</div>;

  const total = entries.reduce((s, [, v]) => s + v, 0);
  let cumulative = 0;
  const data = entries.map(([key, val]) => {
    cumulative += val;
    return { name: key.replace(/_/g, ' '), value: val, cumPct: Math.round((cumulative / total) * 100) };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 40, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e5e7eb'} />
        <XAxis dataKey="name" tick={{ fill: isDark ? '#94a3b8' : '#6b7280', fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
        <Tooltip content={<GlassTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="left" dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} isAnimationActive={false} name="Count" />
        <Line yAxisId="right" dataKey="cumPct" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} name="Cumulative %" />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

/* ═══════════════════════════════════════════════
   Widget Card Component
   ═══════════════════════════════════════════════ */

const WidgetCard: React.FC<{
  data: WidgetData; isDark: boolean; index: number;
}> = ({ data, isDark, index }) => {
  const { widget, values, rows, total, narrative, chart_base64, insight, source } = data;

  // Determine which interactive chart component to render
  const renderChart = () => {
    switch (widget.type) {
      case 'stat-card':
        return <StatCardWidget values={values} total={total} color={widget.color} metric={widget.metric} title={widget.title} />;

      case 'kpi':
        return <StatCardWidget values={values} total={total} color={widget.color} metric={widget.metric} title={widget.title} />;

      case 'donut-chart':
        return <DonutChartWidget values={values} isDark={isDark} metric={widget.metric} />;

      case 'bar-chart':
        return <BarChartWidget values={values} isDark={isDark} metric={widget.metric} />;

      case 'horizontal-bar':
        return <HorizontalBarWidget values={values} isDark={isDark} metric={widget.metric} />;

      case 'stacked-bar':
        return <StackedBarWidget rows={rows} values={values} isDark={isDark} />;

      case 'pie-chart':
        return <PieChartWidget values={values} isDark={isDark} metric={widget.metric} />;

      case 'radar-chart':
        return <RadarChartWidget rows={rows} values={values} isDark={isDark} />;

      case 'composed-chart':
        return <ComposedChartWidget values={values} isDark={isDark} />;

      case 'severity-gauge':
        return <SeverityGaugeWidget values={values} total={total || 0} />;

      case 'table':
        return <TableWidget rows={rows} isDark={isDark} />;

      case 'trend-line':
        return <TrendLineWidget values={values} isDark={isDark} />;

      case 'narrative':
        return <InlineNarrative narrative={narrative} />;

      case 'code-interpreter-chart':
        // If we have a base64 image from Code Interpreter, render it
        if (chart_base64) {
          return <CIChartWidget base64={chart_base64} title={widget.title} />;
        }
        // Otherwise render interactively — guess best chart from title
        if (values && Object.keys(values).length > 0) {
          const t = widget.title.toLowerCase();
          if (t.includes('radar') || t.includes('spider')) return <RadarChartWidget rows={rows} values={values} isDark={isDark} />;
          if (t.includes('stack')) return <StackedBarWidget rows={rows} values={values} isDark={isDark} />;
          if (t.includes('donut') || t.includes('pie') || t.includes('distribution')) return <DonutChartWidget values={values} isDark={isDark} metric={widget.metric} />;
          if (t.includes('trend') || t.includes('time') || t.includes('line')) return <TrendLineWidget values={values} isDark={isDark} />;
          return <BarChartWidget values={values} isDark={isDark} metric={widget.metric} />;
        }
        return <StatCardWidget values={values} total={total} color={widget.color} metric={widget.metric} title={widget.title} />;

      case 'heatmap-summary':
      case 'heatmap':
        return values && Object.keys(values).length > 0
          ? <BarChartWidget values={values} isDark={isDark} metric={widget.metric} />
          : <StatCardWidget values={values} total={total} color={widget.color} metric={widget.metric} title={widget.title} />;

      case 'cost-waterfall':
      case 'hotspot-bar':
        return <HorizontalBarWidget values={values} isDark={isDark} metric={widget.metric} />;

      default:
        return values && Object.keys(values).length > 0
          ? <BarChartWidget values={values} isDark={isDark} metric={widget.metric} />
          : <StatCardWidget values={values} total={total} color={widget.color} metric={widget.metric} title={widget.title} />;
    }
  };

  return (
    <>
      <div className="nlpdb-widget-header">
        <h3 className="nlpdb-widget-title">{widget.title}</h3>
        <div className="nlpdb-widget-badges">
          {source === 'code-interpreter' && <span className="nlpdb-badge nlpdb-badge-ci"><Zap size={11} /> CI</span>}
          {source === 'matplotlib' && <span className="nlpdb-badge nlpdb-badge-py"><BarChart3 size={11} /> Python</span>}
          <span className="nlpdb-widget-type-badge">{widget.type}</span>
        </div>
      </div>
      {insight && <div className="nlpdb-widget-insight"><Lightbulb size={14} /> {insight}</div>}
      {renderChart()}
    </>
  );
};

/* ═══════════════════════════════════════════════
   Code Interpreter Chart Widget
   ═══════════════════════════════════════════════ */

const CIChartWidget: React.FC<{ base64: string; title: string }> = ({ base64, title }) => {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <div className="nlpdb-ci-chart" onClick={() => setZoomed(true)}>
        <img src={`data:image/png;base64,${base64}`} alt={title} />
        <span className="nlpdb-ci-zoom"><Search size={13} /> Click to zoom</span>
      </div>
      {zoomed && (
        <div className="nlpdb-lightbox" onClick={() => setZoomed(false)}>
          <img src={`data:image/png;base64,${base64}`} alt={title} />
          <span className="nlpdb-lightbox-close"><X size={20} /></span>
        </div>
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════
   KPI Widget (Animated Half-Circle Gauge)
   ═══════════════════════════════════════════════ */

const KPIWidget: React.FC<{
  values: Record<string, number>; total?: number; color?: string;
}> = ({ values, total, color }) => {
  const mainVal = total ?? Object.values(values)[0] ?? 0;
  const isCost = mainVal > 1000;
  const displayed = useAnimatedCounter(mainVal);
  const formatted = isCost ? `$${(displayed / 1000).toFixed(0)}K` : displayed.toLocaleString();

  const radius = 44;
  const circumference = Math.PI * radius;
  const maxRefVal = Math.max(mainVal * 1.3, 100);
  const pct = Math.min(mainVal / maxRefVal, 1);
  const offset = circumference - circumference * pct;

  return (
    <div className="nlpdb-kpi">
      <div className="nlpdb-kpi-gauge">
        <svg viewBox="0 0 100 56" className="nlpdb-kpi-svg">
          <defs>
            <linearGradient id={`kpiGrad-${mainVal}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={color || '#818cf8'} />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
          </defs>
          <path d="M 6 54 A 44 44 0 0 1 94 54" fill="none" stroke="currentColor" strokeWidth="6" className="nlpdb-kpi-track" />
          <path d="M 6 54 A 44 44 0 0 1 94 54" fill="none" stroke={`url(#kpiGrad-${mainVal})`} strokeWidth="6"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className="nlpdb-kpi-fill" />
        </svg>
        <div className="nlpdb-kpi-value" style={{ color: color || '#818cf8' }}>{formatted}</div>
      </div>
      {Object.keys(values).length > 1 && (
        <div className="nlpdb-kpi-breakdown">
          {Object.entries(values).slice(0, 6).map(([k, v]) => (
            <span key={k} className="nlpdb-kpi-pill">{k}: {v.toLocaleString()}</span>
          ))}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Bar Chart Widget
   ═══════════════════════════════════════════════ */

let _barChartId = 0;
const BarChartWidget: React.FC<{
  values: Record<string, number>; isDark: boolean; metric: string;
}> = ({ values, isDark, metric }) => {
  const [uid] = React.useState(() => `bc${++_barChartId}`);
  const entries = Object.entries(values)
    .filter(([k]) => !['Total Cost', 'Total', 'Average'].includes(k))
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <div className="nlpdb-no-data">No data</div>;

  const isCost = metric === 'cost' || metric === 'cost-by-type' || metric === 'cost-by-severity' || metric === 'cost-by-zone';
  const data = entries.map(([key, val], i) => ({
    name: key.replace(/_/g, ' '), value: val, fill: getColorForKey(key, i),
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
        <defs>
          {data.map((d, i) => (
            <linearGradient key={i} id={`${uid}-g${i}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={d.fill} stopOpacity={0.9} />
              <stop offset="100%" stopColor={d.fill} stopOpacity={0.5} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e5e7eb'} horizontal={false} />
        <XAxis type="number" tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 11 }}
          axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }}
          tickFormatter={isCost ? (v: number) => `$${(v / 1000).toFixed(0)}K` : undefined} />
        <YAxis dataKey="name" type="category" tick={{ fill: isDark ? '#94a3b8' : '#6b7280', fontSize: 12 }}
          axisLine={false} tickLine={false} width={100} />
        <Tooltip content={<GlassTooltip isCost={isCost} />} cursor={{ fill: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)' }} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
          {data.map((entry, i) => <Cell key={i} fill={`url(#${uid}-g${i})`} cursor="pointer" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ═══════════════════════════════════════════════
   Pie Chart Widget
   ═══════════════════════════════════════════════ */

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" fill={fill} fontSize="14" fontWeight="700">{payload.name}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#94a3b8" fontSize="12">{value} ({(percent * 100).toFixed(0)}%)</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 12} outerRadius={outerRadius + 16} fill={fill} />
    </g>
  );
};

const PieChartWidget: React.FC<{
  values: Record<string, number>; isDark: boolean; metric: string;
}> = ({ values, isDark, metric }) => {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const entries = Object.entries(values).filter(([, v]) => v > 0);
  if (!entries.length) return <div className="nlpdb-no-data">No data</div>;

  const data = entries.map(([key, val], i) => ({
    name: key.replace(/_/g, ' '), value: val, fill: getColorForKey(key, i),
  }));

  return (
    <div className="nlpdb-pie-container">
      <div style={{ flex: 1, minWidth: 200, minHeight: 220 }}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              {...{ activeIndex, activeShape: renderActiveShape } as any}
              data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
              dataKey="value" isAnimationActive={false}
              onMouseEnter={(_, index) => setActiveIndex(index)}
            >
              {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="nlpdb-pie-legend">
        {data.map((d, i) => {
          const tot = data.reduce((s, e) => s + e.value, 0);
          const pct = tot > 0 ? ((d.value / tot) * 100).toFixed(0) : '0';
          return (
            <div key={i} className="nlpdb-pie-legend-item"
              style={{ opacity: activeIndex === i ? 1 : 0.6 }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="nlpdb-pie-dot" style={{ background: d.fill }} />
              <span>{d.name} — {d.value} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Severity Gauge Widget
   ═══════════════════════════════════════════════ */

const SeverityGaugeWidget: React.FC<{
  values: Record<string, number>; total: number;
}> = ({ values, total }) => {
  const [hovered, setHovered] = React.useState<string | null>(null);
  const segments = ['critical', 'high', 'medium', 'low'];
  return (
    <div className="nlpdb-gauge">
      <div className="nlpdb-gauge-bar">
        {segments.map(sev => {
          const pct = total > 0 ? (values[sev] || 0) / total * 100 : 0;
          return pct > 0 ? (
            <div key={sev} className={`nlpdb-gauge-seg ${hovered === sev ? 'nlpdb-gauge-seg-hover' : ''}`}
              style={{ width: `${pct}%`, background: SEVERITY_COLORS[sev] }}
              onMouseEnter={() => setHovered(sev)} onMouseLeave={() => setHovered(null)}
            >
              {hovered === sev && (
                <div className="nlpdb-gauge-tooltip">
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}: {values[sev] || 0} ({pct.toFixed(0)}%)
                </div>
              )}
            </div>
          ) : null;
        })}
      </div>
      <div className="nlpdb-gauge-labels">
        {segments.map(sev => (
          <div key={sev} className="nlpdb-gauge-label" onMouseEnter={() => setHovered(sev)} onMouseLeave={() => setHovered(null)}>
            <div style={{ color: SEVERITY_COLORS[sev], fontSize: 18, fontWeight: 700 }}>{values[sev] || 0}</div>
            <div className="nlpdb-gauge-label-text">{sev}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Table Widget
   ═══════════════════════════════════════════════ */

const TableWidget: React.FC<{
  rows?: Array<Record<string, unknown>>; isDark: boolean;
}> = ({ rows, isDark }) => {
  if (!rows?.length) return <div className="nlpdb-no-data">No data available</div>;
  const headers = Object.keys(rows[0]);

  return (
    <div className="nlpdb-table-wrap">
      <table className="nlpdb-table">
        <thead>
          <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {headers.map(h => {
                const val = row[h];
                const isSev = h === 'severity' && typeof val === 'string';
                const isCostCol = h === 'cost' && typeof val === 'number';
                return (
                  <td key={h} style={{
                    color: isSev ? (SEVERITY_COLORS[val as string] || undefined) : undefined,
                    fontWeight: isSev || isCostCol ? 600 : 400,
                  }}>
                    {isCostCol ? `$${(val as number).toLocaleString()}` : String(val ?? '')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Trend Line Widget
   ═══════════════════════════════════════════════ */

const TrendLineWidget: React.FC<{
  values: Record<string, number>; isDark: boolean;
}> = ({ values, isDark }) => {
  const entries = Object.entries(values).sort((a, b) => a[0].localeCompare(b[0]));
  if (!entries.length) return <div className="nlpdb-no-data">No trend data</div>;
  const data = entries.map(([key, val]) => ({ label: key.length > 7 ? key.slice(5) : key, value: val }));

  /* Single data point → show a stat card + bar instead of a lonely dot */
  if (data.length === 1) {
    return (
      <div className="nlpdb-trend-single">
        <div className="nlpdb-trend-single-stat">
          <span className="nlpdb-trend-single-value">{data[0].value}</span>
          <span className="nlpdb-trend-single-label">{data[0].label}</span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e5e7eb'} horizontal={false} />
            <XAxis dataKey="label" tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} tickLine={false}
              axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }} />
            <YAxis tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<GlassTooltip />} />
            <Bar dataKey="value" fill="#818cf8" radius={[6, 6, 0, 0]} isAnimationActive={false} barSize={48} />
          </BarChart>
        </ResponsiveContainer>
        <div className="nlpdb-trend-single-note">Only one data period available. More data points will show a trend line.</div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="nlpTrendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isDark ? '#818cf8' : '#6366f1'} stopOpacity={isDark ? 0.4 : 0.55} />
            <stop offset="95%" stopColor={isDark ? '#818cf8' : '#6366f1'} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e5e7eb'} />
        <XAxis dataKey="label" tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} axisLine={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb' }} tickLine={false} />
        <YAxis tick={{ fill: isDark ? '#64748b' : '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<GlassTooltip />} />
        <Area type="monotone" dataKey="value" stroke={isDark ? '#818cf8' : '#4f46e5'} strokeWidth={3} fill="url(#nlpTrendGrad)"
          dot={{ r: 5, fill: isDark ? '#818cf8' : '#4f46e5', stroke: isDark ? '#1a2332' : '#fff', strokeWidth: 2 }}
          activeDot={{ r: 7, fill: isDark ? '#818cf8' : '#4f46e5', stroke: '#fff', strokeWidth: 2 }}
          isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/* ═══════════════════════════════════════════════
   Inline Narrative (per-widget)
   ═══════════════════════════════════════════════ */

const InlineNarrative: React.FC<{ narrative?: string }> = ({ narrative }) => {
  if (!narrative) return null;
  const parts = narrative.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="nlpdb-narrative-inline">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   Narrative Section (Main — Findings + Recommendations)
   ═══════════════════════════════════════════════ */

const NarrativeSection: React.FC<{
  sections: NarrativeSections; isDark: boolean;
}> = ({ sections, isDark }) => {
  const overviewParts = sections.overview.split(/(\*\*[^*]+\*\*)/g);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="nlpdb-narrative-section"
    >
      <div className="nlpdb-narrative-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <h3>AI Narrative Summary & Recommendations</h3>
      </div>

      {/* Overview */}
      <div className="nlpdb-narrative-overview">
        {overviewParts.map((part, i) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={i}>{part.slice(2, -2)}</strong>
            : <span key={i}>{part}</span>
        )}
      </div>

      {/* Key Findings */}
      <div className="nlpdb-narrative-block">
        <h4 className="nlpdb-narrative-block-title">
          <span className="nlpdb-narrative-block-icon" style={{ background: 'rgba(129,140,248,0.15)', color: '#818cf8' }}><ClipboardList size={16} /></span>
          Key Findings
        </h4>
        <ul className="nlpdb-narrative-findings">
          {sections.findings.map((f, i) => {
            const parts = f.split(/(\*\*[^*]+\*\*)/g);
            return (
              <li key={i}>
                <span className="nlpdb-finding-dot" style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
                {parts.map((part, j) =>
                  part.startsWith('**') && part.endsWith('**')
                    ? <strong key={j}>{part.slice(2, -2)}</strong>
                    : <span key={j}>{part}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Recommendations */}
      <div className="nlpdb-narrative-block">
        <h4 className="nlpdb-narrative-block-title">
          <span className="nlpdb-narrative-block-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><Lightbulb size={16} /></span>
          Recommendations
        </h4>
        <ul className="nlpdb-narrative-recs">
          {sections.recommendations.map((r, i) => (
            <li key={i}>
              <span className="nlpdb-rec-num">{i + 1}</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Data source note */}
      <div className="nlpdb-narrative-data-note">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
        {sections.dataNote}
      </div>
    </motion.div>
  );
};

/* ═══════════════════════════════════════════════
   Glass Tooltip (Recharts)
   ═══════════════════════════════════════════════ */

const GlassTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
  isCost?: boolean;
}> = ({ active, payload, label, isCost }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="nlpdb-chart-tooltip">
      {label && <div className="nlpdb-chart-tooltip-label">{label.replace(/_/g, ' ')}</div>}
      {payload.map((p, i) => (
        <div key={i} className="nlpdb-chart-tooltip-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || '#a5b4fc', flexShrink: 0 }} />
          <span style={{ color: '#e2e8f0' }}>
            {isCost ? `$${(p.value / 1000).toFixed(1)}K` : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

export default NLPDashboardBuilder;

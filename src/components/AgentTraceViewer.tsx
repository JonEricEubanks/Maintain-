/**
 * MAINTAIN AI - Agent Trace Viewer (v4 - Theme-Aware)
 *
 * Premium observability panel that respects the current app theme
 * (light or dark mode) using CSS variables from the design system.
 *
 * Features:
 * - Theme-aware via CSS vars (--text-primary, --glass-border, etc.)
 * - glass-panel class for backdrop matching other panels
 * - Per-agent breakdown with icons & click-to-filter
 * - Trace waterfall with expandable request details
 * - Agent filter pills, search bar, relative timestamps, duration badges
 * - Time-grouped trace sections (Last 5m / 30m / Earlier)
 * - Live pulse indicator + auto-refresh
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Text,
  Title2,
  Caption1,
  Badge,
  Button,
  Spinner,
  Tooltip,
  Subtitle2,
} from '@fluentui/react-components';
import {
  Eye24Regular,
  ArrowSync24Regular,
  Warning24Regular,
  CheckmarkCircle24Regular,
  Clock24Regular,
  Flash24Regular,
  ErrorCircle24Regular,
  Dismiss24Regular,
  ChevronRight16Regular,
  ChevronDown16Regular,
  Info16Regular,
  Search24Regular,
  BrainCircuit24Regular,
  People24Regular,
  ArrowSort24Regular,
  Document24Regular,
  DataArea24Regular,
  Shield24Regular,
  Send24Regular,
  Chat24Regular,
  Delete24Regular,
} from '@fluentui/react-icons';
import OverlayShell from './OverlayShell';

// ============================================
// Types
// ============================================

interface RequestInfo {
  endpoint: string;
  summary: string;
  input: Record<string, string | number | boolean | null>;
}

interface AlgorithmStep {
  step: number;
  label: string;
  detail: string;
}

interface ReasoningStep {
  step: number;
  description: string;
  confidence: number;
  dataSource: string;
}

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

interface ResponseInfo {
  model?: string;
  confidence?: number;
  algorithm?: AlgorithmStep[];
  reasoningSteps?: ReasoningStep[];
  toolCalls?: { name: string; result: string }[];
  tokensUsed?: TokenUsage;
  processingTimeMs?: number;
}

interface TraceEntry {
  span: string;
  function: string;
  startTime: string;
  status: 'ok' | 'error';
  attributes: Record<string, string | number | boolean>;
  durationMs: number;
  error?: string;
  requestInfo?: RequestInfo | null;
  responseInfo?: ResponseInfo | null;
}

interface AgentStats {
  calls: number;
  errors: number;
  totalMs: number;
  avgMs: number;
}

interface TelemetrySummary {
  totalCalls: number;
  totalErrors: number;
  errorRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  byAgent: Record<string, AgentStats>;
  recentTraces: TraceEntry[];
  uptimeMinutes: number;
}

interface AgentTraceViewerProps {
  isVisible: boolean;
  onClose: () => void;
}

// ============================================
// Constants
// ============================================

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

/** Agent accent colors (vibrant enough for both light & dark themes) */
const AGENT_META: Record<string, { color: string; icon: React.ReactNode; label: string; description: string }> = {
  'analysis':          { color: '#3b82f6', icon: <BrainCircuit24Regular />, label: 'Analysis',        description: 'AI reasoning & infrastructure analysis' },
  'crew-estimation':   { color: '#d97706', icon: <People24Regular />,      label: 'Crew Estimation',  description: 'Optimal crew deployment calculator' },
  'prioritization':    { color: '#7c3aed', icon: <ArrowSort24Regular />,   label: 'Prioritization',   description: 'Work order priority scoring' },
  'report':            { color: '#059669', icon: <Document24Regular />,    label: 'Report',           description: 'AI-generated infrastructure reports' },
  'nlp-dashboard':     { color: '#db2777', icon: <DataArea24Regular />,    label: 'NLP Dashboard',    description: 'Natural language dashboard builder' },
  'dispatch':          { color: '#ea580c', icon: <Send24Regular />,        label: 'Dispatch',         description: 'AI-optimized crew dispatch' },
  'content-safety':    { color: '#0891b2', icon: <Shield24Regular />,      label: 'Content Safety',   description: 'Azure Content Safety validation' },
  'chat':              { color: '#4f46e5', icon: <Chat24Regular />,        label: 'Chat',             description: 'AI Q&A assistant' },
  'semantic-kernel':   { color: '#7c3aed', icon: <BrainCircuit24Regular />,label: 'Semantic Kernel',  description: 'SK orchestration layer' },
};

const SPAN_TO_AGENT: Record<string, string> = {
  'agent.analysis': 'analysis',
  'agent.crew_estimation': 'crew-estimation',
  'agent.prioritization': 'prioritization',
  'agent.report': 'report',
  'agent.nlp_dashboard': 'nlp-dashboard',
  'agent.dispatch': 'dispatch',
  'agent.chat': 'chat',
  'content_safety.analyze': 'content-safety',
  'sk.invoke': 'semantic-kernel',
};

// ============================================
// Utilities
// ============================================

function resolveAgentKey(trace: TraceEntry): string {
  const name = trace.attributes?.['infrawatch.agent.name'] as string || '';
  if (AGENT_META[name]) return name;
  if (SPAN_TO_AGENT[trace.span]) return SPAN_TO_AGENT[trace.span];
  return name || trace.span;
}

function getAgentMeta(key: string) {
  return AGENT_META[key] || { color: '#4f46e5', icon: <Flash24Regular />, label: formatAgentName(key), description: '' };
}

function formatAgentName(raw: string): string {
  return raw
    .replace('agent.', '')
    .replace('content_safety.', 'Safety: ')
    .replace('dataverse.', 'DV: ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function relativeTime(isoString: string): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function durationBadgeColor(ms: number): string {
  if (ms === 0) return 'var(--accent-warning-alpha)';
  if (ms < 2000) return 'var(--accent-success-alpha)';
  if (ms < 10000) return 'rgba(59,130,246,0.12)';
  if (ms < 30000) return 'var(--accent-warning-alpha)';
  return 'var(--accent-danger-alpha)';
}

function durationTextColor(ms: number): string {
  if (ms === 0) return 'var(--accent-warning)';
  if (ms < 2000) return 'var(--accent-success)';
  if (ms < 10000) return '#3b82f6';
  if (ms < 30000) return 'var(--accent-warning)';
  return 'var(--accent-danger)';
}

function groupTracesByTime(traces: TraceEntry[]): { label: string; traces: TraceEntry[] }[] {
  const now = Date.now();
  const groups: { label: string; cutoff: number; traces: TraceEntry[] }[] = [
    { label: 'Last 5 minutes', cutoff: 5 * 60 * 1000, traces: [] },
    { label: 'Last 30 minutes', cutoff: 30 * 60 * 1000, traces: [] },
    { label: 'Earlier', cutoff: Infinity, traces: [] },
  ];
  for (const t of traces) {
    const age = now - new Date(t.startTime).getTime();
    for (const g of groups) {
      if (age <= g.cutoff) { g.traces.push(t); break; }
    }
  }
  return groups.filter(g => g.traces.length > 0).map(g => ({ label: g.label, traces: g.traces }));
}

// ============================================
// Main Component
// ============================================

const AgentTraceViewer: React.FC<AgentTraceViewerProps> = ({ isVisible, onClose }) => {
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const fetchData = useCallback(async () => {
    if (!AGENT_API_URL) { setIsConnected(false); return; }
    try {
      const [telRes, traceRes] = await Promise.all([
        fetch(`${AGENT_API_URL}/api/telemetry`, { signal: AbortSignal.timeout(5000) }),
        fetch(`${AGENT_API_URL}/api/traces?limit=50`, { signal: AbortSignal.timeout(5000) }),
      ]);
      if (telRes.ok && traceRes.ok) {
        setTelemetry(await telRes.json());
        setTraces(await traceRes.json());
        setIsConnected(true);
      } else {
        setIsConnected(false);
      }
    } catch {
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    setIsLoading(true);
    fetchData().finally(() => setIsLoading(false));
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 8000);
    return () => clearInterval(id);
  }, [isVisible, autoRefresh, fetchData]);

  const filteredTraces = useMemo(() => {
    let result = traces;
    if (agentFilter) {
      result = result.filter(t => resolveAgentKey(t) === agentFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.requestInfo?.summary?.toLowerCase().includes(q) ||
        t.requestInfo?.endpoint?.toLowerCase().includes(q) ||
        resolveAgentKey(t).toLowerCase().includes(q) ||
        t.span.toLowerCase().includes(q)
      );
    }
    return result;
  }, [traces, agentFilter, searchQuery]);

  const traceGroups = useMemo(() => groupTracesByTime(filteredTraces), [filteredTraces]);

  const activeAgents = useMemo(() => {
    const keys = new Set(traces.map(resolveAgentKey));
    return Array.from(keys).sort();
  }, [traces]);

  const maxDuration = traces.length ? Math.max(...traces.map(t => t.durationMs), 1) : 1;

  if (!isVisible) return null;

  return (
    <OverlayShell size="xl" onClose={onClose}>

        {/* ---- Header ---- */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.07), rgba(139,92,246,0.04))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.25)',
            }}>
              <Eye24Regular style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <Title2 style={{ margin: 0, lineHeight: 1.2 }}>Agent Observability</Title2>
              <Caption1 style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                Real-time agent telemetry &amp; request tracing
              </Caption1>
            </div>
            {isConnected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--accent-success)',
                  boxShadow: '0 0 6px var(--accent-success)',
                  animation: 'livePulse 2s ease-in-out infinite',
                }} />
                <Caption1 style={{ color: 'var(--accent-success)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>LIVE</Caption1>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Tooltip content={autoRefresh ? 'Pause live updates' : 'Resume live updates'} relationship="label">
              <Button
                appearance={autoRefresh ? 'primary' : 'outline'}
                size="small"
                icon={<ArrowSync24Regular />}
                onClick={() => setAutoRefresh(p => !p)}
              >
                {autoRefresh ? 'Live' : 'Paused'}
              </Button>
            </Tooltip>
            <Button
              appearance="subtle" icon={<Dismiss24Regular />}
              onClick={onClose} size="small"
              style={{ borderRadius: 'var(--radius-sm)' }}
            />
          </div>
        </div>

        {/* ---- Body ---- */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '18px 20px',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}>

          {isLoading && !telemetry ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
              <Spinner label="Connecting to Agent API..." />
            </div>
          ) : !isConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 50, opacity: 0.7 }}>
              <ErrorCircle24Regular style={{ fontSize: 48, color: 'var(--accent-danger)', marginBottom: 12 }} />
              <Text weight="semibold">Agent API not reachable</Text>
              <Caption1 style={{ marginTop: 4 }}>Start the agent server: <code>npm run start:agents</code></Caption1>
            </div>
          ) : telemetry && (
            <>
              {/* ---- KPI Cards ---- */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <KPICard label="Total Calls"  value={telemetry.totalCalls}   format="number" icon={<Flash24Regular />} />
                <KPICard label="Error Rate"   value={telemetry.errorRate}    format="percent" icon={<Warning24Regular />} danger={telemetry.errorRate > 0.05} />
                <KPICard label="Avg Latency"  value={telemetry.avgLatencyMs} format="ms" icon={<Clock24Regular />} />
                <KPICard label="P95 Latency"  value={telemetry.p95LatencyMs} format="ms" icon={<Clock24Regular />} danger={telemetry.p95LatencyMs > 10000} />
                <KPICard label="Uptime"       value={telemetry.uptimeMinutes} format="uptime" icon={<CheckmarkCircle24Regular />} />
                <KPICard label="Agents"       value={Object.keys(telemetry.byAgent).length} format="number" icon={<Eye24Regular />} />
              </div>

              {/* ---- Agent Breakdown ---- */}
              {Object.keys(telemetry.byAgent).length > 0 && (
                <div>
                  <Subtitle2 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    Agent Breakdown
                    <Caption1 style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      {Object.keys(telemetry.byAgent).length} active
                    </Caption1>
                  </Subtitle2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
                    {Object.entries(telemetry.byAgent).map(([agent, stats]) => {
                      const meta = getAgentMeta(agent);
                      const isActive = agentFilter === agent;
                      return (
                        <div
                          key={agent}
                          onClick={() => setAgentFilter(f => f === agent ? null : agent)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                            borderRadius: 'var(--radius-md)',
                            background: isActive ? `${meta.color}14` : 'var(--glass-bg)',
                            border: `1px solid ${isActive ? `${meta.color}40` : 'var(--glass-border)'}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = `${meta.color}10`;
                            e.currentTarget.style.borderColor = `${meta.color}30`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isActive ? `${meta.color}14` : 'var(--glass-bg)';
                            e.currentTarget.style.borderColor = isActive ? `${meta.color}40` : 'var(--glass-border)';
                          }}
                        >
                          <div style={{
                            width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                            background: `${meta.color}18`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: meta.color, flexShrink: 0,
                          }}>
                            {React.cloneElement(meta.icon as React.ReactElement, { style: { fontSize: 18 } })}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text size={200} weight="semibold" truncate style={{ display: 'block' }}>{meta.label}</Text>
                            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                              <Caption1 style={{ color: 'var(--text-muted)' }}>{stats.calls} calls</Caption1>
                              <Caption1 style={{ color: 'var(--text-muted)' }}>{stats.avgMs}ms avg</Caption1>
                              {stats.errors > 0 && (
                                <Caption1 style={{ color: 'var(--accent-danger)' }}>{stats.errors} err</Caption1>
                              )}
                            </div>
                          </div>
                          <div style={{
                            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
                            background: `${meta.color}12`,
                          }}>
                            <Caption1 style={{ fontSize: 10, fontWeight: 700, color: meta.color }}>
                              {Math.round((stats.calls / Math.max(telemetry.totalCalls, 1)) * 100)}%
                            </Caption1>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ---- Trace Waterfall ---- */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
                  <Subtitle2 style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    Trace Waterfall
                    <Badge appearance="outline" size="small" color="informative" style={{ fontWeight: 400 }}>
                      {filteredTraces.length} spans
                    </Badge>
                  </Subtitle2>

                  {/* Search box */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--glass-bg)',
                    border: `1px solid ${searchFocused ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                    boxShadow: searchFocused ? 'var(--shadow-glow)' : 'none',
                    transition: 'all 0.2s ease',
                    flex: '1 1 200px', maxWidth: 320,
                  }}>
                    <Search24Regular style={{ fontSize: 14, color: searchFocused ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0, transition: 'color 0.2s' }} />
                    <input
                      type="text"
                      placeholder="Search traces..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setSearchFocused(true)}
                      onBlur={() => setSearchFocused(false)}
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        color: 'var(--text-primary)', fontSize: 12, width: '100%',
                        fontFamily: 'inherit',
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{
                          background: 'var(--glass-bg-hover)', border: 'none', cursor: 'pointer',
                          color: 'var(--text-secondary)', padding: '1px 5px', fontSize: 14, lineHeight: 1,
                          borderRadius: 4,
                        }}
                      >&#215;</button>
                    )}
                  </div>
                </div>

                {/* Filter pills */}
                {activeAgents.length > 1 && (
                  <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                    <FilterPill label="All" active={!agentFilter} color="var(--accent-primary)" onClick={() => setAgentFilter(null)} />
                    {activeAgents.map(a => {
                      const meta = getAgentMeta(a);
                      return (
                        <FilterPill
                          key={a}
                          label={meta.label}
                          count={traces.filter(t => resolveAgentKey(t) === a).length}
                          active={agentFilter === a}
                          color={meta.color}
                          onClick={() => setAgentFilter(f => f === a ? null : a)}
                        />
                      );
                    })}
                    {(agentFilter || searchQuery) && (
                      <button
                        onClick={() => { setAgentFilter(null); setSearchQuery(''); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          background: 'var(--accent-danger-alpha)', border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: 20, padding: '3px 10px', cursor: 'pointer',
                          color: 'var(--accent-danger)', fontSize: 11, fontFamily: 'inherit',
                        }}
                      >
                        <Delete24Regular style={{ fontSize: 12 }} /> Clear
                      </button>
                    )}
                  </div>
                )}

                {/* Trace list */}
                <div style={{
                  maxHeight: 440, overflowY: 'auto', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--glass-bg)',
                }}>
                  {filteredTraces.length === 0 ? (
                    <div style={{ padding: 30, textAlign: 'center' }}>
                      <Caption1 style={{ opacity: 0.6 }}>
                        {traces.length === 0
                          ? 'No traces yet. Invoke an agent to see spans here.'
                          : 'No traces match your filter.'}
                      </Caption1>
                    </div>
                  ) : (
                    traceGroups.map((group, gi) => (
                      <div key={gi}>
                        <div style={{
                          padding: '6px 14px',
                          background: 'var(--bg-secondary)',
                          borderBottom: '1px solid var(--glass-border)',
                          position: 'sticky', top: 0, zIndex: 2,
                        }}>
                          <Caption1 style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--text-muted)' }}>
                            {group.label} <span style={{ opacity: 0.5, fontWeight: 400 }}>({group.traces.length})</span>
                          </Caption1>
                        </div>
                        {group.traces.map((t, i) => (
                          <TraceRow key={`${gi}-${i}`} trace={t} maxDuration={maxDuration} />
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes slideDown {
          from { opacity: 0; max-height: 0; transform: translateY(-4px); }
          to { opacity: 1; max-height: 400px; transform: translateY(0); }
        }
      `}</style>
    </OverlayShell>
  );
};

// ============================================

const KPICard: React.FC<{
  label: string;
  value: number;
  format: 'number' | 'percent' | 'ms' | 'uptime';
  icon: React.ReactNode;
  danger?: boolean;
}> = ({ label, value, format, icon, danger }) => {
  let display: string;
  switch (format) {
    case 'percent': display = `${(value * 100).toFixed(1)}%`; break;
    case 'ms': display = formatDuration(value); break;
    case 'uptime': {
      const h = Math.floor(value / 60);
      const m = value % 60;
      display = h > 0 ? `${h}h ${m}m` : `${m}m`;
      break;
    }
    default: display = value.toLocaleString();
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
      borderRadius: 'var(--radius-md)',
      background: danger ? 'var(--accent-danger-alpha)' : 'var(--glass-bg)',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : 'var(--glass-border)'}`,
      transition: 'border-color 0.2s',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 'var(--radius-sm)',
        background: danger ? 'var(--accent-danger-alpha)' : 'var(--accent-primary-alpha)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? 'var(--accent-danger)' : 'var(--accent-primary)',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <Text weight="bold" style={{ fontSize: 18, lineHeight: 1.1, display: 'block' }}>{display}</Text>
        <Caption1 style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</Caption1>
      </div>
    </div>
  );
};

// ============================================
// Filter Pill
// ============================================

const FilterPill: React.FC<{
  label: string;
  count?: number;
  active: boolean;
  color: string;
  onClick: () => void;
}> = ({ label, count, active, color, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: active ? `${color}20` : 'var(--glass-bg)',
      border: `1px solid ${active ? `${color}50` : 'var(--glass-border)'}`,
      color: active ? color : 'var(--text-secondary)',
      fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
      transition: 'all 0.15s ease',
      fontWeight: active ? 600 : 400,
    }}
  >
    {active && <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />}
    {label}
    {count !== undefined && <span style={{ opacity: 0.6, fontSize: 10 }}>({count})</span>}
  </button>
);

// ============================================
// Trace Row
// ============================================

const TraceRow: React.FC<{ trace: TraceEntry; maxDuration: number }> = ({ trace, maxDuration }) => {
  const [expanded, setExpanded] = useState(false);
  const barWidth = Math.max((trace.durationMs / maxDuration) * 100, 1.5);
  const isError = trace.status === 'error';
  const agentKey = resolveAgentKey(trace);
  const meta = getAgentMeta(agentKey);
  const hasRequestInfo = !!trace.requestInfo;
  const resp = trace.responseInfo;

  // Token cost estimates (GPT-4.1 mini: $0.40/1M input, $1.60/1M output)
  const estimateCost = (tokens?: TokenUsage) => {
    if (!tokens) return null;
    const inputCost = (tokens.prompt / 1_000_000) * 0.40;
    const outputCost = (tokens.completion / 1_000_000) * 1.60;
    const total = inputCost + outputCost;
    return { inputCost, outputCost, total };
  };

  return (
    <div style={{
      borderBottom: '1px solid var(--glass-border)',
      transition: 'background 0.15s',
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-bg-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Main row */}
      <div
        onClick={() => hasRequestInfo && setExpanded(p => !p)}
        style={{
          display: 'grid',
          gridTemplateColumns: '26px 140px 1fr auto',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          cursor: hasRequestInfo ? 'pointer' : 'default',
        }}
      >
        {/* Expand chevron */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasRequestInfo ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: 20, borderRadius: 5,
              background: expanded ? `${meta.color}20` : 'var(--glass-bg)',
              transition: 'all 0.15s',
            }}>
              {expanded
                ? <ChevronDown16Regular style={{ fontSize: 12, color: meta.color }} />
                : <ChevronRight16Regular style={{ fontSize: 12, color: 'var(--text-muted)' }} />
              }
            </span>
          ) : (
            <span style={{ width: 20 }} />
          )}
        </div>

        {/* Agent icon + label + relative time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5,
            background: isError ? 'var(--accent-danger-alpha)' : `${meta.color}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isError ? 'var(--accent-danger)' : meta.color, flexShrink: 0,
          }}>
            {React.cloneElement(meta.icon as React.ReactElement, { style: { fontSize: 12 } })}
          </div>
          <div style={{ minWidth: 0 }}>
            <Caption1 truncate style={{ fontSize: 11, fontWeight: 600, display: 'block', lineHeight: 1.2 }}>
              {meta.label}
            </Caption1>
            <Caption1 style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>
              {relativeTime(trace.startTime)}
            </Caption1>
          </div>
        </div>

        {/* Latency bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            flex: 1, position: 'relative', height: 7, borderRadius: 4,
            background: 'var(--glass-bg-hover)',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, height: '100%',
              width: `${barWidth}%`, borderRadius: 4,
              background: isError
                ? 'linear-gradient(90deg, #ef4444, #f87171)'
                : `linear-gradient(90deg, ${meta.color}aa, ${meta.color})`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          {/* Duration badge */}
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: isError ? 'var(--accent-danger-alpha)' : durationBadgeColor(trace.durationMs),
            color: isError ? 'var(--accent-danger)' : durationTextColor(trace.durationMs),
            fontSize: 10.5, fontWeight: 600, fontFamily: 'monospace',
            whiteSpace: 'nowrap', minWidth: 52, textAlign: 'center',
          }}>
            {formatDuration(trace.durationMs)}
          </span>
        </div>

        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isError ? 'var(--accent-danger)' : 'var(--accent-success)',
          flexShrink: 0,
          boxShadow: isError ? '0 0 5px rgba(239,68,68,0.4)' : 'none',
        }} />
      </div>

      {/* Inline summary preview (collapsed) */}
      {hasRequestInfo && !expanded && trace.requestInfo && (
        <div style={{ padding: '0 14px 6px 60px' }}>
          <Caption1 truncate style={{
            fontSize: 10.5, color: 'var(--text-muted)', opacity: 0.7,
            fontStyle: 'italic', display: 'block',
          }}>
            {trace.requestInfo.summary}
          </Caption1>
        </div>
      )}

      {/* Expanded details */}
      {expanded && trace.requestInfo && (
        <div style={{
          margin: '0 14px 10px 60px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--expanded-detail-bg, rgba(255,255,255,0.95))',
          border: '1px solid var(--expanded-detail-border, rgba(0,0,0,0.08))',
          animation: 'slideDown 0.2s ease',
          overflow: 'hidden',
        }}>
          {/* Summary */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            <Info16Regular style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
            <Text size={200} weight="semibold" style={{ lineHeight: 1.4, wordBreak: 'break-word' }}>
              {trace.requestInfo.summary}
            </Text>
          </div>

          {/* Metadata grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8, marginBottom: 10,
            padding: '8px 10px', borderRadius: 'var(--radius-sm)',
            background: 'var(--detail-section-bg, rgba(248,250,252,0.9))',
            border: '1px solid var(--detail-section-border, rgba(0,0,0,0.06))',
          }}>
            <MetaField label="Endpoint" value={trace.requestInfo.endpoint} mono />
            <MetaField label="Timestamp" value={new Date(trace.startTime).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', second: '2-digit' })} />
            <MetaField label="Duration" value={formatDuration(trace.durationMs)} />
          </div>

          {/* Input parameters */}
          {trace.requestInfo.input && Object.keys(trace.requestInfo.input).length > 0 && (
            <div>
              <Caption1 style={{
                color: 'var(--text-muted)', fontSize: 9, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, display: 'block',
              }}>
                Request Parameters
              </Caption1>
              <div style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr',
                gap: '4px 14px', padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--detail-section-bg, rgba(248,250,252,0.9))',
                border: '1px solid var(--detail-section-border, rgba(0,0,0,0.06))',
                fontFamily: 'monospace', fontSize: 11,
                maxHeight: 160, overflowY: 'auto',
              }}>
                {Object.entries(trace.requestInfo.input).map(([key, val]) => (
                  <React.Fragment key={key}>
                    <span style={{ color: meta.color, fontWeight: 500 }}>{key}</span>
                    <span style={{ color: 'var(--text-primary)', wordBreak: 'break-word', opacity: 0.9 }}>
                      {val === null ? <em style={{ opacity: 0.4 }}>null</em> : String(val)}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* Algorithm Steps (human-readable pipeline) */}
          {resp?.algorithm && resp.algorithm.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Caption1 style={{
                color: 'var(--text-muted)', fontSize: 9, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block',
              }}>
                How this answer was generated
              </Caption1>
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: 'var(--detail-section-bg, rgba(248,250,252,0.9))',
                border: '1px solid var(--detail-section-border, rgba(0,0,0,0.06))',
              }}>
                {resp.algorithm.map((step, i) => (
                  <div key={step.step} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '6px 0',
                    borderBottom: i < resp.algorithm!.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  }}>
                    {/* Step number circle */}
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: `${meta.color}20`, color: meta.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {step.step}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Caption1 style={{
                        fontWeight: 600, fontSize: 11, color: 'var(--text-primary)',
                        display: 'block', lineHeight: 1.3,
                      }}>
                        {step.label}
                      </Caption1>
                      <Caption1 style={{
                        fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4,
                        display: 'block', marginTop: 1,
                      }}>
                        {step.detail}
                      </Caption1>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning Steps (from the AI model) */}
          {resp?.reasoningSteps && resp.reasoningSteps.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <Caption1 style={{
                color: 'var(--text-muted)', fontSize: 9, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block',
              }}>
                AI Reasoning Chain
              </Caption1>
              <div style={{
                padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--detail-section-bg, rgba(248,250,252,0.9))',
                border: '1px solid var(--detail-section-border, rgba(0,0,0,0.06))',
                maxHeight: 180, overflowY: 'auto',
              }}>
                {resp.reasoningSteps.map((rs, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    padding: '4px 0',
                    borderBottom: i < resp.reasoningSteps!.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: meta.color,
                      minWidth: 18, textAlign: 'center', paddingTop: 1,
                    }}>
                      {rs.step}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Caption1 style={{
                        fontSize: 10.5, color: 'var(--text-primary)', display: 'block',
                        wordBreak: 'break-word', lineHeight: 1.4,
                      }}>
                        {rs.description}
                      </Caption1>
                      {rs.dataSource && (
                        <Caption1 style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.7 }}>
                          Source: {rs.dataSource}
                        </Caption1>
                      )}
                    </div>
                    {rs.confidence > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: '1px 6px',
                        borderRadius: 8,
                        background: rs.confidence >= 0.8 ? 'var(--accent-success-alpha)' : rs.confidence >= 0.5 ? 'var(--accent-warning-alpha)' : 'var(--accent-danger-alpha)',
                        color: rs.confidence >= 0.8 ? 'var(--accent-success)' : rs.confidence >= 0.5 ? 'var(--accent-warning)' : 'var(--accent-danger)',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {(rs.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Token Usage & Cost Estimate */}
          {resp?.tokensUsed && (
            <div style={{ marginTop: 10 }}>
              <Caption1 style={{
                color: 'var(--text-muted)', fontSize: 9, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block',
              }}>
                Token Usage & Cost
              </Caption1>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                background: 'var(--detail-section-bg, rgba(248,250,252,0.9))',
                border: '1px solid var(--detail-section-border, rgba(0,0,0,0.06))',
              }}>
                <div>
                  <Caption1 style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Model</Caption1>
                  <Caption1 style={{ display: 'block', marginTop: 1, fontSize: 11, fontWeight: 600 }}>
                    {resp.model || 'gpt-4.1-mini'}
                  </Caption1>
                </div>
                <div>
                  <Caption1 style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Prompt</Caption1>
                  <Caption1 style={{ display: 'block', marginTop: 1, fontSize: 11, fontFamily: 'monospace' }}>
                    {resp.tokensUsed.prompt.toLocaleString()} <span style={{ fontSize: 9, opacity: 0.5 }}>tok</span>
                  </Caption1>
                </div>
                <div>
                  <Caption1 style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Completion</Caption1>
                  <Caption1 style={{ display: 'block', marginTop: 1, fontSize: 11, fontFamily: 'monospace' }}>
                    {resp.tokensUsed.completion.toLocaleString()} <span style={{ fontSize: 9, opacity: 0.5 }}>tok</span>
                  </Caption1>
                </div>
                <div>
                  <Caption1 style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>Est. Cost</Caption1>
                  <Caption1 style={{ display: 'block', marginTop: 1, fontSize: 11, fontWeight: 600, color: meta.color }}>
                    {(() => {
                      const cost = estimateCost(resp.tokensUsed);
                      if (!cost) return '—';
                      return cost.total < 0.001 ? '<$0.001' : `$${cost.total.toFixed(4)}`;
                    })()}
                  </Caption1>
                </div>
              </div>
              {/* Confidence badge */}
              {resp.confidence !== undefined && resp.confidence > 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Caption1 style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase' }}>
                    Confidence
                  </Caption1>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: 'var(--glass-bg-hover)', overflow: 'hidden', maxWidth: 120,
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 3,
                      width: `${resp.confidence * 100}%`,
                      background: resp.confidence >= 0.8
                        ? 'var(--accent-success)'
                        : resp.confidence >= 0.5 ? 'var(--accent-warning)' : 'var(--accent-danger)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <Caption1 style={{
                    fontSize: 10, fontWeight: 600,
                    color: resp.confidence >= 0.8
                      ? 'var(--accent-success)'
                      : resp.confidence >= 0.5 ? 'var(--accent-warning)' : 'var(--accent-danger)',
                  }}>
                    {(resp.confidence * 100).toFixed(0)}%
                  </Caption1>
                </div>
              )}
            </div>
          )}

          {/* Error detail */}
          {isError && trace.error && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--accent-danger-alpha)', border: '1px solid rgba(239,68,68,0.2)',
              display: 'flex', alignItems: 'flex-start', gap: 6,
            }}>
              <ErrorCircle24Regular style={{ fontSize: 14, color: 'var(--accent-danger)', flexShrink: 0, marginTop: 1 }} />
              <Caption1 style={{ color: 'var(--accent-danger)', fontWeight: 500, wordBreak: 'break-word' }}>{trace.error}</Caption1>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// Metadata Field
// ============================================

const MetaField: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div>
    <Caption1 style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {label}
    </Caption1>
    <Caption1 style={{
      display: 'block', marginTop: 1,
      fontFamily: mono ? 'monospace' : 'inherit',
      fontSize: 11, wordBreak: 'break-all',
    }}>
      {value}
    </Caption1>
  </div>
);

export default AgentTraceViewer;

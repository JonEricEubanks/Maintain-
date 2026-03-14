/**
 * MAINTAIN AI — AI Decision Log Component
 *
 * Full audit trail of every AI recommendation for governance & responsible AI.
 * Shows reasoning chains, confidence scores, human overrides, and model info.
 *
 * ALL DATA from Dataverse (read). Demonstrates AI transparency.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  Button,
  Divider,
  Spinner,
  ProgressBar,
  Tooltip,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import {
  Brain24Regular,
  Shield24Regular,
  Person24Regular,
  Clock24Regular,
  ArrowTrending24Regular,
  Warning24Regular,
  Info24Regular,
  ChevronDown24Regular,
  ChevronUp24Regular,
  Eye24Regular,
  DocumentBulletList24Regular,
  Search24Regular,
  DataBarVertical24Regular,
  Wrench24Regular,
  Document24Regular,
  Comment24Regular,
  VehicleTruckProfile24Regular,
  Bot24Regular,
} from '@fluentui/react-icons';

import type {
  AIDecisionLogEntry,
  AIAgentName,
  AIDecisionType,
  ReasoningStep,
} from '../types/infrastructure';
import dataverseService from '../services/dataverseService';

// ============================================
// Props
// ============================================

interface AIDecisionLogProps {
  maxEntries?: number;
  filterAgent?: AIAgentName;
}

// ============================================
// Component
// ============================================

const AIDecisionLog: React.FC<AIDecisionLogProps> = ({
  maxEntries = 50,
  filterAgent,
}) => {
  const [entries, setEntries] = useState<AIDecisionLogEntry[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byAgent: Record<string, number>;
    overrideRate: number;
    avgConfidence: number;
    avgProcessingTime: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [agentFilter, setAgentFilter] = useState<AIAgentName | 'all'>(filterAgent || 'all');

  // Load data from Dataverse — auto-seed demo entries if empty
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      let entryData = await dataverseService.getAIDecisions({
        agentName: agentFilter !== 'all' ? agentFilter : undefined,
        limit: maxEntries,
      });

      // Auto-seed demo decisions if the log is empty
      if (entryData.length === 0 && agentFilter === 'all') {
        await dataverseService.seedDemoData();
        entryData = await dataverseService.getAIDecisions({ limit: maxEntries });
      }

      const statsData = await dataverseService.getAIDecisionStats();
      setEntries(entryData);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load AI decisions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [agentFilter, maxEntries]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleExpanded = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  // Override handler
  const handleOverride = async (entry: AIDecisionLogEntry) => {
    const reason = window.prompt('Reason for overriding this AI decision:');
    if (!reason) return;
    await dataverseService.markAIDecisionOverridden(entry.id, reason);
    await loadData();
  };

  return (
    <div className="ai-decision-log glass-panel fade-in" style={{
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--spacing-lg)',
      gap: 'var(--spacing-md)',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <Shield24Regular style={{ color: 'var(--accent-primary)' }} />
          <Title2>AI Decision Log</Title2>
        </div>
        <Badge appearance="tint" color="informative">
          {entries.length} Decisions
        </Badge>
      </div>

      {/* Stats Row */}
      {stats && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 'var(--spacing-xs)',
        }}>
          <StatCard label="Total" value={stats.total.toString()} icon={<Brain24Regular />} />
          <StatCard
            label="Avg Confidence"
            value={`${(stats.avgConfidence * 100).toFixed(0)}%`}
            icon={<ArrowTrending24Regular />}
          />
          <StatCard
            label="Override Rate"
            value={`${(stats.overrideRate * 100).toFixed(1)}%`}
            icon={<Person24Regular />}
            highlight={stats.overrideRate > 0.1}
          />
          <StatCard
            label="Avg Time"
            value={`${stats.avgProcessingTime.toFixed(0)}ms`}
            icon={<Clock24Regular />}
          />
        </div>
      )}

      <Divider />

      {/* Filter */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
        <Text weight="semibold" style={{ fontSize: 13 }}>Filter:</Text>
        <Dropdown
          value={agentFilter === 'all' ? 'All Agents' : agentLabels[agentFilter]}
          onOptionSelect={(_, d) => setAgentFilter(d.optionValue as AIAgentName | 'all')}
          style={{ minWidth: 160 }}
        >
          <Option value="all">All Agents</Option>
          <Option value="analysis">Analysis Agent</Option>
          <Option value="prioritization">Prioritization Agent</Option>
          <Option value="crew_estimation">Crew Estimation</Option>
          <Option value="report">Report Agent</Option>
          <Option value="nlp_dashboard">NLP Dashboard</Option>
          <Option value="dispatch">Dispatch Agent</Option>
        </Dropdown>
      </div>

      {/* Entries */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-xl)' }}>
          <Spinner label="Loading AI decision log..." />
        </div>
      ) : (
        <div style={{
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-xs)',
        }}>
          {entries.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 'var(--spacing-xl)',
              opacity: 0.6,
            }}>
              <Shield24Regular style={{ fontSize: 48, marginBottom: 'var(--spacing-sm)' }} />
              <Text>No AI decisions recorded yet.</Text>
              <Caption1>Run an analysis or generate a dispatch plan to see entries here.</Caption1>
            </div>
          ) : (
            entries.map(entry => (
              <DecisionEntry
                key={entry.id}
                entry={entry}
                isExpanded={expandedIds.has(entry.id)}
                onToggle={() => toggleExpanded(entry.id)}
                onOverride={() => handleOverride(entry)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// Sub-Components
// ============================================

const StatCard: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}> = ({ label, value, icon, highlight }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--spacing-xs)',
    borderRadius: 'var(--radius-sm)',
    background: highlight ? 'rgba(255, 165, 2, 0.08)' : 'rgba(255, 255, 255, 0.03)',
    border: highlight ? '1px solid rgba(255, 165, 2, 0.2)' : '1px solid transparent',
  }}>
    <div style={{ color: highlight ? 'var(--accent-warning)' : 'var(--accent-primary)', marginBottom: 2 }}>
      {icon}
    </div>
    <Text weight="semibold" style={{ fontSize: 14 }}>{value}</Text>
    <Caption1 style={{ color: 'var(--text-muted)' }}>{label}</Caption1>
  </div>
);

const DecisionEntry: React.FC<{
  entry: AIDecisionLogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onOverride: () => void;
}> = ({ entry, isExpanded, onToggle, onOverride }) => {
  let reasoning: Array<{ step?: number; description?: string }> = [];
  try {
    reasoning = JSON.parse(entry.reasoningJson || '[]');
  } catch { /* ignore */ }

  const timeAgo = getTimeAgo(entry.createdAt);

  return (
    <div style={{
      padding: 'var(--spacing-sm)',
      borderRadius: 'var(--radius-md)',
      background: entry.humanOverride
        ? 'rgba(255, 165, 2, 0.06)'
        : 'rgba(255, 255, 255, 0.03)',
      border: `1px solid ${entry.humanOverride ? 'rgba(255, 165, 2, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
    }}>
      {/* Main Row */}
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: agentColors[entry.agentName] || 'rgba(255, 255, 255, 0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          fontSize: 14,
        }}>
          {agentIcons[entry.agentName] || <Bot24Regular />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', flexWrap: 'wrap' }}>
            <Text weight="semibold" style={{ fontSize: 13 }}>
              {agentLabels[entry.agentName]}
            </Text>
            <Badge size="small" appearance="outline">
              {decisionTypeLabels[entry.decisionType]}
            </Badge>
            {entry.humanOverride && (
              <Badge size="small" color="warning">
                <Person24Regular style={{ fontSize: 12 }} /> Overridden
              </Badge>
            )}
          </div>
          <Caption1 style={{ color: 'var(--text-muted)', display: 'block' }}>
            {timeAgo} · {entry.modelName} · {(entry.confidenceScore * 100).toFixed(0)}% confidence
            {entry.processingTimeMs ? ` · ${entry.processingTimeMs}ms` : ''}
          </Caption1>
        </div>

        <div style={{ color: 'var(--text-muted)' }}>
          {isExpanded ? <ChevronUp24Regular /> : <ChevronDown24Regular />}
        </div>
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div style={{
          marginTop: 'var(--spacing-sm)',
          paddingTop: 'var(--spacing-sm)',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          {/* Reasoning Chain */}
          {Array.isArray(reasoning) && reasoning.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <Text weight="semibold" style={{ fontSize: 12, color: 'var(--accent-primary)', display: 'block', marginBottom: 4 }}>
                <Brain24Regular style={{ fontSize: 14, marginRight: 4 }} />
                Reasoning Chain
              </Text>
              {reasoning.map((step, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: 'var(--spacing-xs)',
                  marginLeft: 'var(--spacing-sm)',
                  marginBottom: 2,
                }}>
                  <Caption1 style={{ color: 'var(--accent-primary)', minWidth: 16 }}>
                    {step.step || (i + 1)}.
                  </Caption1>
                  <Caption1 style={{ color: 'var(--text-secondary)' }}>
                    {step.description || JSON.stringify(step)}
                  </Caption1>
                </div>
              ))}
            </div>
          )}

          {/* Confidence Bar */}
          <div style={{ marginBottom: 'var(--spacing-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <Caption1>Confidence</Caption1>
              <Caption1 style={{ fontWeight: 600 }}>{(entry.confidenceScore * 100).toFixed(0)}%</Caption1>
            </div>
            <ProgressBar
              value={entry.confidenceScore}
              color={entry.confidenceScore > 0.8 ? 'success' : entry.confidenceScore > 0.6 ? 'warning' : 'error'}
            />
          </div>

          {/* Override info */}
          {entry.humanOverride && entry.overrideReason && (
            <div style={{
              padding: 'var(--spacing-xs)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 165, 2, 0.1)',
              marginBottom: 'var(--spacing-sm)',
            }}>
              <Caption1 style={{ color: 'var(--accent-warning)' }}>
                <Warning24Regular style={{ fontSize: 14, marginRight: 4 }} />
                <strong>Human Override:</strong> {entry.overrideReason}
              </Caption1>
            </div>
          )}

          {/* Related WOs */}
          {entry.relatedWorkOrderIds.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <Caption1 style={{ color: 'var(--text-muted)' }}>
                Related: {entry.relatedWorkOrderIds.join(', ')}
              </Caption1>
            </div>
          )}

          {/* Actions */}
          {!entry.humanOverride && (
            <Button
              size="small"
              appearance="subtle"
              icon={<Person24Regular />}
              onClick={(e) => { e.stopPropagation(); onOverride(); }}
            >
              Override Decision
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// Labels & Colors
// ============================================

const agentLabels: Record<AIAgentName, string> = {
  analysis: 'Analysis Agent',
  prioritization: 'Prioritization Agent',
  crew_estimation: 'Crew Estimation',
  report: 'Report Agent',
  nlp_dashboard: 'NLP Dashboard',
  dispatch: 'Dispatch Agent',
};

const agentIcons: Record<AIAgentName, React.ReactNode> = {
  analysis: <Search24Regular />,
  prioritization: <DataBarVertical24Regular />,
  crew_estimation: <Wrench24Regular />,
  report: <Document24Regular />,
  nlp_dashboard: <Comment24Regular />,
  dispatch: <VehicleTruckProfile24Regular />,
};

const agentColors: Record<AIAgentName, string> = {
  analysis: 'rgba(59, 130, 246, 0.2)',
  prioritization: 'rgba(139, 92, 246, 0.2)',
  crew_estimation: 'rgba(245, 158, 11, 0.2)',
  report: 'rgba(16, 185, 129, 0.2)',
  nlp_dashboard: 'rgba(236, 72, 153, 0.2)',
  dispatch: 'rgba(249, 115, 22, 0.2)',
};

const decisionTypeLabels: Record<AIDecisionType, string> = {
  priority_ranking: 'Priority Ranking',
  crew_assignment: 'Crew Assignment',
  risk_assessment: 'Risk Assessment',
  cost_estimation: 'Cost Estimation',
  route_optimization: 'Route Optimization',
  weather_impact: 'Weather Impact',
  proactive_alert: 'Proactive Alert',
  dispatch_recommendation: 'Dispatch Plan',
  weibull_survival_assessment: 'Weibull Survival',
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default AIDecisionLog;

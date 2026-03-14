/**
 * MAINTAIN AI — Dispatch Queue Component
 *
 * AI-ranked work orders with one-click approve → dispatch workflow.
 * Reads from MCP (read-only), writes to Dataverse via dispatchService.
 *
 * Workflow: AI Recommends → Manager Reviews → Approve/Reject → Dispatch Crew
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  Button,
  Spinner,
  Divider,
  ProgressBar,
  Tooltip,
  Checkbox,
} from '@fluentui/react-components';
import {
  Send24Regular,
  Checkmark24Regular,
  Dismiss24Regular,
  Brain24Regular,
  ArrowTrending24Regular,
  People24Regular,
  Clock24Regular,
  Money24Regular,
  Warning24Regular,
  CheckmarkCircle24Regular,
  ArrowSync24Regular,
  LocationRegular,
  VehicleTruckProfile24Regular,
  WeatherSunny24Regular,
} from '@fluentui/react-icons';

import type {
  WorkOrder,
  Crew,
  CrewDispatch,
  DispatchStatus,
  Severity,
} from '../types/infrastructure';
import type { DispatchPlan } from '../services/dispatchService';
import dispatchService from '../services/dispatchService';
import dataverseService from '../services/dataverseService';

// ============================================
// Props
// ============================================

interface DispatchQueueProps {
  workOrders: WorkOrder[];
  crews: Crew[];
  onDispatchCreated?: (dispatch: CrewDispatch) => void;
  onWorkOrderSelect?: (woId: string) => void;
}

// ============================================
// Component
// ============================================

const DispatchQueue: React.FC<DispatchQueueProps> = ({
  workOrders,
  crews,
  onDispatchCreated,
  onWorkOrderSelect,
}) => {
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [existingDispatches, setExistingDispatches] = useState<CrewDispatch[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isApproving, setIsApproving] = useState(false);
  const [approver] = useState('Manager'); // In production, comes from auth context

  // Load existing dispatches on mount
  useEffect(() => {
    dataverseService.getDispatches().then(setExistingDispatches);
  }, []);

  // Generate AI recommendations
  const handleGeneratePlan = useCallback(async () => {
    setIsGenerating(true);
    try {
      const result = await dispatchService.generateDispatchPlan(workOrders, crews);
      setPlan(result);
      // Auto-select all
      setSelectedIndices(new Set(result.recommendations.map((_, i) => i)));
    } catch (err) {
      console.error('Failed to generate dispatch plan:', err);
    } finally {
      setIsGenerating(false);
    }
  }, [workOrders, crews]);

  // Approve selected recommendations
  const handleApproveSelected = useCallback(async () => {
    if (!plan) return;
    setIsApproving(true);
    try {
      const selected = plan.recommendations.filter((_, i) => selectedIndices.has(i));
      const dispatches = await dispatchService.createDispatchesFromRecommendations(selected, approver);
      
      // Refresh dispatches list
      const updated = await dataverseService.getDispatches();
      setExistingDispatches(updated);
      
      dispatches.forEach(d => onDispatchCreated?.(d));
      setPlan(null);
      setSelectedIndices(new Set());
    } catch (err) {
      console.error('Failed to approve dispatches:', err);
    } finally {
      setIsApproving(false);
    }
  }, [plan, selectedIndices, approver, onDispatchCreated]);

  // Toggle selection
  const toggleSelection = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelectedIndices(next);
  };

  // Status helpers
  const getStatusColor = (status: DispatchStatus): 'success' | 'warning' | 'danger' | 'informative' | 'important' | 'subtle' => {
    switch (status) {
      case 'completed': return 'success';
      case 'dispatched':
      case 'in_progress': return 'informative';
      case 'approved': return 'important';
      case 'pending_approval': return 'warning';
      case 'rejected':
      case 'cancelled': return 'danger';
      default: return 'subtle';
    }
  };

  const getPriorityColor = (p: Severity): string => {
    switch (p) {
      case 'critical': return '#ff4757';
      case 'high': return '#ffa502';
      case 'medium': return '#3742fa';
      default: return '#747d8c';
    }
  };

  return (
    <div className="dispatch-queue glass-panel fade-in" style={{
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
          <Send24Regular style={{ color: 'var(--accent-primary)' }} />
          <Title2>Dispatch Queue</Title2>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          <Badge appearance="filled" color="informative">
            {existingDispatches.filter(d => d.status === 'dispatched').length} Active
          </Badge>
          <Badge appearance="filled" color="warning">
            {existingDispatches.filter(d => d.status === 'pending_approval').length} Pending
          </Badge>
        </div>
      </div>

      <Divider />

      {/* Generate Plan Button */}
      {!plan && (
        <Button
          appearance="primary"
          icon={<Brain24Regular />}
          onClick={handleGeneratePlan}
          disabled={isGenerating || workOrders.length === 0}
          style={{ width: '100%' }}
        >
          {isGenerating ? (
            <>
              <Spinner size="tiny" style={{ marginRight: 8 }} />
              AI Analyzing {workOrders.length} Work Orders...
            </>
          ) : (
            `Generate AI Dispatch Plan (${workOrders.filter(w => w.status === 'open').length} open)`
          )}
        </Button>
      )}

      {/* AI Recommendations */}
      {plan && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          {/* Plan Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--spacing-xs)',
          }}>
            <StatMini icon={<People24Regular />} label="Crews" value={`${plan.crewUtilization.toFixed(0)}% util`} />
            <StatMini icon={<Clock24Regular />} label="Hours" value={`${plan.totalEstimatedHours.toFixed(1)}h`} />
            <StatMini icon={<Money24Regular />} label="Cost" value={`$${(plan.totalEstimatedCost / 1000).toFixed(1)}k`} />
          </div>

          <Caption1 style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
            <WeatherSunny24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> {plan.weatherWindow}
          </Caption1>

          <Divider />

          {/* Recommendation List */}
          <div style={{
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-xs)',
            maxHeight: 350,
          }}>
            {plan.recommendations.map((rec, i) => (
              <div
                key={rec.workOrderId}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--spacing-sm)',
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  background: selectedIndices.has(i)
                    ? 'rgba(59, 130, 246, 0.1)'
                    : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${selectedIndices.has(i) ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => onWorkOrderSelect?.(rec.workOrderId)}
              >
                <Checkbox
                  checked={selectedIndices.has(i)}
                  onChange={() => toggleSelection(i)}
                  onClick={e => e.stopPropagation()}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 2 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: getPriorityColor(rec.priority),
                    }} />
                    <Text weight="semibold" style={{ fontSize: 13 }}>
                      {rec.workOrder.issueType.charAt(0).toUpperCase() + rec.workOrder.issueType.slice(1)} — {rec.priority}
                    </Text>
                    <Badge size="small" appearance="outline" color={rec.confidence > 0.85 ? 'success' : rec.confidence > 0.7 ? 'warning' : 'danger'}>
                      {(rec.confidence * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <Caption1 style={{ color: 'var(--text-muted)', display: 'block' }}>
                    <LocationRegular style={{ fontSize: 12 }} /> {rec.workOrder.address}
                  </Caption1>
                  <Caption1 style={{ color: 'var(--text-muted)', display: 'block' }}>
                    <VehicleTruckProfile24Regular style={{ fontSize: 12 }} /> {rec.recommendedCrew.name} · {rec.estimatedDuration}h · ${rec.estimatedCost.toLocaleString()}
                  </Caption1>
                </div>
              </div>
            ))}
          </div>

          {/* Approve / Cancel */}
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <Button
              appearance="primary"
              icon={<Checkmark24Regular />}
              onClick={handleApproveSelected}
              disabled={isApproving || selectedIndices.size === 0}
              style={{ flex: 1 }}
            >
              {isApproving ? 'Approving...' : `Approve & Dispatch (${selectedIndices.size})`}
            </Button>
            <Button
              appearance="subtle"
              icon={<Dismiss24Regular />}
              onClick={() => { setPlan(null); setSelectedIndices(new Set()); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Active Dispatches */}
      {!plan && existingDispatches.length > 0 && (
        <div style={{
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-xs)',
        }}>
          <Title3 style={{ marginBottom: 'var(--spacing-xs)' }}>Active Dispatches</Title3>
          {existingDispatches
            .filter(d => !['completed', 'cancelled', 'rejected'].includes(d.status))
            .map(d => (
              <DispatchCard
                key={d.id}
                dispatch={d}
                onStatusChange={async (newStatus) => {
                  if (newStatus === 'dispatched') await dataverseService.markDispatched(d.id);
                  else if (newStatus === 'in_progress') await dataverseService.markInProgress(d.id);
                  const updated = await dataverseService.getDispatches();
                  setExistingDispatches(updated);
                }}
              />
            ))}

          {existingDispatches.filter(d => d.status === 'completed').length > 0 && (
            <>
              <Divider style={{ margin: 'var(--spacing-sm) 0' }} />
              <Title3 style={{ marginBottom: 'var(--spacing-xs)' }}>
                <CheckmarkCircle24Regular style={{ color: 'var(--accent-success)', marginRight: 4 }} />
                Completed ({existingDispatches.filter(d => d.status === 'completed').length})
              </Title3>
              {existingDispatches
                .filter(d => d.status === 'completed')
                .slice(0, 3)
                .map(d => (
                  <DispatchCard key={d.id} dispatch={d} />
                ))}
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!plan && existingDispatches.length === 0 && !isGenerating && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          gap: 'var(--spacing-md)',
          opacity: 0.6,
        }}>
          <Send24Regular style={{ fontSize: 48, color: 'var(--accent-primary)' }} />
          <Text align="center">
            No dispatches yet. Generate an AI dispatch plan<br />to start sending crews out.
          </Text>
        </div>
      )}
    </div>
  );
};

// ============================================
// Sub-Components
// ============================================

const StatMini: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--spacing-xs)',
    borderRadius: 'var(--radius-sm)',
    background: 'rgba(255, 255, 255, 0.03)',
  }}>
    <div style={{ color: 'var(--accent-primary)', marginBottom: 2 }}>{icon}</div>
    <Text weight="semibold" style={{ fontSize: 13 }}>{value}</Text>
    <Caption1 style={{ color: 'var(--text-muted)' }}>{label}</Caption1>
  </div>
);

const DispatchCard: React.FC<{
  dispatch: CrewDispatch;
  onStatusChange?: (status: DispatchStatus) => void;
}> = ({ dispatch, onStatusChange }) => {
  const statusLabel: Record<DispatchStatus, string> = {
    draft: 'Draft',
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    dispatched: 'Dispatched',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    rejected: 'Rejected',
  };

  const getStatusColor = (status: DispatchStatus): 'success' | 'warning' | 'danger' | 'informative' | 'important' | 'subtle' => {
    switch (status) {
      case 'completed': return 'success';
      case 'dispatched':
      case 'in_progress': return 'informative';
      case 'approved': return 'important';
      case 'pending_approval': return 'warning';
      case 'rejected':
      case 'cancelled': return 'danger';
      default: return 'subtle';
    }
  };

  const nextAction = (): { label: string; status: DispatchStatus } | null => {
    switch (dispatch.status) {
      case 'approved': return { label: 'Send Crew', status: 'dispatched' };
      case 'dispatched': return { label: 'Mark In Progress', status: 'in_progress' };
      default: return null;
    }
  };

  const action = nextAction();

  return (
    <div style={{
      padding: 'var(--spacing-sm)',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text weight="semibold" style={{ fontSize: 13 }}>{dispatch.name}</Text>
        <Badge size="small" color={getStatusColor(dispatch.status)}>
          {statusLabel[dispatch.status]}
        </Badge>
      </div>
      <Caption1 style={{ color: 'var(--text-muted)', display: 'block' }}>
        {dispatch.crewName} → {dispatch.address}
      </Caption1>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Caption1 style={{ color: 'var(--text-muted)' }}>
          {dispatch.estimatedDuration}h · ${dispatch.estimatedCost?.toLocaleString()} · AI {(dispatch.aiConfidence * 100).toFixed(0)}%
        </Caption1>
        {action && onStatusChange && (
          <Button
            size="small"
            appearance="primary"
            onClick={() => onStatusChange(action.status)}
          >
            {action.label}
          </Button>
        )}
      </div>
      {dispatch.status === 'completed' && dispatch.actualDuration != null && (
        <Caption1 style={{ color: 'var(--accent-success)', display: 'block', marginTop: 4 }}>
          <CheckmarkCircle24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Actual: {dispatch.actualDuration}h / ${dispatch.actualCost?.toLocaleString() ?? '—'}
        </Caption1>
      )}
    </div>
  );
};

export default DispatchQueue;

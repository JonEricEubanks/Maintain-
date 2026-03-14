/**
 * AnalyticsWidgets — Four-widget grid showing severity, cost, crew, and
 * performance metrics. Context-switches between overview and work-order
 * detail when a work order is selected on the map.
 *
 * Extracted from Dashboard.tsx to reduce monolith risk and improve
 * maintainability during live demos.
 */

import React from 'react';
import {
  VehicleTruckProfile24Regular,
  LightbulbFilament24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder, Crew, AIInsight, CrewEstimation } from '../types/infrastructure';

interface AnalyticsWidgetsProps {
  workOrders: WorkOrder[];
  filteredWorkOrders: WorkOrder[];
  crews: Crew[];
  selectedWorkOrder: WorkOrder | null;
  mapState: { selectedWorkOrderId: string | null };
  aiOpsCount: number;
  analystHoursSaved: number;
  infraDebt: number;
  getPriorityScore: (wo: WorkOrder) => number;
}

const sevColors: Record<string, string> = {
  critical: 'var(--priority-critical)',
  high: 'var(--priority-high)',
  medium: 'var(--priority-medium)',
  low: 'var(--priority-low)',
};

const sevLabels: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const AnalyticsWidgets: React.FC<AnalyticsWidgetsProps> = ({
  workOrders,
  filteredWorkOrders,
  crews,
  selectedWorkOrder: selWO,
  mapState,
  aiOpsCount,
  analystHoursSaved,
  infraDebt,
  getPriorityScore,
}) => {
  const sevCounts = {
    critical: filteredWorkOrders.filter(w => w.severity === 'critical').length,
    high: filteredWorkOrders.filter(w => w.severity === 'high').length,
    medium: filteredWorkOrders.filter(w => w.severity === 'medium').length,
    low: filteredWorkOrders.filter(w => w.severity === 'low').length,
  };
  const totalSevCount = sevCounts.critical + sevCounts.high + sevCounts.medium + sevCounts.low;
  const avgCost = filteredWorkOrders.length > 0
    ? filteredWorkOrders.reduce((s, w) => s + w.estimatedCost, 0) / filteredWorkOrders.length
    : 0;

  // WO detail context
  const assignedCrew = selWO?.assignedCrewId ? crews.find(c => c.id === selWO.assignedCrewId) : null;
  const bestCrew = !assignedCrew && selWO
    ? crews.filter(c => c.status === 'available').sort((a, b) => {
        const specMatch = (c: Crew) => c.specialization === selWO.issueType || c.specialization === 'general' ? 1 : 0;
        return specMatch(b) - specMatch(a) || b.efficiencyRating - a.efficiencyRating;
      })[0]
    : null;
  const woAge = selWO ? Math.max(0, Math.floor((Date.now() - new Date(selWO.createdAt).getTime()) / 86400000)) : 0;
  const zoneWOs = selWO ? workOrders.filter(w => w.zone === selWO.zone) : [];

  return (
    <div className="dash-widgets-grid">

      {/* ── Widget 1: Severity Breakdown / WO Severity Context ── */}
      <div className="dash-widget" style={selWO ? { borderColor: sevColors[selWO.severity], borderWidth: 1.5 } : {}}>
        <div className="dash-widget-header">
          <span className="dash-widget-title">{selWO ? 'Severity Context' : 'Severity Breakdown'}</span>
          <span className="dash-widget-badge">{selWO ? sevLabels[selWO.severity] : filteredWorkOrders.length}</span>
        </div>
        <div className="dash-widget-body">
          {selWO ? (
            <>
              <div style={{ textAlign: 'center', padding: '2px 0' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: sevColors[selWO.severity] }}>{sevLabels[selWO.severity]}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Priority Score: {getPriorityScore(selWO)}/99</div>
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                {(['critical', 'high', 'medium', 'low'] as const).map(s => (
                  <div key={s} style={{
                    flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 6,
                    background: s === selWO.severity ? `${sevColors[s]}22` : 'transparent',
                    border: s === selWO.severity ? `1.5px solid ${sevColors[s]}` : '1px solid transparent',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: sevColors[s] }}>{workOrders.filter(w => w.severity === s).length}</div>
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.slice(0, 4)}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            ([
              { key: 'critical', label: 'Critical', color: 'var(--priority-critical)', count: sevCounts.critical },
              { key: 'high', label: 'High', color: 'var(--priority-high)', count: sevCounts.high },
              { key: 'medium', label: 'Medium', color: 'var(--priority-medium)', count: sevCounts.medium },
              { key: 'low', label: 'Low', color: 'var(--priority-low)', count: sevCounts.low },
            ] as const).map(item => (
              <div key={item.key} className="dash-sev-row">
                <span className="dash-sev-dot" style={{ background: item.color }} />
                <span className="dash-sev-label">{item.label}</span>
                <div className="dash-sev-bar-track">
                  <div className="dash-sev-bar-fill" style={{ width: totalSevCount > 0 ? `${(item.count / totalSevCount) * 100}%` : '0%', background: item.color }} />
                </div>
                <span className="dash-sev-count" style={{ color: item.color }}>{item.count}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Widget 2: Cost Summary / WO Cost Detail ── */}
      <div className="dash-widget">
        <div className="dash-widget-header">
          <span className="dash-widget-title">{selWO ? 'Cost Detail' : 'Cost Summary'}</span>
        </div>
        <div className="dash-widget-body">
          {selWO ? (
            <>
              <div className="dash-cost-hero">
                <span className="dash-cost-label">{selWO.issueType.charAt(0).toUpperCase() + selWO.issueType.slice(1)} Repair</span>
                <span className="dash-cost-value" style={{ color: selWO.estimatedCost >= 3000 ? 'var(--priority-critical)' : selWO.estimatedCost >= 1000 ? 'var(--priority-high)' : 'var(--accent-success)' }}>
                  ${Math.round(selWO.estimatedCost).toLocaleString()}
                </span>
              </div>
              <div className="dash-cost-breakdown">
                <div className="dash-cost-item">
                  <span className="dash-cost-item-dot" style={{ background: 'var(--accent-indigo)' }} />
                  <span className="dash-cost-item-label">Avg ({filteredWorkOrders.length})</span>
                  <span className="dash-cost-item-val" style={{ color: 'var(--accent-indigo)' }}>${avgCost >= 1000 ? `${(avgCost / 1000).toFixed(1)}K` : Math.round(avgCost)}</span>
                </div>
                <div className="dash-cost-item">
                  <span className="dash-cost-item-dot" style={{ background: selWO.estimatedCost > avgCost ? 'var(--priority-critical)' : 'var(--accent-success)' }} />
                  <span className="dash-cost-item-label">vs Avg</span>
                  <span className="dash-cost-item-val" style={{ color: selWO.estimatedCost > avgCost ? 'var(--priority-critical)' : 'var(--accent-success)' }}>
                    {selWO.estimatedCost > avgCost ? '+' : ''}{avgCost > 0 ? Math.round(((selWO.estimatedCost - avgCost) / avgCost) * 100) : 0}%
                  </span>
                </div>
                <div className="dash-cost-item">
                  <span className="dash-cost-item-dot" style={{ background: 'var(--accent-warning)' }} />
                  <span className="dash-cost-item-label">Zone Total</span>
                  <span className="dash-cost-item-val" style={{ color: 'var(--accent-warning)' }}>
                    ${zoneWOs.reduce((s, w) => s + w.estimatedCost, 0) >= 1000 ? `${(zoneWOs.reduce((s, w) => s + w.estimatedCost, 0) / 1000).toFixed(1)}K` : zoneWOs.reduce((s, w) => s + w.estimatedCost, 0)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="dash-cost-hero">
                <span className="dash-cost-label">Total Estimate</span>
                <span className="dash-cost-value">
                  ${filteredWorkOrders.length > 0 ? Math.round(filteredWorkOrders.reduce((s, w) => s + w.estimatedCost, 0)).toLocaleString() : '0'}
                </span>
              </div>
              <div className="dash-cost-breakdown">
                {([
                  { label: 'Critical', color: 'var(--priority-critical)', cost: filteredWorkOrders.filter(w => w.severity === 'critical').reduce((s, w) => s + w.estimatedCost, 0) },
                  { label: 'High', color: 'var(--priority-high)', cost: filteredWorkOrders.filter(w => w.severity === 'high').reduce((s, w) => s + w.estimatedCost, 0) },
                  { label: 'Other', color: 'var(--text-secondary)', cost: filteredWorkOrders.filter(w => w.severity === 'medium' || w.severity === 'low').reduce((s, w) => s + w.estimatedCost, 0) },
                ]).map(item => (
                  <div key={item.label} className="dash-cost-item">
                    <span className="dash-cost-item-dot" style={{ background: item.color }} />
                    <span className="dash-cost-item-label">{item.label}</span>
                    <span className="dash-cost-item-val" style={{ color: item.color }}>${item.cost >= 1000 ? `${(item.cost / 1000).toFixed(1)}K` : item.cost}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Widget 3: Crew Status / WO Crew Match ── */}
      <div className="dash-widget">
        <div className="dash-widget-header">
          <span className="dash-widget-title">{selWO ? 'Crew Match' : 'Crew Status'}</span>
          <span className="dash-widget-badge">{selWO ? (assignedCrew ? '✓' : bestCrew ? '◎' : '—') : crews.length}</span>
        </div>
        <div className="dash-widget-body">
          {selWO ? (
            <>
              {assignedCrew ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-success-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}><VehicleTruckProfile24Regular /></div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{assignedCrew.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--accent-success)', fontWeight: 600, textTransform: 'uppercase' }}>Assigned</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { val: assignedCrew.memberCount, label: 'Members', color: 'var(--accent-indigo)' },
                      { val: `${Math.round(assignedCrew.efficiencyRating * 100)}%`, label: 'Efficiency', color: 'var(--accent-warning)' },
                      { val: assignedCrew.specialization, label: 'Spec', color: 'var(--accent-success)' },
                    ].map(item => (
                      <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 6, background: 'var(--glass-bg)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.val}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : bestCrew ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-indigo-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}><LightbulbFilament24Regular /></div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{bestCrew.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--accent-indigo)', fontWeight: 600, textTransform: 'uppercase' }}>Recommended</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { val: bestCrew.memberCount, label: 'Members', color: 'var(--accent-indigo)' },
                      { val: `${Math.round(bestCrew.efficiencyRating * 100)}%`, label: 'Efficiency', color: 'var(--accent-warning)' },
                      { val: bestCrew.specialization, label: 'Spec', color: bestCrew.specialization === selWO.issueType ? 'var(--accent-success)' : 'var(--accent-warning)' },
                    ].map(item => (
                      <div key={item.label} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 6, background: 'var(--glass-bg)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.val}</div>
                        <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '8px 0', color: 'var(--text-muted)', fontSize: 11 }}>No crews available</div>
              )}
            </>
          ) : (
            <>
              <div className="dash-crew-stats">
                <div className="dash-crew-stat">
                  <span className="dash-crew-stat-val" style={{ color: 'var(--accent-success)' }}>{crews.filter(c => c.status === 'available').length}</span>
                  <span className="dash-crew-stat-label">Available</span>
                </div>
                <div className="dash-crew-stat">
                  <span className="dash-crew-stat-val" style={{ color: 'var(--accent-indigo)' }}>{crews.filter(c => c.status === 'assigned').length}</span>
                  <span className="dash-crew-stat-label">Assigned</span>
                </div>
                <div className="dash-crew-stat">
                  <span className="dash-crew-stat-val" style={{ color: 'var(--text-secondary)' }}>{crews.filter(c => c.status === 'on_break' || c.status === 'off_duty').length}</span>
                  <span className="dash-crew-stat-label">Off</span>
                </div>
              </div>
              {crews.length > 0 && (
                <div className="dash-crew-bar">
                  <div className="dash-crew-bar-seg" style={{ width: `${(crews.filter(c => c.status === 'available').length / crews.length) * 100}%`, background: 'var(--accent-success)' }} />
                  <div className="dash-crew-bar-seg" style={{ width: `${(crews.filter(c => c.status === 'assigned').length / crews.length) * 100}%`, background: 'var(--accent-indigo)' }} />
                  <div className="dash-crew-bar-seg" style={{ width: `${(crews.filter(c => c.status === 'on_break' || c.status === 'off_duty').length / crews.length) * 100}%`, background: 'var(--text-secondary)' }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Widget 4: Performance / WO Detail ── */}
      <div className="dash-widget">
        <div className="dash-widget-header">
          <span className="dash-widget-title">{selWO ? 'Work Order Detail' : 'Performance'}</span>
        </div>
        <div className="dash-widget-body">
          {selWO ? (
            <div className="dash-perf-grid">
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--accent-indigo)' }}>{woAge}d</span>
                <span className="dash-perf-label">Age</span>
              </div>
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--accent-success)' }}>{zoneWOs.length}</span>
                <span className="dash-perf-label">In Zone</span>
              </div>
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: selWO.nearSchool ? 'var(--priority-critical)' : 'var(--text-secondary)' }}>{selWO.nearSchool ? 'Yes' : 'No'}</span>
                <span className="dash-perf-label">Nr School</span>
              </div>
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--accent-warning)' }}>{selWO.issueType.slice(0, 6)}</span>
                <span className="dash-perf-label">Type</span>
              </div>
            </div>
          ) : (
            <div className="dash-perf-grid">
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--accent-indigo)' }}>{aiOpsCount}</span>
                <span className="dash-perf-label">AI Ops</span>
              </div>
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--accent-success)' }}>{analystHoursSaved}h</span>
                <span className="dash-perf-label">Saved</span>
              </div>
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--accent-secondary)' }}>{filteredWorkOrders.filter(w => w.nearSchool).length}</span>
                <span className="dash-perf-label">Schools</span>
              </div>
              <div className="dash-perf-item">
                <span className="dash-perf-val" style={{ color: 'var(--priority-critical)' }}>
                  {infraDebt >= 1e6 ? `${(infraDebt / 1e6).toFixed(1)}M` : infraDebt >= 1000 ? `${(infraDebt / 1000).toFixed(0)}K` : infraDebt}
                </span>
                <span className="dash-perf-label">Debt $</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsWidgets;

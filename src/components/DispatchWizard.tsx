/**
 * MAINTAIN AI — Dispatch Wizard (Modal)
 *
 * A 3-step modal wizard that pops up when the user clicks "Assign" on a work order card.
 *   Step 1: Work Order Summary + AI crew recommendation (auto-generated)
 *   Step 2: Review AI reasoning + adjust crew if needed
 *   Step 3: Confirm & dispatch → writes to Dataverse
 *
 * 100% inline styles — no Tailwind dependency.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle, MapPin, Truck, Clock, DollarSign, Send,
  X, ChevronRight, ChevronLeft, CheckCircle, Zap, Users,
  Cloud, Star, Navigation, Shield, Loader2, ThumbsUp,
  School, Wrench, Clipboard,
} from 'lucide-react';

import type {
  WorkOrder, Crew, CrewDispatch, Severity, ReasoningStep,
} from '../types/infrastructure';
import type { DispatchPlan } from '../services/dispatchService';
import dispatchService from '../services/dispatchService';
import dataverseService from '../services/dataverseService';
import { ConfettiBurst } from './ConfettiBurst';

/* ═══════════════════════════════════════
   PROPS
   ═══════════════════════════════════════ */
interface DispatchWizardProps {
  workOrder: WorkOrder;
  workOrders: WorkOrder[];       // full list for AI plan context
  crews: Crew[];
  onClose: () => void;
  onDispatched: (dispatch: CrewDispatch) => void;
}

/* ═══════════════════════════════════════
   SEVERITY COLORS
   ═══════════════════════════════════════ */
const SEV: Record<Severity, { bg: string; color: string; label: string }> = {
  critical: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Critical' },
  high:     { bg: 'rgba(249,115,22,0.15)', color: '#f97316', label: 'High' },
  medium:   { bg: 'rgba(59,130,246,0.15)',  color: '#3b82f6', label: 'Medium' },
  low:      { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Low' },
};

/* ═══════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════ */
const DispatchWizard: React.FC<DispatchWizardProps> = ({
  workOrder: wo,
  workOrders,
  crews,
  onClose,
  onDispatched,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<CrewDispatch | null>(null);

  const sev = SEV[wo.severity] || SEV.medium;

  // Find the recommendation for THIS work order from the plan
  const rec = useMemo(
    () => plan?.recommendations.find(r => r.workOrderId === wo.id) ?? null,
    [plan, wo.id],
  );

  // Selected crew (either from rec or manual override)
  const selectedCrew = useMemo(
    () => crews.find(c => c.id === (selectedCrewId ?? rec?.recommendedCrewId)) ?? null,
    [crews, selectedCrewId, rec],
  );

  // Distance helper
  const crewDist = useCallback((crew: Crew) => {
    const R = 3959;
    const dLat = ((crew.currentLat - wo.latitude) * Math.PI) / 180;
    const dLon = ((crew.currentLng - wo.longitude) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos((wo.latitude * Math.PI) / 180) * Math.cos((crew.currentLat * Math.PI) / 180)
        * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [wo]);

  // Sort crews by suitability
  const rankedCrews = useMemo(() =>
    [...crews]
      .filter(c => c.status === 'available' || c.status === 'assigned')
      .map(c => ({ crew: c, dist: crewDist(c), match: c.specialization === wo.issueType }))
      .sort((a, b) => {
        if (a.match !== b.match) return a.match ? -1 : 1;
        return a.dist - b.dist;
      }),
    [crews, crewDist, wo.issueType],
  );

  // Auto-generate plan on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const result = await dispatchService.generateDispatchPlan(workOrders, crews, wo.id);
        if (!cancelled) {
          setPlan(result);
          const myRec = result.recommendations.find(r => r.workOrderId === wo.id);
          if (myRec) {
            setSelectedCrewId(myRec.recommendedCrewId);
          } else {
            // No AI rec for this WO — pre-select the best ranked crew
            const available = [...crews]
              .filter(c => c.status === 'available' || c.status === 'assigned');
            if (available.length > 0) {
              const best = available.sort((a, b) => {
                const aMatch = a.specialization === wo.issueType ? 1 : 0;
                const bMatch = b.specialization === wo.issueType ? 1 : 0;
                if (aMatch !== bMatch) return bMatch - aMatch;
                return 0; // rankedCrews already handles distance
              });
              setSelectedCrewId(best[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Dispatch plan generation failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wo.id, workOrders, crews]);

  // Handle final dispatch
  const handleDispatch = useCallback(async () => {
    if (!selectedCrew) return;
    setIsDispatching(true);
    try {
      if (rec) {
        // AI recommendation exists — use it with possibly overridden crew
        const finalRec = { ...rec, recommendedCrewId: selectedCrew.id, recommendedCrew: selectedCrew };
        const dispatches = await dispatchService.createDispatchesFromRecommendations([finalRec], 'Manager');
        if (dispatches.length > 0) {
          setDispatchResult(dispatches[0]);
          onDispatched(dispatches[0]);
          setStep(3);
        }
      } else {
        // No AI recommendation — create dispatch manually via dataverseService
        const dist = crewDist(selectedCrew);
        const estDuration = wo.issueType === 'concrete' ? 4 : wo.issueType === 'sidewalk' ? 2 : 1.5;
        const dispatch = await dataverseService.createDispatch({
          workOrderId: wo.id,
          crewId: selectedCrew.id,
          crewName: selectedCrew.name,
          status: 'approved',
          priority: wo.severity,
          issueType: wo.issueType,
          address: wo.address,
          latitude: wo.latitude,
          longitude: wo.longitude,
          estimatedDuration: estDuration,
          estimatedCost: wo.estimatedCost || 1500,
          aiConfidence: 0,
          aiReasoning: JSON.stringify([{ step: 1, description: 'Manual crew assignment by manager', confidence: 1, dataSource: 'Manual' }]),
          approvedBy: 'Manager',
          approvedOn: new Date().toISOString(),
          nearSchool: wo.nearSchool,
          zone: wo.zone,
        });
        setDispatchResult(dispatch);
        onDispatched(dispatch);
        setStep(3);
      }
    } catch (err) {
      console.error('Dispatch failed:', err);
    } finally {
      setIsDispatching(false);
    }
  }, [selectedCrew, rec, wo, crewDist, onDispatched]);

  // Cost / age helpers
  const costStr = wo.estimatedCost >= 1000 ? `$${(wo.estimatedCost / 1000).toFixed(1)}K` : `$${wo.estimatedCost}`;
  const ageMs = Date.now() - new Date(wo.createdAt).getTime();
  const ageDays = Math.floor(ageMs / 86400000);
  const ageStr = ageDays === 0 ? 'Today' : ageDays === 1 ? '1 day' : `${ageDays} days`;

  /* ═══════════════════════════════════════
     BACKDROP + MODAL WRAPPER
     ═══════════════════════════════════════ */
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel size-sm" onClick={e => e.stopPropagation()}>
        {/* ── HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: `linear-gradient(135deg, ${sev.color}33, ${sev.color}11)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Send style={{ width: 16, height: 16, color: sev.color }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Dispatch Crew
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
                Step {step} of 3
              </div>
            </div>
          </div>

          {/* Step dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{
                width: s === step ? 22 : 8, height: 8,
                borderRadius: 4,
                background: s <= step ? 'var(--accent-primary)' : 'var(--glass-border)',
                transition: 'all 0.3s ease',
              }} />
            ))}
            <button
              onClick={onClose}
              style={{
                marginLeft: 8, width: 28, height: 28, borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 18px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {isLoading ? (
            <LoadingState />
          ) : step === 1 ? (
            <Step1Summary
              wo={wo} sev={sev} costStr={costStr} ageStr={ageStr}
              rec={rec} selectedCrew={selectedCrew}
              rankedCrews={rankedCrews}
            />
          ) : step === 2 ? (
            <Step2CrewSelect
              wo={wo} sev={sev} rec={rec}
              rankedCrews={rankedCrews}
              selectedCrewId={selectedCrewId ?? rec?.recommendedCrewId ?? null}
              onSelectCrew={setSelectedCrewId}
            />
          ) : (
            <>
              <ConfettiBurst trigger={!!dispatchResult} />
              <Step3Confirm dispatchResult={dispatchResult} />
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 18px',
          borderTop: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
        }}>
          {step === 1 && (
            <>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
              <button
                onClick={() => setStep(2)}
                style={btnPrimary}
              >
                Choose Crew <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button onClick={() => setStep(1)} style={btnSecondary}>
                <ChevronLeft style={{ width: 14, height: 14 }} /> Back
              </button>
              <button
                onClick={handleDispatch}
                disabled={!selectedCrew || isDispatching}
                style={{ ...btnDispatch, opacity: selectedCrew && !isDispatching ? 1 : 0.5 }}
              >
                {isDispatching ? (
                  <><Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> Dispatching...</>
                ) : (
                  <><Send style={{ width: 13, height: 13 }} /> Dispatch {selectedCrew?.name ?? 'Crew'}</>
                )}
              </button>
            </>
          )}
          {step === 3 && (
            <button onClick={onClose} style={{ ...btnPrimary, width: '100%' }}>
              <CheckCircle style={{ width: 14, height: 14 }} /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   STEP 1 — Work Order Summary + AI Recommendation
   ═══════════════════════════════════════ */
const Step1Summary: React.FC<{
  wo: WorkOrder; sev: { bg: string; color: string; label: string };
  costStr: string; ageStr: string;
  rec: DispatchPlan['recommendations'][0] | null;
  selectedCrew: Crew | null;
  rankedCrews: { crew: Crew; dist: number; match: boolean }[];
}> = ({ wo, sev, costStr, ageStr, rec, selectedCrew, rankedCrews }) => (
  <>
    {/* WO info card */}
    <div style={{
      borderRadius: 12, border: '1px solid var(--glass-border)',
      background: 'var(--bg-primary)', overflow: 'hidden',
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: `linear-gradient(135deg, ${sev.color}15, transparent)`,
        borderBottom: '1px solid var(--glass-border)',
      }}>
        <AlertTriangle style={{ width: 14, height: 14, color: sev.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {wo.title || `${wo.issueType.charAt(0).toUpperCase() + wo.issueType.slice(1)}: ${wo.description?.slice(0, 40)}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <MapPin style={{ width: 10, height: 10 }} /> {wo.address}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
          background: sev.bg, color: sev.color, textTransform: 'capitalize',
        }}>
          {sev.label}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)' }}>
        <StatCell icon={<DollarSign />} label="Est. Cost" value={costStr} />
        <div style={{ width: 1, background: 'var(--glass-border)' }} />
        <StatCell icon={<Zap />} label="Priority" value={String(wo.priorityScore)} />
        <div style={{ width: 1, background: 'var(--glass-border)' }} />
        <StatCell icon={<Clock />} label="Age" value={ageStr} />
      </div>

      {/* Extra info */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px' }}>
        <MiniTag label={wo.issueType} />
        <MiniTag label={wo.status} />
        {wo.zone && <MiniTag label={`Zone ${wo.zone}`} />}
        {wo.nearSchool && <MiniTag label={<><School style={{ width: 10, height: 10 }} /> Near School</>} color="#f472b6" />}
      </div>
    </div>

    {/* AI Recommendation */}
    {rec ? (
      <div style={{
        borderRadius: 12, border: '1px solid rgba(59,130,246,0.25)',
        background: 'rgba(59,130,246,0.06)', padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Zap style={{ width: 13, height: 13, color: '#3b82f6' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>AI Recommendation</span>
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 4,
            background: rec.confidence > 0.8 ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)',
            color: rec.confidence > 0.8 ? '#22c55e' : '#f97316',
          }}>
            {(rec.confidence * 100).toFixed(0)}% match
          </span>
        </div>

        {selectedCrew && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8,
            background: 'var(--bg-primary)', border: '1px solid var(--glass-border)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(34,197,94,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Truck style={{ width: 16, height: 16, color: '#4ade80' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedCrew.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 8, marginTop: 2 }}>
                <span>{selectedCrew.specialization} specialist</span>
                <span>•</span>
                <span>{selectedCrew.memberCount} members</span>
                <span>•</span>
                <span>{(selectedCrew.efficiencyRating * 100).toFixed(0)}% efficiency</span>
              </div>
            </div>
            <Star style={{ width: 14, height: 14, color: '#fbbf24', fill: '#fbbf24' }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 8, fontSize: 10 }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            <Clock style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle' }} /> {rec.estimatedDuration}h estimated
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>•</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            <DollarSign style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle' }} /> ${rec.estimatedCost.toLocaleString()}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>•</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            <Cloud style={{ width: 10, height: 10, display: 'inline', verticalAlign: 'middle' }} /> Weather {(rec.factors.weather * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    ) : (
      <div style={{
        borderRadius: 12, border: '1px solid rgba(59,130,246,0.18)',
        background: 'rgba(59,130,246,0.04)', padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Users style={{ width: 13, height: 13, color: '#3b82f6' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>Manual Assignment</span>
        </div>
        {rankedCrews.length > 0 ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Best available crew based on distance &amp; specialization:
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
              borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--glass-border)',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {rankedCrews[0].crew.name.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {rankedCrews[0].crew.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                  <span>{rankedCrews[0].dist.toFixed(1)} mi away</span>
                  {rankedCrews[0].match && <span style={{ color: '#22c55e' }}>✓ Specialization match</span>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, textAlign: 'center' }}>
              Click <strong>Choose Crew</strong> to select this crew or pick another.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
            No crews currently available. Click <strong>Choose Crew</strong> to see all options.
          </div>
        )}
      </div>
    )}
  </>
);

/* ═══════════════════════════════════════
   STEP 2 — Crew Selection + AI Reasoning
   ═══════════════════════════════════════ */
const Step2CrewSelect: React.FC<{
  wo: WorkOrder;
  sev: { bg: string; color: string; label: string };
  rec: DispatchPlan['recommendations'][0] | null;
  rankedCrews: { crew: Crew; dist: number; match: boolean }[];
  selectedCrewId: string | null;
  onSelectCrew: (id: string) => void;
}> = ({ wo, sev, rec, rankedCrews, selectedCrewId, onSelectCrew }) => (
  <>
    {/* AI Reasoning */}
    {rec && rec.reasoning.length > 0 && (
      <div style={{
        borderRadius: 10, padding: '10px 12px',
        background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Shield style={{ width: 12, height: 12 }} /> AI Reasoning
        </div>
        {rec.reasoning.map((r, i) => (
          <div key={i} style={{
            display: 'flex', gap: 8, padding: '4px 0',
            borderTop: i > 0 ? '1px solid rgba(59,130,246,0.08)' : 'none',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 800, marginTop: 1,
            }}>
              {r.step}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {r.description}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 1 }}>
                {r.dataSource} • {(r.confidence * 100).toFixed(0)}% confidence
              </div>
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Factor Bars */}
    {rec && (
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
      }}>
        <FactorBar label="Proximity" value={rec.factors.proximity} icon={<MapPin style={{ width: 12, height: 12 }} />} />
        <FactorBar label="Specialization" value={rec.factors.specialization} icon={<Wrench style={{ width: 12, height: 12 }} />} />
        <FactorBar label="Workload" value={rec.factors.workload} icon={<Clipboard style={{ width: 12, height: 12 }} />} />
        <FactorBar label="Urgency" value={rec.factors.urgency} icon={<Zap style={{ width: 12, height: 12 }} />} />
        <FactorBar label="Weather" value={rec.factors.weather} icon={<Cloud style={{ width: 12, height: 12 }} />} />
      </div>
    )}

    {/* Crew List */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Available Crews ({rankedCrews.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {rankedCrews.map(({ crew, dist, match }) => {
          const isSelected = crew.id === selectedCrewId;
          const isRecommended = crew.id === rec?.recommendedCrewId;
          return (
            <div
              key={crew.id}
              onClick={() => onSelectCrew(crew.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 10, cursor: 'pointer',
                background: isSelected ? 'rgba(59,130,246,0.1)' : 'var(--bg-primary)',
                border: `1.5px solid ${isSelected ? '#3b82f6' : 'var(--glass-border)'}`,
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Truck style={{ width: 14, height: 14, color: isSelected ? '#3b82f6' : 'var(--text-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {crew.name}
                  </span>
                  {isRecommended && (
                    <span style={{
                      fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(59,130,246,0.15)', color: '#3b82f6',
                    }}>
                      AI PICK
                    </span>
                  )}
                  {match && (
                    <span style={{
                      fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                    }}>
                      MATCH
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 1, display: 'flex', gap: 6 }}>
                  <span>{crew.specialization}</span>
                  <span>•</span>
                  <span>{dist.toFixed(1)} mi</span>
                  <span>•</span>
                  <span>{crew.memberCount} crew</span>
                  <span>•</span>
                  <span>{(crew.efficiencyRating * 100).toFixed(0)}% eff.</span>
                </div>
              </div>
              {isSelected && (
                <CheckCircle style={{ width: 16, height: 16, color: '#3b82f6', flexShrink: 0 }} />
              )}
            </div>
          );
        })}
        {rankedCrews.length === 0 && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)', fontSize: 12 }}>
            No available crews found.
          </div>
        )}
      </div>
    </div>
  </>
);

/* ═══════════════════════════════════════
   STEP 3 — Confirmation
   ═══════════════════════════════════════ */
const Step3Confirm: React.FC<{ dispatchResult: CrewDispatch | null }> = ({ dispatchResult }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '24px 0', gap: 14, textAlign: 'center',
  }}>
    <div style={{
      width: 60, height: 60, borderRadius: '50%',
      background: 'rgba(34,197,94,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'pop 0.4s ease',
    }}
    className="dispatch-success-ring"
    >
      <CheckCircle style={{ width: 30, height: 30, color: '#22c55e' }} />
    </div>
    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
      Crew Dispatched!
    </div>
    {dispatchResult && (
      <>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong>{dispatchResult.crewName}</strong> has been assigned to<br />
          <span style={{ color: 'var(--text-primary)' }}>{dispatchResult.address}</span>
        </div>
        <div style={{
          display: 'flex', gap: 12, marginTop: 4,
        }}>
          <ConfirmStat label="Dispatch ID" value={dispatchResult.name} />
          <ConfirmStat label="Est. Duration" value={`${dispatchResult.estimatedDuration}h`} />
          <ConfirmStat label="AI Confidence" value={`${(dispatchResult.aiConfidence * 100).toFixed(0)}%`} />
        </div>
        <div style={{
          fontSize: 10, color: 'var(--text-secondary)', marginTop: 4,
          padding: '6px 12px', borderRadius: 6,
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
        }}>
          Status: <strong style={{ color: '#22c55e' }}>Approved</strong> → Ready for dispatch
        </div>
      </>
    )}
  </div>
);

/* ═══════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════ */

const LoadingState: React.FC = () => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '40px 0', gap: 12,
  }}>
    <Loader2 style={{ width: 28, height: 28, color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
      Analyzing work order...
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
      AI is matching crews, checking weather & workload
    </div>
  </div>
);

const StatCell: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ flex: 1, padding: '8px 10px', textAlign: 'center' }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
    <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: 1, opacity: 0.7 }}>{label}</div>
  </div>
);

const MiniTag: React.FC<{ label: React.ReactNode; color?: string }> = ({ label, color }) => (
  <span style={{
    fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
    background: color ? `${color}18` : 'var(--glass-bg)',
    color: color || 'var(--text-secondary)',
    border: `1px solid ${color ? `${color}30` : 'var(--glass-border)'}`,
    textTransform: 'capitalize',
  }}>
    {label}
  </span>
);

const ConfirmStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{
    padding: '6px 10px', borderRadius: 8, textAlign: 'center',
    background: 'var(--bg-primary)', border: '1px solid var(--glass-border)',
  }}>
    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
    <div style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: 1 }}>{label}</div>
  </div>
);

const FactorBar: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => {
  const pct = Math.round(value * 100);
  const barColor = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{
      padding: '6px 8px', borderRadius: 8,
      background: 'var(--bg-primary)', border: '1px solid var(--glass-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)' }}>
          {icon} {label}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: barColor }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--glass-border)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: barColor, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   BUTTON STYLES
   ═══════════════════════════════════════ */
const btnBase: React.CSSProperties = {
  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 36, borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
  border: 'none', transition: 'all 0.2s',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: 'var(--accent-primary)', color: 'var(--accent-on-primary)',
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: 'var(--glass-bg)', color: 'var(--text-secondary)',
  border: '1px solid var(--glass-border)',
};

const btnDispatch: React.CSSProperties = {
  ...btnBase,
  flex: 2,
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  color: 'white',
  boxShadow: '0 4px 12px rgba(34,197,94,0.25)',
};

export default DispatchWizard;

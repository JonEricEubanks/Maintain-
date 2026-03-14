import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Text,
  Button,
  Slider,
  Tooltip,
} from '@fluentui/react-components';

// SECURITY: Sanitize narrative text to prevent XSS — strip all HTML tags
const sanitizeNarrative = (text: string): string => {
  return text
    .replace(/<[^>]*>/g, '')   // Strip any HTML tags
    .replace(/^- /, '')
    .trim();
};

import {
  Play24Regular,
  Pause24Regular,
  ArrowReset24Regular,
  FastForward24Regular,
  Warning24Regular,
  Dismiss24Regular,
  Timer24Regular,
  ErrorCircle24Regular,
  DataBarVertical24Regular,
  Wallet24Regular,
  Building24Regular,
  WeatherSnowflake24Regular,
  WeatherRainShowersDay24Regular,
  WeatherSunny24Regular,
  WeatherCloudy24Regular,
  ShieldError24Regular,
  CheckmarkCircle24Regular,
  CircleHalfFill24Regular,
  ChevronDown24Regular,
  ArrowRight24Regular,
  Map24Regular,
  Location24Regular,
  MyLocation24Regular,
  PanelLeftContract24Regular,
  PanelLeftExpand24Regular,
  Search24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder } from '../types/infrastructure';
import {
  runDecaySimulation,
  type DecaySimulationResult,
  type DecaySnapshot,
  type DecayMilestone,
  type DecayedWorkOrder,
} from '../services/decaySimulationService';

// ============================================
// Types
// ============================================

interface DecayVisualizerProps {
  workOrders: WorkOrder[];
  onClose: () => void;
  onDecayMonth: (snapshot: DecaySnapshot) => void;
  /** Fly the map camera to a critical hotspot */
  onFlyTo?: (lat: number, lng: number, zoom: number) => void;
  theme?: 'light' | 'dark';
}

type PlaybackSpeed = 1 | 2 | 4;
type TimeCadence = 'monthly' | 'quarterly' | 'annually';

const CADENCE_STEPS: Record<TimeCadence, number[]> = {
  monthly:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  quarterly:  [0, 3, 6, 9, 12],
  annually:   [0, 6, 12],
};

interface CriticalHotspot {
  lat: number;
  lng: number;
  zoom: number;
  label: string;
  count: number;
  severity: 'critical' | 'warning' | 'info';
}

// ============================================
// Hotspot clustering — find critical areas
// Compares current vs previous month to highlight
// the zones with the MOST CHANGE, not just highest decay
// ============================================

function findCriticalHotspots(
  workOrders: DecayedWorkOrder[],
  prevWorkOrders?: DecayedWorkOrder[],
): CriticalHotspot[] {
  if (workOrders.length === 0) return [];

  // Build lookup of previous month's decay scores by ID
  const prevScores = new Map<string, number>();
  if (prevWorkOrders) {
    prevWorkOrders.forEach(wo => prevScores.set(wo.id, wo.decayScore));
  }

  // Grid-based clustering (0.004° ≈ 400m cells for tighter focus)
  const cellSize = 0.004;
  const cells = new Map<string, DecayedWorkOrder[]>();

  workOrders.forEach(wo => {
    // Only include items that are at least somewhat decayed
    if (wo.decayScore < 0.25) return;
    const cx = Math.floor(wo.latitude / cellSize);
    const cy = Math.floor(wo.longitude / cellSize);
    const key = `${cx},${cy}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(wo);
  });

  // Score each cell by URGENCY — not just count
  const hotspots: (CriticalHotspot & { urgencyScore: number })[] = [];
  cells.forEach((items) => {
    const avgLat = items.reduce((s, w) => s + w.latitude, 0) / items.length;
    const avgLng = items.reduce((s, w) => s + w.longitude, 0) / items.length;

    // Calculate urgency components:
    // 1. Newly spawned damage in this cell
    const spawnedCount = items.filter(w => w.isSpawned).length;

    // 2. Average decay delta (how much worse this area got since last month)
    let totalDelta = 0;
    let deltaItems = 0;
    items.forEach(w => {
      const prev = prevScores.get(w.id);
      if (prev !== undefined) {
        totalDelta += (w.decayScore - prev);
        deltaItems++;
      } else {
        // New item — count as full delta
        totalDelta += w.decayScore;
        deltaItems++;
      }
    });
    const avgDelta = deltaItems > 0 ? totalDelta / deltaItems : 0;

    // 3. Items that crossed a severity threshold this month
    let severityJumps = 0;
    items.forEach(w => {
      const prev = prevScores.get(w.id) ?? 0;
      const prevSev = prev >= 0.75 ? 3 : prev >= 0.5 ? 2 : prev >= 0.25 ? 1 : 0;
      const curSev = w.decayScore >= 0.75 ? 3 : w.decayScore >= 0.5 ? 2 : w.decayScore >= 0.25 ? 1 : 0;
      if (curSev > prevSev) severityJumps++;
    });

    // 4. Near-school penalty (higher urgency)
    const schoolCount = items.filter(w => w.nearSchool).length;

    // Combined urgency score
    const urgencyScore =
      (avgDelta * 10) +           // Fastest deterioration
      (spawnedCount * 3) +        // New damage appearing
      (severityJumps * 2) +       // Crossing thresholds
      (schoolCount * 1.5) +       // Near schools
      (items.length * 0.3);       // Base density (low weight)

    const critCount = items.filter(w => w.decayScore > 0.75).length;
    const severity: 'critical' | 'warning' | 'info' =
      critCount > 2 || avgDelta > 0.08 ? 'critical' :
      critCount > 0 || avgDelta > 0.04 ? 'warning' : 'info';

    // Use the most-decayed item's address for the label (changes as decay shifts)
    const worstItem = items.sort((a, b) => b.decayScore - a.decayScore)[0];
    const label = worstItem?.address?.split(',')[0] || 'Unknown Area';

    hotspots.push({
      lat: avgLat,
      lng: avgLng,
      zoom: items.length > 5 ? 15 : 16,
      label,
      count: items.length,
      severity,
      urgencyScore,
    });
  });

  // Sort by urgency — the most CHANGING areas come first
  return hotspots
    .sort((a, b) => b.urgencyScore - a.urgencyScore)
    .slice(0, 5)
    .map(({ urgencyScore, ...hs }) => hs);
}

// ============================================
// Full-Screen StoryMap — ArcGIS-Inspired
// ============================================

const DecayVisualizer: React.FC<DecayVisualizerProps> = ({
  workOrders,
  onClose,
  onDecayMonth,
  onFlyTo,
  theme = 'dark',
}) => {
  const [simulation, setSimulation] = useState<DecaySimulationResult | null>(null);
  const [currentMonth, setCurrentMonth] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [cadence, setCadence] = useState<TimeCadence>('monthly');
  const [activeHotspot, setActiveHotspot] = useState<CriticalHotspot | null>(null);
  const [exploreMode, setExploreMode] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const lastFlyMonth = useRef<number>(-1);
  const totalMonths = 12;

  // Run simulation on mount
  useEffect(() => {
    if (workOrders.length === 0) return;
    const result = runDecaySimulation(workOrders, totalMonths);
    setSimulation(result);
    if (result.timeline[0]) {
      onDecayMonth(result.timeline[0]);
    }
  }, [workOrders]); // eslint-disable-line

  // Compute which months this cadence steps through
  const cadenceSteps = useMemo(() => CADENCE_STEPS[cadence], [cadence]);

  // Playback loop — steps through cadence-filtered months
  useEffect(() => {
    if (isPlaying && simulation) {
      // Slower base: 2800ms per step (cinematic), divided by speed multiplier
      const intervalMs = 2800 / speed;
      playIntervalRef.current = setInterval(() => {
        setCurrentMonth(prev => {
          // Find the next cadence step after current month
          const nextStep = cadenceSteps.find(s => s > prev);
          if (nextStep === undefined) {
            setIsPlaying(false);
            return totalMonths;
          }
          return nextStep;
        });
      }, intervalMs);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, speed, simulation, cadenceSteps]);

  // Emit snapshot + auto-fly to hotspots when month changes
  useEffect(() => {
    if (!simulation?.timeline[currentMonth]) return;
    const snap = simulation.timeline[currentMonth];
    onDecayMonth(snap);

    // Find hotspots comparing current vs previous month
    const prevSnap = currentMonth > 0 ? simulation.timeline[currentMonth - 1] : undefined;
    const hotspots = findCriticalHotspots(snap.workOrders, prevSnap?.workOrders);

    // Cycle through hotspots as months progress — each month focuses a different one
    if (hotspots.length > 0 && onFlyTo && currentMonth !== lastFlyMonth.current) {
      lastFlyMonth.current = currentMonth;
      const hotspotIndex = currentMonth % hotspots.length;
      const target = hotspots[hotspotIndex];

      // Fly to the hotspot with a delay to let map settle
      setTimeout(() => {
        onFlyTo(target.lat, target.lng, target.zoom);
        setActiveHotspot(target);
      }, 400);

      // Clear active hotspot label after the fly completes
      setTimeout(() => setActiveHotspot(null), 4500);
    }

    // On month 0, reset to overview
    if (currentMonth === 0 && onFlyTo) {
      onFlyTo(42.2586, -87.8407, 13);
      setActiveHotspot(null);
    }

    // On final month, zoom out to show the full devastation
    if (currentMonth === totalMonths && onFlyTo) {
      setTimeout(() => onFlyTo(42.2586, -87.8407, 13), 500);
    }
  }, [currentMonth, simulation]); // eslint-disable-line

  // Auto-scroll story to current section
  useEffect(() => {
    if (storyRef.current) {
      const cards = storyRef.current.querySelectorAll('.sm-chapter');
      if (cards[currentMonth]) {
        cards[currentMonth].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMonth]);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleReset = () => { setIsPlaying(false); setCurrentMonth(0); };
  const handleSpeedCycle = () => setSpeed(prev => prev === 1 ? 2 : prev === 2 ? 4 : 1);
  const handleSliderChange = (_: unknown, data: { value: number }) => {
    setIsPlaying(false);
    setCurrentMonth(data.value);
  };

  const snapshot = simulation?.timeline[currentMonth];

  // Hotspots for the current month (compared to previous)
  const currentHotspots = useMemo(() => {
    if (!snapshot || !simulation) return [];
    const prevSnap = currentMonth > 0 ? simulation.timeline[currentMonth - 1] : undefined;
    return findCriticalHotspots(snapshot.workOrders, prevSnap?.workOrders);
  }, [snapshot, simulation, currentMonth]);

  const activeMilestones = useMemo(() => {
    if (!simulation) return [];
    return simulation.milestones.filter(m => m.month <= currentMonth);
  }, [simulation, currentMonth]);

  // Health level helper
  const getHealth = (score: number) => {
    if (score > 70) return { icon: <CheckmarkCircle24Regular />, label: 'Good Condition', color: '#22c55e' };
    if (score > 40) return { icon: <CircleHalfFill24Regular />, label: 'Deteriorating', color: '#f59e0b' };
    if (score > 20) return { icon: <Warning24Regular />, label: 'Critical', color: '#f97316' };
    return { icon: <ShieldError24Regular />, label: 'Collapse Risk', color: '#ef4444' };
  };

  // Weather helper
  const getWeather = (snap: DecaySnapshot) => {
    const w = snap.weather;
    if (w === 'freeze_thaw') return { icon: <WeatherSnowflake24Regular />, label: 'Freeze-Thaw', impact: '×2.2', severe: true };
    if (w === 'freezing') return { icon: <WeatherSnowflake24Regular />, label: 'Freezing', impact: '×1.8', severe: true };
    if (w === 'snow') return { icon: <WeatherSnowflake24Regular />, label: 'Snow', impact: '×1.5', severe: true };
    if (w === 'rain') return { icon: <WeatherRainShowersDay24Regular />, label: 'Rain', impact: '×1.3', severe: false };
    if (w === 'cloudy') return { icon: <WeatherCloudy24Regular />, label: 'Cloudy', impact: '—', severe: false };
    return { icon: <WeatherSunny24Regular />, label: 'Clear', impact: '—', severe: false };
  };

  // Narrative lines
  const narrativeLines = useMemo(() => {
    if (!simulation) return [];
    return simulation.narrative.split('\n').filter(l => l.trim());
  }, [simulation]);

  // Get milestone for a specific month
  const getMilestoneForMonth = useCallback((m: number): DecayMilestone | undefined => {
    return simulation?.milestones.find(ms => ms.month === m);
  }, [simulation]);

  // Fly to a specific hotspot when user clicks
  const handleHotspotClick = useCallback((hs: CriticalHotspot) => {
    onFlyTo?.(hs.lat, hs.lng, hs.zoom);
    setActiveHotspot(hs);
    setTimeout(() => setActiveHotspot(null), 4500);
  }, [onFlyTo]);

  const handleEnterExplore = useCallback(() => {
    setExploreMode(true);
    setIsPlaying(false);
    // Don't force zoom — let user stay at current view to explore freely
  }, []);

  const handleExitExplore = useCallback(() => {
    setExploreMode(false);
  }, []);

  if (!simulation || !snapshot) {
    return (
      <div className="storymap-overlay" style={{ pointerEvents: 'auto' }}>
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          {/* Skeleton Map Side */}
          <div className="skeleton-map" style={{ flex: '1 1 60%' }}>
            <div className="skeleton-map-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="skeleton-map-cell" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            {/* Fake map pins */}
            {[{t:25,l:30},{t:40,l:55},{t:60,l:35},{t:35,l:70},{t:55,l:50},{t:45,l:20}].map((p, i) => (
              <div key={i} className="skeleton-map-pin" style={{ top: `${p.t}%`, left: `${p.l}%`, animationDelay: `${i * 0.3}s` }} />
            ))}
            {/* Center loading indicator */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <div className="decay-loading-spinner" />
              <Text size={300} style={{ color: 'var(--text-primary)' }}>Preparing Map…</Text>
            </div>
          </div>
          {/* Skeleton Story Side */}
          <div style={{ width: 380, flexShrink: 0, background: 'var(--bg-primary)', borderLeft: '1px solid var(--glass-border)', overflow: 'hidden', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Title skeleton */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div className="skeleton-shimmer" style={{ width: 28, height: 28, borderRadius: 8 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton-shimmer" style={{ width: '60%', height: 14, borderRadius: 4 }} />
                <div className="skeleton-shimmer" style={{ width: '35%', height: 10, borderRadius: 3 }} />
              </div>
            </div>
            {/* Hero card skeleton */}
            <div className="skeleton-decay-hero">
              <div className="skeleton-shimmer" style={{ width: '45%', height: 10, borderRadius: 3, animationDelay: '0.1s' }} />
              <div className="skeleton-shimmer" style={{ width: '80%', height: 18, borderRadius: 4, animationDelay: '0.2s' }} />
              <div className="skeleton-shimmer" style={{ width: '100%', height: 12, borderRadius: 3, animationDelay: '0.3s' }} />
              <div className="skeleton-shimmer" style={{ width: '65%', height: 12, borderRadius: 3, animationDelay: '0.4s' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="skeleton-shimmer" style={{ flex: 1, height: 48, borderRadius: 8, animationDelay: `${0.5 + i * 0.1}s` }} />
                ))}
              </div>
            </div>
            {/* Chapter card skeletons */}
            {[0, 1, 2].map(i => (
              <div key={i} className="skeleton-decay-chapter" style={{ animationDelay: `${0.8 + i * 0.15}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton-shimmer" style={{ width: 60, height: 10, borderRadius: 10, animationDelay: `${0.9 + i * 0.15}s` }} />
                  <div className="skeleton-shimmer" style={{ width: 40, height: 10, borderRadius: 10, animationDelay: `${1.0 + i * 0.15}s` }} />
                </div>
                <div className="skeleton-shimmer" style={{ width: '90%', height: 12, borderRadius: 3, animationDelay: `${1.1 + i * 0.15}s` }} />
                <div className="skeleton-shimmer" style={{ width: '55%', height: 10, borderRadius: 3, animationDelay: `${1.2 + i * 0.15}s` }} />
              </div>
            ))}
            {/* Status text */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginTop: 'auto', paddingBottom: 8 }}>
              <div className="decay-loading-spinner" style={{ width: 24, height: 24 }} />
              <Text size={200} style={{ color: 'var(--text-muted)' }}>Simulating {workOrders.length} work orders…</Text>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const health = getHealth(snapshot.stats.cityHealthScore);
  const wx = getWeather(snapshot);
  const month0 = simulation.timeline[0];
  const costDelta = snapshot.stats.totalCost - month0.stats.totalCost;

  return (
    <div className={`storymap-overlay ${theme === 'light' ? 'sm-light' : 'sm-dark'} ${exploreMode ? 'sm-explore-mode' : ''}`}>
      {/* ═══════════════════════════════════════════
          LEFT: Interactive Map Overlays
          (Map itself is rendered by Dashboard behind this)
          ═══════════════════════════════════════════ */}
      <div className="sm-map-side">
        {/* Compact header bar — hidden in explore mode */}
        {!exploreMode && (
          <div className="sm-map-header" style={{ padding: '6px 14px', gap: 0 }}>
            <div className="sm-map-title-row" style={{ marginBottom: 0 }}>
              <Map24Regular style={{ color: 'var(--accent-primary)', width: 16, height: 16 }} />
              <span className="sm-map-title" style={{ fontSize: 13 }}>Decay Map</span>
              <span className="sm-month-badge">{snapshot.label}</span>
              {currentHotspots.length > 0 && (
                <>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>|</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>Zones:</span>
                  {currentHotspots.slice(0, 4).map((hs, i) => (
                    <button
                      key={i}
                      className={`sm-hotspot-pill ${hs.severity}`}
                      onClick={() => handleHotspotClick(hs)}
                      title={`${hs.count} issues near ${hs.label}`}
                      style={{ padding: '2px 8px', fontSize: 10 }}
                    >
                      <span className="sm-pill-dot" />
                      {hs.label.substring(0, 14)}
                      <span className="sm-pill-count">{hs.count}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Active hotspot indicator — appears when flying to a critical area */}
        {activeHotspot && (
          <div className={`sm-hotspot-toast ${activeHotspot.severity}`}>
            <MyLocation24Regular />
            <div className="sm-hotspot-info">
              <span className="sm-hotspot-name">{activeHotspot.label}</span>
              <span className="sm-hotspot-detail">
                {activeHotspot.count} damaged asset{activeHotspot.count !== 1 ? 's' : ''} in this zone
              </span>
            </div>
          </div>
        )}

        {/* ═══ Modern Timeline Bar ═══ */}
        <div className={`sm-timeline-bar ${exploreMode ? 'explore' : ''}`}>
          {/* Top row: cadence + controls */}
          <div className="sm-tl-controls">
            <div className="sm-cadence-row">
              {(['monthly', 'quarterly', 'annually'] as TimeCadence[]).map(c => (
                <button
                  key={c}
                  className={`sm-cadence-btn ${cadence === c ? 'active' : ''}`}
                  onClick={() => { setCadence(c); setIsPlaying(false); setCurrentMonth(0); }}
                >
                  {c === 'monthly' ? 'Monthly' : c === 'quarterly' ? 'Quarterly' : 'Annually'}
                </button>
              ))}
            </div>
            <div className="sm-pb-row">
              <Tooltip content="Reset" relationship="label">
                <Button appearance="subtle" icon={<ArrowReset24Regular />} onClick={handleReset} size="small" />
              </Tooltip>
              {isPlaying ? (
                <Button appearance="primary" icon={<Pause24Regular />} onClick={handlePause} size="small" className="sm-play-btn">Pause</Button>
              ) : (
                <Button appearance="primary" icon={<Play24Regular />} onClick={handlePlay} size="small" className="sm-play-btn" disabled={currentMonth >= totalMonths}>
                  {currentMonth >= totalMonths ? 'Done' : 'Play'}
                </Button>
              )}
              <Tooltip content={`Speed: ${speed}x`} relationship="label">
                <Button appearance="subtle" icon={<FastForward24Regular />} onClick={handleSpeedCycle} size="small">{speed}x</Button>
              </Tooltip>
              {/* Explore / Story toggle — always available */}
              <Tooltip content={exploreMode ? 'Show Story Panel' : 'Hide Story · Explore Map'} relationship="label">
                <Button
                  appearance="subtle"
                  icon={exploreMode ? <PanelLeftExpand24Regular /> : <Search24Regular />}
                  onClick={() => {
                    if (exploreMode) {
                      handleExitExplore();
                    } else {
                      handleEnterExplore();
                    }
                  }}
                  size="small"
                  className={`sm-explore-toggle ${exploreMode ? 'active' : ''}`}
                />
              </Tooltip>
            </div>
          </div>

          {/* Visual timeline track with dots */}
          <div className="sm-tl-track-wrap">
            <div className="sm-tl-track">
              <div className="sm-tl-progress" style={{ width: `${(currentMonth / totalMonths) * 100}%` }} />
              {simulation.timeline.map((snap, i) => {
                if (!cadenceSteps.includes(i)) return null;
                const pct = (i / totalMonths) * 100;
                const isCurrent = i === currentMonth;
                const isPast = i <= currentMonth;
                const snapHealth = getHealth(snap.stats.cityHealthScore);
                return (
                  <button
                    key={i}
                    className={`sm-tl-dot ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}`}
                    style={{
                      left: `${pct}%`,
                      '--dot-color': isPast ? snapHealth.color : 'var(--text-muted)',
                    } as React.CSSProperties}
                    onClick={() => { setIsPlaying(false); setCurrentMonth(i); }}
                    onMouseEnter={() => {
                      if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                      setHoveredMonth(i);
                    }}
                    onMouseLeave={() => {
                      hoverTimeout.current = setTimeout(() => setHoveredMonth(null), 200);
                    }}
                  >
                    {isCurrent && <span className="sm-tl-dot-label">{snap.label}</span>}
                  </button>
                );
              })}
            </div>

            {/* ═══ Month Detail Popup ═══ */}
            {hoveredMonth !== null && simulation.timeline[hoveredMonth] && (() => {
              const hSnap = simulation.timeline[hoveredMonth];
              const hHealth = getHealth(hSnap.stats.cityHealthScore);
              const hWx = getWeather(hSnap);
              const hMilestone = getMilestoneForMonth(hoveredMonth);
              const hNarrative = narrativeLines[hoveredMonth] || '';
              const prevSnap2 = hoveredMonth > 0 ? simulation.timeline[hoveredMonth - 1] : null;
              const healthDelta = prevSnap2 ? hSnap.stats.cityHealthScore - prevSnap2.stats.cityHealthScore : 0;
              const costDelta2 = prevSnap2 ? hSnap.stats.totalCost - prevSnap2.stats.totalCost : 0;
              const newIssues = hSnap.stats.newIssuesThisMonth;
              const pct = (hoveredMonth / totalMonths) * 100;
              // Edge-aware positioning: keep popup within the timeline bounds
              const popupAlign = pct < 18 ? 'left' : pct > 82 ? 'right' : 'center';
              const popupTransform = popupAlign === 'left' ? 'translateX(0)' : popupAlign === 'right' ? 'translateX(-100%)' : 'translateX(-50%)';
              const arrowLeft = popupAlign === 'left' ? `${pct}%` : popupAlign === 'right' ? `${100 - (100 - pct)}%` : '50%';
              const arrowTransformX = popupAlign === 'center' ? '-50%' : '0';

              return (
                <div
                  className={`sm-month-popup sm-mp-align-${popupAlign}`}
                  style={{ left: `${pct}%`, transform: popupTransform }}
                  onMouseEnter={() => {
                    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
                  }}
                  onMouseLeave={() => {
                    hoverTimeout.current = setTimeout(() => setHoveredMonth(null), 200);
                  }}
                >
                  <div className="sm-mp-arrow" style={{ left: arrowLeft, transform: `translateX(${arrowTransformX}) rotate(45deg)` }} />
                  {/* Header */}
                  <div className="sm-mp-header">
                    <div className="sm-mp-title">
                      <span className="sm-mp-month-label">{hSnap.label}</span>
                      {hoveredMonth === 0 && <span className="sm-mp-badge today">Today</span>}
                    </div>
                    <div className="sm-mp-health" style={{ color: hHealth.color }}>
                      {hHealth.icon}
                      <span>{hSnap.stats.cityHealthScore}</span>
                      {healthDelta !== 0 && (
                        <span className={`sm-mp-delta ${healthDelta < 0 ? 'negative' : 'positive'}`}>
                          {healthDelta > 0 ? '+' : ''}{healthDelta}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Weather */}
                  <div className={`sm-mp-weather ${hWx.severe ? 'severe' : ''}`}>
                    {hWx.icon}
                    <span>{hWx.label} · {hSnap.temperature}°F</span>
                    {hWx.severe && <span className="sm-mp-impact">{hWx.impact} damage rate</span>}
                  </div>

                  {/* Stats grid */}
                  <div className="sm-mp-stats">
                    <div className="sm-mp-stat">
                      <span className="sm-mp-stat-val" style={{ color: '#ef4444' }}>{hSnap.stats.critical}</span>
                      <span className="sm-mp-stat-lbl">Critical</span>
                    </div>
                    <div className="sm-mp-stat">
                      <span className="sm-mp-stat-val" style={{ color: '#f59e0b' }}>{hSnap.stats.high}</span>
                      <span className="sm-mp-stat-lbl">High</span>
                    </div>
                    <div className="sm-mp-stat">
                      <span className="sm-mp-stat-val" style={{ color: '#6366f1' }}>{hSnap.stats.totalIssues}</span>
                      <span className="sm-mp-stat-lbl">Total</span>
                    </div>
                    <div className="sm-mp-stat">
                      <span className="sm-mp-stat-val" style={{ color: '#ec4899' }}>{hSnap.stats.schoolZoneIssues}</span>
                      <span className="sm-mp-stat-lbl">Schools</span>
                    </div>
                  </div>

                  {/* Cost line */}
                  <div className="sm-mp-cost">
                    <Wallet24Regular style={{ width: 14, height: 14, color: '#f59e0b' }} />
                    <span>${(hSnap.stats.totalCost / 1000).toFixed(0)}K repair cost</span>
                    {costDelta2 > 0 && <span className="sm-mp-cost-up">+${(costDelta2 / 1000).toFixed(0)}K</span>}
                  </div>

                  {/* New issues */}
                  {newIssues > 0 && (
                    <div className="sm-mp-new-issues">
                      <ErrorCircle24Regular style={{ width: 14, height: 14, color: '#ef4444' }} />
                      <span>{newIssues} new issue{newIssues !== 1 ? 's' : ''} spawned this month</span>
                    </div>
                  )}

                  {/* Milestone */}
                  {hMilestone && (
                    <div className={`sm-mp-milestone ${hMilestone.severity}`}>
                      <span className="sm-mp-ms-icon">{hMilestone.icon}</span>
                      <div className="sm-mp-ms-text">
                        <strong>{hMilestone.label}</strong>
                        <span>{hMilestone.description}</span>
                      </div>
                    </div>
                  )}

                  {/* Narrative */}
                  {hNarrative && (
                    <p className="sm-mp-narrative">
                      {sanitizeNarrative(hNarrative)}
                    </p>
                  )}
                </div>
              );
            })()}
            {/* Month labels under the track */}
            <div className="sm-tl-month-labels">
              {simulation.timeline.filter((_, i) => cadenceSteps.includes(i)).map(snap => {
                const pct = (snap.month / totalMonths) * 100;
                return (
                  <span
                    key={snap.month}
                    className={`sm-tl-mlabel ${snap.month === currentMonth ? 'active' : ''}`}
                    style={{ left: `${pct}%` }}
                    onClick={() => { setIsPlaying(false); setCurrentMonth(snap.month); }}
                  >
                    {snap.label.split(' ')[0]}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Explore mode: inline stats + hotspot pills */}
          {exploreMode && (
            <div className="sm-explore-strip">
              <div className="sm-explore-stats">
                <span className="sm-explore-stat">
                  <span className="sm-es-val" style={{ color: health.color }}>{snapshot.stats.cityHealthScore}</span>
                  <span className="sm-es-lbl">Health</span>
                </span>
                <span className="sm-explore-stat">
                  <span className="sm-es-val" style={{ color: '#ef4444' }}>{snapshot.stats.critical}</span>
                  <span className="sm-es-lbl">Critical</span>
                </span>
                <span className="sm-explore-stat">
                  <span className="sm-es-val" style={{ color: '#f59e0b' }}>${(snapshot.stats.totalCost / 1000).toFixed(0)}K</span>
                  <span className="sm-es-lbl">Cost</span>
                </span>
              </div>
              {currentHotspots.length > 0 && (
                <div className="sm-explore-zones">
                  {currentHotspots.slice(0, 4).map((hs, i) => (
                    <button
                      key={i}
                      className={`sm-hotspot-pill ${hs.severity}`}
                      onClick={() => handleHotspotClick(hs)}
                    >
                      <span className="sm-pill-dot" />
                      {hs.label.substring(0, 18)}
                      <span className="sm-pill-count">{hs.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legend integrated into timeline bar */}
          <div className="sm-tl-legend">
            <div className="sm-legend-grad" />
            <div className="sm-legend-labels">
              <span>Healthy</span>
              <span>Degraded</span>
              <span>Failed</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          RIGHT: Scrolling StoryMap Narrative
          ═══════════════════════════════════════════ */}
      <div className={`sm-story-side ${exploreMode ? 'sm-hidden' : ''}`}>
        {/* Close button */}
        <Tooltip content="Close StoryMap" relationship="label">
          <Button
            appearance="subtle"
            icon={<Dismiss24Regular />}
            onClick={onClose}
            size="small"
            className="sm-close-btn"
          />
        </Tooltip>

        {/* Hero Card */}
        <div className="sm-hero-card">
          <div className="sm-hero-eyebrow">
            <Timer24Regular style={{ width: 16, height: 16 }} />
            INFRASTRUCTURE DECAY SIMULATION
          </div>
          <h1 className="sm-hero-title">
            What Happens When Nothing Gets Fixed?
          </h1>
          <p className="sm-hero-desc">
            This simulation models how Lake Forest's {workOrders.length} active work orders
            deteriorate over 12 months of inaction, factoring in seasonal weather patterns
            and cascading failures. The map will guide you through critical areas as they emerge.
          </p>
          <div className="sm-hero-scroll-hint">
            <ChevronDown24Regular />
            <span>Scroll to explore the story</span>
          </div>
        </div>

        {/* Scrollable Story Content */}
        <div className="sm-story-scroll" ref={storyRef}>

          {/* Current State Overview Card */}
          <div className="sm-chapter sm-overview-card" style={{ animationDelay: '0.1s' }}>
            <div className="sm-card-label">CURRENT STATE — {snapshot.label}</div>

            {/* Health Ring + Status */}
            <div className="sm-health-row">
              <div className="sm-health-ring" style={{
                '--health': snapshot.stats.cityHealthScore,
                '--health-color': health.color,
              } as React.CSSProperties}>
                <div className="sm-health-inner">
                  <span className="sm-health-num">{snapshot.stats.cityHealthScore}</span>
                  <span className="sm-health-label">Health</span>
                </div>
              </div>
              <div className="sm-health-info">
                <div className="sm-health-status" style={{ color: health.color }}>
                  {health.icon} {health.label}
                </div>
                <div className="sm-health-month">{snapshot.label}</div>
                <div className={`sm-wx-strip ${wx.severe ? 'severe' : ''}`}>
                  {wx.icon} {wx.label} · {snapshot.temperature}°F
                  {wx.severe && <span className="sm-wx-impact">{wx.impact}</span>}
                </div>
              </div>
            </div>

            {/* Stat Tiles */}
            <div className="sm-stat-grid">
              <div className="sm-stat-tile" style={{ '--stat-color': '#ef4444' } as React.CSSProperties}>
                <div className="sm-stat-num">{snapshot.stats.critical}</div>
                <div className="sm-stat-bar" style={{ width: `${Math.min(100, (snapshot.stats.critical / Math.max(1, snapshot.stats.totalIssues)) * 100)}%` }} />
                <div className="sm-stat-label">Critical</div>
              </div>
              <div className="sm-stat-tile" style={{ '--stat-color': '#f59e0b' } as React.CSSProperties}>
                <div className="sm-stat-num">{snapshot.stats.high}</div>
                <div className="sm-stat-bar" style={{ width: `${Math.min(100, (snapshot.stats.high / Math.max(1, snapshot.stats.totalIssues)) * 100)}%` }} />
                <div className="sm-stat-label">High</div>
              </div>
              <div className="sm-stat-tile" style={{ '--stat-color': '#6366f1' } as React.CSSProperties}>
                <div className="sm-stat-num">{snapshot.stats.totalIssues}</div>
                <div className="sm-stat-bar" style={{ width: '100%' }} />
                <div className="sm-stat-label">Total Issues</div>
              </div>
              <div className="sm-stat-tile" style={{ '--stat-color': '#ec4899' } as React.CSSProperties}>
                <div className="sm-stat-num">{snapshot.stats.schoolZoneIssues}</div>
                <div className="sm-stat-bar" style={{ width: `${Math.min(100, (snapshot.stats.schoolZoneIssues / Math.max(1, snapshot.stats.totalIssues)) * 100)}%` }} />
                <div className="sm-stat-label">Near Schools</div>
              </div>
            </div>

            {/* Cost impact */}
            <div className="sm-cost-strip">
              <div className="sm-cost-main">
                <Wallet24Regular style={{ color: '#f59e0b' }} />
                <span className="sm-cost-val">${(snapshot.stats.totalCost / 1000).toFixed(0)}K</span>
                <span className="sm-cost-label">Estimated Repair Cost</span>
              </div>
              {costDelta > 0 && (
                <div className="sm-cost-delta">+${(costDelta / 1000).toFixed(0)}K from inaction</div>
              )}
            </div>
          </div>

          {/* Chapter Cards — one per month */}
          {simulation.timeline.map((snap, i) => {
            if (i === 0) return null;
            const isActive = i === currentMonth;
            const isPast = i <= currentMonth;
            const monthHealth = getHealth(snap.stats.cityHealthScore);
            const monthWx = getWeather(snap);
            const milestone = getMilestoneForMonth(i);
            const monthNarrative = narrativeLines[i] || '';
            const prevSnapForChapter = i > 0 ? simulation.timeline[i - 1] : undefined;
            const monthHotspots = isPast ? findCriticalHotspots(snap.workOrders, prevSnapForChapter?.workOrders) : [];

            return (
              <div
                key={i}
                className={`sm-chapter ${isActive ? 'active' : ''} ${isPast ? 'past' : 'future'}`}
                onClick={() => { setIsPlaying(false); setCurrentMonth(i); }}
              >
                {/* Month badge */}
                <div className="sm-chapter-badge" style={{ borderColor: monthHealth.color }}>
                  <span className="sm-chapter-month">Month {i}</span>
                  <span className="sm-chapter-date">{snap.label}</span>
                </div>

                {isPast && (
                  <>
                    {/* Weather + Health row */}
                    <div className="sm-chapter-meta">
                      <span className="sm-chapter-health" style={{ color: monthHealth.color }}>
                        {monthHealth.icon} {snap.stats.cityHealthScore}
                      </span>
                      <span className={`sm-chapter-wx ${monthWx.severe ? 'severe' : ''}`}>
                        {monthWx.icon} {monthWx.label}
                      </span>
                      <span className="sm-chapter-issues">
                        {snap.stats.totalIssues} issues · {snap.stats.critical} critical
                      </span>
                    </div>

                    {/* Milestone alert */}
                    {milestone && (
                      <div className={`sm-milestone ${milestone.severity}`}>
                        <span className="sm-milestone-icon">{milestone.icon}</span>
                        <div className="sm-milestone-body">
                          <strong>{milestone.label}</strong>
                          <span>{milestone.description}</span>
                        </div>
                      </div>
                    )}

                    {/* Narrative text */}
                    {monthNarrative && (
                      <p className="sm-chapter-narrative">
                        {sanitizeNarrative(monthNarrative)}
                      </p>
                    )}

                    {/* Hotspot focus buttons — click to fly map */}
                    {monthHotspots.length > 0 && (
                      <div className="sm-chapter-hotspots">
                        {monthHotspots.slice(0, 3).map((hs, hi) => (
                          <button
                            key={hi}
                            className={`sm-focus-btn ${hs.severity}`}
                            onClick={(e) => { e.stopPropagation(); handleHotspotClick(hs); }}
                          >
                            <MyLocation24Regular style={{ width: 12, height: 12 }} />
                            {hs.label.substring(0, 20)}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Mini cost bar */}
                    <div className="sm-chapter-cost">
                      <span>${(snap.stats.totalCost / 1000).toFixed(0)}K</span>
                      <div className="sm-chapter-cost-bar">
                        <div className="sm-chapter-cost-fill" style={{
                          width: `${Math.min(100, (snap.stats.totalCost / Math.max(1, simulation.timeline[totalMonths].stats.totalCost)) * 100)}%`,
                          background: monthHealth.color,
                        }} />
                      </div>
                    </div>
                  </>
                )}

                {!isPast && (
                  <div className="sm-chapter-locked">
                    <ArrowRight24Regular style={{ width: 14, height: 14 }} />
                    Play simulation to reveal
                  </div>
                )}
              </div>
            );
          })}

          {/* Final summary card */}
          {currentMonth >= totalMonths && (
            <div className="sm-chapter sm-summary-card active">
              <div className="sm-card-label" style={{ color: '#ef4444' }}>SIMULATION COMPLETE</div>
              <h2 className="sm-summary-title">12 Months Without Repairs</h2>
              <div className="sm-summary-stats">
                <div className="sm-summary-stat">
                  <span className="sm-summary-big" style={{ color: '#ef4444' }}>
                    {simulation.timeline[totalMonths].stats.cityHealthScore}
                  </span>
                  <span>City Health</span>
                </div>
                <div className="sm-summary-stat">
                  <span className="sm-summary-big" style={{ color: '#f59e0b' }}>
                    ${(simulation.timeline[totalMonths].stats.totalCost / 1000).toFixed(0)}K
                  </span>
                  <span>Total Cost</span>
                </div>
                <div className="sm-summary-stat">
                  <span className="sm-summary-big" style={{ color: '#6366f1' }}>
                    {simulation.timeline[totalMonths].stats.totalIssues}
                  </span>
                  <span>Total Issues</span>
                </div>
              </div>
              <p className="sm-summary-msg">
                Without intervention, Lake Forest's infrastructure health drops from{' '}
                <strong style={{ color: '#22c55e' }}>{month0.stats.cityHealthScore}</strong> to{' '}
                <strong style={{ color: '#ef4444' }}>{simulation.timeline[totalMonths].stats.cityHealthScore}</strong>,
                repair costs increase by <strong style={{ color: '#f59e0b' }}>
                  ${((simulation.timeline[totalMonths].stats.totalCost - month0.stats.totalCost) / 1000).toFixed(0)}K
                </strong>, and {simulation.timeline[totalMonths].stats.critical} issues reach critical status.
              </p>
              <Button
                appearance="subtle"
                icon={<Map24Regular />}
                onClick={() => onFlyTo?.(42.2586, -87.8407, 13)}
                style={{ marginTop: 10 }}
              >
                View Full City Overview
              </Button>
              <Button
                appearance="primary"
                icon={<Search24Regular />}
                onClick={handleEnterExplore}
                style={{ marginTop: 6 }}
                className="sm-explore-btn"
              >
                Explore Map Freely
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DecayVisualizer;

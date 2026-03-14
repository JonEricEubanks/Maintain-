/**
 * MAINTAIN AI — Visual Work Order Card (TrailCard-style)
 *
 * Theme-aware using CSS variables (var(--bg-secondary), var(--text-primary), etc.)
 * so the card matches both light and dark modes automatically.
 *
 * ALL visual styles remain INLINE for Power Apps reliability.
 */

import React, { useMemo } from 'react';
import {
  MapPin,
  Clock,
  Truck,
  Map as MapIcon,
  Send,
  GraduationCap,
  AlertTriangle,
  Navigation,
} from 'lucide-react';
import type { WorkOrder, Severity, Crew } from '../types/infrastructure';

/* ─── Props ─── */
interface WorkOrderVisualCardProps {
  workOrder: WorkOrder;
  crews: Crew[];
  isSelected?: boolean;
  onSelect: (wo: WorkOrder) => void;
  onViewOnMap: (wo: WorkOrder) => void;
  onDispatch: (woId: string) => void;
  animDelay?: number;
}

/* ─── Severity colours (hero gradients and accent) ─── */
const SEV: Record<Severity, { main: string; glow: string }> = {
  critical: {
    main: '#ef4444',
    glow: '0 0 16px rgba(239,68,68,0.15)',
  },
  high: {
    main: '#f97316',
    glow: '0 0 12px rgba(249,115,22,0.12)',
  },
  medium: {
    main: '#f59e0b',
    glow: 'none',
  },
  low: {
    main: '#22c55e',
    glow: 'none',
  },
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

const TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole',
  sidewalk: 'Sidewalk',
  concrete: 'Concrete',
  bridge: 'Bridge',
  guardrail: 'Guardrail',
  sewer: 'Sewer',
  water_main: 'Water Main',
  street_light: 'Street Light',
};

/* ─── Component ─── */
const WorkOrderVisualCard: React.FC<WorkOrderVisualCardProps> = ({
  workOrder: wo,
  crews,
  isSelected = false,
  onSelect,
  onViewOnMap,
  onDispatch,
  animDelay = 0,
}) => {
  const s = SEV[wo.severity];
  const crew = crews.find(c => c.id === wo.assignedCrewId);

  /* ── Map tile URL ── */
  const tileUrl = useMemo(() => {
    const zoom = 15;
    const n = Math.pow(2, zoom);
    const x = Math.floor(((wo.longitude + 180) / 360) * n);
    const latR = (wo.latitude * Math.PI) / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
    return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  }, [wo.latitude, wo.longitude]);

  /* ── Computed values ── */
  const created = new Date(wo.createdAt);
  const ageDays = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  const ageStr = ageDays === 0 ? 'Today' : ageDays === 1 ? '1 day' : `${ageDays}d`;
  const costStr = wo.estimatedCost >= 1000
    ? `$${(wo.estimatedCost / 1000).toFixed(1)}K`
    : `$${wo.estimatedCost.toLocaleString()}`;
  const dateStr = created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  let pScore = 0;
  if (wo.severity === 'critical') pScore += 40;
  else if (wo.severity === 'high') pScore += 30;
  else if (wo.severity === 'medium') pScore += 20;
  else pScore += 10;
  pScore += Math.min(ageDays * 2, 30);
  if (wo.estimatedCost >= 3000) pScore += 20;
  else if (wo.estimatedCost >= 1000) pScore += 10;
  if (wo.nearSchool) pScore += 10;
  pScore = Math.min(pScore, 99);
  const scoreClr = pScore >= 60 ? '#f87171' : pScore >= 35 ? '#fbbf24' : '#4ade80';

  /* Status color helpers */
  const statusBg = wo.status === 'open'
    ? 'rgba(59,130,246,0.12)' : wo.status === 'assigned'
    ? 'rgba(139,92,246,0.12)' : wo.status === 'in_progress'
    ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)';
  const statusClr = wo.status === 'open'
    ? '#60a5fa' : wo.status === 'assigned'
    ? '#a78bfa' : wo.status === 'in_progress'
    ? '#fbbf24' : '#4ade80';
  const statusBorder = wo.status === 'open'
    ? 'rgba(59,130,246,0.2)' : wo.status === 'assigned'
    ? 'rgba(139,92,246,0.2)' : wo.status === 'in_progress'
    ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)';

  /* ═══════════════════════════════════════
     RENDER — inline styles with CSS vars for theme
     ═══════════════════════════════════════ */
  return (
    <div
      onClick={() => onSelect(wo)}
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
        border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
        boxShadow: isSelected
          ? 'var(--shadow-lg)'
          : s.glow !== 'none'
            ? `${s.glow}, var(--shadow-md)`
            : 'var(--shadow-md)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column' as const,
        animation: 'card-enter 0.35s ease both',
        animationDelay: `${animDelay}ms`,
        transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
        minHeight: 300,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.01)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ''; }}
    >
      {/* ══════════════════════════════════
          HERO — Map image + gradient + overlaid text
          ══════════════════════════════════ */}
      <div
        onClick={(e) => { e.stopPropagation(); onViewOnMap(wo); }}
        style={{
          position: 'relative',
          height: 120,
          minHeight: 120,
          overflow: 'hidden',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {/* Map tile background */}
        <img
          src={tileUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
            transform: 'scale(1.15)',
          }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />

        {/* Severity accent stripe (top) */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: s.main, zIndex: 6 }} />

        {/* Subtle bottom fade for text readability */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
        }} />

        {/* Priority badge (top-left) */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 8,
            padding: '3px 7px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 800,
            color: scoreClr,
            fontVariantNumeric: 'tabular-nums',
            zIndex: 3,
          }}
        >
          {pScore}
        </div>

        {/* Cost badge (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 8,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            fontSize: 11,
            fontWeight: 800,
            color: '#4ade80',
            fontVariantNumeric: 'tabular-nums',
            zIndex: 3,
            letterSpacing: '-0.02em',
          }}
        >
          {costStr}
        </div>

        {/* Map pin (center) */}
        <div
          style={{
            position: 'absolute',
            top: '42%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: s.main,
            border: '2px solid white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            zIndex: 3,
            opacity: 0.9,
          }}
        >
          <MapPin style={{ width: 12, height: 12 }} />
        </div>

        {/* Overlaid title + address (bottom of hero) */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 10px 8px', zIndex: 4 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.25,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}>
            {wo.title}
          </div>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.2,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}>
            {wo.address}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          INFO ROW — Severity, Type, Status tags
          ══════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {/* Severity tag */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 5,
            fontSize: 10, fontWeight: 700, textTransform: 'capitalize' as const,
            background: `${s.main}22`, color: s.main, border: `1px solid ${s.main}40`,
          }}
        >
          <AlertTriangle style={{ width: 10, height: 10 }} />
          {wo.severity}
        </span>

        {/* Type tag */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 7px', borderRadius: 5,
            fontSize: 10, fontWeight: 600,
            background: 'var(--glass-bg)', color: 'var(--text-secondary)',
            border: '1px solid var(--glass-border)',
          }}
        >
          {TYPE_LABELS[wo.issueType] || wo.issueType}
        </span>

        {/* Status tag */}
        <span
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '2px 7px', borderRadius: 5,
            fontSize: 10, fontWeight: 600,
            background: statusBg, color: statusClr, border: `1px solid ${statusBorder}`,
          }}
        >
          {STATUS_LABEL[wo.status] || wo.status}
        </span>

        {wo.nearSchool && (
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 6px', borderRadius: 5,
              fontSize: 9, fontWeight: 700,
              background: 'rgba(236,72,153,0.12)', color: '#f472b6',
              border: '1px solid rgba(236,72,153,0.2)',
            }}
          >
            <GraduationCap style={{ width: 9, height: 9 }} /> School
          </span>
        )}

        {/* Nav icon (right-aligned) */}
        <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <div
            style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            onClick={(e) => { e.stopPropagation(); onViewOnMap(wo); }}
          >
            <Navigation style={{ width: 12, height: 12, color: s.main }} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          STATS BAR — 3 columns (TrailCard-style)
          ══════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid var(--glass-border)',
          flexShrink: 0,
        }}
      >
        {/* Cost */}
        <div style={{ flex: 1, padding: '5px 6px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {costStr}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: 1, opacity: 0.7 }}>
            Est. Cost
          </div>
        </div>

        <div style={{ width: 1, background: 'var(--glass-border)', alignSelf: 'stretch' }} />

        {/* Priority */}
        <div style={{ flex: 1, padding: '5px 6px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: scoreClr, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {pScore}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: 1, opacity: 0.7 }}>
            Priority
          </div>
        </div>

        <div style={{ width: 1, background: 'var(--glass-border)', alignSelf: 'stretch' }} />

        {/* Age */}
        <div style={{ flex: 1, padding: '5px 6px', textAlign: 'center' as const }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {ageStr}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: 1, opacity: 0.7 }}>
            Age
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════
          CREW + DATE ROW
          ══════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          fontSize: 10,
          color: 'var(--text-secondary)',
        }}
      >
        <Truck style={{ width: 12, height: 12, flexShrink: 0, color: crew ? '#4ade80' : 'var(--text-muted)' }} />
        <span style={{ fontWeight: 600, color: crew ? '#4ade80' : 'var(--text-secondary)', opacity: crew ? 1 : 0.6 }}>
          {crew ? crew.name : 'Unassigned'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', opacity: 0.6 }}>
          {dateStr}
        </span>
        {wo.zone && (
          <span style={{
            fontSize: 8, fontWeight: 700, color: 'var(--text-secondary)',
            textTransform: 'uppercase' as const, letterSpacing: '0.06em',
            padding: '1px 5px', borderRadius: 4,
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            opacity: 0.7,
          }}>
            Zone {wo.zone}
          </span>
        )}
      </div>

      {/* ══════════════════════════════════
          ACTIONS — Map + Assign
          ══════════════════════════════════ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px 8px',
          borderTop: '1px solid var(--glass-border)',
          marginTop: 'auto',
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onViewOnMap(wo); }}
          style={{
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 28,
            borderRadius: 7,
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--glass-bg)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          title="View on Map"
        >
          <MapIcon style={{ width: 14, height: 14 }} />
        </button>
        {wo.status === 'open' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDispatch(wo.id); }}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              height: 28,
              borderRadius: 7,
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
              border: 'none',
              color: 'white',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
              transition: 'all 0.2s',
              padding: '0 8px',
              whiteSpace: 'nowrap' as const,
              overflow: 'hidden',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #60a5fa, #3b82f6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
            }}
          >
            <Send style={{ width: 11, height: 11, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Assign</span>
          </button>
        ) : wo.status === 'assigned' ? (
          <div
            style={{
              flex: 1, minWidth: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 7, height: 28,
              background: 'rgba(34,197,94,0.1)', color: '#4ade80',
              fontSize: 10, fontWeight: 700, border: '1px solid rgba(34,197,94,0.2)',
              whiteSpace: 'nowrap' as const, overflow: 'hidden',
            }}
          >
            <Truck style={{ width: 11, height: 11, flexShrink: 0 }} />
            Assigned
          </div>
        ) : null}
      </div>

      {/* Bottom severity accent bar */}
      <div style={{ height: 3, background: s.main, flexShrink: 0, opacity: 0.8 }} />
    </div>
  );
};

export default WorkOrderVisualCard;

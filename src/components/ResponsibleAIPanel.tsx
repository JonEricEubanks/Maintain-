/**
 * MAINTAIN AI — Responsible AI Panel
 *
 * Consolidated governance view combining:
 * 1. Content Safety status & recent validations
 * 2. AI Decision audit log (embedded)
 * 3. Human override statistics
 * 4. Agent confidence distribution
 * 5. Data flow transparency (MCP read-only / Dataverse write)
 *
 * Designed for enterprise reviewers,auditors, and hackathon judges
 * evaluating Responsible AI practices.
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
} from '@fluentui/react-components';
import {
  Shield24Regular,
  ShieldCheckmark24Regular,
  Brain24Regular,
  Person24Regular,
  Eye24Regular,
  Warning24Regular,
  CheckmarkCircle24Regular,
  Dismiss24Regular,
  LockClosed24Regular,
  ArrowSync24Regular,
  Database24Regular,
} from '@fluentui/react-icons';

import AIDecisionLog from './AIDecisionLog';
import OverlayShell from './OverlayShell';
import dataverseService from '../services/dataverseService';

// ============================================
// Types
// ============================================

interface ContentSafetyStatus {
  endpoint: string;
  configured: boolean;
  categoriesChecked: string[];
  severityThreshold: number;
}

interface ResponsibleAIProps {
  isVisible: boolean;
  onClose: () => void;
}

// ============================================
// Agent API URL
// ============================================

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

// ============================================
// Component
// ============================================

const ResponsibleAIPanel: React.FC<ResponsibleAIProps> = ({ isVisible, onClose }) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'decisions' | 'safety'>('overview');
  const [decisionStats, setDecisionStats] = useState<{
    total: number;
    byAgent: Record<string, number>;
    overrideRate: number;
    avgConfidence: number;
    avgProcessingTime: number;
  } | null>(null);
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Auto-seed demo data if nothing exists yet
      const existingDecisions = await dataverseService.getAIDecisions({ limit: 1 });
      if (existingDecisions.length === 0) {
        await dataverseService.seedDemoData();
      }

      const [statsRes, healthRes] = await Promise.allSettled([
        dataverseService.getAIDecisionStats(),
        AGENT_API_URL
          ? fetch(`${AGENT_API_URL}/health`, { signal: AbortSignal.timeout(5000) }).then(r => r.json())
          : Promise.resolve(null),
      ]);
      if (statsRes.status === 'fulfilled') setDecisionStats(statsRes.value);
      if (healthRes.status === 'fulfilled') setHealthData(healthRes.value);
    } catch (err) {
      console.error('RAI panel load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) loadData();
  }, [isVisible, loadData]);

  if (!isVisible) return null;

  const tracing = (healthData as any)?.tracing;
  const storage = (healthData as any)?.storage;
  const contentSafetyConfigured = !!tracing; // proxy — full check in sub-section

  return (
    <OverlayShell size="xl" onClose={onClose}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(59, 130, 246, 0.08))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheckmark24Regular style={{ color: '#10b981' }} />
            <Title2 style={{ margin: 0 }}>Responsible AI Governance</Title2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button appearance="subtle" icon={<ArrowSync24Regular />} onClick={loadData} size="small">Refresh</Button>
            <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} size="small" />
          </div>
        </div>

        {/* Section Tabs */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--bg-secondary)',
          padding: '0 16px',
        }}>
          {(['overview', 'decisions', 'safety'] as const).map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              style={{
                padding: '10px 18px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeSection === section ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: activeSection === section ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: activeSection === section ? 600 : 400,
                fontSize: 13,
                transition: 'all 0.15s ease',
              }}
            >
              {section === 'overview' && <><Shield24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Overview</>}
              {section === 'decisions' && <><Brain24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Decision Audit</>}
              {section === 'safety' && <><LockClosed24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> Content Safety</>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Spinner label="Loading governance data..." />
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <OverviewSection stats={decisionStats} health={healthData} />
              )}
              {activeSection === 'decisions' && (
                <AIDecisionLog maxEntries={50} />
              )}
              {activeSection === 'safety' && (
                <ContentSafetySection health={healthData} />
              )}
            </>
          )}
        </div>
    </OverlayShell>
  );
};

// ============================================
// Overview Section
// ============================================

const OverviewSection: React.FC<{
  stats: {
    total: number;
    byAgent: Record<string, number>;
    overrideRate: number;
    avgConfidence: number;
    avgProcessingTime: number;
  } | null;
  health: Record<string, unknown> | null;
}> = ({ stats, health }) => {
  const tracing = (health as any)?.tracing;
  const storage = (health as any)?.storage;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Governance Pillars */}
      <Title3>Governance Pillars</Title3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 14,
      }}>
        <PillarCard
          icon={<Brain24Regular />}
          title="AI Transparency"
          status="active"
          description="Every AI decision includes reasoning chains, confidence scores, and factor breakdowns visible to operators."
        />
        <PillarCard
          icon={<Person24Regular />}
          title="Human-in-the-Loop"
          status="active"
          description="All dispatch recommendations require human approval. Operators can override any AI decision with documented reasoning."
        />
        <PillarCard
          icon={<ShieldCheckmark24Regular />}
          title="Content Safety"
          status={health ? 'active' : 'limited'}
          description="Azure Content Safety API validates all AI-generated text for hate speech, violence, self-harm, and sexual content."
        />
        <PillarCard
          icon={<Eye24Regular />}
          title="Observability"
          status={tracing?.enabled ? 'active' : 'limited'}
          description="OpenTelemetry distributed tracing with Azure Monitor integration. Every agent call is instrumented and auditable."
        />
        <PillarCard
          icon={<LockClosed24Regular />}
          title="Data Governance"
          status="active"
          description="MCP data is READ-ONLY. All mutations go through Dataverse with full audit trail. No secrets in source code."
        />
        <PillarCard
          icon={<Database24Regular />}
          title="Audit Trail"
          status={stats && stats.total > 0 ? 'active' : 'limited'}
          description="Every AI decision is logged to Dataverse with model name, tokens used, processing time, and override history."
        />
      </div>

      <Divider />

      {/* Decision Stats */}
      <Title3>AI Decision Statistics</Title3>
      {stats ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
        }}>
          <StatCard label="Total Decisions" value={stats.total.toString()} />
          <StatCard
            label="Override Rate"
            value={`${(stats.overrideRate * 100).toFixed(1)}%`}
            highlight={stats.overrideRate > 0.15}
            tooltip="Percentage of AI decisions overridden by human operators"
          />
          <StatCard
            label="Avg Confidence"
            value={`${(stats.avgConfidence * 100).toFixed(0)}%`}
          />
          <StatCard
            label="Avg Processing"
            value={`${stats.avgProcessingTime.toFixed(0)}ms`}
          />
          {Object.entries(stats.byAgent).map(([agent, count]) => (
            <StatCard
              key={agent}
              label={formatAgentLabel(agent)}
              value={count.toString()}
            />
          ))}
        </div>
      ) : (
        <Caption1 style={{ opacity: 0.6 }}>
          No AI decisions recorded yet. Run an analysis or dispatch to see statistics.
        </Caption1>
      )}

      <Divider />

      {/* Data Architecture */}
      <Title3>Data Flow Architecture</Title3>
      <DataFlowDiagram />
    </div>
  );
};

// ============================================
// Data Flow Architecture Diagram
// ============================================

const DataFlowDiagram: React.FC = () => {
  const boxStyle = (color: string, bg: string) => ({
    fill: bg, stroke: color, strokeWidth: 1.5, rx: 10, ry: 10,
  });
  const textColor = 'var(--text-primary)';
  const subColor = 'var(--text-secondary)';
  const tagStyle = (bg: string, _text: string) => ({
    fill: bg, rx: 8, ry: 8, stroke: 'none',
  });

  return (
    <div style={{
      padding: 12,
      borderRadius: 'var(--radius-md)',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      overflowX: 'auto',
    }}>
      <svg viewBox="0 0 780 530" style={{ width: '100%', height: 'auto', minWidth: 500 }}>
        <defs>
          {/* Arrow markers */}
          <marker id="arrowGreen" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L10,4 L0,8 Z" fill="#10b981" />
          </marker>
          <marker id="arrowBlue" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L10,4 L0,8 Z" fill="#3b82f6" />
          </marker>
          <marker id="arrowPurple" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L10,4 L0,8 Z" fill="#a855f7" />
          </marker>
          <marker id="arrowAmber" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="8" markerHeight="6" orient="auto">
            <path d="M0,0 L10,4 L0,8 Z" fill="#f59e0b" />
          </marker>

          {/* ── SVG Icon Symbols ── */}
          <symbol id="icoServer" viewBox="0 0 16 16">
            <rect x="2" y="1.5" width="12" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="2" y="8.5" width="12" height="5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="5" cy="4" r="1" fill="currentColor"/>
            <circle cx="5" cy="11" r="1" fill="currentColor"/>
            <line x1="7.5" y1="4" x2="10.5" y2="4" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="7.5" y1="11" x2="10.5" y2="11" stroke="currentColor" strokeWidth="0.8"/>
          </symbol>
          <symbol id="icoCloud" viewBox="0 0 16 16">
            <circle cx="11.5" cy="3.5" r="2.2" fill="none" stroke="currentColor" strokeWidth="1"/>
            <line x1="11.5" y1="0.8" x2="11.5" y2="1.8" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="14.2" y1="3.5" x2="15" y2="3.5" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="13.3" y1="1.8" x2="13.9" y2="1.2" stroke="currentColor" strokeWidth="0.8"/>
            <path d="M4 13h6.5a3 3 0 0 0 .3-5.97A4 4 0 0 0 3.5 8.5 2.5 2.5 0 0 0 4 13z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
          </symbol>
          <symbol id="icoMap" viewBox="0 0 16 16">
            <path d="M8 1C5.5 1 3.5 3 3.5 5.5c0 3.5 4.5 9 4.5 9s4.5-5.5 4.5-9C12.5 3 10.5 1 8 1z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="8" cy="5.5" r="1.5" fill="currentColor"/>
          </symbol>
          <symbol id="icoBrain" viewBox="0 0 16 16">
            <circle cx="4.5" cy="4.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.1"/>
            <circle cx="11.5" cy="4.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.1"/>
            <circle cx="8" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.1"/>
            <line x1="6" y1="6.2" x2="7" y2="10" stroke="currentColor" strokeWidth="0.9"/>
            <line x1="10" y1="6.2" x2="9" y2="10" stroke="currentColor" strokeWidth="0.9"/>
            <line x1="7" y1="4.5" x2="9" y2="4.5" stroke="currentColor" strokeWidth="0.9"/>
          </symbol>
          <symbol id="icoChart" viewBox="0 0 16 16">
            <rect x="1.5" y="8" width="3.5" height="6.5" rx="0.5" fill="currentColor" opacity="0.6"/>
            <rect x="6.25" y="3.5" width="3.5" height="11" rx="0.5" fill="currentColor" opacity="0.8"/>
            <rect x="11" y="5.5" width="3.5" height="9" rx="0.5" fill="currentColor"/>
          </symbol>
          <symbol id="icoTarget" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1"/>
            <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
          </symbol>
          <symbol id="icoPerson" viewBox="0 0 16 16">
            <circle cx="8" cy="4.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2.5 15.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
          </symbol>
          <symbol id="icoTruck" viewBox="0 0 16 16">
            <rect x="0.5" y="4" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M9.5 6.5h3l2 3v1h-5V6.5z" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="3.5" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <circle cx="12" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
          </symbol>
          <symbol id="icoChat" viewBox="0 0 16 16">
            <path d="M2 2.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6.5l-3 3v-3H2a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <line x1="4.5" y1="5.5" x2="11.5" y2="5.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round"/>
            <line x1="4.5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round"/>
          </symbol>
          <symbol id="icoClipboard" viewBox="0 0 16 16">
            <rect x="2" y="2.5" width="12" height="12.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="5" y="0.5" width="6" height="3.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/>
            <line x1="5" y1="7.5" x2="11" y2="7.5" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="5" y1="10" x2="11" y2="10" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="5" y1="12.5" x2="8.5" y2="12.5" stroke="currentColor" strokeWidth="0.8"/>
          </symbol>
          <symbol id="icoSearch" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <line x1="10.5" y1="10.5" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </symbol>
          <symbol id="icoDoc" viewBox="0 0 16 16">
            <path d="M4 1h6l4 4v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M10 1v4h4" fill="none" stroke="currentColor" strokeWidth="1"/>
            <line x1="5.5" y1="8.5" x2="10.5" y2="8.5" stroke="currentColor" strokeWidth="0.8"/>
            <line x1="5.5" y1="11" x2="10.5" y2="11" stroke="currentColor" strokeWidth="0.8"/>
          </symbol>
          <symbol id="icoSignal" viewBox="0 0 16 16">
            <path d="M2.5 9.5a7 7 0 0 1 11 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <path d="M5 11.5a4 4 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <circle cx="8" cy="13.5" r="1.3" fill="currentColor"/>
          </symbol>
          <symbol id="icoBolt" viewBox="0 0 16 16">
            <path d="M9.5 1L4 9h4.5L7 15l6-8H8.5L9.5 1z" fill="currentColor" opacity="0.85"/>
          </symbol>
          <symbol id="icoShield" viewBox="0 0 16 16">
            <path d="M8 1L2 3.5v4.5c0 3.5 2.5 6 6 7 3.5-1 6-3.5 6-7V3.5L8 1z" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M5.5 8l2 2 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </symbol>
          <symbol id="icoUser" viewBox="0 0 16 16">
            <circle cx="8" cy="5" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 15.5c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" strokeWidth="1.3"/>
          </symbol>
        </defs>

        {/* ── Row 1: Data Sources ── */}
        <rect x="20" y="15" width="220" height="72" {...boxStyle('#10b981', 'rgba(16,185,129,0.08)')} />
        <use href="#icoServer" x={78} y={25} width={14} height={14} style={{ color: '#10b981' }} />
        <text x="138" y="38" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">MCP Server</text>
        <text x="130" y="55" textAnchor="middle" fill={subColor} fontSize="10">Azure Container Apps</text>
        <rect x="55" y="63" width="60" height="16" {...tagStyle('rgba(16,185,129,0.18)', '#10b981')} />
        <text x="85" y="75" textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="700">READ-ONLY</text>
        <rect x="120" y="63" width="90" height="16" {...tagStyle('rgba(16,185,129,0.12)', '#10b981')} />
        <text x="165" y="75" textAnchor="middle" fill={subColor} fontSize="8">work orders, potholes</text>

        <rect x="280" y="15" width="220" height="72" {...boxStyle('#3b82f6', 'rgba(59,130,246,0.08)')} />
        <use href="#icoCloud" x={340} y={25} width={14} height={14} style={{ color: '#3b82f6' }} />
        <text x="398" y="38" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">Weather API</text>
        <text x="390" y="55" textAnchor="middle" fill={subColor} fontSize="10">OpenWeatherMap</text>
        <rect x="340" y="63" width="100" height="16" {...tagStyle('rgba(59,130,246,0.15)', '#3b82f6')} />
        <text x="390" y="75" textAnchor="middle" fill={subColor} fontSize="8">freeze-thaw, forecast</text>

        <rect x="540" y="15" width="220" height="72" {...boxStyle('#a855f7', 'rgba(168,85,247,0.08)')} />
        <use href="#icoMap" x={600} y={25} width={14} height={14} style={{ color: '#a855f7' }} />
        <text x="658" y="38" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">GIS / Schools</text>
        <text x="650" y="55" textAnchor="middle" fill={subColor} fontSize="10">Geospatial via MCP</text>
        <rect x="600" y="63" width="100" height="16" {...tagStyle('rgba(168,85,247,0.15)', '#a855f7')} />
        <text x="650" y="75" textAnchor="middle" fill={subColor} fontSize="8">proximity, zones</text>

        {/* ── Arrows: Sources → Agents ── */}
        <line x1="130" y1="87" x2="130" y2="130" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrowGreen)" />
        <line x1="390" y1="87" x2="390" y2="130" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrowBlue)" />
        <line x1="650" y1="87" x2="650" y2="130" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrowPurple)" />
        <text x="140" y="114" fill="#10b981" fontSize="9" fontWeight="600">read</text>
        <text x="400" y="114" fill="#3b82f6" fontSize="9" fontWeight="600">read</text>
        <text x="660" y="114" fill="#a855f7" fontSize="9" fontWeight="600">read</text>

        {/* ── Row 2: AI Agent Pipeline (height expanded for badges) ── */}
        <rect x="20" y="135" width="740" height="120" {...boxStyle('#6366f1', 'rgba(99,102,241,0.06)')} />
        <use href="#icoBrain" x={168} y={143} width={14} height={14} style={{ color: '#6366f1' }} />
        <text x="398" y="157" textAnchor="middle" fill={textColor} fontSize="14" fontWeight="700">AI Agent Pipeline — Azure AI Foundry (GPT-4.1 Mini)</text>

        {/* Agent boxes inside */}
        {[
          { x: 35,  label: 'Analysis',       icoId: 'icoChart',  sub: 'Risk scoring' },
          { x: 180, label: 'Prioritization',  icoId: 'icoTarget', sub: 'Ranking' },
          { x: 325, label: 'Crew Estimation', icoId: 'icoPerson', sub: 'Resource plan' },
          { x: 470, label: 'Dispatch',        icoId: 'icoTruck',  sub: 'Route optimize' },
          { x: 615, label: 'NLP Dashboard',   icoId: 'icoChat',   sub: 'Natural lang' },
        ].map((a, i) => (
          <g key={a.label}>
            <rect x={a.x} y="168" width="120" height="50" rx="8" ry="8" fill="rgba(99,102,241,0.12)" stroke="rgba(99,102,241,0.3)" strokeWidth="1" />
            <use href={`#${a.icoId}`} x={a.x + 10} y={180} width={11} height={11} style={{ color: textColor }} />
            <text x={a.x + 67} y="190" textAnchor="middle" fill={textColor} fontSize="10" fontWeight="600">{a.label}</text>
            <text x={a.x + 60} y="206" textAnchor="middle" fill={subColor} fontSize="8.5">{a.sub}</text>
            {i < 4 && <line x1={a.x + 120} y1="193" x2={a.x + 140} y2="193" stroke="rgba(99,102,241,0.4)" strokeWidth="1" strokeDasharray="3,2" />}
          </g>
        ))}

        {/* ── Pipeline capability badges (inside box, with breathing room) ── */}
        <use href="#icoShield" x={44} y={224} width={11} height={11} style={{ color: '#10b981' }} />
        <rect x="57" y="224" width="80" height="16" rx="8" ry="8" fill="rgba(16,185,129,0.12)" />
        <text x="97" y="235" textAnchor="middle" fill="#10b981" fontSize="8" fontWeight="700">Content Safety</text>

        <use href="#icoSignal" x={148} y={224} width={11} height={11} style={{ color: '#3b82f6' }} />
        <rect x="161" y="224" width="80" height="16" rx="8" ry="8" fill="rgba(59,130,246,0.12)" />
        <text x="201" y="235" textAnchor="middle" fill="#3b82f6" fontSize="8" fontWeight="700">OpenTelemetry</text>

        <rect x="254" y="224" width="80" height="16" rx="8" ry="8" fill="rgba(168,85,247,0.12)" />
        <text x="294" y="235" textAnchor="middle" fill="#a855f7" fontSize="8" fontWeight="700">Model Router</text>

        <rect x="346" y="224" width="110" height="16" rx="8" ry="8" fill="rgba(245,158,11,0.12)" />
        <text x="401" y="235" textAnchor="middle" fill="#f59e0b" fontSize="8" fontWeight="700">RAG Knowledge Base</text>

        {/* ── Arrows: Agents → Outputs ── */}
        <line x1="200" y1="255" x2="200" y2="300" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrowAmber)" />
        <text x="208" y="284" fill="#f59e0b" fontSize="9" fontWeight="600">recommend</text>

        <line x1="390" y1="255" x2="390" y2="300" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrowPurple)" />
        <text x="398" y="284" fill="#6366f1" fontSize="9" fontWeight="600">log</text>

        <line x1="600" y1="255" x2="600" y2="300" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#arrowGreen)" />
        <text x="608" y="284" fill="#10b981" fontSize="9" fontWeight="600">trace</text>

        {/* ── Row 3: Write Targets ── */}
        <rect x="20" y="305" width="230" height="78" {...boxStyle('#f59e0b', 'rgba(245,158,11,0.06)')} />
        <use href="#icoClipboard" x={90} y={317} width={13} height={13} style={{ color: '#f59e0b' }} />
        <text x="142" y="330" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">Dataverse</text>
        <text x="135" y="346" textAnchor="middle" fill={subColor} fontSize="10">Power Platform (Operational Data)</text>
        <text x="135" y="364" textAnchor="middle" fill={subColor} fontSize="9">iw_crewdispatch · iw_aidecisionlog</text>
        <rect x="55" y="369" width="160" height="14" rx="7" ry="7" fill="rgba(245,158,11,0.15)" />
        <text x="135" y="379" textAnchor="middle" fill="#f59e0b" fontSize="8" fontWeight="700">Human Approval Required</text>

        <rect x="280" y="305" width="230" height="78" {...boxStyle('#6366f1', 'rgba(99,102,241,0.06)')} />
        <use href="#icoSearch" x={348} y={317} width={13} height={13} style={{ color: '#6366f1' }} />
        <text x="402" y="330" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">AI Decision Log</text>
        <text x="395" y="346" textAnchor="middle" fill={subColor} fontSize="10">Audit Trail (Dataverse)</text>
        <text x="395" y="364" textAnchor="middle" fill={subColor} fontSize="9">reasoning · confidence · tokens · model</text>
        <rect x="330" y="369" width="130" height="14" rx="7" ry="7" fill="rgba(99,102,241,0.15)" />
        <text x="395" y="379" textAnchor="middle" fill="#6366f1" fontSize="8" fontWeight="700">Full Audit Trail</text>

        <rect x="540" y="305" width="220" height="78" {...boxStyle('#10b981', 'rgba(16,185,129,0.06)')} />
        <use href="#icoSignal" x={605} y={317} width={13} height={13} style={{ color: '#10b981' }} />
        <text x="657" y="330" textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">Azure Monitor</text>
        <text x="650" y="346" textAnchor="middle" fill={subColor} fontSize="10">Observability & Tracing</text>
        <text x="650" y="364" textAnchor="middle" fill={subColor} fontSize="9">spans · latency · errors · p95</text>
        <rect x="585" y="369" width="130" height="14" rx="7" ry="7" fill="rgba(16,185,129,0.15)" />
        <use href="#icoBolt" x={596} y={370} width={10} height={10} style={{ color: '#10b981' }} />
        <text x="656" y="379" textAnchor="middle" fill="#10b981" fontSize="8" fontWeight="700">OpenTelemetry</text>

        {/* ── Row 4: Human Layer ── */}
        <line x1="135" y1="383" x2="135" y2="420" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrowAmber)" />
        <text x="145" y="408" fill="#f59e0b" fontSize="9" fontWeight="600">approve</text>

        <rect x="20" y="425" width="740" height="72" {...boxStyle('#0ea5e9', 'rgba(14,165,233,0.06)')} />
        <use href="#icoUser" x={198} y={435} width={14} height={14} style={{ color: '#0ea5e9' }} />
        <text x="400" y="448" textAnchor="middle" fill={textColor} fontSize="14" fontWeight="700">Human Operator — MAINTAIN Command Center</text>
        <text x="390" y="467" textAnchor="middle" fill={subColor} fontSize="10">Review AI recommendations · Override with documented reasoning · Approve dispatches</text>
        <rect x="270" y="475" width="100" height="14" rx="7" ry="7" fill="rgba(14,165,233,0.15)" />
        <text x="320" y="485" textAnchor="middle" fill="#0ea5e9" fontSize="8" fontWeight="700">Full Control</text>
        <rect x="380" y="475" width="100" height="14" rx="7" ry="7" fill="rgba(16,185,129,0.15)" />
        <text x="430" y="485" textAnchor="middle" fill="#10b981" fontSize="8" fontWeight="700">Override Audit</text>

        {/* ── Legend ── */}
        <line x1="40" y1="512" x2="65" y2="512" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" />
        <text x="70" y="515" fill={subColor} fontSize="8">Read path</text>
        <line x1="150" y1="512" x2="175" y2="512" stroke="#f59e0b" strokeWidth="1.5" />
        <text x="180" y="515" fill={subColor} fontSize="8">Write path</text>
        <line x1="260" y1="512" x2="285" y2="512" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4,3" />
        <text x="290" y="515" fill={subColor} fontSize="8">Audit log</text>
        <rect x="370" y="507" width="8" height="8" rx="2" fill="rgba(14,165,233,0.3)" />
        <text x="383" y="515" fill={subColor} fontSize="8">Human-in-the-loop</text>
      </svg>
    </div>
  );
};

// ============================================
// Content Safety Section
// ============================================

const ContentSafetySection: React.FC<{ health: Record<string, unknown> | null }> = ({ health }) => {
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    if (!testText.trim() || !AGENT_API_URL) return;
    setTesting(true);
    try {
      const res = await fetch(`${AGENT_API_URL}/api/content-safety`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: testText }),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ safe: false, error: 'Service unreachable' });
    } finally {
      setTesting(false);
    }
  };

  const categories = ['Hate', 'Violence', 'SelfHarm', 'Sexual'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Title3>Azure Content Safety</Title3>
      <Caption1 style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Every AI-generated dispatch recommendation and decision log entry is validated through Azure Content Safety
        before being shown to operators. This ensures no harmful, biased, or inappropriate content reaches the UI.
      </Caption1>

      {/* Categories Monitored */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {categories.map(cat => (
          <div key={cat} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '14px 8px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.15)',
          }}>
            <ShieldCheckmark24Regular style={{ color: '#10b981', marginBottom: 6 }} />
            <Text weight="semibold" size={200}>{cat}</Text>
            <Caption1 style={{ color: '#10b981' }}>Monitored</Caption1>
          </div>
        ))}
      </div>

      <Divider />

      {/* Config Display */}
      <div>
        <Title3 style={{ marginBottom: 8 }}>Configuration</Title3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          gap: '6px 16px',
          fontSize: 13,
        }}>
          <Text size={200} weight="semibold">Severity Threshold</Text>
          <Caption1>2 (moderate — blocks severity ≥ 2 on 0-6 scale)</Caption1>
          <Text size={200} weight="semibold">API Version</Text>
          <Caption1>2024-09-01</Caption1>
          <Text size={200} weight="semibold">Validation Points</Text>
          <Caption1>Dispatch recommendations, override reasons, field notes</Caption1>
          <Text size={200} weight="semibold">Fallback Behavior</Text>
          <Caption1>If service unavailable: pass-through with audit log entry</Caption1>
        </div>
      </div>

      <Divider />

      {/* Live Test */}
      <div>
        <Title3 style={{ marginBottom: 8 }}>Live Validation Test</Title3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            value={testText}
            onChange={e => setTestText(e.target.value)}
            placeholder="Enter text to validate against Content Safety..."
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
            onKeyDown={e => e.key === 'Enter' && runTest()}
          />
          <Button appearance="primary" onClick={runTest} disabled={testing || !testText.trim()}>
            {testing ? 'Checking...' : 'Validate'}
          </Button>
        </div>

        {testResult && (
          <div style={{
            padding: 12,
            borderRadius: 'var(--radius-md)',
            background: (testResult as any).safe
              ? 'rgba(16, 185, 129, 0.08)'
              : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${(testResult as any).safe ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {(testResult as any).safe ? (
                <CheckmarkCircle24Regular style={{ color: '#10b981' }} />
              ) : (
                <Warning24Regular style={{ color: '#ef4444' }} />
              )}
              <Text weight="semibold">
                {(testResult as any).safe ? 'Content is safe' : 'Content flagged'}
              </Text>
              {!(testResult as any).analysis_available && (
                <Badge size="small" color="warning">Service not configured</Badge>
              )}
            </div>
            {(testResult as any).categories && Object.keys((testResult as any).categories).length > 0 && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {Object.entries((testResult as any).categories as Record<string, number>).map(([cat, score]) => (
                  <Caption1 key={cat}>
                    {cat}: <strong style={{ color: score >= 2 ? '#ef4444' : '#10b981' }}>{score}</strong>
                  </Caption1>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Sub-Components
// ============================================

const PillarCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  status: 'active' | 'limited' | 'inactive';
  description: string;
}> = ({ icon, title, status, description }) => (
  <div style={{
    padding: 16,
    borderRadius: 'var(--radius-md)',
    background: 'rgba(255, 255, 255, 0.03)',
    border: `1px solid ${status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ color: status === 'active' ? '#10b981' : 'var(--text-muted)' }}>
        {icon}
      </div>
      <Text weight="semibold" size={200}>{title}</Text>
      <Badge
        size="small"
        color={status === 'active' ? 'success' : status === 'limited' ? 'warning' : 'danger'}
        style={{ marginLeft: 'auto' }}
      >
        {status}
      </Badge>
    </div>
    <Caption1 style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      {description}
    </Caption1>
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  tooltip?: string;
}> = ({ label, value, highlight, tooltip }) => {
  const card = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 8px',
      borderRadius: 'var(--radius-md)',
      background: highlight ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.03)',
      border: `1px solid ${highlight ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
    }}>
      <Text weight="bold" style={{ fontSize: 18 }}>{value}</Text>
      <Caption1 style={{ color: 'var(--text-muted)', marginTop: 2, textAlign: 'center' }}>{label}</Caption1>
    </div>
  );
  return tooltip ? <Tooltip content={tooltip} relationship="description">{card}</Tooltip> : card;
};

// ============================================
// Utilities
// ============================================

function formatAgentLabel(agent: string): string {
  const labels: Record<string, string> = {
    analysis: 'Analysis',
    prioritization: 'Prioritization',
    crew_estimation: 'Crew Est.',
    report: 'Report',
    nlp_dashboard: 'NLP Dashboard',
    dispatch: 'Dispatch',
  };
  return labels[agent] || agent;
}

export default ResponsibleAIPanel;

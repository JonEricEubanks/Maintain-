/**
 * PipelineStreamPanel — Live SSE streaming viewer for A2A pipeline execution.
 *
 * Connects to /api/orchestrate/stream via EventSource and displays real-time
 * agent steps, handoffs, and pipeline completion with a rich animated timeline.
 * Includes an interactive Agent Flow visualization tab for pipeline topology.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Badge,
  Spinner,
  Select,
  Input,
  Tooltip,
} from '@fluentui/react-components';
import {
  Play24Regular,
  Stop24Regular,
  ArrowRight24Regular,
  Checkmark24Regular,
  ErrorCircle24Regular,
  Clock24Regular,
  Rocket24Regular,
  Brain24Regular,
  Diamond24Regular,
  Timer24Regular,
  DataBarVertical24Regular,
  TopSpeed24Regular,
  Warning24Regular,
  Organization24Regular,
  Timeline24Regular,
} from '@fluentui/react-icons';
import OverlayShell from './OverlayShell';

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

interface PipelineEvent {
  event: string;
  [key: string]: any;
}

interface StreamEvent {
  id: number;
  timestamp: Date;
  data: PipelineEvent;
}

type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'completed' | 'error';

const PIPELINES: Record<string, { label: string; description: string; icon: string }> = {
  full_assessment: { label: 'Full Assessment', description: 'Analysis → Prioritize → Crew → Dispatch', icon: '●●●●' },
  full_assessment_parallel: { label: 'Full Assessment (Parallel)', description: 'Analysis → Prioritize → [Crew ∥ RAG] → Dispatch', icon: '●●⫸●' },
  triage: { label: 'Quick Triage', description: 'Analysis → Prioritize (fast 2-step)', icon: '●●' },
  investigate: { label: 'Investigate', description: 'RAG → Analysis (knowledge-augmented)', icon: '●●' },
  feedback_loop: { label: 'Feedback Loop', description: 'Analysis → Prioritize → Analysis (bidirectional)', icon: '●●●' },
  dynamic_negotiation: { label: 'Dynamic Negotiation', description: 'AI-driven agent selection at runtime', icon: '◈' },
};

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

const agentColors: Record<string, string> = {
  analysis: '#0078d4',
  prioritization: '#107c10',
  crew_estimation: '#8661c5',
  dispatch: '#d83b01',
  rag: '#008272',
  report: '#ca5010',
  negotiator: '#b4009e',
};

function getAgentColor(agent: string): string {
  return agentColors[agent] || '#605e5c';
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getAgentInitial(agent: string): string {
  if (!agent) return '?';
  const parts = agent.split('_');
  return parts.map(p => p[0]?.toUpperCase()).join('').substring(0, 2);
}

/* ═══════════════════════════════════════
   Agent Flow Topology Data
   ═══════════════════════════════════════ */

interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  agent: string;
  description?: string;
  step?: number;
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'parallel';
  bidirectional?: boolean;
}

interface FlowTopology {
  nodes: FlowNode[];
  edges: FlowEdge[];
  title: string;
  subtitle: string;
}

const AGENT_DESCRIPTIONS: Record<string, string> = {
  analysis: 'Analyzes infrastructure data from MCP sources, identifies issues, assesses conditions.',
  prioritization: 'Ranks work orders by severity, impact & urgency using AI reasoning.',
  crew_estimation: 'Estimates crew requirements, equipment & resource allocation.',
  dispatch: 'Generates dispatch recommendations, assigns crews with scheduling.',
  report: 'Compiles executive summary of pipeline results.',
  rag: 'Retrieves knowledge from APWA/FHWA guidelines & repair manuals.',
  negotiator: 'AI-driven runtime agent selection & orchestration.',
};

function buildTopology(pipeline: string): FlowTopology {
  const cx = 300;
  switch (pipeline) {
    case 'full_assessment':
      return {
        title: 'Full Assessment Pipeline',
        subtitle: '5 agents — sequential chain',
        nodes: [
          { id: 'analysis', label: 'Analysis', x: cx, y: 52, agent: 'analysis', step: 1, description: AGENT_DESCRIPTIONS.analysis },
          { id: 'prioritization', label: 'Prioritize', x: cx, y: 142, agent: 'prioritization', step: 2, description: AGENT_DESCRIPTIONS.prioritization },
          { id: 'crew_estimation', label: 'Crew Est.', x: cx, y: 232, agent: 'crew_estimation', step: 3, description: AGENT_DESCRIPTIONS.crew_estimation },
          { id: 'dispatch', label: 'Dispatch', x: cx, y: 322, agent: 'dispatch', step: 4, description: AGENT_DESCRIPTIONS.dispatch },
          { id: 'report', label: 'Report', x: cx, y: 412, agent: 'report', step: 5, description: AGENT_DESCRIPTIONS.report },
        ],
        edges: [
          { from: 'analysis', to: 'prioritization', label: 'results' },
          { from: 'prioritization', to: 'crew_estimation', label: 'ranked orders' },
          { from: 'crew_estimation', to: 'dispatch', label: 'crew plan' },
          { from: 'dispatch', to: 'report', label: 'assignments' },
        ],
      };
    case 'full_assessment_parallel':
      return {
        title: 'Parallel Assessment Pipeline',
        subtitle: 'fork/join — Crew ∥ RAG run concurrently',
        nodes: [
          { id: 'analysis', label: 'Analysis', x: cx, y: 52, agent: 'analysis', step: 1, description: AGENT_DESCRIPTIONS.analysis },
          { id: 'prioritization', label: 'Prioritize', x: cx, y: 142, agent: 'prioritization', step: 2, description: AGENT_DESCRIPTIONS.prioritization },
          { id: 'crew_estimation', label: 'Crew Est.', x: cx - 115, y: 248, agent: 'crew_estimation', step: 3, description: AGENT_DESCRIPTIONS.crew_estimation },
          { id: 'rag', label: 'RAG Query', x: cx + 115, y: 248, agent: 'rag', step: 3, description: AGENT_DESCRIPTIONS.rag },
          { id: 'dispatch', label: 'Dispatch', x: cx, y: 352, agent: 'dispatch', step: 4, description: AGENT_DESCRIPTIONS.dispatch },
        ],
        edges: [
          { from: 'analysis', to: 'prioritization', label: 'results' },
          { from: 'prioritization', to: 'crew_estimation', label: 'fork', style: 'parallel' },
          { from: 'prioritization', to: 'rag', label: 'fork', style: 'parallel' },
          { from: 'crew_estimation', to: 'dispatch', label: 'join', style: 'parallel' },
          { from: 'rag', to: 'dispatch', label: 'join', style: 'parallel' },
        ],
      };
    case 'triage':
      return {
        title: 'Quick Triage Pipeline',
        subtitle: '2 agents — fast assessment',
        nodes: [
          { id: 'analysis', label: 'Analysis', x: cx, y: 72, agent: 'analysis', step: 1, description: AGENT_DESCRIPTIONS.analysis },
          { id: 'prioritization', label: 'Prioritize', x: cx, y: 200, agent: 'prioritization', step: 2, description: AGENT_DESCRIPTIONS.prioritization },
        ],
        edges: [
          { from: 'analysis', to: 'prioritization', label: 'raw issues' },
        ],
      };
    case 'investigate':
      return {
        title: 'Investigation Pipeline',
        subtitle: '2 agents — knowledge-augmented',
        nodes: [
          { id: 'rag', label: 'RAG Query', x: cx, y: 72, agent: 'rag', step: 1, description: AGENT_DESCRIPTIONS.rag },
          { id: 'analysis', label: 'Analysis', x: cx, y: 200, agent: 'analysis', step: 2, description: AGENT_DESCRIPTIONS.analysis },
        ],
        edges: [
          { from: 'rag', to: 'analysis', label: 'knowledge context' },
        ],
      };
    case 'feedback_loop':
      return {
        title: 'Feedback Loop Pipeline',
        subtitle: 'bidirectional A2A — re-analysis',
        nodes: [
          { id: 'analysis', label: 'Analysis', x: cx - 120, y: 72, agent: 'analysis', step: 1, description: AGENT_DESCRIPTIONS.analysis },
          { id: 'prioritization', label: 'Prioritize', x: cx + 120, y: 72, agent: 'prioritization', step: 2, description: AGENT_DESCRIPTIONS.prioritization },
          { id: 'reanalysis', label: 'Re-Analysis', x: cx, y: 230, agent: 'analysis', step: 3, description: 'Deep re-examination of critical items identified by prioritization.' },
        ],
        edges: [
          { from: 'analysis', to: 'prioritization', label: 'initial results' },
          { from: 'prioritization', to: 'reanalysis', label: 'critical items', style: 'dashed' },
          { from: 'reanalysis', to: 'analysis', label: 'feedback', style: 'dashed', bidirectional: true },
        ],
      };
    case 'dynamic_negotiation':
      return {
        title: 'Dynamic Negotiation',
        subtitle: 'AI decides agent sequence at runtime',
        nodes: [
          { id: 'negotiator', label: 'Negotiator', x: cx, y: 55, agent: 'negotiator', description: AGENT_DESCRIPTIONS.negotiator },
          { id: 'analysis', label: 'Analysis', x: 130, y: 175, agent: 'analysis', description: AGENT_DESCRIPTIONS.analysis },
          { id: 'rag', label: 'RAG', x: cx, y: 195, agent: 'rag', description: AGENT_DESCRIPTIONS.rag },
          { id: 'dispatch', label: 'Dispatch', x: 470, y: 175, agent: 'dispatch', description: AGENT_DESCRIPTIONS.dispatch },
          { id: 'prioritization', label: 'Prioritize', x: 195, y: 300, agent: 'prioritization', description: AGENT_DESCRIPTIONS.prioritization },
          { id: 'crew_estimation', label: 'Crew Est.', x: 405, y: 300, agent: 'crew_estimation', description: AGENT_DESCRIPTIONS.crew_estimation },
        ],
        edges: [
          { from: 'negotiator', to: 'analysis', style: 'dashed' },
          { from: 'negotiator', to: 'rag', style: 'dashed' },
          { from: 'negotiator', to: 'dispatch', style: 'dashed' },
          { from: 'negotiator', to: 'prioritization', style: 'dashed' },
          { from: 'negotiator', to: 'crew_estimation', style: 'dashed' },
        ],
      };
    default:
      return { title: 'Unknown', subtitle: '', nodes: [], edges: [] };
  }
}

/* ═══════════════════════════════════════
   Agent Flow Graph — Interactive Card-Based SVG
   ═══════════════════════════════════════ */

const CARD_W = 152;
const CARD_H = 56;
const CARD_R = 14;
const SVG_WIDTH = 600;
const SVG_HEIGHT_MAP: Record<string, number> = {
  full_assessment: 470,
  full_assessment_parallel: 410,
  triage: 280,
  investigate: 280,
  feedback_loop: 310,
  dynamic_negotiation: 370,
};

/** Get the connection port point on a card border facing the target node */
function getPort(node: FlowNode, target: FlowNode): { x: number; y: number } {
  const dx = target.x - node.x;
  const dy = target.y - node.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy > 0
      ? { x: node.x, y: node.y + CARD_H / 2 }
      : { x: node.x, y: node.y - CARD_H / 2 };
  }
  return dx > 0
    ? { x: node.x + CARD_W / 2, y: node.y }
    : { x: node.x - CARD_W / 2, y: node.y };
}

/** Build a smooth cubic bezier SVG path between two port points */
function buildCurve(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const isVertical = Math.abs(dy) >= Math.abs(dx);
  if (isVertical) {
    const cp = Math.abs(dy) * 0.42;
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + cp * Math.sign(dy)}, ${to.x} ${to.y - cp * Math.sign(dy)}, ${to.x} ${to.y}`;
  }
  const cp = Math.abs(dx) * 0.42;
  return `M ${from.x} ${from.y} C ${from.x + cp * Math.sign(dx)} ${from.y}, ${to.x - cp * Math.sign(dx)} ${to.y}, ${to.x} ${to.y}`;
}

const AgentFlowGraph: React.FC<{
  pipeline: string;
  completedAgents: string[];
  activeAgent: string | null;
}> = ({ pipeline, completedAgents, activeAgent }) => {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const topology = useMemo(() => buildTopology(pipeline), [pipeline]);
  const svgHeight = SVG_HEIGHT_MAP[pipeline] || 440;

  const nodeMap = useMemo(() => {
    const m: Record<string, FlowNode> = {};
    topology.nodes.forEach(n => { m[n.id] = n; });
    return m;
  }, [topology]);

  const detailNode = selectedNode ? nodeMap[selectedNode] : null;
  const halfW = CARD_W / 2;
  const halfH = CARD_H / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'auto' }}>
      {/* Title */}
      <div style={{ textAlign: 'center', padding: '10px 0 2px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>{topology.title}</div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 3 }}>{topology.subtitle}</div>
      </div>

      {/* SVG Canvas */}
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
        overflow: 'auto', minHeight: 0, borderRadius: 14,
        background: 'linear-gradient(180deg, rgba(0,120,212,0.012), rgba(99,102,241,0.008))',
        border: '1px solid rgba(0,0,0,0.04)', padding: '8px 0',
      }}>
        <svg viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`} width="100%" style={{ maxWidth: SVG_WIDTH, maxHeight: svgHeight + 20 }}>
          <defs>
            {/* Dot grid background */}
            <pattern id="flow-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="11" cy="11" r="0.7" fill="rgba(0,0,0,0.05)" />
            </pattern>

            {/* Card filters */}
            <filter id="card-shadow" x="-12%" y="-18%" width="124%" height="150%">
              <feDropShadow dx="0" dy="2" stdDeviation="5" floodColor="rgba(0,0,0,0.07)" />
            </filter>
            <filter id="card-shadow-hover" x="-16%" y="-22%" width="132%" height="160%">
              <feDropShadow dx="0" dy="4" stdDeviation="9" floodColor="rgba(0,0,0,0.12)" />
            </filter>

            {/* Per-agent glow filters */}
            {Object.entries(agentColors).map(([agent, color]) => (
              <filter key={`glow-${agent}`} id={`glow-${agent}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
                <feFlood floodColor={color} floodOpacity="0.25" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="glow" />
                <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            ))}

            {/* Per-edge gradient strokes */}
            {topology.edges.map((edge, i) => {
              const fn = nodeMap[edge.from];
              const tn = nodeMap[edge.to];
              if (!fn || !tn) return null;
              const fc = getAgentColor(fn.agent);
              const tc = getAgentColor(tn.agent);
              const vert = Math.abs(tn.y - fn.y) >= Math.abs(tn.x - fn.x);
              return (
                <linearGradient key={`eg-${i}`} id={`eg-${i}`}
                  x1={vert ? '0' : (fn.x < tn.x ? '0' : '1')} y1={vert ? '0' : '0'}
                  x2={vert ? '0' : (fn.x < tn.x ? '1' : '0')} y2={vert ? '1' : '0'}>
                  <stop offset="0%" stopColor={fc} stopOpacity="0.65" />
                  <stop offset="100%" stopColor={tc} stopOpacity="0.65" />
                </linearGradient>
              );
            })}

            {/* Arrow markers */}
            <marker id="arr" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 1 2 L 10 6 L 1 10 Z" fill="rgba(0,120,212,0.45)" />
            </marker>
            <marker id="arr-p" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 1 2 L 10 6 L 1 10 Z" fill="rgba(134,97,197,0.55)" />
            </marker>
            <marker id="arr-d" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 1 2 L 10 6 L 1 10 Z" fill="rgba(180,0,158,0.45)" />
            </marker>

            <style>{`
              @keyframes dash-march { to { stroke-dashoffset: -24; } }
              .edge-dash { animation: dash-march 0.8s linear infinite; }
              @keyframes card-pop { from { opacity: 0; transform: translateY(6px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
              .flow-card { animation: card-pop 0.35s cubic-bezier(.22,1,.36,1) both; }
            `}</style>
          </defs>

          {/* Background dots */}
          <rect width={SVG_WIDTH} height={svgHeight} fill="url(#flow-dots)" />

          {/* ── Edges ── */}
          {topology.edges.map((edge, i) => {
            const fn = nodeMap[edge.from];
            const tn = nodeMap[edge.to];
            if (!fn || !tn) return null;

            const fromPort = getPort(fn, tn);
            const toPort = getPort(tn, fn);
            const pathD = buildCurve(fromPort, toPort);
            const isP = edge.style === 'parallel';
            const isD = edge.style === 'dashed';
            const mid = { x: (fromPort.x + toPort.x) / 2, y: (fromPort.y + toPort.y) / 2 };

            return (
              <g key={`e-${i}`}>
                {/* Glow under-stroke */}
                <path d={pathD} fill="none" stroke={`url(#eg-${i})`}
                  strokeWidth={10} opacity={0.06} strokeLinecap="round" />

                {/* Main path */}
                <path d={pathD} fill="none" stroke={`url(#eg-${i})`}
                  strokeWidth={isP || isD ? 2 : 2.4}
                  strokeDasharray={isD ? '7,5' : isP ? '10,5' : 'none'}
                  strokeLinecap="round"
                  markerEnd={`url(#${isP ? 'arr-p' : isD ? 'arr-d' : 'arr'})`}
                  opacity={0.8}
                  className={isD ? 'edge-dash' : undefined} />

                {/* Animated particle #1 */}
                <circle r={3.5} fill={getAgentColor(fn.agent)} opacity={0}>
                  <animateMotion dur={isD ? '1.6s' : '2.2s'} repeatCount="indefinite" path={pathD} />
                  <animate attributeName="opacity" values="0;0.85;0.85;0" keyTimes="0;0.1;0.85;1"
                    dur={isD ? '1.6s' : '2.2s'} repeatCount="indefinite" />
                  <animate attributeName="r" values="2.5;4;2.5"
                    dur={isD ? '1.6s' : '2.2s'} repeatCount="indefinite" />
                </circle>
                {/* Animated particle #2 (offset) */}
                <circle r={2.5} fill={getAgentColor(tn.agent)} opacity={0}>
                  <animateMotion dur={isD ? '1.6s' : '2.2s'} repeatCount="indefinite" path={pathD} begin="1.1s" />
                  <animate attributeName="opacity" values="0;0.55;0.55;0" keyTimes="0;0.1;0.85;1"
                    dur={isD ? '1.6s' : '2.2s'} repeatCount="indefinite" begin="1.1s" />
                </circle>

                {/* Edge label pill */}
                {edge.label && (
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect x={-edge.label.length * 3.2 - 9} y={-10}
                      width={edge.label.length * 6.4 + 18} height={19}
                      rx={9.5} fill="white" stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                    <text textAnchor="middle" y={3.5} fontSize={9} fontWeight={600}
                      fill="var(--colorNeutralForeground3, #666)" opacity={0.9}>{edge.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Node Cards ── */}
          {topology.nodes.map((node, idx) => {
            const color = getAgentColor(node.agent);
            const isHov = hoveredNode === node.id;
            const isSel = selectedNode === node.id;
            const isDone = completedAgents.includes(node.agent) ||
              (node.id === 'reanalysis' && completedAgents.filter(a => a === 'analysis').length > 1);
            const isAct = activeAgent === node.agent;

            return (
              <g key={node.id} className="flow-card"
                style={{ animationDelay: `${idx * 0.07}s`, cursor: 'pointer' }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}>

                {/* Active pulse rects */}
                {isAct && (
                  <>
                    <rect x={node.x - halfW - 4} y={node.y - halfH - 4}
                      width={CARD_W + 8} height={CARD_H + 8} rx={CARD_R + 2}
                      fill="none" stroke={color} strokeWidth={2}>
                      <animate attributeName="opacity" values="0.45;0;0.45" dur="1.4s" repeatCount="indefinite" />
                    </rect>
                    <rect x={node.x - halfW - 9} y={node.y - halfH - 9}
                      width={CARD_W + 18} height={CARD_H + 18} rx={CARD_R + 5}
                      fill="none" stroke={color} strokeWidth={1.2}>
                      <animate attributeName="opacity" values="0.25;0;0.25" dur="1.4s" repeatCount="indefinite" begin="0.3s" />
                    </rect>
                  </>
                )}

                {/* Selection ring */}
                {isSel && (
                  <rect x={node.x - halfW - 3} y={node.y - halfH - 3}
                    width={CARD_W + 6} height={CARD_H + 6} rx={CARD_R + 2}
                    fill="none" stroke={color} strokeWidth={2} strokeDasharray="6,3" opacity={0.55} />
                )}

                {/* Card body */}
                <rect x={node.x - halfW} y={node.y - halfH}
                  width={CARD_W} height={CARD_H} rx={CARD_R}
                  fill="white"
                  stroke={isHov || isAct ? color : `${color}40`}
                  strokeWidth={isHov || isAct ? 1.8 : 1}
                  filter={isAct ? `url(#glow-${node.agent})` : isHov ? 'url(#card-shadow-hover)' : 'url(#card-shadow)'}
                  style={{ transition: 'all 0.15s ease' }} />

                {/* Left accent bar */}
                <rect x={node.x - halfW + 0.5} y={node.y - halfH + 4}
                  width={3.5} height={CARD_H - 8} rx={2}
                  fill={color} opacity={isDone ? 1 : 0.7} />

                {/* Completion tint overlay */}
                {isDone && (
                  <rect x={node.x - halfW} y={node.y - halfH}
                    width={CARD_W} height={CARD_H} rx={CARD_R}
                    fill={color} opacity={0.04} />
                )}

                {/* Agent initial circle */}
                <circle cx={node.x - halfW + 29} cy={node.y} r={17}
                  fill={`${color}10`} stroke={`${color}35`} strokeWidth={1.2} />
                <text x={node.x - halfW + 29} y={node.y + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={13} fontWeight={800} fill={color}>
                  {getAgentInitial(node.agent)}
                </text>

                {/* Agent name */}
                <text x={node.x - halfW + 54} y={node.y - 6}
                  fontSize={12} fontWeight={700}
                  fill="var(--colorNeutralForeground1, #242424)">
                  {node.label}
                </text>

                {/* Agent type subtitle */}
                <text x={node.x - halfW + 54} y={node.y + 11}
                  fontSize={9} fill="var(--colorNeutralForeground3, #888)" opacity={0.7}>
                  {node.agent.replace('_', ' ')}
                </text>

                {/* Step badge OR completed check */}
                {isDone ? (
                  <g>
                    <circle cx={node.x + halfW - 12} cy={node.y - halfH + 12} r={10} fill="#107c10" />
                    <text x={node.x + halfW - 12} y={node.y - halfH + 16}
                      textAnchor="middle" fontSize={11} fill="white" fontWeight="bold">✓</text>
                  </g>
                ) : node.step != null ? (
                  <g>
                    <circle cx={node.x + halfW - 12} cy={node.y - halfH + 12} r={10}
                      fill={color} opacity={0.85} />
                    <text x={node.x + halfW - 12} y={node.y - halfH + 16}
                      textAnchor="middle" fontSize={10} fontWeight={700} fill="white">
                      {node.step}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Detail Card */}
      {detailNode && (
        <div style={{
          padding: '12px 16px', borderRadius: 12,
          border: `1.5px solid ${getAgentColor(detailNode.agent)}30`,
          background: `linear-gradient(135deg, ${getAgentColor(detailNode.agent)}08, ${getAgentColor(detailNode.agent)}03)`,
          display: 'flex', alignItems: 'flex-start', gap: 12, flexShrink: 0,
          animation: 'fadeSlideIn 0.25s ease-out',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 19,
            background: `${getAgentColor(detailNode.agent)}15`,
            border: `2px solid ${getAgentColor(detailNode.agent)}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: getAgentColor(detailNode.agent), flexShrink: 0,
          }}>
            {getAgentInitial(detailNode.agent)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: getAgentColor(detailNode.agent) }}>
              {detailNode.label}
            </div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 3, lineHeight: 1.5 }}>
              {detailNode.description || 'No description available.'}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Badge appearance="tint" color="informative" size="small">Agent: {detailNode.agent}</Badge>
              {detailNode.step != null && <Badge appearance="outline" size="small">Step {detailNode.step}</Badge>}
              {completedAgents.includes(detailNode.agent) && <Badge appearance="filled" color="success" size="small">Completed</Badge>}
              {activeAgent === detailNode.agent && <Badge appearance="filled" color="warning" size="small">Active</Badge>}
            </div>
          </div>
          <button onClick={() => setSelectedNode(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.4, padding: '0 4px', lineHeight: 1 }}>
            ✕
          </button>
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 14, justifyContent: 'center', padding: '4px 0',
        flexWrap: 'wrap', flexShrink: 0,
      }}>
        {Object.entries(agentColors).map(([agent, color]) => (
          <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: color, opacity: 0.8 }} />
            <span style={{ fontSize: 10, opacity: 0.55, textTransform: 'capitalize' }}>
              {agent.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   Component
   ═══════════════════════════════════════ */

interface PipelineStreamPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

const PipelineStreamPanel: React.FC<PipelineStreamPanelProps> = ({ isVisible, onClose }) => {
  const [selectedPipeline, setSelectedPipeline] = useState('triage');
  const [query, setQuery] = useState('Analyze current infrastructure status');
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [metrics, setMetrics] = useState<Record<string, any> | null>(null);
  const [pipelineSummary, setPipelineSummary] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'timeline' | 'flow'>('timeline');
  const eventSourceRef = useRef<EventSource | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const eventIdRef = useRef(0);
  const autoScrollRef = useRef(true);

  // Auto-scroll the feed
  useEffect(() => {
    if (autoScrollRef.current && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const startStream = useCallback(() => {
    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setEvents([]);
    setMetrics(null);
    setPipelineSummary('');
    setStatus('connecting');
    eventIdRef.current = 0;
    autoScrollRef.current = true;

    // Dynamic negotiation uses a POST endpoint, so we use fetch instead of EventSource
    if (selectedPipeline === 'dynamic_negotiation') {
      setStatus('streaming');
      const startTime = Date.now();
      addEvent({ event: 'pipeline_start', pipeline: 'dynamic_negotiation', id: `negotiate-${Date.now()}` });

      fetch(`${AGENT_API_URL}/api/orchestrate/negotiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: query, temperature: 50.0, max_iterations: 5 }),
      })
        .then(res => res.json())
        .then(result => {
          // Emit steps from the result
          for (const step of result.steps || []) {
            addEvent({ event: 'step_complete', ...step });
          }
          for (const msg of result.messages || []) {
            addEvent({ event: 'handoff', ...msg });
          }
          // Emit negotiation-specific events
          for (const decision of result.negotiation_trace || []) {
            addEvent({ event: 'negotiation_decision', ...decision });
          }
          const elapsed = Date.now() - startTime;
          setMetrics(result.metrics || { total_latency_ms: elapsed });
          setPipelineSummary(result.summary || 'Dynamic negotiation complete');
          addEvent({
            event: 'pipeline_complete',
            success: result.success,
            metrics: result.metrics || {},
            summary: result.summary || '',
          });
          setStatus('completed');
        })
        .catch(err => {
          addEvent({ event: 'error', message: err.message });
          setStatus('error');
        });
      return;
    }

    // Standard SSE stream for predefined pipelines
    const params = new URLSearchParams({
      pipeline: selectedPipeline,
      query,
      weather: 'clear',
      temperature: '50',
    });

    const es = new EventSource(`${AGENT_API_URL}/api/orchestrate/stream?${params}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('streaming');
    };

    es.onmessage = (event) => {
      try {
        const data: PipelineEvent = JSON.parse(event.data);
        addEvent(data);

        if (data.event === 'pipeline_complete') {
          setMetrics(data.metrics || {});
          setPipelineSummary(data.summary || '');
          setStatus('completed');
          es.close();
        }

        if (data.event === 'error') {
          setStatus('error');
          es.close();
        }
      } catch {
        // Ignore unparseable events
      }
    };

    es.onerror = () => {
      if (status === 'streaming') {
        setStatus('error');
      }
      es.close();
    };
  }, [selectedPipeline, query, status]);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus('idle');
  }, []);

  function addEvent(data: PipelineEvent) {
    const entry: StreamEvent = {
      id: ++eventIdRef.current,
      timestamp: new Date(),
      data,
    };
    setEvents(prev => [...prev, entry]);
  }

  if (!isVisible) return null;

  const isRunning = status === 'streaming' || status === 'connecting';

  // Derive completed/active agents from events for flow graph
  const completedAgents = events
    .filter(e => e.data.event === 'step_complete' && e.data.agent)
    .map(e => e.data.agent as string);
  const activeAgent = isRunning
    ? events.filter(e => e.data.event === 'handoff' && e.data.to_agent).slice(-1)[0]?.data.to_agent || null
    : null;

  return (
    <OverlayShell title="Live Pipeline Stream" size="lg" onClose={onClose}
      headerExtra={
        <Badge
          appearance="filled"
          color={status === 'streaming' ? 'success' : status === 'completed' ? 'brand' : status === 'error' ? 'danger' : 'informative'}
          size="small"
          style={{ marginLeft: 8, letterSpacing: 0.3 }}
        >
          {status === 'idle' ? 'Ready' : status === 'connecting' ? 'Connecting...' : status === 'streaming' ? '● Live' : status === 'completed' ? 'Done' : 'Error'}
        </Badge>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12, padding: '0 4px', overflow: 'hidden' }}>
        {/* ── Controls ── */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap',
          padding: '14px 0 12px',
          borderBottom: '1px solid var(--glass-border)',
        }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}>Pipeline</label>
            <Select
              value={selectedPipeline}
              onChange={(_, d) => setSelectedPipeline(d.value)}
              disabled={isRunning}
              style={{ width: '100%' }}
            >
              {Object.entries(PIPELINES).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 2, minWidth: 250 }}>
            <label style={{ fontSize: 11, fontWeight: 600, opacity: 0.6, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}>Query / Goal</label>
            <Input
              value={query}
              onChange={(_, d) => setQuery(d.value)}
              disabled={isRunning}
              style={{ width: '100%' }}
              placeholder="What should the agents investigate?"
            />
          </div>
          <div style={{ display: 'flex', gap: 4, paddingBottom: 1 }}>
            {!isRunning ? (
              <Tooltip content="Start pipeline stream" relationship="label">
                <Button
                  appearance="primary"
                  icon={<Play24Regular />}
                  onClick={startStream}
                  style={{ background: 'linear-gradient(135deg, #0078d4, #106ebe)', minWidth: 100, fontWeight: 600 }}
                >
                  Stream
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Stop stream" relationship="label">
                <Button appearance="outline" icon={<Stop24Regular />} onClick={stopStream} style={{ minWidth: 100 }}>
                  Stop
                </Button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* ── Pipeline Description ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          borderRadius: 8,
          background: 'linear-gradient(135deg, rgba(0,120,212,0.06), rgba(99,102,241,0.04))',
          border: '1px solid rgba(0,120,212,0.1)',
        }}>
          <Rocket24Regular style={{ fontSize: 16, color: 'var(--colorBrandForeground1)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>{PIPELINES[selectedPipeline]?.description}</span>
          {selectedPipeline === 'dynamic_negotiation' && (
            <Badge appearance="tint" color="important" size="small" style={{ marginLeft: 4 }}>
              AI-Driven
            </Badge>
          )}
        </div>

        {/* ── Tab Bar ── */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '2px solid var(--glass-border, rgba(0,0,0,0.06))',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setActiveTab('timeline')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px',
              fontSize: 13, fontWeight: activeTab === 'timeline' ? 700 : 500,
              color: activeTab === 'timeline' ? 'var(--colorBrandForeground1, #0078d4)' : 'inherit',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'timeline' ? '2px solid var(--colorBrandForeground1, #0078d4)' : '2px solid transparent',
              marginBottom: -2,
              opacity: activeTab === 'timeline' ? 1 : 0.6,
              transition: 'all 0.2s ease',
            }}
          >
            <Timeline24Regular style={{ fontSize: 16 }} />
            Live Timeline
          </button>
          <button
            onClick={() => setActiveTab('flow')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px',
              fontSize: 13, fontWeight: activeTab === 'flow' ? 700 : 500,
              color: activeTab === 'flow' ? 'var(--colorBrandForeground1, #0078d4)' : 'inherit',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === 'flow' ? '2px solid var(--colorBrandForeground1, #0078d4)' : '2px solid transparent',
              marginBottom: -2,
              opacity: activeTab === 'flow' ? 1 : 0.6,
              transition: 'all 0.2s ease',
            }}
          >
            <Organization24Regular style={{ fontSize: 16 }} />
            Agent Flow
          </button>
        </div>

        {/* ── Tab Content ── */}
        {activeTab === 'flow' ? (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <AgentFlowGraph
              pipeline={selectedPipeline}
              completedAgents={completedAgents}
              activeAgent={activeAgent}
            />
          </div>
        ) : (
        <>
        {/* ── Event Feed (Timeline) ── */}
        <div
          ref={feedRef}
          onScroll={() => {
            if (feedRef.current) {
              const { scrollTop, scrollHeight, clientHeight } = feedRef.current;
              autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
            }
          }}
          style={{
            flex: 1,
            overflow: 'auto',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            padding: '16px 16px 16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            minHeight: 220,
            position: 'relative',
          }}
        >
          {/* Timeline vertical connector line */}
          {events.length > 0 && (
            <div style={{
              position: 'absolute',
              left: 30,
              top: 32,
              bottom: 32,
              width: 2,
              background: 'linear-gradient(180deg, var(--colorBrandForeground1), var(--colorNeutralStroke2))',
              opacity: 0.25,
              borderRadius: 1,
              zIndex: 0,
            }} />
          )}

          {events.length === 0 && status === 'idle' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: 12, padding: '40px 20px',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(0,120,212,0.1), rgba(99,102,241,0.08))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Brain24Regular style={{ fontSize: 28, color: 'var(--colorBrandForeground1)' }} />
              </div>
              <span style={{ fontSize: 13, opacity: 0.5, textAlign: 'center', maxWidth: 280 }}>
                Select a pipeline and click <strong>Stream</strong> to watch agents collaborate in real time
              </span>
            </div>
          )}

          {status === 'connecting' && events.length === 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '20px 12px',
              justifyContent: 'center',
            }}>
              <Spinner size="tiny" />
              <span style={{ fontSize: 13, opacity: 0.7 }}>Connecting to agent pipeline...</span>
            </div>
          )}

          {events.map((evt, idx) => (
            <EventCard key={evt.id} event={evt} isLast={idx === events.length - 1} />
          ))}
        </div>

        {/* ── Metrics Summary ── */}
        {status === 'completed' && metrics && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
            gap: 8,
            padding: '8px 0',
            flexShrink: 0,
          }}>
            <MetricCard label="Steps" value={metrics.completed ?? metrics.total_steps ?? '-'} icon={<Checkmark24Regular style={{ fontSize: 14 }} />} gradient="linear-gradient(135deg, rgba(16,124,16,0.08), rgba(16,124,16,0.02))" />
            <MetricCard label="Tokens" value={(metrics.total_tokens ?? 0).toLocaleString()} icon={<Diamond24Regular style={{ fontSize: 14 }} />} gradient="linear-gradient(135deg, rgba(0,120,212,0.08), rgba(0,120,212,0.02))" />
            <MetricCard label="Latency" value={formatMs(metrics.total_latency_ms ?? 0)} icon={<Timer24Regular style={{ fontSize: 14 }} />} gradient="linear-gradient(135deg, rgba(134,97,197,0.08), rgba(134,97,197,0.02))" />
            <MetricCard label="Models" value={Array.isArray(metrics.models_used) ? metrics.models_used.length : '-'} icon={<TopSpeed24Regular style={{ fontSize: 14 }} />} gradient="linear-gradient(135deg, rgba(202,80,16,0.08), rgba(202,80,16,0.02))" />
            {metrics.errors > 0 && (
              <MetricCard label="Errors" value={metrics.errors} icon={<Warning24Regular style={{ fontSize: 14 }} />} gradient="linear-gradient(135deg, rgba(209,52,56,0.08), rgba(209,52,56,0.02))" color="#d13438" />
            )}
          </div>
        )}

        {pipelineSummary && status === 'completed' && (
          <div style={{
            fontSize: 12, lineHeight: 1.5, padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(16,124,16,0.06), rgba(16,124,16,0.02))',
            borderRadius: 10,
            border: '1px solid rgba(16,124,16,0.15)',
            borderLeft: '3px solid #107c10',
            flexShrink: 0,
            marginBottom: 4,
            maxHeight: 180,
            overflow: 'auto',
          }}>
            <strong style={{ color: '#107c10' }}>Summary:</strong>{' '}
            <span style={{ opacity: 0.85 }}>{pipelineSummary}</span>
          </div>
        )}
        </>
        )}
      </div>
    </OverlayShell>
  );
};

/* ═══════════════════════════════════════
   Timeline Dot — used to anchor each event on the timeline
   ═══════════════════════════════════════ */

const TimelineDot: React.FC<{ color: string; pulse?: boolean }> = ({ color, pulse }) => (
  <div style={{
    position: 'absolute',
    left: -10,
    top: 14,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: color,
    border: '2px solid var(--glass-bg, #fff)',
    boxShadow: pulse ? `0 0 0 3px ${color}33` : 'none',
    zIndex: 2,
    flexShrink: 0,
  }} />
);

/* ═══════════════════════════════════════
   Agent Avatar Chip
   ═══════════════════════════════════════ */

const AgentChip: React.FC<{ agent: string; size?: number }> = ({ agent, size = 26 }) => {
  const color = getAgentColor(agent);
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: `${color}18`,
      border: `1.5px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color,
      flexShrink: 0,
    }}>
      {getAgentInitial(agent)}
    </div>
  );
};

/* ═══════════════════════════════════════
   Event Card
   ═══════════════════════════════════════ */

const EventCard: React.FC<{ event: StreamEvent; isLast: boolean }> = ({ event: { data, timestamp }, isLast }) => {
  const type = data.event;
  const time = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  /* ── Pipeline Start ── */
  if (type === 'pipeline_start') {
    return (
      <div style={{ ...timelineRow, marginBottom: 6 }}>
        <TimelineDot color="var(--colorBrandForeground1)" pulse />
        <div style={{
          ...eventBase,
          background: 'linear-gradient(135deg, rgba(0,120,212,0.08), rgba(99,102,241,0.05))',
          border: '1px solid rgba(0,120,212,0.15)',
          borderLeft: '3px solid var(--colorBrandForeground1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Rocket24Regular style={{ color: 'var(--colorBrandForeground1)', fontSize: 18 }} />
            <strong style={{ fontSize: 13, color: 'var(--colorBrandForeground1)' }}>Pipeline Started</strong>
            <Badge appearance="filled" color="brand" size="small">{data.pipeline}</Badge>
          </div>
          <span style={timeStamp}>{time}</span>
        </div>
      </div>
    );
  }

  /* ── Step Complete ── */
  if (type === 'step_complete') {
    const color = getAgentColor(data.agent);
    return (
      <div style={{ ...timelineRow, marginBottom: 4 }}>
        <TimelineDot color={color} />
        <div style={{
          ...eventBase,
          borderLeft: `3px solid ${color}`,
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <AgentChip agent={data.agent} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Checkmark24Regular style={{ color, fontSize: 15 }} />
                <strong style={{ fontSize: 13 }}>{data.agent}</strong>
                {data.model && (
                  <Badge appearance="outline" color="informative" size="small" style={{ fontSize: 10 }}>
                    {data.model_display || data.model}
                  </Badge>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {data.duration_ms != null && (
                  <span style={{ fontSize: 11, opacity: 0.65, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Clock24Regular style={{ fontSize: 12 }} /> {formatMs(data.duration_ms)}
                  </span>
                )}
                {data.tokens > 0 && (
                  <span style={{ fontSize: 11, opacity: 0.55, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Diamond24Regular style={{ fontSize: 11 }} /> {data.tokens.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>
          </div>
          <span style={timeStamp}>{time}</span>
        </div>
      </div>
    );
  }

  /* ── Handoff ── */
  if (type === 'handoff') {
    const fromColor = getAgentColor(data.from_agent);
    const toColor = getAgentColor(data.to_agent);
    return (
      <div style={{ ...timelineRow, marginBottom: 4 }}>
        <TimelineDot color="var(--colorNeutralStroke1)" />
        <div style={{
          ...eventBase,
          background: 'linear-gradient(135deg, rgba(0,120,212,0.04), rgba(99,102,241,0.02))',
          padding: '8px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AgentChip agent={data.from_agent} size={22} />
            <ArrowRight24Regular style={{ color: 'var(--colorBrandForeground1)', fontSize: 14, opacity: 0.7 }} />
            <AgentChip agent={data.to_agent} size={22} />
            <span style={{ fontSize: 12 }}>
              <strong style={{ color: fromColor }}>{data.from_agent}</strong>
              {' → '}
              <strong style={{ color: toColor }}>{data.to_agent}</strong>
            </span>
          </div>
          {data.content && (
            <div style={{ fontSize: 11, opacity: 0.6, marginLeft: 66, marginTop: 3, fontStyle: 'italic', lineHeight: 1.4 }}>
              {typeof data.content === 'string' ? data.content.substring(0, 150) : JSON.stringify(data.content).substring(0, 150)}
            </div>
          )}
          <span style={timeStamp}>{time}</span>
        </div>
      </div>
    );
  }

  /* ── Negotiation Decision ── */
  if (type === 'negotiation_decision') {
    return (
      <div style={{ ...timelineRow, marginBottom: 4 }}>
        <TimelineDot color="#b4009e" />
        <div style={{
          ...eventBase,
          borderLeft: '3px solid #b4009e',
          padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain24Regular style={{ color: '#b4009e', fontSize: 16 }} />
            <strong style={{ fontSize: 12, color: '#b4009e' }}>Negotiation</strong>
            <span style={{ fontSize: 12 }}>
              Iteration {data.iteration}: selected <strong>{data.selected_agent}</strong>
            </span>
          </div>
          {data.reasoning && (
            <div style={{ fontSize: 11, opacity: 0.6, marginLeft: 24, marginTop: 3, fontStyle: 'italic', lineHeight: 1.4 }}>
              "{data.reasoning}"
            </div>
          )}
          <span style={timeStamp}>{time}</span>
        </div>
      </div>
    );
  }

  /* ── Pipeline Complete ── */
  if (type === 'pipeline_complete') {
    const success = data.success !== false;
    const color = success ? '#107c10' : '#d13438';
    return (
      <div style={{ ...timelineRow, marginBottom: 4 }}>
        <TimelineDot color={color} pulse />
        <div style={{
          ...eventBase,
          background: success
            ? 'linear-gradient(135deg, rgba(16,124,16,0.08), rgba(16,124,16,0.03))'
            : 'linear-gradient(135deg, rgba(209,52,56,0.08), rgba(209,52,56,0.03))',
          borderLeft: `3px solid ${color}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {success ? (
              <Checkmark24Regular style={{ color, fontSize: 18 }} />
            ) : (
              <ErrorCircle24Regular style={{ color, fontSize: 18 }} />
            )}
            <strong style={{ fontSize: 13, color }}>Pipeline {success ? 'Complete' : 'Failed'}</strong>
          </div>
          <span style={timeStamp}>{time}</span>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (type === 'error') {
    return (
      <div style={{ ...timelineRow, marginBottom: 4 }}>
        <TimelineDot color="#d13438" />
        <div style={{
          ...eventBase,
          borderLeft: '3px solid #d13438',
          background: 'rgba(209,52,56,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ErrorCircle24Regular style={{ color: '#d13438', fontSize: 16 }} />
            <strong style={{ fontSize: 13, color: '#d13438' }}>Error</strong>
            <span style={{ fontSize: 12, opacity: 0.8 }}>{data.message}</span>
          </div>
          <span style={timeStamp}>{time}</span>
        </div>
      </div>
    );
  }

  /* ── Generic fallback ── */
  return (
    <div style={{ ...timelineRow, marginBottom: 4 }}>
      <TimelineDot color="var(--colorNeutralStroke1)" />
      <div style={eventBase}>
        <span style={{ fontSize: 12 }}>
          <Badge appearance="outline" size="small">{type}</Badge>
          {' '}{JSON.stringify(data).substring(0, 100)}
        </span>
        <span style={timeStamp}>{time}</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   Metric Card
   ═══════════════════════════════════════ */

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  gradient?: string;
}> = ({ label, value, icon, color, gradient }) => (
  <div style={{
    background: gradient || 'var(--glass-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 10,
    padding: '10px 12px',
    textAlign: 'center',
    transition: 'transform 0.15s ease',
  }}>
    <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: 18, fontWeight: 700, color: color || 'inherit', letterSpacing: -0.3 }}>{value}</div>
  </div>
);

/* ═══════════════════════════════════════
   Styles
   ═══════════════════════════════════════ */

const timelineRow: React.CSSProperties = {
  position: 'relative',
  marginLeft: 6,
  paddingLeft: 16,
  zIndex: 1,
};

const eventBase: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '9px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  animation: 'fadeSlideIn 0.3s ease-out',
  position: 'relative',
  backdropFilter: 'blur(4px)',
};

const timeStamp: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.35,
  position: 'absolute',
  top: 10,
  right: 12,
  fontFamily: 'var(--font-mono, monospace)',
  letterSpacing: 0.3,
};

export default PipelineStreamPanel;

/**
 * MAINTAIN AI — Model Router & RAG Knowledge Base Panel
 *
 * Surfaces the multi-model routing architecture and RAG pipeline for judges:
 * - Live model routing table with tier badges
 * - 5 Foundry models (GPT-4.1, GPT-4.1-mini, GPT-4o, Phi-4, Phi-4-reasoning)
 * - RAG knowledge base stats and interactive query
 * - Cost/latency comparison visualization
 *
 * Uses CSS classes from index.css with CSS variable tokens.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  Button,
  Spinner,
  Tooltip,
  Input,
} from '@fluentui/react-components';
import {
  Brain24Regular,
  ArrowSync24Regular,
  Flash24Regular,
  Rocket24Regular,
  Bot24Regular,
  LightbulbFilament24Regular,
  Library24Regular,
  Search24Regular,
  Send24Regular,
  ErrorCircle24Regular,
  DataBarVertical24Regular,
  BranchFork24Regular,
  Trophy24Regular,

  Money24Regular,

  Document24Regular,
  Shield24Regular,
  WeatherRainShowersDay24Regular,
  Wrench24Regular,
  ClipboardTask24Regular,
  CheckmarkCircle24Regular,
  Timer24Regular,
  Notepad24Regular,
  Comment24Regular,
  People24Regular,
  ChevronDown24Regular,
  ChevronRight24Regular,
} from '@fluentui/react-icons';
import OverlayShell from './OverlayShell';
import agentService from '../services/agentService';

// ============================================
// Types
// ============================================

interface ModelInfo {
  display_name: string;
  provider: string;
  tier: string;
  strengths: string[];
}

interface RouteInfo {
  model: string;
  display_name: string;
  tier: string;
  reason: string;
}

interface RouterStatus {
  enabled: boolean;
  endpoint: string;
  models: Record<string, ModelInfo>;
  routes: Record<string, RouteInfo>;
  total_models: number;
  total_routes: number;
}

interface RAGStatus {
  enabled: boolean;
  knowledge_base: {
    total_documents: number;
    categories: Record<string, number>;
    embedding_method: string;
    production_target: string;
  };
  retrieval: {
    method: string;
    default_top_k: number;
  };
  model_route: string;
}

interface RAGSource {
  doc_id: string;
  title: string;
  category: string;
  score: number;
}

interface RAGResponse {
  answer: string;
  sources: RAGSource[];
  model: string;
  model_display: string;
  tokens: number;
  latency_ms: number;
}

// ============================================
// Constants
// ============================================

const TIER_BADGES: Record<string, { color: 'brand' | 'success' | 'warning' | 'informative'; icon: React.ReactNode }> = {
  premier: { color: 'brand', icon: <Trophy24Regular style={{ fontSize: 16 }} /> },
  standard: { color: 'success', icon: <Flash24Regular style={{ fontSize: 16 }} /> },
  lightweight: { color: 'warning', icon: <Money24Regular style={{ fontSize: 16 }} /> },
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#74aa9c',
  microsoft: '#0078d4',
};

// ============================================
// Component
// ============================================

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

const ModelRouterPanel: React.FC<Props> = ({ isVisible, onClose }) => {
  const [routerStatus, setRouterStatus] = useState<RouterStatus | null>(null);
  const [ragStatus, setRAGStatus] = useState<RAGStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'router' | 'rag'>('router');
  
  // RAG query state
  const [ragQuery, setRagQuery] = useState('');
  const [ragResponse, setRagResponse] = useState<RAGResponse | null>(null);
  const [ragLoading, setRagLoading] = useState(false);

  // RAG error state
  const [ragError, setRagError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [router, rag] = await Promise.all([
        agentService.getModelRouterStatus(),
        agentService.getRAGStatus(),
      ]);
      if (router) setRouterStatus(router as unknown as RouterStatus);
      if (rag) setRAGStatus(rag as unknown as RAGStatus);
    } catch (e) {
      console.error('Failed to fetch model router status:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isVisible) fetchStatus();
  }, [isVisible, fetchStatus]);

  const handleRAGQuery = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagResponse(null);
    setRagError(null);
    try {
      const result = await agentService.queryRAG(ragQuery);
      if (result) {
        setRagResponse(result as unknown as RAGResponse);
      } else {
        setRagError('No response from RAG pipeline. The agent API may be unavailable.');
      }
    } catch (e) {
      console.error('RAG query failed:', e);
      setRagError(e instanceof Error ? e.message : 'RAG query failed unexpectedly.');
    }
    setRagLoading(false);
  };

  if (!isVisible) return null;

  return (
    <OverlayShell size="xl" onClose={onClose} className="model-router-shell">
      <div style={{ padding: '0 24px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingTop: 8 }}>
          <BranchFork24Regular style={{ fontSize: 28, color: 'var(--colorBrandForeground1)' }} />
          <div>
            <Title2 style={{ margin: 0 }}>Model Router & RAG Pipeline</Title2>
            <Caption1 style={{ opacity: 0.7 }}>Multi-Model AI Architecture — Azure AI Foundry</Caption1>
          </div>
        </div>
        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--colorNeutralStroke2)' }}>
          <button
            onClick={() => setActiveTab('router')}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'router' ? '2px solid var(--colorBrandForeground1)' : '2px solid transparent',
              color: activeTab === 'router' ? 'var(--colorBrandForeground1)' : 'var(--colorNeutralForeground2)',
              cursor: 'pointer',
              fontWeight: activeTab === 'router' ? 600 : 400,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <BranchFork24Regular /> Model Router
          </button>
          <button
            onClick={() => setActiveTab('rag')}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'rag' ? '2px solid var(--colorBrandForeground1)' : '2px solid transparent',
              color: activeTab === 'rag' ? 'var(--colorBrandForeground1)' : 'var(--colorNeutralForeground2)',
              cursor: 'pointer',
              fontWeight: activeTab === 'rag' ? 600 : 400,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Library24Regular /> RAG Knowledge Base
          </button>
          <div style={{ flex: 1 }} />
          <Button
            icon={<ArrowSync24Regular />}
            appearance="subtle"
            size="small"
            onClick={fetchStatus}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {loading && !routerStatus ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size="medium" label="Loading Model Router..." />
          </div>
        ) : activeTab === 'router' ? (
          <RouterTab status={routerStatus} />
        ) : (
          <RAGTab
            status={ragStatus}
            query={ragQuery}
            setQuery={setRagQuery}
            response={ragResponse}
            loading={ragLoading}
            error={ragError}
            onQuery={handleRAGQuery}
          />
        )}
      </div>
    </OverlayShell>
  );
};

// ============================================
// Model Router Tab
// ============================================

const TIER_COLORS: Record<string, string> = {
  premier: '#0078d4',
  standard: '#0e7a0d',
  lightweight: '#c19c00',
};

const RouterTab: React.FC<{ status: RouterStatus | null }> = ({ status }) => {
  const [showCatalog, setShowCatalog] = useState(false);
  const [showTable, setShowTable] = useState(false);

  if (!status) {
    return (
      <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
        <ErrorCircle24Regular />
        <Text block style={{ marginTop: 8 }}>
          Model Router not connected. Start the Python agent API to see live status.
        </Text>
      </div>
    );
  }

  return (
    <div>
      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard icon={<Brain24Regular />} label="Models" value={String(status.total_models)} />
        <StatCard icon={<BranchFork24Regular />} label="Routes" value={String(status.total_routes)} />
        <StatCard icon={<Flash24Regular />} label="SDK" value="azure-ai-inference" />
        <StatCard icon={<CheckmarkCircle24Regular />} label="Status" value={status.enabled ? 'Active' : 'Offline'} />
      </div>

      {/* Visual Architecture Diagram */}
      <div style={{ marginBottom: 24 }}>
        <Title3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Rocket24Regular /> Routing Architecture
        </Title3>
        <div style={{
          background: 'var(--colorNeutralBackground1)',
          borderRadius: 12,
          padding: 20,
          border: '1px solid var(--colorNeutralStroke2)',
        }}>
          {/* Flow Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20, fontSize: 13, fontWeight: 600, color: 'var(--colorNeutralForeground2)' }}>
            <span style={{ background: 'var(--colorNeutralBackground3)', padding: '6px 14px', borderRadius: 20, border: '1px solid var(--colorNeutralStroke2)' }}>Agent Request</span>
            <span style={{ color: 'var(--colorBrandForeground1)', fontSize: 18 }}>→</span>
            <span style={{ background: 'linear-gradient(135deg, rgba(0,120,212,0.1), rgba(0,120,212,0.05))', padding: '6px 14px', borderRadius: 20, border: '1px solid rgba(0,120,212,0.3)', color: 'var(--colorBrandForeground1)' }}>Model Router</span>
            <span style={{ color: 'var(--colorBrandForeground1)', fontSize: 18 }}>→</span>
            <span style={{ background: 'var(--colorNeutralBackground3)', padding: '6px 14px', borderRadius: 20, border: '1px solid var(--colorNeutralStroke2)' }}>Azure AI Foundry</span>
          </div>

          {/* Route Waterfall */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(status.routes).map(([agent, route]) => {
              const tierColor = TIER_COLORS[route.tier] || '#888';
              const maxLen = Math.max(...Object.values(status.routes).map(r => r.display_name.length));
              const barWidth = Math.max(25, (route.display_name.length / maxLen) * 100);
              return (
                <div key={agent} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Agent Name */}
                  <div style={{ width: 130, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                    {agent.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  {/* Arrow */}
                  <div style={{ width: 24, textAlign: 'center', color: tierColor, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>→</div>
                  {/* Model Bar */}
                  <div style={{ flex: 1, position: 'relative', height: 32, display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      width: `${barWidth}%`,
                      height: 28,
                      background: `linear-gradient(90deg, ${tierColor}22, ${tierColor}11)`,
                      borderLeft: `3px solid ${tierColor}`,
                      borderRadius: '0 6px 6px 0',
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 10,
                      gap: 8,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: tierColor }}>{route.model}</span>
                      <Badge color={TIER_BADGES[route.tier]?.color || 'informative'} size="small" style={{ fontSize: 10 }}>{route.tier}</Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Endpoint Info */}
          <div style={{ marginTop: 16, padding: '10px 16px', background: 'var(--colorNeutralBackground3)', borderRadius: 8, fontSize: 12, color: 'var(--colorNeutralForeground2)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span><strong>Endpoint:</strong> {status.endpoint || 'Not connected'}</span>
            <span><strong>SDK:</strong> azure-ai-inference (ChatCompletionsClient)</span>
            <span><strong>Models:</strong> {status.total_models}</span>
            <span><strong>Routes:</strong> {status.total_routes}</span>
          </div>
        </div>
      </div>

      {/* Model Catalog - Collapsible */}
      <CollapsibleSection
        title={`Foundry Model Catalog (${status.total_models} models)`}
        icon={<Brain24Regular />}
        isOpen={showCatalog}
        onToggle={() => setShowCatalog(p => !p)}
        subtitle={`${status.total_models} models from ${[...new Set(Object.values(status.models).map(m => m.provider))].length} providers`}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {Object.entries(status.models).map(([id, model]) => {
          const tier = TIER_BADGES[model.tier] || TIER_BADGES.standard;
          return (
            <div
              key={id}
              style={{
                background: 'var(--colorNeutralBackground3)',
                borderRadius: 10,
                padding: 16,
                border: '1px solid var(--colorNeutralStroke2)',
                borderLeft: `3px solid ${PROVIDER_COLORS[model.provider] || '#888'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{tier.icon}</span>
                <Text weight="semibold" style={{ flex: 1 }}>{model.display_name}</Text>
                <Badge color={tier.color} size="small">{model.tier}</Badge>
              </div>
              <Caption1 style={{ display: 'block', marginBottom: 6, opacity: 0.7 }}>
                Provider: {model.provider} • ID: {id}
              </Caption1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {model.strengths.slice(0, 4).map((s, i) => (
                  <Badge key={i} appearance="outline" size="small" color="informative">{s}</Badge>
                ))}
              </div>
            </div>
          );
        })}
        </div>
      </CollapsibleSection>

      {/* Routing Table - Collapsible */}
      <CollapsibleSection
        title="Routing Table"
        icon={<DataBarVertical24Regular />}
        isOpen={showTable}
        onToggle={() => setShowTable(p => !p)}
        subtitle={`${status.total_routes} agent → model mappings`}
      >
      <div style={{
        background: 'var(--colorNeutralBackground3)',
        borderRadius: 10,
        border: '1px solid var(--colorNeutralStroke2)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--colorNeutralBackground4)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Agent</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Model</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Tier</th>
              <th style={{ padding: '10px 16px', textAlign: 'left' }}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(status.routes).map(([agent, route]) => {
              const tier = TIER_BADGES[route.tier] || TIER_BADGES.standard;
              return (
                <tr key={agent} style={{ borderTop: '1px solid var(--colorNeutralStroke2)' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600 }}>{agent}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace' }}>{route.model}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <Badge color={tier.color} size="small">{tier.icon} {route.tier}</Badge>
                  </td>
                  <td style={{ padding: '10px 16px', opacity: 0.8, fontSize: 12 }}>{route.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </CollapsibleSection>
    </div>
  );
};

// ============================================
// RAG Knowledge Base Tab
// ============================================

interface RAGTabProps {
  status: RAGStatus | null;
  query: string;
  setQuery: (q: string) => void;
  response: RAGResponse | null;
  loading: boolean;
  error: string | null;
  onQuery: () => void;
}

const RAGTab: React.FC<RAGTabProps> = ({ status, query, setQuery, response, loading, error, onQuery }) => {
  const resultRef = useRef<HTMLDivElement>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showKB, setShowKB] = useState(false);

  useEffect(() => {
    if ((response || error) && !loading && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [response, error, loading]);

  const pipelineSteps = [
    { label: 'User Query', icon: <Search24Regular style={{ fontSize: 16 }} />, color: '#6366f1' },
    { label: 'Embed', icon: <Brain24Regular style={{ fontSize: 16 }} />, color: '#8b5cf6' },
    { label: 'Similarity Search', icon: <Library24Regular style={{ fontSize: 16 }} />, color: '#0078d4' },
    { label: `Top-${status?.retrieval?.default_top_k || 3}`, icon: <DataBarVertical24Regular style={{ fontSize: 16 }} />, color: '#0e7a0d' },
    { label: 'Augment', icon: <Document24Regular style={{ fontSize: 16 }} />, color: '#c19c00' },
    { label: 'Generate', icon: <Bot24Regular style={{ fontSize: 16 }} />, color: '#0078d4' },
  ];

  return (
    <div>
      {/* ───── Query Input (always visible at top) ───── */}
      <div style={{
        background: 'var(--colorNeutralBackground3)',
        borderRadius: 10,
        padding: 16,
        border: '1px solid var(--colorNeutralStroke2)',
        marginBottom: 16,
      }}>
        <Title3 style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Search24Regular /> Query Knowledge Base
        </Title3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <Input
            style={{ flex: 1 }}
            placeholder="Ask about repair standards, municipal codes, safety requirements..."
            value={query}
            onChange={(_, data) => setQuery(data.value)}
            onKeyDown={(e) => e.key === 'Enter' && onQuery()}
          />
          <Button
            icon={<Send24Regular />}
            appearance="primary"
            onClick={onQuery}
            disabled={loading || !query.trim()}
            style={{ color: '#ffffff' }}
          >
            {loading ? 'Querying...' : 'Ask RAG'}
          </Button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            'Pothole repair standards near schools',
            'ADA compliance requirements',
            'Weather impact on repairs',
            'Budget thresholds for procurement',
            'Crew deployment best practices',
          ].map((suggestion) => (
            <Button
              key={suggestion}
              size="small"
              appearance="subtle"
              onClick={() => { setQuery(suggestion); }}
              style={{ fontSize: 11 }}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>

      {/* ───── Status Banner ───── */}
      {loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(0,120,212,0.12), rgba(99,102,241,0.08))',
          borderRadius: 10, border: '1px solid rgba(0,120,212,0.3)',
        }}>
          <Spinner size="tiny" />
          <Text weight="semibold" style={{ color: 'var(--colorBrandForeground1)' }}>Querying RAG Knowledge Base...</Text>
          <Caption1 style={{ marginLeft: 'auto', opacity: 0.7 }}>Embedding → Retrieval → Generation</Caption1>
        </div>
      )}
      {error && !loading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16,
          background: 'linear-gradient(135deg, rgba(196,49,75,0.12), rgba(196,49,75,0.06))',
          borderRadius: 10, border: '1px solid rgba(196,49,75,0.3)',
        }}>
          <ErrorCircle24Regular style={{ color: '#c4314b' }} />
          <Text weight="semibold" style={{ color: '#c4314b' }}>Query Failed</Text>
          <Caption1 style={{ marginLeft: 8, opacity: 0.8 }}>{error}</Caption1>
        </div>
      )}

      {/* ───── RAG Answer (appears right after query) ───── */}
      <div ref={resultRef}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner size="medium" label="Retrieving knowledge & generating answer..." />
          </div>
        )}

        {response && !loading && (
          <div style={{ marginBottom: 16 }}>
            {/* Success header bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', marginBottom: 12,
              background: 'linear-gradient(135deg, rgba(14,122,13,0.12), rgba(14,122,13,0.06))',
              borderRadius: '10px 10px 0 0', border: '1px solid rgba(14,122,13,0.3)',
              borderBottom: 'none',
            }}>
              <LightbulbFilament24Regular style={{ color: '#0e7a0d' }} />
              <Text weight="semibold" style={{ color: '#0e7a0d' }}>RAG Answer</Text>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, opacity: 0.7 }}>
                <span><Bot24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />{response.model_display || response.model}</span>
                <span><DataBarVertical24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />{response.tokens} tokens</span>
                <span><Flash24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />{response.latency_ms?.toFixed(0)}ms</span>
                <span><Library24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} />{response.sources.length} sources</span>
              </div>
            </div>
            
            {/* Answer body */}
            <div style={{
              background: 'var(--colorNeutralBackground3)',
              borderRadius: '0 0 10px 10px',
              padding: 16,
              border: '1px solid var(--colorNeutralStroke2)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
              fontSize: 13,
              maxHeight: 360,
              overflowY: 'auto',
            }}>
              {response.answer}
            </div>

            {/* Sources */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {response.sources.map((src, i) => (
                <Tooltip key={i} content={`Relevance: ${(src.score * 100).toFixed(1)}%`} relationship="label">
                  <Badge appearance="outline" color="informative" size="medium">
                    <Document24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> {src.title.substring(0, 50)}... ({src.category})
                  </Badge>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ───── Collapsible: Pipeline Architecture ───── */}
      <CollapsibleSection
        title="RAG Pipeline Architecture"
        icon={<Library24Regular />}
        isOpen={showPipeline}
        onToggle={() => setShowPipeline(p => !p)}
        subtitle={`${pipelineSteps.length}-stage pipeline • ${status?.retrieval?.method || 'Cosine similarity'}`}
      >
        {/* Pipeline Flow */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
          {pipelineSteps.map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: step.color, fontWeight: 700, fontSize: 16, margin: '0 2px' }}>→</span>}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 20,
                background: `${step.color}11`,
                border: `1px solid ${step.color}33`,
                color: step.color,
                fontSize: 12, fontWeight: 600,
              }}>
                {step.icon}
                {step.label}
              </div>
            </React.Fragment>
          ))}
        </div>
        {/* Config grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div style={{ padding: '10px 14px', background: 'var(--colorNeutralBackground3)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Embedding</div>
            <div style={{ opacity: 0.7 }}>{status?.knowledge_base?.embedding_method || 'TF-IDF with domain boosting'}</div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--colorNeutralBackground3)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Retrieval</div>
            <div style={{ opacity: 0.7 }}>{status?.retrieval?.method || 'Cosine similarity'} (top-{status?.retrieval?.default_top_k || 3})</div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--colorNeutralBackground3)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Generation Model</div>
            <div style={{ opacity: 0.7 }}>{status?.model_route || 'gpt-4.1-mini'}</div>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--colorNeutralBackground3)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Production Target</div>
            <div style={{ opacity: 0.7 }}>{status?.knowledge_base?.production_target || 'Azure AI Search'}</div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ───── Collapsible: Knowledge Base Stats ───── */}
      {status && (
        <CollapsibleSection
          title="Knowledge Base Documents"
          icon={<DataBarVertical24Regular />}
          isOpen={showKB}
          onToggle={() => setShowKB(p => !p)}
          subtitle={`${status.knowledge_base.total_documents} documents across ${Object.keys(status.knowledge_base.categories).length} categories`}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <StatCard
              label="Total Documents"
              value={status.knowledge_base.total_documents.toString()}
              icon={<Library24Regular />}
            />
            {Object.entries(status.knowledge_base.categories).map(([cat, count]) => (
              <StatCard
                key={cat}
                label={cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                value={count.toString()}
                icon={getCategoryIcon(cat)}
              />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
};





// ============================================
// Helper Components
// ============================================

/** Collapsible section with chevron toggle, title, icon, and optional subtitle */
const CollapsibleSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ title, icon, isOpen, onToggle, subtitle, children }) => (
  <div style={{ marginBottom: 16 }}>
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '10px 14px',
        background: 'var(--colorNeutralBackground3)',
        border: '1px solid var(--colorNeutralStroke2)',
        borderRadius: isOpen ? '10px 10px 0 0' : 10,
        cursor: 'pointer', color: 'inherit', fontSize: 14, fontWeight: 600,
        transition: 'border-radius 0.2s',
      }}
    >
      {isOpen ? <ChevronDown24Regular style={{ fontSize: 16 }} /> : <ChevronRight24Regular style={{ fontSize: 16 }} />}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{icon} {title}</span>
      {subtitle && <Caption1 style={{ marginLeft: 'auto', opacity: 0.6 }}>{subtitle}</Caption1>}
    </button>
    {isOpen && (
      <div style={{
        padding: 16,
        background: 'var(--colorNeutralBackground1)',
        border: '1px solid var(--colorNeutralStroke2)',
        borderTop: 'none',
        borderRadius: '0 0 10px 10px',
      }}>
        {children}
      </div>
    )}
  </div>
);

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div style={{
    background: 'var(--colorNeutralBackground3)',
    borderRadius: 8,
    padding: 12,
    border: '1px solid var(--colorNeutralStroke2)',
    textAlign: 'center',
  }}>
    <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    <Caption1>{label}</Caption1>
  </div>
);

function getCategoryIcon(category: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    municipal_code: <Document24Regular style={{ fontSize: 16 }} />,
    repair_standards: <Wrench24Regular style={{ fontSize: 16 }} />,
    safety: <Shield24Regular style={{ fontSize: 16 }} />,
    weather: <WeatherRainShowersDay24Regular style={{ fontSize: 16 }} />,
    budget: <Money24Regular style={{ fontSize: 16 }} />,
    crew_management: <People24Regular style={{ fontSize: 16 }} />,
  };
  return icons[category] || <ClipboardTask24Regular style={{ fontSize: 16 }} />;
}

export default ModelRouterPanel;

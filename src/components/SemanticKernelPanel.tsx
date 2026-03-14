/**
 * MAINTAIN AI — Semantic Kernel Orchestrator Panel
 *
 * Theme-aware panel for judges that visualizes the SK architecture:
 * - Live kernel status with Azure OpenAI connection
 * - Plugin registry with function signatures
 * - Interactive "Invoke via SK" with real-time results + metadata
 * - Architecture diagram showing SK orchestration flow
 *
 * Uses CSS classes from index.css (sk-* prefix) with CSS variable tokens
 * so it automatically respects dark/light mode via data-theme attribute.
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
  Tooltip,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Brain24Regular,
  Play24Regular,
  CheckmarkCircle24Regular,
  ErrorCircle24Regular,
  Clock24Regular,
  PlugConnected24Regular,
  Flash24Regular,
  ArrowSync24Regular,
  Code24Regular,
  Shield24Regular,
  Beaker24Regular,
  DataBarVertical24Regular,
  PeopleTeam24Regular,
  VehicleTruckProfile24Regular,
  Document24Regular,
  Chat24Regular,
  BuildingFactory24Regular,
  LightbulbFilament24Regular,
  Rocket24Regular,
  Cloud24Regular,
  Link24Regular,
  Settings24Regular,
  ArrowDown24Filled,
  Globe24Regular,
  AppGeneric24Regular,
} from '@fluentui/react-icons';
import OverlayShell from './OverlayShell';

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

// ============================================
// Types
// ============================================

interface SKPlugin {
  name: string;
  functions: string[];
}

interface SKService {
  id: string;
  type: string;
  deployment: string;
}

interface SKStatus {
  enabled: boolean;
  version: string;
  deployment: string;
  endpoint: string;
  plugins: SKPlugin[];
  services: SKService[];
  plugin_count: number;
  function_count: number;
}

interface InvokeResult {
  [key: string]: unknown;
  sk_metadata?: {
    plugin: string;
    function: string;
    duration_ms: number;
    kernel_version: string;
    deployment: string;
  };
}

// ============================================
// Plugin metadata (Fluent icons, no emojis)
// ============================================

const PLUGIN_META: Record<string, {
  icon: React.ReactNode;
  description: string;
  color: string;
  demoArgs: Record<string, unknown>;
}> = {
  analysis: {
    icon: <Beaker24Regular />,
    description: 'Infrastructure analysis via MCP data + AI reasoning',
    color: '#0078D4',
    demoArgs: { query: 'Summarize current infrastructure status for Lake Forest, IL' },
  },
  prioritization: {
    icon: <DataBarVertical24Regular />,
    description: 'Multi-factor priority scoring (severity, school proximity, age)',
    color: '#E74856',
    demoArgs: { work_orders_json: '[]', temperature: 45 },
  },
  crew_estimation: {
    icon: <PeopleTeam24Regular />,
    description: 'Predictive crew allocation based on workload + weather',
    color: '#107C10',
    demoArgs: { work_orders_json: '[]', weather: 'clear', temperature: 50, days: 7, availability: 80 },
  },
  dispatch: {
    icon: <VehicleTruckProfile24Regular />,
    description: 'Optimized crew dispatch routing + assignment',
    color: '#FF8C00',
    demoArgs: { crews_json: '[]', weather: 'clear', temperature: 50 },
  },
  report: {
    icon: <Document24Regular />,
    description: 'AI-generated reports with matplotlib charts',
    color: '#8764B8',
    demoArgs: { report_type: 'executive', work_orders_json: '[]' },
  },
  nlp_dashboard: {
    icon: <Chat24Regular />,
    description: 'Natural language to data dashboard via Code Interpreter',
    color: '#00B7C3',
    demoArgs: { prompt: 'Show me severity breakdown', work_orders_json: '[]' },
  },
  content_safety: {
    icon: <Shield24Regular />,
    description: 'Azure Content Safety guardrails (Responsible AI)',
    color: '#498205',
    demoArgs: { text: 'Fix critical pothole near Deer Path Middle School' },
  },
};

const FALLBACK_PLUGIN = {
  icon: <PlugConnected24Regular />,
  description: 'Plugin',
  color: '#888',
  demoArgs: {},
};

// ============================================
// Component
// ============================================

interface Props {
  isVisible: boolean;
  onClose: () => void;
}

const SemanticKernelPanel: React.FC<Props> = ({ isVisible, onClose }) => {
  const [status, setStatus] = useState<SKStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [invoking, setInvoking] = useState<string | null>(null);
  const [invokeResult, setInvokeResult] = useState<InvokeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'plugins' | 'invoke'>('overview');

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${AGENT_API_URL}/api/sk/status`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isVisible) {
      fetchStatus();
    }
  }, [isVisible, fetchStatus]);

  const handleInvoke = async (pluginName: string) => {
    setInvoking(pluginName);
    setInvokeResult(null);
    try {
      const args = (PLUGIN_META[pluginName] || FALLBACK_PLUGIN).demoArgs;
      const resp = await fetch(`${AGENT_API_URL}/api/sk/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: pluginName, kwargs: args }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setInvokeResult(data);
      setActiveTab('invoke');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invoke failed');
    } finally {
      setInvoking(null);
    }
  };

  if (!isVisible) return null;

  const tabs: { key: 'overview' | 'plugins' | 'invoke'; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Architecture', icon: <BuildingFactory24Regular /> },
    { key: 'plugins', label: 'Plugins', icon: <PlugConnected24Regular /> },
    { key: 'invoke', label: 'Live Invoke', icon: <Flash24Regular /> },
  ];

  return (
    <OverlayShell size="xl" onClose={onClose} className="sk-shell">

        {/* Header */}
        <div className="sk-header">
          <div className="sk-header-left">
            <div className="sk-header-icon">
              <Brain24Regular />
            </div>
            <div>
              <Title2 className="sk-header-title">Semantic Kernel</Title2>
              <Caption1 className="sk-header-subtitle">
                Microsoft AI Orchestration Framework
              </Caption1>
            </div>
            {status?.enabled && (
              <Badge appearance="filled" color="success" style={{ marginLeft: 8 }}>
                Active
              </Badge>
            )}
          </div>
          <div className="sk-header-actions">
            <Button appearance="subtle" icon={<ArrowSync24Regular />} onClick={fetchStatus} />
            <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />
          </div>
        </div>

        {/* Tabs */}
        <div className="sk-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`sk-tab ${activeTab === tab.key ? 'sk-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="sk-content">

          {loading && (
            <div className="sk-loading">
              <Spinner label="Connecting to SK Kernel..." />
            </div>
          )}

          {error && !loading && (
            <div className="sk-error">
              <ErrorCircle24Regular />
              {error}
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && status && !loading && (
            <div className="sk-arch-section">

              {/* Architecture Diagram — Visual Flow */}
              <div className="sk-arch-card">
                <Title3 className="sk-arch-card-title">How SK Orchestrates Agents</Title3>
                <div className="sk-flow">
                  {/* Layer 1: React Frontend */}
                  <div className="sk-flow-node sk-flow-node--blue">
                    <div className="sk-flow-node-icon sk-flow-node-icon--blue">
                      <AppGeneric24Regular />
                    </div>
                    <div className="sk-flow-node-body">
                      <div className="sk-flow-node-title">React Frontend</div>
                      <div className="sk-flow-node-sub">Power Apps Code Component</div>
                      <div className="sk-flow-node-detail">
                        <Code24Regular style={{ fontSize: 14 }} />
                        <code>POST /api/sk/invoke</code>
                        <Badge appearance="tint" color="informative" size="small">REST</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Arrow 1 */}
                  <div className="sk-flow-arrow">
                    <div className="sk-flow-arrow-line" />
                    <ArrowDown24Filled className="sk-flow-arrow-icon" />
                    <Caption1 className="sk-flow-arrow-label">{'{ agent, kwargs }'}</Caption1>
                  </div>

                  {/* Layer 2: Semantic Kernel */}
                  <div className="sk-flow-node sk-flow-node--purple">
                    <div className="sk-flow-node-icon sk-flow-node-icon--purple">
                      <Brain24Regular />
                    </div>
                    <div className="sk-flow-node-body">
                      <div className="sk-flow-node-title">Semantic Kernel</div>
                      <div className="sk-flow-node-sub">sk_kernel.py &middot; v{status.version}</div>
                      <div className="sk-flow-node-chips">
                        <span className="sk-flow-chip sk-flow-chip--purple">
                          <PlugConnected24Regular style={{ fontSize: 14 }} />
                          8 Plugins
                        </span>
                        <span className="sk-flow-chip sk-flow-chip--purple">
                          <Code24Regular style={{ fontSize: 14 }} />
                          @kernel_function
                        </span>
                        <span className="sk-flow-chip sk-flow-chip--purple">
                          <ArrowSync24Regular style={{ fontSize: 14 }} />
                          Orchestrate
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Arrow 2: Split */}
                  <div className="sk-flow-arrow">
                    <div className="sk-flow-arrow-line" />
                    <ArrowDown24Filled className="sk-flow-arrow-icon" />
                    <Caption1 className="sk-flow-arrow-label">Route to plugin &rarr; execute</Caption1>
                  </div>

                  {/* Layer 3: Two services side by side */}
                  <div className="sk-flow-row">
                    <div className="sk-flow-node sk-flow-node--green sk-flow-node--half">
                      <div className="sk-flow-node-icon sk-flow-node-icon--green">
                        <Cloud24Regular />
                      </div>
                      <div className="sk-flow-node-body">
                        <div className="sk-flow-node-title">Azure OpenAI</div>
                        <div className="sk-flow-node-sub">{status.deployment}</div>
                        <div className="sk-flow-node-detail">
                          <Caption1>{status.endpoint?.split('.')[0]}</Caption1>
                        </div>
                      </div>
                    </div>

                    <div className="sk-flow-node sk-flow-node--orange sk-flow-node--half">
                      <div className="sk-flow-node-icon sk-flow-node-icon--orange">
                        <Globe24Regular />
                      </div>
                      <div className="sk-flow-node-body">
                        <div className="sk-flow-node-title">MCP Server</div>
                        <div className="sk-flow-node-sub">Lake Forest GIS Data</div>
                        <div className="sk-flow-node-detail">
                          <Caption1>10 read-only tools</Caption1>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Row */}
              <div className="sk-kpi-grid">
                {[
                  { label: 'SK Version', value: status.version, color: 'var(--accent-purple)' },
                  { label: 'Plugins', value: String(status.plugin_count), color: 'var(--accent-primary)' },
                  { label: 'Functions', value: String(status.function_count), color: 'var(--accent-success)' },
                  { label: 'Deployment', value: status.deployment, color: 'var(--accent-warning)' },
                ].map((kpi) => (
                  <div key={kpi.label} className="sk-kpi-card">
                    <div className="sk-kpi-label">{kpi.label}</div>
                    <div className="sk-kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Services */}
              <div className="sk-services-card">
                <div className="sk-services-title">
                  <PlugConnected24Regular />
                  Registered AI Services
                </div>
                {status.services.map((svc, i) => (
                  <div key={i} className="sk-service-row">
                    <div>
                      <Text className="sk-service-name">{svc.type}</Text>
                      <Caption1 className="sk-service-id">id: {svc.id}</Caption1>
                    </div>
                    <Badge appearance="tint" color="brand">{svc.deployment}</Badge>
                  </div>
                ))}
              </div>

              {/* Why SK */}
              <div className="sk-why-card">
                <div className="sk-why-title">
                  <LightbulbFilament24Regular />
                  Why Semantic Kernel?
                </div>
                <div className="sk-why-list">
                  <div><strong>Plugin Architecture</strong> — Each of our 7 agents is a typed SK plugin with <code>@kernel_function</code> decorators</div>
                  <div><strong>Unified Orchestration</strong> — SK Kernel routes requests, manages retries, and handles token limits</div>
                  <div><strong>Azure OpenAI Native</strong> — Direct <code>AzureChatCompletion</code> connector to <code>procert-ai-openai</code></div>
                  <div><strong>Planner-Ready</strong> — Architecture supports SK Planner for autonomous multi-step workflows</div>
                  <div><strong>Zero Cost Overhead</strong> — MIT-licensed SDK, same Azure OpenAI tokens, no extra resources</div>
                </div>
              </div>
            </div>
          )}

          {/* PLUGINS TAB */}
          {activeTab === 'plugins' && status && !loading && (
            <div className="sk-plugins-section">
              <Text className="sk-plugins-subtitle">
                {status.plugin_count} plugins · {status.function_count} kernel functions · Click invoke to run via SK
              </Text>
              {status.plugins.map((plugin) => {
                const meta = PLUGIN_META[plugin.name] || FALLBACK_PLUGIN;
                const isInvoking = invoking === plugin.name;
                return (
                  <div key={plugin.name} className="sk-plugin-card">
                    <div className="sk-plugin-head">
                      <div className="sk-plugin-info">
                        <div className="sk-plugin-icon" style={{ background: meta.color }}>
                          {meta.icon}
                        </div>
                        <div>
                          <Text className="sk-plugin-name">{plugin.name}</Text>
                          <Caption1 className="sk-plugin-desc">{meta.description}</Caption1>
                        </div>
                      </div>
                      <div className="sk-plugin-actions">
                        <Badge appearance="tint" color="informative" style={{ fontSize: 11 }}>
                          @kernel_function
                        </Badge>
                        <Tooltip content={`Invoke ${plugin.name} via SK Kernel`} relationship="label">
                          <Button
                            appearance="primary"
                            size="small"
                            icon={isInvoking ? <Spinner size="tiny" /> : <Play24Regular />}
                            disabled={isInvoking}
                            onClick={() => handleInvoke(plugin.name)}
                            style={{ background: meta.color, borderColor: meta.color, minWidth: 36 }}
                          />
                        </Tooltip>
                      </div>
                    </div>

                    <div className="sk-plugin-fns">
                      {plugin.functions.map((fn) => (
                        <div key={fn} className="sk-fn-badge">
                          <Code24Regular style={{ fontSize: 12 }} />
                          {fn}()
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* INVOKE RESULTS TAB */}
          {activeTab === 'invoke' && !loading && (
            <div className="sk-invoke-section">
              {!invokeResult && !invoking && (
                <div className="sk-invoke-empty">
                  <Rocket24Regular />
                  <div>Go to the Plugins tab and click invoke to run an agent through Semantic Kernel</div>
                </div>
              )}

              {invoking && (
                <div className="sk-loading">
                  <Spinner label={`Invoking ${invoking} via SK Kernel...`} />
                </div>
              )}

              {invokeResult && !invoking && (
                <>
                  {invokeResult.sk_metadata && (
                    <div className="sk-meta-card">
                      <div className="sk-meta-title">
                        <Brain24Regular />
                        SK Execution Metadata
                      </div>
                      <div className="sk-meta-grid">
                        {[
                          { label: 'Plugin', value: invokeResult.sk_metadata.plugin, icon: <PlugConnected24Regular /> },
                          { label: 'Function', value: invokeResult.sk_metadata.function, icon: <Settings24Regular />, mono: true },
                          { label: 'Duration', value: `${invokeResult.sk_metadata.duration_ms}ms`, icon: <Clock24Regular /> },
                          { label: 'Kernel', value: invokeResult.sk_metadata.kernel_version, icon: <Brain24Regular /> },
                          { label: 'Deployment', value: invokeResult.sk_metadata.deployment, icon: <Cloud24Regular /> },
                          { label: 'Status', value: invokeResult.error ? 'Error' : 'Success', icon: invokeResult.error ? <ErrorCircle24Regular /> : <CheckmarkCircle24Regular /> },
                        ].map((m) => (
                          <div key={m.label} className="sk-meta-item">
                            <div className="sk-meta-label">
                              {m.icon}
                              {m.label}
                            </div>
                            <div className={`sk-meta-value ${m.mono ? 'sk-meta-value--mono' : ''}`}>
                              {m.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="sk-payload-card">
                    <Text className="sk-payload-label">Response Payload</Text>
                    <pre className="sk-payload-pre">
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(invokeResult).filter(([k]) => k !== 'sk_metadata')
                        ),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sk-footer">
          <span className="sk-footer-text">
            Powered by Microsoft Semantic Kernel · {status?.version || 'loading...'}
          </span>
          <span className="sk-footer-text">
            {status?.endpoint && (
              <>
                <Link24Regular style={{ verticalAlign: 'middle', marginRight: 4, fontSize: 14 }} />
                {status.endpoint}
              </>
            )}
          </span>
        </div>
    </OverlayShell>
  );
};

export default SemanticKernelPanel;

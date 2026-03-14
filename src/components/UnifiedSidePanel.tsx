import React, { useState, useRef, useEffect } from 'react';
import {
  Text,
  Title2,
  Title3,
  Badge,
  Button,
  TabList,
  Tab,
  Tooltip,
  Divider,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Spinner,
} from '@fluentui/react-components';
import {
  Brain24Regular,
  People24Regular,
  Map24Regular,
  ChartMultiple24Regular,
  ArrowTrending24Regular,
  Info16Regular,
  ChevronDown24Regular,
  ChevronUp24Regular,
  Lightbulb24Regular,
  CheckmarkCircle24Regular,
  Warning24Regular,
  Info24Regular,
  Play24Regular,
  Dismiss24Regular,
  Chat24Regular,
  Send24Regular,
  VehicleTruckProfile24Regular,
  Eye24Regular,
  Shield24Regular,
  Sparkle24Regular,
  DataArea24Regular,
  Location24Regular,
  WeatherSnowflake24Regular,
} from '@fluentui/react-icons';

import {
  type Cluster,
  type MonteCarloResult,
  type RegressionResult,
  type ClassificationResult,
  type StaffPlacementRecommendation,
  type StaffZone,
  type PredictiveHotspot,
} from '../services/analyticsService';
import type { AIInsight, Crew, CrewEstimation, ReasoningStep, WorkOrder, MapCommand, AgentAction } from '../types/infrastructure';
import agentService, { ChatMessage, PipelineEvent, CardData } from '../services/agentService';
import AnalysisWizard from './AnalysisWizard';
import { askQuestionStreaming } from '../services/agentService';
import DispatchQueue from './DispatchQueue';
import FieldInspectionForm from './FieldInspectionForm';
import AIDecisionLog from './AIDecisionLog';

interface UnifiedSidePanelProps {
  insights: AIInsight[];
  crews: Crew[];
  estimation: CrewEstimation | null;
  workOrders: WorkOrder[];
  selectedWorkOrderIds?: string[];
  isLoading: boolean;
  onRefresh: () => void;
  onSimulate: (params: any) => Promise<any>;
  // New ML analysis callbacks
  onClustersUpdate?: (clusters: Cluster[], show: boolean) => void;
  onStaffZonesUpdate?: (zones: StaffZone[], show: boolean) => void;
  onHotspotsUpdate?: (hotspots: PredictiveHotspot[], show: boolean) => void;
  onZoomToLocation?: (lat: number, lng: number, zoom?: number) => void;
  // Agent-map integration callbacks
  onMapCommand?: (cmd: MapCommand) => void;
  onLayerToggle?: (layer: string, visible: boolean) => void;
  onShowDecayVisualizer?: () => void;
  mapState?: {
    visibleLayers: Record<string, boolean>;
    selectedWorkOrderId?: string | null;
    zoom?: number;
    center?: [number, number];
    filterPriority?: string;
    filterType?: string;
    showClusters?: boolean;
  };
  // Weather & connectivity for agent context
  weather?: { temperature: number; condition: string } | null;
  connectionStatus?: string;
  // Dispatch integration
  onDispatchCreated?: (dispatch: any) => void;
  onWorkOrderFocus?: (woId: string) => void;
  defaultTab?: string;
  // Crew management
  onManageCrews?: () => void;
  // AI Platform feature launchers
  onOpenTraces?: () => void;
  onOpenRAI?: () => void;
  onOpenSK?: () => void;
  onOpenModelRouter?: () => void;
  onOpenStream?: () => void;
}

/**
 * UnifiedSidePanel - Combined tabbed interface for AI, Crews, Scenarios, and Chat
 * Replaces separate AICompanionPanel, CrewDashboard, and ScenarioSimulator
 */
const UnifiedSidePanel: React.FC<UnifiedSidePanelProps> = ({
  insights,
  crews,
  estimation,
  workOrders,
  selectedWorkOrderIds,
  isLoading,
  onRefresh,
  onSimulate,
  onClustersUpdate,
  onStaffZonesUpdate,
  onHotspotsUpdate,
  onZoomToLocation,
  onMapCommand,
  onLayerToggle,
  onShowDecayVisualizer,
  mapState,
  weather,
  connectionStatus,
  onDispatchCreated,
  onWorkOrderFocus,
  defaultTab,
  onManageCrews,
  onOpenTraces,
  onOpenRAI,
  onOpenSK,
  onOpenModelRouter,
  onOpenStream,
}) => {
  const [activeTab, setActiveTab] = useState<string>(defaultTab || 'chat');
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hi! I'm your **AI Operations Assistant**. I can control the map, run analysis, and answer questions!\n\n**Map Commands:**\n• \"Show heatmap\" or \"Hide crews\"\n• \"Zoom to critical issues\"\n\n**Analysis:**\n• \"What are the trends?\"\n• \"Find anomalies\"\n\n**Questions:**\n• \"How many crews do I need?\"\n• \"What should be fixed first?\"\n\nSay **\"help\"** to see everything I can do!",
      timestamp: new Date()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [suggestedPromptsExpanded, setSuggestedPromptsExpanded] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  


  // ML Analytics state
  type AnalyticsResultType = {
    type: 'clustering' | 'forecast' | 'regression' | 'classification' | 'staffing';
    data: Cluster[] | MonteCarloResult | RegressionResult | ClassificationResult | StaffPlacementRecommendation | null;
    error?: string;
    timestamp: Date;
  } | null;
  const [analyticsResult, setAnalyticsResult] = useState<AnalyticsResultType>(null);

  // Reasoning chain expand/collapse state
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const [expandedInsightChains, setExpandedInsightChains] = useState<Set<string>>(new Set());

  // Live pipeline reasoning state
  const [liveSteps, setLiveSteps] = useState<PipelineEvent[]>([]);
  const [pipelineCollapsed, setPipelineCollapsed] = useState(false);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [fullOutputModels, setFullOutputModels] = useState<Set<string>>(new Set());

  // Crew stats
  const availableCrews = crews.filter(c => c.status === 'available').length;
  const assignedCrews = crews.filter(c => c.status === 'assigned').length;

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'priority': return <Warning24Regular style={{ color: 'var(--accent-danger)' }} />;
      case 'crew_estimate': return <CheckmarkCircle24Regular style={{ color: 'var(--accent-success)' }} />;
      case 'prediction': return <Lightbulb24Regular style={{ color: 'var(--accent-warning)' }} />;
      default: return <Info24Regular style={{ color: 'var(--accent-primary)' }} />;
    }
  };

  // Chat handlers
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
    // Auto-expand reasoning on the latest assistant message
    const lastMsg = chatMessages[chatMessages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.reasoning && lastMsg.reasoning.length > 0) {
      setExpandedReasoning(prev => new Set(prev).add(lastMsg.id));
    }
    // Re-scroll after content renders (cards, reasoning, long messages)
    const t1 = setTimeout(scrollToBottom, 150);
    const t2 = setTimeout(scrollToBottom, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [chatMessages]);

  // Proactive selection notification: when the user selects markers on the
  // map, inject a system notification into the chat so the agent knows
  const prevSelectedRef = useRef<string[]>([]);
  useEffect(() => {
    prevSelectedRef.current = selectedWorkOrderIds || [];
  }, [selectedWorkOrderIds]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: new Date()
    };
    
    setChatMessages(prev => [...prev, userMessage]);
    const questionText = chatInput.trim();
    setChatInput('');
    setIsChatLoading(true);
    setLiveSteps([]);
    setPipelineCollapsed(false);
    
    try {
      const response = await askQuestionStreaming(
        questionText,
        {
          workOrders,
          selectedWorkOrderIds,
          crewEstimation: estimation,
          weather: weather || null,
          connectionStatus: connectionStatus || 'unknown',
          mapState: mapState ? {
            visibleLayers: mapState.visibleLayers,
            selectedWorkOrderId: mapState.selectedWorkOrderId,
            zoom: mapState.zoom,
            center: mapState.center,
            filterPriority: mapState.filterPriority,
            filterType: mapState.filterType,
            showClusters: mapState.showClusters,
          } : undefined,
        },
        (event: PipelineEvent) => {
          setLiveSteps(prev => {
            // Update existing step for same agent or add new
            const idx = prev.findIndex(s => s.agent === event.agent && s.task === event.task);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = event;
              return next;
            }
            return [...prev, event];
          });
        }
      );
      setChatMessages(prev => [...prev, response]);
      
      // Execute map commands from agent response
      if (response.mapCommands && response.mapCommands.length > 0) {
        response.mapCommands.forEach(cmd => {
          if (cmd.type === 'toggle_layer' && cmd.payload) {
            const layer = cmd.payload.layer as string;
            const visible = cmd.payload.visible as boolean;
            onLayerToggle?.(layer, visible);
          } else if (cmd.type === 'zoom_to' && cmd.payload) {
            onZoomToLocation?.(
              cmd.payload.lat as number,
              cmd.payload.lng as number,
              cmd.payload.zoom as number
            );
          } else if (cmd.type === 'select_features' && cmd.payload) {
            onMapCommand?.(cmd);
          } else if (cmd.type === 'reset_view') {
            onMapCommand?.(cmd);
          } else if (cmd.type === 'show_clusters') {
            onMapCommand?.(cmd);
          } else if (cmd.type === 'hide_clusters') {
            onMapCommand?.(cmd);
          } else {
            onMapCommand?.(cmd);
          }
        });
      }
      
      // Handle tab navigation from actions
      if (response.actions) {
        const tabNav = response.actions.find(a => a.type === 'navigate_tab');
        if (tabNav && tabNav.data.tab) {
          setActiveTab(tabNav.data.tab as string);
        }
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: "I'm sorry, I encountered an error processing your question. Please try again.",
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
      setLiveSteps([]);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── SVG Icon Helper for Adaptive Cards ──
  const cardIcon = (key: string, size = 14) => {
    const icons: Record<string, JSX.Element> = {
      location: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>,
      severity: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/></svg>,
      cost: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" fill="currentColor"/></svg>,
      type: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" fill="currentColor"/></svg>,
      status: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg>,
      priority: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z" fill="currentColor"/></svg>,
      calendar: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" fill="currentColor"/></svg>,
      school: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" fill="currentColor"/></svg>,
      zone: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" fill="currentColor"/></svg>,
      crew: <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor"/></svg>,
    };
    return icons[key] || <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/></svg>;
  };

  const severityColor = (sev?: string) => {
    switch (sev) {
      case 'critical': return '#ef4444';
      case 'high': return '#f97316';
      case 'medium': return '#eab308';
      case 'low': return '#22c55e';
      default: return 'var(--text-secondary)';
    }
  };

  // ── Adaptive Card Renderer ──
  const renderCard = (card: CardData) => {
    if (card.type === 'work-order') {
      return (
        <div className="wo-card">
          <div className="wo-card-header">
            <div className="wo-card-severity-stripe" style={{ background: severityColor(card.severity) }} />
            <div className="wo-card-header-text">
              <div className="wo-card-title">{card.title}</div>
              {card.subtitle && <div className="wo-card-subtitle">{card.subtitle}</div>}
            </div>
            {card.severity && (
              <span className="wo-card-severity-badge" style={{ background: severityColor(card.severity) + '20', color: severityColor(card.severity) }}>
                {card.severity.toUpperCase()}
              </span>
            )}
          </div>
          {card.fields && card.fields.length > 0 && (
            <div className="wo-card-fields">
              {card.fields.map((f, i) => (
                <div key={i} className="wo-card-row">
                  <span className="wo-card-icon" style={{ color: 'var(--accent-primary)' }}>{cardIcon(f.icon)}</span>
                  <span className="wo-card-label">{f.label}</span>
                  <span className="wo-card-value">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          {card.recommendation && (
            <div className={`wo-card-recommendation level-${card.recommendation.level}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" fill="currentColor"/></svg>
              <span>{card.recommendation.text}</span>
            </div>
          )}
        </div>
      );
    }

    if (card.type === 'multi-select') {
      return (
        <div className="wo-card multi-card">
          <div className="wo-card-header">
            <div className="wo-card-header-text">
              <div className="wo-card-title">{card.title}</div>
              {card.subtitle && <div className="wo-card-subtitle">{card.subtitle}</div>}
            </div>
          </div>
          {card.stats && card.stats.length > 0 && (
            <div className="multi-card-stats">
              {card.stats.map((s, i) => (
                <div key={i} className="multi-card-stat">
                  <div className="multi-card-stat-dot" style={{ background: s.color || 'var(--accent-primary)' }} />
                  <span className="multi-card-stat-label">{s.label}</span>
                  <span className="multi-card-stat-value">{s.value}</span>
                </div>
              ))}
            </div>
          )}
          {card.fields && card.fields.length > 0 && (
            <div className="wo-card-fields">
              {card.fields.map((f, i) => (
                <div key={i} className="wo-card-row">
                  <span className="wo-card-icon" style={{ color: 'var(--accent-primary)' }}>{cardIcon(f.icon)}</span>
                  <span className="wo-card-label">{f.label}</span>
                  <span className="wo-card-value">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          {card.items && card.items.length > 0 && (
            <div className="multi-card-items">
              {card.items.map((item: any, i: number) => (
                <div key={i} className="multi-card-item">
                  <div className="multi-card-item-dot" style={{ background: severityColor(item.severity) }} />
                  <div className="multi-card-item-info">
                    <span className="multi-card-item-title">{item.title}</span>
                    <span className="multi-card-item-meta">{item.address} · {item.cost}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Notification or unknown type — just render fields if any
    return card.fields ? (
      <div className="wo-card">
        <div className="wo-card-header">
          <div className="wo-card-header-text">
            <div className="wo-card-title">{card.title}</div>
          </div>
        </div>
        <div className="wo-card-fields">
          {card.fields.map((f, i) => (
            <div key={i} className="wo-card-row">
              <span className="wo-card-icon" style={{ color: 'var(--accent-primary)' }}>{cardIcon(f.icon)}</span>
              <span className="wo-card-label">{f.label}</span>
              <span className="wo-card-value">{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null;
  };

  const suggestedQuestions = [
    "Show me critical issues",
    "Turn on heatmap",
    "How many crews do I need?",
    "What are the trends?",
    "What should be fixed first?",
    "Find anomalies",
    "Tell me about selected items",
    "Help"
  ];

  const handleSuggestedQuestion = (question: string) => {
    setChatInput(question);
    inputRef.current?.focus();
  };

  const handleClearChat = () => {
    setChatMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'm your **AI Operations Assistant**. I can control the map, run analysis, and answer questions!\n\n**Map Commands:**\n• \"Show heatmap\" or \"Hide crews\"\n• \"Zoom to critical issues\"\n\n**Analysis:**\n• \"What are the trends?\"\n• \"Find anomalies\"\n\n**Questions:**\n• \"How many crews do I need?\"\n• \"What should be fixed first?\"\n\nSay **\"help\"** to see everything I can do!",
        timestamp: new Date()
      }
    ]);
    setLiveSteps([]);
    setChatInput('');
    inputRef.current?.focus();
  };

  return (
    <aside
      className="unified-side-panel"
      role="complementary"
      aria-label="AI Assistant panel"
      style={{
        position: 'fixed',
        right: 12,
        top: 60,
        bottom: 12,
        width: 380,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-xl)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-xl)',
        backdropFilter: 'blur(var(--glass-blur))',
        zIndex: 1000,
      }}
    >
      {/* Tab Header */}
      <div style={{ 
        padding: '6px 12px 0',
        borderBottom: '1px solid var(--glass-border)',
        background: 'var(--bg-secondary)',
      }}>
        <TabList 
          selectedValue={activeTab} 
          onTabSelect={(_, data) => setActiveTab(data.value as string)}
          size="small"
          style={{ 
            gap: 0,
            padding: '0 4px',
          }}
        >
          <Tab value="chat" icon={<Chat24Regular />} className="side-tab">Chat</Tab>
          <Tab value="ai" icon={<Brain24Regular />} className="side-tab">Ops</Tab>
          <Tab value="platform" icon={<Sparkle24Regular />} className="side-tab">AI Platform</Tab>
        </TabList>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Chat Messages */}
            <div className="chat-scroll-area" style={{ 
              flex: 1, 
              overflowY: 'auto', 
              overflowX: 'hidden',
              padding: '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}
                    style={{
                      maxWidth: '88%',
                      padding: msg.role === 'user' ? '10px 14px' : '12px 16px',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: msg.role === 'user' 
                        ? 'var(--gradient-primary)' 
                        : 'var(--bg-tertiary)',
                      border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                      boxShadow: msg.role === 'user' 
                        ? 'var(--shadow-sm)' 
                        : 'none',
                      color: msg.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                    }}
                  >
                    <div className="chat-msg-body">
                      {(() => {
                        const lines = msg.content.split('\n');
                        const elements: React.ReactNode[] = [];
                        let sectionLines: string[] = [];
                        let sectionTitle: string | null = null;
                        let key = 0;

                        // Build a lookup of known zone names → coordinates
                        const zoneMap = new Map<string, { lat: number; lng: number }>();
                        if (analyticsResult?.type === 'clustering' && analyticsResult.data) {
                          (analyticsResult.data as Cluster[]).forEach((c, i) => {
                            zoneMap.set(`zone ${i + 1}`, { lat: c.centroid.lat, lng: c.centroid.lng });
                            zoneMap.set(`zone${i + 1}`, { lat: c.centroid.lat, lng: c.centroid.lng });
                            zoneMap.set(`cluster ${i + 1}`, { lat: c.centroid.lat, lng: c.centroid.lng });
                          });
                        }
                        if (analyticsResult?.type === 'staffing' && analyticsResult.data) {
                          const staff = analyticsResult.data as StaffPlacementRecommendation;
                          staff.zones.forEach((z, i) => {
                            zoneMap.set(z.name.toLowerCase(), { lat: z.center.lat, lng: z.center.lng });
                            zoneMap.set(`zone ${i + 1}`, { lat: z.center.lat, lng: z.center.lng });
                          });
                        }

                        // Render inline markdown (bold, italic) + clickable zone links
                        const renderInline = (text: string): React.ReactNode[] => {
                          // First split by bold markers
                          return text.split(/(\*\*.*?\*\*)/g).flatMap((part, j) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              const inner = part.slice(2, -2);
                              // Check if the bold text is a zone reference
                              const zoneCoord = zoneMap.get(inner.toLowerCase());
                              if (zoneCoord) {
                                return [<strong
                                  key={j}
                                  onClick={() => onZoomToLocation?.(zoneCoord.lat, zoneCoord.lng, 15)}
                                  className="chat-zone-link"
                                >{inner}</strong>];
                              }
                              return [<strong key={j}>{inner}</strong>];
                            }
                            // Split non-bold text by zone references (Zone 1, Zone 2, Cluster 3, etc.)
                            const zoneParts = part.split(/((?:Zone|Cluster|Area)\s*\d+)/gi);
                            return zoneParts.map((zp, k) => {
                              const zoneCoord = zoneMap.get(zp.toLowerCase().replace(/\s+/g, ' ').trim());
                              if (zoneCoord) {
                                return <span
                                  key={`${j}-${k}`}
                                  onClick={() => onZoomToLocation?.(zoneCoord.lat, zoneCoord.lng, 15)}
                                  className="chat-zone-link"
                                >{zp}</span>;
                              }
                              return <span key={`${j}-${k}`}>{zp}</span>;
                            });
                          });
                        };

                        // Is this a section header? (short line ending with : or bold line ending with :)
                        const isSectionHeader = (line: string) => {
                          const clean = line.replace(/\*\*/g, '').trim();
                          return clean.endsWith(':') && clean.length < 60 && !clean.startsWith('-') && !clean.startsWith('•');
                        };

                        // Is this a bullet? (- item, • item, * item)
                        const isBullet = (line: string) => /^\s*[-•*]\s/.test(line);

                        // Is this a numbered item?
                        const isNumbered = (line: string) => /^\s*\d+[\.\)]\s/.test(line);

                        // Is this an indented sub-line?
                        const isSubLine = (line: string) => /^\s{2,}\S/.test(line) && !isBullet(line) && !isNumbered(line);

                        // Flush accumulated section lines into a visual section
                        const flushSection = () => {
                          if (sectionLines.length === 0 && !sectionTitle) return;
                          if (sectionTitle || sectionLines.some(l => isBullet(l) || isNumbered(l))) {
                            elements.push(
                              <div key={key++} className="msg-section">
                                {sectionTitle && (
                                  <div className="msg-section-title">{renderInline(sectionTitle)}</div>
                                )}
                                {sectionLines.map((sl, si) => {
                                  if (isBullet(sl)) {
                                    const text = sl.replace(/^\s*[-•*]\s*/, '');
                                    return <div key={si} className="msg-bullet">{renderInline(text)}</div>;
                                  } else if (isNumbered(sl)) {
                                    const match = sl.match(/^\s*(\d+[\.\)])\s*(.*)/);
                                    return (
                                      <div key={si} className="msg-numbered">
                                        <span className="msg-num">{match?.[1]}</span>
                                        <span>{renderInline(match?.[2] || sl)}</span>
                                      </div>
                                    );
                                  } else if (isSubLine(sl)) {
                                    return <div key={si} className="msg-subline">{renderInline(sl.trim())}</div>;
                                  } else if (sl.trim() === '') {
                                    return <div key={si} style={{ height: 4 }} />;
                                  } else {
                                    return <div key={si} className="msg-text">{renderInline(sl)}</div>;
                                  }
                                })}
                              </div>
                            );
                          } else {
                            // Plain paragraph lines
                            sectionLines.forEach((sl, si) => {
                              if (sl.trim() === '') {
                                elements.push(<div key={key++} style={{ height: 4 }} />);
                              } else {
                                elements.push(<div key={key++} className="msg-text">{renderInline(sl)}</div>);
                              }
                            });
                          }
                          sectionLines = [];
                          sectionTitle = null;
                        };

                        for (let i = 0; i < lines.length; i++) {
                          const line = lines[i];

                          if (isSectionHeader(line)) {
                            // Flush previous section, start a new one
                            flushSection();
                            sectionTitle = line.replace(/\*\*/g, '').trim();
                          } else {
                            sectionLines.push(line);
                          }
                        }
                        flushSection(); // flush last section

                        return elements;
                      })()}
                    </div>
                  </div>
                  
                  {/* Adaptive Card (structured data) */}
                  {msg.card && msg.role === 'assistant' && (
                    <div style={{ maxWidth: '100%', width: '100%', marginTop: 6, overflow: 'visible' }}>
                      {renderCard(msg.card)}
                    </div>
                  )}
                  
                  {/* Inline Reasoning Chain */}
                  {msg.role === 'assistant' && msg.reasoning && msg.reasoning.length > 0 && (
                    <div className="reasoning-chain-v2">
                      <button
                        className="reasoning-toggle-v2"
                        onClick={() => {
                          setExpandedReasoning(prev => {
                            const next = new Set(prev);
                            if (next.has(msg.id)) next.delete(msg.id);
                            else next.add(msg.id);
                            return next;
                          });
                        }}
                      >
                        <span className={`toggle-icon-v2 ${expandedReasoning.has(msg.id) ? 'expanded' : ''}`}>▶</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="var(--accent-primary)"/></svg>
                        <span style={{ fontWeight: 600 }}>How I figured this out</span>
                        <span className="reasoning-step-count-badge">{msg.reasoning.length} steps</span>
                        {(() => {
                          const lastStep = msg.reasoning[msg.reasoning.length - 1];
                          const timeMatch = lastStep?.description?.match(/(\d+)ms/);
                          if (timeMatch) {
                            const ms = parseInt(timeMatch[1]);
                            return <span className="reasoning-time-badge">{ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}</span>;
                          }
                          return null;
                        })()}
                      </button>
                      
                      {expandedReasoning.has(msg.id) && (
                        <div className="reasoning-steps-v2">
                          {/* Friendly Summary */}
                          <div className="reasoning-summary-bar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" fill="currentColor"/></svg>
                            <span>Here&apos;s each step the AI took to answer your question:</span>
                          </div>
                          {msg.reasoning.map((step, i) => {
                            const confidence = step.confidence ?? 0;
                            const pct = Math.round(confidence * 100);
                            const confLabel = pct >= 95 ? 'Very sure' : pct >= 85 ? 'Sure' : pct >= 70 ? 'Fairly sure' : pct >= 50 ? 'Somewhat sure' : 'Uncertain';
                            const confColor = pct >= 90 ? 'var(--accent-success)' 
                              : pct >= 70 ? 'var(--accent-primary)' 
                              : pct >= 50 ? 'var(--accent-warning)' 
                              : 'var(--accent-danger)';
                            
                            return (
                              <div 
                                key={i} 
                                className="reasoning-step-v2"
                                style={{ animationDelay: `${i * 120}ms` }}
                              >
                                <div className="reasoning-step-timeline">
                                  <div className="reasoning-step-dot" style={{ background: confColor }} />
                                  {i < (msg.reasoning?.length ?? 0) - 1 && <div className="reasoning-step-line" />}
                                </div>
                                <div className="reasoning-step-body">
                                  {/* Plain English (friendly) */}
                                  {step.plainEnglish && (
                                    <div className="reasoning-step-plain">{step.plainEnglish}</div>
                                  )}
                                  {/* Technical detail (smaller) */}
                                  <div className="reasoning-step-detail">{step.description}</div>
                                  <div className="reasoning-step-meta-v2">
                                    {step.dataSource && (
                                      <span className="reasoning-source-pill">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6H4v12h16V6zm-2 10H6V8h12v8z" fill="currentColor"/></svg>
                                        {step.dataSource}
                                      </span>
                                    )}
                                    <span className="reasoning-conf-pill" style={{ color: confColor, borderColor: confColor }}>
                                      {confLabel} ({pct}%)
                                    </span>
                                    {step.durationMs != null && step.durationMs > 0 && (
                                      <span className="reasoning-time-pill">
                                        {step.durationMs < 1000 ? `${Math.round(step.durationMs)}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {/* Overall confidence summary */}
                          <div className="reasoning-overall-bar">
                            {(() => {
                              const avgConf = msg.reasoning.reduce((sum, s) => sum + (s.confidence ?? 0), 0) / msg.reasoning.length;
                              const avgPct = Math.round(avgConf * 100);
                              const overallLabel = avgPct >= 90 ? 'The AI is very confident in this answer' : avgPct >= 75 ? 'The AI is fairly confident in this answer' : avgPct >= 50 ? 'The AI has moderate confidence — take this as a suggestion' : 'The AI is less certain here — use your judgment';
                              return (
                                <>
                                  <div className="reasoning-overall-text">{overallLabel}</div>
                                  <div className="reasoning-overall-track">
                                    <div className="reasoning-overall-fill" style={{ width: `${avgPct}%` }} />
                                  </div>
                                  <div className="reasoning-overall-pct">{avgPct}% overall</div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Action Buttons from Agent */}
                  {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      marginTop: 6,
                    }}>
                      {msg.actions.filter(a => a.type !== 'navigate_tab').map((action, i) => (
                        <Button
                          key={i}
                          appearance="subtle"
                          size="small"
                          onClick={() => {
                            if (action.type === 'map_command') {
                              if (action.data.layer !== undefined) {
                                onLayerToggle?.(action.data.layer as string, action.data.visible as boolean);
                              } else if (action.data.lat !== undefined) {
                                onZoomToLocation?.(
                                  action.data.lat as number,
                                  action.data.lng as number,
                                  (action.data.zoom as number) || 16
                                );
                              } else if (action.data.ids) {
                                onMapCommand?.({
                                  type: 'select_features',
                                  payload: { ids: action.data.ids }
                                });
                              }
                            } else if (action.type === 'run_analysis') {
                              setActiveTab('analytics');
                            } else if (action.type === 'navigate_tab' && action.data.tab) {
                              setActiveTab(action.data.tab as string);
                            }
                          }}
                          style={{
                            fontSize: 11,
                            padding: '4px 10px',
                            background: 'var(--glass-bg)',
                            border: '1px solid var(--accent-primary)',
                            borderRadius: 12,
                            color: 'var(--accent-primary)',
                          }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  
                  <Text size={100} style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </div>
              ))}
              
              {/* Live Multi-Model Thinking Cards */}
              {isChatLoading && liveSteps.length > 0 && (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'flex-start', 
                  maxWidth: '92%',
                }}>
                  <div className="pipeline-card-v2">
                    {/* Friendly Header */}
                    <button
                      className="pipeline-header-v2"
                      onClick={() => setPipelineCollapsed(c => !c)}
                    >
                      <div className="pipeline-pulse-v2" />
                      <div className="pipeline-header-info">
                        <span className="pipeline-title-v2">Working on your answer...</span>
                        <span className="pipeline-subtitle-v2">
                          {(() => {
                            const completed = liveSteps.filter(s => s.status === 'complete').length;
                            const total = liveSteps.length;
                            const thinking = liveSteps.find(s => s.status === 'thinking');
                            if (thinking?.plainEnglish) return thinking.plainEnglish;
                            if (completed === total) return 'Almost done — preparing your answer!';
                            return `Step ${completed + 1} of ${total}`;
                          })()}
                        </span>
                      </div>
                      <span className="pipeline-progress-ring">
                        {liveSteps.filter(s => s.status === 'complete').length}/{liveSteps.length}
                      </span>
                      <span className={`pipeline-chevron-v2 ${pipelineCollapsed ? '' : 'open'}`}>▾</span>
                    </button>

                    {/* Progress Bar */}
                    <div className="pipeline-progress-bar">
                      <div className="pipeline-progress-fill" style={{ width: `${(liveSteps.filter(s => s.status === 'complete').length / Math.max(liveSteps.length, 1)) * 100}%` }} />
                    </div>

                    {/* Model Thinking Cards */}
                    {!pipelineCollapsed && (
                      <div className="model-cards-v2">
                        {liveSteps.map((step, i) => {
                          const cardKey = step.agent;
                          const showFull = fullOutputModels.has(cardKey);
                          const fullText = step.fullOutput || step.output || '';
                          const isLongOutput = fullText.length > 200;
                          const displayOutput = isLongOutput && !showFull ? fullText.slice(0, 200) + '...' : fullText;

                          return (
                            <div key={`${step.agent}-${step.task}`} className={`mc-v2 ${step.status}`} style={{ animationDelay: `${i * 80}ms` }}>
                              {/* Status indicator + friendly description */}
                              <div className="mc-v2-header">
                                <div className={`mc-v2-status-icon ${step.status}`}>
                                  {step.status === 'thinking' ? (
                                    <div className="mc-v2-spinner" />
                                  ) : step.status === 'complete' ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/></svg>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg>
                                  )}
                                </div>
                                <div className="mc-v2-info">
                                  {/* Friendly plain-English description (primary) */}
                                  <div className="mc-v2-plain">
                                    {step.plainEnglish || step.task}
                                  </div>
                                  {/* Technical label (secondary, smaller) */}
                                  <div className="mc-v2-technical">
                                    {step.agent}
                                    {step.role && <span className="mc-v2-role"> &middot; {step.role}</span>}
                                  </div>
                                </div>
                                {step.durationMs != null && step.durationMs > 0 && step.status === 'complete' && (
                                  <span className="mc-v2-time">{step.durationMs < 1000 ? `${Math.round(step.durationMs)}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}</span>
                                )}
                              </div>

                              {/* Expandable detail body */}
                              {step.status !== 'thinking' && fullText && expandedModels.has(cardKey) && (
                                <div className="mc-v2-body">
                                  <div className="mc-v2-output">{displayOutput}</div>
                                  {isLongOutput && (
                                    <button className="mc-v2-more" onClick={() => {
                                      setFullOutputModels(prev => {
                                        const next = new Set(prev);
                                        if (next.has(cardKey)) next.delete(cardKey); else next.add(cardKey);
                                        return next;
                                      });
                                    }}>
                                      {showFull ? 'Show less' : 'Show full output'}
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Show/hide detail toggle for completed steps */}
                              {step.status !== 'thinking' && fullText && (
                                <button className="mc-v2-detail-toggle" onClick={() => {
                                  setExpandedModels(prev => {
                                    const next = new Set(prev);
                                    if (next.has(cardKey)) next.delete(cardKey); else next.add(cardKey);
                                    return next;
                                  });
                                }}>
                                  {expandedModels.has(cardKey) ? 'Hide details' : 'Show details'}
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {/* Performance Summary */}
                        {liveSteps.filter(s => s.status === 'complete').length >= 2 && (
                          <div className="mc-v2-summary">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" fill="currentColor"/></svg>
                            <span>Total: {(() => {
                              const totalMs = liveSteps.reduce((sum, s) => sum + (s.durationMs || 0), 0);
                              return totalMs < 1000 ? `${Math.round(totalMs)}ms` : `${(totalMs / 1000).toFixed(1)}s`;
                            })()}</span>
                            <span className="mc-v2-sep">&middot;</span>
                            <span>{liveSteps.filter(s => s.status === 'complete').length} AI models used</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Minimal spinner if loading but no steps yet */}
              {isChatLoading && liveSteps.length === 0 && (
                <div className="pipeline-starting">
                  <div className="pipeline-pulse-v2" />
                  <div className="pipeline-starting-text">
                    <span className="pipeline-starting-title">Getting started...</span>
                    <span className="pipeline-starting-sub">The AI is preparing to analyze your question</span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>
            
            {/* Suggested Questions - Collapsible */}
            {chatMessages.length <= 10 && (
              <div style={{ 
                borderTop: '1px solid var(--glass-border)',
                background: 'var(--bg-secondary)',
              }}>
                <button
                  onClick={() => setSuggestedPromptsExpanded(!suggestedPromptsExpanded)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99, 102, 241, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span style={{ 
                    fontSize: 12, 
                    fontWeight: 600, 
                    color: 'var(--accent-primary)',
                    flex: 1,
                    textAlign: 'left',
                  }}>
                    Suggested Prompts
                  </span>
                  <span style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    transform: suggestedPromptsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                  }}>
                    ▼
                  </span>
                </button>
                
                {suggestedPromptsExpanded && (
                  <div style={{ 
                    padding: '0 16px 12px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}>
                    {suggestedQuestions.map((q, i) => (
                      <Button
                        key={i}
                        appearance="subtle"
                        size="small"
                        onClick={() => handleSuggestedQuestion(q)}
                        style={{ 
                          fontSize: 11, 
                          padding: '6px 10px',
                          background: 'var(--glass-bg)',
                          border: '1px solid var(--glass-border)',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99, 102, 241, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--glass-border)';
                          (e.currentTarget as HTMLButtonElement).style.background = 'var(--glass-bg)';
                        }}
                      >
                        {q}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {/* Chat Input */}
            <div style={{ 
              padding: 12,
              borderTop: '1px solid var(--glass-border)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask anything or control the map..."
                disabled={isChatLoading}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 20,
                  border: '1px solid var(--glass-border)',
                  background: 'rgba(10, 30, 50, 0.85)',
                  color: '#ffffff',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
              <Tooltip content="Clear chat" relationship="label">
                <Button
                  appearance="subtle"
                  icon={<Dismiss24Regular />}
                  onClick={handleClearChat}
                  disabled={isChatLoading}
                  style={{ borderRadius: 20, minWidth: 44, padding: '0 8px' }}
                  title="Clear chat and start new conversation"
                />
              </Tooltip>
              <Button
                appearance="primary"
                icon={<Send24Regular />}
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatLoading}
                style={{ borderRadius: 20, minWidth: 44 }}
              />
            </div>
          </div>
        )}

        {/* Ops Tab — Combined Insights + Crews */}
        {activeTab === 'ai' && (
          <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* ── Crew Summary Strip ── */}
            <div className="crew-stats">
              <div className="crew-stat green">
                <span className="crew-stat-num">{availableCrews}</span>
                <span className="crew-stat-label">Available</span>
              </div>
              <div className="crew-stat blue">
                <span className="crew-stat-num">{assignedCrews}</span>
                <span className="crew-stat-label">Assigned</span>
              </div>
              <div className="crew-stat purple">
                <span className="crew-stat-num">{crews.length}</span>
                <span className="crew-stat-label">Total</span>
              </div>
            </div>

            {/* ── AI Estimation Card ── */}
            {estimation && (
              <div className="crew-est-card">
                <div className="crew-est-header">
                  <div className="crew-est-icon"><Brain24Regular style={{ color: 'var(--accent-on-primary)', fontSize: 18 }} /></div>
                  <div className="crew-est-title-area">
                    <span className="crew-est-title">AI Crew Recommendation</span>
                    <span className="crew-est-conf">{Math.round(estimation.confidence * 100)}% confident</span>
                  </div>
                </div>

                {/* Type Breakdown */}
                <div className="crew-type-list">
                  {[
                    { key: 'pothole' as const, label: 'Pothole', letter: 'P', rec: estimation.potholeCrew, color: 'var(--accent-warning)' },
                    { key: 'sidewalk' as const, label: 'Sidewalk', letter: 'S', rec: estimation.sidewalkCrews, color: 'var(--accent-primary)' },
                    { key: 'concrete' as const, label: 'Concrete', letter: 'C', rec: estimation.concreteCrews, color: 'var(--accent-purple)' },
                  ].map(t => {
                    const have = crews.filter(c => c.specialization === t.key).length;
                    const pct = t.rec > 0 ? Math.min(100, Math.round((have / t.rec) * 100)) : 0;
                    return (
                      <div key={t.key} className="crew-type-row">
                        <span className="crew-type-letter" style={{ background: t.color + '22', color: t.color }}>{t.letter}</span>
                        <div className="crew-type-info">
                          <div className="crew-type-top">
                            <span className="crew-type-name">{t.label} Crews</span>
                            <span className="crew-type-nums">
                              <strong style={{ color: have >= t.rec ? 'var(--accent-success)' : 'var(--accent-warning)' }}>{have}</strong>
                              <span className="crew-type-sep">/</span>{t.rec}
                            </span>
                          </div>
                          <div className="crew-type-bar">
                            <div className="crew-type-bar-fill" style={{ width: `${pct}%`, background: t.color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                <div className="crew-est-total">
                  <span>Total Recommended</span>
                  <span className="crew-est-total-num">{estimation.totalCrews} Crews</span>
                </div>

                {/* Factors */}
                {estimation.factors.length > 0 && (
                  <div className="crew-factors">
                    <span className="crew-factors-label">Key Factors</span>
                    <div className="crew-factors-list">
                      {estimation.factors.map((f, i) => (
                        <Popover key={i}>
                          <PopoverTrigger>
                            <span className={`crew-factor-chip ${f.impact}`}>{f.name} ({f.impact === 'positive' ? '+' : f.impact === 'negative' ? '-' : '~'})</span>
                          </PopoverTrigger>
                          <PopoverSurface>
                            <Text size={200}>
                              <strong>{f.name}</strong> — Weight {Math.round(f.weight * 100)}%
                              <br />{f.impact === 'positive' ? 'Reduces crew need' : f.impact === 'negative' ? 'Increases crew need' : 'Neutral effect'}
                            </Text>
                          </PopoverSurface>
                        </Popover>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Active Crews List ── */}
            {crews.length > 0 && (
              <div className="crew-list-section">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="crew-list-heading">Active Crews</span>
                  {onManageCrews && (
                    <button
                      onClick={onManageCrews}
                      style={{
                        padding: '3px 10px', borderRadius: 6,
                        background: 'var(--accent-primary)',
                        border: 'none',
                        color: 'var(--accent-on-primary)',
                        fontSize: 10, fontWeight: 600,
                        cursor: 'pointer',
                        letterSpacing: '0.3px',
                      }}
                    >
                      Manage
                    </button>
                  )}
                </div>
                <div className="crew-list">
                  {crews.map((crew) => {
                    const eff = Math.round(crew.efficiencyRating * 100);
                    return (
                      <Popover key={crew.id}>
                        <PopoverTrigger>
                          <div className="crew-row">
                            <span className={`crew-row-dot ${crew.status}`} />
                            <span className="crew-row-name">{crew.name}</span>
                            <span className="crew-row-members">{crew.memberCount}p</span>
                            <span className="crew-row-eff">{eff}%</span>
                          </div>
                        </PopoverTrigger>
                        <PopoverSurface>
                          <div style={{ minWidth: 180 }}>
                            <Text weight="semibold" style={{ display: 'block', marginBottom: 6 }}>{crew.name}</Text>
                            <Text size={200} style={{ display: 'block' }}>Status: {crew.status}</Text>
                            <Text size={200} style={{ display: 'block' }}>Members: {crew.memberCount}</Text>
                            <Text size={200} style={{ display: 'block' }}>Efficiency: {eff}%</Text>
                            <Text size={200} style={{ display: 'block' }}>Type: {crew.specialization}</Text>
                          </div>
                        </PopoverSurface>
                      </Popover>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Divider ── */}
            <Divider style={{ margin: '4px 0' }} />

            {/* ── AI Insights ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: -4 }}>
              <Text size={200} weight="semibold" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 10 }}>
                AI Insights
              </Text>
              <Button appearance="subtle" size="small" onClick={onRefresh} disabled={isLoading} style={{ borderRadius: 8, fontSize: 11 }}>
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {insights.map((insight) => {
              const isOpen = expandedInsightId === insight.id;
              const confPct = Math.round(insight.confidence * 100);
              const confColor = confPct >= 85 ? 'var(--accent-success)' : confPct >= 65 ? 'var(--accent-warning)' : 'var(--accent-danger)';

              return (
              <div key={insight.id} className={`insight-card ${isOpen ? 'expanded' : ''}`}>
                <button className="insight-header" onClick={() => setExpandedInsightId(isOpen ? null : insight.id)}>
                  <div className="insight-icon">{getInsightIcon(insight.type)}</div>
                  <div className="insight-title-area">
                    <span className="insight-title">{insight.title}</span>
                    <div className="insight-meta-row">
                      <div className="insight-conf-bar">
                        <div className="insight-conf-fill" style={{ width: `${confPct}%`, background: confColor }} />
                      </div>
                      <span className="insight-conf-label" style={{ color: confColor }}>{confPct}%</span>
                      <span className={`insight-badge ${insight.isProactive ? 'proactive' : 'reactive'}`}>
                        {insight.isProactive ? 'Proactive' : 'Reactive'}
                      </span>
                    </div>
                  </div>
                  <span className={`insight-chevron ${isOpen ? 'open' : ''}`}>▾</span>
                </button>

                {isOpen && (
                  <div className="insight-body">
                    <div className="insight-section reco">
                      <div className="insight-section-label">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" fill="currentColor"/></svg>
                        Recommendation
                      </div>
                      <div className="insight-reco-text">
                        {(() => {
                          const text = insight.recommendation;
                          const lines = text.split(/(?=###\s|Step \d+:|- )/g);
                          if (lines.length <= 1) return <span>{text}</span>;
                          return lines.map((segment, si) => {
                            const trimmed = segment.trim();
                            if (!trimmed) return null;
                            if (trimmed.startsWith('### ')) return <div key={si} className="insight-reco-heading">{trimmed.replace('### ', '')}</div>;
                            if (trimmed.startsWith('Step ')) {
                              const colonIdx = trimmed.indexOf(':');
                              if (colonIdx > -1) return (
                                <div key={si} className="insight-reco-step">
                                  <span className="insight-reco-step-num">{trimmed.slice(0, colonIdx + 1)}</span>
                                  {trimmed.slice(colonIdx + 1).trim()}
                                </div>
                              );
                            }
                            if (trimmed.startsWith('- ')) return <div key={si} className="insight-reco-bullet">{trimmed.slice(2)}</div>;
                            return <div key={si} className="insight-reco-para">{trimmed}</div>;
                          });
                        })()}
                      </div>
                    </div>

                    <div className="insight-section insight-chain-section">
                      <div
                        className="insight-chain-toggle"
                        onClick={() => setExpandedInsightChains(prev => {
                          const next = new Set(prev);
                          next.has(insight.id) ? next.delete(insight.id) : next.add(insight.id);
                          return next;
                        })}
                      >
                        <span className={`insight-chain-arrow ${expandedInsightChains.has(insight.id) ? 'expanded' : ''}`}>&#9654;</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" fill="currentColor"/></svg>
                        AI Reasoning Chain
                        <span className="insight-chain-count">{insight.reasoning.length} steps</span>
                      </div>
                      {expandedInsightChains.has(insight.id) && (
                        <div className="insight-chain">
                          {insight.reasoning.map((step, i) => {
                            const stepConf = Math.round(step.confidence * 100);
                            return (
                              <div key={i} className="insight-chain-step">
                                <div className="insight-chain-num">{step.step}</div>
                                <div className="insight-chain-content">
                                  <div className="insight-chain-desc">{step.description}</div>
                                  {step.dataSource && <span className="insight-chain-source">{step.dataSource}</span>}
                                </div>
                                {stepConf > 0 && <span className="insight-chain-conf">{stepConf}%</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {insight.factors && insight.factors.length > 0 && (
                      <div className="insight-section">
                        <div className="insight-section-label">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" fill="currentColor"/></svg>
                          Contributing Factors
                        </div>
                        <div className="insight-factors">
                          {insight.factors.map((factor, i) => {
                            const pct = Math.round(factor.weight * 100);
                            return (
                              <Popover key={i}>
                                <PopoverTrigger>
                                  <div className="insight-factor">
                                    <div className="insight-factor-bar-track">
                                      <div className="insight-factor-bar-fill" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="insight-factor-name">{factor.name}</span>
                                    <span className="insight-factor-pct">{pct}%</span>
                                  </div>
                                </PopoverTrigger>
                                <PopoverSurface>
                                  <Text size={200}>{factor.description}</Text>
                                </PopoverSurface>
                              </Popover>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}

            {insights.length === 0 && crews.length === 0 && !estimation && (
              <div className="insight-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>
                <span>No data yet. Click Refresh to generate AI insights and crew recommendations.</span>
              </div>
            )}
          </div>
          </div>
        )}

        {/* Decay Tab — launches full-screen StoryMap */}

        {/* AI Platform Tab — Traces, Responsible AI, Semantic Kernel */}
        {activeTab === 'platform' && (
          <div style={{ padding: 16, overflow: 'auto', height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Text size={200} style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>
                Microsoft AI stack powering MAINTAIN AI
              </Text>

              {/* Model Router & RAG Card */}
              <button
                className="ai-action-card"
                onClick={onOpenModelRouter}
              >
                <div className="ai-action-icon" style={{ background: 'rgba(59,130,246,0.15)' }}>
                  <ChartMultiple24Regular style={{ color: '#3B82F6' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Model Router & RAG</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>5 Foundry models • Multi-tier routing • Knowledge base</div>
                </div>
                <Play24Regular style={{ color: 'var(--text-muted)', flexShrink: 0, width: 16, height: 16 }} />
              </button>

              {/* Semantic Kernel Card */}
              <button
                className="ai-action-card"
                onClick={onOpenSK}
              >
                <div className="ai-action-icon" style={{ background: 'rgba(138,43,226,0.15)' }}>
                  <Brain24Regular style={{ color: '#B388FF' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Semantic Kernel + Planner</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>8 agent plugins • Autonomous SK Planner • Live invoke</div>
                </div>
                <Play24Regular style={{ color: 'var(--text-muted)', flexShrink: 0, width: 16, height: 16 }} />
              </button>

              {/* A2A Agent Orchestrator Card */}
              <button
                className="ai-action-card"
                onClick={onOpenStream}
              >
                <div className="ai-action-icon" style={{ background: 'rgba(245,158,11,0.15)' }}>
                  <Play24Regular style={{ color: '#F59E0B' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>A2A Agent Orchestrator</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>7 pipelines • Parallel execution • Feedback loops • Dynamic negotiation • SSE streaming</div>
                </div>
                <Play24Regular style={{ color: 'var(--text-muted)', flexShrink: 0, width: 16, height: 16 }} />
              </button>

              {/* Agent Traces Card */}
              <button
                className="ai-action-card"
                onClick={onOpenTraces}
              >
                <div className="ai-action-icon" style={{ background: 'rgba(6,182,212,0.15)' }}>
                  <Eye24Regular style={{ color: '#06B6D4' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Agent Traces</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>OpenTelemetry • Distributed tracing • App Insights</div>
                </div>
                <Play24Regular style={{ color: 'var(--text-muted)', flexShrink: 0, width: 16, height: 16 }} />
              </button>

              {/* Responsible AI Card */}
              <button
                className="ai-action-card"
                onClick={onOpenRAI}
              >
                <div className="ai-action-icon" style={{ background: 'rgba(139,92,246,0.15)' }}>
                  <Shield24Regular style={{ color: '#8B5CF6' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Responsible AI</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Content Safety • 4-category screening • Governance</div>
                </div>
                <Play24Regular style={{ color: 'var(--text-muted)', flexShrink: 0, width: 16, height: 16 }} />
              </button>

              {/* Info note */}
              <div style={{
                marginTop: 8, padding: '10px 14px', borderRadius: 10,
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)',
                fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
              }}>
                <strong style={{ color: 'var(--text-primary)' }}>Microsoft AI Stack:</strong>{' '}
                Azure AI Foundry (5 models) + Model Router + RAG Pipeline + Semantic Kernel + SK Planner + A2A Orchestrator + Parallel Execution + Activity Protocol + Content Safety + OpenTelemetry + MCP + Power Apps + Dataverse
              </div>
            </div>
          </div>
        )}

      </div>
    </aside>
  );
};

export default UnifiedSidePanel;

import React, { useState } from 'react';
import {
  Title3,
  Text,
  Button,
  TabList,
  Tab,
  Badge,
} from '@fluentui/react-components';
import {
  Book24Regular,
  Keyboard24Regular,
  Question24Regular,
  Lightbulb24Regular,
  Video24Regular,
  Map24Regular,
  Brain24Regular,
  People24Regular,
  ChartMultiple24Regular,
  Play24Regular,
  Eye24Regular,
  ShieldCheckmark24Regular,
} from '@fluentui/react-icons';
import OverlayShell from './OverlayShell';

interface HelpPanelProps {
  onClose: () => void;
  onRestartTour: () => void;
  onOpenTraces?: () => void;
  onOpenRAI?: () => void;
  onOpenSK?: () => void;
}

interface KeyboardShortcut {
  keys: string[];
  description: string;
}

interface FAQSection {
  label: string;
  items: string[];
  color?: string;
}

interface FAQ {
  question: string;
  answer?: string;
  sections?: FAQSection[];
}

const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { keys: ['C'], description: 'Jump to critical issues' },
  { keys: ['R'], description: 'View crew status' },
  { keys: ['F5'], description: 'Refresh all data' },
  { keys: ['?'], description: 'Open help panel' },
  { keys: ['Esc'], description: 'Close panels/modals' },
  { keys: ['←', '→'], description: 'Navigate between insights' },
  { keys: ['Enter'], description: 'Select highlighted item' },
];

const FAQS: FAQ[] = [
  {
    question: 'What data does this app use?',
    sections: [
      {
        label: 'Live Data Retrieval (Read-Only)',
        items: [
          'MCPGIS (Multi-Community Public Geographic Information System)',
          'Work orders & assignment status (view only)',
          'Crew locations in real-time (monitoring only)',
          'Weather data & forecasts (automatic updates)',
          'Infrastructure inventory (current state)',
        ],
        color: '#0078D4',
      },
      {
        label: 'Auto-Refresh & Monitoring',
        items: [
          'Real-time synchronization with live systems (no editing)',
          'Automatic refresh every 30 seconds',
          'AI continuously analyzes incoming data',
          'Predictions update as conditions change',
          'Manual refresh available anytime',
        ],
        color: '#50E6FF',
      },
    ],
  },
  {
    question: 'How does the AI prioritize work orders?',
    sections: [
      {
        label: 'Dynamic Priority Factors',
        items: [
          'Severity Level (30%) — Critical damage takes precedence',
          'Proximity to Schools (35%) — Safety first for vulnerable areas',
          'Traffic Impact (20%) — Congestion & public safety',
          'Issue Age (15%) — Older problems get attention',
        ],
        color: '#FF7F50',
      },
      {
        label: 'Smart Adjustments',
        items: [
          '0-100 priority score (recalculated continuously)',
          'Score updates in real-time as new data arrives',
          'Weather changes automatically trigger re-prioritization',
          'AI shifts focus as conditions evolve',
          'Most urgent issues float to top automatically',
        ],
        color: '#FFB90F',
      },
    ],
  },
  {
    question: 'How accurate are the predictions?',
    sections: [
      {
        label: 'Confidence-Based Reliability',
        items: [
          '85%+ confidence → 90% historically accurate',
          'Lower confidence = AI requesting more data',
          'Each prediction shows confidence percentage',
          'Confidence increases as new conditions are observed',
        ],
        color: '#06B6D4',
      },
      {
        label: 'Continuous Learning & Adjustment',
        items: [
          'AI learns from real-time data feed',
          'Predictions refine automatically with each update',
          'Incorrect predictions trigger re-analysis',
          'Reasoning chain shows how AI adapted its conclusion',
          'Combine AI insights with your expertise for best results',
        ],
        color: '#10B981',
      },
    ],
  },
  {
    question: 'Can I dispatch crews from this app?',
    sections: [
      {
        label: 'Demo Feature',
        items: [
          'Crew dispatch interface is currently a demonstration',
          'Shows AI-recommended crew allocation',
          'Click to see optimal assignment options',
          'Integration pathway for future live dispatch',
        ],
        color: '#8B5CF6',
      },
      {
        label: 'Demo Workflow',
        items: [
          'View AI recommendations in right panel',
          'See crew optimization suggestions',
          'Review assignment reasoning & confidence',
          'Plan staffing decisions based on AI insights',
          'Use crew status map for real-time tracking',
        ],
        color: '#EC4899',
      },
    ],
  },
  {
    question: 'How do I use the Scenario Simulator?',
    sections: [
      {
        label: 'What-If Analysis Parameters',
        items: [
          'Temperature shifts (simulate weather scenarios)',
          'Crew availability adjustments (staffing changes)',
          'Work order volume changes (seasonal forecasting)',
          'Infrastructure condition factors (degradation trends)',
        ],
        color: '#F59E0B',
      },
      {
        label: 'Predictive Workflow',
        items: [
          'Adjust parameters on the left slider',
          'Click "Simulate" to run AI prediction',
          'AI shows predicted impact on work orders',
          'View how infrastructure health evolves',
          'Review AI recommendations for your scenario',
          'Plan ahead with confidence using AI forecasts',
        ],
        color: '#FB923C',
      },
    ],
  },
  {
    question: 'How does the AI learn and improve?',
    sections: [
      {
        label: 'Continuous Learning System',
        items: [
          'AI analyzes every decision and its actual outcome',
          'Incorrect predictions trigger automatic re-analysis',
          'Patterns emerge as new data flows into the system',
          'Confidence scores adjust based on historical accuracy',
          'System improves with each infrastructure event and crew action',
        ],
        color: '#6366F1',
      },
      {
        label: 'How Improvement Works',
        items: [
          'Multi-agent reasoning improves through feedback loops',
          'Each forecast is compared against actual results',
          'Weight factors for prioritization are refined automatically',
          'Seasonal patterns are learned and applied to future predictions',
          'Edge cases and anomalies teach the system new response strategies',
          'Your team feedback helps calibrate AI recommendations',
        ],
        color: '#8B5CF6',
      },
      {
        label: 'Impact on Your Operations',
        items: [
          'Earlier predictions become more accurate over time',
          'Crew recommendations optimize with real staffing data',
          'Priority scores adapt to your infrastructure patterns',
          'Scenario simulations become more reliable',
          'The longer you use MAINTAIN, the smarter it gets',
        ],
        color: '#10B981',
      },
    ],
  },
  {
    question: 'What machine learning algorithms power the AI?',
    sections: [
      {
        label: 'Priority Scoring Algorithm',
        items: [
          'Formula: Priority = (S × 0.30) + (P × 0.35) + (T × 0.20) + (A × 0.15)',
          'S = Severity Level (0-100) — Infrastructure damage assessment',
          'P = Proximity Score (0-100) — Distance from schools & sensitive areas',
          'T = Traffic Impact (0-100) — Public safety & congestion risk',
          'A = Age Factor (0-100) — How long issue has been unresolved',
          'Final score: 0-100 (higher = more urgent)',
          'Weights auto-adjust based on regional safety priorities',
        ],
        color: '#FF7F50',
      },
      {
        label: 'Predictive Decay Model (Weibull Distribution)',
        items: [
          'Formula: F(t) = 1 − exp(−(t/λ)^k)  — Weibull Cumulative Distribution Function',
          'k (shape) = Failure rate behavior: k>1 means increasing failure rate ("wear-out")',
          'λ (scale) = Characteristic life in days (63.2% failure point)',
          't = Elapsed time since issue was reported',
          'Pothole params:  k=1.8, λ=120 days — fastest degradation',
          'Sidewalk params: k=2.2, λ=240 days — gradual aging',
          'Concrete params: k=2.5, λ=365 days — most durable',
          'Scale adjusted for severity (×0.4 critical → ×1.3 low) and weather (×0.55 freeze-thaw → ×1.0 clear)',
          'Predicts Remaining Useful Life (RUL), failure probability, and hazard rate per asset',
          'Replaces linear decay with physically-motivated S-curve matching real infrastructure patterns',
        ],
        color: '#06B6D4',
      },
      {
        label: 'Crew Optimization Algorithm',
        items: [
          'Method: Multi-Agent Collaborative Reasoning (MACR)',
          'Constrains: Travel time < 15 min, crew skill match > 85%, availability',
          'Objective: Minimize total completion time + cost',
          'Uses: Nearest-neighbor heuristic with simulated annealing refinement',
          'Output: Best 3-5 crew assignment options ranked by efficiency',
          'Recalculates every 30 seconds with live crew location data',
        ],
        color: '#8B5CF6',
      },
      {
        label: 'Confidence Scoring System',
        items: [
          'Formula: Confidence = (Historical Accuracy × 0.40) + (Data Freshness × 0.35) + (Pattern Match × 0.25)',
          'Historical Accuracy: % of similar past predictions that were correct',
          'Data Freshness: How recent is the data (0-30 days optimal)',
          'Pattern Match: How well current data matches known patterns',
          '85%+ confidence = High reliability for decision-making',
          '<70% confidence = AI requests additional data or manual review',
        ],
        color: '#10B981',
      },
      {
        label: 'Scenario Simulation Engine',
        items: [
          'Method: Monte Carlo simulations with parameter perturbation',
          'Samples: 1000+ variations of your input parameters',
          'Variables: Temperature ±N°, crew availability ±%, order volume ±%',
          'Output: Probability distribution of outcomes, confidence bands',
          'Shows: Expected result + 90% confidence interval',
          'Helps you plan for multiple scenarios (best, likely, worst case)',
        ],
        color: '#F59E0B',
      },
      {
        label: 'Machine Learning Techniques',
        items: [
          'Ensemble Methods: Combines gradient boosting + random forests for robustness',
          'Time Series Forecasting: ARIMA + LSTM neural networks for degradation trends',
          'Weibull Survival Analysis: Models time-to-failure with shape (k) and scale (λ) parameters',
          'Classification: Multi-label classification for work order severity & category',
          'Reinforcement Learning: Agents learn optimal decisions from outcomes',
          'Natural Language Processing: Extracts insights from work order descriptions',
          'Anomaly Detection: Identifies unusual patterns that might indicate missed issues',
        ],
        color: '#6366F1',
      },
      {
        label: 'Weibull Distribution — How It Works',
        items: [
          'The Weibull distribution is the gold standard for reliability engineering and failure analysis',
          'CDF: F(t) = 1 − exp(−(t/λ)^k) gives probability of failure by time t',
          'Shape k < 1: Decreasing failure rate ("infant mortality" — early defects)',
          'Shape k = 1: Constant failure rate (reduces to exponential distribution)',
          'Shape k > 1: Increasing failure rate ("wear-out" — used for infrastructure)',
          'Scale λ: The characteristic life — age when 63.2% of similar assets have failed',
          'Hazard rate h(t) = (k/λ)(t/λ)^(k−1) gives instantaneous failure risk at any time',
          'RUL (Remaining Useful Life): Median conditional time until failure given current age',
          'Parameters fitted via Maximum Likelihood Estimation on historical work order data',
          'Used in: Decay Simulator, Remaining Useful Life predictions, Maintenance scheduling',
        ],
        color: '#EC4899',
      },
    ],
  },
];

const FEATURE_GUIDES = [
  {
    id: 'map',
    icon: <Map24Regular style={{ color: 'var(--accent-primary)' }} />,
    title: 'Interactive Map',
    steps: [
      'Pan and zoom to explore Lake Forest',
      'Click markers to view work order details',
      'Use the Layers button to toggle different overlays',
      'Red markers = Critical, Orange = High, Yellow = Medium, Green = Low',
      'Blue markers with person icons show crew locations',
    ],
  },
  {
    id: 'ai',
    icon: <Brain24Regular style={{ color: 'var(--accent-purple)' }} />,
    title: 'AI Insights Panel',
    steps: [
      'View proactive recommendations on the right panel',
      'Click any insight card to expand full details',
      'Review the "Reasoning Chain" to see how the AI made its decision',
      'Check confidence percentages to gauge reliability',
      'Insights refresh automatically with new data',
    ],
  },
  {
    id: 'crews',
    icon: <People24Regular style={{ color: 'var(--accent-success)' }} />,
    title: 'Crew Management',
    steps: [
      'Bottom-left panel shows all crews and their status',
      'Green = Available, Blue = Assigned, Gray = On Break',
      'View AI-recommended crew allocation at top of panel',
      'Click a crew to see their current assignment',
      'Efficiency ratings help optimize dispatching',
    ],
  },
  {
    id: 'charts',
    icon: <ChartMultiple24Regular style={{ color: '#EC4899' }} />,
    title: 'Predictive Charts',
    steps: [
      'Click the Charts button in the header',
      'Blue line shows actual historical data',
      'Orange dashed line shows AI predictions',
      'Yellow zone = Warning threshold, Red zone = Critical',
      'Hover over data points for exact values',
    ],
  },
  {
    id: 'simulator',
    icon: <Play24Regular style={{ color: 'var(--accent-warning)' }} />,
    title: 'Scenario Simulator',
    steps: [
      'Open the simulator from the bottom panel',
      'Adjust temperature change slider to simulate weather shifts',
      'Modify crew availability percentage',
      'Click "Simulate" to see predicted impact',
      'Review recommendations before making decisions',
    ],
  },
];

const AI_PLATFORM_GUIDES = [
  {
    id: 'sk',
    icon: <Brain24Regular style={{ color: '#B388FF' }} />,
    title: 'Semantic Kernel (AI Orchestration)',
    accentColor: '#8A2BE2',
    steps: [
      'All 8 MAINTAIN AI agents are wrapped as SK Plugins with @kernel_function decorators',
      'SK Planner enables autonomous agent selection — describe a goal and the LLM picks which plugins to call',
      'POST /api/sk/invoke routes to any agent; POST /api/sk/plan runs the autonomous planner',
      'Each invocation returns sk_metadata (plugin, function, duration, kernel version)',
      'The Architecture tab shows the full SK data flow from frontend to Azure AI Foundry',
      'Click invoke on any plugin to run it live and see real-time SK metadata',
      'Uses 5 Azure AI Foundry models (GPT-4.1, GPT-4.1-mini, GPT-4o, Phi-4, Phi-4-reasoning) via Model Router',
    ],
  },
  {
    id: 'a2a',
    icon: <Play24Regular style={{ color: '#F59E0B' }} />,
    title: 'A2A Agent Orchestrator',
    accentColor: '#F59E0B',
    steps: [
      '7 pipelines: Full Assessment, Parallel Assessment, Quick Triage, Deploy Crews, Investigate, Feedback Loop, Dynamic Negotiation',
      'Parallel execution runs Crew Estimation ∥ RAG Query concurrently after prioritization',
      'Feedback Loop pipeline: Prioritization requests re-analysis of critical items from Analysis Agent (bidirectional A2A)',
      'Activity Protocol support: /.well-known/agent.json exposes agent cards for external discovery',
      'Each agent has an A2A card with capabilities, I/O schemas, supported protocols, and endpoint URL',
      'SSE streaming endpoint (/api/orchestrate/stream) sends real-time events as agents execute',
      'All handoff messages between agents are logged with timestamps and context metadata',
    ],
  },
  {
    id: 'traces',
    icon: <Eye24Regular style={{ color: '#06B6D4' }} />,
    title: 'Agent Tracing (Observability)',
    accentColor: '#06B6D4',
    steps: [
      'Every AI agent call (analysis, dispatch, crew estimation, etc.) is automatically recorded',
      'KPI cards show total calls, error rate, average latency, and P95 latency',
      'The per-agent breakdown shows which agents are being used most and their performance',
      'The trace waterfall shows each call in chronological order with colored latency bars',
      'Data auto-refreshes every 8 seconds — run an analysis or dispatch and watch traces appear live',
      'Traces also flow to Azure Application Insights for enterprise-grade monitoring',
    ],
  },
  {
    id: 'roi',
    icon: <ChartMultiple24Regular style={{ color: '#10B981' }} />,
    title: 'Cost / ROI Analytics',
    accentColor: '#10B981',
    steps: [
      'GET /api/cost-roi calculates real cost/ROI projections from active work orders',
      'Compares AI processing cost ($0.001/order) vs. manual GIS analysis ($18.75/order)',
      'Uses municipal benchmarks: APWA 2024, GAO-23-105610, FHWA Infrastructure Guidelines',
      'Crew route optimization projects 30% reduction in wasted drive time',
      'Liability reduction model: 40% lower risk from proactive critical issue identification',
      'Executive Briefing overlay shows animated ROI projections with real data',
    ],
  },
  {
    id: 'rai',
    icon: <ShieldCheckmark24Regular style={{ color: '#8B5CF6' }} />,
    title: 'Responsible AI (RAI)',
    accentColor: '#8B5CF6',
    steps: [
      'Overview tab shows 6 governance pillars: Transparency, Human-in-the-Loop, Content Safety, Observability, Data Governance, and Audit Trail',
      'AI Decision Statistics show total decisions made, override rate, and average confidence',
      'Decision Audit tab shows every AI decision with full reasoning chains and confidence scores',
      'Content Safety tab shows Azure Content Safety integration — all AI outputs are checked for harmful content',
      'Use the live validation test to verify any text against the Content Safety API in real time',
      'Data flow diagram shows the read-only MCP path vs. the audited Dataverse write path',
    ],
  },
];

/**
 * HelpPanel - Comprehensive help and documentation panel
 */
const HelpPanel: React.FC<HelpPanelProps> = ({ onClose, onRestartTour, onOpenTraces, onOpenRAI, onOpenSK }) => {
  const [activeTab, setActiveTab] = useState('guide');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <OverlayShell
      size="md"
      onClose={onClose}
      headerExtra={<Question24Regular style={{ color: 'var(--accent-primary)' }} />}
      title="Help & Documentation"
    >
        {/* Tabs */}
        <div style={{ padding: '0 24px', borderBottom: '1px solid var(--glass-border)' }}>
          <TabList selectedValue={activeTab} onTabSelect={(_, data) => setActiveTab(data.value as string)}>
            <Tab value="guide" icon={<Book24Regular />}>Feature Guide</Tab>
            <Tab value="ai" icon={<Brain24Regular />}>AI Platform</Tab>
            <Tab value="shortcuts" icon={<Keyboard24Regular />}>Shortcuts</Tab>
            <Tab value="faq" icon={<Lightbulb24Regular />}>FAQ</Tab>
          </TabList>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {activeTab === 'guide' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Restart Tour Button */}
              <Button
                appearance="outline"
                icon={<Video24Regular />}
                onClick={onRestartTour}
                style={{ alignSelf: 'flex-start', marginBottom: 8 }}
              >
                Restart Welcome Tour
              </Button>

              {/* Feature Guides (excludes AI-platform items) */}
              {FEATURE_GUIDES.map((guide) => (
                <div
                  key={guide.id}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    {guide.icon}
                    <Title3>{guide.title}</Title3>
                  </div>
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    {guide.steps.map((step, i) => (
                      <li key={i} style={{ marginBottom: 8, color: 'var(--text-muted)' }}>
                        <Text size={300}>{step}</Text>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Intro banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(138,43,226,0.10), rgba(0,120,212,0.06))',
                  border: '1px solid rgba(138,43,226,0.20)',
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Brain24Regular style={{ color: '#B388FF', fontSize: 28, flexShrink: 0 }} />
                <div>
                  <Text weight="semibold" style={{ display: 'block', marginBottom: 2 }}>AI Platform Architecture</Text>
                  <Text size={200} style={{ color: 'var(--text-muted)' }}>
                    MAINTAIN AI uses Semantic Kernel with autonomous SK Planner, A2A Agent Orchestrator with parallel execution and feedback loops, Activity Protocol agent cards, Azure OpenTelemetry for observability, and Azure Content Safety for Responsible AI governance.
                  </Text>
                </div>
              </div>

              {/* AI Guide Cards */}
              {AI_PLATFORM_GUIDES.map((guide) => {
                const launchBtn = guide.id === 'sk' && onOpenSK
                  ? <Button appearance="primary" size="small" onClick={onOpenSK} style={{ marginLeft: 'auto', background: guide.accentColor, borderColor: guide.accentColor }}>Open SK Panel</Button>
                  : guide.id === 'traces' && onOpenTraces
                  ? <Button appearance="primary" size="small" onClick={onOpenTraces} style={{ marginLeft: 'auto', background: guide.accentColor, borderColor: guide.accentColor }}>Open Traces</Button>
                  : guide.id === 'rai' && onOpenRAI
                  ? <Button appearance="primary" size="small" onClick={onOpenRAI} style={{ marginLeft: 'auto', background: guide.accentColor, borderColor: guide.accentColor }}>Open Panel</Button>
                  : null;
                return (
                  <div
                    key={guide.id}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      {guide.icon}
                      <Title3>{guide.title}</Title3>
                      {launchBtn}
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {guide.steps.map((step, i) => (
                        <li key={i} style={{ marginBottom: 8, color: 'var(--text-muted)' }}>
                          <Text size={300}>{step}</Text>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
              }}
            >
              {KEYBOARD_SHORTCUTS.map((shortcut, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 8,
                    padding: '12px 16px',
                  }}
                >
                  <Text size={300}>{shortcut.description}</Text>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {shortcut.keys.map((key, j) => (
                      <Badge key={j} appearance="tint" color="informative" size="medium">
                        {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'faq' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FAQS.map((faq, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: 16,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: 'inherit',
                    }}
                  >
                    <Text weight="semibold">{faq.question}</Text>
                    <Text style={{ transform: expandedFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      ▼
                    </Text>
                  </button>
                  {expandedFaq === i && (
                    <div style={{ padding: '0 16px 16px 16px' }}>
                      {faq.sections ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {faq.sections.map((section, sIdx) => (
                            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                  style={{
                                    width: 4,
                                    height: 16,
                                    borderRadius: 2,
                                    background: section.color || 'var(--accent-primary)',
                                  }}
                                />
                                <Text weight="semibold" size={300} style={{ color: section.color || 'var(--accent-primary)' }}>
                                  {section.label}
                                </Text>
                              </div>
                              <ul style={{ margin: '0 0 0 16px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {section.items.map((item, itemIdx) => (
                                  <li key={itemIdx} style={{ color: 'var(--text-muted)', listStyle: 'disc' }}>
                                    <Text size={300} style={{ color: 'var(--text-muted)' }}>
                                      {item}
                                    </Text>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text size={300} style={{ color: 'var(--text-muted)' }}>
                          {faq.answer}
                        </Text>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--glass-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text size={200} style={{ color: 'var(--text-muted)' }}>
            MAINTAIN v3.1.0 • Lake Forest, IL Infrastructure
          </Text>
          <Button appearance="subtle" onClick={onClose} style={{ borderRadius: 8 }}>
            Close
          </Button>
        </div>
    </OverlayShell>
  );
};

export default HelpPanel;

import React, { useState, useEffect } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  Button,
  Card,
  CardHeader,
  Divider,
  Tooltip,
} from '@fluentui/react-components';
import {
  Brain24Regular,
  ChevronDown24Regular,
  ChevronUp24Regular,
  Lightbulb24Regular,
  CheckmarkCircle24Regular,
  Warning24Regular,
  Info24Regular,
} from '@fluentui/react-icons';
import type { AIInsight, ReasoningStep } from '../types/infrastructure';

interface AICompanionPanelProps {
  insights: AIInsight[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

/**
 * AI Companion Panel - Glassmorphism side panel showing AI reasoning transparency
 * 
 * Features:
 * - Reasoning steps with confidence scores
 * - Expandable insight cards
 * - Proactive notification indicators
 * - Factor weight visualization
 */
const AICompanionPanel: React.FC<AICompanionPanelProps> = ({
  insights,
  isLoading = false,
  onRefresh,
}) => {
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedInsightId(expandedInsightId === id ? null : id);
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'priority':
        return <Warning24Regular />;
      case 'crew_estimate':
        return <CheckmarkCircle24Regular />;
      case 'prediction':
        return <Lightbulb24Regular />;
      default:
        return <Info24Regular />;
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'var(--accent-success)';
    if (confidence >= 0.6) return 'var(--accent-warning)';
    return 'var(--priority-high)';
  };

  return (
    <div className="ai-panel glass-panel slide-in-right" style={{
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--spacing-lg)',
      gap: 'var(--spacing-md)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <Brain24Regular style={{ color: 'var(--accent-primary)' }} />
          <Title2>AI Companion</Title2>
        </div>
        <Tooltip content="AI-generated recommendations based on infrastructure data analysis" relationship="description">
          <Badge appearance="filled" color="informative" style={{ cursor: 'help' }}>
            {insights.length} Insights
          </Badge>
        </Tooltip>
      </div>

      {/* Help Text for New Users */}
      <div style={{
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-xs)',
      }}>
        <Text size={200} style={{ color: 'var(--colorNeutralForeground2)' }}>
          <Lightbulb24Regular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }} /> <strong>Tip:</strong> Click any insight to see how the AI made its recommendation
        </Text>
      </div>

      <Divider />

      {/* Insights List */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-md)',
      }}>
        {isLoading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-xl)',
            gap: 'var(--spacing-md)',
          }}>
            <div className="loading-spinner" />
            <Text>Analyzing infrastructure data...</Text>
          </div>
        ) : insights.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-xl)',
            textAlign: 'center',
          }}>
            <Brain24Regular style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 'var(--spacing-md)' }} />
            <Text>No insights available yet.</Text>
            <Caption1 style={{ color: 'var(--text-muted)' }}>
              Insights will appear as the AI analyzes work orders.
            </Caption1>
          </div>
        ) : (
          insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              isExpanded={expandedInsightId === insight.id}
              onToggle={() => toggleExpand(insight.id)}
              getInsightIcon={getInsightIcon}
              getConfidenceColor={getConfidenceColor}
            />
          ))
        )}
      </div>

      {/* Refresh Button */}
      {onRefresh && (
        <Button
          appearance="subtle"
          onClick={onRefresh}
          disabled={isLoading}
          style={{ width: '100%' }}
        >
          Refresh Insights
        </Button>
      )}
    </div>
  );
};

// ============================================
// Insight Card Component
// ============================================

interface InsightCardProps {
  insight: AIInsight;
  isExpanded: boolean;
  onToggle: () => void;
  getInsightIcon: (type: string) => React.ReactNode;
  getConfidenceColor: (confidence: number) => string;
}

const InsightCard: React.FC<InsightCardProps> = ({
  insight,
  isExpanded,
  onToggle,
  getInsightIcon,
  getConfidenceColor,
}) => {
  return (
    <Card
      className="glass-card fade-in"
      style={{
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={onToggle}
    >
      <CardHeader
        image={
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'var(--glass-bg)',
            color: 'var(--accent-primary)',
          }}>
            {getInsightIcon(insight.type)}
          </div>
        }
        header={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <Text weight="semibold">{insight.title}</Text>
            {insight.isProactive && (
              <Badge appearance="tint" color="warning" size="small">
                Proactive
              </Badge>
            )}
          </div>
        }
        description={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
            <Tooltip content={`${Math.round(insight.confidence * 100)}% confidence`} relationship="label">
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                <div className="confidence-bar" style={{ width: 60 }}>
                  <div
                    className="confidence-fill"
                    style={{
                      width: `${insight.confidence * 100}%`,
                      background: getConfidenceColor(insight.confidence),
                    }}
                  />
                </div>
                <Caption1>{Math.round(insight.confidence * 100)}%</Caption1>
              </div>
            </Tooltip>
          </div>
        }
        action={
          isExpanded ? <ChevronUp24Regular /> : <ChevronDown24Regular />
        }
      />

      {/* Expanded Content */}
      {isExpanded && (
        <div style={{
          padding: 'var(--spacing-md)',
          paddingTop: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-md)',
        }}>
          <Divider />

          {/* Recommendation */}
          <div>
            <Title3>Recommendation</Title3>
            <Text style={{ marginTop: 'var(--spacing-xs)' }}>
              {insight.recommendation}
            </Text>
          </div>

          {/* Reasoning Steps */}
          <div>
            <Title3>Reasoning</Title3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-sm)',
              marginTop: 'var(--spacing-sm)',
            }}>
              {insight.reasoning.map((step) => (
                <ReasoningStepItem
                  key={step.step}
                  step={step}
                  getConfidenceColor={getConfidenceColor}
                />
              ))}
            </div>
          </div>

          {/* Factors */}
          {insight.factors.length > 0 && (
            <div>
              <Title3>Decision Factors</Title3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-xs)',
                marginTop: 'var(--spacing-sm)',
              }}>
                {insight.factors.map((factor, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <Caption1>{factor.name}</Caption1>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-xs)',
                    }}>
                      <div className="confidence-bar" style={{ width: 40 }}>
                        <div
                          className="confidence-fill"
                          style={{ width: `${factor.weight * 100}%` }}
                        />
                      </div>
                      <Caption1 style={{ color: 'var(--text-muted)', minWidth: 35 }}>
                        {Math.round(factor.weight * 100)}%
                      </Caption1>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// ============================================
// Reasoning Step Item Component
// ============================================

interface ReasoningStepItemProps {
  step: ReasoningStep;
  getConfidenceColor: (confidence: number) => string;
}

const ReasoningStepItem: React.FC<ReasoningStepItemProps> = ({
  step,
  getConfidenceColor,
}) => {
  return (
    <div style={{
      display: 'flex',
      gap: 'var(--spacing-sm)',
      padding: 'var(--spacing-sm)',
      background: 'var(--glass-bg)',
      borderRadius: 'var(--radius-sm)',
      borderLeft: `3px solid ${getConfidenceColor(step.confidence)}`,
    }}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: 'var(--bg-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Caption1 style={{ fontWeight: 600 }}>{step.step}</Caption1>
      </div>
      <div style={{ flex: 1 }}>
        <Text size={200}>{step.description}</Text>
        {step.dataSource && (
          <Caption1 style={{ color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>
            Source: {step.dataSource}
          </Caption1>
        )}
      </div>
      <Tooltip content={`${Math.round(step.confidence * 100)}% confidence`} relationship="label">
        <Caption1 style={{ color: getConfidenceColor(step.confidence) }}>
          {Math.round(step.confidence * 100)}%
        </Caption1>
      </Tooltip>
    </div>
  );
};

export default AICompanionPanel;

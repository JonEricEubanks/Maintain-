import React, { useState } from 'react';
import {
  Text,
  Button,
  Tooltip,
  Badge,
} from '@fluentui/react-components';
import type { FluentIcon } from '@fluentui/react-icons';
import {
  ArrowSync24Regular,
  AlertUrgent24Regular,
  People24Regular,
  WeatherPartlyCloudyDay24Regular,
  ChartMultiple24Regular,
  Question24Regular,
  Lightbulb24Regular,
  Navigation24Regular,
  CheckmarkCircle24Regular,
  Map24Regular,
  Brain24Regular,
  TargetArrow24Regular,
  Speaker224Regular,
} from '@fluentui/react-icons';

interface QuickAction {
  id: string;
  Icon: FluentIcon;
  label: string;
  shortLabel: string;
  description: string;
  hotkey?: string;
  badge?: string;
  badgeColor?: 'danger' | 'warning' | 'success' | 'informative';
  onClick: () => void;
}

interface QuickActionsBarProps {
  criticalCount: number;
  crewsAvailable: number;
  onRefresh: () => void;
  onShowCritical: () => void;
  onShowCrews: () => void;
  onShowWeather: () => void;
  onShowCharts: () => void;
  onShowHelp: () => void;
  isLoading: boolean;
}

/**
 * QuickActionsBar - Floating quick actions for common tasks
 * Makes the most important actions easily discoverable
 */
const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  criticalCount,
  crewsAvailable,
  onRefresh,
  onShowCritical,
  onShowCrews,
  onShowWeather,
  onShowCharts,
  onShowHelp,
  isLoading,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showTips, setShowTips] = useState(false);

  const actions: QuickAction[] = [
    {
      id: 'critical',
      Icon: AlertUrgent24Regular,
      label: 'View Critical Issues',
      shortLabel: 'Critical',
      description: 'Jump to critical priority work orders',
      hotkey: 'C',
      badge: criticalCount > 0 ? String(criticalCount) : undefined,
      badgeColor: 'danger',
      onClick: onShowCritical,
    },
    {
      id: 'crews',
      Icon: People24Regular,
      label: 'Crew Status',
      shortLabel: 'Crews',
      description: 'View crew locations and availability',
      hotkey: 'R',
      badge: `${crewsAvailable} available`,
      badgeColor: crewsAvailable > 0 ? 'success' : 'warning',
      onClick: onShowCrews,
    },
    {
      id: 'weather',
      Icon: WeatherPartlyCloudyDay24Regular,
      label: 'Weather Forecast',
      shortLabel: 'Weather',
      description: 'Check weather and workability scores',
      hotkey: 'W',
      onClick: onShowWeather,
    },
    {
      id: 'charts',
      Icon: ChartMultiple24Regular,
      label: 'Predictive Charts',
      shortLabel: 'Charts',
      description: 'View trends and predictions',
      hotkey: 'P',
      onClick: onShowCharts,
    },
    {
      id: 'refresh',
      Icon: ArrowSync24Regular,
      label: 'Refresh All Data',
      shortLabel: 'Refresh',
      description: 'Fetch latest data from all sources',
      hotkey: 'F5',
      onClick: onRefresh,
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {/* Tips Panel */}
      {showTips && (
        <div
          style={{
            background: 'rgba(13, 17, 23, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            padding: 16,
            maxWidth: 400,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Lightbulb24Regular style={{ color: 'var(--accent-warning)' }} />
            <Text weight="semibold">Quick Tips</Text>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TipItem icon={<Map24Regular style={{ width: 16, height: 16 }} />} text="Click any map marker for details" />
            <TipItem icon={<Brain24Regular style={{ width: 16, height: 16 }} />} text="Expand AI insights to see reasoning" />
            <TipItem icon={<TargetArrow24Regular style={{ width: 16, height: 16 }} />} text="Use scenario simulator for planning" />
            <TipItem icon={<Speaker224Regular style={{ width: 16, height: 16 }} />} text="Enable voice for critical alerts" />
          </div>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => setShowTips(false)}
            style={{ marginTop: 12, width: '100%' }}
          >
            Got it!
          </Button>
        </div>
      )}

      {/* Main Action Bar */}
      <div
        role="toolbar"
        aria-label="Quick actions"
        style={{
          background: 'rgba(13, 17, 23, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Expand/Collapse Toggle */}
        <Tooltip content={isExpanded ? "Collapse quick actions" : "Expand quick actions"} relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<Navigation24Regular />}
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </Tooltip>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--glass-border)', margin: '0 4px' }} />

        {/* Action Buttons */}
        {actions.map((action) => {
          const ActionIcon = action.Icon;
          return (
            <Tooltip
              key={action.id}
              content={
                <div>
                  <Text weight="semibold">{action.label}</Text>
                  <br />
                  <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
                    {action.description}
                  </Text>
                  {action.hotkey && (
                    <Badge appearance="outline" size="small" style={{ marginLeft: 8 }}>
                      {action.hotkey}
                    </Badge>
                  )}
                </div>
              }
              relationship="label"
            >
              <Button
                appearance="subtle"
                size={isExpanded ? "medium" : "small"}
                icon={<ActionIcon />}
                onClick={action.onClick}
                disabled={isLoading && action.id === 'refresh'}
                style={{
                  position: 'relative',
                  minWidth: isExpanded ? 'auto' : 36,
                }}
              >
                {isExpanded && action.shortLabel}
                {action.badge && (
                  <Badge
                    appearance="filled"
                    color={action.badgeColor}
                    size="small"
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      fontSize: 10,
                      padding: '0 4px',
                    }}
                  >
                    {action.badge}
                  </Badge>
              )}
              </Button>
            </Tooltip>
          );
        })}

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: 'var(--glass-border)', margin: '0 4px' }} />

        {/* Help Button */}
        <Tooltip content="Tips & Help" relationship="label">
          <Button
            appearance={showTips ? "primary" : "subtle"}
            size="small"
            icon={<Question24Regular />}
            onClick={() => setShowTips(!showTips)}
          />
        </Tooltip>
      </div>

      {/* Keyboard Shortcuts Hint */}
      {isExpanded && (
        <Text size={100} style={{ color: 'var(--colorNeutralForeground4)' }}>
          Press ? for keyboard shortcuts
        </Text>
      )}
    </div>
  );
};

// Helper component for tips
const TipItem: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span>{icon}</span>
    <Text size={200}>{text}</Text>
  </div>
);

export default QuickActionsBar;

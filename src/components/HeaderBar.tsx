/**
 * HeaderBar — Compact top bar with brand, action buttons, and AI chat toggle.
 *
 * Reads theme / overlay state from AppContext so it needs no prop drilling
 * for those concerns. Only Dashboard-specific callbacks are passed as props.
 */

import React from 'react';
import {
  Button,
  Badge,
  Tooltip,
} from '@fluentui/react-components';
import {
  Map24Regular,
  ArrowSync24Regular,
  Question24Regular,
  WeatherSunny24Regular,
  WeatherMoon24Regular,
  Brain24Regular,
  Dismiss24Regular,
  DocumentBulletList24Regular,
  ChartMultiple24Regular,
  Sparkle24Regular,
  Play24Regular,
  Stop24Regular,
} from '@fluentui/react-icons';
import { useApp } from '../context/AppContext';

interface HeaderBarProps {
  onOpenMap: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  isDemoRunning?: boolean;
  onToggleDemo?: () => void;
}

const HeaderBar: React.FC<HeaderBarProps> = ({
  onOpenMap,
  onRefresh,
  isLoading,
  sidebarOpen,
  onToggleSidebar,
  isDemoRunning,
  onToggleDemo,
}) => {
  const { theme, toggleTheme, openOverlay } = useApp();
  const connectionStatus = useApp().state.connectionStatus;

  return (
    <header className="dash-header-v3" role="banner" aria-label="MAINTAIN AI navigation">
      {/* Brand */}
      <div className="dash-brand">
        <div className="dash-brand-icon"><Map24Regular /></div>
        <span className="dash-brand-name">MAINTAIN</span>
        <Badge appearance="filled" color={connectionStatus === 'connected' ? 'success' : connectionStatus === 'connecting' ? 'warning' : 'danger'} size="small" style={{ marginLeft: -2 }}>
          {connectionStatus === 'connected' ? '● Live' : connectionStatus === 'connecting' ? '◐' : '○'}
        </Badge>
      </div>

      {/* ── Actions: View | AI | Tools | Meta ── */}
      <nav className="dash-header-actions" aria-label="Main actions">
        {/* View group */}
        <Tooltip content="Infrastructure Map" relationship="label">
          <Button appearance="subtle" icon={<Map24Regular />} onClick={onOpenMap} size="small" className="dash-ha-btn" data-tour="map">Map</Button>
        </Tooltip>

        <div className="dash-chip-divider" />

        {/* AI group */}
        <Tooltip content="Analysis Wizard" relationship="label">
          <Button appearance="subtle" icon={<Sparkle24Regular />} onClick={() => openOverlay('analysisWizard')} size="small" className="dash-ha-btn" data-tour="wizard">Wizard</Button>
        </Tooltip>
        <Tooltip content="Executive Briefing" relationship="label">
          <Button appearance="subtle" icon={<DocumentBulletList24Regular />} onClick={() => openOverlay('briefing')} size="small" className="dash-ha-btn" data-tour="briefing">Brief</Button>
        </Tooltip>
        <Tooltip content="NLP Dashboard Builder" relationship="label">
          <Button appearance="subtle" icon={<Sparkle24Regular />} onClick={() => openOverlay('nlpDashboard')} size="small" className="dash-ha-btn" data-tour="analytics">Analytics</Button>
        </Tooltip>

        <div className="dash-chip-divider" />

        {/* Tools group */}
        <Tooltip content="Decay Simulation" relationship="label">
          <Button appearance="subtle" icon={<ChartMultiple24Regular />} onClick={() => openOverlay('decayVisualizer')} size="small" className="dash-ha-btn" data-tour="decay">Decay</Button>
        </Tooltip>

        <div className="dash-chip-divider" />

        {/* Meta group */}
        <Tooltip content="Refresh data" relationship="label">
          <Button appearance="subtle" icon={<ArrowSync24Regular />} onClick={onRefresh} disabled={isLoading} size="small" className="dash-ha-btn icon" />
        </Tooltip>
        <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'} relationship="label">
          <Button appearance="subtle" icon={theme === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />} onClick={toggleTheme} size="small" className="dash-ha-btn icon" />
        </Tooltip>
        <Tooltip content="Help & Guides" relationship="label">
          <Button appearance="subtle" icon={<Question24Regular />} onClick={() => openOverlay('helpPanel')} size="small" className="dash-ha-btn icon" />
        </Tooltip>
        {onToggleDemo && (
          <Tooltip content={isDemoRunning ? 'Stop Demo' : 'Auto-Pilot Demo'} relationship="label">
            <Button
              appearance={isDemoRunning ? 'primary' : 'subtle'}
              icon={isDemoRunning ? <Stop24Regular /> : <Play24Regular />}
              onClick={onToggleDemo}
              size="small"
              className={`dash-ha-btn${isDemoRunning ? ' primary' : ''}`}
              style={!isDemoRunning ? { color: 'var(--accent-secondary)' } : undefined}
            >
              {isDemoRunning ? 'Stop' : 'Demo'}
            </Button>
          </Tooltip>
        )}

        <div className="dash-chip-divider" />

        {/* AI Chat toggle */}
        <Tooltip content={sidebarOpen ? 'Close AI Chat' : 'Open AI Chat'} relationship="label">
          <Button
            appearance={sidebarOpen ? 'primary' : 'subtle'}
            icon={sidebarOpen ? <Dismiss24Regular /> : <Brain24Regular />}
            onClick={onToggleSidebar}
            size="small"
            className={`dash-ha-btn icon${sidebarOpen ? ' primary' : ''}`}
            data-tour="ai-chat"
          />
        </Tooltip>
      </nav>
    </header>
  );
};

export default HeaderBar;

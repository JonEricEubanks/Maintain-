import React, { useState } from 'react';
import {
  Text,
  Button,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverSurface,
} from '@fluentui/react-components';
import {
  Home24Regular,
  Add24Regular,
  Subtract24Regular,
  FullScreenMaximize24Regular,
  Map24Regular,
  Info24Regular,
  Question24Regular,
  People24Regular,
  Cursor24Regular,
  Search24Regular,
  HandLeft24Regular,
  Dismiss24Regular,
} from '@fluentui/react-icons';

interface MapControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleFullscreen?: () => void;
  onShowHelp: () => void;
}

/**
 * MapControls - Enhanced map control buttons with legend
 */
const MapControls: React.FC<MapControlsProps> = ({
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleFullscreen,
  onShowHelp,
}) => {
  const [showLegend, setShowLegend] = useState(false);

  return (
    <>
      {/* Control Buttons */}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        padding: 4,
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--glass-border)',
      }}>
        <Tooltip content="Zoom In" relationship="label" positioning="after">
          <Button appearance="subtle" icon={<Add24Regular />} onClick={onZoomIn} size="small" />
        </Tooltip>
        <Tooltip content="Zoom Out" relationship="label" positioning="after">
          <Button appearance="subtle" icon={<Subtract24Regular />} onClick={onZoomOut} size="small" />
        </Tooltip>
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '2px 0' }} />
        <Tooltip content="Reset View (Home)" relationship="label" positioning="after">
          <Button appearance="subtle" icon={<Home24Regular />} onClick={onResetView} size="small" />
        </Tooltip>
        {onToggleFullscreen && (
          <Tooltip content="Fullscreen" relationship="label" positioning="after">
            <Button appearance="subtle" icon={<FullScreenMaximize24Regular />} onClick={onToggleFullscreen} size="small" />
          </Tooltip>
        )}
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '2px 0' }} />
        <Tooltip content="Map Legend" relationship="label" positioning="after">
          <Button 
            appearance={showLegend ? "primary" : "subtle"} 
            icon={<Map24Regular />} 
            onClick={() => setShowLegend(!showLegend)} 
            size="small" 
          />
        </Tooltip>
        <Tooltip content="Help" relationship="label" positioning="after">
          <Button appearance="subtle" icon={<Question24Regular />} onClick={onShowHelp} size="small" />
        </Tooltip>
      </div>

      {/* Legend Panel */}
      {showLegend && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: 60,
          zIndex: 1000,
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          padding: 16,
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--glass-border)',
          minWidth: 200,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text weight="semibold">Map Legend</Text>
            <Button appearance="subtle" size="small" onClick={() => setShowLegend(false)}><Dismiss24Regular style={{ width: 14, height: 14 }} /></Button>
          </div>

          {/* Work Order Markers */}
          <Text size={200} weight="semibold" style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted)' }}>
            WORK ORDERS
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <LegendItem color="#f85149" label="Critical Priority" description="Immediate attention required" />
            <LegendItem color="#f0883e" label="High Priority" description="Address within 24 hours" />
            <LegendItem color="#d29922" label="Medium Priority" description="Schedule this week" />
            <LegendItem color="#3fb950" label="Low Priority" description="Can be scheduled normally" />
          </div>

          {/* Crew Markers */}
          <Text size={200} weight="semibold" style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted)' }}>
            CREWS
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            <LegendItem color="#58a6ff" label="Crew Location" description="Click to see crew details" icon={<People24Regular style={{ width: 14, height: 14, color: '#58a6ff' }} />} />
          </div>

          {/* Interactions */}
          <Text size={200} weight="semibold" style={{ display: 'block', marginBottom: 8, color: 'var(--text-muted)' }}>
            INTERACTIONS
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text size={200}><Cursor24Regular style={{ width: 12, height: 12, verticalAlign: 'middle' }} /> Click marker → View details</Text>
            <Text size={200}><Search24Regular style={{ width: 12, height: 12, verticalAlign: 'middle' }} /> Scroll → Zoom in/out</Text>
            <Text size={200}><HandLeft24Regular style={{ width: 12, height: 12, verticalAlign: 'middle' }} /> Drag → Pan around map</Text>
          </div>
        </div>
      )}
    </>
  );
};

// Helper component for legend items
const LegendItem: React.FC<{
  color: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
}> = ({ color, label, description, icon }) => (
  <Popover>
    <PopoverTrigger>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        {icon ? (
          <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
        ) : (
          <div style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: color,
            border: '2px solid rgba(255,255,255,0.3)',
          }} />
        )}
        <Text size={200}>{label}</Text>
      </div>
    </PopoverTrigger>
    <PopoverSurface>
      <Text size={200}>{description}</Text>
    </PopoverSurface>
  </Popover>
);

export default MapControls;

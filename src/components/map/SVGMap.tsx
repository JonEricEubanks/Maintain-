import React, { useState, useMemo, useCallback } from 'react';
import {
  Text,
  Badge,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  ZoomIn24Regular,
  ZoomOut24Regular,
  Home24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder, Crew, MapState } from '../../types/infrastructure';
import type { Cluster, StaffZone } from '../../services/analyticsService';

// ============================================
// SVG Map Configuration
// ============================================

const MAP_CONFIG = {
  // Lake Forest, IL bounds
  bounds: {
    minLat: 42.20,
    maxLat: 42.32,
    minLng: -87.92,
    maxLng: -87.76,
  },
  defaultZoom: 1,
  minZoom: 0.5,
  maxZoom: 3,
  viewBox: { width: 800, height: 600 },
};

// ============================================
// SVG Map Component (Pure React - No Event Issues)
// ============================================

interface SVGMapProps {
  workOrders: WorkOrder[];
  crews: Crew[];
  mapState: MapState;
  onWorkOrderSelect: (id: string | null) => void;
  onDispatchCrew?: (workOrderId: string) => void;
  theme?: 'light' | 'dark';
  selectedWorkOrderIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  clusters?: Cluster[];
  showClusters?: boolean;
  staffZones?: StaffZone[];
  showStaffZones?: boolean;
}

/**
 * SVGMap - Pure React SVG-based map visualization
 * 
 * Uses only React's synthetic events (no native addEventListener)
 * to avoid Power Apps passive event listener conflicts.
 */
const SVGMap: React.FC<SVGMapProps> = ({
  workOrders,
  crews,
  mapState,
  onWorkOrderSelect,
  onDispatchCrew,
  theme = 'light',
  selectedWorkOrderIds = [],
  onSelectionChange,
  clusters = [],
  showClusters = false,
  staffZones = [],
  showStaffZones = false,
}) => {
  const [zoom, setZoom] = useState(MAP_CONFIG.defaultZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Priority colors
  const priorityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#22c55e',
  };

  // Status styles
  const statusStyles: Record<string, { fill: string; stroke: string }> = {
    pending: { fill: '#fbbf24', stroke: '#f59e0b' },
    'in-progress': { fill: '#3b82f6', stroke: '#2563eb' },
    completed: { fill: '#22c55e', stroke: '#16a34a' },
    cancelled: { fill: '#6b7280', stroke: '#4b5563' },
  };

  // Convert lat/lng to SVG coordinates
  const latLngToSVG = useCallback((lat: number, lng: number) => {
    const { bounds, viewBox } = MAP_CONFIG;
    const xRatio = (lng - bounds.minLng) / (bounds.maxLng - bounds.minLng);
    const yRatio = 1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat);
    
    const baseX = xRatio * viewBox.width;
    const baseY = yRatio * viewBox.height;
    
    // Apply zoom and pan
    const centerX = viewBox.width / 2;
    const centerY = viewBox.height / 2;
    
    const x = (baseX - centerX) * zoom + centerX + pan.x;
    const y = (baseY - centerY) * zoom + centerY + pan.y;
    
    return { x, y };
  }, [zoom, pan]);

  // Handle zoom
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, MAP_CONFIG.maxZoom));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, MAP_CONFIG.minZoom));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Handle panning - using React events only
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    setLastPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsPanning(false);
  const handleMouseLeave = () => setIsPanning(false);

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: JSX.Element[] = [];
    const { viewBox } = MAP_CONFIG;
    const spacing = 60;
    
    // Vertical lines
    for (let x = 0; x <= viewBox.width; x += spacing) {
      lines.push(
        <line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={viewBox.height}
          stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(100,140,160,0.12)'}
          strokeWidth={1}
        />
      );
    }
    
    // Horizontal lines
    for (let y = 0; y <= viewBox.height; y += spacing) {
      lines.push(
        <line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={viewBox.width}
          y2={y}
          stroke={theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(100,140,160,0.12)'}
          strokeWidth={1}
        />
      );
    }
    
    return lines;
  }, [theme]);

  // City boundary
  const cityBoundary = useMemo(() => {
    const topLeft = latLngToSVG(42.30, -87.90);
    const bottomRight = latLngToSVG(42.22, -87.78);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }, [latLngToSVG]);

  // Render work order markers
  const workOrderMarkers = useMemo(() => {
    return workOrders.map(wo => {
      const pos = latLngToSVG(wo.latitude, wo.longitude);
      const isSelected = selectedWorkOrderIds.includes(wo.id);
      const isHovered = hoveredId === wo.id;
      const priority = wo.severity || 'medium';
      const color = priorityColors[priority] || '#3b82f6';
      const markerSize = (isSelected || isHovered ? 14 : 10) * zoom;
      
      return (
        <g key={wo.id}>
          {/* Pulse effect for critical */}
          {priority === 'critical' && (
            <circle
              cx={pos.x}
              cy={pos.y}
              r={markerSize * 1.5}
              fill="none"
              stroke={color}
              strokeWidth={2}
              opacity={0.4}
            >
              <animate
                attributeName="r"
                from={markerSize}
                to={markerSize * 2}
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.6"
                to="0"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}
          
          {/* Selection ring */}
          {isSelected && (
            <circle
              cx={pos.x}
              cy={pos.y}
              r={markerSize + 4}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={3}
              opacity={0.8}
            />
          )}
          
          {/* Main marker */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={markerSize}
            fill={color}
            stroke={theme === 'dark' ? '#fff' : '#1e293b'}
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredId(wo.id)}
            onMouseLeave={() => setHoveredId(null)}
            onClick={(e) => {
              e.stopPropagation();
              onWorkOrderSelect(wo.id);
            }}
          />
          
          {/* Status indicator dot */}
          <circle
            cx={pos.x + markerSize * 0.7}
            cy={pos.y - markerSize * 0.7}
            r={4 * zoom}
            fill={statusStyles[wo.status]?.fill || '#6b7280'}
            stroke={theme === 'dark' ? '#fff' : '#1e293b'}
            strokeWidth={1}
          />
        </g>
      );
    });
  }, [workOrders, latLngToSVG, zoom, selectedWorkOrderIds, hoveredId, theme, onWorkOrderSelect]);

  // Render crew markers
  const crewMarkers = useMemo(() => {
    return crews.map(crew => {
      const pos = latLngToSVG(crew.currentLat, crew.currentLng);
      const statusColor = crew.status === 'available' ? '#22c55e' : 
                         crew.status === 'assigned' ? '#f59e0b' : '#ef4444';
      
      return (
        <g key={crew.id}>
          {/* Crew marker - truck shape */}
          <rect
            x={pos.x - 12 * zoom}
            y={pos.y - 8 * zoom}
            width={24 * zoom}
            height={16 * zoom}
            rx={3}
            fill={statusColor}
            stroke={theme === 'dark' ? '#fff' : '#1e293b'}
            strokeWidth={2}
          />
          
          {/* Crew label */}
          <text
            x={pos.x}
            y={pos.y + 24 * zoom}
            textAnchor="middle"
            fontSize={10 * zoom}
            fill={theme === 'dark' ? '#fff' : '#1e293b'}
            fontWeight="bold"
          >
            {crew.name}
          </text>
        </g>
      );
    });
  }, [crews, latLngToSVG, zoom, theme]);

  // Hovered work order details
  const hoveredWorkOrder = workOrders.find(wo => wo.id === hoveredId);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: theme === 'dark' ? '#1a1a2e' : '#e8f4f8',
      }}
    >
      {/* Main SVG */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${MAP_CONFIG.viewBox.width} ${MAP_CONFIG.viewBox.height}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Background */}
        <defs>
          <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme === 'dark' ? '#1a1a2e' : '#e8f4f8'} />
            <stop offset="100%" stopColor={theme === 'dark' ? '#16213e' : '#d4e8ed'} />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgGradient)" />
        
        {/* Grid */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
          {gridLines}
        </g>
        
        {/* City boundary */}
        <rect
          x={cityBoundary.x}
          y={cityBoundary.y}
          width={cityBoundary.width}
          height={cityBoundary.height}
          fill={theme === 'dark' ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.08)'}
          stroke={theme === 'dark' ? 'rgba(100,150,255,0.4)' : 'rgba(59,130,246,0.3)'}
          strokeWidth={3}
          strokeDasharray="8,4"
        />
        
        {/* City label */}
        <text
          x={MAP_CONFIG.viewBox.width / 2 + pan.x * 0.5}
          y={Math.max(cityBoundary.y - 20, 30)}
          textAnchor="middle"
          fontSize={Math.max(18 * zoom, 14)}
          fontWeight="bold"
          fill={theme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(30,58,138,0.9)'}
        >
          Lake Forest, IL
        </text>
        
        {/* Staff zones (if enabled) */}
        {showStaffZones && staffZones.map((zone, i) => {
          const center = latLngToSVG(zone.center.lat, zone.center.lng);
          return (
            <circle
              key={zone.id}
              cx={center.x}
              cy={center.y}
              r={(zone.radius || 1) * 150 * zoom}
              fill={`hsla(${(i * 60) % 360}, 70%, 50%, 0.1)`}
              stroke={`hsla(${(i * 60) % 360}, 70%, 50%, 0.3)`}
              strokeWidth={2}
              strokeDasharray="4,4"
            />
          );
        })}
        
        {/* Crew markers */}
        {crewMarkers}
        
        {/* Work order markers */}
        {workOrderMarkers}
      </svg>
      
      {/* Zoom controls */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)',
          borderRadius: 8,
          padding: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <Tooltip content="Zoom in" relationship="label">
          <Button icon={<ZoomIn24Regular />} appearance="subtle" onClick={handleZoomIn} />
        </Tooltip>
        <Tooltip content="Zoom out" relationship="label">
          <Button icon={<ZoomOut24Regular />} appearance="subtle" onClick={handleZoomOut} />
        </Tooltip>
        <Tooltip content="Reset view" relationship="label">
          <Button icon={<Home24Regular />} appearance="subtle" onClick={handleReset} />
        </Tooltip>
      </div>
      
      {/* Simplified view indicator */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <Badge appearance="outline" color="informative">Simplified View</Badge>
      </div>
      
      {/* Tooltip for hovered work order */}
      {hoveredWorkOrder && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            background: theme === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)',
            borderRadius: 12,
            padding: 16,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            maxWidth: 300,
            zIndex: 100,
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 8, color: theme === 'dark' ? '#fff' : '#1e293b' }}>
            {hoveredWorkOrder.title}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Badge color={
              hoveredWorkOrder.severity === 'critical' ? 'danger' :
              hoveredWorkOrder.severity === 'high' ? 'warning' :
              hoveredWorkOrder.severity === 'medium' ? 'informative' : 'success'
            }>
              {hoveredWorkOrder.severity}
            </Badge>
            <Badge appearance="outline">{hoveredWorkOrder.status}</Badge>
            <Badge appearance="outline">{hoveredWorkOrder.issueType}</Badge>
          </div>
          <Text size={200} style={{ color: theme === 'dark' ? '#a0aec0' : '#64748b' }}>
            {hoveredWorkOrder.address}
          </Text>
        </div>
      )}
      
      {/* Priority Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)',
          borderRadius: 8,
          padding: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        <Text size={200} weight="semibold" style={{ marginBottom: 8, display: 'block' }}>
          Priority
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(priorityColors).map(([priority, color]) => (
            <div key={priority} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: color,
                border: '2px solid ' + (theme === 'dark' ? '#fff' : '#1e293b'),
              }} />
              <Text size={200} style={{ textTransform: 'capitalize' }}>{priority}</Text>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SVGMap;

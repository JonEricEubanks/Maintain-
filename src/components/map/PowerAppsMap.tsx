import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Location24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder, Crew, MapState } from '../../types/infrastructure';
import type { Cluster, StaffZone } from '../../services/analyticsService';

// ============================================
// PowerApps-Compatible SVG Map Component
// ============================================
// This map uses pure SVG rendering with NO external dependencies
// Fully compatible with Power Apps CSP restrictions

interface PowerAppsMapProps {
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

// Lake Forest, IL map bounds
const MAP_BOUNDS = {
  minLat: 42.20,
  maxLat: 42.32,
  minLng: -87.92,
  maxLng: -87.76,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#22c55e',
};

const CREW_COLORS: Record<string, string> = {
  available: '#22c55e',
  assigned: '#f59e0b',
  offline: '#6b7280',
};

const PowerAppsMap: React.FC<PowerAppsMapProps> = ({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltipData, setTooltipData] = useState<{ wo: WorkOrder; x: number; y: number } | null>(null);

  const isDark = theme === 'dark';

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Convert lat/lng to SVG coordinates
  const toSvgCoords = useCallback((lat: number, lng: number) => {
    const xRatio = (lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
    const yRatio = 1 - (lat - MAP_BOUNDS.minLat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
    
    const baseX = xRatio * dimensions.width;
    const baseY = yRatio * dimensions.height;
    
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    return {
      x: (baseX - centerX) * zoom + centerX + pan.x,
      y: (baseY - centerY) * zoom + centerY + pan.y,
    };
  }, [dimensions, zoom, pan]);

  // Mouse handlers for panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.min(3, Math.max(0.5, prev + delta)));
  };

  // Zoom controls
  const handleZoomIn = () => setZoom(prev => Math.min(3, prev + 0.2));
  const handleZoomOut = () => setZoom(prev => Math.max(0.5, prev - 0.2));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Work order click handler
  const handleWorkOrderClick = (wo: WorkOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    onWorkOrderSelect(wo.id);
    if (onSelectionChange) {
      if (selectedWorkOrderIds.includes(wo.id)) {
        onSelectionChange(selectedWorkOrderIds.filter(id => id !== wo.id));
      } else {
        onSelectionChange([...selectedWorkOrderIds, wo.id]);
      }
    }
  };

  // Generate grid lines for visual reference
  const gridLines = [];
  const gridSpacing = 60 * zoom;
  
  for (let x = (pan.x % gridSpacing); x < dimensions.width; x += gridSpacing) {
    gridLines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={dimensions.height}
        stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
        strokeWidth={1}
      />
    );
  }
  
  for (let y = (pan.y % gridSpacing); y < dimensions.height; y += gridSpacing) {
    gridLines.push(
      <line
        key={`h-${y}`}
        x1={0}
        y1={y}
        x2={dimensions.width}
        y2={y}
        stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
        strokeWidth={1}
      />
    );
  }

  // Render boundary
  const boundaryTopLeft = toSvgCoords(42.30, -87.90);
  const boundaryBottomRight = toSvgCoords(42.22, -87.78);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg, 12px)',
        background: isDark 
          ? 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)' 
          : 'linear-gradient(180deg, #e8f4f8 0%, #d4e8ed 100%)',
      }}
    >
      {/* SVG Map */}
      <svg
        width={dimensions.width}
        height={dimensions.height}
        style={{
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Defs for gradients and filters */}
        <defs>
          <filter id="marker-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="2" dy="2" stdDeviation="2" floodOpacity="0.3" />
          </filter>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          {/* Priority color gradients */}
          {Object.entries(PRIORITY_COLORS).map(([key, color]) => (
            <radialGradient key={key} id={`gradient-${key}`} cx="30%" cy="30%">
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.7" />
            </radialGradient>
          ))}
        </defs>

        {/* Grid lines */}
        {gridLines}

        {/* City boundary */}
        <rect
          x={boundaryTopLeft.x}
          y={boundaryTopLeft.y}
          width={boundaryBottomRight.x - boundaryTopLeft.x}
          height={boundaryBottomRight.y - boundaryTopLeft.y}
          fill={isDark ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.08)'}
          stroke={isDark ? 'rgba(100, 150, 255, 0.4)' : 'rgba(59, 130, 246, 0.3)'}
          strokeWidth={2}
          strokeDasharray="8 4"
        />

        {/* City label */}
        <text
          x={dimensions.width / 2}
          y={Math.max(boundaryTopLeft.y - 15, 30)}
          textAnchor="middle"
          fill={isDark ? 'rgba(255,255,255,0.9)' : 'rgba(30, 58, 138, 0.9)'}
          fontSize={Math.max(16 * zoom, 14)}
          fontWeight="600"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          Lake Forest, IL
        </text>

        {/* Staff zones */}
        {showStaffZones && staffZones.map(zone => {
          const pos = toSvgCoords(zone.center.lat, zone.center.lng);
          const radius = (zone.radius || 400) / 100 * zoom;
          const zoneColor = zone.priority === 'high' ? '#ef4444' : 
                           zone.priority === 'medium' ? '#f59e0b' : '#22c55e';
          return (
            <g key={zone.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={`${zoneColor}20`}
                stroke={zoneColor}
                strokeWidth={2}
              />
              <text
                x={pos.x}
                y={pos.y + radius + 15}
                textAnchor="middle"
                fill={zoneColor}
                fontSize={12 * zoom}
              >
                {zone.name}
              </text>
            </g>
          );
        })}

        {/* Clusters */}
        {showClusters && clusters.map(cluster => {
          const pos = toSvgCoords(cluster.centroid.lat, cluster.centroid.lng);
          const radius = Math.min(cluster.radius / 50 * zoom, 80);
          const clusterColor = cluster.avgSeverity > 3.5 ? '#ef4444' : 
                              cluster.avgSeverity > 2.5 ? '#f59e0b' : 
                              cluster.avgSeverity > 1.5 ? '#3b82f6' : '#22c55e';
          return (
            <g key={cluster.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius}
                fill={`${clusterColor}30`}
                stroke={clusterColor}
                strokeWidth={2}
                strokeDasharray="4 4"
              />
              <text
                x={pos.x}
                y={pos.y + 5}
                textAnchor="middle"
                fill={isDark ? '#fff' : '#1e293b'}
                fontSize={14 * zoom}
                fontWeight="bold"
              >
                {cluster.workOrders.length}
              </text>
            </g>
          );
        })}

        {/* Work order markers */}
        {workOrders.map(wo => {
          const pos = toSvgCoords(wo.latitude, wo.longitude);
          const isSelected = selectedWorkOrderIds.includes(wo.id);
          const isHovered = hoveredId === wo.id;
          const color = PRIORITY_COLORS[wo.severity] || '#6b7280';
          const baseSize = 10 * zoom;
          const size = baseSize + (isSelected ? 4 : 0) + (isHovered ? 2 : 0);

          return (
            <g
              key={wo.id}
              style={{ cursor: 'pointer' }}
              onClick={(e) => handleWorkOrderClick(wo, e)}
              onMouseEnter={() => {
                setHoveredId(wo.id);
                setTooltipData({ wo, x: pos.x, y: pos.y });
              }}
              onMouseLeave={() => {
                setHoveredId(null);
                setTooltipData(null);
              }}
            >
              {/* Pulse animation for critical/high */}
              {(wo.severity === 'critical' || wo.severity === 'high') && (
                <>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={size + 8}
                    fill="none"
                    stroke={color}
                    strokeWidth={2}
                    opacity={0.3}
                  >
                    <animate
                      attributeName="r"
                      from={size + 4}
                      to={size + 16}
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.4"
                      to="0"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </>
              )}

              {/* Selection ring */}
              {isSelected && (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={size + 5}
                  fill="none"
                  stroke={isDark ? '#fff' : '#1e293b'}
                  strokeWidth={3}
                  strokeDasharray="4 2"
                />
              )}

              {/* Main marker */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={size}
                fill={`url(#gradient-${wo.severity})`}
                stroke={isDark ? '#fff' : '#1e293b'}
                strokeWidth={2}
                filter="url(#marker-shadow)"
              />

              {/* Priority indicator dot */}
              <circle
                cx={pos.x - size * 0.3}
                cy={pos.y - size * 0.3}
                r={size * 0.25}
                fill="rgba(255,255,255,0.5)"
              />
            </g>
          );
        })}

        {/* Crew markers */}
        {crews.map(crew => {
          if (!crew.currentLat || !crew.currentLng) return null;
          const pos = toSvgCoords(crew.currentLat, crew.currentLng);
          const color = CREW_COLORS[crew.status] || CREW_COLORS.offline;
          const size = 14 * zoom;

          return (
            <g key={crew.id}>
              {/* Crew marker (square with rounded corners) */}
              <rect
                x={pos.x - size}
                y={pos.y - size}
                width={size * 2}
                height={size * 2}
                rx={4}
                ry={4}
                fill={color}
                stroke={isDark ? '#fff' : '#1e293b'}
                strokeWidth={2}
                filter="url(#marker-shadow)"
              />
              {/* Crew icon */}
              <text
                x={pos.x}
                y={pos.y + 4}
                textAnchor="middle"
                fill="#fff"
                fontSize={12 * zoom}
              >
                ●
              </text>
              {/* Crew name label */}
              <text
                x={pos.x}
                y={pos.y + size + 14}
                textAnchor="middle"
                fill={isDark ? '#fff' : '#1e293b'}
                fontSize={10 * zoom}
                fontWeight="500"
              >
                {crew.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <div
          style={{
            position: 'absolute',
            left: tooltipData.x + 20,
            top: tooltipData.y - 10,
            background: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            borderRadius: 8,
            padding: '8px 12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            pointerEvents: 'none',
            maxWidth: 250,
          }}
        >
          <div style={{ 
            fontWeight: 600, 
            marginBottom: 4,
            color: isDark ? '#fff' : '#1e293b',
          }}>
            {tooltipData.wo.title}
          </div>
          <div style={{ 
            fontSize: 12, 
            color: isDark ? '#94a3b8' : '#64748b',
            marginBottom: 4,
          }}>
            {tooltipData.wo.address}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge
              appearance="filled"
              style={{
                background: PRIORITY_COLORS[tooltipData.wo.severity],
                color: '#fff',
                textTransform: 'capitalize',
              }}
            >
              {tooltipData.wo.severity}
            </Badge>
            <span style={{ 
              fontSize: 11, 
              color: isDark ? '#64748b' : '#94a3b8',
            }}>
              {tooltipData.wo.issueType}
            </span>
          </div>
        </div>
      )}

      {/* Map Controls */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          background: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderRadius: 8,
          padding: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <Tooltip content="Zoom In" relationship="label">
          <Button
            appearance="subtle"
            icon={<ZoomIn24Regular />}
            onClick={handleZoomIn}
            size="small"
          />
        </Tooltip>
        <Tooltip content="Zoom Out" relationship="label">
          <Button
            appearance="subtle"
            icon={<ZoomOut24Regular />}
            onClick={handleZoomOut}
            size="small"
          />
        </Tooltip>
        <Tooltip content="Reset View" relationship="label">
          <Button
            appearance="subtle"
            icon={<Home24Regular />}
            onClick={handleReset}
            size="small"
          />
        </Tooltip>
      </div>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ 
            width: 10, height: 10, borderRadius: '50%', 
            background: PRIORITY_COLORS.critical 
          }} />
          <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Critical</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ 
            width: 10, height: 10, borderRadius: '50%', 
            background: PRIORITY_COLORS.high 
          }} />
          <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>High</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ 
            width: 10, height: 10, borderRadius: '50%', 
            background: PRIORITY_COLORS.medium 
          }} />
          <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Medium</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ 
            width: 10, height: 10, borderRadius: '50%', 
            background: PRIORITY_COLORS.low 
          }} />
          <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Low</span>
        </div>
      </div>

      {/* Stats overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          background: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)',
          borderRadius: 8,
          padding: '6px 10px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontSize: 11,
          color: isDark ? '#94a3b8' : '#64748b',
        }}
      >
        <Location24Regular style={{ width: 14, height: 14, marginRight: 4, verticalAlign: 'middle' }} />
        {workOrders.length} work orders • {crews.length} crews
      </div>
    </div>
  );
};

export default PowerAppsMap;

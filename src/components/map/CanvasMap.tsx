import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Text,
  Title3,
  Badge,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  Location24Regular,
  ZoomIn24Regular,
  ZoomOut24Regular,
  Home24Regular,
  Info24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder, Crew, MapState } from '../../types/infrastructure';
import type { Cluster, StaffZone } from '../../services/analyticsService';

// ============================================
// Canvas Map Configuration
// ============================================

const CANVAS_CONFIG = {
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
};

// ============================================
// Canvas Map Component (CSP-Safe Fallback)
// ============================================

interface CanvasMapProps {
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
 * CanvasMap - CSP-safe canvas-based map visualization
 * 
 * This component renders work orders and crews using Canvas/SVG
 * without requiring external tile images, making it compatible
 * with Power Apps' Content Security Policy restrictions.
 */
const CanvasMap: React.FC<CanvasMapProps> = ({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(CANVAS_CONFIG.defaultZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [hoveredWorkOrder, setHoveredWorkOrder] = useState<WorkOrder | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<Cluster | null>(null);
  const [clusterPopupPos, setClusterPopupPos] = useState({ x: 0, y: 0 });
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const didPanRef = useRef(false);

  // Priority colors
  const priorityColors: Record<string, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#22c55e',
  };

  // Helper to adjust color brightness
  const adjustColor = (color: string, amount: number): string => {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(0, 2), 16) + amount));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(2, 4), 16) + amount));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(4, 6), 16) + amount));
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Convert lat/lng to canvas coordinates
  const latLngToCanvas = useCallback((lat: number, lng: number) => {
    const { bounds } = CANVAS_CONFIG;
    const xRatio = (lng - bounds.minLng) / (bounds.maxLng - bounds.minLng);
    const yRatio = 1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat);
    
    const baseX = xRatio * dimensions.width;
    const baseY = yRatio * dimensions.height;
    
    // Apply zoom and pan
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    const x = (baseX - centerX) * zoom + centerX + pan.x;
    const y = (baseY - centerY) * zoom + centerY + pan.y;
    
    return { x, y };
  }, [zoom, pan, dimensions]);

  // Convert canvas coordinates to lat/lng
  const canvasToLatLng = useCallback((x: number, y: number) => {
    const { bounds } = CANVAS_CONFIG;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    
    const baseX = (x - pan.x - centerX) / zoom + centerX;
    const baseY = (y - pan.y - centerY) / zoom + centerY;
    
    const xRatio = baseX / dimensions.width;
    const yRatio = baseY / dimensions.height;
    
    const lng = bounds.minLng + xRatio * (bounds.maxLng - bounds.minLng);
    const lat = bounds.maxLat - yRatio * (bounds.maxLat - bounds.minLat);
    
    return { lat, lng };
  }, [zoom, pan, dimensions]);

  // Store drawMap in a ref to avoid animation loop restarts
  const drawMapRef = useRef<() => void>(() => {});

  // Draw the map
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log('CanvasMap: canvas not available');
      return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('CanvasMap: context not available');
      return;
    }

    // Ensure dimensions are valid
    if (dimensions.width <= 0 || dimensions.height <= 0) {
      console.log('CanvasMap: invalid dimensions', dimensions);
      return;
    }

    console.log('CanvasMap: drawing', workOrders.length, 'work orders on', dimensions.width, 'x', dimensions.height);

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, dimensions.height);
    if (theme === 'dark') {
      gradient.addColorStop(0, '#1a1a2e');
      gradient.addColorStop(1, '#16213e');
    } else {
      gradient.addColorStop(0, '#e8f4f8');
      gradient.addColorStop(1, '#d4e8ed');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Draw stylized roads/streets pattern
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(100,140,160,0.15)';
    ctx.lineWidth = 2;
    
    // Main horizontal roads
    const roadSpacing = 80 * zoom;
    for (let y = (pan.y % roadSpacing) + roadSpacing / 2; y < dimensions.height; y += roadSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
    }
    // Main vertical roads
    for (let x = (pan.x % roadSpacing) + roadSpacing / 2; x < dimensions.width; x += roadSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }
    
    // Draw secondary grid (blocks)
    ctx.strokeStyle = theme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(100,140,160,0.08)';
    ctx.lineWidth = 1;
    const blockSize = 40 * zoom;
    for (let x = (pan.x % blockSize); x < dimensions.width; x += blockSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }
    for (let y = (pan.y % blockSize); y < dimensions.height; y += blockSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
    }

    // Draw Lake Forest boundary with fill
    const topLeft = latLngToCanvas(42.30, -87.90);
    const bottomRight = latLngToCanvas(42.22, -87.78);
    const bWidth = bottomRight.x - topLeft.x;
    const bHeight = bottomRight.y - topLeft.y;
    
    // Fill area
    ctx.fillStyle = theme === 'dark' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(59, 130, 246, 0.08)';
    ctx.fillRect(topLeft.x, topLeft.y, bWidth, bHeight);
    
    // Border
    ctx.strokeStyle = theme === 'dark' ? 'rgba(100, 150, 255, 0.4)' : 'rgba(59, 130, 246, 0.3)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(topLeft.x, topLeft.y, bWidth, bHeight);
    ctx.setLineDash([]);

    // Draw "Lake Forest" header label with background
    const labelX = dimensions.width / 2 + pan.x * 0.5;
    const labelY = Math.max(topLeft.y - 20, 40);
    ctx.font = `bold ${Math.max(18 * zoom, 14)}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    const labelText = 'Lake Forest, IL';
    const labelMetrics = ctx.measureText(labelText);
    
    // Label background
    ctx.fillStyle = theme === 'dark' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)';
    ctx.fillRect(labelX - labelMetrics.width / 2 - 12, labelY - 16, labelMetrics.width + 24, 28);
    ctx.strokeStyle = theme === 'dark' ? 'rgba(100,150,255,0.3)' : 'rgba(59,130,246,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(labelX - labelMetrics.width / 2 - 12, labelY - 16, labelMetrics.width + 24, 28);
    
    // Label text
    ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(30, 58, 138, 0.9)';
    ctx.fillText(labelText, labelX, labelY + 4);

    // Draw staff zones (if enabled)
    if (showStaffZones && staffZones.length > 0) {
      staffZones.forEach(zone => {
        const pos = latLngToCanvas(zone.center.lat, zone.center.lng);
        const radiusInPixels = (zone.radius || 400) / 100 * zoom;
        
        const zoneColor = zone.priority === 'high' ? '#ef4444' : 
                          zone.priority === 'medium' ? '#f59e0b' : '#22c55e';
        
        // Draw zone circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radiusInPixels, 0, Math.PI * 2);
        ctx.fillStyle = `${zoneColor}20`;
        ctx.fill();
        ctx.strokeStyle = zoneColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw zone label
        ctx.fillStyle = zoneColor;
        ctx.font = `${12 * zoom}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(zone.name, pos.x, pos.y + radiusInPixels + 15);
      });
    }

    // Draw clusters (if enabled)
    if (showClusters && clusters.length > 0) {
      clusters.forEach(cluster => {
        const pos = latLngToCanvas(cluster.centroid.lat, cluster.centroid.lng);
        const radiusInPixels = Math.min(cluster.radius / 50 * zoom, 80);
        
        const clusterColor = cluster.avgSeverity > 3.5 ? '#ef4444' : 
                            cluster.avgSeverity > 2.5 ? '#f59e0b' : 
                            cluster.avgSeverity > 1.5 ? '#3b82f6' : '#22c55e';
        
        // Draw cluster circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radiusInPixels, 0, Math.PI * 2);
        ctx.fillStyle = `${clusterColor}30`;
        ctx.fill();
        ctx.strokeStyle = clusterColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw selection ring if selected
        const isClusterSelected = selectedCluster?.id === cluster.id;
        const isClusterHovered = hoveredCluster?.id === cluster.id;
        if (isClusterSelected || isClusterHovered) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radiusInPixels + 6, 0, Math.PI * 2);
          ctx.strokeStyle = theme === 'dark' ? '#fff' : '#1e293b';
          ctx.lineWidth = isClusterSelected ? 3 : 2;
          ctx.setLineDash(isClusterSelected ? [6, 3] : []);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Extra glow for selected
          if (isClusterSelected) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radiusInPixels + 10, 0, Math.PI * 2);
            ctx.strokeStyle = `${clusterColor}60`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }

        // Draw cluster count
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${14 * zoom}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${cluster.workOrders.length}`, pos.x, pos.y);
      });
    }

    // Draw work orders with enhanced markers
    const baseMarkerSize = 12 * zoom;
    workOrders.forEach(wo => {
      const pos = latLngToCanvas(wo.latitude, wo.longitude);
      const isSelected = selectedWorkOrderIds.includes(wo.id);
      const isHovered = hoveredWorkOrder?.id === wo.id;
      const color = priorityColors[wo.severity] || '#6b7280';
      const markerSize = baseMarkerSize + (isSelected ? 6 : 0) + (isHovered ? 3 : 0);
      
      // Draw outer glow for critical/high
      if (wo.severity === 'critical' || wo.severity === 'high') {
        const pulseSize = markerSize + 8 + Math.sin(Date.now() / 300) * 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = `${color}20`;
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulseSize + 6, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}30`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Draw marker shadow
      ctx.beginPath();
      ctx.arc(pos.x + 2, pos.y + 2, markerSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();
      
      // Draw marker with gradient
      const markerGradient = ctx.createRadialGradient(pos.x - 3, pos.y - 3, 0, pos.x, pos.y, markerSize);
      markerGradient.addColorStop(0, color);
      markerGradient.addColorStop(1, adjustColor(color, -30));
      
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, markerSize, 0, Math.PI * 2);
      ctx.fillStyle = markerGradient;
      ctx.fill();
      
      // Draw white border
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw inner highlight
      ctx.beginPath();
      ctx.arc(pos.x - 3, pos.y - 3, markerSize * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
      
      // Draw selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, markerSize + 6, 0, Math.PI * 2);
        ctx.strokeStyle = theme === 'dark' ? '#fff' : '#1e293b';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw issue type icon/label for larger markers
      if (zoom > 0.8) {
        const emoji = wo.issueType === 'pothole' ? '○' : 
                      wo.issueType === 'sidewalk' ? '△' : '□';
        ctx.font = `${10 * zoom}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, pos.x, pos.y);
      }
    });

    // Draw crews with enhanced markers
    crews.forEach(crew => {
      if (crew.currentLat && crew.currentLng) {
        const pos = latLngToCanvas(crew.currentLat, crew.currentLng);
        const crewSize = 20 * zoom;
        
        // Draw crew marker shadow
        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, crewSize, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();
        
        // Draw crew marker with gradient
        const crewGradient = ctx.createRadialGradient(pos.x - 4, pos.y - 4, 0, pos.x, pos.y, crewSize);
        crewGradient.addColorStop(0, '#60a5fa');
        crewGradient.addColorStop(1, '#2563eb');
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, crewSize, 0, Math.PI * 2);
        ctx.fillStyle = crewGradient;
        ctx.fill();
        ctx.strokeStyle = theme === 'dark' ? '#fff' : '#1e293b';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw crew emoji
        ctx.font = `${16 * zoom}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('●', pos.x, pos.y);
        
        // Draw crew name label
        if (zoom > 0.7) {
          ctx.font = `bold ${10 * zoom}px system-ui`;
          ctx.fillStyle = theme === 'dark' ? '#fff' : '#1e293b';
          ctx.fillText(crew.name.split(' ')[0], pos.x, pos.y + crewSize + 12);
        }
      }
    });

  }, [workOrders, crews, theme, zoom, pan, dimensions, latLngToCanvas, 
      selectedWorkOrderIds, hoveredWorkOrder, clusters, showClusters, 
      staffZones, showStaffZones, priorityColors, selectedCluster, hoveredCluster]);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const w = Math.floor(rect.width);
        const h = Math.floor(rect.height);
        console.log('CanvasMap dimensions:', w, 'x', h);
        if (w > 0 && h > 0) {
          setDimensions(prev => {
            if (prev.width !== w || prev.height !== h) {
              // Force redraw after state update
              requestAnimationFrame(() => {
                drawMapRef.current();
              });
              return { width: w, height: h };
            }
            return prev;
          });
        }
      }
    };
    
    // Initial update with slight delay to ensure container is rendered
    const timer = setTimeout(updateDimensions, 100);
    // Also try immediately
    requestAnimationFrame(updateDimensions);
    updateDimensions();
    
    // Use ResizeObserver for better dimension tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateDimensions);
    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Keep drawMapRef current
  useEffect(() => {
    drawMapRef.current = drawMap;
  }, [drawMap]);

  // Redraw on state changes (non-animated redraw)
  useEffect(() => {
    drawMap();
  }, [drawMap]);

  // Force initial draw after canvas is mounted
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Multiple attempts to ensure canvas draws
    const attempts = [0, 50, 150, 300, 500];
    const timers = attempts.map(delay => 
      setTimeout(() => {
        console.log(`CanvasMap: forced redraw attempt at ${delay}ms`);
        drawMapRef.current();
      }, delay)
    );
    
    return () => timers.forEach(clearTimeout);
  }, []);

  // Separate animation loop for pulsing effects - only runs if needed
  useEffect(() => {
    const hasAnimatedItems = workOrders.some(wo => wo.severity === 'critical' || wo.severity === 'high');
    if (!hasAnimatedItems) return; // No animation needed
    
    let animFrame: number;
    let lastTime = 0;
    const FRAME_INTERVAL = 500; // ~2fps for very subtle pulsing (minimal CPU usage)
    
    const animate = (time: number) => {
      if (time - lastTime >= FRAME_INTERVAL) {
        drawMapRef.current(); // Use ref to avoid restarts
        lastTime = time;
      }
      animFrame = requestAnimationFrame(animate);
    };
    
    animFrame = requestAnimationFrame(animate);
    
    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [workOrders.length]); // No drawMap dependency - uses ref

  // Handle mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
    didPanRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Check for hovering over clusters first
    let foundClusterHover: Cluster | null = null;
    if (showClusters && clusters.length > 0) {
      for (const cluster of clusters) {
        const pos = latLngToCanvas(cluster.centroid.lat, cluster.centroid.lng);
        const radiusInPixels = Math.min(cluster.radius / 50 * zoom, 80);
        const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
        if (dist < radiusInPixels + 4) {
          foundClusterHover = cluster;
          setTooltipPos({ x: e.clientX, y: e.clientY });
          break;
        }
      }
    }
    setHoveredCluster(foundClusterHover);

    // Check for hovering over work orders
    let foundHover: WorkOrder | null = null;
    const markerSize = 8 * zoom;
    
    for (const wo of workOrders) {
      const pos = latLngToCanvas(wo.latitude, wo.longitude);
      const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
      if (dist < markerSize + 4) {
        foundHover = wo;
        setTooltipPos({ x: e.clientX, y: e.clientY });
        break;
      }
    }
    setHoveredWorkOrder(foundHover);
    
    // Handle panning
    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      // Only count as pan if mouse moved more than 3px from mousedown
      const totalDx = e.clientX - mouseDownPosRef.current.x;
      const totalDy = e.clientY - mouseDownPosRef.current.y;
      if (Math.abs(totalDx) > 3 || Math.abs(totalDy) > 3) {
        didPanRef.current = true;
      }
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Skip click if user was panning (dragged the map)
    if (didPanRef.current) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const markerSize = 8 * zoom;
    
    for (const wo of workOrders) {
      const pos = latLngToCanvas(wo.latitude, wo.longitude);
      const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
      if (dist < markerSize + 4) {
        setSelectedCluster(null);
        onWorkOrderSelect(wo.id);
        return;
      }
    }

    // Check for cluster clicks
    if (showClusters && clusters.length > 0) {
      for (const cluster of clusters) {
        const pos = latLngToCanvas(cluster.centroid.lat, cluster.centroid.lng);
        const radiusInPixels = Math.min(cluster.radius / 50 * zoom, 80);
        const dist = Math.sqrt((mouseX - pos.x) ** 2 + (mouseY - pos.y) ** 2);
        if (dist < radiusInPixels + 4) {
          // Always open (no toggle) — use × button or click elsewhere to close
          setSelectedCluster(cluster);
          setClusterPopupPos({ x: e.clientX, y: e.clientY });
          return;
        }
      }
    }

    // Clicked on empty space
    setSelectedCluster(null);
    onWorkOrderSelect(null);
  };

  // Use native event listener for wheel to allow preventDefault (passive: false)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(prev => Math.max(CANVAS_CONFIG.minZoom, Math.min(CANVAS_CONFIG.maxZoom, prev + delta)));
    };
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, []);

  const handleReset = () => {
    setZoom(CANVAS_CONFIG.defaultZoom);
    setPan({ x: 0, y: 0 });
  };

  const getPriorityLabel = (severity: string) => {
    const labels: Record<string, string> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    };
    return labels[severity] || 'Unknown';
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%',
        minHeight: 400,
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        background: theme === 'dark' ? '#1a1a2e' : '#f8fafc',
        zIndex: 1,
        touchAction: 'none', // Prevent browser zoom/scroll handling
      }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ 
          display: 'block',
          width: dimensions.width > 0 ? dimensions.width : '100%', 
          height: dimensions.height > 0 ? dimensions.height : '100%',
          cursor: isPanning ? 'grabbing' : 'grab',
          background: theme === 'dark' ? '#1a1a2e' : '#f8fafc',
          touchAction: 'none', // Prevent browser handling
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />

      {/* Controls */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 10,
      }}>
        <Tooltip content="Zoom In" relationship="label">
          <Button 
            icon={<ZoomIn24Regular />}
            appearance="subtle"
            onClick={() => setZoom(prev => Math.min(CANVAS_CONFIG.maxZoom, prev + 0.2))}
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--glass-border)',
            }}
          />
        </Tooltip>
        <Tooltip content="Zoom Out" relationship="label">
          <Button 
            icon={<ZoomOut24Regular />}
            appearance="subtle"
            onClick={() => setZoom(prev => Math.max(CANVAS_CONFIG.minZoom, prev - 0.2))}
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--glass-border)',
            }}
          />
        </Tooltip>
        <Tooltip content="Reset View" relationship="label">
          <Button 
            icon={<Home24Regular />}
            appearance="subtle"
            onClick={handleReset}
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--glass-border)',
            }}
          />
        </Tooltip>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        zIndex: 10,
      }}>
        <Text size={200} weight="semibold" style={{ display: 'block', marginBottom: 8 }}>
          Priority Legend
        </Text>
        <div style={{ display: 'flex', gap: 16 }}>
          {Object.entries(priorityColors).map(([priority, color]) => (
            <div key={priority} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: color,
              }} />
              <Text size={100} style={{ textTransform: 'capitalize' }}>{priority}</Text>
            </div>
          ))}
        </div>
      </div>

      {/* Stats overlay */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Location24Regular style={{ color: 'var(--accent-primary)' }} />
          <Text weight="semibold">Lake Forest Infrastructure</Text>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div>
            <Text size={400} weight="bold" style={{ color: 'var(--accent-primary)' }}>
              {workOrders.length}
            </Text>
            <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Work Orders</Text>
          </div>
          <div>
            <Text size={400} weight="bold" style={{ color: '#22c55e' }}>
              {crews.length}
            </Text>
            <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Active Crews</Text>
          </div>
          {showClusters && (
            <div>
              <Text size={400} weight="bold" style={{ color: '#f59e0b' }}>
                {clusters.length}
              </Text>
              <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Clusters</Text>
            </div>
          )}
        </div>
      </div>

      {/* CSP Notice */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--warning-border)',
        borderRadius: 'var(--radius-md)',
        padding: '8px 12px',
        zIndex: 10,
        maxWidth: 200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Info24Regular style={{ color: 'var(--warning-text)', fontSize: 16 }} />
          <Text size={100} weight="semibold" style={{ color: 'var(--warning-text)' }}>
            Simplified View
          </Text>
        </div>
        <Text size={100} style={{ color: 'var(--text-muted)' }}>
          Map tiles blocked by security policy. Using canvas visualization.
        </Text>
      </div>

      {/* Cluster popup */}
      {selectedCluster && (
        <div
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.min(clusterPopupPos.x + 16, window.innerWidth - 340),
            top: Math.min(clusterPopupPos.y - 10, window.innerHeight - 400),
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(16px)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            zIndex: 1000,
            minWidth: 280,
            maxWidth: 320,
            maxHeight: 360,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Title3 style={{ margin: 0, fontSize: 16 }}>Cluster #{selectedCluster.id}</Title3>
            <Button
              appearance="subtle"
              size="small"
              onClick={() => setSelectedCluster(null)}
              style={{ minWidth: 'auto', padding: '2px 6px' }}
            >
              ✕
            </Button>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center', flex: '1 0 60px' }}>
              <Text size={400} weight="bold" style={{ color: 'var(--accent-primary)', display: 'block' }}>
                {selectedCluster.workOrders.length}
              </Text>
              <Text size={100} style={{ color: 'var(--text-muted)' }}>Work Orders</Text>
            </div>
            <div style={{ textAlign: 'center', flex: '1 0 60px' }}>
              <Badge
                color={selectedCluster.avgSeverity > 3.5 ? 'danger' :
                       selectedCluster.avgSeverity > 2.5 ? 'warning' :
                       selectedCluster.avgSeverity > 1.5 ? 'informative' : 'success'}
              >
                Avg Severity: {selectedCluster.avgSeverity.toFixed(1)}
              </Badge>
            </div>
            <div style={{ textAlign: 'center', flex: '1 0 60px' }}>
              <Text size={400} weight="bold" style={{ color: '#22c55e', display: 'block' }}>
                ${selectedCluster.totalCost.toLocaleString()}
              </Text>
              <Text size={100} style={{ color: 'var(--text-muted)' }}>Est. Cost</Text>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <Text size={200} weight="semibold" style={{ display: 'block', marginBottom: 4 }}>
              Primary Issue: {selectedCluster.dominantType.charAt(0).toUpperCase() + selectedCluster.dominantType.slice(1)}
            </Text>
          </div>
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 8 }}>
            <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>
              Work Orders in Cluster:
            </Text>
            {selectedCluster.workOrders.slice(0, 8).map(wo => (
              <div
                key={wo.id}
                onClick={() => { onWorkOrderSelect(wo.id); setSelectedCluster(null); }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 8px',
                  marginBottom: 2,
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-border)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: priorityColors[wo.severity] || '#6b7280',
                  }} />
                  <Text size={200}>{wo.id}</Text>
                </div>
                <Text size={100} style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                  {wo.issueType}
                </Text>
              </div>
            ))}
            {selectedCluster.workOrders.length > 8 && (
              <Text size={100} style={{ color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', marginTop: 4 }}>
                +{selectedCluster.workOrders.length - 8} more...
              </Text>
            )}
          </div>
          {onSelectionChange && (
            <Button
              appearance="primary"
              size="small"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                onSelectionChange(selectedCluster.workOrders.map(wo => wo.id));
                setSelectedCluster(null);
              }}
            >
              Select All {selectedCluster.workOrders.length} Work Orders
            </Button>
          )}
        </div>
      )}

      {/* Cluster hover tooltip */}
      {hoveredCluster && !selectedCluster && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x + 16,
          top: tooltipPos.y - 10,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
          zIndex: 1000,
          pointerEvents: 'none',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <Text weight="semibold" style={{ display: 'block' }}>
            Cluster #{hoveredCluster.id} — {hoveredCluster.workOrders.length} work orders
          </Text>
          <Text size={100} style={{ color: 'var(--text-muted)' }}>
            Click to view details
          </Text>
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredWorkOrder && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x + 16,
          top: tooltipPos.y - 10,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          zIndex: 1000,
          pointerEvents: 'none',
          maxWidth: 280,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text weight="semibold">{hoveredWorkOrder.id}</Text>
            <Badge 
              color={hoveredWorkOrder.severity === 'critical' ? 'danger' : 
                     hoveredWorkOrder.severity === 'high' ? 'warning' : 
                     hoveredWorkOrder.severity === 'medium' ? 'informative' : 'success'}
            >
              {getPriorityLabel(hoveredWorkOrder.severity)}
            </Badge>
          </div>
          <Text size={200} style={{ display: 'block', marginBottom: 4 }}>
            {hoveredWorkOrder.issueType.charAt(0).toUpperCase() + hoveredWorkOrder.issueType.slice(1)}
          </Text>
          <Text size={100} style={{ color: 'var(--text-muted)' }}>
            {hoveredWorkOrder.address}
          </Text>
          <Text size={100} style={{ color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
            Click to select
          </Text>
        </div>
      )}
    </div>
  );
};

export default CanvasMap;

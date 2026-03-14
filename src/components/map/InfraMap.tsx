import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, CircleMarker, useMapEvents, Polyline, Polygon } from 'react-leaflet';
import L from 'leaflet';
import {
  Text,
  Title3,
  Caption1,
  Badge,
  Button,
  Card,
  CardHeader,
  Popover,
  PopoverTrigger,
  PopoverSurface,
  Tooltip,
} from '@fluentui/react-components';
import {
  Location24Regular,
  Navigation24Regular,
  Warning24Regular,
  Home24Regular,
  Add24Regular,
  Subtract24Regular,
  Map24Regular,
  Question24Regular,
  SelectAllOn24Regular,
  Dismiss24Regular,
  Target24Regular,
  Circle24Regular,
  ArrowRouting24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder, Crew, MapState } from '../../types/infrastructure';
import type { Cluster, StaffZone, PredictiveHotspot } from '../../services/analyticsService';
import { calculateRepairCost, getPricingConfig } from '../../services/pricingService';
import type { DecayedWorkOrder } from '../../services/decaySimulationService';
import type { School } from '../../services/mcpService';
import { 
  createBuffer, 
  findNearestWorkOrder, 
  findKNearestWorkOrders,
  optimizeRoute,
  type BufferResult,
  type NearestResult
} from '../../services/mapToolsService';

// Fix Leaflet default icon issue with bundlers
// Use inline SVG data URIs to avoid CSP violations in Power Apps
const markerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41"><path d="M12.5 0C5.6 0 0 5.6 0 12.5 0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="%232196F3" stroke="%23fff" stroke-width="1.5"/><circle cx="12.5" cy="12.5" r="5" fill="%23fff"/></svg>`;
const shadowSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 41 41"><ellipse cx="14" cy="38" rx="14" ry="3" fill="rgba(0,0,0,0.2)"/></svg>`;
const DefaultIcon = L.icon({
  iconUrl: `data:image/svg+xml,${markerSvg}`,
  shadowUrl: `data:image/svg+xml,${shadowSvg}`,
  iconRetinaUrl: `data:image/svg+xml,${markerSvg}`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// ============================================
// Map Configuration
// ============================================

const MAP_CONFIG = {
  // Lake Forest, IL center coordinates
  center: [42.2586, -87.8407] as [number, number],
  defaultZoom: 13,
  minZoom: 11,
  maxZoom: 18,
  // Map tile layers for different themes
  darkTileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  lightTileUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

// ArcGIS MapServer overlay URLs (Lake County, IL)
const ARCGIS_LAYERS = {
  parcels: {
    baseUrl: 'https://maps.lakecountyil.gov/arcgis/rest/services/GISMapping/WABParcels/MapServer',
    layers: 'show:11',  // Tax Parcel Lines
    label: 'Parcels',
    opacity: 0.6,
  },
  zoning: {
    baseUrl: 'https://maps.lakecountyil.gov/arcgis/rest/services/GISMapping/WABBoundaries/MapServer',
    layers: 'show:1', // Municipalities only
    layerDefs: '1:NAME = \'City of Lake Forest\'', // Filter to Lake Forest only
    label: 'Boundaries',
    opacity: 0.45,
  },
};

// ============================================
// ArcGIS Dynamic Map Layer (renders server-side tiles)
// ============================================

const ArcGISDynamicLayer: React.FC<{
  url: string;
  layers: string;
  opacity: number;
  visible: boolean;
  layerDefs?: string;
}> = ({ url, layers, opacity, visible, layerDefs }) => {
  const map = useMap();
  const layerRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!visible) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    // Build optional query params
    const defsParam = layerDefs ? `&layerDefs=${encodeURIComponent(layerDefs)}` : '';

    // Create ArcGIS export-based tile layer
    const tileLayer = L.tileLayer(
      `${url}/export?dpi=96&transparent=true&format=png32&layers=${layers}${defsParam}&bbox={xmin},{ymin},{xmax},{ymax}&bboxSR=4326&imageSR=4326&size=256,256&f=image`,
      {
        opacity,
        maxZoom: 19,
        attribution: '&copy; Lake County, IL GIS',
        // Override getTileUrl to compute bbox from tile coordinates
      }
    );

    // Override getTileUrl to convert tile coords → bbox
    (tileLayer as any).getTileUrl = function (coords: any) {
      const m = this._map;
      const ts = this.getTileSize();
      const nwPoint = L.point(coords.x * ts.x, coords.y * ts.y);
      const sePoint = L.point(nwPoint.x + ts.x, nwPoint.y + ts.y);
      const nw = m.unproject(nwPoint, coords.z);
      const se = m.unproject(sePoint, coords.z);
      const bbox = `${nw.lng},${se.lat},${se.lng},${nw.lat}`;
      return `${url}/export?dpi=96&transparent=true&format=png32&layers=${layers}${defsParam}&bbox=${bbox}&bboxSR=4326&imageSR=4326&size=${ts.x},${ts.y}&f=image`;
    };

    tileLayer.addTo(map);
    layerRef.current = tileLayer;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [visible, url, layers, opacity, map, layerDefs]);

  // Update opacity dynamically
  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setOpacity(opacity);
    }
  }, [opacity]);

  return null;
};

// ============================================
// Custom Marker Icons (with cache to avoid DOM thrashing)
// ============================================

const iconCache = new Map<string, L.DivIcon>();

const createPriorityIcon = (priority: string, isAnimated: boolean = false, isSelected: boolean = false) => {
  const cacheKey = `${priority}-${isAnimated}-${isSelected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;
  const colors: Record<string, string> = {
    critical: '#f85149',
    high: '#f0883e',
    medium: '#d29922',
    low: '#3fb950',
  };

  const color = colors[priority] || colors.medium;
  const pulseClass = isAnimated ? 'pulse-marker' : '';
  const selectedStyles = isSelected
    ? 'box-shadow: 0 0 0 4px rgba(88, 166, 255, 0.6), 0 2px 8px rgba(0,0,0,0.4); transform: scale(1.2);'
    : 'box-shadow: 0 2px 8px rgba(0,0,0,0.4);';

  const icon = L.divIcon({
    className: `custom-marker ${pulseClass}`,
    html: `
      <div style="
        position: relative;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
      ">
        <div style="
          width: 28px;
          height: 28px;
          background: ${color};
          border: 3px solid ${isSelected ? '#58a6ff' : 'white'};
          border-radius: 50%;
          ${selectedStyles}
          ${isAnimated && !isSelected ? 'animation: pulse 2s ease-in-out infinite;' : ''}
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          pointer-events: auto;
        "></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
  iconCache.set(cacheKey, icon);
  return icon;
};

let crewIconCached: L.DivIcon | null = null;

const createCrewIcon = () => {
  if (crewIconCached) return crewIconCached;
  crewIconCached = L.divIcon({
    className: 'crew-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: #58a6ff;
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        font-size: 16px;
      ">●</div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
  return crewIconCached;
};

// ============================================
// Map Bounds Controller
// ============================================

interface MapControllerProps {
  workOrders: WorkOrder[];
  selectedWorkOrderId: string | null;
  markerRefs: React.MutableRefObject<Map<string, L.Marker>>;
}

const MapController: React.FC<MapControllerProps> = ({ workOrders, selectedWorkOrderId, markerRefs }) => {
  const map = useMap();

  // Keep tiles fresh when container resizes (e.g. side panel open/close)
  useEffect(() => {
    const container = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [map]);

  useEffect(() => {
    if (selectedWorkOrderId) {
      const selected = workOrders.find(wo => wo.id === selectedWorkOrderId);
      if (selected) {
        map.flyTo([selected.latitude, selected.longitude], 16, {
          duration: 0.5,
        });
        // After fly animation completes, auto-open the marker popup
        const timer = setTimeout(() => {
          const marker = markerRefs.current.get(selectedWorkOrderId);
          if (marker) {
            marker.openPopup();
          }
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [selectedWorkOrderId, workOrders, map, markerRefs]);

  return null;
};

// ============================================
// Lasso Handler Component
// ============================================

interface LassoHandlerProps {
  enabled: boolean;
  isDrawing: boolean;
  onDrawingStart: () => void;
  onAddPoint: (lat: number, lng: number) => void;
  onDrawingEnd: () => void;
}

const LassoHandler: React.FC<LassoHandlerProps> = ({
  enabled,
  isDrawing,
  onDrawingStart,
  onAddPoint,
  onDrawingEnd,
}) => {
  const map = useMap();

  useMapEvents({
    mousedown: (e) => {
      if (enabled && !isDrawing) {
        map.dragging.disable();
        onDrawingStart();
        onAddPoint(e.latlng.lat, e.latlng.lng);
      }
    },
    mousemove: (e) => {
      if (enabled && isDrawing) {
        onAddPoint(e.latlng.lat, e.latlng.lng);
      }
    },
    mouseup: () => {
      if (enabled && isDrawing) {
        map.dragging.enable();
        onDrawingEnd();
      }
    },
  });

  // Change cursor when lasso mode is enabled
  useEffect(() => {
    const container = map.getContainer();
    if (enabled) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => {
      container.style.cursor = '';
    };
  }, [enabled, map]);

  return null;
};

// ============================================
// Map Tool Click Handler
// ============================================

interface MapToolHandlerProps {
  bufferEnabled: boolean;
  nearestEnabled: boolean;
  onBufferClick: (lat: number, lng: number) => void;
  onNearestClick: (lat: number, lng: number) => void;
}

const MapToolHandler: React.FC<MapToolHandlerProps> = ({
  bufferEnabled,
  nearestEnabled,
  onBufferClick,
  onNearestClick,
}) => {
  const map = useMap();

  useMapEvents({
    click: (e) => {
      // Skip if the click originated from a marker, popup, or SVG overlay (hex polygons)
      const target = (e.originalEvent?.target as HTMLElement);
      if (target?.closest?.('.leaflet-marker-icon, .leaflet-marker-pane, .leaflet-popup, .leaflet-overlay-pane, .hexbin-cell')) return;
      if ((target as any)?.tagName === 'path' || (target as any)?.tagName === 'circle') return;
      console.log('[MapToolHandler] map click detected', { bufferEnabled, nearestEnabled, latlng: e.latlng });
      if (bufferEnabled) {
        onBufferClick(e.latlng.lat, e.latlng.lng);
      } else if (nearestEnabled) {
        onNearestClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  // Change cursor when tool is enabled
  useEffect(() => {
    const container = map.getContainer();
    if (bufferEnabled) {
      container.style.cursor = 'crosshair';
    } else if (nearestEnabled) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => {
      container.style.cursor = '';
    };
  }, [bufferEnabled, nearestEnabled, map]);

  return null;
};

// ============================================
// Parcel Identify Handler (click when parcels visible)
// ============================================

const ParcelClickHandler: React.FC<{
  parcelsVisible: boolean;
  bufferEnabled: boolean;
  nearestEnabled: boolean;
  onIdentify: (lat: number, lng: number) => void;
}> = ({ parcelsVisible, bufferEnabled, nearestEnabled, onIdentify }) => {
  useMapEvents({
    click: (e) => {
      // Skip if the click originated from a marker, popup, or SVG overlay (hex polygons)
      const target = (e.originalEvent?.target as HTMLElement);
      if (target?.closest?.('.leaflet-marker-icon, .leaflet-marker-pane, .leaflet-popup, .leaflet-overlay-pane, .hexbin-cell')) return;
      if ((target as any)?.tagName === 'path' || (target as any)?.tagName === 'circle') return;
      console.log('[ParcelClickHandler] map click detected', { parcelsVisible, bufferEnabled, nearestEnabled, latlng: e.latlng });
      if (parcelsVisible && !bufferEnabled && !nearestEnabled) {
        onIdentify(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

// ============================================
// Focus + Auto-Open Popup Support
// ============================================

export interface FocusedLocation {
  lat: number;
  lng: number;
  zoom?: number;
  /** Unique key so repeat clicks on the same location still trigger */
  key: number;
}

/** Flies the map to the focused location and opens the nearest Circle popup */
const MapFocusSync: React.FC<{
  focused: FocusedLocation | null;
  circleRefs: React.MutableRefObject<Map<string, L.Circle>>;
}> = ({ focused, circleRefs }) => {
  const map = useMap();

  useEffect(() => {
    if (!focused) return;

    // Close ALL open popups first — prevents auto-pan fights
    map.closePopup();
    map.eachLayer((layer: any) => {
      if (layer.closePopup) layer.closePopup();
    });

    map.flyTo([focused.lat, focused.lng], focused.zoom || 15, { duration: 1.0 });

    // After fly animation completes, open the closest circle popup
    const timer = setTimeout(() => {
      let bestKey = '';
      let bestDist = Infinity;
      circleRefs.current.forEach((circle, key) => {
        const c = circle.getLatLng();
        const d = Math.abs(c.lat - focused.lat) + Math.abs(c.lng - focused.lng);
        if (d < bestDist) { bestDist = d; bestKey = key; }
      });
      if (bestKey && bestDist < 0.01) {
        const circle = circleRefs.current.get(bestKey);
        if (circle) circle.openPopup();
      }
    }, 1100);

    return () => clearTimeout(timer);
  }, [focused, map, circleRefs]);

  return null;
};

// ============================================
// Map Pane Setup — Z-order for Rings vs Markers
// ============================================

/**
 * Creates custom Leaflet panes to enforce layer ordering:
 * - ringOverlayPane (z=350): heatmap rings, cluster circles, staff zones, school zones
 * - workOrderPane (z=650): work order markers (potholes, sidewalks) — ALWAYS on top
 *
 * This ensures work order points are always clickable regardless of rings underneath.
 */
const MapPaneSetup: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('ringOverlayPane')) {
      const pane = map.createPane('ringOverlayPane');
      pane.style.zIndex = '350';
    }
    if (!map.getPane('workOrderPane')) {
      const pane = map.createPane('workOrderPane');
      pane.style.zIndex = '650';
    }
    if (!map.getPane('hexbinPane')) {
      const pane = map.createPane('hexbinPane');
      pane.style.zIndex = '300';
      pane.style.willChange = 'transform';
    }
  }, [map]);
  return null;
};

/** Fits the map to the Lake Forest boundary on initial load */
const FitBoundaryOnLoad: React.FC<{ boundary: Array<[number, number]> }> = ({ boundary }) => {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!fittedRef.current && boundary.length > 3) {
      fittedRef.current = true;
      const bounds = L.latLngBounds(boundary.map(([lat, lng]) => L.latLng(lat, lng)));
      // Slight delay so the map container is fully sized
      setTimeout(() => {
        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });
      }, 100);
    }
  }, [boundary, map]);

  return null;
};

// ============================================
// Hexagonal Binning Layer
// ============================================

/**
 * Hexagonal Binning Layer — renders work orders as hexagonal bins
 * with teal/cyan color gradient based on density/severity.
 * 
 * Features:
 * - Zoom-dependent resolution (larger hexes at low zoom, smaller at high zoom)
 * - Smooth color gradients (dark gray → teal → bright cyan)
 * - Count display inside hexagons
 * - Aggregation on zoom out, distribution on zoom in
 * - Interactive hexagon click for details popup
 */

/** Ray-casting point-in-polygon test */
const pointInPolygon = (lat: number, lng: number, polygon: Array<[number, number]>): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** Check if ANY vertex of a hex is inside the polygon */
const hexOverlapsBoundary = (centerLat: number, centerLng: number, hexSize: number, boundary: Array<[number, number]>): boolean => {
  // Check center
  if (pointInPolygon(centerLat, centerLng, boundary)) return true;
  // Check vertices
  const verts = getHexVerticesForClip(centerLat, centerLng, hexSize);
  return verts.some(v => pointInPolygon(v[0], v[1], boundary));
};

/** Quick hex vertices without full function to avoid forward reference issues */
const getHexVerticesForClip = (cLat: number, cLng: number, hSize: number): Array<[number, number]> => {
  const s = Math.cos((cLat * Math.PI) / 180);
  const v: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i);
    v.push([cLat + hSize * Math.sin(a), cLng + (hSize * Math.cos(a)) / s]);
  }
  return v;
};

// Hex color palette — teal/cyan gradient matching
const HEX_COLORS = {
  empty: 'rgba(45, 55, 72, 0.3)',
  gradient: [
    '#1a3a3a',   // Very low — dark teal
    '#1e5555',   // Low — muted teal
    '#1f7a7a',   // Low-medium
    '#20a0a0',   // Medium — teal
    '#22c5c5',   // Medium-high
    '#2dd4bf',   // High — bright teal
    '#34ebd4',   // Very high — bright cyan
    '#5eead4',   // Peak — light cyan
    '#00ffcc',   // Max — vivid cyan
  ],
  stroke: 'rgba(0, 255, 204, 0.25)',
  strokeHover: 'rgba(0, 255, 204, 0.7)',
};

interface HexCell {
  hexKey: string;
  centerLat: number;
  centerLng: number;
  count: number;
  workOrders: WorkOrder[];
  maxSeverity: number;
  avgSeverity: number;
  totalCost: number;
  types: Record<string, number>;
  criticalCount: number;
  highCount: number;
  medCount: number;
  lowCount: number;
  nearSchoolCount: number;
  intensity: number;
  color: string;
}

// Reference point for hex coordinate normalization (Lake Forest center)
const HEX_REF_LAT = 42.26;
const HEX_REF_LNG = -87.84;
const HEX_LNG_SCALE = Math.cos((HEX_REF_LAT * Math.PI) / 180);

/** Convert lat/lng to hex grid axial coordinates */
const latLngToHex = (lat: number, lng: number, hexSize: number): { q: number; r: number } => {
  // Normalize to local Cartesian coordinates centered on Lake Forest
  const x = (lng - HEX_REF_LNG) * HEX_LNG_SCALE;
  const y = lat - HEX_REF_LAT;
  
  // Flat-top hex: pixel → axial
  const q = ((2 / 3) * x) / hexSize;
  const r = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / hexSize;
  
  // Cube-coordinate rounding to nearest hex cell
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - (-q - r));
  
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  
  return { q: rq, r: rr };
};

/** Convert hex axial coordinates back to lat/lng */
const hexToLatLng = (q: number, r: number, hexSize: number): { lat: number; lng: number } => {
  // Reverse flat-top hex: axial → pixel, then unnormalize
  const x = (3 / 2) * q * hexSize;
  const y = Math.sqrt(3) * (r + q / 2) * hexSize;
  const lat = y + HEX_REF_LAT;
  const lng = x / HEX_LNG_SCALE + HEX_REF_LNG;
  return { lat, lng };
};

/** Get hex polygon vertices in lat/lng for a flat-top hexagon */
const getHexVertices = (centerLat: number, centerLng: number, hexSize: number): Array<[number, number]> => {
  const lngScale = Math.cos((centerLat * Math.PI) / 180);
  const vertices: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i;
    const angleRad = (Math.PI / 180) * angleDeg;
    const lat = centerLat + hexSize * Math.sin(angleRad);
    const lng = centerLng + (hexSize * Math.cos(angleRad)) / lngScale;
    vertices.push([lat, lng]);
  }
  return vertices;
};

/** Get hex size based on zoom level for adaptive resolution */
const getHexSizeForZoom = (zoom: number): number => {
  if (zoom >= 17) return 0.00025;
  if (zoom >= 16) return 0.0004;
  if (zoom >= 15) return 0.0007;
  if (zoom >= 14) return 0.0012;
  if (zoom >= 13) return 0.002;   // Default
  if (zoom >= 12) return 0.0035;
  if (zoom >= 11) return 0.006;
  return 0.009;
};

const HexBinLayer: React.FC<{
  workOrders: WorkOrder[];
  visible: boolean;
  theme: 'light' | 'dark';
  boundary?: Array<[number, number]>;
  onWorkOrderSelect?: (id: string | null) => void;
}> = ({ workOrders, visible, theme, boundary, onWorkOrderSelect }) => {
  const map = useMap();
  const svgRef = useRef<L.SVG | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onWorkOrderSelectRef = useRef(onWorkOrderSelect);
  onWorkOrderSelectRef.current = onWorkOrderSelect;
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());
  const tooltipRef = useRef<L.Tooltip | null>(null);

  // Track zoom changes
  useMapEvents({
    zoomend: () => {
      setCurrentZoom(map.getZoom());
    },
  });

  // Compute hex cells based on current zoom, filling entire boundary
  const hexCells = useMemo<HexCell[]>(() => {
    if (!visible) return [];
    
    const hexSize = getHexSizeForZoom(currentZoom);
    const hasBoundary = boundary && boundary.length > 3;

    // Build a lookup of work order counts per hex key
    const cellMap = new Map<string, {
      q: number; r: number;
      workOrders: WorkOrder[];
      totalSev: number;
      maxSev: number;
      totalCost: number;
      types: Record<string, number>;
      criticalCount: number;
      highCount: number;
      medCount: number;
      lowCount: number;
      nearSchoolCount: number;
    }>();

    workOrders.filter(wo => wo.latitude != null && wo.longitude != null && isFinite(wo.latitude) && isFinite(wo.longitude)).forEach(wo => {
      const { q, r } = latLngToHex(wo.latitude, wo.longitude, hexSize);
      const key = `${q},${r}`;
      const sev = wo.severity === 'critical' ? 4 : wo.severity === 'high' ? 3 : wo.severity === 'medium' ? 2 : 1;
      
      const existing = cellMap.get(key);
      if (existing) {
        existing.workOrders.push(wo);
        existing.totalSev += sev;
        existing.maxSev = Math.max(existing.maxSev, sev);
        existing.totalCost += wo.estimatedCost;
        existing.types[wo.issueType] = (existing.types[wo.issueType] || 0) + 1;
        if (wo.severity === 'critical') existing.criticalCount++;
        else if (wo.severity === 'high') existing.highCount++;
        else if (wo.severity === 'medium') existing.medCount++;
        else existing.lowCount++;
        if (wo.nearSchool) existing.nearSchoolCount++;
      } else {
        cellMap.set(key, {
          q, r,
          workOrders: [wo],
          totalSev: sev,
          maxSev: sev,
          totalCost: wo.estimatedCost,
          types: { [wo.issueType]: 1 },
          criticalCount: wo.severity === 'critical' ? 1 : 0,
          highCount: wo.severity === 'high' ? 1 : 0,
          medCount: wo.severity === 'medium' ? 1 : 0,
          lowCount: wo.severity === 'low' ? 1 : 0,
          nearSchoolCount: wo.nearSchool ? 1 : 0,
        });
      }
    });

    const maxCount = Math.max(...Array.from(cellMap.values()).map(c => c.workOrders.length), 1);

    // Generate a full hex grid covering the boundary bounding box
    const allHexKeys = new Set<string>();

    if (hasBoundary) {
      // Compute boundary bounding box
      let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (const [lat, lng] of boundary!) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
      }
      // Add padding
      minLat -= hexSize * 2; maxLat += hexSize * 2;
      minLng -= hexSize * 2; maxLng += hexSize * 2;

      // Step through grid in lat/lng increments — use fine steps to ensure every hex cell is hit
      const latStep = hexSize * Math.sqrt(3) * 0.4;
      const lngStep = hexSize * 1.2 / HEX_LNG_SCALE;

      for (let lat = minLat; lat <= maxLat; lat += latStep) {
        for (let lng = minLng; lng <= maxLng; lng += lngStep) {
          const { q, r } = latLngToHex(lat, lng, hexSize);
          allHexKeys.add(`${q},${r}`);
        }
      }
    }

    // Also ensure all data-populated keys are included
    for (const key of cellMap.keys()) {
      allHexKeys.add(key);
    }

    // If no boundary and no data, nothing to show
    if (allHexKeys.size === 0) return [];

    const results: HexCell[] = [];

    for (const key of allHexKeys) {
      const parts = key.split(',');
      const q = parseInt(parts[0]);
      const r = parseInt(parts[1]);
      const center = hexToLatLng(q, r, hexSize);

      // Clip to boundary — center must be inside polygon
      if (hasBoundary && !pointInPolygon(center.lat, center.lng, boundary!)) {
        continue;
      }

      const cell = cellMap.get(key);

      if (cell) {
        // Populated hex
        const count = cell.workOrders.length;
        const avgSev = cell.totalSev / count;
        const densityNorm = count / maxCount;
        const sevNorm = avgSev / 4;
        const intensity = densityNorm * 0.6 + sevNorm * 0.4;
        const colorIdx = Math.min(Math.floor(intensity * (HEX_COLORS.gradient.length - 1)), HEX_COLORS.gradient.length - 1);
        const color = HEX_COLORS.gradient[colorIdx];

        results.push({
          hexKey: key,
          centerLat: center.lat,
          centerLng: center.lng,
          count,
          workOrders: cell.workOrders,
          maxSeverity: cell.maxSev,
          avgSeverity: avgSev,
          totalCost: cell.totalCost,
          types: cell.types,
          criticalCount: cell.criticalCount,
          highCount: cell.highCount,
          medCount: cell.medCount,
          lowCount: cell.lowCount,
          nearSchoolCount: cell.nearSchoolCount,
          intensity,
          color,
        });
      } else {
        // Empty hex — no work orders, faint appearance
        results.push({
          hexKey: key,
          centerLat: center.lat,
          centerLng: center.lng,
          count: 0,
          workOrders: [],
          maxSeverity: 0,
          avgSeverity: 0,
          totalCost: 0,
          types: {},
          criticalCount: 0,
          highCount: 0,
          medCount: 0,
          lowCount: 0,
          nearSchoolCount: 0,
          intensity: 0,
          color: HEX_COLORS.empty,
        });
      }
    }

    return results;
  }, [workOrders, visible, currentZoom, boundary]);

  // Render hexagons as Leaflet polygon layers
  useEffect(() => {
    if (!visible) {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
      return;
    }

    // Remove previous group
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    const hexSize = getHexSizeForZoom(currentZoom);
    const group = L.layerGroup();

    hexCells.forEach(cell => {
      const vertices = getHexVertices(cell.centerLat, cell.centerLng, hexSize);

      if (cell.count === 0) {
        // Empty hex — faint outline only, no tooltip/popup
        const emptyPoly = L.polygon(vertices, {
          color: theme === 'dark' ? 'rgba(45, 212, 191, 0.18)' : 'rgba(20, 184, 166, 0.15)',
          fillColor: theme === 'dark' ? 'rgba(45, 212, 191, 0.08)' : 'rgba(20, 184, 166, 0.06)',
          fillOpacity: 1,
          weight: 0.8,
          opacity: 0.5,
          className: 'hexbin-cell hexbin-empty',
          pane: 'hexbinPane',
          interactive: false,
        });
        group.addLayer(emptyPoly);
        return;
      }

      const fillOpacity = 0.25 + cell.intensity * 0.55;
      
      const polygon = L.polygon(vertices, {
        color: cell.intensity > 0.6 ? 'rgba(0, 255, 204, 0.5)' : HEX_COLORS.stroke,
        fillColor: cell.color,
        fillOpacity,
        weight: 1.5,
        opacity: 0.6,
        className: 'hexbin-cell',
        pane: 'hexbinPane',
      });

      // Tooltip — just the number, no label
      polygon.bindTooltip(
        `<span style="font-size: 14px; font-weight: 900; color: #ffffff; text-shadow: 0 0 4px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.9), 0 0 8px ${cell.color}; letter-spacing: 0.5px;">${cell.count}</span>`,
        {
          permanent: cell.count > 0,
          direction: 'center',
          className: 'hexbin-tooltip',
          opacity: 1,
        }
      );

      // Build popup content
      const costStr = cell.totalCost >= 1000 ? `$${(cell.totalCost / 1000).toFixed(1)}k` : `$${cell.totalCost}`;
      const topType = Object.entries(cell.types).sort((a, b) => b[1] - a[1])[0];
      const riskLabel = cell.intensity > 0.7 ? 'Critical Hotspot' : cell.intensity > 0.5 ? 'High Density' : cell.intensity > 0.3 ? 'Moderate' : 'Low Activity';
      const riskColor = cell.intensity > 0.7 ? '#00ffcc' : cell.intensity > 0.5 ? '#2dd4bf' : cell.intensity > 0.3 ? '#20a0a0' : '#1e5555';
      
      const bgColor = theme === 'light' ? '#ffffff' : '#0f172a';
      const textColor = theme === 'light' ? '#1f2328' : '#e2e8f0';
      const mutedColor = theme === 'light' ? '#64748b' : '#94a3b8';
      const cardBg = theme === 'light' ? '#f8fafc' : '#1e293b';

      const popupHtml = `
        <div style="width: 270px; background: ${bgColor}; border-radius: 12px; overflow: hidden; color: ${textColor}; font-family: system-ui, -apple-system, sans-serif; border: 1px solid ${cell.color}33;">
          <div style="background: linear-gradient(135deg, ${cell.color}40, ${cell.color}15); padding: 12px 14px; border-bottom: 2px solid ${cell.color};">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 40px; height: 40px; border-radius: 10px; background: ${cell.color}30; border: 2px solid ${cell.color}; display: flex; align-items: center; justify-content: center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L21 7.5V16.5L12 22L3 16.5V7.5L12 2Z" fill="${cell.color}" fill-opacity="0.4" stroke="${cell.color}" stroke-width="1.5"/>
                </svg>
              </div>
              <div style="flex: 1;">
                <div style="font-size: 15px; font-weight: 700;">Hex Bin Zone</div>
                <div style="color: ${riskColor}; font-size: 11px; font-weight: 600;">${riskLabel}</div>
              </div>
              <div style="font-size: 24px; font-weight: 800; color: ${cell.color};">${cell.count}</div>
            </div>
          </div>
          <div style="padding: 12px 14px;">
            <div style="display: flex; gap: 6px; margin-bottom: 10px;">
              <div style="flex: 1; border-radius: 8px; padding: 8px 6px; text-align: center; background: ${cardBg};">
                <div style="font-size: 18px; font-weight: 700; color: ${cell.color};">${cell.count}</div>
                <div style="font-size: 8px; color: ${mutedColor}; text-transform: uppercase;">Issues</div>
              </div>
              <div style="flex: 1; border-radius: 8px; padding: 8px 6px; text-align: center; background: ${cardBg};">
                <div style="font-size: 18px; font-weight: 700; color: #2dd4bf;">${costStr}</div>
                <div style="font-size: 8px; color: ${mutedColor}; text-transform: uppercase;">Cost</div>
              </div>
              <div style="flex: 1; border-radius: 8px; padding: 8px 6px; text-align: center; background: ${cardBg};">
                <div style="font-size: 18px; font-weight: 700; color: ${riskColor};">${cell.avgSeverity.toFixed(1)}</div>
                <div style="font-size: 8px; color: ${mutedColor}; text-transform: uppercase;">Severity</div>
              </div>
            </div>
            <div style="margin-bottom: 10px;">
              <div style="display: flex; gap: 2px; height: 6px; border-radius: 3px; overflow: hidden; background: ${theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'};">
                ${cell.criticalCount > 0 ? `<div style="flex: ${cell.criticalCount}; background: #ef4444;"></div>` : ''}
                ${cell.highCount > 0 ? `<div style="flex: ${cell.highCount}; background: #f59e0b;"></div>` : ''}
                ${cell.medCount > 0 ? `<div style="flex: ${cell.medCount}; background: #3b82f6;"></div>` : ''}
                ${cell.lowCount > 0 ? `<div style="flex: ${cell.lowCount}; background: #22c55e;"></div>` : ''}
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                ${cell.criticalCount > 0 ? `<span style="font-size: 8px; color: #ef4444; font-weight: 600;">${cell.criticalCount} crit</span>` : ''}
                ${cell.highCount > 0 ? `<span style="font-size: 8px; color: #f59e0b; font-weight: 600;">${cell.highCount} high</span>` : ''}
                ${cell.medCount > 0 ? `<span style="font-size: 8px; color: #3b82f6; font-weight: 600;">${cell.medCount} med</span>` : ''}
                ${cell.lowCount > 0 ? `<span style="font-size: 8px; color: #22c55e; font-weight: 600;">${cell.lowCount} low</span>` : ''}
              </div>
            </div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px;">
              ${Object.entries(cell.types).sort((a, b) => b[1] - a[1]).map(([type, count]) => 
                `<span style="font-size: 9px; padding: 2px 7px; border-radius: 8px; font-weight: 600; background: ${theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}; color: ${mutedColor};">${type} (${count})</span>`
              ).join('')}
              ${cell.nearSchoolCount > 0 ? `<span style="font-size: 9px; padding: 2px 7px; border-radius: 8px; font-weight: 600; background: rgba(245,158,11,0.15); color: #f59e0b;">school zone (${cell.nearSchoolCount})</span>` : ''}
            </div>
            <div style="background: ${cell.color}15; border-left: 3px solid ${cell.color}; border-radius: 0 6px 6px 0; padding: 8px 10px; font-size: 11px; line-height: 1.5; color: ${mutedColor};">
              <span style="font-weight: 700; color: ${cell.color};">Insight: </span>
              ${cell.intensity > 0.7
                ? `Highest density — ${cell.count} issues concentrated in this hex. Deploy crews immediately.`
                : cell.intensity > 0.5
                ? `Elevated density with ${cell.count} reports. Primarily ${topType?.[0] || 'mixed'} issues. Batch repairs recommended.`
                : cell.intensity > 0.3
                ? `Moderate activity — ${cell.count} work order${cell.count > 1 ? 's' : ''}. Monitor for emerging patterns.`
                : `Low density — ${cell.count} report${cell.count > 1 ? 's' : ''}. Routine monitoring sufficient.`
              }
            </div>
          </div>
        </div>
      `;

      polygon.bindPopup(popupHtml, {
        className: `cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`,
        maxWidth: 290,
        minWidth: 270,
      });

      // Select work orders on click
      polygon.on('click', () => {
        if (onWorkOrderSelectRef.current && cell.workOrders.length === 1) {
          onWorkOrderSelectRef.current(cell.workOrders[0].id);
        }
      });

      group.addLayer(polygon);
    });

    group.addTo(map);
    layerGroupRef.current = group;

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [hexCells, visible, currentZoom, map, theme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [map]);

  return null;
};

// ============================================
// Main InfraMap Component
// ============================================

interface InfraMapProps {
  workOrders: WorkOrder[];
  crews: Crew[];
  mapState: MapState;
  onWorkOrderSelect: (id: string | null) => void;
  onDispatchCrew?: (workOrderId: string) => void;
  theme?: 'light' | 'dark';
  onShowHelp?: () => void;
  // New selection props
  selectedWorkOrderIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  clusters?: Cluster[];
  showClusters?: boolean;
  staffZones?: StaffZone[];
  showStaffZones?: boolean;
  selectionMode?: 'single' | 'lasso' | 'none';
  onSelectionModeChange?: (mode: 'single' | 'lasso' | 'none') => void;
  focusedLocation?: FocusedLocation | null;
  onLayerToggle?: (layer: string, visible: boolean) => void;
  /** Decay simulation overlay data — when set, renders decay circles on the map */
  decayOverlay?: DecayedWorkOrder[] | null;
  /** Current decay simulation month (0 = today) */
  decayMonth?: number;
  /** Decay baseline data (month 0) for cost comparisons */
  decayBaseline?: DecayedWorkOrder[] | null;
  /** School locations for the schools layer */
  schools?: School[];
  /** Predictive hotspot data for risk zones */
  hotspots?: PredictiveHotspot[];
  /** Whether to show hotspots on the map */
  showHotspots?: boolean;
}

/**
 * InfraMap - Leaflet map with animated markers and dark theme
 * 
 * Features:
 * - Priority-coded pulsing markers
 * - Crew location pins
 * - Dark CARTO basemap
 * - Glassmorphism popups
 * - Fly-to animation on selection
 */
const InfraMap: React.FC<InfraMapProps> = ({
  workOrders,
  crews,
  mapState,
  onWorkOrderSelect,
  onDispatchCrew,
  theme = 'dark',
  onShowHelp,
  selectedWorkOrderIds = [],
  onSelectionChange,
  clusters = [],
  showClusters = false,
  staffZones = [],
  showStaffZones = false,
  selectionMode = 'single',
  onSelectionModeChange,
  focusedLocation = null,
  onLayerToggle,
  decayOverlay = null,
  decayMonth = 0,
  decayBaseline = null,
  schools = [],
  hotspots = [],
  showHotspots = false,
}) => {
  const [showLegend, setShowLegend] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const mapRef = useRef<L.Map | null>(null);
  const circleRefs = useRef<Map<string, L.Circle>>(new Map());
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  // Lake Forest boundary polygon — fetched from ArcGIS or static fallback
  const [lakeForestBoundary, setLakeForestBoundary] = useState<Array<[number, number]>>([]);

  useEffect(() => {
    // Fetch Lake Forest boundary from ArcGIS MapServer
    const fetchBoundary = async () => {
      try {
        const url = `${ARCGIS_LAYERS.zoning.baseUrl}/1/query?where=${encodeURIComponent("NAME = 'City of Lake Forest'")}&outFields=NAME&returnGeometry=true&outSR=4326&f=json&geometryPrecision=4&maxAllowableOffset=0.0003`;
        const resp = await fetch(url);
        const json = await resp.json();
        if (json.features?.length > 0) {
          const rings = json.features[0].geometry?.rings;
          if (rings?.length > 0) {
            // Convert ArcGIS [lng, lat] → Leaflet [lat, lng]
            const coords: Array<[number, number]> = rings[0].map((pt: number[]) => [pt[1], pt[0]] as [number, number]);
            setLakeForestBoundary(coords);
            return;
          }
        }
      } catch {
        // Fall through to static fallback
      }
      // Static fallback from official Lake County GIS data
      setLakeForestBoundary([
        [42.2798, -87.8788], [42.2763, -87.8761], [42.2689, -87.8723],
        [42.2686, -87.8281], [42.2666, -87.8264], [42.2658, -87.8270],
        [42.2615, -87.8252], [42.2554, -87.8209], [42.2549, -87.8196],
        [42.2543, -87.8200], [42.2543, -87.8192], [42.2521, -87.8191],
        [42.2507, -87.8177], [42.2510, -87.8189], [42.2487, -87.8174],
        [42.2477, -87.8179], [42.2454, -87.8166], [42.2429, -87.8164],
        [42.2313, -87.8115], [42.2297, -87.8123], [42.2230, -87.8067],
        [42.2225, -87.8073], [42.2231, -87.8081], [42.2223, -87.8080],
        [42.2212, -87.8103], [42.2205, -87.8145], [42.2185, -87.8163],
        [42.2181, -87.8185], [42.2180, -87.8421], [42.2124, -87.8422],
        [42.2108, -87.8447], [42.2108, -87.8470], [42.2036, -87.8470],
        [42.2037, -87.8910], [42.2218, -87.8991], [42.2287, -87.9013],
        [42.2510, -87.9014], [42.2524, -87.8995], [42.2539, -87.8995],
        [42.2547, -87.9005], [42.2583, -87.9011], [42.2586, -87.8947],
        [42.2577, -87.8930], [42.2553, -87.8941], [42.2559, -87.8902],
        [42.2474, -87.8861], [42.2509, -87.8874], [42.2509, -87.8861],
        [42.2582, -87.8860], [42.2618, -87.8891], [42.2618, -87.8859],
        [42.2798, -87.8857], [42.2798, -87.8788],
      ]);
    };
    fetchBoundary();
  }, []);

  // Popup tab state for work order detail view
  const [popupTab, setPopupTab] = useState<'overview' | 'history' | 'details' | 'cost'>('overview');
  
  // Decay comparison: "pin" a work order snapshot at a specific month
  const [pinnedDecay, setPinnedDecay] = useState<{ id: string; month: number; cost: number; decay: number; severity: string } | null>(null);
  
  // Buffer and analysis state
  const [activeBuffer, setActiveBuffer] = useState<BufferResult | null>(null);
  const [bufferRadius, setBufferRadius] = useState(500); // meters
  const [showBufferTool, setShowBufferTool] = useState(false);
  const [nearestResults, setNearestResults] = useState<NearestResult[]>([]);
  const [showNearestTool, setShowNearestTool] = useState(false);
  const [routeWaypoints, setRouteWaypoints] = useState<Array<{ lat: number; lng: number }>>([]);

  // Parcel identify state
  const [parcelInfo, setParcelInfo] = useState<{ lat: number; lng: number; data: Record<string, any> } | null>(null);
  const [parcelLoading, setParcelLoading] = useState(false);

  // Parcel identify on click
  const handleParcelIdentify = useCallback(async (lat: number, lng: number) => {
    if (!mapState.visibleLayers.parcels) return;
    setParcelLoading(true);
    setParcelInfo(null);
    try {
      const map = mapRef.current;
      if (!map) return;
      const bounds = map.getBounds();
      const size = map.getSize();
      const point = map.latLngToContainerPoint([lat, lng]);
      const params = new URLSearchParams({
        geometry: `${lng},${lat}`,
        geometryType: 'esriGeometryPoint',
        sr: '4326',
        layers: 'all:11,12',
        tolerance: '5',
        mapExtent: `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`,
        imageDisplay: `${size.x},${size.y},96`,
        returnGeometry: 'false',
        f: 'json',
      });
      const resp = await fetch(`${ARCGIS_LAYERS.parcels.baseUrl}/identify?${params.toString()}`);
      const json = await resp.json();
      if (json.results && json.results.length > 0) {
        const attrs = json.results[0].attributes;
        setParcelInfo({ lat, lng, data: attrs });
      } else {
        setParcelInfo({ lat, lng, data: { _empty: true } });
      }
    } catch (e) {
      console.error('Parcel identify failed:', e);
      setParcelInfo({ lat, lng, data: { _error: true } });
    } finally {
      setParcelLoading(false);
    }
  }, [mapState.visibleLayers.parcels]);

  // Buffer click handler
  const handleBufferClick = useCallback((lat: number, lng: number) => {
    if (!showBufferTool) return;
    const buffer = createBuffer(lat, lng, bufferRadius, workOrders, crews);
    setActiveBuffer(buffer);
    // Select work orders in buffer
    if (onSelectionChange) {
      onSelectionChange(buffer.containedWorkOrders.map(wo => wo.id));
    }
  }, [showBufferTool, bufferRadius, workOrders, crews, onSelectionChange]);

  // Find nearest handler
  const handleFindNearest = useCallback((lat: number, lng: number) => {
    if (!showNearestTool) return;
    const nearest = findKNearestWorkOrders(lat, lng, workOrders, 5);
    setNearestResults(nearest);
    // Select nearest work orders
    if (onSelectionChange && nearest.length > 0) {
      onSelectionChange(nearest.map(n => n.workOrder.id));
    }
  }, [showNearestTool, workOrders, onSelectionChange]);

  // Route optimization handler
  const handleOptimizeRoute = useCallback(() => {
    if (selectedWorkOrderIds.length < 2) return;
    const selectedWOs = workOrders.filter(wo => selectedWorkOrderIds.includes(wo.id));
    if (selectedWOs.length < 2) return;
    
    // Start from first selected work order
    const result = optimizeRoute(
      selectedWOs[0].latitude,
      selectedWOs[0].longitude,
      selectedWOs.slice(1)
    );
    
    setRouteWaypoints([
      { lat: selectedWOs[0].latitude, lng: selectedWOs[0].longitude },
      ...result.waypoints.map(wp => ({ lat: wp.lat, lng: wp.lng }))
    ]);
  }, [selectedWorkOrderIds, workOrders]);

  // Point-in-polygon test using ray casting
  const isPointInPolygon = useCallback((lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat, yi = polygon[i].lng;
      const xj = polygon[j].lat, yj = polygon[j].lng;
      if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, []);

  // Handle lasso selection completion
  const handleLassoComplete = useCallback((currentLassoPoints: Array<{ lat: number; lng: number }>) => {
    if (currentLassoPoints.length < 3 || !onSelectionChange) {
      setLassoPoints([]);
      setIsDrawing(false);
      return;
    }

    // Check which work orders are inside the polygon
    const selectedIds = workOrders.filter(wo => {
      return isPointInPolygon(wo.latitude, wo.longitude, currentLassoPoints);
    }).map(wo => wo.id);

    onSelectionChange(selectedIds);
    setLassoPoints([]);
    setIsDrawing(false);
  }, [workOrders, onSelectionChange, isPointInPolygon]);

  // Lasso drawing handlers
  const handleDrawingStart = useCallback(() => {
    setIsDrawing(true);
    setLassoPoints([]);
  }, []);

  const handleAddPoint = useCallback((lat: number, lng: number) => {
    setLassoPoints(prev => [...prev, { lat, lng }]);
  }, []);

  const handleDrawingEnd = useCallback(() => {
    handleLassoComplete(lassoPoints);
  }, [handleLassoComplete, lassoPoints]);

  const getPriorityLabel = (severity: string): string => {
    const labels: Record<string, string> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    };
    return labels[severity] || 'Unknown';
  };

  const getPriorityColor = (severity: string): 'danger' | 'warning' | 'success' | 'informative' => {
    const colors: Record<string, 'danger' | 'warning' | 'success' | 'informative'> = {
      critical: 'danger',
      high: 'warning',
      medium: 'warning',
      low: 'success',
    };
    return colors[severity] || 'informative';
  };

  // Generate mock history for a work order (deterministic based on ID)
  const getWorkOrderHistory = (wo: WorkOrder) => {
    const seed = wo.id.charCodeAt(wo.id.length - 1) + wo.id.charCodeAt(0);
    const created = new Date(wo.createdAt);
    const history = [];
    // Past inspections
    const inspDate1 = new Date(created);
    inspDate1.setDate(inspDate1.getDate() - (30 + (seed % 60)));
    history.push({ date: inspDate1, event: 'Initial Report', note: `Reported by field crew — ${wo.issueType} identified` });
    
    const inspDate2 = new Date(created);
    inspDate2.setDate(inspDate2.getDate() - (10 + (seed % 20)));
    history.push({ date: inspDate2, event: 'Inspection', note: `Condition assessed: ${wo.severity} severity — est. $${Math.round(wo.estimatedCost * 0.8).toLocaleString()}` });
    
    history.push({ date: created, event: 'Work Order Created', note: `Priority score ${wo.priorityScore.toFixed(1)} — cost estimate $${wo.estimatedCost.toLocaleString()}` });

    if (wo.assignedCrewId) {
      const assignDate = new Date(created);
      assignDate.setDate(assignDate.getDate() + (seed % 5) + 1);
      history.push({ date: assignDate, event: 'Crew Assigned', note: `Crew ${wo.assignedCrewId} dispatched` });
    }
    return history.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const getIssueTypeEmoji = (type: string): string => {
    const emojis: Record<string, string> = {
      pothole: '○',
      sidewalk: '△',
      concrete: '□',
    };
    return emojis[type] || '◇';
  };

  // Filter work orders based on map state
  const filteredWorkOrders = useMemo(() => workOrders.filter(wo => {
    if (mapState.filterPriority !== 'all' && wo.severity !== mapState.filterPriority) {
      return false;
    }
    if (mapState.filterType !== 'all' && wo.issueType !== mapState.filterType) {
      return false;
    }
    return true;
  }), [workOrders, mapState.filterPriority, mapState.filterType]);

  // Pre-compute heatmap density grid so it doesn't run on every render
  const heatmapCells = useMemo(() => {
    if (!filteredWorkOrders.length) return [];
    const gridSize = 0.006;
    const densityMap = new Map<string, { lat: number; lng: number; count: number; maxSev: number; avgSev: number; totalSev: number; totalCost: number; types: Record<string, number>; criticalCount: number; highCount: number; medCount: number; lowCount: number; nearSchoolCount: number }>();

    filteredWorkOrders.filter(wo => wo.latitude != null && wo.longitude != null && isFinite(wo.latitude) && isFinite(wo.longitude)).forEach(wo => {
      const gLat = Math.round(wo.latitude / gridSize) * gridSize;
      const gLng = Math.round(wo.longitude / gridSize) * gridSize;
      const key = `${gLat.toFixed(4)},${gLng.toFixed(4)}`;
      const sev = wo.severity === 'critical' ? 4 : wo.severity === 'high' ? 3 : wo.severity === 'medium' ? 2 : 1;
      const existing = densityMap.get(key);
      if (existing) {
        existing.count += 1;
        existing.maxSev = Math.max(existing.maxSev, sev);
        existing.totalSev += sev;
        existing.avgSev = existing.totalSev / existing.count;
        existing.totalCost += wo.estimatedCost;
        existing.types[wo.issueType] = (existing.types[wo.issueType] || 0) + 1;
        if (wo.severity === 'critical') existing.criticalCount++;
        else if (wo.severity === 'high') existing.highCount++;
        else if (wo.severity === 'medium') existing.medCount++;
        else existing.lowCount++;
        if (wo.nearSchool) existing.nearSchoolCount++;
      } else {
        densityMap.set(key, {
          lat: gLat, lng: gLng, count: 1, maxSev: sev, avgSev: sev, totalSev: sev, totalCost: wo.estimatedCost,
          types: { [wo.issueType]: 1 },
          criticalCount: wo.severity === 'critical' ? 1 : 0,
          highCount: wo.severity === 'high' ? 1 : 0,
          medCount: wo.severity === 'medium' ? 1 : 0,
          lowCount: wo.severity === 'low' ? 1 : 0,
          nearSchoolCount: wo.nearSchool ? 1 : 0,
        });
      }
    });

    const maxCount = Math.max(...Array.from(densityMap.values()).map(d => d.count), 1);
    const gradientPalette = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#dc2626'];

    return Array.from(densityMap.values()).map(cell => {
      const intensity = cell.count / maxCount;
      const sevWeight = cell.avgSev / 4;
      const blendedIntensity = intensity * 0.5 + sevWeight * 0.5;
      const ringCount = Math.max(2, Math.min(5, Math.ceil(blendedIntensity * 5)));
      const outerRadius = 300 + intensity * 500;
      const colorStart = blendedIntensity < 0.3 ? 0 : blendedIntensity < 0.5 ? 1 : 2;
      const coreColor = gradientPalette[Math.min(colorStart + ringCount - 1, gradientPalette.length - 1)];
      const riskLabel = blendedIntensity > 0.7 ? 'Critical Hotspot' : blendedIntensity > 0.5 ? 'High Density Zone' : blendedIntensity > 0.3 ? 'Moderate Activity' : 'Low Activity';
      const riskColor = blendedIntensity > 0.7 ? '#dc2626' : blendedIntensity > 0.5 ? '#ef4444' : blendedIntensity > 0.3 ? '#f97316' : '#22c55e';
      const topType = Object.entries(cell.types).sort((a, b) => b[1] - a[1])[0];
      const costStr = cell.totalCost >= 1000 ? `$${(cell.totalCost / 1000).toFixed(1)}k` : `$${cell.totalCost}`;
      const pctOfTotal = Math.round((cell.count / filteredWorkOrders.length) * 100);
      const insightText = blendedIntensity > 0.7
        ? `Highest concentration — ${cell.count} work orders clustered here. Deploy crews immediately to prevent cascading failures.`
        : blendedIntensity > 0.5
        ? `Elevated density with ${cell.count} reports. Primarily ${topType[0]} problems. Schedule batch repairs to reduce costs.`
        : blendedIntensity > 0.3
        ? `Moderate clustering. ${cell.count} work order${cell.count > 1 ? 's' : ''} in this zone. Monitor for trends.`
        : `Low density — ${cell.count} report${cell.count > 1 ? 's' : ''}. Routine monitoring sufficient.`;

      return {
        ...cell, intensity, blendedIntensity, ringCount, outerRadius,
        colorStart, coreColor, riskLabel, riskColor, topType, costStr,
        pctOfTotal, insightText, gradientPalette,
      };
    });
  }, [filteredWorkOrders]);

  // Map control handlers
  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleResetView = () => {
    if (lakeForestBoundary.length > 3 && mapRef.current) {
      const bounds = L.latLngBounds(lakeForestBoundary.map(([lat, lng]) => L.latLng(lat, lng)));
      mapRef.current.flyToBounds(bounds, { padding: [20, 20], duration: 0.5, maxZoom: 14 });
    } else {
      mapRef.current?.flyTo(MAP_CONFIG.center, MAP_CONFIG.defaultZoom, { duration: 0.5 });
    }
  };

  // Get tile URL based on theme
  const tileUrl = theme === 'light' ? MAP_CONFIG.lightTileUrl : MAP_CONFIG.darkTileUrl;

  return (
    <div className="map-container" style={{ position: 'relative' }}>
      {/* Selection indicator banner */}
      {selectedWorkOrderIds.length > 0 && (
        <div className="selection-banner" style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'linear-gradient(135deg, #0a4264, #0d5a8f)',
          borderRadius: 20,
          padding: '8px 16px',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <Text weight="semibold">
            {selectedWorkOrderIds.length} work order{selectedWorkOrderIds.length !== 1 ? 's' : ''} selected
          </Text>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => onSelectionChange?.([])}
            style={{ minWidth: 'auto' }}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Lasso mode indicator */}
      {selectionMode === 'lasso' && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          padding: '8px 16px',
          boxShadow: 'var(--shadow-md)',
          border: '1px solid var(--accent-primary)',
        }}>
          <Text size={200}>
            {isDrawing ? 'Drawing... release to complete' : 'Click and drag to draw selection area'}
          </Text>
        </div>
      )}


      {/* Custom Map Controls */}
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
        <Button appearance="subtle" icon={<Add24Regular />} onClick={handleZoomIn} size="small" title="Zoom In" />
        <Button appearance="subtle" icon={<Subtract24Regular />} onClick={handleZoomOut} size="small" title="Zoom Out" />
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '2px 0' }} />
        <Button appearance="subtle" icon={<Home24Regular />} onClick={handleResetView} size="small" title="Reset View" />
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '2px 0' }} />
        {/* Selection Mode Toggle */}
        <Tooltip content={selectionMode === 'lasso' ? "Exit Selection Mode" : "Lasso Select (draw to select multiple)"} relationship="label">
          <Button 
            appearance={selectionMode === 'lasso' ? "primary" : "subtle"} 
            icon={<SelectAllOn24Regular />}
            onClick={() => onSelectionModeChange?.(selectionMode === 'lasso' ? 'single' : 'lasso')}
            size="small"
          />
        </Tooltip>
        {selectedWorkOrderIds.length > 0 && (
          <Tooltip content={`Clear selection (${selectedWorkOrderIds.length} selected)`} relationship="label">
            <Button 
              appearance="subtle"
              icon={<Dismiss24Regular />}
              onClick={() => {
                onSelectionChange?.([]);
                setActiveBuffer(null);
                setNearestResults([]);
                setRouteWaypoints([]);
              }}
              size="small"
              style={{ color: 'var(--accent-danger)' }}
            />
          </Tooltip>
        )}
        <div style={{ height: 1, background: 'var(--glass-border)', margin: '2px 0' }} />
        <Button 
          appearance={showLegend ? "primary" : "subtle"} 
          icon={<Map24Regular />} 
          onClick={() => setShowLegend(!showLegend)} 
          size="small" 
          title="Legend"
        />
        {onShowHelp && (
          <Button appearance="subtle" icon={<Question24Regular />} onClick={onShowHelp} size="small" title="Help" />
        )}
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
          maxHeight: 'calc(100% - 24px)',
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text weight="semibold">Legend & Layers</Text>
            <Button appearance="subtle" size="small" onClick={() => setShowLegend(false)}>×</Button>
          </div>

          {/* ── Priority Key ── */}
          <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
            PRIORITY
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            <LegendDot color="#f85149" label="Critical" />
            <LegendDot color="#f0883e" label="High" />
            <LegendDot color="#d29922" label="Medium" />
            <LegendDot color="#3fb950" label="Low" />
          </div>

          {/* ── Data Layers (toggleable) ── */}
          <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 8, paddingTop: 8 }}>
            <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              LAYERS
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Work Orders */}
              <LayerToggle
                checked={mapState.visibleLayers.workOrders}
                onChange={() => onLayerToggle?.('workOrders', !mapState.visibleLayers.workOrders)}
                color="#f0883e"
                label="Work Orders"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" fill="currentColor"/></svg>}
              />
              {/* Crews */}
              <LayerToggle
                checked={mapState.visibleLayers.crews}
                onChange={() => onLayerToggle?.('crews', !mapState.visibleLayers.crews)}
                color="#3b82f6"
                label="Crews"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor"/></svg>}
              />
              {/* Heatmap */}
              <LayerToggle
                checked={mapState.visibleLayers.heatmap}
                onChange={() => onLayerToggle?.('heatmap', !mapState.visibleLayers.heatmap)}
                color="#ef4444"
                label="Heatmap"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13.5 0.67s0.74 2.65 0.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l0.03-0.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5 0.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-0.36 3.6-1.21 4.62-2.58 0.39 1.29 0.59 2.65 0.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" fill="currentColor"/></svg>}
              />
              {/* Schools */}
              <LayerToggle
                checked={mapState.visibleLayers.schools}
                onChange={() => onLayerToggle?.('schools', !mapState.visibleLayers.schools)}
                color="#a855f7"
                label="Schools"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" fill="currentColor"/></svg>}
              />
            </div>
          </div>

          {/* ── GIS Overlays ── */}
          <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 10, paddingTop: 8 }}>
            <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              GIS OVERLAYS
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* Hex Binning */}
              <LayerToggle
                checked={mapState.visibleLayers.hexbin}
                onChange={() => onLayerToggle?.('hexbin', !mapState.visibleLayers.hexbin)}
                color="#2dd4bf"
                label="Hex Binning"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L21 7.5V16.5L12 22L3 16.5V7.5L12 2Z" fill="currentColor" fillOpacity="0.3" stroke="currentColor" strokeWidth="2"/></svg>}
              />
              {/* Parcels */}
              <LayerToggle
                checked={mapState.visibleLayers.parcels}
                onChange={() => onLayerToggle?.('parcels', !mapState.visibleLayers.parcels)}
                color="#e5e5e5"
                label="Parcels"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" stroke="currentColor" strokeWidth="2" fill="none"/></svg>}
              />
              {/* Boundaries */}
              <LayerToggle
                checked={mapState.visibleLayers.zoning}
                onChange={() => onLayerToggle?.('zoning', !mapState.visibleLayers.zoning)}
                color="#2dd4bf"
                label="Boundaries"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" fill="currentColor"/></svg>}
              />
            </div>
            <Text size={100} style={{ color: 'var(--text-muted)', display: 'block', marginTop: 6, fontStyle: 'italic' }}>
              Lake County, IL GIS
            </Text>
          </div>

          {/* Hex Binning color legend */}
          {mapState.visibleLayers.hexbin && (
            <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 10, paddingTop: 8 }}>
              <Text size={100} weight="semibold" style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)' }}>
                HEX DENSITY
              </Text>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ flex: 1, background: '#1a3a3a' }} />
                <div style={{ flex: 1, background: '#1e5555' }} />
                <div style={{ flex: 1, background: '#1f7a7a' }} />
                <div style={{ flex: 1, background: '#20a0a0' }} />
                <div style={{ flex: 1, background: '#22c5c5' }} />
                <div style={{ flex: 1, background: '#2dd4bf' }} />
                <div style={{ flex: 1, background: '#5eead4' }} />
                <div style={{ flex: 1, background: '#00ffcc' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>Low</Text>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>High</Text>
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: 10, paddingTop: 8 }}>
            <Text size={100} style={{ color: 'var(--text-muted)' }}>Click any marker for details</Text>
          </div>
        </div>
      )}

      <MapContainer
        center={mapState.center}
        zoom={mapState.zoom}
        minZoom={MAP_CONFIG.minZoom}
        maxZoom={MAP_CONFIG.maxZoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={mapRef}
      >
        {/* Theme-aware tile layer */}
        <TileLayer
          url={tileUrl}
          attribution={MAP_CONFIG.attribution}
        />

        {/* ArcGIS parcel overlay (Lake County) */}
        <ArcGISDynamicLayer
          url={ARCGIS_LAYERS.parcels.baseUrl}
          layers={ARCGIS_LAYERS.parcels.layers}
          opacity={ARCGIS_LAYERS.parcels.opacity}
          visible={mapState.visibleLayers.parcels}
        />

        {/* Lake Forest boundary outline — fetched from ArcGIS GIS data */}
        {lakeForestBoundary.length > 0 && mapState.visibleLayers.zoning && (
          <Polygon
            positions={lakeForestBoundary}
            pathOptions={{
              color: theme === 'dark' ? 'rgba(45, 212, 191, 0.7)' : 'rgba(20, 184, 166, 0.6)',
              fillColor: 'transparent',
              fillOpacity: 0,
              weight: 2.5,
              opacity: 0.9,
            }}
            interactive={false}
          />
        )}

        {/* Map controller for fly-to animations */}
        <MapController
          workOrders={workOrders}
          selectedWorkOrderId={mapState.selectedWorkOrderId}
          markerRefs={markerRefs}
        />

        {/* Layer pane setup — ensures work orders always render ABOVE rings */}
        <MapPaneSetup />

        {/* Fit map to Lake Forest boundary on initial load */}
        <FitBoundaryOnLoad boundary={lakeForestBoundary} />

        {/* ═══ Hexagonal Binning Layer ═══ */}
        <HexBinLayer
          workOrders={filteredWorkOrders}
          visible={mapState.visibleLayers.hexbin && !mapState.selectedWorkOrderId}
          theme={theme}
          boundary={lakeForestBoundary}
          onWorkOrderSelect={onWorkOrderSelect}
        />

        {/* Focus sync — flies to location and opens popup */}
        <MapFocusSync focused={focusedLocation} circleRefs={circleRefs} />

        {/* Lasso selection handler */}
        <LassoHandler
          enabled={selectionMode === 'lasso'}
          isDrawing={isDrawing}
          onDrawingStart={handleDrawingStart}
          onAddPoint={handleAddPoint}
          onDrawingEnd={handleDrawingEnd}
        />

        {/* Map tool click handler (buffer, nearest) */}
        <MapToolHandler
          bufferEnabled={showBufferTool}
          nearestEnabled={showNearestTool}
          onBufferClick={handleBufferClick}
          onNearestClick={handleFindNearest}
        />

        {/* Parcel identify on click */}
        <ParcelClickHandler
          parcelsVisible={mapState.visibleLayers.parcels}
          bufferEnabled={showBufferTool}
          nearestEnabled={showNearestTool}
          onIdentify={handleParcelIdentify}
        />

        {/* Parcel identify popup */}
        {parcelInfo && !parcelInfo.data._empty && !parcelInfo.data._error && (
          <Marker
            position={[parcelInfo.lat, parcelInfo.lng]}
            icon={L.divIcon({
              className: '',
              html: '<div style="width:12px;height:12px;background:#e5e5e5;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(229,229,229,0.5)"></div>',
              iconSize: [12, 12],
              iconAnchor: [6, 6],
            })}
            eventHandlers={{ remove: () => setParcelInfo(null) }}
          >
            <Popup
              className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`}
              maxWidth={300}
              minWidth={250}
              eventHandlers={{ remove: () => setParcelInfo(null) }}
            >
              <div style={{
                width: 250,
                background: theme === 'light' ? '#ffffff' : '#1e293b',
                borderRadius: 10,
                overflow: 'hidden',
                color: theme === 'light' ? '#1f2328' : '#fff',
              }}>
                <div style={{
                  background: theme === 'light' ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.2)',
                  padding: '10px 14px',
                  borderBottom: '2px solid #e5e5e5',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Parcel Information</div>
                  <div style={{ fontSize: 10, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)' }}>
                    Lake County, IL GIS
                  </div>
                </div>
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.entries(parcelInfo.data)
                    .filter(([k]) => !k.startsWith('OBJECTID') && !k.startsWith('Shape') && !k.startsWith('SHAPE') && k !== 'FID')
                    .slice(0, 12)
                    .map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '3px 0' }}>
                        <span style={{ color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {key.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: 140, color: theme === 'light' ? '#1f2328' : '#fff' }}>
                          {val != null ? String(val) : '—'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Parcel loading indicator */}
        {parcelLoading && (
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, background: 'var(--bg-secondary)', borderRadius: 8,
            padding: '6px 14px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--glass-border)',
          }}>
            <Text size={200} style={{ color: 'var(--text-secondary)' }}>Identifying parcel...</Text>
          </div>
        )}

        {/* No parcel found toast */}
        {parcelInfo && parcelInfo.data._empty && (
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1000, background: 'var(--bg-secondary)', borderRadius: 8,
            padding: '6px 14px', boxShadow: 'var(--shadow-md)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <Text size={200} style={{ color: 'var(--text-secondary)' }}>No parcel data at this location</Text>
          </div>
        )}

        {/* Lasso drawing visualization */}
        {isDrawing && lassoPoints.length > 1 && (
          <Polyline
            positions={lassoPoints.map(p => [p.lat, p.lng] as [number, number])}
            interactive={false}
            pathOptions={{
              color: 'var(--accent-primary)',
              weight: 2,
              dashArray: '5, 5',
              fillOpacity: 0.1,
            }}
          />
        )}

        {/* Cluster circles with enhanced popups */}
        {showClusters && clusters.map((cluster, idx) => {
          const severityColor = cluster.avgSeverity > 3.5 ? '#ef4444' : 
                                cluster.avgSeverity > 2.5 ? '#f59e0b' : 
                                cluster.avgSeverity > 1.5 ? '#3b82f6' : '#22c55e';
          const hueColor = `hsl(${(idx * 60) % 360}, 70%, 50%)`;
          
          // Get top work order types in this cluster
          const typeCount: Record<string, number> = {};
          cluster.workOrders.forEach(wo => {
            typeCount[wo.issueType] = (typeCount[wo.issueType] || 0) + 1;
          });
          const sortedTypes = Object.entries(typeCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          
          // Calculate severity breakdown
          const severityBreakdown = {
            critical: cluster.workOrders.filter(wo => wo.severity === 'critical').length,
            high: cluster.workOrders.filter(wo => wo.severity === 'high').length,
            medium: cluster.workOrders.filter(wo => wo.severity === 'medium').length,
            low: cluster.workOrders.filter(wo => wo.severity === 'low').length,
          };

          // -- Build user-friendly plain English analysis --
          const urgencyWord = cluster.avgSeverity > 3.5 ? 'urgent' : cluster.avgSeverity > 2.5 ? 'high-priority' : cluster.avgSeverity > 1.5 ? 'moderate' : 'routine';
          const mainType = sortedTypes[0]?.[0] || 'infrastructure';
          const mainTypeLabel = mainType === 'pothole' ? 'pothole' : mainType === 'sidewalk' ? 'sidewalk' : mainType === 'concrete' ? 'concrete' : mainType;
          const costStr = cluster.totalCost >= 1000 ? `$${(cluster.totalCost / 1000).toFixed(1)}K` : `$${cluster.totalCost}`;
          const nearSchoolCount = cluster.workOrders.filter((wo: any) => wo.nearSchool).length;

          // What to focus on
          const focusItems: string[] = [];
          if (severityBreakdown.critical > 0) focusItems.push(`Fix ${severityBreakdown.critical} critical issue${severityBreakdown.critical > 1 ? 's' : ''} first — these are safety hazards`);
          if (severityBreakdown.high > 0) focusItems.push(`Address ${severityBreakdown.high} high-severity repair${severityBreakdown.high > 1 ? 's' : ''} as soon as possible`);
          if (nearSchoolCount > 0) focusItems.push(`${nearSchoolCount} issue${nearSchoolCount > 1 ? 's are' : ' is'} near a school — prioritize for public safety`);
          if (sortedTypes.length > 1) focusItems.push(`Mix of work types — send a ${mainTypeLabel} crew plus ${sortedTypes[1][0]} support`);
          if (focusItems.length === 0) focusItems.push(`Standard ${mainTypeLabel} repairs — schedule during normal operations`);

          // Summary sentence
          const summary = cluster.avgSeverity > 3.5
            ? `This is a problem area that needs immediate attention. ${cluster.workOrders.length} ${mainTypeLabel} issues are concentrated here with an estimated repair cost of ${costStr}.`
            : cluster.avgSeverity > 2.5
            ? `This area has ${cluster.workOrders.length} ${urgencyWord} ${mainTypeLabel} issues that should be addressed soon. Estimated cost: ${costStr}.`
            : `There are ${cluster.workOrders.length} ${urgencyWord} ${mainTypeLabel} issues here. These can be batched together for efficient crew dispatch. Cost estimate: ${costStr}.`;
          
          // Use actual cluster radius with a buffer to ensure all points are captured
          const displayRadius = Math.max(cluster.radius * 1.15, 250); // 15% buffer for visual clarity
          
          return (
            <React.Fragment key={`cluster-group-${idx}`}>
              {/* Outer glow ring — non-interactive, in ring pane */}
              <Circle
                center={[cluster.centroid.lat, cluster.centroid.lng]}
                radius={displayRadius + 50}
                interactive={false}
                pane="ringOverlayPane"
                pathOptions={{
                  color: hueColor,
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  weight: 1,
                  opacity: 0.3,
                  dashArray: '3, 6',
                  className: 'map-overlay-ring',
                }}
              />
              {/* Main cluster circle — INTERACTIVE with popup, in ringOverlayPane (below work orders) */}
              <Circle
                center={[cluster.centroid.lat, cluster.centroid.lng]}
                radius={displayRadius}
                interactive={true}
                pane="ringOverlayPane"
                pathOptions={{
                  color: hueColor,
                  fillColor: hueColor,
                  fillOpacity: 0.12,
                  weight: 3,
                  className: 'map-overlay-ring',
                }}
                ref={(el: any) => { if (el) circleRefs.current.set(`cluster-${cluster.id}`, el); }}
              >
                <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={320} minWidth={280} autoPan={false}>
                  <div style={{ width: 280, background: theme === 'light' ? '#ffffff' : '#1e293b', borderRadius: 10, overflow: 'hidden', color: theme === 'light' ? '#1f2328' : '#fff' }}>
                    <div style={{ background: `linear-gradient(135deg, ${hueColor}${theme === 'light' ? '30' : '50'}, ${hueColor}${theme === 'light' ? '10' : '20'})`, padding: '12px 14px', borderBottom: `2px solid ${hueColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${hueColor}40`, border: `2px solid ${hueColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>{idx + 1}</div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>
                            Zone {idx + 1} Ring — {mainTypeLabel.charAt(0).toUpperCase() + mainTypeLabel.slice(1)}
                          </div>
                          <div style={{ color: severityColor, fontSize: 11, fontWeight: 600 }}>
                            {urgencyWord.charAt(0).toUpperCase() + urgencyWord.slice(1)} Priority · ~{Math.round(displayRadius)}m radius
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)', marginBottom: 10 }}>
                        {summary}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(10,66,100,0.1)' : 'rgba(229,229,229,0.2)' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: theme === 'light' ? '#0a4264' : '#e5e5e5' }}>{cluster.workOrders.length}</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Issues</div>
                        </div>
                        <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.2)' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: theme === 'light' ? '#16a34a' : '#22c55e' }}>{costStr}</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Cost</div>
                        </div>
                        <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: `${severityColor}${theme === 'light' ? '12' : '20'}` }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: severityColor }}>{cluster.avgSeverity.toFixed(1)}</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Severity</div>
                        </div>
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', background: theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}>
                          {severityBreakdown.critical > 0 && <div style={{ flex: severityBreakdown.critical, background: '#ef4444' }} />}
                          {severityBreakdown.high > 0 && <div style={{ flex: severityBreakdown.high, background: '#f59e0b' }} />}
                          {severityBreakdown.medium > 0 && <div style={{ flex: severityBreakdown.medium, background: '#3b82f6' }} />}
                          {severityBreakdown.low > 0 && <div style={{ flex: severityBreakdown.low, background: '#22c55e' }} />}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          {severityBreakdown.critical > 0 && <span style={{ fontSize: 8, color: '#ef4444' }}>{severityBreakdown.critical} critical</span>}
                          {severityBreakdown.high > 0 && <span style={{ fontSize: 8, color: '#f59e0b' }}>{severityBreakdown.high} high</span>}
                          {severityBreakdown.medium > 0 && <span style={{ fontSize: 8, color: '#3b82f6' }}>{severityBreakdown.medium} medium</span>}
                          {severityBreakdown.low > 0 && <span style={{ fontSize: 8, color: '#22c55e' }}>{severityBreakdown.low} low</span>}
                        </div>
                      </div>
                      <div style={{ background: theme === 'light' ? 'rgba(10,66,100,0.06)' : 'rgba(229,229,229,0.1)', borderLeft: `3px solid ${theme === 'light' ? '#0a4264' : '#e5e5e5'}`, borderRadius: '0 6px 6px 0', padding: '6px 10px', marginBottom: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: theme === 'light' ? '#0a4264' : '#e5e5e5', marginBottom: 3 }}>Contains</div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {sortedTypes.map(([type, count]) => (
                            <span key={type} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{type} ({count})</span>
                          ))}
                          {nearSchoolCount > 0 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>near school ({nearSchoolCount})</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Circle>
              
              {/* Center marker — interactive so users can click for cluster popup */}
              <CircleMarker
                center={[cluster.centroid.lat, cluster.centroid.lng]}
                radius={8}
                interactive={true}
                pathOptions={{
                  color: '#fff',
                  fillColor: hueColor,
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Popup
                  className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`}
                  maxWidth={320}
                  minWidth={280}
                  autoPan={false}
                >
                  <div style={{ 
                    width: 280,
                    background: theme === 'light' ? '#ffffff' : '#1e293b',
                    borderRadius: 10,
                    overflow: 'hidden',
                    color: theme === 'light' ? '#1f2328' : '#fff',
                  }}>
                    {/* Header */}
                    <div style={{
                      background: `linear-gradient(135deg, ${hueColor}${theme === 'light' ? '30' : '50'}, ${hueColor}${theme === 'light' ? '10' : '20'})`,
                      padding: '12px 14px',
                      borderBottom: `2px solid ${hueColor}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 8,
                          background: `${hueColor}40`, border: `2px solid ${hueColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff',
                        }}>{idx + 1}</div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>
                            Zone {idx + 1} — {mainTypeLabel.charAt(0).toUpperCase() + mainTypeLabel.slice(1)} Area
                          </div>
                          <div style={{ color: severityColor, fontSize: 11, fontWeight: 600 }}>
                            {cluster.avgSeverity > 3.5 ? 'Needs Immediate Attention' :
                             cluster.avgSeverity > 2.5 ? 'High Priority — Act Soon' :
                             cluster.avgSeverity > 1.5 ? 'Moderate — Schedule Repairs' : 'Low Priority — Routine Work'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Plain-English Summary */}
                    <div style={{ padding: '10px 14px 6px' }}>
                      <div style={{
                        fontSize: 12, lineHeight: 1.5,
                        color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)',
                        marginBottom: 10,
                      }}>
                        {summary}
                      </div>

                      {/* Quick Stats */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '6px 8px', textAlign: 'center',
                          background: theme === 'light' ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)',
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: theme === 'light' ? '#0a4264' : '#e5e5e5' }}>
                            {cluster.workOrders.length}
                          </div>
                          <div style={{ fontSize: 9, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Issues</div>
                        </div>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '6px 8px', textAlign: 'center',
                          background: theme === 'light' ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.2)',
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: theme === 'light' ? '#16a34a' : '#22c55e' }}>
                            {costStr}
                          </div>
                          <div style={{ fontSize: 9, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Est. Cost</div>
                        </div>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '6px 8px', textAlign: 'center',
                          background: `${severityColor}${theme === 'light' ? '12' : '20'}`,
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: severityColor }}>
                            {cluster.avgSeverity.toFixed(1)}
                          </div>
                          <div style={{ fontSize: 9, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Severity</div>
                        </div>
                      </div>

                      {/* Severity bar */}
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', background: theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}>
                          {severityBreakdown.critical > 0 && <div style={{ flex: severityBreakdown.critical, background: '#ef4444' }} />}
                          {severityBreakdown.high > 0 && <div style={{ flex: severityBreakdown.high, background: '#f59e0b' }} />}
                          {severityBreakdown.medium > 0 && <div style={{ flex: severityBreakdown.medium, background: '#3b82f6' }} />}
                          {severityBreakdown.low > 0 && <div style={{ flex: severityBreakdown.low, background: '#22c55e' }} />}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                          {severityBreakdown.critical > 0 && <span style={{ fontSize: 8, color: '#ef4444' }}>{severityBreakdown.critical} critical</span>}
                          {severityBreakdown.high > 0 && <span style={{ fontSize: 8, color: '#f59e0b' }}>{severityBreakdown.high} high</span>}
                          {severityBreakdown.medium > 0 && <span style={{ fontSize: 8, color: '#3b82f6' }}>{severityBreakdown.medium} medium</span>}
                          {severityBreakdown.low > 0 && <span style={{ fontSize: 8, color: '#22c55e' }}>{severityBreakdown.low} low</span>}
                        </div>
                      </div>

                      {/* What to focus on */}
                      <div style={{
                        background: theme === 'light' ? 'rgba(10,66,100,0.06)' : 'rgba(229,229,229,0.1)',
                        borderLeft: `3px solid ${theme === 'light' ? '#0a4264' : '#e5e5e5'}`,
                        borderRadius: '0 6px 6px 0',
                        padding: '8px 10px',
                        marginBottom: 6,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: theme === 'light' ? '#0a4264' : '#e5e5e5', marginBottom: 4 }}>
                          What to Focus On
                        </div>
                        {focusItems.map((item, fi) => (
                          <div key={fi} style={{ fontSize: 11, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.75)', paddingLeft: 10, position: 'relative', marginBottom: 2 }}>
                            <span style={{ position: 'absolute', left: 0, color: theme === 'light' ? '#374151' : '#e5e5e5' }}>&#x2022;</span>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                      padding: '6px 14px',
                      background: theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.25)',
                      borderTop: theme === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {sortedTypes.map(([type, count]) => (
                          <span key={type} style={{
                            fontSize: 9, padding: '1px 5px',
                            background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                            borderRadius: 8, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.65)',
                          }}>{type} ({count})</span>
                        ))}
                      </div>
                      <span style={{ fontSize: 9, color: hueColor, fontWeight: 600 }}>~{Math.round(cluster.radius)}m</span>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}

        {/* Staff Zones Visualization */}
        {showStaffZones && staffZones.map((zone, idx) => {
          const priorityColor = zone.priority === 'high' ? '#ef4444' : 
                                zone.priority === 'medium' ? '#f59e0b' : '#22c55e';
          const displayRadius = zone.radius || 400;

          // Build user-friendly description
          const workloadPct = Math.round(zone.workloadScore * 100);
          const staffDesc = zone.priority === 'high'
            ? `This is a high-demand area. Deploy ${zone.recommendedCrews} crew${zone.recommendedCrews > 1 ? 's' : ''} here as soon as possible — it accounts for ${workloadPct}% of the total workload.`
            : zone.priority === 'medium'
            ? `Moderate activity in this area. ${zone.recommendedCrews} crew${zone.recommendedCrews > 1 ? 's' : ''} should be assigned to cover the ${workloadPct}% workload share.`
            : `Lighter workload here (${workloadPct}%). ${zone.recommendedCrews} crew${zone.recommendedCrews > 1 ? 's are' : ' is'} sufficient. These can be reassigned if higher-priority zones need help.`;

          const staffTip = zone.priority === 'high'
            ? 'Send your most experienced crew first. Start with the worst issues and work outward.'
            : zone.priority === 'medium'
            ? 'Standard crew assignment. Batch similar issue types together for efficiency.'
            : 'Schedule during downtime. Good area for training new crew members.';
          
          return (
            <React.Fragment key={`staff-zone-${zone.id}`}>
              {/* Outer dashed ring — non-interactive, in ring pane */}
              <Circle
                center={[zone.center.lat, zone.center.lng]}
                radius={displayRadius + 30}
                interactive={false}
                pane="ringOverlayPane"
                pathOptions={{
                  color: priorityColor,
                  fillColor: 'transparent',
                  fillOpacity: 0,
                  weight: 2,
                  opacity: 0.5,
                  dashArray: '8, 8',
                  className: 'map-overlay-ring',
                }}
              />
              {/* Main zone circle — INTERACTIVE with popup, in ringOverlayPane (below work orders) */}
              <Circle
                center={[zone.center.lat, zone.center.lng]}
                radius={displayRadius}
                interactive={true}
                pane="ringOverlayPane"
                pathOptions={{
                  color: priorityColor,
                  fillColor: priorityColor,
                  fillOpacity: 0.15,
                  weight: 3,
                  className: 'map-overlay-ring',
                }}
                ref={(el: any) => { if (el) circleRefs.current.set(`staff-${zone.id}`, el); }}
              >
                <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={300} minWidth={260} autoPan={false}>
                  <div style={{ width: 260, background: theme === 'light' ? '#ffffff' : '#1e293b', borderRadius: 10, overflow: 'hidden', color: theme === 'light' ? '#1f2328' : '#fff' }}>
                    <div style={{ background: `linear-gradient(135deg, ${priorityColor}${theme === 'light' ? '30' : '50'}, ${priorityColor}${theme === 'light' ? '10' : '20'})`, padding: '12px 14px', borderBottom: `2px solid ${priorityColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${priorityColor}40`, border: `2px solid ${priorityColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                          {zone.priority === 'high' ? '!!' : zone.priority === 'medium' ? '!' : '\u2713'}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>{zone.name} Ring</div>
                          <div style={{ color: priorityColor, fontSize: 11, fontWeight: 600 }}>
                            {zone.priority === 'high' ? 'High Demand Zone' : zone.priority === 'medium' ? 'Moderate Zone' : 'Light Workload Zone'} · {displayRadius}m
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)', marginBottom: 10 }}>
                        {staffDesc}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: `${priorityColor}${theme === 'light' ? '12' : '20'}` }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: priorityColor }}>{zone.recommendedCrews}</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Crews Needed</div>
                        </div>
                        <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)' }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: theme === 'light' ? '#0a4264' : '#e5e5e5' }}>{workloadPct}%</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Workload</div>
                        </div>
                      </div>
                      <div style={{ background: theme === 'light' ? 'rgba(10,66,100,0.06)' : 'rgba(229,229,229,0.1)', borderLeft: `3px solid ${theme === 'light' ? '#0a4264' : '#e5e5e5'}`, borderRadius: '0 6px 6px 0', padding: '6px 10px', fontSize: 11, lineHeight: 1.4, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)' }}>
                        <span style={{ fontWeight: 700, color: theme === 'light' ? '#6366f1' : '#818cf8' }}>Tip: </span>
                        {staffTip}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Circle>
              
              {/* Center marker — interactive so users can click for zone popup */}
              <CircleMarker
                center={[zone.center.lat, zone.center.lng]}
                radius={10}
                interactive={true}
                pathOptions={{
                  color: '#fff',
                  fillColor: priorityColor,
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Popup
                  className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`}
                  maxWidth={300}
                  minWidth={260}
                  autoPan={false}
                >
                  <div style={{ 
                    width: 260,
                    background: theme === 'light' ? '#ffffff' : '#1e293b',
                    borderRadius: 10,
                    overflow: 'hidden',
                    color: theme === 'light' ? '#1f2328' : '#fff',
                  }}>
                    {/* Header */}
                    <div style={{
                      background: `linear-gradient(135deg, ${priorityColor}${theme === 'light' ? '30' : '50'}, ${priorityColor}${theme === 'light' ? '10' : '20'})`,
                      padding: '12px 14px',
                      borderBottom: `2px solid ${priorityColor}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 8,
                          background: `${priorityColor}40`, border: `2px solid ${priorityColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                        }}>
                          {zone.priority === 'high' ? '!!' : zone.priority === 'medium' ? '!' : '\u2713'}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>
                            {zone.name}
                          </div>
                          <div style={{ color: priorityColor, fontSize: 11, fontWeight: 600 }}>
                            {zone.priority === 'high' ? 'Deploy Crews Immediately' : zone.priority === 'medium' ? 'Schedule Crews Soon' : 'Routine Assignment'}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Description */}
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{
                        fontSize: 12, lineHeight: 1.5, marginBottom: 10,
                        color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)',
                      }}>
                        {staffDesc}
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '8px 6px', textAlign: 'center',
                          background: `${priorityColor}${theme === 'light' ? '12' : '20'}`,
                        }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: priorityColor }}>
                            {zone.recommendedCrews}
                          </div>
                          <div style={{ fontSize: 9, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                            Crews
                          </div>
                        </div>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '8px 6px', textAlign: 'center',
                          background: theme === 'light' ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)',
                        }}>
                          <div style={{ fontSize: 22, fontWeight: 700, color: theme === 'light' ? '#0a4264' : '#e5e5e5' }}>
                            {workloadPct}%
                          </div>
                          <div style={{ fontSize: 9, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                            Workload
                          </div>
                        </div>
                      </div>

                      {/* Tip */}
                      <div style={{
                        background: theme === 'light' ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.1)',
                        borderLeft: '3px solid #818cf8',
                        borderRadius: '0 6px 6px 0',
                        padding: '6px 10px',
                        fontSize: 11, lineHeight: 1.4,
                        color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)',
                      }}>
                        <span style={{ fontWeight: 700, color: theme === 'light' ? '#6366f1' : '#818cf8' }}>Tip: </span>
                        {staffTip}
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            </React.Fragment>
          );
        })}

        {/* Buffer circle visualization */}
        {activeBuffer && (
          <Circle
            center={[activeBuffer.center.lat, activeBuffer.center.lng]}
            radius={activeBuffer.radiusMeters}
            pane="ringOverlayPane"
            pathOptions={{
              color: '#58a6ff',
              fillColor: '#58a6ff',
              fillOpacity: 0.2,
              weight: 2,
              dashArray: '10, 5',
            }}
          >
            <Popup>
              <div style={{ padding: 8 }}>
                <Text weight="semibold">Buffer Zone</Text>
                <div style={{ marginTop: 4 }}>
                  <Caption1>Radius: {activeBuffer.radiusMeters}m</Caption1>
                  <br />
                  <Caption1>{activeBuffer.containedWorkOrders.length} work orders</Caption1>
                  <br />
                  <Caption1>{activeBuffer.containedCrews.length} crews nearby</Caption1>
                </div>
              </div>
            </Popup>
          </Circle>
        )}

        {/* ═══ Decay Simulation Overlay ═══ */}
        {decayOverlay && decayOverlay.length > 0 && decayOverlay.map((dwo) => {
          const isCritical = dwo.decayScore > 0.75;
          const isWarning = dwo.decayScore > 0.5;
          const glowColor = isCritical ? '#dc2626' : isWarning ? '#f59e0b' : dwo.color;
          const glowRadius = dwo.radius + (isCritical ? 8 : 4);
          
          return (
            <React.Fragment key={`decay-${dwo.id}`}>
              {/* Outer pulsing glow ring for critical items — INTERACTIVE with popup, in ring pane */}
              {isCritical && (
                <Circle
                  center={[dwo.latitude, dwo.longitude]}
                  radius={dwo.radius * 18}
                  interactive={true}
                  pane="ringOverlayPane"
                  pathOptions={{
                    color: '#ef4444',
                    fillColor: '#ef4444',
                    fillOpacity: 0.04,
                    weight: 1,
                    opacity: 0.2,
                    dashArray: '4, 6',
                    className: 'decay-glow-ring map-overlay-ring',
                  }}
                >
                  <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={260} minWidth={220}>
                    <div style={{ width: 230, background: theme === 'light' ? '#fff' : '#1e293b', borderRadius: 10, overflow: 'hidden', color: theme === 'light' ? '#1f2328' : '#fff' }}>
                      <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.4), rgba(239,68,68,0.15))', padding: '10px 14px', borderBottom: '2px solid #ef4444' }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Critical Decay Ring</div>
                        <div style={{ color: '#ef4444', fontSize: 10, fontWeight: 600 }}>{dwo.isSpawned ? 'Secondary Damage Zone' : dwo.title} · {Math.round(dwo.decayScore * 100)}% decay</div>
                      </div>
                      <div style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
                          This ring shows the critical decay impact zone. Cost has risen from ${Math.round(dwo.estimatedCost).toLocaleString()} to ${Math.round(dwo.estimatedCost * dwo.costMultiplier).toLocaleString()} ({dwo.costMultiplier.toFixed(1)}x). Severity: {dwo.originalSeverity} → {dwo.currentSeverity}.
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: 'rgba(239,68,68,0.15)' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#ef4444' }}>{Math.round(dwo.decayScore * 100)}%</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Decay</div>
                          </div>
                          <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: 'rgba(220,38,38,0.12)' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626' }}>${Math.round(dwo.estimatedCost * dwo.costMultiplier).toLocaleString()}</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Current Cost</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Circle>
              )}
              {/* Warning ring for degrading items — INTERACTIVE with popup, in ring pane */}
              {isWarning && !isCritical && (
                <Circle
                  center={[dwo.latitude, dwo.longitude]}
                  radius={dwo.radius * 12}
                  interactive={true}
                  pane="ringOverlayPane"
                  pathOptions={{
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.03,
                    weight: 1,
                    opacity: 0.15,
                    className: 'map-overlay-ring',
                  }}
                >
                  <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={260} minWidth={220}>
                    <div style={{ width: 230, background: theme === 'light' ? '#fff' : '#1e293b', borderRadius: 10, overflow: 'hidden', color: theme === 'light' ? '#1f2328' : '#fff' }}>
                      <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.35), rgba(245,158,11,0.12))', padding: '10px 14px', borderBottom: '2px solid #f59e0b' }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Warning Decay Ring</div>
                        <div style={{ color: '#f59e0b', fontSize: 10, fontWeight: 600 }}>{dwo.isSpawned ? 'Secondary Damage' : dwo.title} · {Math.round(dwo.decayScore * 100)}% decay</div>
                      </div>
                      <div style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
                          Infrastructure degradation detected. Cost estimate: ${Math.round(dwo.estimatedCost * dwo.costMultiplier).toLocaleString()} (was ${Math.round(dwo.estimatedCost).toLocaleString()}). Address soon to prevent further escalation.
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: 'rgba(245,158,11,0.12)' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#f59e0b' }}>{Math.round(dwo.decayScore * 100)}%</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Decay</div>
                          </div>
                          <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: 'rgba(217,119,6,0.12)' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#d97706' }}>{dwo.costMultiplier.toFixed(1)}x</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Cost Multiplier</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Circle>
              )}
              {/* Main decay marker — bright colored core */}
              <CircleMarker
                center={[dwo.latitude, dwo.longitude]}
                radius={glowRadius}
                pathOptions={{
                  color: isCritical ? '#fff' : glowColor,
                  fillColor: dwo.color,
                  fillOpacity: Math.min(0.45, dwo.opacity * 0.5 + 0.15),
                  weight: isCritical ? 2.5 : isWarning ? 1.5 : 1,
                  opacity: 0.85,
                  className: isCritical ? 'decay-marker-critical' : dwo.isSpawned ? 'decay-marker-spawned' : '',
                }}
              >
                <Popup className="wo-popup" maxWidth={340} minWidth={300}>
                  {(() => {
                    const costNow = Math.round(dwo.estimatedCost * dwo.costMultiplier);
                    const costOriginal = Math.round(dwo.estimatedCost);
                    const costIncrease = costNow - costOriginal;
                    const decayPct = Math.round(dwo.decayScore * 100);
                    const sevColor = dwo.currentSeverity === 'critical' ? '#ef4444' : dwo.currentSeverity === 'high' ? '#f59e0b' : dwo.currentSeverity === 'medium' ? '#3b82f6' : '#22c55e';
                    const sevLabel = dwo.currentSeverity === 'critical' ? 'CRITICAL' : dwo.currentSeverity === 'high' ? 'HIGH' : dwo.currentSeverity === 'medium' ? 'MEDIUM' : 'LOW';
                    const sevBg = dwo.currentSeverity === 'critical' ? '#fef2f2' : dwo.currentSeverity === 'high' ? '#fffbeb' : dwo.currentSeverity === 'medium' ? '#eff6ff' : '#f0fdf4';
                    const sevBorder = dwo.currentSeverity === 'critical' ? '#fecaca' : dwo.currentSeverity === 'high' ? '#fed7aa' : dwo.currentSeverity === 'medium' ? '#bfdbfe' : '#bbf7d0';

                    return (
                      <div className="wo-popup-card" style={{ minWidth: 300, maxWidth: 340 }}>
                        {/* Priority color stripe */}
                        <div style={{
                          height: 4,
                          background: sevColor,
                          borderRadius: '10px 10px 0 0',
                        }} />

                        {/* Header */}
                        <div style={{ padding: '10px 14px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 2 }}>
                                {dwo.isSpawned ? 'Secondary Damage' : dwo.title}
                              </div>
                              <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Location24Regular style={{ width: 12, height: 12, flexShrink: 0 }} /> {dwo.address}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                              padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                              color: sevColor, background: sevBg, border: `1px solid ${sevBorder}`,
                            }}>
                              {sevLabel}
                            </span>
                          </div>
                        </div>

                        {/* Info pills */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 14px 8px' }}>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                            {dwo.issueType.charAt(0).toUpperCase() + dwo.issueType.slice(1)}
                          </span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                            {dwo.zone}
                          </span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', fontWeight: 600 }}>
                            Month {decayMonth}
                          </span>
                          {dwo.isSpawned && (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#faf5ff', color: '#7c3aed', border: '1px solid #ddd6fe', fontWeight: 600 }}>
                              Spawned
                            </span>
                          )}
                          {dwo.nearSchool && (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600 }}>
                              School Zone
                            </span>
                          )}
                        </div>

                        {/* Stats grid — same layout as regular popup */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#e5e7eb' }}>
                          <div style={{ padding: '8px 14px', background: '#f9fafb' }}>
                            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Priority</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                              {dwo.decayScore > 0 ? (dwo.decayScore * 10).toFixed(1) : '0.0'}
                            </div>
                          </div>
                          <div style={{ padding: '8px 14px', background: '#f9fafb' }}>
                            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Est. Cost</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>${costNow.toLocaleString()}</div>
                          </div>
                        </div>

                        {/* Cost change indicator */}
                        {costIncrease > 0 && (
                          <div style={{ padding: '6px 14px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                              ↑ +${costIncrease.toLocaleString()} from original ${costOriginal.toLocaleString()}
                            </span>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>
                              {dwo.costMultiplier.toFixed(1)}x
                            </span>
                          </div>
                        )}

                        {/* Severity change */}
                        {dwo.originalSeverity !== dwo.currentSeverity && (
                          <div style={{ padding: '4px 14px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, color: '#6b7280' }}>Severity:</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>{dwo.originalSeverity}</span>
                            <span style={{ fontSize: 10, color: '#d1d5db' }}>→</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: sevColor }}>{dwo.currentSeverity}</span>
                          </div>
                        )}

                        {/* Decay bar */}
                        <div style={{ padding: '4px 14px 8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>Decay</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: sevColor }}>{decayPct}%</span>
                          </div>
                          <div style={{ height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{
                              width: `${decayPct}%`, height: '100%', borderRadius: 2,
                              background: `linear-gradient(90deg, #22c55e, ${sevColor})`,
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>

                        {/* Date */}
                        <div style={{ padding: '2px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <span style={{ fontSize: 9, color: '#9ca3af' }}>
                            Decay Simulation · Month {decayMonth}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </Popup>
              </CircleMarker>
              {/* Inner bright dot for visibility — non-interactive */}
              {isCritical && (
                <CircleMarker
                  center={[dwo.latitude, dwo.longitude]}
                  radius={3}
                  interactive={false}
                  pathOptions={{
                    color: '#fff',
                    fillColor: '#fff',
                    fillOpacity: 1,
                    weight: 0,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* Route polyline — non-interactive */}
        {routeWaypoints.length > 1 && (
          <Polyline
            positions={routeWaypoints.map(wp => [wp.lat, wp.lng] as [number, number])}
            interactive={false}
            pathOptions={{
              color: '#a371f7',
              weight: 4,
              opacity: 0.8,
            }}
          />
        )}

        {/* Nearest point lines */}
        {nearestResults.length > 0 && nearestResults.map((result, idx) => (
          <Polyline
            key={`nearest-line-${idx}`}
            positions={[
              [activeBuffer?.center.lat || 42.2586, activeBuffer?.center.lng || -87.8407] as [number, number],
              [result.workOrder.latitude, result.workOrder.longitude] as [number, number]
            ]}
            interactive={false}
            pathOptions={{
              color: '#3fb950',
              weight: 2,
              opacity: 0.6,
              dashArray: '5, 10',
            }}
          />
        ))}

        {/* ═══ Heatmap Layer — merged density zones with multi-color gradient rings ═══ */}
        {mapState.visibleLayers.heatmap && !mapState.selectedWorkOrderId && heatmapCells.length > 0 && heatmapCells.map((cell, idx) => {
            const { ringCount, outerRadius, colorStart, gradientPalette, blendedIntensity, coreColor, riskColor, riskLabel, costStr, pctOfTotal, insightText } = cell;
            return (
              <React.Fragment key={`heat-${idx}`}>
                {/* Multi-color gradient rings — outermost is interactive with popup, rest non-interactive */}
                {Array.from({ length: ringCount }).map((_, ri) => {
                  const t = ri / (ringCount - 1 || 1); // 0=outermost, 1=innermost
                  const r = outerRadius * (1 - t * 0.72);
                  const colorIdx = Math.min(colorStart + ri, gradientPalette.length - 1);
                  const opacity = 0.08 + t * 0.3 + blendedIntensity * 0.12;
                  const isOutermost = ri === 0;
                  return isOutermost ? (
                    <Circle
                      key={`heat-ring-${idx}-${ri}`}
                      center={[cell.lat, cell.lng]}
                      radius={r}
                      interactive={true}
                      pane="ringOverlayPane"
                      pathOptions={{
                        color: 'transparent',
                        fillColor: gradientPalette[colorIdx],
                        fillOpacity: Math.min(0.52, opacity),
                        weight: 0,
                        opacity: 0.4,
                        className: 'map-overlay-ring',
                      }}
                    >
                      <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={280} minWidth={240}>
                        <div style={{ width: 250, background: theme === 'light' ? '#ffffff' : '#1e293b', borderRadius: 10, overflow: 'hidden', color: theme === 'light' ? '#1f2328' : '#fff' }}>
                          <div style={{ background: `linear-gradient(135deg, ${coreColor}${theme === 'light' ? '35' : '60'}, ${gradientPalette[colorStart]}${theme === 'light' ? '20' : '30'})`, padding: '10px 14px', borderBottom: `2px solid ${coreColor}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${gradientPalette[colorStart]}60, ${coreColor}80)`, border: `2px solid ${coreColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>H</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700 }}>Heatmap Ring</div>
                                <div style={{ color: riskColor, fontSize: 10, fontWeight: 600 }}>{riskLabel} · {Math.round(outerRadius)}m radius</div>
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: coreColor }}>{cell.count}</div>
                            </div>
                          </div>
                          <div style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 12, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)', marginBottom: 8 }}>{insightText}</div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                              <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: `${coreColor}18` }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: coreColor }}>{cell.count}</div>
                                <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Issues</div>
                              </div>
                              <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.15)' }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#0a4264' : '#e5e5e5' }}>{costStr}</div>
                                <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Cost</div>
                              </div>
                              <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)' }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#16a34a' : '#22c55e' }}>{pctOfTotal}%</div>
                                <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Of Total</div>
                              </div>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}>
                                {cell.criticalCount > 0 && <div style={{ flex: cell.criticalCount, background: '#ef4444' }} />}
                                {cell.highCount > 0 && <div style={{ flex: cell.highCount, background: '#f59e0b' }} />}
                                {cell.medCount > 0 && <div style={{ flex: cell.medCount, background: '#3b82f6' }} />}
                                {cell.lowCount > 0 && <div style={{ flex: cell.lowCount, background: '#22c55e' }} />}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                                {cell.criticalCount > 0 && <span style={{ fontSize: 8, color: '#ef4444', fontWeight: 600 }}>{cell.criticalCount} critical</span>}
                                {cell.highCount > 0 && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 600 }}>{cell.highCount} high</span>}
                                {cell.medCount > 0 && <span style={{ fontSize: 8, color: '#3b82f6', fontWeight: 600 }}>{cell.medCount} medium</span>}
                                {cell.lowCount > 0 && <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 600 }}>{cell.lowCount} low</span>}
                              </div>
                            </div>
                            <div style={{ background: theme === 'light' ? 'rgba(10,66,100,0.06)' : 'rgba(229,229,229,0.1)', borderLeft: `3px solid ${theme === 'light' ? '#0a4264' : '#e5e5e5'}`, borderRadius: '0 6px 6px 0', padding: '6px 10px' }}>
                              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: theme === 'light' ? '#0a4264' : '#e5e5e5', marginBottom: 3 }}>Contains</div>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {Object.entries(cell.types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                                  <span key={type} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{type} ({count})</span>
                                ))}
                                {cell.nearSchoolCount > 0 && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>near school ({cell.nearSchoolCount})</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Circle>
                  ) : (
                    <Circle
                      key={`heat-ring-${idx}-${ri}`}
                      center={[cell.lat, cell.lng]}
                      radius={r}
                      interactive={false}
                      pane="ringOverlayPane"
                      pathOptions={{
                        color: ri === ringCount - 1 ? gradientPalette[colorIdx] : 'transparent',
                        fillColor: gradientPalette[colorIdx],
                        fillOpacity: Math.min(0.52, opacity),
                        weight: ri === ringCount - 1 ? 1.5 : 0,
                        opacity: 0.4,
                        className: 'map-overlay-ring',
                      }}
                    />
                  );
                })}
                {/* Clickable center dot with rich popup */}
                <CircleMarker
                  center={[cell.lat, cell.lng]}
                  radius={8 + blendedIntensity * 8}
                  pathOptions={{ color: '#fff', fillColor: coreColor, fillOpacity: 0.9, weight: 2 }}
                >
                  <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={280} minWidth={240}>
                    <div style={{
                      width: 250,
                      background: theme === 'light' ? '#ffffff' : '#1e293b',
                      borderRadius: 10, overflow: 'hidden',
                      color: theme === 'light' ? '#1f2328' : '#fff',
                    }}>
                      {/* Gradient Header */}
                      <div style={{
                        background: `linear-gradient(135deg, ${coreColor}${theme === 'light' ? '35' : '60'}, ${gradientPalette[colorStart]}${theme === 'light' ? '20' : '30'})`,
                        padding: '12px 14px',
                        borderBottom: `2px solid ${coreColor}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8,
                            background: `linear-gradient(135deg, ${gradientPalette[colorStart]}60, ${coreColor}80)`,
                            border: `2px solid ${coreColor}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                          }}>H</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>Density Zone</div>
                            <div style={{ color: riskColor, fontSize: 10, fontWeight: 600, marginTop: 1 }}>{riskLabel}</div>
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: coreColor, lineHeight: 1 }}>{cell.count}</div>
                        </div>
                      </div>
                      {/* Stats Grid */}
                      <div style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: `${coreColor}${theme === 'light' ? '12' : '20'}` }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: coreColor }}>{cell.count}</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Issues</div>
                          </div>
                          <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.2)' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#6366f1' : '#818cf8' }}>{costStr}</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Est. Cost</div>
                          </div>
                          <div style={{ flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center', background: theme === 'light' ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.2)' }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#16a34a' : '#22c55e' }}>{pctOfTotal}%</div>
                            <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Of Total</div>
                          </div>
                        </div>
                        {/* Severity breakdown bar */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 4, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)' }}>Severity Breakdown</div>
                          <div style={{ display: 'flex', gap: 2, height: 6, borderRadius: 3, overflow: 'hidden', background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)' }}>
                            {cell.criticalCount > 0 && <div style={{ flex: cell.criticalCount, background: '#ef4444', borderRadius: 2 }} />}
                            {cell.highCount > 0 && <div style={{ flex: cell.highCount, background: '#f59e0b', borderRadius: 2 }} />}
                            {cell.medCount > 0 && <div style={{ flex: cell.medCount, background: '#3b82f6', borderRadius: 2 }} />}
                            {cell.lowCount > 0 && <div style={{ flex: cell.lowCount, background: '#22c55e', borderRadius: 2 }} />}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                            {cell.criticalCount > 0 && <span style={{ fontSize: 8, color: '#ef4444', fontWeight: 600 }}>{cell.criticalCount} critical</span>}
                            {cell.highCount > 0 && <span style={{ fontSize: 8, color: '#f59e0b', fontWeight: 600 }}>{cell.highCount} high</span>}
                            {cell.medCount > 0 && <span style={{ fontSize: 8, color: '#3b82f6', fontWeight: 600 }}>{cell.medCount} medium</span>}
                            {cell.lowCount > 0 && <span style={{ fontSize: 8, color: '#22c55e', fontWeight: 600 }}>{cell.lowCount} low</span>}
                          </div>
                        </div>
                        {/* Issue type tags */}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                          {Object.entries(cell.types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                            <span key={type} style={{
                              fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 600,
                              background: theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
                              color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.65)',
                            }}>{type} ({count})</span>
                          ))}
                          {cell.nearSchoolCount > 0 && (
                            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 600, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Near school ({cell.nearSchoolCount})</span>
                          )}
                        </div>
                        {/* Insight */}
                        <div style={{
                          background: theme === 'light' ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.1)',
                          borderLeft: `3px solid ${theme === 'light' ? '#0a4264' : '#e5e5e5'}`, borderRadius: '0 6px 6px 0',
                          padding: '6px 10px', fontSize: 11, lineHeight: 1.5,
                          color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)',
                        }}>
                          <span style={{ fontWeight: 700, color: theme === 'light' ? '#0a4264' : '#e5e5e5' }}>Insight: </span>
                          {insightText}
                        </div>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </React.Fragment>
            );
          })}

        {/* ═══ Schools Layer — school locations with proximity zones ═══ */}
        {mapState.visibleLayers.schools && !mapState.selectedWorkOrderId && schools.length > 0 && schools.filter(s => s.latitude != null && s.longitude != null && isFinite(s.latitude) && isFinite(s.longitude)).map((school) => {
          const schoolColor = school.type === 'high' ? '#8b5cf6' : school.type === 'middle' ? '#3b82f6' : '#22c55e';
          const schoolIcon = school.type === 'high' ? 'H' : school.type === 'middle' ? 'M' : 'E';
          const nearbyCount = filteredWorkOrders.filter(wo => {
            const dlat = wo.latitude - school.latitude;
            const dlng = wo.longitude - school.longitude;
            return Math.sqrt(dlat * dlat + dlng * dlng) < 0.004; // ~400m
          }).length;

          return (
            <React.Fragment key={`school-${school.id}`}>
              {/* Proximity zone — 400m safety radius — INTERACTIVE with popup, in ring pane */}
              <Circle
                center={[school.latitude, school.longitude]}
                radius={400}
                interactive={true}
                pane="ringOverlayPane"
                pathOptions={{
                  color: schoolColor,
                  fillColor: schoolColor,
                  fillOpacity: 0.06,
                  weight: 1.5,
                  opacity: 0.4,
                  dashArray: '6, 4',
                  className: 'map-overlay-ring',
                }}
              >
                <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={260} minWidth={220}>
                  <div style={{ width: 230, background: theme === 'light' ? '#ffffff' : '#1e293b', borderRadius: 10, overflow: 'hidden', color: theme === 'light' ? '#1f2328' : '#fff' }}>
                    <div style={{ background: `linear-gradient(135deg, ${schoolColor}${theme === 'light' ? '30' : '50'}, ${schoolColor}${theme === 'light' ? '10' : '20'})`, padding: '10px 14px', borderBottom: `2px solid ${schoolColor}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${schoolColor}40`, border: `2px solid ${schoolColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff' }}>S</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>School Safety Ring</div>
                          <div style={{ color: schoolColor, fontSize: 10, fontWeight: 600 }}>{school.name} · 400m zone</div>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
                        This 400-meter safety ring surrounds {school.name}. {nearbyCount > 0 ? `${nearbyCount} infrastructure issue${nearbyCount > 1 ? 's' : ''} detected within this zone that may affect student safety.` : 'No infrastructure issues detected in this zone.'}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: nearbyCount > 3 ? 'rgba(239,68,68,0.15)' : nearbyCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: nearbyCount > 3 ? '#ef4444' : nearbyCount > 0 ? '#f59e0b' : '#22c55e' }}>{nearbyCount}</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Nearby Issues</div>
                        </div>
                        <div style={{ flex: 1, borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: `${schoolColor}${theme === 'light' ? '12' : '20'}` }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: schoolColor }}>400m</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Radius</div>
                        </div>
                      </div>
                      {nearbyCount > 0 && (
                        <div style={{ background: 'rgba(245,158,11,0.08)', borderLeft: '3px solid #f59e0b', borderRadius: '0 6px 6px 0', padding: '6px 10px', fontSize: 11, lineHeight: 1.4, color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)' }}>
                          <span style={{ fontWeight: 700, color: '#f59e0b' }}>Safety: </span>
                          {nearbyCount > 3 ? 'Multiple hazards near school — prioritize repairs for student safety.' : 'Issues found nearby — monitor and schedule repairs.'}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Circle>
              {/* School marker */}
              <CircleMarker
                center={[school.latitude, school.longitude]}
                radius={12}
                pathOptions={{
                  color: '#fff',
                  fillColor: schoolColor,
                  fillOpacity: 1,
                  weight: 2.5,
                }}
              >
                <Popup className={`cluster-popup ${theme === 'light' ? 'cluster-popup-light' : ''}`} maxWidth={260} minWidth={220}>
                  <div style={{
                    width: 230,
                    background: theme === 'light' ? '#ffffff' : '#1e293b',
                    borderRadius: 10,
                    overflow: 'hidden',
                    color: theme === 'light' ? '#1f2328' : '#fff',
                  }}>
                    {/* Header */}
                    <div style={{
                      background: `linear-gradient(135deg, ${schoolColor}${theme === 'light' ? '30' : '50'}, ${schoolColor}${theme === 'light' ? '10' : '20'})`,
                      padding: '12px 14px',
                      borderBottom: `2px solid ${schoolColor}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8,
                          background: `${schoolColor}40`, border: `2px solid ${schoolColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 700, color: theme === 'light' ? '#1f2328' : '#fff',
                        }}>S</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: theme === 'light' ? '#1f2328' : '#fff' }}>
                            {school.name}
                          </div>
                          <div style={{ color: schoolColor, fontSize: 10, fontWeight: 600, marginTop: 2, textTransform: 'capitalize' }}>
                            {school.type} School
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.6)', marginBottom: 8, lineHeight: 1.4 }}>
                        {school.address}
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center',
                          background: nearbyCount > 3 ? 'rgba(239,68,68,0.15)' : nearbyCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)',
                        }}>
                          <div style={{
                            fontSize: 18, fontWeight: 700,
                            color: nearbyCount > 3 ? '#ef4444' : nearbyCount > 0 ? '#f59e0b' : '#22c55e',
                          }}>{nearbyCount}</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                            Nearby Issues
                          </div>
                        </div>
                        <div style={{
                          flex: 1, borderRadius: 6, padding: '6px 4px', textAlign: 'center',
                          background: `${schoolColor}${theme === 'light' ? '12' : '20'}`,
                        }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: schoolColor }}>400m</div>
                          <div style={{ fontSize: 8, color: theme === 'light' ? '#57606a' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                            Safety Zone
                          </div>
                        </div>
                      </div>

                      {/* Risk assessment */}
                      {nearbyCount > 0 && (
                        <div style={{
                          background: theme === 'light' ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.1)',
                          borderLeft: '3px solid #f59e0b',
                          borderRadius: '0 6px 6px 0',
                          padding: '6px 10px',
                          fontSize: 11, lineHeight: 1.5,
                          color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)',
                        }}>
                          <span style={{ fontWeight: 700, color: '#f59e0b' }}>Safety: </span>
                          {nearbyCount > 3
                            ? `${nearbyCount} infrastructure issues within the school safety zone. Prioritize repairs for student safety.`
                            : `${nearbyCount} issue${nearbyCount > 1 ? 's' : ''} detected nearby. Monitor and schedule repairs.`
                          }
                        </div>
                      )}
                      {nearbyCount === 0 && (
                        <div style={{
                          background: theme === 'light' ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.1)',
                          borderLeft: '3px solid #22c55e',
                          borderRadius: '0 6px 6px 0',
                          padding: '6px 10px',
                          fontSize: 11, lineHeight: 1.5,
                          color: theme === 'light' ? '#374151' : 'rgba(255,255,255,0.7)',
                        }}>
                          <span style={{ fontWeight: 700, color: '#22c55e' }}>Clear: </span>
                          No infrastructure issues within the school safety zone.
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
              {/* Inner label dot — non-interactive */}
              <CircleMarker
                center={[school.latitude, school.longitude]}
                radius={5}
                interactive={false}
                pathOptions={{
                  color: schoolColor,
                  fillColor: '#fff',
                  fillOpacity: 1,
                  weight: 0,
                }}
              />
            </React.Fragment>
          );
        })}

        {/* Work Order Markers — pane="workOrderPane" + zIndexOffset ensures they ALWAYS render above all rings/circles */}
        {mapState.visibleLayers.workOrders && filteredWorkOrders
          .filter(workOrder => !mapState.selectedWorkOrderId || workOrder.id === mapState.selectedWorkOrderId)
          .map((workOrder) => {
          const isSelected = selectedWorkOrderIds.includes(workOrder.id);
          return (
            <Marker
              key={workOrder.id}
              position={[workOrder.latitude, workOrder.longitude]}
              icon={createPriorityIcon(
                workOrder.severity,
                workOrder.severity === 'critical',
                isSelected
              )}
              pane="workOrderPane"
              zIndexOffset={1000}
              ref={(el: any) => { if (el) markerRefs.current.set(workOrder.id, el); }}
              eventHandlers={{
                click: () => {
                  console.log('[MARKER CLICK]', { workOrderId: workOrder.id, title: workOrder.title, selectionMode, isSelected });
                  if (selectionMode === 'single') {
                    // Toggle selection in single mode
                    if (onSelectionChange) {
                      if (isSelected) {
                        onSelectionChange(selectedWorkOrderIds.filter(id => id !== workOrder.id));
                      } else {
                        onSelectionChange([...selectedWorkOrderIds, workOrder.id]);
                      }
                    }
                  }
                  onWorkOrderSelect(workOrder.id);
                  console.log('[MARKER CLICK] onWorkOrderSelect called successfully');
                },
              }}
            >
            <Popup className="wo-popup" eventHandlers={{ add: () => setPopupTab('overview') }}>
              <div className="wo-popup-card" style={{ minWidth: 300, maxWidth: 340 }}>
                {/* Priority color stripe */}
                <div style={{
                  height: 4,
                  background: workOrder.severity === 'critical' ? '#ef4444' : workOrder.severity === 'high' ? '#f59e0b' : workOrder.severity === 'medium' ? '#3b82f6' : '#22c55e',
                  borderRadius: '10px 10px 0 0',
                }} />

                {/* Header — always visible */}
                <div style={{ padding: '10px 14px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 2 }}>{workOrder.title}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Location24Regular style={{ width: 12, height: 12, flexShrink: 0 }} /> {workOrder.address}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                      color: workOrder.severity === 'critical' ? '#dc2626' : workOrder.severity === 'high' ? '#d97706' : workOrder.severity === 'medium' ? '#2563eb' : '#16a34a',
                      background: workOrder.severity === 'critical' ? '#fef2f2' : workOrder.severity === 'high' ? '#fffbeb' : workOrder.severity === 'medium' ? '#eff6ff' : '#f0fdf4',
                      border: `1px solid ${workOrder.severity === 'critical' ? '#fecaca' : workOrder.severity === 'high' ? '#fed7aa' : workOrder.severity === 'medium' ? '#bfdbfe' : '#bbf7d0'}`,
                    }}>
                      {getPriorityLabel(workOrder.severity)}
                    </span>
                  </div>
                </div>

                {/* Tab bar */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', padding: '0 14px', gap: 0 }}>
                  {(['overview', 'history', 'details', 'cost'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={(e) => { e.stopPropagation(); setPopupTab(tab); }}
                      style={{
                        flex: 1, padding: '6px 0', border: 'none', background: 'none', cursor: 'pointer',
                        fontSize: 11, fontWeight: popupTab === tab ? 600 : 400,
                        color: popupTab === tab ? '#3b82f6' : '#9ca3af',
                        borderBottom: popupTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
                        textTransform: 'capitalize', transition: 'all 0.15s',
                      }}
                    >
                      {tab === 'cost' ? 'Cost' : tab}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {/* ── Overview Tab ── */}
                  {popupTab === 'overview' && (
                    <>
                      {/* Info pills */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '8px 14px' }}>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                          {workOrder.issueType.charAt(0).toUpperCase() + workOrder.issueType.slice(1)}
                        </span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                          {workOrder.status.replace('_', ' ').charAt(0).toUpperCase() + workOrder.status.replace('_', ' ').slice(1)}
                        </span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                          {workOrder.zone}
                        </span>
                        {workOrder.nearSchool && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600 }}>
                            School Zone
                          </span>
                        )}
                      </div>

                      {/* Stats grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#e5e7eb' }}>
                        <div style={{ padding: '8px 14px', background: '#f9fafb' }}>
                          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Priority</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{workOrder.priorityScore.toFixed(1)}</div>
                        </div>
                        {(() => {
                          const decayMatch = decayOverlay?.find(d => d.id === workOrder.id);
                          const decayCost = decayMatch ? Math.round(decayMatch.estimatedCost * decayMatch.costMultiplier) : null;
                          const costIncrease = decayCost ? decayCost - workOrder.estimatedCost : 0;
                          return (
                            <div style={{ padding: '8px 14px', background: '#f9fafb' }}>
                              <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Est. Cost</div>
                              <div style={{ fontSize: 18, fontWeight: 700, color: decayCost && costIncrease > 0 ? '#dc2626' : '#111827' }}>
                                ${(decayCost ?? workOrder.estimatedCost).toLocaleString()}
                              </div>
                              {decayCost && costIncrease > 0 && (
                                <div style={{ fontSize: 9, color: '#dc2626', fontWeight: 600, marginTop: 1 }}>
                                  ↑ +${costIncrease.toLocaleString()} · Mo {decayMonth}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Badges & date */}
                      <div style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {workOrder.assignedCrewId && (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                              Crew Assigned
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                          {new Date(workOrder.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </>
                  )}

                  {/* ── History Tab ── */}
                  {popupTab === 'history' && (
                    <div style={{ padding: '8px 14px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {getWorkOrderHistory(workOrder).map((entry, idx) => (
                          <div key={idx} style={{ display: 'flex', gap: 10, paddingBottom: 10 }}>
                            {/* Timeline line */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: idx === 0 ? '#3b82f6' : '#d1d5db', flexShrink: 0 }} />
                              {idx < getWorkOrderHistory(workOrder).length - 1 && (
                                <div style={{ width: 1, flex: 1, background: '#e5e7eb', marginTop: 2 }} />
                              )}
                            </div>
                            <div style={{ flex: 1, paddingBottom: 2 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937' }}>{entry.event}</div>
                              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{entry.note}</div>
                              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>
                                {entry.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Details Tab ── */}
                  {popupTab === 'details' && (
                    <div style={{ padding: '8px 14px' }}>
                      {/* Full description */}
                      {workOrder.description && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Description</div>
                          <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>{workOrder.description}</div>
                        </div>
                      )}
                      {/* Detail rows */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[
                          { label: 'Work Order ID', value: workOrder.id },
                          { label: 'Issue Type', value: workOrder.issueType.charAt(0).toUpperCase() + workOrder.issueType.slice(1) },
                          { label: 'Zone', value: workOrder.zone },
                          { label: 'Status', value: workOrder.status.replace('_', ' ').charAt(0).toUpperCase() + workOrder.status.replace('_', ' ').slice(1) },
                          { label: 'Created', value: new Date(workOrder.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
                          { label: 'Coordinates', value: `${workOrder.latitude.toFixed(5)}, ${workOrder.longitude.toFixed(5)}` },
                          { label: 'Near School', value: workOrder.nearSchool ? 'Yes' : 'No' },
                          { label: 'Assigned Crew', value: workOrder.assignedCrewId || 'Unassigned' },
                        ].map((row, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>{row.label}</span>
                            <span style={{ fontSize: 11, color: '#1f2937', fontWeight: 500, maxWidth: 180, textAlign: 'right', wordBreak: 'break-all' }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Cost Breakdown Tab ── */}
                  {popupTab === 'cost' && (() => {
                    const config = getPricingConfig();
                    const costData = calculateRepairCost(
                      workOrder.issueType as 'pothole' | 'sidewalk' | 'concrete',
                      workOrder.severity as 'low' | 'medium' | 'high' | 'critical',
                      config
                    );
                    const total = costData.totalCost;
                    const laborPct = total > 0 ? (costData.laborCost / total) * 100 : 0;
                    const materialPct = total > 0 ? (costData.materialCost / total) * 100 : 0;
                    const equipPct = total > 0 ? (costData.equipmentCost / total) * 100 : 0;

                    return (
                      <div style={{ padding: '8px 14px' }}>
                        {/* Total cost header */}
                        <div style={{
                          textAlign: 'center', padding: '10px 0 8px',
                          borderBottom: '1px solid #f3f4f6', marginBottom: 8,
                        }}>
                          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Estimated Total</div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>${total.toLocaleString()}</div>
                          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{costData.laborHours}h labor - {workOrder.issueType} / {workOrder.severity}</div>
                        </div>

                        {/* Cost split bar */}
                        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 6, background: '#f3f4f6' }}>
                          <div style={{ width: `${laborPct}%`, background: '#3b82f6' }} />
                          <div style={{ width: `${materialPct}%`, background: '#22c55e' }} />
                          <div style={{ width: `${equipPct}%`, background: '#f59e0b' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontSize: 9, color: '#3b82f6', fontWeight: 600 }}>Labor ${costData.laborCost.toLocaleString()}</span>
                          <span style={{ fontSize: 9, color: '#22c55e', fontWeight: 600 }}>Material ${costData.materialCost.toLocaleString()}</span>
                          <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>Equip ${costData.equipmentCost.toLocaleString()}</span>
                        </div>

                        {/* Line items */}
                        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Line Items</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          {costData.breakdown.map((line, li) => (
                            <div key={li} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '4px 0', borderBottom: '1px solid #f9fafb',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, color: '#1f2937', fontWeight: 500 }}>{line.item}</div>
                                <div style={{ fontSize: 9, color: '#9ca3af' }}>{line.qty} {line.unit} x ${line.unitCost.toFixed(2)}</div>
                              </div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', flexShrink: 0, marginLeft: 8 }}>
                                ${line.total.toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Contingency note */}
                        <div style={{
                          marginTop: 8, padding: '6px 8px', borderRadius: 6,
                          background: '#fffbeb', border: '1px solid #fde68a',
                          fontSize: 9, color: '#92400e', lineHeight: 1.4,
                        }}>
                          Costs based on your configured pricing. Edit rates in the Wizard pricing step.
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Dispatch button — always visible at bottom */}
                {onDispatchCrew && (
                  <div style={{ padding: '8px 14px 10px', borderTop: '1px solid #f3f4f6' }}>
                    <button
                      onClick={() => onDispatchCrew(workOrder.id)}
                      style={{
                        width: '100%', padding: '7px 0', border: 'none', borderRadius: 8,
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      Dispatch Crew
                    </button>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
          );
        })}

        {/* Crew Markers */}
        {mapState.visibleLayers.crews && !mapState.selectedWorkOrderId && crews.map((crew) => (
          <Marker
            key={crew.id}
            position={[crew.currentLat, crew.currentLng]}
            icon={createCrewIcon()}
          >
            <Popup className="wo-popup">
              <div className="wo-popup-card">
                {/* Blue stripe for crews */}
                <div style={{ height: 4, background: '#3b82f6', borderRadius: '10px 10px 0 0' }} />

                {/* Header */}
                <div style={{ padding: '12px 14px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8,
                      background: '#eff6ff', border: '1px solid #bfdbfe',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>
                      <Navigation24Regular />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{crew.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                          padding: '2px 8px', borderRadius: 12,
                          color: crew.status === 'available' ? '#16a34a' : crew.status === 'assigned' ? '#2563eb' : '#9ca3af',
                          background: crew.status === 'available' ? '#f0fdf4' : crew.status === 'assigned' ? '#eff6ff' : '#f9fafb',
                          border: `1px solid ${crew.status === 'available' ? '#bbf7d0' : crew.status === 'assigned' ? '#bfdbfe' : '#e5e7eb'}`,
                        }}>
                          {crew.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#e5e7eb' }}>
                  <div style={{ padding: '10px 10px', background: '#f9fafb', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Members</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{crew.memberCount}</div>
                  </div>
                  <div style={{ padding: '10px 10px', background: '#f9fafb', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Efficiency</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: crew.efficiencyRating >= 0.8 ? '#16a34a' : crew.efficiencyRating >= 0.6 ? '#d97706' : '#dc2626' }}>
                      {Math.round(crew.efficiencyRating * 100)}%
                    </div>
                  </div>
                  <div style={{ padding: '10px 10px', background: '#f9fafb', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Jobs</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{crew.assignedWorkOrders.length}</div>
                  </div>
                </div>

                {/* Specialization */}
                <div style={{ padding: '8px 14px 10px', display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #f3f4f6' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#4b5563', border: '1px solid #e5e7eb' }}>
                    {crew.specialization.charAt(0).toUpperCase() + crew.specialization.slice(1)}
                  </span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ═══ Predictive Hotspot Zones ═══ */}
        {showHotspots && hotspots.map((hotspot) => {
          const riskLabel = hotspot.riskScore > 0.6 ? 'HIGH RISK' : hotspot.riskScore > 0.3 ? 'MEDIUM RISK' : 'LOW RISK';
          return (
            <React.Fragment key={`hotspot-${hotspot.id}`}>
              {/* Outer glow ring */}
              <Circle
                center={[hotspot.center.lat, hotspot.center.lng]}
                radius={hotspot.radius * 1.3}
                pathOptions={{
                  color: hotspot.color,
                  fillColor: hotspot.color,
                  fillOpacity: 0.08,
                  weight: 0,
                  interactive: false,
                }}
                pane="ringOverlayPane"
              />
              {/* Main risk zone */}
              <Circle
                center={[hotspot.center.lat, hotspot.center.lng]}
                radius={hotspot.radius}
                pathOptions={{
                  color: hotspot.color,
                  fillColor: hotspot.color,
                  fillOpacity: 0.25,
                  weight: 2.5,
                  opacity: 0.85,
                  dashArray: '8 5',
                }}
                pane="ringOverlayPane"
              >
                <Popup className="wo-popup" autoPan={false}>
                  <div className="wo-popup-card" style={{ minWidth: 260, maxWidth: 300 }}>
                    {/* Risk color stripe */}
                    <div style={{
                      height: 4,
                      background: `linear-gradient(90deg, ${hotspot.color}, ${hotspot.color}88)`,
                      borderRadius: '10px 10px 0 0',
                    }} />

                    {/* Header */}
                    <div style={{ padding: '10px 14px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{hotspot.label}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Predictive Risk Zone</div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                          padding: '3px 8px', borderRadius: 20, whiteSpace: 'nowrap',
                          color: hotspot.color, background: `${hotspot.color}18`, border: `1px solid ${hotspot.color}40`,
                        }}>
                          {riskLabel}
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: '#e5e7eb' }}>
                      <div style={{ padding: '8px 10px', background: '#f9fafb', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Risk Score</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: hotspot.color }}>{Math.round(hotspot.riskScore * 100)}%</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: '#f9fafb', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Expected</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{hotspot.expectedIssues}</div>
                      </div>
                      <div style={{ padding: '8px 10px', background: '#f9fafb', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Type</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', textTransform: 'capitalize' }}>{hotspot.dominantType}</div>
                      </div>
                    </div>

                    {/* Contributing Factors */}
                    <div style={{ padding: '8px 14px 10px' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Contributing Factors</div>
                      {hotspot.factors.slice(0, 4).map((factor, fi) => (
                        <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: '#4b5563' }}>{factor.name}</span>
                              <span style={{ fontSize: 10, color: '#9ca3af' }}>{Math.round(factor.weight * 100)}%</span>
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: '#f3f4f6', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', borderRadius: 2,
                                width: `${factor.weight * 100}%`,
                                background: `linear-gradient(90deg, ${hotspot.color}, ${hotspot.color}88)`,
                              }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Circle>
              {/* Center dot */}
              <CircleMarker
                center={[hotspot.center.lat, hotspot.center.lng]}
                radius={4}
                pathOptions={{
                  color: hotspot.color,
                  fillColor: hotspot.color,
                  fillOpacity: 0.8,
                  weight: 2,
                  opacity: 1,
                }}
                pane="ringOverlayPane"
                interactive={false}
              />
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Add custom CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.3);
            opacity: 0.7;
          }
        }
        
        .pulse-marker > div {
          animation: pulse 2s ease-in-out infinite;
        }
        
        .leaflet-popup-content-wrapper {
          padding: 0;
          overflow: hidden;
          border-radius: 12px;
        }
        
        .leaflet-popup-content {
          margin: 0;
        }
        
        /* Cluster popup specific styling */
        .cluster-popup .leaflet-popup-content-wrapper {
          background: transparent;
          box-shadow: 0 10px 40px rgba(0,0,0,0.5);
          border: none;
          padding: 0;
        }
        
        .cluster-popup .leaflet-popup-content {
          margin: 0;
          width: auto !important;
        }
        
        .cluster-popup .leaflet-popup-tip {
          background: #1e293b;
          border: none;
        }
        
        .cluster-popup .leaflet-popup-close-button {
          color: rgba(255,255,255,0.6);
          font-size: 20px;
          right: 8px;
          top: 8px;
        }
        
        .cluster-popup .leaflet-popup-close-button:hover {
          color: #fff;
        }
        
        /* Light mode cluster popup */
        .cluster-popup-light .leaflet-popup-content-wrapper {
          background: #ffffff;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        
        .cluster-popup-light .leaflet-popup-tip {
          background: #ffffff;
        }
        
        .cluster-popup-light .leaflet-popup-close-button {
          color: #6e7781;
        }
        
        .cluster-popup-light .leaflet-popup-close-button:hover {
          color: #1f2328;
        }
      `}</style>
    </div>
  );
};

// Helper component for legend dots
const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: color,
      border: '2px solid rgba(255,255,255,0.3)',
    }} />
    <Text size={200}>{label}</Text>
  </div>
);

// Helper component for layer toggle rows in the legend
const LayerToggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  color: string;
  label: string;
  icon: React.ReactNode;
}> = ({ checked, onChange, color, label, icon }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: 8,
    cursor: 'pointer', fontSize: 12,
    padding: '3px 4px',
    borderRadius: 6,
    background: checked ? color + '12' : 'transparent',
    transition: 'background 0.15s ease',
  }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ accentColor: color, width: 14, height: 14, cursor: 'pointer' }}
    />
    <span style={{ display: 'flex', alignItems: 'center', color: checked ? color : 'var(--text-muted)', opacity: checked ? 1 : 0.6, transition: 'all 0.15s ease' }}>
      {icon}
    </span>
    <Text size={200} style={{ color: checked ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'color 0.15s ease' }}>{label}</Text>
  </label>
);

export default InfraMap;

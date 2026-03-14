import React, { useRef, useEffect, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// ============================================
// MAPLIBRE GL MAP - Real Vector Map
// ============================================

interface WorkOrderMarker {
  id: string;
  title: string;
  address: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issueType: string;
  status: string;
  lat: number;
  lng: number;
}

interface CrewMarker {
  id: string;
  name: string;
  status: 'available' | 'assigned' | 'offline';
  lat: number;
  lng: number;
}

// Lake Forest, IL coordinates and embedded work orders
const LAKE_FOREST_CENTER: [number, number] = [-87.8407, 42.2586];

const WORK_ORDERS: WorkOrderMarker[] = [
  { id: 'WO-001', title: 'Water Main Break', address: '123 Deerpath Rd', severity: 'critical', issueType: 'Water', status: 'open', lat: 42.2620, lng: -87.8450 },
  { id: 'WO-002', title: 'Pothole Repair', address: '456 Western Ave', severity: 'high', issueType: 'Road', status: 'open', lat: 42.2550, lng: -87.8380 },
  { id: 'WO-003', title: 'Street Light Out', address: '789 Illinois Rd', severity: 'medium', issueType: 'Electrical', status: 'in_progress', lat: 42.2610, lng: -87.8320 },
  { id: 'WO-004', title: 'Sewer Backup', address: '321 Sheridan Rd', severity: 'critical', issueType: 'Sewer', status: 'open', lat: 42.2530, lng: -87.8280 },
  { id: 'WO-005', title: 'Sidewalk Crack', address: '654 McKinley Rd', severity: 'low', issueType: 'Sidewalk', status: 'open', lat: 42.2570, lng: -87.8420 },
  { id: 'WO-006', title: 'Traffic Signal', address: '987 Waukegan Rd', severity: 'high', issueType: 'Traffic', status: 'open', lat: 42.2590, lng: -87.8350 },
  { id: 'WO-007', title: 'Tree Removal', address: '147 Laurel Ave', severity: 'medium', issueType: 'Parks', status: 'open', lat: 42.2640, lng: -87.8480 },
  { id: 'WO-008', title: 'Fire Hydrant', address: '258 Conway Farms Dr', severity: 'high', issueType: 'Water', status: 'open', lat: 42.2560, lng: -87.8300 },
  { id: 'WO-009', title: 'Storm Drain Clog', address: '369 Green Bay Rd', severity: 'medium', issueType: 'Drainage', status: 'in_progress', lat: 42.2500, lng: -87.8400 },
  { id: 'WO-010', title: 'Gas Leak Report', address: '741 Telegraph Rd', severity: 'critical', issueType: 'Gas', status: 'open', lat: 42.2480, lng: -87.8450 },
  { id: 'WO-011', title: 'Graffiti Removal', address: '852 Market Square', severity: 'low', issueType: 'Vandalism', status: 'open', lat: 42.2585, lng: -87.8410 },
  { id: 'WO-012', title: 'Fallen Sign', address: '963 Academy Dr', severity: 'medium', issueType: 'Signs', status: 'open', lat: 42.2520, lng: -87.8260 },
  { id: 'WO-013', title: 'Water Pressure', address: '159 Washington Cir', severity: 'high', issueType: 'Water', status: 'open', lat: 42.2650, lng: -87.8500 },
  { id: 'WO-014', title: 'Guardrail Damage', address: '357 Route 41', severity: 'high', issueType: 'Road', status: 'open', lat: 42.2600, lng: -87.8240 },
  { id: 'WO-015', title: 'Park Bench Repair', address: '468 Forest Park', severity: 'low', issueType: 'Parks', status: 'open', lat: 42.2470, lng: -87.8350 },
  { id: 'WO-016', title: 'Manhole Cover', address: '579 Old Elm Rd', severity: 'critical', issueType: 'Sewer', status: 'open', lat: 42.2450, lng: -87.8420 },
  { id: 'WO-017', title: 'Crosswalk Paint', address: '680 School Ln', severity: 'medium', issueType: 'Road', status: 'open', lat: 42.2440, lng: -87.8300 },
  { id: 'WO-018', title: 'Fountain Repair', address: '791 Town Center', severity: 'low', issueType: 'Parks', status: 'open', lat: 42.2420, lng: -87.8380 },
  { id: 'WO-019', title: 'Cable Box Down', address: '802 Ridge Rd', severity: 'medium', issueType: 'Utilities', status: 'open', lat: 42.2660, lng: -87.8520 },
  { id: 'WO-020', title: 'Flooding Issue', address: '913 Lake Rd', severity: 'high', issueType: 'Drainage', status: 'open', lat: 42.2540, lng: -87.8220 },
];

const CREWS: CrewMarker[] = [
  { id: 'C-01', name: 'Alpha Team', status: 'available', lat: 42.2580, lng: -87.8430 },
  { id: 'C-02', name: 'Beta Team', status: 'assigned', lat: 42.2605, lng: -87.8340 },
  { id: 'C-03', name: 'Delta Team', status: 'available', lat: 42.2490, lng: -87.8370 },
  { id: 'C-04', name: 'Gamma Team', status: 'offline', lat: 42.2555, lng: -87.8270 },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  available: '#22c55e',
  assigned: '#f97316',
  offline: '#6b7280',
};

interface MapLibreMapProps {
  theme?: 'light' | 'dark';
  onWorkOrderSelect?: (id: string | null) => void;
}

const MapLibreMap: React.FC<MapLibreMapProps> = ({ 
  theme = 'light',
  onWorkOrderSelect 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const isDark = theme === 'dark';

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Create map with embedded style (no external tiles needed)
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        name: 'Lake Forest Infrastructure',
        sources: {
          // Empty source - we'll draw our own background
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': isDark ? '#1a1a2e' : '#e8f4f8',
            },
          },
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      },
      center: LAKE_FOREST_CENTER,
      zoom: 13,
      minZoom: 11,
      maxZoom: 18,
      attributionControl: false,
    });

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Add a grid pattern for visual reference
      const gridGeoJSON = createGridGeoJSON();
      
      map.current.addSource('grid', {
        type: 'geojson',
        data: gridGeoJSON,
      });

      map.current.addLayer({
        id: 'grid-lines',
        type: 'line',
        source: 'grid',
        paint: {
          'line-color': isDark ? '#334155' : '#cbd5e1',
          'line-width': 1,
          'line-opacity': 0.5,
        },
      });

      // Add city boundary
      const boundaryGeoJSON = createBoundaryGeoJSON();
      
      map.current.addSource('boundary', {
        type: 'geojson',
        data: boundaryGeoJSON,
      });

      map.current.addLayer({
        id: 'boundary-fill',
        type: 'fill',
        source: 'boundary',
        paint: {
          'fill-color': isDark ? '#1e293b' : '#f0f9ff',
          'fill-opacity': 0.3,
        },
      });

      map.current.addLayer({
        id: 'boundary-line',
        type: 'line',
        source: 'boundary',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [4, 2],
        },
      });

      // Add street lines
      const streetsGeoJSON = createStreetsGeoJSON();
      
      map.current.addSource('streets', {
        type: 'geojson',
        data: streetsGeoJSON,
      });

      map.current.addLayer({
        id: 'street-lines',
        type: 'line',
        source: 'streets',
        paint: {
          'line-color': isDark ? '#475569' : '#94a3b8',
          'line-width': 2,
        },
      });

      // Add label for city
      map.current.addSource('label', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: LAKE_FOREST_CENTER,
            },
            properties: {
              name: 'Lake Forest, IL',
            },
          }],
        },
      });

      map.current.addLayer({
        id: 'city-label',
        type: 'symbol',
        source: 'label',
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 16,
          'text-font': ['Open Sans Bold'],
          'text-offset': [0, 3],
        },
        paint: {
          'text-color': isDark ? '#94a3b8' : '#64748b',
          'text-halo-color': isDark ? '#0f172a' : '#ffffff',
          'text-halo-width': 2,
        },
      });

      setMapLoaded(true);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [isDark]);

  // Add markers when map is loaded
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Add crew markers
    CREWS.forEach(crew => {
      const el = document.createElement('div');
      el.className = 'crew-marker';
      el.style.cssText = `
        background: ${STATUS_COLORS[crew.status]};
        padding: 4px 8px;
        border-radius: 4px;
        color: white;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      el.textContent = crew.name;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([crew.lng, crew.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 })
            .setHTML(`
              <div style="padding: 8px;">
                <strong>${crew.name}</strong><br/>
                Status: <span style="color: ${STATUS_COLORS[crew.status]}; font-weight: 600;">${crew.status}</span>
              </div>
            `)
        )
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

    // Add work order markers
    WORK_ORDERS.forEach(wo => {
      const el = document.createElement('div');
      el.className = 'work-order-marker';
      
      const isSelected = wo.id === selectedId;
      const size = isSelected ? 28 : 22;
      
      el.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        background: ${SEVERITY_COLORS[wo.severity]};
        border: 3px solid ${isSelected ? '#3b82f6' : (isDark ? '#1e293b' : '#ffffff')};
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        transition: transform 0.2s;
      `;

      if (wo.severity === 'critical') {
        el.style.animation = 'pulse 1.5s infinite';
      }

      el.innerHTML = wo.issueType === 'Water' ? 'W' :
                     wo.issueType === 'Road' ? 'R' :
                     wo.issueType === 'Sewer' ? 'S' :
                     wo.issueType === 'Gas' ? 'G' :
                     wo.issueType === 'Electrical' ? 'E' : '●';

      el.addEventListener('click', () => {
        const newId = selectedId === wo.id ? null : wo.id;
        setSelectedId(newId);
        onWorkOrderSelect?.(newId);
      });

      el.addEventListener('mouseenter', () => {
        el.style.transform = 'scale(1.2)';
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = 'scale(1)';
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([wo.lng, wo.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false })
            .setHTML(`
              <div style="padding: 8px; min-width: 200px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="
                    background: ${SEVERITY_COLORS[wo.severity]};
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                  ">${wo.severity.toUpperCase()}</span>
                  <span style="font-weight: 600; color: #64748b;">${wo.id}</span>
                </div>
                <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${wo.title}</div>
                <div style="color: #64748b; font-size: 12px;">${wo.address}</div>
                <div style="margin-top: 8px; display: flex; gap: 4px;">
                  <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${wo.issueType}</span>
                  <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${wo.status}</span>
                </div>
              </div>
            `)
        )
        .addTo(map.current!);

      markersRef.current.push(marker);
    });

  }, [mapLoaded, selectedId, isDark, onWorkOrderSelect]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* Legend */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: 1000,
      }}>
        <div style={{ 
          fontSize: '11px', 
          fontWeight: 600, 
          color: isDark ? '#94a3b8' : '#64748b',
          marginBottom: '8px',
          textTransform: 'uppercase',
        }}>
          Priority
        </div>
        {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
          <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }} />
            <span style={{ fontSize: '12px', color: isDark ? '#e2e8f0' : '#334155', textTransform: 'capitalize' }}>
              {sev}
            </span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        background: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderRadius: '8px',
        padding: '12px 16px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
        zIndex: 1000,
        display: 'flex',
        gap: '16px',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#3b82f6' }}>{WORK_ORDERS.length}</div>
          <div style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>Work Orders</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#ef4444' }}>
            {WORK_ORDERS.filter(wo => wo.severity === 'critical').length}
          </div>
          <div style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>Critical</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#22c55e' }}>
            {CREWS.filter(c => c.status === 'available').length}
          </div>
          <div style={{ fontSize: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>Crews Ready</div>
        </div>
      </div>

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          50% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        }
        .maplibregl-popup-content {
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
        }
      `}</style>
    </div>
  );
};

// Helper functions to create GeoJSON
function createGridGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const bounds = {
    minLng: -87.86,
    maxLng: -87.82,
    minLat: 42.24,
    maxLat: 42.28,
  };
  
  // Vertical lines
  for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += 0.005) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[lng, bounds.minLat], [lng, bounds.maxLat]],
      },
      properties: {},
    });
  }
  
  // Horizontal lines
  for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += 0.005) {
    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[bounds.minLng, lat], [bounds.maxLng, lat]],
      },
      properties: {},
    });
  }
  
  return { type: 'FeatureCollection', features };
}

function createBoundaryGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-87.86, 42.24],
          [-87.82, 42.24],
          [-87.82, 42.28],
          [-87.86, 42.28],
          [-87.86, 42.24],
        ]],
      },
      properties: {},
    }],
  };
}

function createStreetsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      // Main horizontal streets
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.86, 42.26], [-87.82, 42.26]] }, properties: { name: 'Deerpath Rd' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.86, 42.255], [-87.82, 42.255]] }, properties: { name: 'Illinois Rd' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.86, 42.25], [-87.82, 42.25]] }, properties: { name: 'Old Elm Rd' } },
      // Main vertical streets
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.84, 42.24], [-87.84, 42.28]] }, properties: { name: 'Waukegan Rd' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.845, 42.24], [-87.845, 42.28]] }, properties: { name: 'Green Bay Rd' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.835, 42.24], [-87.835, 42.28]] }, properties: { name: 'Sheridan Rd' } },
    ],
  };
}

export default MapLibreMap;

import React, { useState } from 'react';
import type { WorkOrder, Crew, MapState } from '../../types/infrastructure';
import type { Cluster, StaffZone, PredictiveHotspot } from '../../services/analyticsService';
import type { FocusedLocation } from './InfraMap';
import type { DecayedWorkOrder } from '../../services/decaySimulationService';
import type { School } from '../../services/mcpService';

// Lazy load map components
const LeafletMap = React.lazy(() => import('./InfraMap'));
const MapLibreMap = React.lazy(() => import('./MapLibreMap'));
const CanvasMap = React.lazy(() => import('./CanvasMap'));
const PowerAppsMap = React.lazy(() => import('./PowerAppsMap'));

// ============================================
// Map Wrapper Component
// ============================================

interface MapWrapperProps {
  workOrders: WorkOrder[];
  crews: Crew[];
  mapState: MapState;
  onWorkOrderSelect: (id: string | null) => void;
  onDispatchCrew?: (workOrderId: string) => void;
  theme?: 'light' | 'dark';
  onShowHelp?: () => void;
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
  decayOverlay?: DecayedWorkOrder[] | null;
  decayMonth?: number;
  decayBaseline?: DecayedWorkOrder[] | null;
  schools?: School[];
  hotspots?: PredictiveHotspot[];
  showHotspots?: boolean;
}

/**
 * MapWrapper - Automatically detects CSP restrictions and uses appropriate map
 * 
 * In Power Apps environment where external resources are blocked by CSP,
 * this component falls back to a pure SVG-based PowerAppsMap visualization.
 */
const MapWrapper: React.FC<MapWrapperProps> = (props) => {
  // Always use Leaflet - it works in Power Apps environment
  const [mapMode] = useState<'leaflet' | 'powerapps'>('leaflet');

  // Leaflet CSS is already bundled via `import 'leaflet/dist/leaflet.css'` in index.tsx
  // No CDN injection needed — avoids CSP violations in Power Apps

  // Render Leaflet map directly
  return (
    <React.Suspense fallback={
      <div className="skeleton-map" style={{ borderRadius: 'var(--radius-lg)' }}>
        <div className="skeleton-map-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton-map-cell" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        {[{t:22,l:28},{t:42,l:52},{t:58,l:38},{t:32,l:68},{t:52,l:48},{t:44,l:22},{t:30,l:45},{t:62,l:60}].map((p, i) => (
          <div key={i} className="skeleton-map-pin" style={{ top: `${p.t}%`, left: `${p.l}%`, animationDelay: `${i * 0.25}s` }} />
        ))}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--glass-border)', borderTopColor: 'var(--accent-primary)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500 }}>Loading Map…</p>
        </div>
      </div>
    }>
      {mapMode === 'powerapps' ? (
        <PowerAppsMap
          workOrders={props.workOrders}
          crews={props.crews}
          mapState={props.mapState}
          onWorkOrderSelect={props.onWorkOrderSelect}
          onDispatchCrew={props.onDispatchCrew}
          theme={props.theme}
          selectedWorkOrderIds={props.selectedWorkOrderIds}
          onSelectionChange={props.onSelectionChange}
          clusters={props.clusters}
          showClusters={props.showClusters}
          staffZones={props.staffZones}
          showStaffZones={props.showStaffZones}
        />
      ) : (
        <LeafletMap
          workOrders={props.workOrders}
          crews={props.crews}
          mapState={props.mapState}
          onWorkOrderSelect={props.onWorkOrderSelect}
          onDispatchCrew={props.onDispatchCrew}
          theme={props.theme}
          onShowHelp={props.onShowHelp}
          selectedWorkOrderIds={props.selectedWorkOrderIds}
          onSelectionChange={props.onSelectionChange}
          clusters={props.clusters}
          showClusters={props.showClusters}
          staffZones={props.staffZones}
          showStaffZones={props.showStaffZones}
          selectionMode={props.selectionMode}
          onSelectionModeChange={props.onSelectionModeChange}
          focusedLocation={props.focusedLocation}
          onLayerToggle={props.onLayerToggle}
          decayOverlay={props.decayOverlay}
          decayMonth={props.decayMonth}
          decayBaseline={props.decayBaseline}
          schools={props.schools}
          hotspots={props.hotspots}
          showHotspots={props.showHotspots}
        />
      )}
    </React.Suspense>
  );
};

export default MapWrapper;

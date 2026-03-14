/**
 * MAINTAIN AI — Map Modal
 *
 * Shows the Leaflet map in a popup/modal overlay.
 * Triggered from the work order table or toolbar.
 * Can focus on a specific work order or show all.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Text,
  Title2,
  Button,
  Badge,
  Caption1,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Map24Regular,
  FullScreenMaximize24Regular,
  FullScreenMinimize24Regular,
  LocationRegular,
} from '@fluentui/react-icons';
import MapWrapper from './map/MapWrapper';
import type { School } from '../services/mcpService';
import type { FocusedLocation } from './map/InfraMap';
import type {
  WorkOrder,
  Crew,
  MapState,
  MapCommand,
  Severity,
  IssueType,
} from '../types/infrastructure';
import type { Cluster, StaffZone, PredictiveHotspot } from '../services/analyticsService';

// ============================================
// Props
// ============================================

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrders: WorkOrder[];
  crews: Crew[];
  mapState: MapState;
  onMapStateChange: (update: Partial<MapState>) => void;
  onWorkOrderSelect: (id: string | null) => void;
  onDispatchCrew: (woId: string) => void;
  theme: 'light' | 'dark';
  focusedWorkOrder?: WorkOrder | null;
  // Pass-through props to MapWrapper
  selectedWorkOrderIds: string[];
  onSelectionChange: (ids: string[]) => void;
  clusters: Cluster[];
  showClusters: boolean;
  staffZones: StaffZone[];
  showStaffZones: boolean;
  selectionMode: 'single' | 'lasso' | 'none';
  onSelectionModeChange: (mode: 'single' | 'lasso' | 'none') => void;
  focusedLocation: FocusedLocation | null;
  onLayerToggle: (layer: string, visible: boolean) => void;
  decayOverlay: any;
  decayMonth: number;
  decayBaseline: any;
  schools: School[];
  hotspots: PredictiveHotspot[];
  showHotspots: boolean;
  /** Optional: callback for "pick location" mode in the wizard */
  onLocationPick?: (lat: number, lng: number) => void;
}

// ============================================
// Component
// ============================================

const MapModal: React.FC<MapModalProps> = ({
  isOpen,
  onClose,
  workOrders,
  crews,
  mapState,
  onMapStateChange,
  onWorkOrderSelect,
  onDispatchCrew,
  theme,
  focusedWorkOrder,
  selectedWorkOrderIds,
  onSelectionChange,
  clusters,
  showClusters,
  staffZones,
  showStaffZones,
  selectionMode,
  onSelectionModeChange,
  focusedLocation,
  onLayerToggle,
  decayOverlay,
  decayMonth,
  decayBaseline,
  schools,
  hotspots,
  showHotspots,
  onLocationPick,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [localFocus, setLocalFocus] = useState<FocusedLocation | null>(null);
  const prevFocusRef = useRef<string | null>(null);
  const mapStateChangeRef = useRef(onMapStateChange);
  mapStateChangeRef.current = onMapStateChange;

  // When the modal opens with a focused work order, fly to it (once per WO)
  useEffect(() => {
    if (isOpen && focusedWorkOrder) {
      const focusKey = focusedWorkOrder.id;
      if (prevFocusRef.current === focusKey) return; // already focused
      prevFocusRef.current = focusKey;
      setLocalFocus(null); // let MapController handle the flyTo via selectedWorkOrderId
      mapStateChangeRef.current({
        center: [focusedWorkOrder.latitude, focusedWorkOrder.longitude],
        zoom: 16,
        selectedWorkOrderId: focusedWorkOrder.id,
      });
    } else if (!isOpen) {
      prevFocusRef.current = null;
      setLocalFocus(null);
    }
  }, [isOpen, focusedWorkOrder]);

  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = isMaximized
    ? { top: 0, left: 0, right: 0, bottom: 0, borderRadius: 0 }
    : { top: '5%', left: '3%', right: '3%', bottom: '5%', borderRadius: 'var(--radius-xl)' };

  return (
    <div className="map-modal-overlay" onClick={onClose}>
      <div
        className="map-modal"
        style={modalStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="map-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Map24Regular style={{ color: 'var(--accent-primary)' }} />
            <Title2 style={{ fontSize: 16 }}>Infrastructure Map</Title2>
            <Badge size="small" color="success">Live</Badge>
            {focusedWorkOrder && (
              <Badge size="small" color="informative" icon={<LocationRegular />}>
                {focusedWorkOrder.address.substring(0, 30)}
              </Badge>
            )}
            {onLocationPick && (
              <Badge size="small" color="warning">
                <LocationRegular style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 2 }} /> Click map to pick location
              </Badge>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <Button
              appearance="subtle"
              size="small"
              icon={isMaximized ? <FullScreenMinimize24Regular /> : <FullScreenMaximize24Regular />}
              onClick={() => setIsMaximized(!isMaximized)}
            />
            <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
          </div>
        </div>

        {/* Map */}
        <div className="map-modal-body">
          <MapWrapper
            workOrders={workOrders}
            crews={crews}
            mapState={mapState}
            onWorkOrderSelect={(id) => {
              onWorkOrderSelect(id);
              // If in location pick mode, pass the clicked location
              if (onLocationPick && id) {
                const wo = workOrders.find(w => w.id === id);
                if (wo) onLocationPick(wo.latitude, wo.longitude);
              }
            }}
            onDispatchCrew={onDispatchCrew}
            theme={theme}
            onShowHelp={() => {}}
            selectedWorkOrderIds={selectedWorkOrderIds}
            onSelectionChange={onSelectionChange}
            clusters={clusters}
            showClusters={showClusters}
            staffZones={staffZones}
            showStaffZones={showStaffZones}
            selectionMode={selectionMode}
            onSelectionModeChange={onSelectionModeChange}
            focusedLocation={localFocus || focusedLocation}
            onLayerToggle={onLayerToggle}
            decayOverlay={decayOverlay}
            decayMonth={decayMonth}
            decayBaseline={decayBaseline}
            schools={schools}
            hotspots={hotspots}
            showHotspots={showHotspots}
          />
        </div>

        {/* Footer Info */}
        {focusedWorkOrder && (
          <div className="map-modal-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge
                size="medium"
                color={focusedWorkOrder.severity === 'critical' ? 'danger' : focusedWorkOrder.severity === 'high' ? 'warning' : 'informative'}
                style={{ textTransform: 'capitalize' }}
              >
                {focusedWorkOrder.severity}
              </Badge>
              <div>
                <Text weight="semibold" size={300}>{focusedWorkOrder.title}</Text>
                <Caption1 style={{ display: 'block', color: 'var(--text-muted)' }}>
                  {focusedWorkOrder.address} · ${focusedWorkOrder.estimatedCost.toLocaleString()} est.
                </Caption1>
              </div>
            </div>
            <Button
              appearance="primary"
              size="small"
              onClick={() => { onDispatchCrew(focusedWorkOrder.id); onClose(); }}
            >
              Dispatch Crew
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapModal;

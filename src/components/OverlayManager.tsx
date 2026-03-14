/**
 * OverlayManager — Renders all overlay/modal panels based on AppContext state.
 *
 * Extracted from Dashboard.tsx to:
 *   1. Reduce monolithic file size (less risk during live demo)
 *   2. Co-locate all overlay mounting logic in one place
 *   3. Make it easy to add/remove overlays without touching the main layout
 *
 * Each overlay reads `isOverlay(id)` from AppContext to decide if it should render.
 * Props are passed through from the Dashboard parent.
 */

import React from 'react';
import { Button } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { useApp } from '../context/AppContext';
import type { DecaySnapshot, DecayedWorkOrder } from '../services/decaySimulationService';

// Component imports
import HelpPanel from './HelpPanel';
import WelcomeTour from './WelcomeTour';
import AnalysisWizard from './AnalysisWizard';
import ReportGenerator from './ReportGenerator';
import NLPDashboardBuilder from './NLPDashboardBuilder';
import DispatchWizard from './DispatchWizard';
import CrewManagementPanel from './CrewManagementPanel';
import AgentTraceViewer from './AgentTraceViewer';
import ResponsibleAIPanel from './ResponsibleAIPanel';
import SemanticKernelPanel from './SemanticKernelPanel';
import ModelRouterPanel from './ModelRouterPanel';
import MapWrapper from './map/MapWrapper';
import MapModal from './MapModal';
import DecayVisualizer from './DecayVisualizer';
import PipelineStreamPanel from './PipelineStreamPanel';

import type {
  WorkOrder,
  Crew,
  CrewMember,
  MapState,
  WeatherForecast,
} from '../types/infrastructure';
import type { School } from '../services/mcpService';
import type { Cluster, StaffZone, PredictiveHotspot } from '../services/analyticsService';
import type { FocusedLocation } from './map/InfraMap';

export interface OverlayManagerProps {
  // Data
  workOrders: WorkOrder[];
  crews: Crew[];
  weather: WeatherForecast[];
  mapState: MapState;
  theme: 'light' | 'dark';
  schools: School[];
  clusters: Cluster[];
  showClusters: boolean;
  staffZones: StaffZone[];
  showStaffZones: boolean;
  hotspots: PredictiveHotspot[];
  showHotspots: boolean;
  focusedLocation: FocusedLocation | null;
  decayOverlay: DecayedWorkOrder[] | null;
  decayMonth: number;
  decayBaseline: DecayedWorkOrder[] | null;

  // Dispatch wizard
  dispatchingWorkOrder: WorkOrder | null;
  setDispatchingWorkOrder: (wo: WorkOrder | null) => void;

  // Map modal
  focusedWorkOrder: WorkOrder | null;
  setFocusedWorkOrder: (wo: WorkOrder | null) => void;
  mapPickCallback: ((lat: number, lng: number) => void) | null;
  setMapPickCallback: (cb: ((lat: number, lng: number) => void) | null) => void;
  selectedWorkOrderIds: string[];
  selectionMode: 'single' | 'lasso' | 'none';

  // Callbacks
  onWorkOrderSelect: (id: string | null) => void;
  onDispatchCrew: (workOrderId: string) => void;
  onMapStateChange: (update: Partial<MapState>) => void;
  onSelectionChange: (ids: string[]) => void;
  onSelectionModeChange: (mode: 'single' | 'lasso' | 'none') => void;
  onLayerToggle: (layer: string, visible: boolean) => void;
  onRestartTour: () => void;
  onLoadDispatches: () => void;
  onCrewsUpdated: (updated: CrewMember[]) => void;

  // Cluster / zone / hotspot callbacks
  onClustersUpdate: (clusters: Cluster[], show: boolean) => void;
  onStaffZonesUpdate: (zones: StaffZone[], show: boolean) => void;
  onHotspotsUpdate: (hotspots: PredictiveHotspot[], show: boolean) => void;
  onZoomToLocation: (lat: number, lng: number, zoom?: number) => void;

  // Decay callbacks
  onDecayMonth: (snapshot: DecaySnapshot) => void;
  onDecayClose: () => void;
  onFlyTo: (lat: number, lng: number, zoom: number) => void;
}

const OverlayManager: React.FC<OverlayManagerProps> = (props) => {
  const { isOverlay, closeOverlay, openOverlay } = useApp();

  return (
    <>
      {/* ══ Map Modal ══ */}
      <MapModal
        isOpen={isOverlay('mapModal')}
        onClose={() => {
          closeOverlay();
          props.setFocusedWorkOrder(null);
          props.setMapPickCallback(null);
        }}
        workOrders={props.workOrders}
        crews={props.crews}
        mapState={props.mapState}
        onMapStateChange={props.onMapStateChange}
        onWorkOrderSelect={props.onWorkOrderSelect}
        onDispatchCrew={props.onDispatchCrew}
        theme={props.theme}
        focusedWorkOrder={props.focusedWorkOrder}
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
        onLocationPick={props.mapPickCallback || undefined}
      />

      {/* ══ Help Panel ══ */}
      {isOverlay('helpPanel') && (
        <HelpPanel
          onClose={closeOverlay}
          onRestartTour={props.onRestartTour}
          onOpenTraces={() => openOverlay('traceViewer')}
          onOpenRAI={() => openOverlay('responsibleAI')}
          onOpenSK={() => openOverlay('skPanel')}
        />
      )}

      {/* ══ Welcome Tour ══ */}
      {isOverlay('welcomeTour') && (
        <WelcomeTour
          onComplete={closeOverlay}
          onSkip={closeOverlay}
          theme={props.theme}
        />
      )}

      {/* ══ Analysis Wizard (Split Layout) ══ */}
      {isOverlay('analysisWizard') && (
        <div className="overlay-split">
          <div className="overlay-split-left">
            <AnalysisWizard
              isOpen={true}
              onClose={closeOverlay}
              workOrders={props.workOrders}
              weather={props.weather}
              embedded
              onClustersUpdate={props.onClustersUpdate}
              onStaffZonesUpdate={props.onStaffZonesUpdate}
              onZoomToLocation={props.onZoomToLocation}
              onHotspotsUpdate={props.onHotspotsUpdate}
            />
          </div>
          <div className="overlay-split-right">
            <Button
              appearance="subtle"
              icon={<Dismiss24Regular />}
              onClick={closeOverlay}
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 10,
                background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
                border: '1px solid var(--glass-border)', borderRadius: 8,
                minWidth: 32, width: 32, height: 32, padding: 0,
              }}
            />
            <MapWrapper
              workOrders={props.workOrders}
              crews={props.crews}
              mapState={props.mapState}
              onWorkOrderSelect={props.onWorkOrderSelect}
              onDispatchCrew={props.onDispatchCrew}
              theme={props.theme}
              clusters={props.clusters}
              showClusters={props.showClusters}
              staffZones={props.staffZones}
              showStaffZones={props.showStaffZones}
              focusedLocation={props.focusedLocation}
              schools={props.schools}
              hotspots={props.hotspots}
              showHotspots={props.showHotspots}
            />
          </div>
        </div>
      )}

      {/* ══ Report Generator ══ */}
      <ReportGenerator
        workOrders={props.workOrders}
        isVisible={isOverlay('report')}
        onClose={closeOverlay}
        theme={props.theme}
      />

      {/* ══ NLP Dashboard Builder ══ */}
      <NLPDashboardBuilder
        workOrders={props.workOrders}
        isVisible={isOverlay('nlpDashboard')}
        onClose={closeOverlay}
        theme={props.theme}
      />

      {/* ══ Dispatch Wizard ══ */}
      {props.dispatchingWorkOrder && (
        <DispatchWizard
          workOrder={props.dispatchingWorkOrder}
          workOrders={props.workOrders}
          crews={props.crews}
          onClose={() => props.setDispatchingWorkOrder(null)}
          onDispatched={() => props.onLoadDispatches()}
        />
      )}

      {/* ══ Crew Management ══ */}
      {isOverlay('crewManagement') && (
        <CrewManagementPanel
          crews={props.crews}
          onClose={closeOverlay}
          onCrewsUpdated={props.onCrewsUpdated}
        />
      )}

      {/* ══ Agent Trace Viewer ══ */}
      <AgentTraceViewer
        isVisible={isOverlay('traceViewer')}
        onClose={closeOverlay}
      />

      {/* ══ Responsible AI Panel ══ */}
      <ResponsibleAIPanel
        isVisible={isOverlay('responsibleAI')}
        onClose={closeOverlay}
      />

      {/* ══ Semantic Kernel Panel ══ */}
      <SemanticKernelPanel
        isVisible={isOverlay('skPanel')}
        onClose={closeOverlay}
      />

      {/* ══ Model Router Panel ══ */}
      <ModelRouterPanel
        isVisible={isOverlay('modelRouter')}
        onClose={closeOverlay}
      />

      {/* ══ Live Pipeline Stream ══ */}
      <PipelineStreamPanel
        isVisible={isOverlay('pipelineStream')}
        onClose={closeOverlay}
      />

      {/* ══ Decay Visualizer (Full-screen with map behind) ══ */}
      {isOverlay('decayVisualizer') && (
        <>
          <div style={{
            position: 'fixed', top: 44, left: 0, right: 0, bottom: 0,
            zIndex: 499,
          }}>
            <MapWrapper
              workOrders={props.workOrders}
              crews={props.crews}
              mapState={props.mapState}
              onWorkOrderSelect={props.onWorkOrderSelect}
              theme={props.theme}
              focusedLocation={props.focusedLocation}
              decayOverlay={props.decayOverlay}
              decayMonth={props.decayMonth}
              decayBaseline={props.decayBaseline}
              schools={props.schools}
              hotspots={props.hotspots}
              showHotspots={props.showHotspots}
            />
          </div>
          <DecayVisualizer
            workOrders={props.workOrders}
            theme={props.theme}
            onClose={props.onDecayClose}
            onDecayMonth={props.onDecayMonth}
            onFlyTo={props.onFlyTo}
          />
        </>
      )}
    </>
  );
};

export default OverlayManager;

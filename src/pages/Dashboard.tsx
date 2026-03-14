import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
  Text,
  Spinner,
} from '@fluentui/react-components';
import {
  Add24Regular,
  ArrowSync24Regular,
  Map24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';
import HeaderBar from '../components/HeaderBar';
import { DemoOverlay } from '../components/DemoOverlay';
import { useDemoMode } from '../hooks/useDemoMode';
import BriefingOverlay from '../components/BriefingOverlay';
import type { DecaySnapshot, DecayedWorkOrder } from '../services/decaySimulationService';
import UnifiedSidePanel from '../components/UnifiedSidePanel';
import WorkOrderTable from '../components/WorkOrderTable';
import WorkOrderWizard from '../components/WorkOrderWizard';
import MapWrapper from '../components/map/MapWrapper';
import WorkOrderDetailCard from '../components/WorkOrderDetailCard';
import WorkOrderVisualCard from '../components/WorkOrderVisualCard';
import OverlayManager from '../components/OverlayManager';
import mcpService from '../services/mcpService';
import type { School } from '../services/mcpService';
import weatherService from '../services/weatherService';
import agentService from '../services/agentService';
import { kMeansClustering, type Cluster, type StaffZone, type PredictiveHotspot } from '../services/analyticsService';
import { getQuickCost, getPricingConfig } from '../services/pricingService';
import dataverseService from '../services/dataverseService';
import { assessSeverity, ensureSeverityDifferentiation } from '../utils/severityEngine';
import AnalyticsWidgets from '../components/AnalyticsWidgets';
import type { CrewDispatch } from '../types/infrastructure';
import type { FocusedLocation } from '../components/map/InfraMap';
import type {
  WorkOrder,
  Crew,
  AIInsight,
  CrewEstimation,
  MapState,
  ScenarioParams,
  ScenarioResult,
  WeatherForecast,
  MapCommand,
  Severity,
  IssueType,
} from '../types/infrastructure';

// ============================================
// Mock Data for Initial Development
// ============================================

// Connection status type imported from AppContext

// ============================================
// Dashboard Component
// ============================================

/**
 * Dashboard - Main page with map, AI panel, and crew dashboard
 * 
 * Features:
 * - Full-screen Leaflet map with work order markers
 * - AI Companion Panel (right side)
 * - Crew Dashboard (bottom left)
 * - Scenario Simulator (bottom center)
 * - Layer filters and controls
 */
const Dashboard: React.FC = () => {
  // ── App Context (theme, overlays, connection) ──
  const { theme, toggleTheme, openOverlay, closeOverlay, isOverlay, dispatch: appDispatch } = useApp();
  const connectionStatus = useApp().state.connectionStatus;

  // State
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [crewEstimation, setCrewEstimation] = useState<CrewEstimation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherForecast[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [hotspots, setHotspots] = useState<PredictiveHotspot[]>([]);
  const [showHotspots, setShowHotspots] = useState(false);

  // Selection and clustering states
  const [selectedWorkOrderIds, setSelectedWorkOrderIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<'single' | 'lasso' | 'none'>('single');
  const [decayOverlay, setDecayOverlay] = useState<DecayedWorkOrder[] | null>(null);
  const [decayMonth, setDecayMonth] = useState(0);
  const [decayBaseline, setDecayBaseline] = useState<DecayedWorkOrder[] | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [showClusters, setShowClusters] = useState(false);
  const [staffZones, setStaffZones] = useState<StaffZone[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [showStaffZones, setShowStaffZones] = useState(false);
  const [focusedLocation, setFocusedLocation] = useState<FocusedLocation | null>(null);

  // ── Intelligence Strip ──
  const [infraDebt, setInfraDebt] = useState(0);
  const infraDebtRef = useRef(0);
  const [aiOpsCount, setAiOpsCount] = useState(0);
  const [analystHoursSaved, setAnalystHoursSaved] = useState(0);

  // ── Executive Briefing ──
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Demo Mode ──
  const [demoState, demoActions] = useDemoMode();

  // ── Dispatch Tracking (Dataverse) ──
  const [activeDispatches, setActiveDispatches] = useState<CrewDispatch[]>([]);
  const [dispatchCount, setDispatchCount] = useState({ active: 0, pending: 0, completed: 0 });
  const [dispatchingWorkOrder, setDispatchingWorkOrder] = useState<WorkOrder | null>(null);

  // ── Work Order-First Layout ──
  const [focusedWorkOrder, setFocusedWorkOrder] = useState<WorkOrder | null>(null);
  const [mapPickCallback, setMapPickCallback] = useState<((lat: number, lng: number) => void) | null>(null);
  const [previewWorkOrder, setPreviewWorkOrder] = useState<WorkOrder | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | Severity>('all');
  const [feedSort, setFeedSort] = useState<'priority' | 'cost' | 'severity' | 'newest' | 'oldest'>('priority');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // ── Resizable Left Panel ──
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    const saved = localStorage.getItem('infrawatch-left-panel-width');
    return saved ? parseInt(saved, 10) : 680;
  });
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // ── Resize handlers for left panel drag ──
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: leftPanelWidth };
    setIsResizing(true);
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.min(Math.max(resizeRef.current.startWidth + delta, 320), 1200);
      setLeftPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      localStorage.setItem('infrawatch-left-panel-width', String(leftPanelWidth));
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, leftPanelWidth]);

  // Load active dispatches (from Dataverse / localStorage)
  const loadDispatches = useCallback(async () => {
    try {
      const all = await dataverseService.getDispatches();
      setActiveDispatches(all);
      setDispatchCount({
        active: all.filter(d => d.status === 'dispatched' || d.status === 'in_progress').length,
        pending: all.filter(d => d.status === 'pending_approval' || d.status === 'approved').length,
        completed: all.filter(d => d.status === 'completed').length,
      });
    } catch (err) {
      console.warn('Failed to load dispatches:', err);
    }
  }, []);

  const [mapState, setMapState] = useState<MapState>({
    center: [42.2586, -87.8407],
    zoom: 13,
    selectedWorkOrderId: null,
    visibleLayers: {
      workOrders: true,
      crews: true,
      heatmap: false,
      hexbin: true,
      schools: false,
      parcels: false,
      zoning: true,
    },
    filterPriority: 'all',
    filterType: 'all',
  });

  // Handlers
  const handleMapStateChange = useCallback((update: Partial<MapState>) => {
    setMapState(prev => ({ ...prev, ...update }));
  }, []);

  const handleWorkOrderSelect = useCallback((id: string | null) => {
    console.log('[Dashboard] handleWorkOrderSelect called with id:', id);
    if (!id) {
      // Deselect — zoom back out
      setMapState(prev => ({ ...prev, selectedWorkOrderId: null, center: [42.2586, -87.8407] as [number, number], zoom: 13 }));
      setFocusedLocation({ lat: 42.2586, lng: -87.8407, zoom: 13, key: Date.now() });
      return;
    }
    const wo = workOrders.find(w => w.id === id);
    if (wo) {
      setMapState(prev => {
        const isDeselect = prev.selectedWorkOrderId === id;
        if (isDeselect) {
          return { ...prev, selectedWorkOrderId: null, center: [42.2586, -87.8407] as [number, number], zoom: 13 };
        }
        return { ...prev, selectedWorkOrderId: id, center: [wo.latitude, wo.longitude] as [number, number], zoom: 16 };
      });
      setFocusedLocation(prev => {
        return { lat: wo.latitude, lng: wo.longitude, zoom: 16, key: Date.now() };
      });
    } else {
      setMapState(prev => ({ ...prev, selectedWorkOrderId: id }));
    }
  }, [workOrders]);

  const handleDispatchCrew = useCallback((workOrderId: string) => {
    console.log('Dispatching crew to:', workOrderId);
    const wo = workOrders.find(w => w.id === workOrderId);
    if (wo) {
      setFocusedLocation({ lat: wo.latitude, lng: wo.longitude, zoom: 16, key: Date.now() });
      setMapState(prev => ({
        ...prev,
        center: [wo.latitude, wo.longitude] as [number, number],
        zoom: 16,
        selectedWorkOrderId: workOrderId,
      }));
      // Open dispatch wizard modal
      setDispatchingWorkOrder(wo);
    }
  }, [workOrders]);

  // ── Work Order Table Handlers ──
  const handleTableSelectWO = useCallback((wo: WorkOrder) => {
    setMapState(prev => {
      const isDeselect = prev.selectedWorkOrderId === wo.id;
      if (isDeselect) {
        // Deselect → zoom back out to overview
        return { ...prev, selectedWorkOrderId: null, center: [42.2586, -87.8407] as [number, number], zoom: 13 };
      }
      // Select → zoom into the work order
      return { ...prev, selectedWorkOrderId: wo.id, center: [wo.latitude, wo.longitude] as [number, number], zoom: 16 };
    });
    setFocusedLocation(prev => {
      const isDeselect = mapState.selectedWorkOrderId === wo.id;
      if (isDeselect) return { lat: 42.2586, lng: -87.8407, zoom: 13, key: Date.now() };
      return { lat: wo.latitude, lng: wo.longitude, zoom: 16, key: Date.now() };
    });
  }, [mapState.selectedWorkOrderId]);

  const handleViewOnMap = useCallback((wo: WorkOrder) => {
    setFocusedWorkOrder(wo);
    openOverlay('mapModal');
  }, [openOverlay]);

  const handleOpenMapGeneral = useCallback(() => {
    setFocusedWorkOrder(null);
    openOverlay('mapModal');
  }, [openOverlay]);

  const handleWizardCreated = useCallback((wo: WorkOrder) => {
    setWorkOrders(prev => [wo, ...prev]);
  }, []);

  const handleOpenMapForPick = useCallback((callback: (lat: number, lng: number) => void) => {
    setMapPickCallback(() => callback);
    openOverlay('mapModal');
  }, [openOverlay]);

  // Selection handlers
  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedWorkOrderIds(ids);
  }, []);

  const handleSelectionModeChange = useCallback((mode: 'single' | 'lasso' | 'none') => {
    setSelectionMode(mode);
    if (mode === 'none') {
      setSelectedWorkOrderIds([]);
    }
  }, []);

  // Run clustering when work orders change
  useEffect(() => {
    if (workOrders.length >= 3) {
      const k = Math.min(5, Math.ceil(workOrders.length / 5));
      const result = kMeansClustering(workOrders, k, 100);
      setClusters(result);
    }
  }, [workOrders]);

  // Fetch real data from MCP server and generate AI insights
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    appDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connecting' });

    try {
      // Fetch from MCP + weather in parallel
      const [mcpData, weatherData] = await Promise.all([
        mcpService.fetchAllInfrastructureData(),
        weatherService.getWeatherForecast(7)
      ]);

      setWeather(weatherData);

      if (mcpData.success && mcpData.data) {
        // Use the pricing engine as the single source of truth for estimated costs
        const pricingConfig = getPricingConfig();

        // Ensure severity differentiation — if the server returns
        // all-same severities, infer realistic varied severities from
        // each record's attributes (address, notes, age, school proximity).
        const rawPotholes = mcpData.data.potholes || [];
        const rawSidewalk = mcpData.data.sidewalkIssues || [];
        const rawWorkOrders = mcpData.data.workOrders || [];
        ensureSeverityDifferentiation(rawPotholes);
        ensureSeverityDifferentiation(rawSidewalk);
        ensureSeverityDifferentiation(rawWorkOrders);

        // ── Helpers for realistic data enrichment ──
        const LAKE_FOREST_ZONES = ['Zone 1 - North', 'Zone 2 - Central', 'Zone 3 - South', 'Zone 4 - East', 'Zone 5 - West'];
        /** Deterministic zone from address hash so same address always gets same zone */
        const inferZone = (address?: string, fallbackIdx?: number): string => {
          if (!address) return LAKE_FOREST_ZONES[(fallbackIdx || 0) % LAKE_FOREST_ZONES.length];
          let hash = 0;
          for (let c = 0; c < address.length; c++) hash = ((hash << 5) - hash + address.charCodeAt(c)) | 0;
          return LAKE_FOREST_ZONES[Math.abs(hash) % LAKE_FOREST_ZONES.length];
        };
        /** Spread missing dates across last 6 months for trend charts */
        const inferDate = (rawDate: string | undefined, idx: number, total: number): string => {
          if (rawDate && !isNaN(new Date(rawDate).getTime())) return rawDate;
          const now = new Date();
          const monthsBack = Math.floor((idx / Math.max(total, 1)) * 6);
          const daySpread = (idx * 7 + 3) % 28 + 1;
          const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, daySpread);
          return d.toISOString();
        };
        /** Check proximity to known Lake Forest schools (within ~0.3 mi / 500m) */
        const isNearSchool = (lat?: number, lng?: number, rawNearSchool?: boolean): boolean => {
          if (rawNearSchool) return true;
          if (!lat || !lng) return false;
          const schoolCoords = [
            [42.247974, -87.849957], [42.264444, -87.840393],
            [42.216238, -87.874571], [42.225531, -87.835695], [42.264320, -87.835778],
          ];
          return schoolCoords.some(([sLat, sLng]) =>
            Math.abs(lat - sLat) < 0.005 && Math.abs(lng - sLng) < 0.005
          );
        };

        const totalRecords = rawPotholes.length + rawSidewalk.length + rawWorkOrders.length;

        // Transform MCP data to WorkOrder format
        const transformedOrders: WorkOrder[] = [
          ...rawPotholes.map((p: any, i: number) => ({
            id: `pothole-${p.id || i}`,
            issueType: 'pothole' as const,
            severity: (p.severity || 'medium') as WorkOrder['severity'],
            status: (p.status || 'open') as WorkOrder['status'],
            title: `Pothole at ${p.address}`,
            description: `Pothole reported: ${p.notes || 'No details'}`,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            estimatedCost: getQuickCost('pothole', p.severity || 'medium', pricingConfig),
            priorityScore: 0,
            createdAt: inferDate(p.reportedDate, i, totalRecords),
            updatedAt: new Date().toISOString(),
            nearSchool: isNearSchool(p.latitude, p.longitude, p.nearSchool),
            zone: inferZone(p.address, i),
          })),
          ...rawSidewalk.map((s: any, i: number) => ({
            id: `sidewalk-${s.id || i}`,
            issueType: 'sidewalk' as const,
            severity: (s.severity || 'medium') as WorkOrder['severity'],
            status: (s.status || 'open') as WorkOrder['status'],
            title: `Sidewalk: ${s.issueDescription || 'Damage reported'}`,
            description: s.issueDescription || 'Sidewalk issue reported',
            address: s.address,
            latitude: s.latitude,
            longitude: s.longitude,
            estimatedCost: getQuickCost('sidewalk', s.severity || 'medium', pricingConfig),
            priorityScore: 0,
            createdAt: inferDate(s.reportedDate, rawPotholes.length + i, totalRecords),
            updatedAt: new Date().toISOString(),
            nearSchool: isNearSchool(s.latitude, s.longitude, false),
            zone: inferZone(s.address, rawPotholes.length + i),
          })),
          ...rawWorkOrders.map((w: any, i: number) => ({
            id: `wo-${w.id || i}`,
            issueType: (w.type === 'pothole_repair' ? 'pothole' : w.type === 'sidewalk_repair' ? 'sidewalk' : 'pothole') as WorkOrder['issueType'],
            severity: (w.severity || 'medium') as WorkOrder['severity'],
            status: (w.status || 'open') as WorkOrder['status'],
            title: w.description || `Work Order ${w.id}`,
            description: w.description || w.notes || 'Infrastructure work order',
            address: w.address || 'Lake Forest, IL',
            latitude: w.latitude || 42.2586,
            longitude: w.longitude || -87.8407,
            estimatedCost: w.estimatedCost || getQuickCost(w.type === 'pothole_repair' ? 'pothole' : w.type === 'sidewalk_repair' ? 'sidewalk' : 'pothole', w.severity || 'medium', pricingConfig),
            priorityScore: w.priorityScore || 0,
            createdAt: inferDate(w.createdDate, rawPotholes.length + rawSidewalk.length + i, totalRecords),
            updatedAt: new Date().toISOString(),
            nearSchool: isNearSchool(w.latitude, w.longitude, w.nearSchool),
            zone: w.zone || inferZone(w.address, rawPotholes.length + rawSidewalk.length + i),
          })),
        ];

        setWorkOrders(transformedOrders);
        // Transform MCP schools — normalize field names and filter invalid entries
        // Coordinates verified via Google Maps satellite imagery
        const fallbackSchools: School[] = [
          { id: 's1', name: 'Deer Path Middle School', address: '95 W Deerpath, Lake Forest, IL', latitude: 42.247974, longitude: -87.849957, type: 'middle' },
          { id: 's2', name: 'Lake Forest High School', address: '1285 N McKinley Rd, Lake Forest, IL', latitude: 42.264444, longitude: -87.840393, type: 'high' },
          { id: 's3', name: 'Everett Elementary School', address: '1111 N Everett Ave, Lake Forest, IL', latitude: 42.216238, longitude: -87.874571, type: 'elementary' },
          { id: 's4', name: 'Cherokee Elementary School', address: '500 W Deerpath, Lake Forest, IL', latitude: 42.225531, longitude: -87.835695, type: 'elementary' },
          { id: 's5', name: 'Sheridan Elementary School', address: '999 N Sheridan Rd, Lake Forest, IL', latitude: 42.264320, longitude: -87.835778, type: 'elementary' },
        ];
        const rawSchools = mcpData.data.schools || [];
        const transformedSchools: School[] = rawSchools.map((s: any, i: number) => ({
          id: s.id || `s-${i}`,
          name: s.name || 'Unknown School',
          address: s.address || '',
          latitude: s.latitude ?? s.lat ?? undefined,
          longitude: s.longitude ?? s.lng ?? s.lon ?? undefined,
          type: (s.type || 'elementary') as 'elementary' | 'middle' | 'high',
        })).filter((s: School) => s.latitude != null && s.longitude != null && isFinite(s.latitude) && isFinite(s.longitude));
        setSchools(transformedSchools.length > 0 ? transformedSchools : fallbackSchools);
        appDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connected' });

        // Generate AI insights in parallel, non-blocking (don't await)
        if (transformedOrders.length > 0) {
          // Ensure Lake Forest DPW roster + demo dispatches are seeded before loading crews
          dataverseService.seedDemoData().catch(err =>
            console.warn('Demo data seed failed (non-blocking):', err)
          );

          Promise.all([
            agentService.generateInsights(transformedOrders),
            agentService.estimateCrews(transformedOrders),
            dataverseService.getCrewMembers({ activeOnly: true }),
          ]).then(([aiInsights, estimation, persistedCrews]) => {
            setInsights(aiInsights);
            setCrewEstimation(estimation);

            // Use the seeded / persisted Lake Forest DPW roster
            if (persistedCrews.length > 0) {
              setCrews(persistedCrews);
              return;
            }

            // Fallback: if seed somehow failed, generate a minimal roster from the estimation counts
            const crewNames: Record<string, string[]> = {
              pothole: ['Alpha', 'Bravo', 'Echo'],
              sidewalk: ['Sierra', 'Tango'],
              concrete: ['Apex', 'Core'],
            };
            const generated: Crew[] = [];
            const specs: Array<{ key: 'pothole' | 'sidewalk' | 'concrete'; count: number }> = [
              { key: 'pothole', count: estimation.potholeCrew },
              { key: 'sidewalk', count: estimation.sidewalkCrews },
              { key: 'concrete', count: estimation.concreteCrews },
            ];
            for (const { key, count } of specs) {
              for (let i = 0; i < count && i < crewNames[key].length; i++) {
                const tag = crewNames[key][i];
                generated.push({
                  id: `crew-${key}-${i}`,
                  name: `${tag} ${key.charAt(0).toUpperCase() + key.slice(1)} Crew`,
                  specialization: key,
                  status: i === 0 ? 'assigned' : 'available',
                  efficiencyRating: 0.85 + Math.random() * 0.10,
                  currentLat: 42.2500 + (Math.random() - 0.5) * 0.02,
                  currentLng: -87.8400 + (Math.random() - 0.5) * 0.02,
                  memberCount: key === 'concrete' ? 5 : key === 'sidewalk' ? 4 : 3,
                  assignedWorkOrders: [],
                });
              }
            }
            if (generated.length > 0) {
              setCrews(generated);
              dataverseService.seedCrewMembers(generated).catch(() => {});
            }
          }).catch(err => console.warn('Agent insights failed (non-blocking):', err));
        }
      } else {
        console.error('MCP fetch failed:', mcpData.error);
        appDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'error' });
        // Fallback schools for Lake Forest so the layer works in demo mode
        setSchools([
          { id: 's1', name: 'Deer Path Middle School', address: '95 W Deerpath, Lake Forest, IL', latitude: 42.2573, longitude: -87.8412, type: 'middle' },
          { id: 's2', name: 'Lake Forest High School', address: '1285 N McKinley Rd, Lake Forest, IL', latitude: 42.2635, longitude: -87.8445, type: 'high' },
          { id: 's3', name: 'Everett Elementary School', address: '1111 N Everett Ave, Lake Forest, IL', latitude: 42.2600, longitude: -87.8360, type: 'elementary' },
          { id: 's4', name: 'Cherokee Elementary School', address: '500 W Deerpath, Lake Forest, IL', latitude: 42.2560, longitude: -87.8480, type: 'elementary' },
          { id: 's5', name: 'Sheridan Elementary School', address: '999 N Sheridan Rd, Lake Forest, IL', latitude: 42.2545, longitude: -87.8325, type: 'elementary' },
        ]);
      }

      setLastRefresh(new Date());

    } catch (error) {
      console.error('Data fetch error:', error);
      appDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchData();
    loadDispatches();
  }, [fetchData, loadDispatches]);

  // ── Live Infrastructure Debt Ticker ──
  useEffect(() => {
    if (workOrders.length === 0) return;
    // Calculate base debt from all work orders
    const baseDebt = workOrders.reduce((sum, wo) => sum + wo.estimatedCost, 0);
    // Severity-weighted decay rate: critical issues cost more per second
    const dailyDecayRate = workOrders.reduce((sum, wo) => {
      const mult = wo.severity === 'critical' ? 12 : wo.severity === 'high' ? 6 : wo.severity === 'medium' ? 2.5 : 0.8;
      return sum + wo.estimatedCost * 0.001 * mult;
    }, 0);
    const perSecond = dailyDecayRate / 86400;
    infraDebtRef.current = baseDebt;
    setInfraDebt(baseDebt);

    const ticker = setInterval(() => {
      infraDebtRef.current += perSecond;
      setInfraDebt(infraDebtRef.current);
    }, 50); // smooth 20fps tick
    return () => clearInterval(ticker);
  }, [workOrders]);

  // ── AI Operations Counter ──
  useEffect(() => {
    if (insights.length > 0 || crewEstimation) {
      // Each insight = ops, crew estimation = ops, clustering = ops
      const ops = insights.length * 3 + (crewEstimation ? 8 : 0) + clusters.length * 2;
      setAiOpsCount(ops);
      // Each AI op saves ~15 min of analyst time
      setAnalystHoursSaved(Math.round(ops * 0.25 * 10) / 10);
    }
  }, [insights, crewEstimation, clusters]);

  // ── Executive Briefing Generator ──
  const getHealthGrade = useCallback(() => {
    if (workOrders.length === 0) return { grade: '—', color: 'var(--text-muted)', label: 'No Data' };
    const critPct = workOrders.filter(w => w.severity === 'critical').length / workOrders.length;
    const highPct = workOrders.filter(w => w.severity === 'high').length / workOrders.length;
    const score = Math.round(100 - (critPct * 50 + highPct * 25) * 100);
    if (score >= 90) return { grade: `${score}`, color: 'var(--accent-success)', label: 'Strong' };
    if (score >= 75) return { grade: `${score}`, color: 'var(--accent-success)', label: 'On Track' };
    if (score >= 60) return { grade: `${score}`, color: 'var(--accent-warning)', label: 'Needs Attention' };
    if (score >= 40) return { grade: `${score}`, color: 'var(--priority-high)', label: 'Action Needed' };
    return { grade: `${score}`, color: 'var(--priority-critical)', label: 'Urgent Focus' };
  }, [workOrders]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      switch (e.key.toLowerCase()) {
        case '?':
          openOverlay('helpPanel');
          break;
        case 'escape':
          closeOverlay();
          break;
        case 't':
          toggleTheme();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRefreshInsights = async () => {
    await fetchData();
  };

  const handleSimulate = async (params: ScenarioParams): Promise<ScenarioResult> => {
    // Use the real agent service for scenario simulation
    const result = await agentService.runScenario(workOrders, {
      temperatureChange: params.temperatureChange,
      daysAhead: params.daysAhead,
      crewAvailability: params.crewAvailability,
      weatherOverride: params.weatherOverride,
    });

    const scenarioResult: ScenarioResult = {
      predictedWorkOrders: Math.round(workOrders.length * (1 + Math.abs(params.temperatureChange) / 100)),
      crewsRequired: result.scenarioEstimate.totalCrews,
      budgetImpact: result.delta.crews * -5000,
      recommendations: result.recommendations,
      riskLevel: Math.abs(result.delta.crews) > 2 ? 'high' : Math.abs(result.delta.crews) > 1 ? 'medium' : 'low',
    };

    return scenarioResult;
  };

  const handleLayerToggle = (layer: keyof MapState['visibleLayers']) => {
    setMapState(prev => ({
      ...prev,
      visibleLayers: {
        ...prev.visibleLayers,
        [layer]: !prev.visibleLayers[layer],
      },
    }));
  };

  // Agent-issued layer toggle (with explicit on/off)
  const handleAgentLayerToggle = (layer: string, visible: boolean) => {
    if (layer === 'clusters') {
      setShowClusters(visible);
      return;
    }
    setMapState(prev => ({
      ...prev,
      visibleLayers: {
        ...prev.visibleLayers,
        [layer]: visible,
      },
    }));
  };

  // Handle map commands from the agent chat
  const handleMapCommand = (cmd: MapCommand) => {
    switch (cmd.type) {
      case 'toggle_layer':
        if (cmd.payload) {
          const layer = cmd.payload.layer as string;
          const visible = cmd.payload.visible as boolean;
          handleAgentLayerToggle(layer, visible);
        }
        break;
      case 'zoom_to':
        if (cmd.payload) {
          setMapState(prev => ({
            ...prev,
            center: [cmd.payload!.lat as number, cmd.payload!.lng as number],
            zoom: (cmd.payload!.zoom as number) || 15,
          }));
        }
        break;
      case 'select_features':
        if (cmd.payload?.ids) {
          setSelectedWorkOrderIds(cmd.payload.ids as string[]);
        }
        break;
      case 'clear_selection':
        setSelectedWorkOrderIds([]);
        break;
      case 'show_clusters':
        setShowClusters(true);
        break;
      case 'hide_clusters':
        setShowClusters(false);
        break;
      case 'reset_view':
        setMapState(prev => ({
          ...prev,
          center: [42.2586, -87.8407],
          zoom: 13,
          selectedWorkOrderId: null,
          filterPriority: 'all',
          filterType: 'all',
        }));
        setSelectedWorkOrderIds([]);
        break;
      case 'show_decay' as any:
        openOverlay('decayVisualizer');
        break;
      case 'filter_by_severity':
        if (cmd.payload?.severity) {
          setMapState(prev => ({
            ...prev,
            filterPriority: cmd.payload!.severity as Severity | 'all',
          }));
        }
        break;
      case 'filter_by_type':
        if (cmd.payload?.type) {
          setMapState(prev => ({
            ...prev,
            filterType: cmd.payload!.type as IssueType | 'all',
          }));
        }
        break;
      default:
        break;
    }
  };

  const handleRestartTour = () => {
    localStorage.removeItem('infrawatch-tour-completed');
    openOverlay('welcomeTour');
  };

  // ── v5 Helpers ──
  const getPriorityScore = useCallback((wo: WorkOrder) => {
    let score = 0;
    if (wo.severity === 'critical') score += 40;
    else if (wo.severity === 'high') score += 30;
    else if (wo.severity === 'medium') score += 20;
    else score += 10;
    const age = Math.floor((Date.now() - new Date(wo.createdAt).getTime()) / 86400000);
    score += Math.min(age * 2, 30);
    if (wo.estimatedCost >= 3000) score += 20;
    else if (wo.estimatedCost >= 1000) score += 10;
    if (wo.nearSchool) score += 10;
    return Math.min(score, 99);
  }, []);

  const getCostClass = (cost: number) => cost >= 3000 ? 'cost-high' : cost >= 1000 ? 'cost-med' : 'cost-low';

  const filteredWorkOrdersUnsorted = feedFilter === 'all' ? workOrders : workOrders.filter(wo => wo.severity === feedFilter);

  // Sort
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const filteredWorkOrders = [...filteredWorkOrdersUnsorted].sort((a, b) => {
    switch (feedSort) {
      case 'severity': return (sevOrder[a.severity] ?? 9) - (sevOrder[b.severity] ?? 9);
      case 'cost': return b.estimatedCost - a.estimatedCost;
      case 'newest': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest': return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'priority':
      default: {
        const ps = (wo: WorkOrder) => {
          let s = 0;
          if (wo.severity === 'critical') s += 40; else if (wo.severity === 'high') s += 30; else if (wo.severity === 'medium') s += 20; else s += 10;
          const age = Math.max(0, Math.floor((Date.now() - new Date(wo.createdAt).getTime()) / 86400000));
          s += Math.min(age * 2, 30);
          if (wo.estimatedCost >= 3000) s += 20; else if (wo.estimatedCost >= 1000) s += 10;
          if (wo.nearSchool) s += 10;
          return Math.min(s, 99);
        };
        return ps(b) - ps(a);
      }
    }
  });

  const sevCounts = {
    critical: filteredWorkOrders.filter(w => w.severity === 'critical').length,
    high: filteredWorkOrders.filter(w => w.severity === 'high').length,
    medium: filteredWorkOrders.filter(w => w.severity === 'medium').length,
    low: filteredWorkOrders.filter(w => w.severity === 'low').length,
  };
  const totalSevCount = sevCounts.critical + sevCounts.high + sevCounts.medium + sevCounts.low;

  return (
    <FluentProvider theme={theme === 'dark' ? webDarkTheme : webLightTheme} style={{ width: '100%', height: '100%' }}>
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Skip-to-content link for keyboard users */}
      <a href="#main-content" className="sr-only" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden', zIndex: 9999 }} onFocus={(e) => { e.currentTarget.style.left = '8px'; e.currentTarget.style.top = '8px'; e.currentTarget.style.width = 'auto'; e.currentTarget.style.height = 'auto'; }} onBlur={(e) => { e.currentTarget.style.left = '-9999px'; e.currentTarget.style.width = '1px'; e.currentTarget.style.height = '1px'; }}>Skip to main content</a>
      {/* ═══ Compact Header v3 ═══ */}
      <HeaderBar
        onOpenMap={handleOpenMapGeneral}
        onRefresh={handleRefreshInsights}
        isLoading={isLoading}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => { setSidebarOpen(prev => !prev); setMobileSidebarOpen(prev => !prev); }}
        isDemoRunning={demoState.isRunning}
        onToggleDemo={() => demoState.isRunning ? demoActions.stop() : demoActions.start()}
      />

      {/* Demo mode floating indicator */}
      <DemoOverlay state={demoState} actions={demoActions} />

      {/* ══ Executive Briefing Overlay ══ */}
      <BriefingOverlay
        workOrders={workOrders}
        insights={insights}
        crews={crews}
        clusterCount={clusters.length}
        getHealthGrade={getHealthGrade}
      />

      {/* ══ MAIN CONTENT: Split Layout — Portrait Map + Card Feed ══ */}
      {!isOverlay('decayVisualizer') && (
        <main id="main-content" className="wo-main-area" role="main" aria-label="Dashboard content" style={{
          position: 'fixed',
          top: 44,
          left: 0,
          right: sidebarOpen ? 392 : 0,
          bottom: 0,
          zIndex: 1,
          overflow: 'hidden',
          transition: 'right 0.25s ease',
          background: 'var(--bg-primary)',
        }}>
          <div className="dash-split-v2">

            {/* ── Left Column: Compact Map + Analytics Widgets ── */}
            <div className="dash-left-col" style={{ width: leftPanelWidth, minWidth: 320, maxWidth: 1200 }}>
              {/* Compact Map */}
              <div className="dash-map-card-v2">
                <div className="dash-map-top">
                  <span className="dash-map-title">
                    <Map24Regular /> Lake Forest, IL
                  </span>
                  <button className="dash-map-expand" onClick={handleOpenMapGeneral} title="Expand map" aria-label="Expand map to full screen">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                  </button>
                </div>
                <div className="dash-map-inner">
                  <MapWrapper
                    workOrders={workOrders}
                    crews={crews}
                    mapState={mapState}
                    onWorkOrderSelect={handleWorkOrderSelect}
                    theme={theme}
                    focusedLocation={focusedLocation}
                    schools={schools}
                    hotspots={hotspots}
                    showHotspots={showHotspots}
                    onLayerToggle={handleAgentLayerToggle}
                  />

                  <div className="dash-map-badge">
                    <span className="pulse-dot" />
                    {mapState.selectedWorkOrderId
                      ? workOrders.find(w => w.id === mapState.selectedWorkOrderId)?.title?.slice(0, 30) || 'Selected'
                      : `${workOrders.filter(w => w.status === 'open' || w.status === 'assigned').length} active`}
                  </div>
                </div>
              </div>

              {/* ── Analytics Widgets Grid (extracted component) ── */}
              <AnalyticsWidgets
                workOrders={workOrders}
                filteredWorkOrders={filteredWorkOrders}
                crews={crews}
                selectedWorkOrder={mapState.selectedWorkOrderId ? workOrders.find(w => w.id === mapState.selectedWorkOrderId) || null : null}
                mapState={mapState}
                aiOpsCount={aiOpsCount}
                analystHoursSaved={analystHoursSaved}
                infraDebt={infraDebt}
                getPriorityScore={getPriorityScore}
              />
            </div>

            {/* ── Drag Handle to resize left panel ── */}
            <div
              className={`dash-resize-handle${isResizing ? ' active' : ''}`}
              onMouseDown={handleResizeMouseDown}
              title="Drag to resize"
            >
              <div className="dash-resize-handle-grip" />
            </div>

            {/* ── Right: Visual Work Order Card Grid ── */}
            <div className="dash-feed-panel-v2">
              {/* Feed header */}
              <div className="feed-header">
                <div className="feed-header-left">
                  <span className="feed-title">Work Orders</span>
                  <span className="feed-count">{filteredWorkOrders.length}</span>
                  <div className="sev-dist-bar">
                    {totalSevCount > 0 && <>
                      <div className="sev-seg" style={{ width: `${(sevCounts.critical / totalSevCount) * 100}%`, background: 'var(--priority-critical)' }} />
                      <div className="sev-seg" style={{ width: `${(sevCounts.high / totalSevCount) * 100}%`, background: 'var(--priority-high)' }} />
                      <div className="sev-seg" style={{ width: `${(sevCounts.medium / totalSevCount) * 100}%`, background: 'var(--priority-medium)' }} />
                      <div className="sev-seg" style={{ width: `${(sevCounts.low / totalSevCount) * 100}%`, background: 'var(--priority-low)' }} />
                    </>}
                  </div>
                </div>
                <div className="feed-header-right">
                  {/* View toggle */}
                  <div className="feed-view-toggle">
                    <button
                      className={`feed-view-btn${viewMode === 'cards' ? ' active' : ''}`}
                      onClick={() => setViewMode('cards')}
                      title="Card view"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    </button>
                    <button
                      className={`feed-view-btn${viewMode === 'table' ? ' active' : ''}`}
                      onClick={() => setViewMode('table')}
                      title="Table view"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3" y2="6"/><line x1="3" y1="12" x2="3" y2="12"/><line x1="3" y1="18" x2="3" y2="18"/></svg>
                    </button>
                  </div>
                  <button className="feed-btn" onClick={() => openOverlay('wizard')}>
                    <Add24Regular /> New
                  </button>
                  <button className="feed-btn" onClick={handleRefreshInsights} disabled={isLoading} aria-label="Refresh work orders">
                    <ArrowSync24Regular />
                  </button>
                </div>
              </div>

              {/* Severity filter pills + Sort */}
              <div className="feed-filter-bar">
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => {
                  const colors: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e' };
                  const count = sev === 'all' ? workOrders.length
                    : workOrders.filter(w => w.severity === sev).length;
                  return (
                    <button
                      key={sev}
                      className={`feed-filter-pill${feedFilter === sev ? ' active' : ''}`}
                      onClick={() => setFeedFilter(sev as 'all' | Severity)}
                    >
                      {sev !== 'all' && <span className="ff-dot" style={{ background: colors[sev] }} />}
                      {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)}
                      <span className="ff-count">{count}</span>
                    </button>
                  );
                })}
                <select
                  value={feedSort}
                  onChange={(e) => setFeedSort(e.target.value as typeof feedSort)}
                  aria-label="Sort work orders"
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--glass-border)',
                    background: 'var(--glass-bg)',
                    color: 'var(--text-primary)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="priority">Sort: Priority</option>
                  <option value="severity">Sort: Severity</option>
                  <option value="cost">Sort: Cost</option>
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                </select>
              </div>

              {/* Work Orders — Card or Table view */}
              {filteredWorkOrders.length === 0 ? (
                <div className="wo-feed-empty">
                  <div className="wo-feed-empty-icon"><Map24Regular /></div>
                  <div className="wo-feed-empty-title">{feedFilter !== 'all' ? `No ${feedFilter} work orders` : 'No work orders loaded yet'}</div>
                  <div className="wo-feed-empty-sub">
                    {isLoading ? 'Connecting to MCP agents...' : feedFilter !== 'all' ? 'Try a different filter' : 'Tap refresh or create a new work order to get started'}
                  </div>
                </div>
              ) : viewMode === 'table' ? (
                <div className="wo-table-wrapper">
                  <WorkOrderTable
                    workOrders={filteredWorkOrders}
                    onSelectWorkOrder={handleTableSelectWO}
                    onDispatchWorkOrder={handleDispatchCrew}
                    onViewOnMap={handleViewOnMap}
                    onCreateNew={() => openOverlay('wizard')}
                    onRefresh={handleRefreshInsights}
                    isLoading={isLoading}
                    selectedWorkOrderId={mapState.selectedWorkOrderId}
                  />
                </div>
              ) : (
                <>
                  <div className="wovc-grid">
                    {filteredWorkOrders.map((wo, idx) => (
                      <WorkOrderVisualCard
                        key={wo.id}
                        workOrder={wo}
                        crews={crews}
                        isSelected={mapState.selectedWorkOrderId === wo.id}
                        onSelect={handleTableSelectWO}
                        onViewOnMap={handleViewOnMap}
                        onDispatch={handleDispatchCrew}
                        animDelay={idx * 40}
                      />
                    ))}
                  </div>
                  <div className="wo-feed-pagination">
                    <span className="wo-feed-pag-info">{filteredWorkOrders.length} work orders{feedFilter !== 'all' ? ` (${feedFilter})` : ''}</span>
                  </div>
                </>
              )}
            </div>

          </div>
        </main>
      )}

      {/* ══ Work Order Detail Card (floating popup) ══ */}
      {previewWorkOrder && (
        <WorkOrderDetailCard
          workOrder={previewWorkOrder}
          crews={crews}
          onClose={() => setPreviewWorkOrder(null)}
          onViewOnMap={(wo) => { setPreviewWorkOrder(null); handleViewOnMap(wo); }}
          onDispatchCrew={(woId) => { setPreviewWorkOrder(null); handleDispatchCrew(woId); }}
          theme={theme}
        />
      )}

      {/* ══ Work Order Creation Wizard ══ */}
      <WorkOrderWizard
        isOpen={isOverlay('wizard')}
        onClose={closeOverlay}
        onCreated={handleWizardCreated}
        crews={crews}
        existingWorkOrders={workOrders}
        onOpenMap={handleOpenMapForPick}
      />

      {/* Unified Side Panel (AI Chat + Ops) — collapsible */}
      {!isOverlay('decayVisualizer') && sidebarOpen && <div className={`sidebar-wrapper ${mobileSidebarOpen ? 'sidebar-open' : ''}`}>
        {/* Mobile overlay backdrop */}
        <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
        <UnifiedSidePanel
        insights={insights}
        crews={crews}
        estimation={crewEstimation}
        workOrders={workOrders}
        selectedWorkOrderIds={selectedWorkOrderIds.length > 0 ? selectedWorkOrderIds : (mapState.selectedWorkOrderId ? [mapState.selectedWorkOrderId] : [])}
        isLoading={isLoading}
        onRefresh={handleRefreshInsights}
        onSimulate={handleSimulate}
        onClustersUpdate={(newClusters, show) => {
          setClusters(newClusters);
          setShowClusters(show);
        }}
        onStaffZonesUpdate={(newZones, show) => {
          setStaffZones(newZones);
          setShowStaffZones(show);
        }}
        onHotspotsUpdate={(newHotspots, show) => {
          setHotspots(newHotspots);
          setShowHotspots(show);
        }}
        onZoomToLocation={(lat, lng, zoom) => {
          setFocusedLocation({ lat, lng, zoom: zoom || 15, key: Date.now() });
          setMapState(prev => ({
            ...prev,
            center: [lat, lng] as [number, number],
            zoom: zoom || 15,
          }));
        }}
        onMapCommand={handleMapCommand}
        onLayerToggle={handleAgentLayerToggle}
        onShowDecayVisualizer={() => openOverlay('decayVisualizer')}
        mapState={{
          visibleLayers: mapState.visibleLayers,
          selectedWorkOrderId: mapState.selectedWorkOrderId,
          zoom: mapState.zoom,
          center: mapState.center,
          filterPriority: mapState.filterPriority,
          filterType: mapState.filterType,
          showClusters,
        }}
        weather={weather.length > 0 ? { temperature: weather[0].temperature, condition: weather[0].condition } : null}
        connectionStatus={connectionStatus}
        onDispatchCreated={(dispatch) => {
          loadDispatches();
        }}
        onWorkOrderFocus={(woId) => {
          const wo = workOrders.find(w => w.id === woId);
          if (wo) {
            setFocusedWorkOrder(wo);
            openOverlay('mapModal');
            setFocusedLocation({ lat: wo.latitude, lng: wo.longitude, zoom: 16, key: Date.now() });
            setMapState(prev => ({
              ...prev,
              center: [wo.latitude, wo.longitude] as [number, number],
              zoom: 16,
              selectedWorkOrderId: woId,
            }));
          }
        }}
        defaultTab="chat"
        onManageCrews={() => openOverlay('crewManagement')}
        onOpenTraces={() => openOverlay('traceViewer')}
        onOpenRAI={() => openOverlay('responsibleAI')}
        onOpenSK={() => openOverlay('skPanel')}
        onOpenModelRouter={() => openOverlay('modelRouter')}
        onOpenStream={() => openOverlay('pipelineStream')}
      />
      </div>}

      {/* Loading Banner — non-blocking, map stays visible */}
      {isLoading && connectionStatus === 'connecting' && (
        <div style={{
          position: 'fixed',
          top: 44,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 20px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <Spinner size="tiny" />
          <Text size={300}>Connecting to MCP…</Text>
        </div>
      )}

      {/* Error Banner — shown when MCP fails */}
      {connectionStatus === 'error' && !isLoading && (
        <div style={{
          position: 'fixed',
          top: 44,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          background: 'rgba(200, 50, 50, 0.9)',
          backdropFilter: 'blur(16px)',
          borderRadius: 'var(--radius-lg)',
          padding: '8px 20px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
        }} onClick={() => fetchData()}>
          <Warning24Regular style={{ color: 'white' }} />
          <Text size={300} style={{ color: 'white' }}>MCP unavailable — tap to retry</Text>
        </div>
      )}

      {/* ══ All Overlay / Modal Panels (extracted component) ══ */}
      <OverlayManager
        workOrders={workOrders}
        crews={crews}
        weather={weather}
        mapState={mapState}
        theme={theme}
        schools={schools}
        clusters={clusters}
        showClusters={showClusters}
        staffZones={staffZones}
        showStaffZones={showStaffZones}
        hotspots={hotspots}
        showHotspots={showHotspots}
        focusedLocation={focusedLocation}
        decayOverlay={decayOverlay}
        decayMonth={decayMonth}
        decayBaseline={decayBaseline}
        dispatchingWorkOrder={dispatchingWorkOrder}
        setDispatchingWorkOrder={setDispatchingWorkOrder}
        focusedWorkOrder={focusedWorkOrder}
        setFocusedWorkOrder={setFocusedWorkOrder}
        mapPickCallback={mapPickCallback}
        setMapPickCallback={setMapPickCallback}
        selectedWorkOrderIds={selectedWorkOrderIds}
        selectionMode={selectionMode}
        onWorkOrderSelect={handleWorkOrderSelect}
        onDispatchCrew={handleDispatchCrew}
        onMapStateChange={handleMapStateChange}
        onSelectionChange={handleSelectionChange}
        onSelectionModeChange={handleSelectionModeChange}
        onLayerToggle={handleAgentLayerToggle}
        onRestartTour={handleRestartTour}
        onLoadDispatches={loadDispatches}
        onCrewsUpdated={(updated) => setCrews(updated)}
        onClustersUpdate={(newClusters, show) => { setClusters(newClusters); setShowClusters(show); }}
        onStaffZonesUpdate={(newZones, show) => { setStaffZones(newZones); setShowStaffZones(show); }}
        onHotspotsUpdate={(newHotspots, show) => { setHotspots(newHotspots); setShowHotspots(show); }}
        onZoomToLocation={(lat, lng, zoom) => {
          setFocusedLocation({ lat, lng, zoom: zoom || 15, key: Date.now() });
          setMapState(prev => ({ ...prev, center: [lat, lng] as [number, number], zoom: zoom || 15 }));
        }}
        onDecayMonth={(snapshot: DecaySnapshot) => {
          setDecayOverlay(snapshot.workOrders);
          setDecayMonth(snapshot.month);
          if (snapshot.month === 0) setDecayBaseline(snapshot.workOrders);
        }}
        onDecayClose={() => {
          closeOverlay();
          setDecayOverlay(null);
          setDecayMonth(0);
          setDecayBaseline(null);
          setClusters([]);
          setShowClusters(false);
          setStaffZones([]);
          setShowStaffZones(false);
        }}
        onFlyTo={(lat, lng, zoom) => setFocusedLocation({ lat, lng, zoom, key: Date.now() })}
      />
    </div>
    </FluentProvider>
  );
};

export default Dashboard;

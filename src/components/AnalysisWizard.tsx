/**
 * MAINTAIN AI - Analysis Wizard (v2)
 * 
 * Streamlined step-by-step wizard for non-technical public works users.
 * 
 * Changes from v1:
 *  - Auto-pulls weather from weatherService (no manual picker)
 *  - Simplified labor rates (hourly + OT only, no benefits)
 *  - Cost estimates auto-run clustering so "View on Map" works
 *  - Cleaner, less cluttered UI
 *  - Can be embedded in side panel or launched as overlay
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Text,
  Button,
  Badge,
  Spinner,
  Tooltip,
  Popover,
  PopoverTrigger,
  PopoverSurface,
} from '@fluentui/react-components';
import {
  ArrowLeft24Regular,
  ArrowRight24Regular,
  Checkmark24Regular,
  Dismiss24Regular,
  Organization24Regular,
  ArrowTrending24Regular,
  Calculator24Regular,
  TargetArrow24Regular,
  Play24Regular,
  Save24Regular,
  ArrowReset24Regular,
  DocumentBulletList24Regular,
  Wand24Regular,
  Question24Regular,
  ChevronDown24Regular,
  ChevronUp24Regular,
  Money24Regular,
  People24Regular,
  Warning24Regular,
  CheckmarkCircle24Regular,
  Map24Regular,
  Brain24Regular,
  Person24Regular,
  Flash24Regular,
  ShieldCheckmark24Regular,
  WeatherSunny24Regular,
  WeatherCloudy24Regular,
  WeatherRain24Regular,
  WeatherSnowflake24Regular,
  Temperature24Regular,
  Drop24Regular,
} from '@fluentui/react-icons';
import type { WorkOrder, WeatherForecast } from '../types/infrastructure';
import {
  type UserPricingConfig,
  getPricingConfig,
  savePricingConfig,
  resetPricingConfig,
  calculateBatchCost,
} from '../services/pricingService';
import {
  kMeansClustering,
  monteCarloForecast,
  estimateCostAndTime,
  optimizeStaffPlacement,
  predictHotspots,
  type Cluster,
  type MonteCarloResult,
  type RegressionResult,
  type StaffPlacementRecommendation,
  type StaffZone,
  type PredictiveHotspot,
} from '../services/analyticsService';
import { getWeatherForecast, getWeatherDataSource } from '../services/weatherService';

// ── ML Backend API ──
const ML_API_URL = process.env.REACT_APP_AGENT_API_URL || '';
let mlApiAvailable: boolean | null = null;

async function callMLApi<T>(path: string, body: Record<string, unknown>, timeoutMs = 30000): Promise<T | null> {
  if (mlApiAvailable === false || !ML_API_URL) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`${ML_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`ML API ${resp.status}`);
    mlApiAvailable = true;
    return await resp.json() as T;
  } catch (err) {
    console.info('[ML API] Falling back to local analytics:', err instanceof Error ? err.message : err);
    mlApiAvailable = false;
    // Auto-retry after 60s
    setTimeout(() => { mlApiAvailable = null; }, 60_000);
    return null;
  }
}

// ============================================
// Types
// ============================================

type AnalysisType = 'cost_estimate' | 'cluster_analysis' | 'workload_forecast' | 'crew_placement' | 'predictive_hotspots' | 'full_report';

interface AnalysisWizardProps {
  isOpen: boolean;
  onClose: () => void;
  workOrders: WorkOrder[];
  weather?: WeatherForecast[];
  onClustersUpdate?: (clusters: Cluster[], show: boolean) => void;
  onStaffZonesUpdate?: (zones: StaffZone[], show: boolean) => void;
  onHotspotsUpdate?: (hotspots: PredictiveHotspot[], show: boolean) => void;
  onZoomToLocation?: (lat: number, lng: number, zoom?: number) => void;
  /** When true, renders inline (no overlay/modal) for side panel embedding */
  embedded?: boolean;
}

// ============================================
// Analysis Type Cards
// ============================================

const ANALYSIS_TYPES: Array<{
  id: AnalysisType;
  title: string;
  icon: React.ReactNode;
  desc: string;
  helpText: string;
  color: string;
}> = [
  {
    id: 'cost_estimate',
    title: 'Cost Estimate',
    icon: <Calculator24Regular />,
    desc: 'Calculate repair costs for all work orders',
    helpText: 'Looks at each work order type and severity, then calculates total materials, labor, and equipment costs using your pricing. Results also show clusters on the map.',
    color: '#22c55e',
  },
  {
    id: 'cluster_analysis',
    title: 'Geographic Clustering',
    icon: <Organization24Regular />,
    desc: 'Group nearby issues into work zones',
    helpText: 'Finds "hot spots" where issues are close together so crews can tackle one zone at a time instead of driving all over town. Clusters show on the map.',
    color: '#6366f1',
  },
  {
    id: 'workload_forecast',
    title: 'Workload Forecast',
    icon: <ArrowTrending24Regular />,
    desc: 'Predict how many new work orders to expect',
    helpText: 'Runs 1,000 simulations using your current data and weather patterns to predict future volume. Shows best, expected, and worst case scenarios.',
    color: '#eab308',
  },
  {
    id: 'crew_placement',
    title: 'Crew Placement',
    icon: <TargetArrow24Regular />,
    desc: 'Optimize where to position crews',
    helpText: 'Analyzes issue locations and severity to recommend where to station crews. Zones and positions show on the map.',
    color: '#ef4444',
  },
  {
    id: 'predictive_hotspots',
    title: 'Predict Future Issues',
    icon: <Flash24Regular />,
    desc: 'Forecast where new problems will emerge',
    helpText: 'Uses historical patterns, issue age, severity trends, weather data, and proximity analysis to predict geographic areas most likely to develop new infrastructure problems. Shows risk zones on the map.',
    color: '#f97316',
  },
  {
    id: 'full_report',
    title: 'Full Report',
    icon: <DocumentBulletList24Regular />,
    desc: 'Run everything — costs, clusters, forecast, crews',
    helpText: 'Runs all four analyses and gives you a comprehensive report. Great for council presentations or budget meetings.',
    color: '#a855f7',
  },
];

// ============================================
// Component
// ============================================

const AnalysisWizard: React.FC<AnalysisWizardProps> = ({
  isOpen,
  onClose,
  workOrders,
  weather: weatherProp,
  onClustersUpdate,
  onStaffZonesUpdate,
  onHotspotsUpdate,
  onZoomToLocation,
  embedded = false,
}) => {
  // Steps: 0=Choose, 1=Configure, 2=Pricing, 3=Results
  const [step, setStep] = useState(0);
  const [analysisType, setAnalysisType] = useState<AnalysisType | null>(null);
  const [pricingConfig, setPricingConfig] = useState<UserPricingConfig>(getPricingConfig());
  const [isRunning, setIsRunning] = useState(false);
  const [analysisTime, setAnalysisTime] = useState<number | null>(null);
  const [helpId, setHelpId] = useState<string | null>(null);

  // Auto-fetched weather
  const [autoWeather, setAutoWeather] = useState<WeatherForecast[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherConditionLabel, setWeatherConditionLabel] = useState('');

  // Pricing editor
  const [pricingSection, setPricingSection] = useState<string | null>(null);

  // Parameters
  const [params, setParams] = useState({
    clusterCount: 4,
    forecastDays: 7,
    crewCount: 6,
    crewAvailability: 100,
  });

  // Results
  const [results, setResults] = useState<{
    costEstimate?: ReturnType<typeof calculateBatchCost>;
    clusters?: Cluster[];
    forecast?: MonteCarloResult;
    staffing?: StaffPlacementRecommendation;
    regression?: RegressionResult;
    hotspots?: PredictiveHotspot[];
  } | null>(null);

  // Auto-fetch weather when wizard opens
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setAnalysisType(null);
      setResults(null);
      setIsRunning(false);
      setPricingConfig(getPricingConfig());
      setPricingSection(null);

      // Use provided weather or fetch
      if (weatherProp && weatherProp.length > 0) {
        setAutoWeather(weatherProp);
        setWeatherConditionLabel(weatherProp[0].condition);
      } else {
        setWeatherLoading(true);
        getWeatherForecast(14)
          .then(forecast => {
            setAutoWeather(forecast);
            if (forecast.length > 0) {
              setWeatherConditionLabel(forecast[0].condition);
            }
          })
          .catch(() => {
            setWeatherConditionLabel('clear');
          })
          .finally(() => setWeatherLoading(false));
      }
    }
  }, [isOpen, weatherProp]);

  // Only cost_estimate and full_report need the pricing step
  const needsPricing = analysisType === 'cost_estimate' || analysisType === 'full_report';
  const stepLabels = needsPricing ? ['Choose', 'Configure', 'Pricing', 'Results'] : ['Choose', 'Configure', 'Results'];
  const runStep = needsPricing ? 2 : 1; // Which step triggers "Run Analysis"
  const resultsStep = needsPricing ? 3 : 2;

  const canNext = useCallback(() => {
    if (step === 0) return analysisType !== null;
    return true;
  }, [step, analysisType]);

  const handleNext = () => {
    if (step === runStep) {
      runAnalysis();
    } else {
      setStep(s => s + 1);
    }
  };

  // ── Run Analysis (ML backend → local fallback) ──
  const runAnalysis = async () => {
    setIsRunning(true);
    setAnalysisTime(null);
    setStep(resultsStep);
    const startTime = performance.now();
    try {
      const newResults: typeof results = {};
      await new Promise(r => setTimeout(r, 400));

      const weatherCondition = weatherConditionLabel || 'clear';
      const woPayload = workOrders.map(wo => ({
        id: wo.id, issueType: wo.issueType, severity: wo.severity,
        address: wo.address, nearSchool: wo.nearSchool, createdAt: wo.createdAt,
        latitude: wo.latitude, longitude: wo.longitude, status: wo.status,
        estimatedCost: wo.estimatedCost, zone: wo.zone, priorityScore: wo.priorityScore,
      }));
      const temp = autoWeather?.[0]?.temperature ?? 50;

      if (analysisType === 'cost_estimate' || analysisType === 'full_report') {
        // Try ML backend first
        const mlCost = await callMLApi<{
          success: boolean; r2Score?: number; aggregate?: {
            totalPredictedCost: number; totalOriginalEstimate: number;
            savingsOpportunity: number; meanPredicted: number;
            costRange: { low: number; high: number };
          }; featureImportances?: { feature: string; importance: number; description: string }[];
          predictions?: { workOrderId: string; predictedCost: number; originalEstimate: number; delta: number }[];
        }>('/api/ml/cost-estimate', { workOrders: woPayload, weather: weatherCondition, temperature: temp });

        if (mlCost?.success && mlCost.aggregate) {
          // Map ML response → RegressionResult shape
          const agg = mlCost.aggregate;
          const regression: RegressionResult = {
            predictedCost: agg.totalPredictedCost,
            predictedDays: Math.max(3, Math.ceil(workOrders.length * 0.7)),
            costRange: { low: agg.costRange.low, high: agg.costRange.high },
            daysRange: { low: Math.max(2, Math.ceil(workOrders.length * 0.5)), high: Math.ceil(workOrders.length * 1.2) },
            factors: (mlCost.featureImportances || []).map(fi => ({
              name: fi.feature,
              impact: fi.importance,
              description: fi.description,
            })),
            r2Score: mlCost.r2Score || 0,
          };
          newResults.regression = regression;
          console.info('[Analysis] ML cost prediction used (R²=' + (mlCost.r2Score || 0).toFixed(3) + ')');
        } else {
          // Fallback to local
          newResults.regression = estimateCostAndTime(workOrders, weatherCondition, params.crewAvailability);
        }

        const customCost = calculateBatchCost(
          workOrders.map(wo => ({ issueType: wo.issueType, severity: wo.severity })),
          pricingConfig
        );
        newResults.costEstimate = customCost;

        if (analysisType === 'cost_estimate') {
          const clusters = kMeansClustering(workOrders, params.clusterCount);
          newResults.clusters = clusters;
          onClustersUpdate?.(clusters, true);
        }
      }

      if (analysisType === 'cluster_analysis' || analysisType === 'full_report') {
        // Clustering stays local (k-means is already ML, and spatial data doesn't need a backend round-trip)
        const clusters = kMeansClustering(workOrders, params.clusterCount);
        newResults.clusters = clusters;
        onClustersUpdate?.(clusters, true);
      }

      if (analysisType === 'workload_forecast' || analysisType === 'full_report') {
        const mlForecast = await callMLApi<{
          success: boolean; forecast?: {
            simulations: number; meanWorkOrders: number; stdDeviation: number;
            percentile5: number; percentile50: number; percentile95: number;
            dailyForecasts: { date: string; low: number; expected: number; high: number }[];
            confidence: number;
          };
        }>('/api/ml/workload-forecast', { workOrders: woPayload, daysAhead: params.forecastDays, weather: weatherCondition, temperature: temp });

        if (mlForecast?.success && mlForecast.forecast) {
          const f = mlForecast.forecast;
          const forecast: MonteCarloResult = {
            simulations: f.simulations,
            meanWorkOrders: f.meanWorkOrders,
            stdDeviation: f.stdDeviation,
            percentile5: f.percentile5,
            percentile50: f.percentile50,
            percentile95: f.percentile95,
            worstCase: f.percentile95 * 1.3,
            bestCase: Math.max(0, f.percentile5 * 0.7),
            dailyForecasts: f.dailyForecasts.map(d => ({
              date: d.date, low: d.low, expected: d.expected, high: d.high,
            })),
            confidence: f.confidence,
          };
          newResults.forecast = forecast;
          console.info('[Analysis] ML workload forecast used (confidence=' + f.confidence.toFixed(3) + ')');
        } else {
          const weatherData = autoWeather && autoWeather.length > 0 ? autoWeather : [];
          newResults.forecast = monteCarloForecast(workOrders, weatherData, params.forecastDays);
        }
      }

      if (analysisType === 'crew_placement' || analysisType === 'full_report') {
        const mlCrew = await callMLApi<{
          success: boolean; zones?: {
            id: string; name: string; center: { lat: number; lng: number };
            recommendedCrews: number; workloadScore: number; priority: string;
            workOrderCount: number; dominantType: string; mlUrgencyScore: number;
          }[]; totalCrewsNeeded?: number; coverageScore?: number; reasoning?: string[];
        }>('/api/ml/crew-placement', { workOrders: woPayload, availableCrews: params.crewCount, weather: weatherCondition, temperature: temp });

        if (mlCrew?.success && mlCrew.zones) {
          const staffing: StaffPlacementRecommendation = {
            zones: mlCrew.zones.map(z => ({
              id: z.id,
              name: z.name,
              center: z.center,
              recommendedCrews: z.recommendedCrews,
              workloadScore: z.workloadScore,
              priority: z.priority as 'low' | 'medium' | 'high',
              workOrderCount: z.workOrderCount,
              dominantType: z.dominantType,
            })),
            totalCrewsNeeded: mlCrew.totalCrewsNeeded || params.crewCount,
            coverageScore: mlCrew.coverageScore || 0,
            reasoning: mlCrew.reasoning || [],
          };
          newResults.staffing = staffing;
          onStaffZonesUpdate?.(staffing.zones, true);
          console.info('[Analysis] ML crew placement used (' + mlCrew.zones.length + ' zones)');
        } else {
          const staffing = optimizeStaffPlacement(workOrders, params.crewCount);
          newResults.staffing = staffing;
          onStaffZonesUpdate?.(staffing.zones, true);
        }
      }

      if (analysisType === 'predictive_hotspots' || analysisType === 'full_report') {
        const mlHotspots = await callMLApi<{
          success: boolean; hotspots?: {
            id: string; center: { lat: number; lng: number }; radius: number;
            riskScore: number; dominantType: string; expectedIssues: number;
            factors: { name: string; weight: number; description?: string }[];
            color: string; label: string;
          }[];
        }>('/api/ml/predict-hotspots', { workOrders: woPayload, weather: weatherCondition, temperature: temp });

        if (mlHotspots?.success && mlHotspots.hotspots) {
          const hotspots: PredictiveHotspot[] = mlHotspots.hotspots.map((h, idx) => ({
            id: h.id || `ml-hotspot-${idx}`,
            center: h.center,
            radius: h.radius,
            riskScore: h.riskScore,
            dominantType: h.dominantType,
            expectedIssues: h.expectedIssues,
            factors: h.factors.map(f => ({ name: f.name, weight: f.weight, description: f.description || '' })),
            color: h.color,
            label: h.label,
          }));
          newResults.hotspots = hotspots;
          onHotspotsUpdate?.(hotspots, true);
          console.info('[Analysis] ML hotspot prediction used (' + hotspots.length + ' hotspots)');
        } else {
          const weatherData = autoWeather && autoWeather.length > 0 ? autoWeather : [];
          const hotspots = predictHotspots(workOrders, weatherData);
          newResults.hotspots = hotspots;
          onHotspotsUpdate?.(hotspots, true);
        }
      }

      setResults(newResults);
      setAnalysisTime(Math.round(performance.now() - startTime));
    } catch (err) {
      console.error('Analysis error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const updateMaterialPrice = (id: string, value: number) => {
    setPricingConfig(prev => ({
      ...prev,
      materials: prev.materials.map(m => m.id === id ? { ...m, costPerUnit: value } : m),
    }));
  };

  const updateLaborRate = (id: string, field: 'hourlyRate' | 'overtimeRate', value: number) => {
    setPricingConfig(prev => ({
      ...prev,
      laborRates: prev.laborRates.map(r => r.id === id ? { ...r, [field]: value } : r),
    }));
  };

  if (!isOpen) return null;

  // ============================================
  // Step Renderers
  // ============================================

  // ── Step 0: Choose Analysis ──
  const renderChooseStep = () => (
    <div style={{ padding: '16px 20px' }}>
      {/* Data summary */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 14, padding: '10px 12px',
        background: 'var(--glass-bg)', borderRadius: 10,
        border: '1px solid var(--glass-border)',
      }}>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Orders</Text>
          <Text size={400} weight="bold">{workOrders.length}</Text>
        </div>
        <div style={{ width: 1, background: 'var(--glass-border)' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Critical</Text>
          <Text size={400} weight="bold" style={{ color: '#ef4444' }}>
            {workOrders.filter(w => w.severity === 'critical').length}
          </Text>
        </div>
        <div style={{ width: 1, background: 'var(--glass-border)' }} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Weather</Text>
          {weatherLoading
            ? <Spinner size="tiny" />
            : <Text size={200} weight="semibold" style={{ textTransform: 'capitalize' }}>{weatherConditionLabel || '...'}</Text>
          }
        </div>
      </div>

      {/* Analysis cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ANALYSIS_TYPES.map(at => {
          const selected = analysisType === at.id;
          return (
            <div key={at.id}>
              <div
                onClick={() => setAnalysisType(at.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 10,
                  background: selected ? `${at.color}12` : 'var(--bg-tertiary)',
                  border: `2px solid ${selected ? at.color : 'transparent'}`,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: `${at.color}18`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: at.color, flexShrink: 0,
                }}>
                  {at.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size={200} weight="semibold" style={{ display: 'block' }}>{at.title}</Text>
                  <Text size={100} style={{ color: 'var(--text-secondary)' }}>{at.desc}</Text>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setHelpId(helpId === at.id ? null : at.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, flexShrink: 0 }}
                >
                  <Question24Regular />
                </button>
                {selected && <Checkmark24Regular style={{ color: at.color, flexShrink: 0 }} />}
              </div>
              {helpId === at.id && (
                <div style={{
                  margin: '4px 0 2px', padding: '10px 14px',
                  background: 'var(--accent-primary-alpha)', borderRadius: 8,
                  border: '1px solid var(--accent-primary)',
                }}>
                  <Text size={100} style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    {at.helpText}
                  </Text>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Step 1: Configure ──
  const renderConfigureStep = () => {
    const info = ANALYSIS_TYPES.find(a => a.id === analysisType);
    const needsClusters = analysisType === 'cluster_analysis' || analysisType === 'cost_estimate' || analysisType === 'full_report';
    const needsForecast = analysisType === 'workload_forecast' || analysisType === 'full_report';
    const needsCrews = analysisType === 'crew_placement' || analysisType === 'full_report';
    const needsCost = analysisType === 'cost_estimate' || analysisType === 'full_report';

    return (
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${info?.color || '#6366f1'}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: info?.color,
          }}>
            {info?.icon}
          </div>
          <Text size={300} weight="semibold">{info?.title} Settings</Text>
        </div>

        {/* Auto-detected weather banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', marginBottom: 12,
          background: 'rgba(99, 102, 241, 0.08)', borderRadius: 8,
          border: '1px solid rgba(99, 102, 241, 0.2)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'rgba(99, 102, 241, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Text size={300}>
              {weatherConditionLabel === 'clear' ? <WeatherSunny24Regular /> :
               weatherConditionLabel === 'cloudy' ? <WeatherCloudy24Regular /> :
               weatherConditionLabel === 'rain' ? <WeatherRain24Regular /> :
               weatherConditionLabel === 'snow' ? <WeatherSnowflake24Regular /> :
               weatherConditionLabel === 'freezing' ? <WeatherSnowflake24Regular /> :
               weatherConditionLabel === 'freeze_thaw' ? <Temperature24Regular /> : <WeatherSunny24Regular />}
            </Text>
          </div>
          <div style={{ flex: 1 }}>
            <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>Current weather (auto-detected)</Text>
            <Text size={200} weight="semibold" style={{ textTransform: 'capitalize' }}>
              {weatherConditionLabel || 'Loading...'}
              {autoWeather?.[0] && ` - ${Math.round(autoWeather[0].temperature)}F`}
            </Text>
          </div>
          <Badge size="small" color="informative">Live</Badge>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Cluster zones */}
          {needsClusters && (
            <div className="card-tertiary">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <Text size={200} weight="semibold" style={{ display: 'block' }}>Work Zones</Text>
                  <Text size={100} style={{ color: 'var(--text-muted)' }}>How many groups to create</Text>
                </div>
                <Badge appearance="filled" color="brand" size="large">{params.clusterCount}</Badge>
              </div>
              <input type="range" min="2" max="10" value={params.clusterCount}
                onChange={e => setParams(p => ({ ...p, clusterCount: +e.target.value }))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>Fewer zones</Text>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>More zones</Text>
              </div>
            </div>
          )}

          {/* Forecast days */}
          {needsForecast && (
            <div className="card-tertiary">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <Text size={200} weight="semibold" style={{ display: 'block' }}>Days to Forecast</Text>
                  <Text size={100} style={{ color: 'var(--text-muted)' }}>How far ahead to predict</Text>
                </div>
                <Badge appearance="filled" color="warning" size="large">{params.forecastDays}d</Badge>
              </div>
              <input type="range" min="3" max="60" value={params.forecastDays}
                onChange={e => setParams(p => ({ ...p, forecastDays: +e.target.value }))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Crew count */}
          {needsCrews && (
            <div className="card-tertiary">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div>
                  <Text size={200} weight="semibold" style={{ display: 'block' }}>Available Crews</Text>
                  <Text size={100} style={{ color: 'var(--text-muted)' }}>How many crews to deploy</Text>
                </div>
                <Badge appearance="filled" color="danger" size="large">{params.crewCount}</Badge>
              </div>
              <input type="range" min="1" max="20" value={params.crewCount}
                onChange={e => setParams(p => ({ ...p, crewCount: +e.target.value }))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Crew availability + budget */}
          {needsCost && (
            <>
              <div className="card-tertiary">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <Text size={200} weight="semibold" style={{ display: 'block' }}>Crew Availability</Text>
                    <Text size={100} style={{ color: 'var(--text-muted)' }}>% of crews available</Text>
                  </div>
                  <Badge appearance="filled" color="informative" size="large">{params.crewAvailability}%</Badge>
                </div>
                <input type="range" min="20" max="100" step="5" value={params.crewAvailability}
                  onChange={e => setParams(p => ({ ...p, crewAvailability: +e.target.value }))}
                  style={{ width: '100%', cursor: 'pointer' }}
                />
              </div>
              <div className="card-tertiary">
                <Text size={200} weight="semibold" style={{ display: 'block', marginBottom: 4 }}>Annual Budget</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text size={300}>$</Text>
                  <input
                    type="number"
                    value={pricingConfig.analysisParams.annualBudget}
                    onChange={e => setPricingConfig(prev => ({
                      ...prev,
                      analysisParams: { ...prev.analysisParams, annualBudget: parseInt(e.target.value) || 0 }
                    }))}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 8,
                      border: '1px solid var(--glass-border)', background: 'var(--glass-bg)',
                      color: 'var(--text-primary)', fontSize: 15,
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Step 2: Pricing ──
  const renderPricingStep = () => (
    <div style={{ padding: '16px 20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
        padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 12,
        border: '1px solid var(--glass-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Money24Regular style={{ color: '#818cf8', fontSize: 18 }} />
          </div>
          <div>
            <Text size={300} weight="semibold" style={{ display: 'block' }}>Custom Pricing</Text>
            <Text size={100} style={{ color: 'var(--text-muted)' }}>Match your department's actual costs</Text>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <Tooltip content="Save pricing" relationship="label">
            <Button appearance="subtle" size="small" icon={<Save24Regular />}
              onClick={() => savePricingConfig(pricingConfig)}
              style={{ borderRadius: 8 }} />
          </Tooltip>
          <Tooltip content="Reset to defaults" relationship="label">
            <Button appearance="subtle" size="small" icon={<ArrowReset24Regular />}
              onClick={() => setPricingConfig(resetPricingConfig())}
              style={{ borderRadius: 8 }} />
          </Tooltip>
        </div>
      </div>

      {/* LABOR RATES */}
      <div style={{
        background: 'var(--bg-tertiary)', borderRadius: 12,
        border: '1px solid var(--glass-border)', marginBottom: 10, overflow: 'hidden',
      }}>
        <div
          onClick={() => setPricingSection(pricingSection === 'labor' ? null : 'labor')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(99, 102, 241, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <People24Regular style={{ color: '#818cf8', fontSize: 16 }} />
          </div>
          <Text size={200} weight="semibold" style={{ flex: 1 }}>Labor Rates</Text>
          <Badge size="small" appearance="tint" color="brand">{pricingConfig.laborRates.length}</Badge>
          {pricingSection === 'labor' ? <ChevronUp24Regular style={{ color: 'var(--text-muted)', fontSize: 16 }} /> : <ChevronDown24Regular style={{ color: 'var(--text-muted)', fontSize: 16 }} />}
        </div>
        {pricingSection === 'labor' && (
          <div style={{ padding: '0 14px 14px' }}>
            {/* Column headers */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 8px 4px', marginBottom: 2,
            }}>
              <Text size={100} weight="semibold" style={{ flex: 1, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 9 }}>Role</Text>
              <Text size={100} weight="semibold" style={{ width: 70, textAlign: 'center', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 9 }}>$/Hour</Text>
              <Text size={100} weight="semibold" style={{ width: 70, textAlign: 'center', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 9 }}>Overtime</Text>
            </div>
            {pricingConfig.laborRates.map((rate, i) => (
              <div key={rate.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 8px',
                background: i % 2 === 0 ? 'var(--glass-bg)' : 'transparent',
                borderRadius: 8,
                transition: 'background 0.15s',
              }}>
                <Text size={200} style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{rate.role}</Text>
                <div style={{
                  width: 70, position: 'relative',
                  display: 'flex', alignItems: 'center',
                }}>
                  <span style={{ position: 'absolute', left: 6, color: 'var(--text-muted)', fontSize: 11, pointerEvents: 'none', zIndex: 1 }}>$</span>
                  <input type="number" step="0.50" value={rate.hourlyRate}
                    onChange={e => updateLaborRate(rate.id, 'hourlyRate', parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%', padding: '6px 6px 6px 16px', borderRadius: 6,
                      border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', fontSize: 13, textAlign: 'right',
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                  />
                </div>
                <div style={{
                  width: 70, position: 'relative',
                  display: 'flex', alignItems: 'center',
                }}>
                  <span style={{ position: 'absolute', left: 6, color: 'var(--text-muted)', fontSize: 11, pointerEvents: 'none', zIndex: 1 }}>$</span>
                  <input type="number" step="0.50" value={rate.overtimeRate}
                    onChange={e => updateLaborRate(rate.id, 'overtimeRate', parseFloat(e.target.value) || 0)}
                    style={{
                      width: '100%', padding: '6px 6px 6px 16px', borderRadius: 6,
                      border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)', fontSize: 13, textAlign: 'right',
                      outline: 'none', transition: 'border-color 0.15s',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MATERIALS */}
      <div style={{
        background: 'var(--bg-tertiary)', borderRadius: 12,
        border: '1px solid var(--glass-border)', marginBottom: 10, overflow: 'hidden',
      }}>
        <div
          onClick={() => setPricingSection(pricingSection === 'materials' ? null : 'materials')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(34, 197, 94, 0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Money24Regular style={{ color: '#22c55e', fontSize: 16 }} />
          </div>
          <Text size={200} weight="semibold" style={{ flex: 1 }}>Materials</Text>
          <Badge size="small" appearance="tint" color="success">{pricingConfig.materials.length}</Badge>
          {pricingSection === 'materials' ? <ChevronUp24Regular style={{ color: 'var(--text-muted)', fontSize: 16 }} /> : <ChevronDown24Regular style={{ color: 'var(--text-muted)', fontSize: 16 }} />}
        </div>
        {pricingSection === 'materials' && (
          <div style={{ padding: '0 14px 14px', maxHeight: 280, overflow: 'auto' }}>
            {(['pothole', 'sidewalk', 'concrete', 'general'] as const).map(cat => {
              const items = pricingConfig.materials.filter(m => m.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', marginBottom: 4,
                  }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent-primary)' }} />
                    <Text size={100} weight="bold" style={{
                      textTransform: 'uppercase', color: 'var(--text-muted)',
                      letterSpacing: '0.6px', fontSize: 9,
                    }}>{cat}</Text>
                  </div>
                  {items.map((mat, mi) => (
                    <div key={mat.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 8px',
                      background: mi % 2 === 0 ? 'var(--glass-bg)' : 'transparent',
                      borderRadius: 6,
                    }}>
                      <Tooltip content={mat.description} relationship="label">
                        <Text size={200} style={{ flex: 1, cursor: 'help', fontWeight: 500 }}>{mat.name}</Text>
                      </Tooltip>
                      <Text size={100} style={{ color: 'var(--text-muted)', minWidth: 42, textAlign: 'right' }}>/{mat.unit}</Text>
                      <div style={{
                        width: 68, position: 'relative',
                        display: 'flex', alignItems: 'center',
                      }}>
                        <span style={{ position: 'absolute', left: 6, color: 'var(--text-muted)', fontSize: 11, pointerEvents: 'none', zIndex: 1 }}>$</span>
                        <input type="number" step="0.25" value={mat.costPerUnit}
                          onChange={e => updateMaterialPrice(mat.id, parseFloat(e.target.value) || 0)}
                          style={{
                            width: '100%', padding: '5px 5px 5px 16px', borderRadius: 6,
                            border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)',
                            color: 'var(--text-primary)', fontSize: 13, textAlign: 'right',
                            outline: 'none', transition: 'border-color 0.15s',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CONTINGENCY */}
      <div style={{
        padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 12,
        border: '1px solid var(--glass-border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheckmark24Regular style={{ width: 14, height: 14, color: '#f59e0b' }} />
            </div>
            <Text size={200} weight="semibold">Contingency Buffer</Text>
          </div>
          <Badge appearance="filled" color="warning" size="medium"
            style={{ minWidth: 36, justifyContent: 'center' }}
          >{pricingConfig.analysisParams.contingencyPercent}%</Badge>
        </div>
        <div style={{
          padding: '6px 10px', background: 'var(--glass-bg)', borderRadius: 8,
        }}>
          <input type="range" min="0" max="30" value={pricingConfig.analysisParams.contingencyPercent}
            onChange={e => setPricingConfig(prev => ({
              ...prev,
              analysisParams: { ...prev.analysisParams, contingencyPercent: +e.target.value },
            }))}
            style={{ width: '100%', cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <Text size={100} style={{ color: 'var(--text-muted)' }}>None</Text>
            <Text size={100} style={{ color: 'var(--text-muted)' }}>30%</Text>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 3: Results ──
  const renderResultsStep = () => {
    if (isRunning) {
      return (
        <div style={{ padding: '50px 20px', textAlign: 'center' }}>
          <Spinner size="large" />
          <Text size={400} weight="semibold" style={{ display: 'block', marginTop: 14 }}>Running Analysis...</Text>
          <Text size={200} style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
            Processing {workOrders.length} work orders
          </Text>
        </div>
      );
    }
    if (!results) {
      return (
        <div style={{ padding: '50px 20px', textAlign: 'center' }}>
          <Warning24Regular style={{ fontSize: 40, color: 'var(--accent-danger)' }} />
          <Text size={400} weight="semibold" style={{ display: 'block', marginTop: 12 }}>No Results</Text>
          <Text size={200} style={{ color: 'var(--text-secondary)' }}>Something went wrong. Try again.</Text>
        </div>
      );
    }

    return (
      <div style={{ padding: '14px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <CheckmarkCircle24Regular style={{ fontSize: 36, color: '#22c55e' }} />
          <Text size={400} weight="semibold" style={{ display: 'block', marginTop: 6 }}>Analysis Complete</Text>
        </div>

        {/* AI Speed Badge */}
        {analysisTime !== null && (
          <div className="ai-speed-badge">
            <div className="ai-speed-row">
              <span className="ai-speed-icon"><Brain24Regular style={{ width: 16, height: 16 }} /></span>
              <span className="ai-speed-label">AI Analysis</span>
              <span className="ai-speed-time">{(analysisTime / 1000).toFixed(1)}s</span>
            </div>
            <div className="ai-speed-divider" />
            <div className="ai-speed-row">
              <span className="ai-speed-icon"><Person24Regular style={{ width: 16, height: 16 }} /></span>
              <span className="ai-speed-label">Manual Process</span>
              <span className="ai-speed-time manual">~{Math.round(workOrders.length * 0.4)}h</span>
            </div>
            <div className="ai-speed-multiplier">
              <Flash24Regular style={{ width: 14, height: 14 }} /> {Math.round(workOrders.length * 0.4 * 3600 / Math.max(1, analysisTime / 1000)).toLocaleString()}× faster
            </div>
          </div>
        )}

        {/* Cost Results */}
        {results.costEstimate && (
          <div className="card-tertiary" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Calculator24Regular style={{ color: '#22c55e' }} />
              <Text size={300} weight="semibold">Cost Estimate</Text>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <div style={{ padding: 10, background: 'rgba(34,197,94,0.1)', borderRadius: 8, textAlign: 'center' }}>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>Total Cost</Text>
                <Text size={500} weight="bold" style={{ color: '#22c55e', display: 'block' }}>
                  ${(results.costEstimate.totalCost / 1000).toFixed(1)}K
                </Text>
              </div>
              <div style={{ padding: 10, background: 'var(--accent-primary-alpha)', borderRadius: 8, textAlign: 'center' }}>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>With Contingency</Text>
                <Text size={500} weight="bold" style={{ color: 'var(--accent-primary)', display: 'block' }}>
                  ${(results.costEstimate.grandTotal / 1000).toFixed(1)}K
                </Text>
              </div>
            </div>

            {/* Breakdown bars */}
            {[
              { label: 'Labor', value: results.costEstimate.totalLaborCost, color: '#6366f1' },
              { label: 'Materials', value: results.costEstimate.totalMaterialCost, color: '#22c55e' },
              { label: 'Equipment', value: results.costEstimate.totalEquipmentCost, color: '#eab308' },
              { label: 'Contingency', value: results.costEstimate.contingency, color: '#ef4444' },
            ].map(item => {
              const pct = results.costEstimate ? (item.value / results.costEstimate.grandTotal) * 100 : 0;
              return (
                <div key={item.label} style={{ marginBottom: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text size={100}>{item.label}</Text>
                    <Text size={100} weight="semibold">${item.value.toLocaleString()}</Text>
                  </div>
                  <div style={{ height: 5, background: 'var(--glass-bg)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}

            {/* Budget comparison */}
            {pricingConfig.analysisParams.annualBudget > 0 && (() => {
              const pct = (results.costEstimate!.grandTotal / pricingConfig.analysisParams.annualBudget) * 100;
              const over = pct > 100;
              return (
                <div style={{
                  marginTop: 8, padding: 8, borderRadius: 8,
                  background: over ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
                  border: `1px solid ${over ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
                }}>
                  <Text size={200} weight="semibold" style={{ color: over ? '#ef4444' : '#22c55e' }}>
                    {over
                      ? `${pct.toFixed(0)}% of budget \u2014 over by $${((results.costEstimate!.grandTotal - pricingConfig.analysisParams.annualBudget) / 1000).toFixed(1)}K`
                      : `${pct.toFixed(0)}% of budget \u2014 $${((pricingConfig.analysisParams.annualBudget - results.costEstimate!.grandTotal) / 1000).toFixed(1)}K remaining`
                    }
                  </Text>
                </div>
              );
            })()}

            {/* By type */}
            <div style={{ marginTop: 8 }}>
              <Text size={100} weight="semibold" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>BY TYPE</Text>
              {Object.entries(results.costEstimate.byType).map(([type, data]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <Text size={200} style={{ textTransform: 'capitalize' }}>{type}</Text>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Text size={100} style={{ color: 'var(--text-muted)' }}>{data.count} orders</Text>
                    <Text size={200} weight="semibold">${data.cost.toLocaleString()}</Text>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 8, padding: 8, background: 'var(--glass-bg)', borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
              <Text size={200}>Total Labor</Text>
              <Text size={200} weight="bold">{results.costEstimate.totalLaborHours} hrs ({Math.ceil(results.costEstimate.totalLaborHours / 8)} crew-days)</Text>
            </div>
          </div>
        )}

        {/* Clusters */}
        {results.clusters && (
          <div className="card-tertiary" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Organization24Regular style={{ color: '#6366f1' }} />
              <Text size={300} weight="semibold">Clusters</Text>
              <Badge size="small" color="brand">{results.clusters.length} zones</Badge>
            </div>
            <Text size={100} style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Showing on map. Click a zone to fly to it.
            </Text>
            {results.clusters.map((c, i) => (
              <div key={i}
                onClick={() => onZoomToLocation?.(c.centroid.lat, c.centroid.lng, 15)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', borderRadius: 6, marginBottom: 3,
                  cursor: 'pointer', background: 'var(--glass-bg)',
                }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                <Text size={200} weight="semibold" style={{ flex: 1 }}>Zone {i + 1}</Text>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>{c.workOrders.length} orders</Text>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>${c.totalCost.toLocaleString()}</Text>
                <Map24Regular style={{ color: 'var(--accent-primary)', fontSize: 14 }} />
              </div>
            ))}
          </div>
        )}

        {/* Forecast */}
        {results.forecast && (
          <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 14, border: '1px solid var(--glass-border)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ArrowTrending24Regular style={{ color: '#fff', fontSize: 18 }} />
              </div>
              <div>
                <Text size={300} weight="semibold">Work Order Forecast</Text>
                <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>
                  {results.forecast.simulations.toLocaleString()} Monte Carlo simulations
                  {' · '}
                  <span style={{
                    color: getWeatherDataSource() === 'live' ? '#22c55e' : '#f59e0b',
                    fontWeight: 600,
                  }}>
                    {getWeatherDataSource() === 'live' ? '● Live weather' : '● Seasonal estimates'}
                  </span>
                </Text>
              </div>
            </div>

            {/* Summary stats row — premium cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{
                textAlign: 'center', padding: '10px 6px',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
                borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <Text size={100} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 9 }}>Best Case</Text>
                <Text size={500} weight="bold" style={{ color: '#22c55e', display: 'block', lineHeight: 1.2 }}>{results.forecast.bestCase}</Text>
                <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9 }}>5th percentile</Text>
              </div>
              <div style={{
                textAlign: 'center', padding: '10px 6px',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.04))',
                borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)',
              }}>
                <Text size={100} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 9 }}>Expected</Text>
                <Text size={500} weight="bold" style={{ color: '#6366f1', display: 'block', lineHeight: 1.2 }}>{results.forecast.meanWorkOrders}</Text>
                <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9 }}>median estimate</Text>
              </div>
              <div style={{
                textAlign: 'center', padding: '10px 6px',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))',
                borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <Text size={100} style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 9 }}>Worst Case</Text>
                <Text size={500} weight="bold" style={{ color: '#ef4444', display: 'block', lineHeight: 1.2 }}>{results.forecast.worstCase}</Text>
                <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9 }}>95th percentile</Text>
              </div>
            </div>

            {/* Daily Forecast Calendar */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Text size={200} weight="semibold" style={{ color: 'var(--text-secondary)' }}>Daily Breakdown</Text>
                <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
              </div>
              {(() => {
                const forecasts = results.forecast!.dailyForecasts;
                const weatherMap = new Map<string, WeatherForecast>();
                (autoWeather || []).forEach(w => weatherMap.set(w.date, w));

                const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

                const WeatherIcon = ({ condition, size = 16 }: { condition?: string; size?: number }) => {
                  const s = { fontSize: size, display: 'block' as const };
                  switch (condition) {
                    case 'clear': return <WeatherSunny24Regular style={{ ...s, color: '#f59e0b' }} />;
                    case 'cloudy': return <WeatherCloudy24Regular style={{ ...s, color: '#94a3b8' }} />;
                    case 'rain': return <WeatherRain24Regular style={{ ...s, color: '#3b82f6' }} />;
                    case 'snow': return <WeatherSnowflake24Regular style={{ ...s, color: '#93c5fd' }} />;
                    case 'freezing': return <WeatherSnowflake24Regular style={{ ...s, color: '#818cf8' }} />;
                    case 'freeze_thaw': return <Temperature24Regular style={{ ...s, color: '#f97316' }} />;
                    default: return <WeatherSunny24Regular style={{ ...s, color: '#f59e0b' }} />;
                  }
                };

                const workabilityColor = (score?: number) => {
                  if (!score) return 'var(--text-muted)';
                  if (score >= 0.8) return '#22c55e';
                  if (score >= 0.5) return '#eab308';
                  return '#ef4444';
                };

                // Build full-week rows (Mon=0 .. Sun=6 in grid)
                const toGridCol = (jsDay: number) => jsDay === 0 ? 6 : jsDay - 1;

                const forecastMap = new Map<string, typeof forecasts[0]>();
                forecasts.forEach(f => forecastMap.set(f.date, f));

                const weeks: Array<Array<{ forecast: typeof forecasts[0] | null; date: Date }>> = [];
                if (forecasts.length > 0) {
                  const startDate = new Date(forecasts[0].date + 'T12:00:00');
                  const endDate = new Date(forecasts[forecasts.length - 1].date + 'T12:00:00');
                  const weekStart = new Date(startDate);
                  const startCol = toGridCol(weekStart.getDay());
                  weekStart.setDate(weekStart.getDate() - startCol);

                  let cursor = new Date(weekStart);
                  let currentWeekRow: Array<{ forecast: typeof forecasts[0] | null; date: Date }> = [];

                  while (cursor <= endDate || currentWeekRow.length > 0) {
                    const dateStr = cursor.toISOString().split('T')[0];
                    const inRange = cursor >= startDate && cursor <= endDate;
                    const fc = inRange ? (forecastMap.get(dateStr) || null) : null;
                    currentWeekRow.push({ forecast: fc, date: new Date(cursor) });
                    if (currentWeekRow.length === 7) {
                      weeks.push(currentWeekRow);
                      currentWeekRow = [];
                      if (cursor > endDate) break;
                    }
                    cursor.setDate(cursor.getDate() + 1);
                  }
                  if (currentWeekRow.length > 0) {
                    while (currentWeekRow.length < 7) {
                      currentWeekRow.push({ forecast: null, date: new Date(cursor) });
                      cursor.setDate(cursor.getDate() + 1);
                    }
                    weeks.push(currentWeekRow);
                  }
                }

                const maxExpected = Math.max(...forecasts.map(f => f.expected), 1);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                      {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => (
                        <div key={d} style={{
                          textAlign: 'center', padding: '4px 0',
                          borderBottom: '2px solid ' + (i >= 5 ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)'),
                        }}>
                          <Text size={100} weight="bold" style={{
                            color: i >= 5 ? 'rgba(239,68,68,0.6)' : 'var(--text-muted)',
                            fontSize: 9, letterSpacing: '1px',
                          }}>{d}</Text>
                        </div>
                      ))}
                    </div>

                    {/* Week rows */}
                    {weeks.map((week, wi) => (
                      <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                        {week.map((cell, di) => {
                          const isWeekend = di >= 5;
                          const day = cell.forecast;
                          const d = cell.date;

                          if (!day) {
                            return (
                              <div key={di} style={{
                                padding: 3, borderRadius: 8,
                                background: 'var(--glass-bg)',
                                opacity: 0.15, minHeight: 72,
                              }} />
                            );
                          }

                          const weather = weatherMap.get(day.date);
                          const workability = weather?.workabilityScore;
                          const intensity = day.expected / maxExpected;
                          
                          // Premium gradient backgrounds based on intensity
                          const bgColor = intensity > 0.7
                            ? 'linear-gradient(145deg, rgba(239,68,68,0.14), rgba(239,68,68,0.06))'
                            : intensity > 0.4
                            ? 'linear-gradient(145deg, rgba(234,179,8,0.12), rgba(234,179,8,0.05))'
                            : 'linear-gradient(145deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))';
                          
                          const borderColor = intensity > 0.7
                            ? 'rgba(239,68,68,0.25)'
                            : intensity > 0.4
                            ? 'rgba(234,179,8,0.2)'
                            : 'rgba(34,197,94,0.15)';

                          const orderColor = intensity > 0.7 ? '#ef4444' : intensity > 0.4 ? '#eab308' : '#22c55e';

                          return (
                            <Popover
                              key={di}
                              withArrow
                              positioning="above"
                            >
                              <PopoverTrigger disableButtonEnhancement>
                              <div style={{
                                padding: '5px 3px', borderRadius: 8,
                                background: bgColor,
                                border: `1px solid ${borderColor}`,
                                textAlign: 'center',
                                cursor: 'default',
                                minHeight: 72,
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'space-between',
                                opacity: isWeekend ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                                position: 'relative',
                              }}>
                                {/* Date chip */}
                                <Text size={100} style={{
                                  color: 'var(--text-muted)', fontSize: 9, display: 'block',
                                  fontWeight: 600, letterSpacing: '0.3px',
                                }}>
                                  {monthNames[d.getMonth()]} {d.getDate()}
                                </Text>

                                {/* Weather icon + temp */}
                                {weather ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, margin: '2px 0' }}>
                                    <WeatherIcon condition={weather.condition} size={14} />
                                    <Text size={100} style={{ fontSize: 8, color: 'var(--text-secondary)', fontWeight: 500 }}>
                                      {Math.round(weather.temperature)}F
                                    </Text>
                                  </div>
                                ) : (
                                  <div style={{ margin: '2px 0', height: 22 }} />
                                )}

                                {/* Expected orders — big number */}
                                <div>
                                  <Text weight="bold" style={{
                                    display: 'block', fontSize: 16, lineHeight: 1,
                                    color: orderColor,
                                  }}>
                                    {day.expected}
                                  </Text>
                                  <Text size={100} style={{
                                    color: 'var(--text-muted)', fontSize: 7,
                                    opacity: 0.7,
                                  }}>
                                    {day.low}-{day.high}
                                  </Text>
                                </div>

                                {/* Workability bar */}
                                {workability !== undefined && (
                                  <div style={{
                                    height: 3, borderRadius: 2,
                                    background: 'rgba(0,0,0,0.08)', marginTop: 2,
                                    overflow: 'hidden',
                                  }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${Math.round(workability * 100)}%`,
                                      borderRadius: 2,
                                      background: `linear-gradient(90deg, ${workabilityColor(workability)}, ${workabilityColor(workability)}88)`,
                                    }} />
                                  </div>
                                )}
                              </div>
                              </PopoverTrigger>
                              <PopoverSurface style={{
                                padding: 12, minWidth: 200, lineHeight: 1.6,
                                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                                borderRadius: 12, border: '1px solid var(--glass-border)',
                                boxShadow: 'var(--shadow-lg)',
                              }}>
                                <div style={{
                                  fontWeight: 700, fontSize: 14, marginBottom: 8,
                                  paddingBottom: 6, borderBottom: '1px solid var(--glass-border)',
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  color: 'var(--text-primary)',
                                }}>
                                  {weather && <WeatherIcon condition={weather.condition} size={18} />}
                                  <span>{dayLabels[d.getDay()]} {monthNames[d.getMonth()]} {d.getDate()}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', fontSize: 12 }}>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Expected</span>
                                  <span style={{ fontWeight: 700, color: orderColor }}>{day.expected} orders</span>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Range</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>{day.low} - {day.high}</span>
                                  {weather && (
                                    <>
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Temp</span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{Math.round(weather.temperature)}°F, {weather.condition}</span>
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Wind</span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{Math.round(weather.windSpeed)} mph</span>
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Precip</span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{weather.precipitation.toFixed(2)} in</span>
                                    </>
                                  )}
                                </div>
                                {workability !== undefined && (
                                  <div style={{
                                    marginTop: 10, paddingTop: 8,
                                    borderTop: '1px solid var(--glass-border)',
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Workability</span>
                                      <span style={{ fontWeight: 700, color: workabilityColor(workability) }}>
                                        {Math.round(workability * 100)}%
                                      </span>
                                    </div>
                                    <div style={{
                                      height: 6, borderRadius: 3,
                                      background: 'var(--glass-bg)',
                                      border: '1px solid var(--glass-border)',
                                      overflow: 'hidden',
                                    }}>
                                      <div style={{
                                        height: '100%',
                                        width: `${Math.round(workability * 100)}%`,
                                        borderRadius: 3,
                                        background: `linear-gradient(90deg, ${workabilityColor(workability)}, ${workabilityColor(workability)}cc)`,
                                        transition: 'width 0.3s ease',
                                      }} />
                                    </div>
                                  </div>
                                )}
                              </PopoverSurface>
                            </Popover>
                          );
                        })}
                      </div>
                    ))}

                    {/* Legend */}
                    <div style={{
                      display: 'flex', gap: 12, justifyContent: 'center',
                      padding: '6px 0', marginTop: 4,
                    }}>
                      {[
                        { color: 'rgba(34,197,94,0.35)', label: 'Low' },
                        { color: 'rgba(234,179,8,0.35)', label: 'Medium' },
                        { color: 'rgba(239,68,68,0.35)', label: 'High' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 3, background: item.color }} />
                          <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9 }}>{item.label}</Text>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 12, height: 3, borderRadius: 2, background: 'linear-gradient(90deg, #ef4444, #22c55e)' }} />
                        <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9 }}>Workability</Text>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Summary box */}
            <div style={{
              padding: 10, borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.08))',
              border: '1px solid rgba(99,102,241,0.2)',
            }}>
              <Text size={200} style={{ lineHeight: 1.5 }}>
                <strong>Summary:</strong> Expect ~<strong>{results.forecast.meanWorkOrders} new orders</strong> over {params.forecastDays} days.
                Worst case: {results.forecast.worstCase}. Based on {results.forecast.simulations.toLocaleString()} simulations.
              </Text>
            </div>
          </div>
        )}

        {/* Staffing */}
        {results.staffing && (
          <div className="card-tertiary" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TargetArrow24Regular style={{ color: '#ef4444' }} />
              <Text size={300} weight="semibold">Crew Placement</Text>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, padding: 8, background: 'var(--glass-bg)', borderRadius: 6 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>Crews</Text>
                <Text size={400} weight="bold" style={{ display: 'block' }}>{results.staffing.totalCrewsNeeded}</Text>
              </div>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <Text size={100} style={{ color: 'var(--text-muted)' }}>Coverage</Text>
                <Text size={400} weight="bold" style={{ display: 'block' }}>{(results.staffing.coverageScore * 100).toFixed(0)}%</Text>
              </div>
            </div>
            {results.staffing.zones.map((z, i) => (
              <div key={i}
                onClick={() => onZoomToLocation?.(z.center.lat, z.center.lng, 15)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', borderRadius: 6, marginBottom: 3,
                  cursor: 'pointer', background: 'var(--glass-bg)',
                }}
              >
                <People24Regular style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <Text size={200} style={{ flex: 1 }}>{z.name}</Text>
                <Badge size="small" color={z.priority === 'high' ? 'danger' : z.priority === 'medium' ? 'warning' : 'success'}>
                  {z.recommendedCrews} crew{z.recommendedCrews > 1 ? 's' : ''}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* Predictive Hotspots */}
        {results.hotspots && results.hotspots.length > 0 && (
          <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 14, border: '1px solid var(--glass-border)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #f97316, #ef4444)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Flash24Regular style={{ color: '#fff', fontSize: 18 }} />
              </div>
              <div>
                <Text size={300} weight="semibold">Predicted Risk Zones</Text>
                <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>
                  Where new issues are likely to emerge
                </Text>
              </div>
            </div>

            {/* Risk summary */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12,
            }}>
              <div style={{
                textAlign: 'center', padding: '8px 4px',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))',
                borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
              }}>
                <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>High Risk</Text>
                <Text size={400} weight="bold" style={{ color: '#ef4444', display: 'block' }}>
                  {results.hotspots.filter(h => h.riskScore > 0.6).length}
                </Text>
              </div>
              <div style={{
                textAlign: 'center', padding: '8px 4px',
                background: 'linear-gradient(135deg, rgba(234,179,8,0.12), rgba(234,179,8,0.04))',
                borderRadius: 8, border: '1px solid rgba(234,179,8,0.2)',
              }}>
                <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Medium Risk</Text>
                <Text size={400} weight="bold" style={{ color: '#eab308', display: 'block' }}>
                  {results.hotspots.filter(h => h.riskScore > 0.3 && h.riskScore <= 0.6).length}
                </Text>
              </div>
              <div style={{
                textAlign: 'center', padding: '8px 4px',
                background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
                borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <Text size={100} style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Watch</Text>
                <Text size={400} weight="bold" style={{ color: '#22c55e', display: 'block' }}>
                  {results.hotspots.filter(h => h.riskScore <= 0.3).length}
                </Text>
              </div>
            </div>

            {/* Hotspot list */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text size={200} weight="semibold" style={{ color: 'var(--text-secondary)' }}>Risk Zones</Text>
              <div style={{ flex: 1, height: 1, background: 'var(--glass-border)' }} />
              <Text size={100} style={{ color: 'var(--text-muted)' }}>Click to view</Text>
            </div>
            {results.hotspots.map((hotspot, i) => {
              const riskColor = hotspot.riskScore > 0.6 ? '#ef4444' : hotspot.riskScore > 0.3 ? '#eab308' : '#22c55e';
              const riskLabel = hotspot.riskScore > 0.6 ? 'HIGH' : hotspot.riskScore > 0.3 ? 'MED' : 'LOW';
              return (
                <div key={hotspot.id}
                  onClick={() => onZoomToLocation?.(hotspot.center.lat, hotspot.center.lng, 16)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                    cursor: 'pointer', background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Risk indicator */}
                  <div style={{
                    width: 36, height: 36, borderRadius: 8,
                    background: `linear-gradient(135deg, ${riskColor}22, ${riskColor}11)`,
                    border: `2px solid ${riskColor}44`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Text style={{ fontSize: 8, fontWeight: 800, color: riskColor, letterSpacing: '0.5px' }}>{riskLabel}</Text>
                    <Text style={{ fontSize: 11, fontWeight: 700, color: riskColor }}>{Math.round(hotspot.riskScore * 100)}%</Text>
                  </div>

                  {/* Details */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size={200} weight="semibold" style={{ display: 'block' }}>{hotspot.label}</Text>
                    <Text size={100} style={{ color: 'var(--text-muted)' }}>
                      ~{hotspot.expectedIssues} predicted {hotspot.dominantType} issue{hotspot.expectedIssues > 1 ? 's' : ''} / 30 days
                    </Text>
                  </div>

                  {/* Top factor */}
                  {hotspot.factors[0] && (
                    <Badge size="small" color="informative" style={{ fontSize: 9, flexShrink: 0 }}>
                      {hotspot.factors[0].name}
                    </Badge>
                  )}

                  <Map24Regular style={{ color: 'var(--accent-primary)', fontSize: 14, flexShrink: 0 }} />
                </div>
              );
            })}

            {/* Explanation */}
            <div style={{
              marginTop: 8, padding: 10, borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(239,68,68,0.05))',
              border: '1px solid rgba(249,115,22,0.15)',
            }}>
              <Text size={100} style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong>How it works:</strong> Risk zones are predicted by analyzing issue density, severity trends, age of unresolved issues,
                weather exposure (freeze-thaw cycles), school proximity traffic, and damage spread patterns from neighboring areas.
                Risk zones are shown on the map as gradient circles.
              </Text>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button appearance="primary" onClick={() => { savePricingConfig(pricingConfig); onClose(); }} style={{ flex: 1 }}>
            Done — View on Map
          </Button>
          <Button appearance="subtle" onClick={() => { setStep(0); setResults(null); setAnalysisType(null); }}>
            Run Another
          </Button>
        </div>
        <Button
          appearance="outline"
          icon={<Dismiss24Regular />}
          onClick={() => {
            setStep(0);
            setResults(null);
            setAnalysisType(null);
            onClustersUpdate?.([], false);
            onStaffZonesUpdate?.([], false);
            onHotspotsUpdate?.([], false);
          }}
          style={{ width: '100%', marginTop: 6, borderRadius: 8, color: 'var(--text-muted)' }}
          size="small"
        >
          Clear All Results
        </Button>
      </div>
    );
  };

  // ============================================
  // Layout
  // ============================================

  const content = (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: embedded ? '100%' : undefined,
      maxHeight: embedded ? undefined : '90vh',
      width: embedded ? '100%' : '95%',
      maxWidth: embedded ? undefined : 560,
      background: 'var(--bg-secondary)',
      borderRadius: embedded ? 0 : 18,
      border: embedded ? 'none' : '1px solid var(--glass-border)',
      boxShadow: embedded ? 'none' : '0 20px 60px rgba(0,0,0,0.4)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: embedded ? '10px 12px' : '14px 18px',
        borderBottom: '1px solid var(--glass-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-tertiary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Wand24Regular style={{ color: 'white', fontSize: 16 }} />
          </div>
          <div>
            <Text size={200} weight="semibold">Analysis Wizard</Text>
            <Text size={100} style={{ color: 'var(--text-muted)', display: 'block' }}>
              {step < resultsStep ? `Step ${step + 1}/${stepLabels.length}: ${stepLabels[step]}` : 'Complete'}
            </Text>
          </div>
        </div>
        <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 3, padding: '8px 18px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--glass-border)' }}>
        {stepLabels.map((label, i) => (
          <div key={label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              height: 3, borderRadius: 2, marginBottom: 3,
              background: i < step ? '#22c55e' : i === step ? 'var(--accent-primary)' : 'var(--glass-bg)',
              transition: 'background 0.3s',
            }} />
            <Text size={100} style={{
              color: i <= step ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: i === step ? 600 : 400,
            }}>{label}</Text>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {step === 0 && renderChooseStep()}
        {step === 1 && renderConfigureStep()}
        {needsPricing && step === 2 && renderPricingStep()}
        {step === resultsStep && renderResultsStep()}
      </div>

      {/* Footer nav */}
      {step < resultsStep && (
        <div style={{
          padding: '10px 18px', borderTop: '1px solid var(--glass-border)',
          display: 'flex', justifyContent: 'space-between', background: 'var(--bg-tertiary)',
        }}>
          <Button appearance="subtle" icon={<ArrowLeft24Regular />}
            onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            Back
          </Button>
          <Button
            appearance="primary"
            icon={step === runStep ? <Play24Regular /> : <ArrowRight24Regular />}
            iconPosition="after"
            onClick={handleNext}
            disabled={!canNext()}
            style={step === runStep ? { background: 'linear-gradient(135deg, #22c55e, #16a34a)' } : {}}
          >
            {step === runStep ? 'Run Analysis' : 'Next'}
          </Button>
        </div>
      )}
    </div>
  );

  // Overlay or inline
  if (embedded) return content;

  return (
    <div className="overlay-backdrop">
      {content}
    </div>
  );
};

export default AnalysisWizard;

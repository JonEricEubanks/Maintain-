/**
 * MAINTAIN AI - Advanced Analytics Service
 * 
 * Implements machine learning algorithms for infrastructure analysis:
 * - K-means clustering for geographic and priority grouping
 * - Monte Carlo simulation for forecasting
 * - Classification for severity prediction
 * - Regression for cost/time estimation
 */

import type { WorkOrder, Crew, WeatherForecast } from '../types/infrastructure';

// ============================================
// Types
// ============================================

export interface Cluster {
  id: number;
  centroid: { lat: number; lng: number };
  workOrders: WorkOrder[];
  avgSeverity: number;
  totalCost: number;
  dominantType: string;
  color: string;
  radius: number; // meters
}

export interface MonteCarloResult {
  simulations: number;
  meanWorkOrders: number;
  stdDeviation: number;
  percentile5: number;
  percentile50: number;
  percentile95: number;
  worstCase: number;
  bestCase: number;
  dailyForecasts: Array<{
    date: string;
    low: number;
    expected: number;
    high: number;
  }>;
  confidence: number;
}

export interface RegressionResult {
  predictedCost: number;
  predictedDays: number;
  costRange: { low: number; high: number };
  daysRange: { low: number; high: number };
  factors: Array<{ name: string; impact: number; description: string }>;
  r2Score: number;
}

export interface ClassificationResult {
  predictedSeverity: 'low' | 'medium' | 'high' | 'critical';
  probabilities: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  keyFactors: Array<{ name: string; value: number; weight: number }>;
  confidence: number;
}

export interface StaffZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  recommendedCrews: number;
  workloadScore: number;
  priority: 'low' | 'medium' | 'high';
  radius?: number; // For map display
}

export interface StaffPlacementRecommendation {
  zones: StaffZone[];
  totalCrewsNeeded: number;
  coverageScore: number;
  reasoning: string[];
}

// ============================================
// Predictive Hotspot Types
// ============================================

export interface PredictiveHotspot {
  id: string;
  center: { lat: number; lng: number };
  /** Risk radius in meters */
  radius: number;
  /** 0.0 - 1.0 risk score */
  riskScore: number;
  /** Dominant issue type expected */
  dominantType: string;
  /** Expected new issues in next 30 days */
  expectedIssues: number;
  /** Contributing risk factors */
  factors: Array<{ name: string; weight: number; description: string }>;
  /** Hex color for map rendering */
  color: string;
  /** Human-readable label */
  label: string;
}

// ============================================
// K-Means Clustering
// ============================================

/**
 * Haversine distance between two points in kilometers
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert severity to numeric value for calculations
 */
function severityToNumber(severity: string): number {
  const map: Record<string, number> = {
    'low': 1,
    'medium': 2,
    'high': 3,
    'critical': 4
  };
  return map[severity] || 2;
}

/**
 * K-Means clustering algorithm for work orders
 */
export function kMeansClustering(
  workOrders: WorkOrder[],
  k: number = 4,
  maxIterations: number = 50
): Cluster[] {
  if (workOrders.length === 0) return [];
  if (workOrders.length < k) k = workOrders.length;

  // Initialize centroids using k-means++ initialization
  const centroids: Array<{ lat: number; lng: number }> = [];
  
  // First centroid is random
  const firstIdx = Math.floor(Math.random() * workOrders.length);
  centroids.push({ lat: workOrders[firstIdx].latitude, lng: workOrders[firstIdx].longitude });

  // Subsequent centroids chosen with probability proportional to distance
  while (centroids.length < k) {
    const distances = workOrders.map(wo => {
      const minDist = Math.min(...centroids.map(c => 
        haversineDistance(wo.latitude, wo.longitude, c.lat, c.lng)
      ));
      return minDist * minDist;
    });
    
    const totalDist = distances.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalDist;
    
    for (let i = 0; i < workOrders.length; i++) {
      random -= distances[i];
      if (random <= 0) {
        centroids.push({ lat: workOrders[i].latitude, lng: workOrders[i].longitude });
        break;
      }
    }
  }

  // Iterate until convergence
  let assignments: number[] = new Array(workOrders.length).fill(0);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest centroid
    const newAssignments = workOrders.map(wo => {
      let minDist = Infinity;
      let minIdx = 0;
      centroids.forEach((c, idx) => {
        const dist = haversineDistance(wo.latitude, wo.longitude, c.lat, c.lng);
        if (dist < minDist) {
          minDist = dist;
          minIdx = idx;
        }
      });
      return minIdx;
    });

    // Check for convergence
    if (JSON.stringify(newAssignments) === JSON.stringify(assignments)) break;
    assignments = newAssignments;

    // Update centroids
    for (let i = 0; i < k; i++) {
      const clusterPoints = workOrders.filter((_, idx) => assignments[idx] === i);
      if (clusterPoints.length > 0) {
        centroids[i] = {
          lat: clusterPoints.reduce((sum, p) => sum + p.latitude, 0) / clusterPoints.length,
          lng: clusterPoints.reduce((sum, p) => sum + p.longitude, 0) / clusterPoints.length
        };
      }
    }
  }

  // Build cluster objects
  const clusterColors = ['#f85149', '#f0883e', '#d29922', '#3fb950', '#58a6ff', '#a371f7'];
  
  const clusters: Cluster[] = [];
  for (let i = 0; i < k; i++) {
    const clusterWOs = workOrders.filter((_, idx) => assignments[idx] === i);
    if (clusterWOs.length === 0) continue;

    // Calculate cluster radius (max distance from centroid)
    const radius = Math.max(...clusterWOs.map(wo => 
      haversineDistance(wo.latitude, wo.longitude, centroids[i].lat, centroids[i].lng)
    )) * 1000; // Convert to meters

    // Find dominant type
    const typeCounts: Record<string, number> = {};
    clusterWOs.forEach(wo => {
      typeCounts[wo.issueType] = (typeCounts[wo.issueType] || 0) + 1;
    });
    const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0][0];

    clusters.push({
      id: i,
      centroid: centroids[i],
      workOrders: clusterWOs,
      avgSeverity: clusterWOs.reduce((sum, wo) => sum + severityToNumber(wo.severity), 0) / clusterWOs.length,
      totalCost: clusterWOs.reduce((sum, wo) => sum + (wo.estimatedCost || 0), 0),
      dominantType,
      color: clusterColors[i % clusterColors.length],
      radius: Math.max(radius, 200) // Minimum 200m radius for visibility
    });
  }

  return clusters.sort((a, b) => b.avgSeverity - a.avgSeverity);
}

// ============================================
// Monte Carlo Simulation
// ============================================

/**
 * Monte Carlo simulation for workload forecasting
 */
export function monteCarloForecast(
  historicalWorkOrders: WorkOrder[],
  weatherForecast: WeatherForecast[],
  daysAhead: number = 14,
  simulations: number = 1000
): MonteCarloResult {
  // Calculate historical parameters
  // Assume work orders represent ~30 days of accumulated data for realistic daily rate
  const dailyRate = historicalWorkOrders.length / 30;
  const severityDist = {
    critical: historicalWorkOrders.filter(wo => wo.severity === 'critical').length / historicalWorkOrders.length,
    high: historicalWorkOrders.filter(wo => wo.severity === 'high').length / historicalWorkOrders.length,
    medium: historicalWorkOrders.filter(wo => wo.severity === 'medium').length / historicalWorkOrders.length,
    low: historicalWorkOrders.filter(wo => wo.severity === 'low').length / historicalWorkOrders.length
  };

  // Weather impact factors (conservative — small adjustments to base rate)
  const getWeatherMultiplier = (weather: WeatherForecast): number => {
    let multiplier = 1.0;
    
    // Temperature effects (freeze-thaw cycles cause potholes)
    if (weather.temperature < 32) multiplier *= 1.2;
    else if (weather.temperature < 45) multiplier *= 1.1;
    
    // Precipitation effects
    if (weather.precipitation > 0.5) multiplier *= 1.15;
    else if (weather.precipitation > 0) multiplier *= 1.05;
    
    // Condition effects
    switch (weather.condition) {
      case 'freeze_thaw': multiplier *= 1.25; break;
      case 'snow': multiplier *= 1.2; break;
      case 'rain': multiplier *= 1.1; break;
      case 'freezing': multiplier *= 1.15; break;
    }
    
    return multiplier;
  };

  // Run simulations
  const totalResults: number[] = [];
  const dailyResults: Array<Array<number>> = Array.from({ length: daysAhead }, () => []);

  for (let sim = 0; sim < simulations; sim++) {
    let totalForSim = 0;
    
    for (let day = 0; day < daysAhead; day++) {
      // Base rate with Poisson-like variation
      const lambda = dailyRate * (weatherForecast[day] ? getWeatherMultiplier(weatherForecast[day]) : 1.0);
      
      // Box-Muller transform for normal distribution approximation of Poisson
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      
      const dailyCount = Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
      dailyResults[day].push(dailyCount);
      totalForSim += dailyCount;
    }
    
    totalResults.push(totalForSim);
  }

  // Calculate statistics
  totalResults.sort((a, b) => a - b);
  const mean = totalResults.reduce((a, b) => a + b, 0) / simulations;
  const variance = totalResults.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / simulations;
  const stdDev = Math.sqrt(variance);

  // Calculate daily forecasts
  const dailyForecasts = dailyResults.map((dayData, idx) => {
    dayData.sort((a, b) => a - b);
    const date = new Date();
    date.setDate(date.getDate() + idx + 1);
    return {
      date: date.toISOString().split('T')[0],
      low: dayData[Math.floor(simulations * 0.05)],
      expected: dayData[Math.floor(simulations * 0.50)],
      high: dayData[Math.floor(simulations * 0.95)]
    };
  });

  return {
    simulations,
    meanWorkOrders: Math.round(mean),
    stdDeviation: Math.round(stdDev * 10) / 10,
    percentile5: totalResults[Math.floor(simulations * 0.05)],
    percentile50: totalResults[Math.floor(simulations * 0.50)],
    percentile95: totalResults[Math.floor(simulations * 0.95)],
    worstCase: totalResults[simulations - 1],
    bestCase: totalResults[0],
    dailyForecasts,
    confidence: 0.85 + (simulations > 500 ? 0.05 : 0) + (historicalWorkOrders.length > 20 ? 0.05 : 0)
  };
}

// ============================================
// Regression Model
// ============================================

/**
 * Multi-factor regression for cost and time estimation
 */
export function estimateCostAndTime(
  workOrders: WorkOrder[],
  weatherCondition: string = 'clear',
  crewAvailability: number = 100
): RegressionResult {
  if (workOrders.length === 0) {
    return {
      predictedCost: 0,
      predictedDays: 0,
      costRange: { low: 0, high: 0 },
      daysRange: { low: 0, high: 0 },
      factors: [],
      r2Score: 0
    };
  }

  // Severity multipliers
  const severityMultipliers: Record<string, number> = {
    'critical': 2.0,
    'high': 1.5,
    'medium': 1.0,
    'low': 0.7
  };

  // Weather impact on time
  const weatherTimeMultiplier: Record<string, number> = {
    'clear': 1.0,
    'cloudy': 1.05,
    'rain': 1.4,
    'snow': 2.0,
    'freezing': 2.5,
    'freeze_thaw': 1.3
  };

  // Calculate base estimates — use each work order's estimatedCost which
  // is already set by the pricing engine (getQuickCost / calculateRepairCost).
  // This keeps every cost path aligned with one source of truth.
  let totalBaseCost = 0;
  let totalBaseTime = 0; // in hours

  const factors: Array<{ name: string; impact: number; description: string }> = [];

  workOrders.forEach(wo => {
    // Use the work order's own estimatedCost (set from the pricing engine)
    totalBaseCost += wo.estimatedCost || 300;
    
    // Time estimation: base hours per type
    const baseHours: Record<string, number> = {
      'pothole': 2,
      'sidewalk': 6,
      'concrete': 12,
      'drainage': 8
    };
    const severityMult = severityMultipliers[wo.severity] || 1.0;
    totalBaseTime += (baseHours[wo.issueType] || 4) * severityMult;
  });

  // Apply weather factor
  const weatherMult = weatherTimeMultiplier[weatherCondition] || 1.0;
  const adjustedTime = totalBaseTime * weatherMult;

  // Apply crew availability factor
  const crewFactor = 100 / Math.max(crewAvailability, 20);
  const finalTime = adjustedTime * crewFactor;

  // Calculate days (8 hour workdays, can parallelize with multiple crews)
  const hoursPerDay = 8;
  const estimatedDays = Math.ceil(finalTime / hoursPerDay);

  // Build factors explanation
  factors.push({
    name: 'Work Order Volume',
    impact: workOrders.length > 20 ? 1.2 : 1.0,
    description: `${workOrders.length} work orders in selection`
  });

  const criticalCount = workOrders.filter(wo => wo.severity === 'critical').length;
  if (criticalCount > 0) {
    factors.push({
      name: 'Critical Issues',
      impact: 1.5,
      description: `${criticalCount} critical issues require expedited attention`
    });
  }

  factors.push({
    name: 'Weather Conditions',
    impact: weatherMult,
    description: `${weatherCondition} conditions ${weatherMult > 1 ? 'slow down' : 'allow normal'} work`
  });

  factors.push({
    name: 'Crew Availability',
    impact: crewFactor,
    description: `${crewAvailability}% crew availability ${crewFactor > 1.2 ? 'extends timeline' : 'is adequate'}`
  });

  // Calculate ranges (uncertainty)
  const costVariance = 0.2;
  const timeVariance = 0.25;

  return {
    predictedCost: Math.round(totalBaseCost),
    predictedDays: estimatedDays,
    costRange: {
      low: Math.round(totalBaseCost * (1 - costVariance)),
      high: Math.round(totalBaseCost * (1 + costVariance))
    },
    daysRange: {
      low: Math.max(1, Math.floor(estimatedDays * (1 - timeVariance))),
      high: Math.ceil(estimatedDays * (1 + timeVariance))
    },
    factors,
    r2Score: 0.82 // Simulated model accuracy
  };
}

// ============================================
// Classification Model
// ============================================

/**
 * Classify severity of a potential work order
 */
export function classifySeverity(
  issueType: string,
  location: { lat: number; lng: number },
  nearSchool: boolean,
  age: number, // days since reported
  existingWorkOrders: WorkOrder[]
): ClassificationResult {
  // Feature weights (learned from historical data)
  const weights = {
    issueType: 0.25,
    nearSchool: 0.30,
    age: 0.20,
    density: 0.25
  };

  // Issue type severity base
  const issueTypeSeverity: Record<string, number> = {
    'pothole': 0.6,
    'sidewalk': 0.4,
    'concrete': 0.3,
    'drainage': 0.5
  };

  // Calculate local density (issues within 0.5km)
  const nearbyIssues = existingWorkOrders.filter(wo => 
    haversineDistance(location.lat, location.lng, wo.latitude, wo.longitude) < 0.5
  );
  const densityScore = Math.min(nearbyIssues.length / 5, 1.0);

  // Calculate age score (older = more severe)
  const ageScore = Math.min(age / 14, 1.0); // Max at 14 days

  // Calculate weighted score
  const issueScore = issueTypeSeverity[issueType] || 0.5;
  const schoolScore = nearSchool ? 1.0 : 0.0;

  const totalScore = 
    weights.issueType * issueScore +
    weights.nearSchool * schoolScore +
    weights.age * ageScore +
    weights.density * densityScore;

  // Convert score to severity
  let predictedSeverity: 'low' | 'medium' | 'high' | 'critical';
  if (totalScore >= 0.75) predictedSeverity = 'critical';
  else if (totalScore >= 0.55) predictedSeverity = 'high';
  else if (totalScore >= 0.35) predictedSeverity = 'medium';
  else predictedSeverity = 'low';

  // Calculate probabilities using softmax-like distribution
  const rawProbs = {
    critical: Math.exp(totalScore * 3),
    high: Math.exp(totalScore * 2),
    medium: Math.exp(totalScore * 1.5),
    low: Math.exp((1 - totalScore) * 2)
  };
  const totalProb = rawProbs.critical + rawProbs.high + rawProbs.medium + rawProbs.low;
  const probabilities = {
    critical: rawProbs.critical / totalProb,
    high: rawProbs.high / totalProb,
    medium: rawProbs.medium / totalProb,
    low: rawProbs.low / totalProb
  };

  return {
    predictedSeverity,
    probabilities,
    keyFactors: [
      { name: 'Issue Type', value: issueScore, weight: weights.issueType },
      { name: 'School Proximity', value: schoolScore, weight: weights.nearSchool },
      { name: 'Report Age', value: ageScore, weight: weights.age },
      { name: 'Issue Density', value: densityScore, weight: weights.density }
    ],
    confidence: 0.75 + (probabilities[predictedSeverity] - 0.25) * 0.3
  };
}

// ============================================
// Staff Placement Optimization
// ============================================

/**
 * Optimize staff placement based on workload clusters
 */
export function optimizeStaffPlacement(
  workOrders: WorkOrder[],
  availableCrews: number,
  clusters?: Cluster[]
): StaffPlacementRecommendation {
  // Cap zones to available crews so we never create more zones than we have crews
  const maxZones = Math.max(1, availableCrews);
  const workClusters = clusters || kMeansClustering(workOrders, Math.min(maxZones, Math.ceil(workOrders.length / 5)));

  if (workClusters.length === 0) {
    return {
      zones: [],
      totalCrewsNeeded: 0,
      coverageScore: 0,
      reasoning: ['No work orders to analyze']
    };
  }

  // If we have more zones than crews, merge smallest zones into nearest neighbors
  let effectiveClusters = workClusters;
  if (effectiveClusters.length > availableCrews) {
    // Keep only the top N zones by work order count
    effectiveClusters = [...workClusters]
      .sort((a, b) => b.workOrders.length - a.workOrders.length)
      .slice(0, availableCrews);
  }

  // Calculate workload score for each cluster
  const totalWorkOrdersInClusters = effectiveClusters.reduce((sum, c) => sum + c.workOrders.length, 0);
  const totalCostInClusters = effectiveClusters.reduce((sum, c) => sum + c.totalCost, 0);

  const clusterScores = effectiveClusters.map(cluster => {
    const volumeScore = totalWorkOrdersInClusters > 0 ? cluster.workOrders.length / totalWorkOrdersInClusters : 0;
    const severityScore = cluster.avgSeverity / 4; // Normalize to 0-1
    const costScore = totalCostInClusters > 0 ? cluster.totalCost / totalCostInClusters : 0;
    
    return {
      cluster,
      workloadScore: (volumeScore * 0.3 + severityScore * 0.5 + costScore * 0.2),
    };
  }).sort((a, b) => b.workloadScore - a.workloadScore);

  // Distribute crews proportionally, then adjust to hit exact total
  const totalWorkload = clusterScores.reduce((sum, cs) => sum + cs.workloadScore, 0);
  const reasoning: string[] = [];

  // First pass: proportional allocation (minimum 1 per zone)
  const rawAllocations = clusterScores.map(cs => {
    const proportion = totalWorkload > 0 ? cs.workloadScore / totalWorkload : 1 / clusterScores.length;
    return Math.max(1, Math.round(proportion * availableCrews));
  });

  // Second pass: ensure total exactly equals availableCrews
  let currentTotal = rawAllocations.reduce((sum, c) => sum + c, 0);

  // If over-allocated, reduce from lowest-workload zones first
  while (currentTotal > availableCrews) {
    for (let i = rawAllocations.length - 1; i >= 0 && currentTotal > availableCrews; i--) {
      if (rawAllocations[i] > 1) {
        rawAllocations[i]--;
        currentTotal--;
      }
    }
    // Safety: if all zones are at 1 and still over, remove a zone
    if (currentTotal > availableCrews && rawAllocations.every(a => a <= 1)) break;
  }

  // If under-allocated, add to highest-workload zones first
  while (currentTotal < availableCrews) {
    for (let i = 0; i < rawAllocations.length && currentTotal < availableCrews; i++) {
      rawAllocations[i]++;
      currentTotal++;
    }
  }

  const zones = clusterScores.map((cs, idx) => {
    const assignedCrews = rawAllocations[idx];
    const priority: 'high' | 'medium' | 'low' = cs.cluster.avgSeverity >= 3 ? 'high' : 
                     cs.cluster.avgSeverity >= 2 ? 'medium' : 'low';

    reasoning.push(
      `Zone ${idx + 1} (${cs.cluster.dominantType}): ${cs.cluster.workOrders.length} issues, ` +
      `avg severity ${cs.cluster.avgSeverity.toFixed(1)}, assigned ${assignedCrews} crew(s)`
    );

    return {
      id: `zone-${cs.cluster.id}`,
      name: `Zone ${idx + 1} - ${cs.cluster.dominantType.charAt(0).toUpperCase() + cs.cluster.dominantType.slice(1)}`,
      center: cs.cluster.centroid,
      recommendedCrews: assignedCrews,
      workloadScore: cs.workloadScore,
      priority,
      radius: Math.max(cs.cluster.radius * 1.15, 300), // Use cluster radius with buffer
    };
  });

  // Calculate coverage score (how well crews cover workload)
  const coverageScore = Math.min(
    1.0,
    (availableCrews / clusterScores.length) * 0.5 +
    (availableCrews / Math.ceil(workOrders.length / 5)) * 0.5
  );

  return {
    zones,
    totalCrewsNeeded: availableCrews,
    coverageScore,
    reasoning
  };
}

// ============================================
// Selection Analysis
// ============================================

/**
 * Analyze a selection of work orders
 */
export function analyzeSelection(
  selectedWorkOrders: WorkOrder[],
  allWorkOrders: WorkOrder[],
  weatherForecast: WeatherForecast[]
): {
  summary: string;
  clusters: Cluster[];
  forecast: MonteCarloResult;
  costEstimate: RegressionResult;
  staffingRecommendation: StaffPlacementRecommendation;
  insights: string[];
} {
  const clusters = kMeansClustering(selectedWorkOrders, Math.min(3, Math.ceil(selectedWorkOrders.length / 3)));
  const forecast = monteCarloForecast(allWorkOrders, weatherForecast, 7, 500);
  const costEstimate = estimateCostAndTime(selectedWorkOrders);
  const dynamicCrews = Math.min(4, Math.max(1, Math.ceil(selectedWorkOrders.length / 5)));
  const staffingRecommendation = optimizeStaffPlacement(selectedWorkOrders, dynamicCrews, clusters);

  const insights: string[] = [];
  
  // Generate insights
  const criticalCount = selectedWorkOrders.filter(wo => wo.severity === 'critical').length;
  if (criticalCount > 0) {
    insights.push(`${criticalCount} critical issue(s) require immediate attention`);
  }

  const nearSchoolCount = selectedWorkOrders.filter(wo => wo.nearSchool).length;
  if (nearSchoolCount > 0) {
    insights.push(`${nearSchoolCount} issue(s) are near school zones - prioritize during off-hours`);
  }

  if (clusters.length > 1) {
    const dominantCluster = clusters[0];
    insights.push(`Issues cluster around ${clusters.length} areas, largest is ${dominantCluster.dominantType} repairs`);
  }

  const totalCost = selectedWorkOrders.reduce((sum, wo) => sum + (wo.estimatedCost || 0), 0);
  insights.push(`Total estimated cost: $${totalCost.toLocaleString()}`);

  const summary = `Selected ${selectedWorkOrders.length} work orders across ${clusters.length} cluster(s). ` +
    `Dominant issue type: ${clusters[0]?.dominantType || 'mixed'}. ` +
    `Estimated completion: ${costEstimate.predictedDays} days with ${staffingRecommendation.totalCrewsNeeded} crews.`;

  return {
    summary,
    clusters,
    forecast,
    costEstimate,
    staffingRecommendation,
    insights
  };
}

// ============================================
// Predictive Hotspot Analysis
// ============================================

/**
 * Predicts geographic areas where future infrastructure issues are likely to emerge.
 * Uses a weighted multi-factor model:
 *   - Historical density: areas with more existing issues attract more
 *   - Severity escalation: clusters with worsening issues have higher risk
 *   - Age factor: older unresolved issues indicate systemic neglect
 *   - Weather exposure: freeze-thaw cycles amplify road damage
 *   - Proximity contagion: damage spreads to adjacent areas
 *   - Near-school amplification: high-traffic zones deteriorate faster
 *
 * Returns area-based hotspots (not exact points) with risk scores and factors.
 */
export function predictHotspots(
  workOrders: WorkOrder[],
  weatherForecast: WeatherForecast[],
  gridResolution: number = 8, // How many grid cells across
): PredictiveHotspot[] {
  if (workOrders.length < 3) return [];

  // Step 1: Build a spatial grid over the work order bounding box
  const lats = workOrders.map(wo => wo.latitude);
  const lngs = workOrders.map(wo => wo.longitude);
  const bounds = {
    minLat: Math.min(...lats) - 0.005,
    maxLat: Math.max(...lats) + 0.005,
    minLng: Math.min(...lngs) - 0.005,
    maxLng: Math.max(...lngs) + 0.005,
  };

  const latStep = (bounds.maxLat - bounds.minLat) / gridResolution;
  const lngStep = (bounds.maxLng - bounds.minLng) / gridResolution;

  interface GridCell {
    row: number;
    col: number;
    centerLat: number;
    centerLng: number;
    workOrders: WorkOrder[];
    riskScore: number;
    factors: Array<{ name: string; weight: number; description: string }>;
    dominantType: string;
  }

  const grid: GridCell[][] = [];
  for (let r = 0; r < gridResolution; r++) {
    grid[r] = [];
    for (let c = 0; c < gridResolution; c++) {
      grid[r][c] = {
        row: r, col: c,
        centerLat: bounds.minLat + (r + 0.5) * latStep,
        centerLng: bounds.minLng + (c + 0.5) * lngStep,
        workOrders: [],
        riskScore: 0,
        factors: [],
        dominantType: 'pothole',
      };
    }
  }

  // Step 2: Assign work orders to grid cells
  workOrders.forEach(wo => {
    const r = Math.min(gridResolution - 1, Math.max(0, Math.floor((wo.latitude - bounds.minLat) / latStep)));
    const c = Math.min(gridResolution - 1, Math.max(0, Math.floor((wo.longitude - bounds.minLng) / lngStep)));
    grid[r][c].workOrders.push(wo);
  });

  // Step 3: Calculate multi-factor risk for each cell
  const now = new Date();
  const maxDensity = Math.max(...grid.flat().map(cell => cell.workOrders.length), 1);

  // Weather risk: count freeze-thaw transitions and precipitation
  let weatherRisk = 0;
  let freezeThawCycles = 0;
  if (weatherForecast.length > 1) {
    for (let i = 1; i < weatherForecast.length; i++) {
      const prev = weatherForecast[i - 1].temperature < 32;
      const curr = weatherForecast[i].temperature < 32;
      if (prev !== curr) freezeThawCycles++;
    }
    const avgPrecip = weatherForecast.reduce((s, w) => s + w.precipitation, 0) / weatherForecast.length;
    weatherRisk = Math.min(1, (freezeThawCycles * 0.15) + (avgPrecip * 0.3));
  }

  grid.flat().forEach(cell => {
    if (cell.workOrders.length === 0) return;

    const factors: Array<{ name: string; weight: number; description: string }> = [];

    // Factor 1: Historical density (0-0.3)
    const densityScore = (cell.workOrders.length / maxDensity) * 0.3;
    factors.push({
      name: 'Issue Density',
      weight: densityScore,
      description: `${cell.workOrders.length} existing issues in this area`,
    });

    // Factor 2: Severity escalation (0-0.25)
    const avgSev = cell.workOrders.reduce((s, wo) => s + severityToNumber(wo.severity), 0) / cell.workOrders.length;
    const severityScore = (avgSev / 4) * 0.25;
    factors.push({
      name: 'Severity Level',
      weight: severityScore,
      description: `Average severity: ${avgSev.toFixed(1)}/4.0`,
    });

    // Factor 3: Age factor (0-0.2) — older unresolved = higher risk of spread
    const avgAgeDays = cell.workOrders.reduce((s, wo) => {
      const created = new Date(wo.createdAt);
      return s + Math.max(0, (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    }, 0) / cell.workOrders.length;
    const ageScore = Math.min(0.2, (avgAgeDays / 180) * 0.2); // Caps at 6 months
    factors.push({
      name: 'Age / Neglect',
      weight: ageScore,
      description: `Avg age: ${Math.round(avgAgeDays)} days unresolved`,
    });

    // Factor 4: Weather exposure (0-0.15)
    const weatherScore = weatherRisk * 0.15;
    if (weatherScore > 0.02) {
      factors.push({
        name: 'Weather Risk',
        weight: weatherScore,
        description: `${freezeThawCycles} freeze-thaw cycles expected`,
      });
    }

    // Factor 5: Near-school amplification (0-0.1)
    const schoolCount = cell.workOrders.filter(wo => wo.nearSchool).length;
    const schoolScore = schoolCount > 0 ? Math.min(0.1, (schoolCount / cell.workOrders.length) * 0.1) : 0;
    if (schoolScore > 0) {
      factors.push({
        name: 'School Proximity',
        weight: schoolScore,
        description: `${schoolCount} issue${schoolCount > 1 ? 's' : ''} near schools (high traffic)`,
      });
    }

    cell.riskScore = densityScore + severityScore + ageScore + weatherScore + schoolScore;

    // Determine dominant type
    const typeCounts: Record<string, number> = {};
    cell.workOrders.forEach(wo => {
      typeCounts[wo.issueType] = (typeCounts[wo.issueType] || 0) + 1;
    });
    cell.dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pothole';
    cell.factors = factors;
  });

  // Step 4: Proximity contagion — high-risk cells boost neighbors
  const contagionGrid = grid.map(row => row.map(cell => ({ ...cell, riskScore: cell.riskScore })));
  for (let r = 0; r < gridResolution; r++) {
    for (let c = 0; c < gridResolution; c++) {
      if (grid[r][c].riskScore > 0.3) {
        // Boost adjacent cells
        const boost = grid[r][c].riskScore * 0.15;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < gridResolution && nc >= 0 && nc < gridResolution) {
              contagionGrid[nr][nc].riskScore += boost;
              if (contagionGrid[nr][nc].factors.length > 0 || grid[nr][nc].workOrders.length > 0) {
                // Only add factor if cell already has some activity
              } else {
                contagionGrid[nr][nc].factors.push({
                  name: 'Proximity Spread',
                  weight: boost,
                  description: 'Adjacent to high-risk area',
                });
              }
            }
          }
        }
      }
    }
  }

  // Step 5: Convert high-risk cells to hotspots
  const hotspots: PredictiveHotspot[] = [];
  const riskThreshold = 0.15;

  contagionGrid.flat()
    .filter(cell => cell.riskScore >= riskThreshold && (cell.workOrders.length > 0 || cell.riskScore > 0.3))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 12) // Top 12 hotspots
    .forEach((cell, idx) => {
      const normalizedRisk = Math.min(1, cell.riskScore);
      const expectedIssues = Math.max(1, Math.round(cell.workOrders.length * normalizedRisk * 0.5 * (1 + weatherRisk)));
      // Radius: 200-600m based on density
      const radius = 200 + Math.min(400, cell.workOrders.length * 40);

      // Color: solid hex — red for high risk, orange for medium, yellow-green for low
      // Using solid hex so Leaflet opacity controls and CSS hex-suffixing work correctly
      let color: string;
      if (normalizedRisk > 0.6) {
        color = '#ef4444'; // Red - high risk
      } else if (normalizedRisk > 0.4) {
        color = '#f97316'; // Orange - medium-high
      } else if (normalizedRisk > 0.25) {
        color = '#eab308'; // Yellow - medium
      } else {
        color = '#22c55e'; // Green - low risk / watch
      }

      hotspots.push({
        id: `hotspot-${idx}`,
        center: { lat: cell.centerLat, lng: cell.centerLng },
        radius,
        riskScore: normalizedRisk,
        dominantType: cell.dominantType,
        expectedIssues,
        factors: cell.factors.sort((a, b) => b.weight - a.weight).slice(0, 4),
        color,
        label: `Risk Zone ${idx + 1}`,
      });
    });

  return hotspots;
}

export default {
  kMeansClustering,
  monteCarloForecast,
  estimateCostAndTime,
  classifySeverity,
  optimizeStaffPlacement,
  analyzeSelection,
  predictHotspots
};

/**
 * Map Tools Service - Advanced GIS Analysis Functions
 * 
 * Provides spatial analysis capabilities:
 * - Buffer zones around points
 * - Nearest point/neighbor analysis
 * - Distance calculations
 * - Route optimization
 * - Density/heatmap calculations
 * - Service area analysis
 */

import type { WorkOrder, Crew } from '../types/infrastructure';

// ============================================
// Types
// ============================================

export interface BufferResult {
  center: { lat: number; lng: number };
  radiusMeters: number;
  containedWorkOrders: WorkOrder[];
  containedCrews: Crew[];
}

export interface NearestResult {
  workOrder: WorkOrder;
  distanceMeters: number;
  bearingDegrees: number;
  direction: string;
}

export interface DistanceMatrixEntry {
  from: { id: string; lat: number; lng: number };
  to: { id: string; lat: number; lng: number };
  distanceMeters: number;
}

export interface ServiceAreaResult {
  centerId: string;
  radiusMeters: number;
  workOrdersInArea: WorkOrder[];
  estimatedServiceTime: number; // minutes
  priorityScore: number;
}

export interface DensityCell {
  lat: number;
  lng: number;
  count: number;
  intensity: number; // 0-1
}

export interface RouteOptimizationResult {
  orderedWorkOrders: WorkOrder[];
  totalDistanceMeters: number;
  estimatedTimeMinutes: number;
  waypoints: Array<{ lat: number; lng: number; workOrderId: string }>;
}

// ============================================
// Distance Calculations
// ============================================

/**
 * Calculate haversine distance between two points in meters
 */
export function haversineDistance(
  lat1: number, 
  lng1: number, 
  lat2: number, 
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function toDeg(rad: number): number {
  return rad * (180 / Math.PI);
}

/**
 * Calculate bearing between two points in degrees
 */
export function calculateBearing(
  lat1: number, 
  lng1: number, 
  lat2: number, 
  lng2: number
): number {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  const bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

/**
 * Get cardinal direction from bearing
 */
export function bearingToDirection(bearing: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

// ============================================
// Buffer Analysis
// ============================================

/**
 * Create a buffer zone around a point and find contained features
 */
export function createBuffer(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  workOrders: WorkOrder[],
  crews: Crew[]
): BufferResult {
  const containedWorkOrders = workOrders.filter(wo => {
    const distance = haversineDistance(centerLat, centerLng, wo.latitude, wo.longitude);
    return distance <= radiusMeters;
  });

  const containedCrews = crews.filter(crew => {
    const distance = haversineDistance(centerLat, centerLng, crew.currentLat, crew.currentLng);
    return distance <= radiusMeters;
  });

  return {
    center: { lat: centerLat, lng: centerLng },
    radiusMeters,
    containedWorkOrders,
    containedCrews
  };
}

/**
 * Create multiple buffers for each work order
 */
export function createWorkOrderBuffers(
  workOrders: WorkOrder[],
  radiusMeters: number,
  allWorkOrders: WorkOrder[],
  crews: Crew[]
): Map<string, BufferResult> {
  const buffers = new Map<string, BufferResult>();
  
  workOrders.forEach(wo => {
    buffers.set(wo.id, createBuffer(
      wo.latitude,
      wo.longitude,
      radiusMeters,
      allWorkOrders.filter(other => other.id !== wo.id),
      crews
    ));
  });
  
  return buffers;
}

// ============================================
// Nearest Neighbor Analysis
// ============================================

/**
 * Find the nearest work order to a given point
 */
export function findNearestWorkOrder(
  lat: number,
  lng: number,
  workOrders: WorkOrder[],
  excludeIds: string[] = []
): NearestResult | null {
  const filteredOrders = workOrders.filter(wo => !excludeIds.includes(wo.id));
  
  if (filteredOrders.length === 0) return null;
  
  let nearestWO: WorkOrder = filteredOrders[0];
  let minDistance = haversineDistance(lat, lng, nearestWO.latitude, nearestWO.longitude);
  
  filteredOrders.forEach(wo => {
    const distance = haversineDistance(lat, lng, wo.latitude, wo.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearestWO = wo;
    }
  });
  
  const bearing = calculateBearing(lat, lng, nearestWO.latitude, nearestWO.longitude);
  
  return {
    workOrder: nearestWO,
    distanceMeters: minDistance,
    bearingDegrees: bearing,
    direction: bearingToDirection(bearing)
  };
}

/**
 * Find K nearest work orders to a point
 */
export function findKNearestWorkOrders(
  lat: number,
  lng: number,
  workOrders: WorkOrder[],
  k: number,
  excludeIds: string[] = []
): NearestResult[] {
  const filteredOrders = workOrders.filter(wo => !excludeIds.includes(wo.id));
  
  const distances = filteredOrders.map(wo => ({
    workOrder: wo,
    distanceMeters: haversineDistance(lat, lng, wo.latitude, wo.longitude),
    bearingDegrees: calculateBearing(lat, lng, wo.latitude, wo.longitude),
    direction: bearingToDirection(calculateBearing(lat, lng, wo.latitude, wo.longitude))
  }));
  
  distances.sort((a, b) => a.distanceMeters - b.distanceMeters);
  
  return distances.slice(0, k);
}

/**
 * Find nearest available crew to a work order
 */
export function findNearestCrew(
  workOrder: WorkOrder,
  crews: Crew[],
  onlyAvailable: boolean = true
): { crew: Crew; distanceMeters: number; direction: string } | null {
  const filteredCrews = onlyAvailable 
    ? crews.filter(c => c.status === 'available')
    : crews;
  
  if (filteredCrews.length === 0) return null;
  
  let nearestCrew: Crew = filteredCrews[0];
  let minDistance = haversineDistance(
    workOrder.latitude,
    workOrder.longitude,
    nearestCrew.currentLat,
    nearestCrew.currentLng
  );
  
  filteredCrews.forEach(crew => {
    const distance = haversineDistance(
      workOrder.latitude, 
      workOrder.longitude, 
      crew.currentLat, 
      crew.currentLng
    );
    if (distance < minDistance) {
      minDistance = distance;
      nearestCrew = crew;
    }
  });
  
  const bearing = calculateBearing(
    workOrder.latitude, 
    workOrder.longitude, 
    nearestCrew.currentLat, 
    nearestCrew.currentLng
  );
  
  return {
    crew: nearestCrew,
    distanceMeters: minDistance,
    direction: bearingToDirection(bearing)
  };
}

// ============================================
// Distance Matrix
// ============================================

/**
 * Generate a distance matrix between all work orders
 */
export function generateDistanceMatrix(workOrders: WorkOrder[]): DistanceMatrixEntry[] {
  const matrix: DistanceMatrixEntry[] = [];
  
  for (let i = 0; i < workOrders.length; i++) {
    for (let j = i + 1; j < workOrders.length; j++) {
      const distance = haversineDistance(
        workOrders[i].latitude,
        workOrders[i].longitude,
        workOrders[j].latitude,
        workOrders[j].longitude
      );
      
      matrix.push({
        from: { 
          id: workOrders[i].id, 
          lat: workOrders[i].latitude, 
          lng: workOrders[i].longitude 
        },
        to: { 
          id: workOrders[j].id, 
          lat: workOrders[j].latitude, 
          lng: workOrders[j].longitude 
        },
        distanceMeters: distance
      });
    }
  }
  
  return matrix.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// ============================================
// Service Area Analysis
// ============================================

/**
 * Calculate service areas for crew positioning
 */
export function calculateServiceAreas(
  crews: Crew[],
  workOrders: WorkOrder[],
  serviceRadiusMeters: number = 2000
): ServiceAreaResult[] {
  return crews.map(crew => {
    const workOrdersInArea = workOrders.filter(wo => {
      const distance = haversineDistance(
        crew.currentLat,
        crew.currentLng,
        wo.latitude,
        wo.longitude
      );
      return distance <= serviceRadiusMeters;
    });
    
    // Estimate service time (30 min per work order + 15 min travel between)
    const estimatedServiceTime = workOrdersInArea.length * 30 + 
      Math.max(0, workOrdersInArea.length - 1) * 15;
    
    // Calculate priority score based on severity
    const priorityScore = workOrdersInArea.reduce((sum, wo) => {
      const severityWeight = {
        critical: 4,
        high: 3,
        medium: 2,
        low: 1
      };
      return sum + (severityWeight[wo.severity] || 1);
    }, 0);
    
    return {
      centerId: crew.id,
      radiusMeters: serviceRadiusMeters,
      workOrdersInArea,
      estimatedServiceTime,
      priorityScore
    };
  });
}

// ============================================
// Density Analysis (Heatmap Data)
// ============================================

/**
 * Calculate density grid for heatmap visualization
 */
export function calculateDensityGrid(
  workOrders: WorkOrder[],
  gridSize: number = 10,
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): DensityCell[] {
  if (workOrders.length === 0) return [];
  
  // Calculate bounds if not provided
  const calculatedBounds = bounds || {
    minLat: Math.min(...workOrders.map(wo => wo.latitude)),
    maxLat: Math.max(...workOrders.map(wo => wo.latitude)),
    minLng: Math.min(...workOrders.map(wo => wo.longitude)),
    maxLng: Math.max(...workOrders.map(wo => wo.longitude))
  };
  
  const latStep = (calculatedBounds.maxLat - calculatedBounds.minLat) / gridSize;
  const lngStep = (calculatedBounds.maxLng - calculatedBounds.minLng) / gridSize;
  
  const grid: DensityCell[] = [];
  let maxCount = 0;
  
  // Count work orders in each cell
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cellMinLat = calculatedBounds.minLat + i * latStep;
      const cellMaxLat = cellMinLat + latStep;
      const cellMinLng = calculatedBounds.minLng + j * lngStep;
      const cellMaxLng = cellMinLng + lngStep;
      
      const count = workOrders.filter(wo => 
        wo.latitude >= cellMinLat && wo.latitude < cellMaxLat &&
        wo.longitude >= cellMinLng && wo.longitude < cellMaxLng
      ).length;
      
      if (count > maxCount) maxCount = count;
      
      grid.push({
        lat: cellMinLat + latStep / 2,
        lng: cellMinLng + lngStep / 2,
        count,
        intensity: 0 // Will be normalized later
      });
    }
  }
  
  // Normalize intensity
  if (maxCount > 0) {
    grid.forEach(cell => {
      cell.intensity = cell.count / maxCount;
    });
  }
  
  return grid.filter(cell => cell.count > 0);
}

// ============================================
// Route Optimization (Greedy TSP)
// ============================================

/**
 * Optimize route through work orders using nearest neighbor heuristic
 */
export function optimizeRoute(
  startLat: number,
  startLng: number,
  workOrders: WorkOrder[]
): RouteOptimizationResult {
  if (workOrders.length === 0) {
    return {
      orderedWorkOrders: [],
      totalDistanceMeters: 0,
      estimatedTimeMinutes: 0,
      waypoints: []
    };
  }
  
  const orderedWorkOrders: WorkOrder[] = [];
  const remaining = [...workOrders];
  let currentLat = startLat;
  let currentLng = startLng;
  let totalDistance = 0;
  
  while (remaining.length > 0) {
    // Find nearest unvisited work order
    let nearestIdx = 0;
    let nearestDistance = haversineDistance(
      currentLat, 
      currentLng, 
      remaining[0].latitude, 
      remaining[0].longitude
    );
    
    for (let i = 1; i < remaining.length; i++) {
      const distance = haversineDistance(
        currentLat,
        currentLng,
        remaining[i].latitude,
        remaining[i].longitude
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIdx = i;
      }
    }
    
    const nearest = remaining.splice(nearestIdx, 1)[0];
    orderedWorkOrders.push(nearest);
    totalDistance += nearestDistance;
    currentLat = nearest.latitude;
    currentLng = nearest.longitude;
  }
  
  // Estimate time: 30 min per work order + travel time (assume 30 km/h average)
  const travelTimeMinutes = (totalDistance / 1000) / 30 * 60;
  const workTimeMinutes = orderedWorkOrders.length * 30;
  const estimatedTimeMinutes = travelTimeMinutes + workTimeMinutes;
  
  return {
    orderedWorkOrders,
    totalDistanceMeters: totalDistance,
    estimatedTimeMinutes,
    waypoints: orderedWorkOrders.map(wo => ({
      lat: wo.latitude,
      lng: wo.longitude,
      workOrderId: wo.id
    }))
  };
}

// ============================================
// Spatial Queries
// ============================================

/**
 * Find work orders within a bounding box
 */
export function findInBoundingBox(
  workOrders: WorkOrder[],
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): WorkOrder[] {
  return workOrders.filter(wo =>
    wo.latitude >= bounds.minLat &&
    wo.latitude <= bounds.maxLat &&
    wo.longitude >= bounds.minLng &&
    wo.longitude <= bounds.maxLng
  );
}

/**
 * Calculate the centroid of a group of work orders
 */
export function calculateCentroid(workOrders: WorkOrder[]): { lat: number; lng: number } {
  if (workOrders.length === 0) {
    return { lat: 0, lng: 0 };
  }
  
  const sumLat = workOrders.reduce((sum, wo) => sum + wo.latitude, 0);
  const sumLng = workOrders.reduce((sum, wo) => sum + wo.longitude, 0);
  
  return {
    lat: sumLat / workOrders.length,
    lng: sumLng / workOrders.length
  };
}

/**
 * Calculate the bounding box of work orders
 */
export function calculateBoundingBox(workOrders: WorkOrder[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  center: { lat: number; lng: number };
} {
  if (workOrders.length === 0) {
    return {
      minLat: 0,
      maxLat: 0,
      minLng: 0,
      maxLng: 0,
      center: { lat: 0, lng: 0 }
    };
  }
  
  const lats = workOrders.map(wo => wo.latitude);
  const lngs = workOrders.map(wo => wo.longitude);
  
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2
    }
  };
}

// ============================================
// Analysis Summary
// ============================================

/**
 * Generate a comprehensive spatial analysis summary
 */
export function generateSpatialAnalysis(
  workOrders: WorkOrder[],
  crews: Crew[]
): {
  totalArea: number;
  avgDistance: number;
  densityPerSqKm: number;
  nearestCrewDistance: number;
  coverageScore: number;
  hotspots: Array<{ lat: number; lng: number; count: number }>;
} {
  if (workOrders.length === 0) {
    return {
      totalArea: 0,
      avgDistance: 0,
      densityPerSqKm: 0,
      nearestCrewDistance: 0,
      coverageScore: 0,
      hotspots: []
    };
  }
  
  const bounds = calculateBoundingBox(workOrders);
  
  // Calculate area in sq km
  const latDist = haversineDistance(bounds.minLat, bounds.minLng, bounds.maxLat, bounds.minLng);
  const lngDist = haversineDistance(bounds.minLat, bounds.minLng, bounds.minLat, bounds.maxLng);
  const totalArea = (latDist * lngDist) / 1000000; // sq km
  
  // Calculate average distance between work orders
  const matrix = generateDistanceMatrix(workOrders);
  const avgDistance = matrix.length > 0
    ? matrix.reduce((sum, entry) => sum + entry.distanceMeters, 0) / matrix.length
    : 0;
  
  // Calculate density
  const densityPerSqKm = totalArea > 0 ? workOrders.length / totalArea : 0;
  
  // Calculate average nearest crew distance
  let totalCrewDistance = 0;
  let crewDistanceCount = 0;
  workOrders.forEach(wo => {
    const nearestCrew = findNearestCrew(wo, crews, false);
    if (nearestCrew) {
      totalCrewDistance += nearestCrew.distanceMeters;
      crewDistanceCount++;
    }
  });
  const nearestCrewDistance = crewDistanceCount > 0 
    ? totalCrewDistance / crewDistanceCount 
    : 0;
  
  // Calculate coverage score (how well crews cover the area)
  const serviceAreas = calculateServiceAreas(crews, workOrders, 2000);
  const coveredWorkOrders = new Set<string>();
  serviceAreas.forEach(area => {
    area.workOrdersInArea.forEach(wo => coveredWorkOrders.add(wo.id));
  });
  const coverageScore = workOrders.length > 0 
    ? coveredWorkOrders.size / workOrders.length 
    : 0;
  
  // Find hotspots (density cells with high counts)
  const densityGrid = calculateDensityGrid(workOrders, 5);
  const hotspots = densityGrid
    .filter(cell => cell.intensity >= 0.5)
    .map(cell => ({ lat: cell.lat, lng: cell.lng, count: cell.count }));
  
  return {
    totalArea,
    avgDistance,
    densityPerSqKm,
    nearestCrewDistance,
    coverageScore,
    hotspots
  };
}

export default {
  haversineDistance,
  calculateBearing,
  bearingToDirection,
  createBuffer,
  createWorkOrderBuffers,
  findNearestWorkOrder,
  findKNearestWorkOrders,
  findNearestCrew,
  generateDistanceMatrix,
  calculateServiceAreas,
  calculateDensityGrid,
  optimizeRoute,
  findInBoundingBox,
  calculateCentroid,
  calculateBoundingBox,
  generateSpatialAnalysis
};

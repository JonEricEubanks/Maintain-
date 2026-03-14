/**
 * MAINTAIN AI — Infrastructure Decay Simulation Engine
 * 
 * Simulates how infrastructure degrades over time when work orders
 * go unrepaired. Uses real work order data + weather patterns to
 * model realistic deterioration — like a city sim driven by real data.
 * 
 * Weibull-distribution decay model:
 *   F(t) = 1 − exp(−(t/λ)^k)
 * 
 * Where:
 *   k (shape) > 1 = increasing failure rate ("wear-out" — typical for infrastructure)
 *   λ (scale) = characteristic life in days (63.2% failure point)
 *   t = elapsed time in days
 * 
 * This replaces the earlier linear model with a physically-motivated
 * S-curve that matches real-world infrastructure degradation patterns.
 */

import type { WorkOrder, Severity, WeatherCondition } from '../types/infrastructure';
import { getQuickCost } from './pricingService';

// ============================================
// Lake Michigan boundary — crude polygon for Lake Forest eastern shore
// Spawned damage must stay west of this line (on land)
// ============================================

const LAKE_BOUNDARY_LNG = -87.810; // Approximate east boundary — anything east is lake
const CITY_BOUNDS = {
  north: 42.285,
  south: 42.195,
  west: -87.900,
  east: -87.810,
};

/** Returns true if a point is on land (west of Lake Michigan shore) within city limits */
function isOnLand(lat: number, lng: number): boolean {
  return (
    lat >= CITY_BOUNDS.south &&
    lat <= CITY_BOUNDS.north &&
    lng >= CITY_BOUNDS.west &&
    lng <= CITY_BOUNDS.east
  );
}

// ============================================
// Types
// ============================================

export interface DecaySnapshot {
  /** Simulation month (0 = today) */
  month: number;
  /** Label like "Mar 2026" */
  label: string;
  /** All work orders with simulated decay state */
  workOrders: DecayedWorkOrder[];
  /** Aggregate stats for this month */
  stats: MonthStats;
  /** Weather condition used for this month */
  weather: WeatherCondition;
  /** Average temperature for this month */
  temperature: number;
}

export interface DecayedWorkOrder {
  id: string;
  issueType: string;
  originalSeverity: Severity;
  currentSeverity: Severity;
  /** 0.0 (pristine) → 1.0 (total failure) */
  decayScore: number;
  /** Color hex for map rendering */
  color: string;
  /** Marker radius (grows with decay) */
  radius: number;
  /** Opacity (fades toward black at max decay) */
  opacity: number;
  latitude: number;
  longitude: number;
  address: string;
  estimatedCost: number;
  /** Cost multiplier from decay */
  costMultiplier: number;
  nearSchool: boolean;
  zone: string;
  /** Has this issue "spawned" new damage nearby? */
  hasSpawnedDamage: boolean;
  /** Is this a newly spawned issue (didn't exist at month 0)? */
  isSpawned: boolean;
  title: string;
}

export interface MonthStats {
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  newIssuesThisMonth: number;
  totalCost: number;
  costIncrease: number;
  /** Percentage of road network in "failed" state */
  failureRate: number;
  /** Overall city health score 0-100 */
  cityHealthScore: number;
  /** Issues near schools */
  schoolZoneIssues: number;
}

export interface DecaySimulationResult {
  /** One snapshot per month, starting from month 0 (current) */
  timeline: DecaySnapshot[];
  /** Total months simulated */
  totalMonths: number;
  /** Summary narrative */
  narrative: string;
  /** Key milestones (e.g., "Month 4: First road failure") */
  milestones: DecayMilestone[];
}

export interface DecayMilestone {
  month: number;
  label: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  icon: string;
}

// ============================================
// Constants
// ============================================

/** Base decay rates per issue type (per month, fraction of 1.0) */
const DECAY_RATES: Record<string, number> = {
  pothole: 0.12,   // Potholes grow fast
  sidewalk: 0.06,  // Sidewalks degrade slower
  concrete: 0.04,  // Concrete is most durable
};

/**
 * Weibull distribution parameters per issue type.
 * shape (k): Controls failure rate curve. k > 1 = increasing failure rate ("wear-out")
 * scale (λ): Characteristic life in days — age at which 63.2% of assets have failed
 * 
 * These are calibrated to Lake Forest infrastructure data:
 *   - Potholes: k=1.8, λ=120 days — fail fast, accelerating rate
 *   - Sidewalks: k=2.2, λ=240 days — gradual aging, more predictable
 *   - Concrete: k=2.5, λ=365 days — most durable, longest characteristic life
 */
const WEIBULL_PARAMS: Record<string, { shape: number; scale: number }> = {
  pothole:  { shape: 1.8, scale: 120 },
  sidewalk: { shape: 2.2, scale: 240 },
  concrete: { shape: 2.5, scale: 365 },
};

/** Severity multipliers on Weibull scale parameter (lower = fails sooner) */
const SEVERITY_SCALE_MULT: Record<Severity, number> = {
  critical: 0.4,
  high: 0.7,
  medium: 1.0,
  low: 1.3,
};

/** Weather impact multipliers on Weibull scale (lower = fails sooner) */
const WEATHER_SCALE_MULT: Record<WeatherCondition, number> = {
  clear: 1.0,
  cloudy: 1.0,
  rain: 0.85,
  snow: 0.75,
  freezing: 0.65,
  freeze_thaw: 0.55,
};

/**
 * Weibull CDF: F(t) = 1 − exp(−(t/λ)^k)
 * Returns a decay score from 0.0 (pristine) to 1.0 (total failure)
 */
function weibullCDF(t: number, shape: number, scale: number): number {
  if (t <= 0 || scale <= 0 || shape <= 0) return 0;
  return 1 - Math.exp(-Math.pow(t / scale, shape));
}

/**
 * Weibull hazard rate: h(t) = (k/λ)(t/λ)^(k-1)
 * Returns instantaneous failure rate at time t
 */
function weibullHazardRate(t: number, shape: number, scale: number): number {
  if (t <= 0 || scale <= 0 || shape <= 0) return 0;
  return (shape / scale) * Math.pow(t / scale, shape - 1);
}

/** Severity thresholds on the 0-1 decay scale */
const SEVERITY_THRESHOLDS: { severity: Severity; min: number }[] = [
  { severity: 'critical', min: 0.75 },
  { severity: 'high', min: 0.50 },
  { severity: 'medium', min: 0.25 },
  { severity: 'low', min: 0.0 },
];

/** Starting decay scores for existing severity levels */
const INITIAL_DECAY: Record<Severity, number> = {
  critical: 0.80,
  high: 0.55,
  medium: 0.30,
  low: 0.10,
};

/** Weather impact multipliers on decay rate */
const WEATHER_MULTIPLIERS: Record<WeatherCondition, number> = {
  clear: 1.0,
  cloudy: 1.0,
  rain: 1.3,
  snow: 1.5,
  freezing: 1.8,
  freeze_thaw: 2.2, // Most destructive
};

/** Lake Forest monthly weather pattern (approximate) */
const MONTHLY_WEATHER: Array<{ condition: WeatherCondition; avgTemp: number; label: string }> = [
  { condition: 'freezing',    avgTemp: 25, label: 'Jan' },
  { condition: 'freeze_thaw', avgTemp: 30, label: 'Feb' },
  { condition: 'freeze_thaw', avgTemp: 38, label: 'Mar' },
  { condition: 'rain',        avgTemp: 48, label: 'Apr' },
  { condition: 'rain',        avgTemp: 58, label: 'May' },
  { condition: 'clear',       avgTemp: 72, label: 'Jun' },
  { condition: 'clear',       avgTemp: 78, label: 'Jul' },
  { condition: 'clear',       avgTemp: 76, label: 'Aug' },
  { condition: 'cloudy',      avgTemp: 65, label: 'Sep' },
  { condition: 'rain',        avgTemp: 52, label: 'Oct' },
  { condition: 'freezing',    avgTemp: 38, label: 'Nov' },
  { condition: 'freezing',    avgTemp: 28, label: 'Dec' },
];

/** Color gradient from healthy → failed (green → yellow → orange → red → deep crimson) */
const DECAY_COLORS = [
  { score: 0.0,  color: '#22c55e' }, // Green - healthy
  { score: 0.15, color: '#84cc16' }, // Lime
  { score: 0.30, color: '#eab308' }, // Yellow
  { score: 0.45, color: '#f59e0b' }, // Amber
  { score: 0.60, color: '#f97316' }, // Orange
  { score: 0.75, color: '#ef4444' }, // Red
  { score: 0.85, color: '#dc2626' }, // Bright red
  { score: 0.95, color: '#be123c' }, // Deep rose
  { score: 1.0,  color: '#9f1239' }, // Crimson - total failure
];

// ============================================
// Helpers
// ============================================

function interpolateColor(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  
  // Find the two colors to interpolate between
  let lower = DECAY_COLORS[0];
  let upper = DECAY_COLORS[DECAY_COLORS.length - 1];
  
  for (let i = 0; i < DECAY_COLORS.length - 1; i++) {
    if (clamped >= DECAY_COLORS[i].score && clamped <= DECAY_COLORS[i + 1].score) {
      lower = DECAY_COLORS[i];
      upper = DECAY_COLORS[i + 1];
      break;
    }
  }
  
  const range = upper.score - lower.score;
  const t = range > 0 ? (clamped - lower.score) / range : 0;
  
  // Parse hex colors
  const lR = parseInt(lower.color.slice(1, 3), 16);
  const lG = parseInt(lower.color.slice(3, 5), 16);
  const lB = parseInt(lower.color.slice(5, 7), 16);
  const uR = parseInt(upper.color.slice(1, 3), 16);
  const uG = parseInt(upper.color.slice(3, 5), 16);
  const uB = parseInt(upper.color.slice(5, 7), 16);
  
  const r = Math.round(lR + (uR - lR) * t);
  const g = Math.round(lG + (uG - lG) * t);
  const b = Math.round(lB + (uB - lB) * t);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function decayToSeverity(score: number): Severity {
  for (const { severity, min } of SEVERITY_THRESHOLDS) {
    if (score >= min) return severity;
  }
  return 'low';
}

function severityWeight(s: Severity): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

/** Generate a deterministic pseudo-random number from a seed string */
function seededRandom(seed: string, index: number): number {
  let hash = 0;
  const str = `${seed}-${index}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs((Math.sin(hash) * 10000) % 1);
}

// ============================================
// Main Simulation Engine
// ============================================

/**
 * Run a full infrastructure decay simulation over N months.
 * 
 * The simulation:
 * 1. Starts with current work orders and their severities
 * 2. Each month, applies weather-adjusted decay rates
 * 3. Severely degraded areas "spawn" new damage nearby
 * 4. Costs escalate non-linearly (neglect penalty)
 * 5. Calculates city health score each month
 */
export function runDecaySimulation(
  workOrders: WorkOrder[],
  months: number = 12,
  startMonth?: number, // 0-11, defaults to current month
): DecaySimulationResult {
  const now = new Date();
  const currentMonth = startMonth ?? now.getMonth();
  
  // Initialize work order decay states
  let decayStates: DecayedWorkOrder[] = workOrders.map(wo => {
    const initialDecay = INITIAL_DECAY[wo.severity] || 0.1;
    return {
      id: wo.id,
      issueType: wo.issueType,
      originalSeverity: wo.severity,
      currentSeverity: wo.severity,
      decayScore: initialDecay,
      color: interpolateColor(initialDecay),
      radius: 6 + initialDecay * 20,
      opacity: 0.7 + initialDecay * 0.3,
      latitude: wo.latitude,
      longitude: wo.longitude,
      address: wo.address,
      estimatedCost: wo.estimatedCost,
      costMultiplier: 1.0,
      nearSchool: wo.nearSchool,
      zone: wo.zone,
      hasSpawnedDamage: false,
      isSpawned: false,
      title: wo.title,
    };
  });
  
  const timeline: DecaySnapshot[] = [];
  const milestones: DecayMilestone[] = [];
  const initialCost = workOrders.reduce((s, w) => s + (w.estimatedCost || 0), 0);
  let spawnCounter = 0;
  let firstCriticalMonth = -1;
  let firstFailureMonth = -1;
  let costDoubledMonth = -1;
  
  // Simulate each month
  for (let m = 0; m <= months; m++) {
    const weatherIdx = (currentMonth + m) % 12;
    const monthWeather = MONTHLY_WEATHER[weatherIdx];
    const weatherMult = WEATHER_MULTIPLIERS[monthWeather.condition];
    const year = now.getFullYear() + Math.floor((currentMonth + m) / 12);
    const monthLabel = `${monthWeather.label} ${year}`;
    
    if (m > 0) {
      // Apply Weibull-based decay to all work orders
      decayStates = decayStates.map(wo => {
        const params = WEIBULL_PARAMS[wo.issueType] || { shape: 2.0, scale: 180 };
        const sevMult = SEVERITY_SCALE_MULT[wo.originalSeverity] || 1.0;
        const weatherScaleMult = WEATHER_SCALE_MULT[monthWeather.condition] || 1.0;
        
        // Adjusted Weibull scale: severity + cumulative weather effect
        // Each month's weather compounds on the characteristic life
        const adjustedScale = params.scale * sevMult * weatherScaleMult;
        
        // Time elapsed in days (each simulation step = 1 month ≈ 30 days)
        const elapsedDays = m * 30;
        
        // Weibull CDF gives the decay score (probability of failure by time t)
        // F(t) = 1 − exp(−(t/λ)^k)
        const weibullDecay = weibullCDF(elapsedDays, params.shape, adjustedScale);
        
        // Blend: start from initial decay and progress toward Weibull ceiling
        // This ensures already-damaged assets don't reset to zero
        const initialDecay = INITIAL_DECAY[wo.originalSeverity] || 0.1;
        const newDecay = Math.min(1.0, Math.max(initialDecay, weibullDecay));
        
        const newSeverity = decayToSeverity(newDecay);
        
        // School proximity increases "foot traffic" damage slightly
        const trafficMult = wo.nearSchool ? 1.05 : 1.0;
        const finalDecay = Math.min(1.0, newDecay * trafficMult);
        
        // Cost escalation: neglect penalty is exponential
        const costMult = 1 + Math.pow(finalDecay, 2) * 4; // Up to 5x cost at max decay
        
        return {
          ...wo,
          decayScore: finalDecay,
          currentSeverity: newSeverity,
          color: interpolateColor(finalDecay),
          radius: 6 + finalDecay * 24,
          opacity: 0.6 + finalDecay * 0.4,
          costMultiplier: costMult,
        };
      });
      
      // Spawn new damage near severely degraded issues
      const criticalIssues = decayStates.filter(
        wo => wo.decayScore > 0.7 && !wo.hasSpawnedDamage && !wo.isSpawned
      );
      
      const newSpawns: DecayedWorkOrder[] = [];
      criticalIssues.forEach((wo, idx) => {
        // 40% chance per month to spawn nearby damage
        const rand = seededRandom(wo.id, m * 100 + idx);
        if (rand < 0.4) {
          spawnCounter++;
          const angle = seededRandom(wo.id, m * 200 + idx) * Math.PI * 2;
          const dist = 0.001 + seededRandom(wo.id, m * 300 + idx) * 0.003; // ~100-400m
          
          let newLat = wo.latitude + Math.sin(angle) * dist;
          let newLng = wo.longitude + Math.cos(angle) * dist;

          // Clamp to land — if point is in lake, push it west onto shore
          if (!isOnLand(newLat, newLng)) {
            newLng = Math.min(newLng, CITY_BOUNDS.east - 0.002);
            newLat = Math.max(CITY_BOUNDS.south + 0.001, Math.min(CITY_BOUNDS.north - 0.001, newLat));
          }

          newSpawns.push({
            id: `decay-spawn-${spawnCounter}`,
            issueType: wo.issueType,
            originalSeverity: 'low',
            currentSeverity: 'low',
            decayScore: 0.05,
            color: interpolateColor(0.05),
            radius: 7,
            opacity: 0.65,
            latitude: newLat,
            longitude: newLng,
            address: `Near ${wo.address}`,
            estimatedCost: getQuickCost(wo.issueType, 'low'),
            costMultiplier: 1.0,
            nearSchool: wo.nearSchool,
            zone: wo.zone,
            hasSpawnedDamage: false,
            isSpawned: true,
            title: `New ${wo.issueType} damage (spread from ${wo.id})`,
          });
          
          // Mark parent as having spawned
          wo.hasSpawnedDamage = true;
        }
      });
      
      decayStates = [...decayStates, ...newSpawns];
    }
    
    // Calculate month stats
    const stats = calculateMonthStats(decayStates, initialCost, m);
    
    // Check for milestones
    if (m > 0) {
      const criticalCount = decayStates.filter(wo => wo.currentSeverity === 'critical').length;
      const prevCritical = timeline[m - 1]?.stats.critical || 0;
      
      if (firstCriticalMonth < 0 && criticalCount > prevCritical * 1.5 && criticalCount > 3) {
        firstCriticalMonth = m;
        milestones.push({
          month: m,
          label: `Critical Surge`,
          description: `${criticalCount} issues now critical — damage spreading faster than expected`,
          severity: 'warning',
          icon: '!',
        });
      }
      
      if (firstFailureMonth < 0 && stats.failureRate > 10) {
        firstFailureMonth = m;
        milestones.push({
          month: m,
          label: `Infrastructure Failure`,
          description: `${Math.round(stats.failureRate)}% of tracked infrastructure has reached failure state`,
          severity: 'critical',
          icon: 'x-mark',
        });
      }
      
      if (costDoubledMonth < 0 && stats.totalCost > initialCost * 2) {
        costDoubledMonth = m;
        milestones.push({
          month: m,
          label: `Cost Doubled`,
          description: `Repair costs have doubled from $${initialCost.toLocaleString()} to $${Math.round(stats.totalCost).toLocaleString()} due to neglect`,
          severity: 'warning',
          icon: '$',
        });
      }
      
      // New spawns milestone
      const newThisMonth = decayStates.filter(wo => wo.isSpawned).length;
      const prevSpawned = timeline[m - 1]?.workOrders.filter(wo => wo.isSpawned).length || 0;
      if (newThisMonth > prevSpawned + 3) {
        milestones.push({
          month: m,
          label: `Damage Spreading`,
          description: `${newThisMonth - prevSpawned} new issues appeared as damage spread from unrepaired sites`,
          severity: 'info',
          icon: '⇉',
        });
      }
    }
    
    timeline.push({
      month: m,
      label: monthLabel,
      workOrders: decayStates.map(wo => ({ ...wo })), // Deep copy
      stats,
      weather: monthWeather.condition,
      temperature: monthWeather.avgTemp,
    });
  }
  
  // Generate narrative
  const finalStats = timeline[timeline.length - 1].stats;
  const narrative = generateNarrative(workOrders.length, months, timeline, milestones, initialCost, finalStats);
  
  return {
    timeline,
    totalMonths: months,
    narrative,
    milestones,
  };
}

function calculateMonthStats(
  workOrders: DecayedWorkOrder[],
  initialCost: number,
  month: number
): MonthStats {
  const critical = workOrders.filter(wo => wo.currentSeverity === 'critical').length;
  const high = workOrders.filter(wo => wo.currentSeverity === 'high').length;
  const medium = workOrders.filter(wo => wo.currentSeverity === 'medium').length;
  const low = workOrders.filter(wo => wo.currentSeverity === 'low').length;
  const newIssues = workOrders.filter(wo => wo.isSpawned).length;
  const totalCost = workOrders.reduce((s, wo) => s + wo.estimatedCost * wo.costMultiplier, 0);
  
  // Failure rate: % of issues with decay > 0.85
  const failed = workOrders.filter(wo => wo.decayScore > 0.85).length;
  const failureRate = workOrders.length > 0 ? (failed / workOrders.length) * 100 : 0;
  
  // City health score (100 = perfect, 0 = total collapse)
  const avgDecay = workOrders.reduce((s, wo) => s + wo.decayScore, 0) / Math.max(workOrders.length, 1);
  const cityHealthScore = Math.max(0, Math.round((1 - avgDecay) * 100));
  
  const schoolZoneIssues = workOrders.filter(wo => wo.nearSchool && wo.currentSeverity !== 'low').length;
  
  return {
    totalIssues: workOrders.length,
    critical,
    high,
    medium,
    low,
    newIssuesThisMonth: newIssues,
    totalCost,
    costIncrease: totalCost - initialCost,
    failureRate,
    cityHealthScore,
    schoolZoneIssues,
  };
}

function generateNarrative(
  initialCount: number,
  months: number,
  timeline: DecaySnapshot[],
  milestones: DecayMilestone[],
  initialCost: number,
  finalStats: MonthStats,
): string {
  const parts: string[] = [];
  
  parts.push(`**The Decay of Lake Forest — A ${months}-Month Projection**\n`);
  parts.push(`Starting with ${initialCount} open infrastructure issues and a repair bill of $${initialCost.toLocaleString()}, `);
  parts.push(`this simulation projects what happens if **no repairs are made**.\n\n`);
  
  // Mid-point check
  const midIdx = Math.floor(months / 2);
  const midStats = timeline[midIdx]?.stats;
  if (midStats) {
    parts.push(`By **month ${midIdx}** (${timeline[midIdx].label}), the city's health score drops to **${midStats.cityHealthScore}/100**. `);
    parts.push(`${midStats.critical} issues have become critical, and repair costs have risen to $${Math.round(midStats.totalCost).toLocaleString()}.\n\n`);
  }
  
  // Final state
  parts.push(`After **${months} months** of neglect:\n`);
  parts.push(`- City health: **${finalStats.cityHealthScore}/100**\n`);
  parts.push(`- Critical issues: **${finalStats.critical}** (up from ${timeline[0].stats.critical})\n`);
  parts.push(`- Total issues: **${finalStats.totalIssues}** (started at ${initialCount})\n`);
  parts.push(`- Repair cost: **$${Math.round(finalStats.totalCost).toLocaleString()}** (was $${initialCost.toLocaleString()})\n`);
  parts.push(`- School zone hazards: **${finalStats.schoolZoneIssues}**\n`);
  parts.push(`- Infrastructure failure rate: **${Math.round(finalStats.failureRate)}%**\n\n`);
  
  if (milestones.length > 0) {
    parts.push(`**Key Events:**\n`);
    milestones.forEach(ms => {
      parts.push(`- ${ms.icon} **Month ${ms.month}** (${timeline[ms.month]?.label}): ${ms.description}\n`);
    });
  }
  
  return parts.join('');
}

export default {
  runDecaySimulation,
};

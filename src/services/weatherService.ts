/**
 * MAINTAIN AI - Weather Service
 * 
 * Provides weather data for crew estimation and predictive analytics.
 * Uses Open-Meteo API (free, no API key required) for real weather data.
 */

import type { WeatherForecast, WeatherCondition } from '../types/infrastructure';

// ============================================
// Configuration
// ============================================

// Lake Forest, IL coordinates
const LAKE_FOREST_LAT = 42.2586;
const LAKE_FOREST_LNG = -87.8407;

const WEATHER_API_BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL = 1800000; // 30 minutes

// Track if external weather API is reachable (avoid repeated CSP-blocked fetches)
let weatherApiBlocked = false;
let weatherDataSource: 'live' | 'fallback' | 'pending' = 'pending';

/**
 * Returns whether weather is using live API data or local seasonal fallback
 */
export function getWeatherDataSource(): 'live' | 'fallback' | 'pending' {
  return weatherDataSource;
}

// ============================================
// Types
// ============================================

interface OpenMeteoResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    weathercode: number[];
    windspeed_10m_max: number[];
  };
}

interface WeatherCache {
  data: WeatherForecast[];
  timestamp: number;
}

// ============================================
// Cache
// ============================================

let weatherCache: WeatherCache | null = null;

// ============================================
// Weather Code Mapping
// ============================================

function weatherCodeToCondition(code: number, tempF: number): WeatherCondition {
  // WMO Weather interpretation codes
  // https://open-meteo.com/en/docs
  
  if (code <= 3) return 'clear'; // Clear, mainly clear, partly cloudy
  if (code <= 49) return 'cloudy'; // Fog, depositing rime fog
  if (code <= 69) return 'rain'; // Drizzle, rain
  if (code <= 79) return 'snow'; // Snow fall
  if (code <= 99) return 'rain'; // Showers

  // Temperature-based adjustments
  if (tempF < 32) {
    // Check for freeze-thaw conditions (temperature oscillating around freezing)
    if (tempF > 28 && tempF < 36) return 'freeze_thaw';
    return 'freezing';
  }

  return 'cloudy';
}

function calculateWorkabilityScore(
  condition: WeatherCondition,
  tempF: number,
  windMph: number,
  precipInches: number
): number {
  let score = 1.0;

  // Temperature impact (optimal 40-75°F)
  if (tempF < 32) score *= 0.2; // Freezing - minimal work possible
  else if (tempF < 40) score *= 0.6;
  else if (tempF > 95) score *= 0.5; // Heat stress
  else if (tempF > 85) score *= 0.7;

  // Condition impact
  switch (condition) {
    case 'clear': score *= 1.0; break;
    case 'cloudy': score *= 0.95; break;
    case 'rain': score *= 0.3; break;
    case 'snow': score *= 0.2; break;
    case 'freezing': score *= 0.1; break;
    case 'freeze_thaw': score *= 0.4; break; // Some work possible
  }

  // Wind impact
  if (windMph > 30) score *= 0.5;
  else if (windMph > 20) score *= 0.7;
  else if (windMph > 15) score *= 0.9;

  // Precipitation impact
  if (precipInches > 0.5) score *= 0.3;
  else if (precipInches > 0.1) score *= 0.6;
  else if (precipInches > 0) score *= 0.8;

  return Math.max(0, Math.min(1, score));
}

// ============================================
// API Functions
// ============================================

/**
 * Fetch 7-day weather forecast for Lake Forest
 */
export async function getWeatherForecast(daysAhead = 7): Promise<WeatherForecast[]> {
  // Check cache first
  if (weatherCache && Date.now() - weatherCache.timestamp < CACHE_TTL) {
    return weatherCache.data.slice(0, daysAhead);
  }

  // If external API was previously blocked by CSP, skip directly to fallback
  if (weatherApiBlocked) {
    weatherDataSource = 'fallback';
    return generateFallbackForecast(daysAhead);
  }

  try {
    const url = new URL(WEATHER_API_BASE);
    url.searchParams.set('latitude', LAKE_FOREST_LAT.toString());
    url.searchParams.set('longitude', LAKE_FOREST_LNG.toString());
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max');
    url.searchParams.set('temperature_unit', 'fahrenheit');
    url.searchParams.set('windspeed_unit', 'mph');
    url.searchParams.set('precipitation_unit', 'inch');
    url.searchParams.set('timezone', 'America/Chicago');
    url.searchParams.set('forecast_days', Math.min(daysAhead, 16).toString());

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data: OpenMeteoResponse = await response.json();

    const forecasts: WeatherForecast[] = data.daily.time.map((date, i) => {
      const avgTemp = (data.daily.temperature_2m_max[i] + data.daily.temperature_2m_min[i]) / 2;
      const condition = weatherCodeToCondition(data.daily.weathercode[i], avgTemp);
      const windSpeed = data.daily.windspeed_10m_max[i];
      const precipitation = data.daily.precipitation_sum[i];

      return {
        date,
        temperature: Math.round(avgTemp),
        condition,
        windSpeed: Math.round(windSpeed),
        precipitation: Math.round(precipitation * 100) / 100,
        workabilityScore: calculateWorkabilityScore(condition, avgTemp, windSpeed, precipitation)
      };
    });

    // Update cache
    weatherCache = { data: forecasts, timestamp: Date.now() };
    weatherDataSource = 'live';

    return forecasts.slice(0, daysAhead);

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    // Detect CSP/CORS block and permanently skip future attempts
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || 
        msg.includes('Content Security Policy') || msg.includes('connect-src')) {
      weatherApiBlocked = true;
      console.info('[Weather] API blocked by browser security policy. Using seasonal fallback data.');
    } else {
      console.warn('[Weather] API error, using fallback:', msg);
    }
    
    // Return fallback data if API fails
    weatherDataSource = 'fallback';
    return generateFallbackForecast(daysAhead);
  }
}

/**
 * Get current weather conditions
 */
export async function getCurrentWeather(): Promise<WeatherForecast | null> {
  const forecast = await getWeatherForecast(1);
  return forecast[0] || null;
}

/**
 * Calculate weather impact on crew requirements
 * Returns a multiplier (e.g., 1.3 = 30% more crews needed)
 */
export async function getWeatherCrewMultiplier(): Promise<number> {
  const current = await getCurrentWeather();
  
  if (!current) return 1.0;

  // Base multiplier on workability (inverse relationship)
  // Low workability = fewer crews can work effectively
  // But we need MORE crews to compensate for reduced productivity
  
  const workability = current.workabilityScore;
  
  if (workability >= 0.9) return 1.0; // Perfect conditions
  if (workability >= 0.7) return 1.1; // Slight impact
  if (workability >= 0.5) return 1.25; // Moderate impact
  if (workability >= 0.3) return 1.5; // Significant impact
  return 2.0; // Severe conditions - need double crews for any work
}

/**
 * Predict freeze-thaw damage multiplier
 * Freeze-thaw cycles cause the most road damage
 */
export async function getFreezThawRisk(): Promise<{
  riskLevel: 'low' | 'medium' | 'high';
  cyclesExpected: number;
  potholeIncreasePercent: number;
}> {
  const forecast = await getWeatherForecast(7);
  
  // Count temperature oscillations around freezing point
  let freezeThawCycles = 0;
  let lastWasFreezing = false;

  for (const day of forecast) {
    const isFreezing = day.temperature < 32;
    if (isFreezing !== lastWasFreezing && forecast.indexOf(day) > 0) {
      freezeThawCycles++;
    }
    lastWasFreezing = isFreezing;
  }

  // Each freeze-thaw cycle increases pothole formation by ~8-12%
  const potholeIncreasePercent = freezeThawCycles * 10;

  return {
    riskLevel: freezeThawCycles === 0 ? 'low' : freezeThawCycles <= 2 ? 'medium' : 'high',
    cyclesExpected: freezeThawCycles,
    potholeIncreasePercent
  };
}

// ============================================
// Fallback Data
// ============================================

/**
 * Generate realistic seasonal weather estimates for Lake Forest, IL
 * when the live API is unavailable (e.g., blocked by CSP in Power Apps).
 * 
 * Uses historical climate normals for Lake Forest / northern Illinois:
 * - Monthly avg highs/lows, precipitation, wind, and typical conditions
 * - Adds day-to-day variability (±8°F temp, ±40% precip) for realism
 * - Correctly identifies freeze-thaw cycles in shoulder months
 * 
 * Data sourced from NOAA climate normals for Waukegan/Lake Forest area.
 */
function generateFallbackForecast(days: number): WeatherForecast[] {
  // Lake Forest, IL monthly climate normals (high / low °F, precip inches, wind mph)
  const climateNormals: Record<number, { avgHi: number; avgLo: number; precip: number; wind: number; snowChance: number }> = {
    0:  { avgHi: 31, avgLo: 16, precip: 0.07, wind: 12, snowChance: 0.35 }, // Jan
    1:  { avgHi: 35, avgLo: 19, precip: 0.06, wind: 12, snowChance: 0.30 }, // Feb
    2:  { avgHi: 46, avgLo: 28, precip: 0.09, wind: 13, snowChance: 0.15 }, // Mar
    3:  { avgHi: 58, avgLo: 38, precip: 0.13, wind: 13, snowChance: 0.03 }, // Apr
    4:  { avgHi: 69, avgLo: 48, precip: 0.14, wind: 11, snowChance: 0.00 }, // May
    5:  { avgHi: 79, avgLo: 58, precip: 0.14, wind: 10, snowChance: 0.00 }, // Jun
    6:  { avgHi: 83, avgLo: 63, precip: 0.13, wind: 9,  snowChance: 0.00 }, // Jul
    7:  { avgHi: 81, avgLo: 62, precip: 0.15, wind: 9,  snowChance: 0.00 }, // Aug
    8:  { avgHi: 74, avgLo: 53, precip: 0.11, wind: 10, snowChance: 0.00 }, // Sep
    9:  { avgHi: 61, avgLo: 42, precip: 0.11, wind: 11, snowChance: 0.02 }, // Oct
    10: { avgHi: 47, avgLo: 31, precip: 0.10, wind: 12, snowChance: 0.10 }, // Nov
    11: { avgHi: 34, avgLo: 20, precip: 0.08, wind: 12, snowChance: 0.30 }, // Dec
  };

  // Simple seeded random for day-to-day variability (deterministic per date for consistency)
  const seededRandom = (seed: number): number => {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const forecasts: WeatherForecast[] = [];
  const today = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const month = date.getMonth();
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
    const normals = climateNormals[month];

    // Day-to-day variability using seeded random
    const seed = dayOfYear * 1000 + date.getFullYear();
    const tempVariation = (seededRandom(seed) - 0.5) * 16; // ±8°F swing
    const precipVariation = seededRandom(seed + 1);

    const hi = Math.round(normals.avgHi + tempVariation);
    const lo = Math.round(normals.avgLo + tempVariation * 0.7);
    const avgTemp = Math.round((hi + lo) / 2);

    // Precipitation (some days dry, some wet)
    const hasRain = seededRandom(seed + 2) < 0.35; // ~35% of days have precip
    const precipitation = hasRain
      ? Math.round(normals.precip * (0.5 + precipVariation * 1.5) * 100) / 100
      : 0;

    // Wind with variation
    const windSpeed = Math.round(normals.wind + (seededRandom(seed + 3) - 0.5) * 8);

    // Determine condition
    let condition: WeatherCondition;
    if (hasRain && seededRandom(seed + 4) < normals.snowChance * 2) {
      condition = avgTemp < 32 ? 'snow' : 'rain';
    } else if (avgTemp < 28) {
      condition = 'freezing';
    } else if (avgTemp >= 28 && avgTemp <= 36) {
      // Check if previous day was significantly different temp → freeze-thaw
      const prevSeed = (dayOfYear - 1) * 1000 + date.getFullYear();
      const prevTempVar = (seededRandom(prevSeed) - 0.5) * 16;
      const prevAvg = Math.round((normals.avgHi + prevTempVar + normals.avgLo + prevTempVar * 0.7) / 2);
      if ((prevAvg < 32 && avgTemp >= 32) || (prevAvg >= 32 && avgTemp < 32)) {
        condition = 'freeze_thaw';
      } else if (hasRain) {
        condition = avgTemp < 32 ? 'snow' : 'rain';
      } else {
        condition = seededRandom(seed + 5) < 0.5 ? 'cloudy' : 'clear';
      }
    } else if (hasRain) {
      condition = 'rain';
    } else {
      condition = seededRandom(seed + 6) < 0.35 ? 'cloudy' : 'clear';
    }

    const workabilityScore = calculateWorkabilityScore(condition, avgTemp, windSpeed, precipitation);

    const dateStr = date.toISOString().split('T')[0];
    forecasts.push({
      date: dateStr,
      temperature: avgTemp,
      condition,
      windSpeed: Math.max(2, windSpeed),
      precipitation,
      workabilityScore,
    });
  }

  return forecasts;
}

/**
 * Clear weather cache
 */
export function clearWeatherCache(): void {
  weatherCache = null;
}

export default {
  getWeatherForecast,
  getCurrentWeather,
  getWeatherCrewMultiplier,
  getFreezThawRisk,
  clearWeatherCache,
  getWeatherDataSource
};

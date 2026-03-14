/**
 * MAINTAIN AI - Predictive Chart Component
 * 
 * Visualizes trends and forecasts for infrastructure data.
 * Uses pure CSS/SVG for charting (no external charting library).
 */

import React, { useMemo } from 'react';
import { Card, Text, Badge, Tooltip } from '@fluentui/react-components';
import {
  ArrowTrending24Regular,
  Warning24Regular,
  Checkmark24Regular,
  WeatherSunny24Regular,
  WeatherCloudy24Regular,
  WeatherRainShowersDay24Regular,
  WeatherSnowflake24Regular,
  Temperature24Regular,
} from '@fluentui/react-icons';
import type { WeatherForecast } from '../types/infrastructure';

// ============================================
// Types
// ============================================

interface DataPoint {
  date: string;
  value: number;
  predicted?: boolean;
}

interface PredictiveChartProps {
  title: string;
  data: DataPoint[];
  predictedData?: DataPoint[];
  unit?: string;
  height?: number;
  showTrend?: boolean;
  thresholds?: {
    warning: number;
    critical: number;
  };
  weather?: WeatherForecast[];
}

// ============================================
// Helper Functions
// ============================================

function calculateTrend(data: DataPoint[]): { slope: number; direction: 'up' | 'down' | 'stable' } {
  if (data.length < 2) return { slope: 0, direction: 'stable' };
  
  const n = data.length;
  const sumX = data.reduce((sum, _, i) => sum + i, 0);
  const sumY = data.reduce((sum, d) => sum + d.value, 0);
  const sumXY = data.reduce((sum, d, i) => sum + i * d.value, 0);
  const sumX2 = data.reduce((sum, _, i) => sum + i * i, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  return {
    slope,
    direction: slope > 0.5 ? 'up' : slope < -0.5 ? 'down' : 'stable'
  };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================
// Chart Component
// ============================================

export const PredictiveChart: React.FC<PredictiveChartProps> = ({
  title,
  data,
  predictedData = [],
  unit = '',
  height = 200,
  showTrend = true,
  thresholds,
  weather
}) => {
  const allData = useMemo(() => {
    const combined = [...data];
    predictedData.forEach(p => {
      combined.push({ ...p, predicted: true });
    });
    return combined;
  }, [data, predictedData]);

  const { minVal, maxVal, points, predictedPoints, trendLine } = useMemo(() => {
    if (allData.length === 0) {
      return { minVal: 0, maxVal: 100, points: '', predictedPoints: '', trendLine: '' };
    }

    const values = allData.map(d => d.value);
    const min = Math.min(...values) * 0.9;
    const max = Math.max(...values) * 1.1;
    const range = max - min || 1;

    const chartWidth = 100;
    const chartHeight = height - 40;

    // Generate SVG path for actual data
    const actualData = allData.filter(d => !d.predicted);
    const actualPoints = actualData.map((d, i) => {
      const x = (i / Math.max(allData.length - 1, 1)) * chartWidth;
      const y = chartHeight - ((d.value - min) / range) * chartHeight;
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    // Generate SVG path for predicted data
    const predData = allData.filter(d => d.predicted);
    const predStartIndex = actualData.length - 1;
    let predPoints = '';
    
    if (predData.length > 0 && actualData.length > 0) {
      const lastActual = actualData[actualData.length - 1];
      const lastX = (predStartIndex / Math.max(allData.length - 1, 1)) * chartWidth;
      const lastY = chartHeight - ((lastActual.value - min) / range) * chartHeight;
      predPoints = `M ${lastX} ${lastY}`;
      
      predData.forEach((d, i) => {
        const x = ((predStartIndex + i + 1) / Math.max(allData.length - 1, 1)) * chartWidth;
        const y = chartHeight - ((d.value - min) / range) * chartHeight;
        predPoints += ` L ${x} ${y}`;
      });
    }

    // Calculate trend line
    const trend = calculateTrend(actualData);
    const trendStartY = chartHeight - ((actualData[0]?.value - min) / range) * chartHeight;
    const trendEndY = trendStartY - (trend.slope * (actualData.length - 1) * 5);
    const trendPath = `M 0 ${trendStartY} L ${(actualData.length - 1) / Math.max(allData.length - 1, 1) * chartWidth} ${trendEndY}`;

    return {
      minVal: min,
      maxVal: max,
      points: actualPoints,
      predictedPoints: predPoints,
      trendLine: showTrend ? trendPath : ''
    };
  }, [allData, height, showTrend]);

  const trend = useMemo(() => calculateTrend(data), [data]);

  const latestValue = allData[allData.length - 1]?.value || 0;
  const isWarning = thresholds && latestValue >= thresholds.warning;
  const isCritical = thresholds && latestValue >= thresholds.critical;

  return (
    <Card className="predictive-chart">
      <div className="chart-header">
        <div className="chart-title-row">
          <Text weight="semibold" size={400}>{title}</Text>
          {showTrend && (
            <Badge
              appearance="filled"
              color={trend.direction === 'up' ? 'danger' : trend.direction === 'down' ? 'success' : 'informative'}
              icon={<ArrowTrending24Regular />}
              style={{
                transform: trend.direction === 'down' ? 'scaleY(-1)' : 'none'
              }}
            >
              {trend.direction === 'up' ? 'Increasing' : trend.direction === 'down' ? 'Decreasing' : 'Stable'}
            </Badge>
          )}
        </div>
        <div className="chart-value">
          <Text size={700} weight="bold">
            {latestValue.toFixed(0)}{unit}
          </Text>
          {isCritical && <Warning24Regular className="status-critical" />}
          {isWarning && !isCritical && <Warning24Regular className="status-warning" />}
          {!isWarning && <Checkmark24Regular className="status-good" />}
        </div>
      </div>

      <div className="chart-container" style={{ height: `${height}px` }}>
        <svg
          viewBox={`-5 -5 110 ${height - 30}`}
          preserveAspectRatio="none"
          className="chart-svg"
        >
          {/* Grid lines */}
          <g className="grid-lines">
            {[0, 25, 50, 75, 100].map(pct => (
              <line
                key={pct}
                x1="0"
                y1={`${(height - 40) * (1 - pct / 100)}`}
                x2="100"
                y2={`${(height - 40) * (1 - pct / 100)}`}
                stroke="var(--colorNeutralStroke3)"
                strokeWidth="0.5"
                strokeDasharray="2,2"
              />
            ))}
          </g>

          {/* Threshold lines */}
          {thresholds && (
            <g className="threshold-lines">
              <line
                x1="0"
                y1={`${(height - 40) * (1 - (thresholds.warning - minVal) / (maxVal - minVal))}`}
                x2="100"
                y2={`${(height - 40) * (1 - (thresholds.warning - minVal) / (maxVal - minVal))}`}
                stroke="var(--colorPaletteYellowBorder1)"
                strokeWidth="1"
                strokeDasharray="4,2"
              />
              <line
                x1="0"
                y1={`${(height - 40) * (1 - (thresholds.critical - minVal) / (maxVal - minVal))}`}
                x2="100"
                y2={`${(height - 40) * (1 - (thresholds.critical - minVal) / (maxVal - minVal))}`}
                stroke="var(--colorPaletteRedBorder1)"
                strokeWidth="1"
                strokeDasharray="4,2"
              />
            </g>
          )}

          {/* Trend line */}
          {trendLine && (
            <path
              d={trendLine}
              fill="none"
              stroke="var(--colorNeutralStroke2)"
              strokeWidth="1"
              strokeDasharray="4,4"
              opacity="0.5"
            />
          )}

          {/* Actual data line */}
          <path
            d={points}
            fill="none"
            stroke="var(--colorBrandForeground1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Predicted data line (dashed) */}
          {predictedPoints && (
            <path
              d={predictedPoints}
              fill="none"
              stroke="var(--colorBrandForeground2)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="6,3"
              opacity="0.7"
            />
          )}

          {/* Data points */}
          {allData.map((d, i) => {
            const x = (i / Math.max(allData.length - 1, 1)) * 100;
            const y = (height - 40) - ((d.value - minVal) / (maxVal - minVal)) * (height - 40);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill={d.predicted ? 'var(--colorBrandForeground2)' : 'var(--colorBrandForeground1)'}
                stroke="var(--colorNeutralBackground1)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>

        {/* X-axis labels */}
        <div className="chart-x-labels">
          {allData.filter((_, i) => i % Math.ceil(allData.length / 5) === 0 || i === allData.length - 1).map((d, i) => (
            <span key={i} className={d.predicted ? 'predicted' : ''}>
              {formatDate(d.date)}
            </span>
          ))}
        </div>
      </div>

      {/* Weather overlay if provided */}
      {weather && weather.length > 0 && (
        <div className="weather-strip">
          {weather.slice(0, 7).map((w, i) => (
            <Tooltip
              key={i}
              content={`${w.temperature}°F, ${w.condition}, Workability: ${(w.workabilityScore * 100).toFixed(0)}%`}
              relationship="label"
            >
              <div className={`weather-day ${w.workabilityScore < 0.5 ? 'poor' : w.workabilityScore < 0.8 ? 'fair' : 'good'}`}>
                <span className="weather-icon">
                  {w.condition === 'clear' ? <WeatherSunny24Regular style={{ width: 16, height: 16 }} /> : 
                   w.condition === 'cloudy' ? <WeatherCloudy24Regular style={{ width: 16, height: 16 }} /> :
                   w.condition === 'rain' ? <WeatherRainShowersDay24Regular style={{ width: 16, height: 16 }} /> :
                   w.condition === 'snow' ? <WeatherSnowflake24Regular style={{ width: 16, height: 16 }} /> :
                   <Temperature24Regular style={{ width: 16, height: 16 }} />}
                </span>
                <span className="weather-temp">{w.temperature}°</span>
              </div>
            </Tooltip>
          ))}
        </div>
      )}

      {predictedData.length > 0 && (
        <div className="chart-legend">
          <span className="legend-item actual">
            <span className="legend-line"></span>
            Actual
          </span>
          <span className="legend-item predicted">
            <span className="legend-line dashed"></span>
            Predicted
          </span>
        </div>
      )}

      <style>{`
        .predictive-chart {
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          padding: 16px;
        }
        
        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        
        .chart-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .chart-value {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .status-critical { color: var(--colorPaletteRedForeground1); }
        .status-warning { color: var(--colorPaletteYellowForeground1); }
        .status-good { color: var(--colorPaletteGreenForeground1); }
        
        .chart-container {
          position: relative;
          width: 100%;
        }
        
        .chart-svg {
          width: 100%;
          height: calc(100% - 20px);
        }
        
        .chart-x-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: var(--colorNeutralForeground3);
          padding: 4px 0;
        }
        
        .chart-x-labels .predicted {
          color: var(--colorBrandForeground2);
          font-style: italic;
        }
        
        .weather-strip {
          display: flex;
          gap: 4px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--glass-border);
        }
        
        .weather-day {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 4px;
          border-radius: 6px;
          font-size: 11px;
        }
        
        .weather-day.good { background: rgba(0, 200, 83, 0.1); }
        .weather-day.fair { background: rgba(255, 193, 7, 0.1); }
        .weather-day.poor { background: rgba(244, 67, 54, 0.1); }
        
        .weather-icon { font-size: 16px; }
        .weather-temp { color: var(--colorNeutralForeground2); }
        
        .chart-legend {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-top: 8px;
          font-size: 11px;
          color: var(--colorNeutralForeground3);
        }
        
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .legend-line {
          width: 20px;
          height: 2px;
          background: var(--colorBrandForeground1);
        }
        
        .legend-line.dashed {
          background: repeating-linear-gradient(
            90deg,
            var(--colorBrandForeground2) 0px,
            var(--colorBrandForeground2) 6px,
            transparent 6px,
            transparent 9px
          );
        }
      `}</style>
    </Card>
  );
};

export default PredictiveChart;

import React, { useState } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  Button,
  Slider,
  Dropdown,
  Option,
  Divider,
  Card,
  Tooltip,
} from '@fluentui/react-components';
import {
  ArrowTrending24Regular,
  Play24Regular,
  WeatherRainShowersDay24Regular,
  Clock24Regular,
  Warning24Regular,
  WeatherSunny24Regular,
  WeatherCloudy24Regular,
  WeatherSnowflake24Regular,
  Temperature24Regular,
  TargetArrow24Regular,
} from '@fluentui/react-icons';
import type { ScenarioParams, ScenarioResult, WeatherCondition } from '../types/infrastructure';

interface ScenarioSimulatorProps {
  onSimulate: (params: ScenarioParams) => Promise<ScenarioResult>;
  isSimulating?: boolean;
}

/**
 * Scenario Simulator - "What-If" timeline scrubber for predictive modeling
 * 
 * Features:
 * - Temperature change slider
 * - Days ahead projection
 * - Weather condition override
 * - Crew availability adjustment
 * - AI-powered impact predictions
 */
const ScenarioSimulator: React.FC<ScenarioSimulatorProps> = ({
  onSimulate,
  isSimulating = false,
}) => {
  const [params, setParams] = useState<ScenarioParams>({
    temperatureChange: 0,
    daysAhead: 3,
    crewAvailability: 100,
    weatherOverride: undefined,
  });

  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSimulate = async () => {
    const simResult = await onSimulate(params);
    setResult(simResult);
  };

  const weatherOptions: { value: WeatherCondition | 'auto'; label: string; icon: React.ReactNode }[] = [
    { value: 'auto', label: 'Auto (Forecast)', icon: <WeatherSunny24Regular style={{ width: 16, height: 16 }} /> },
    { value: 'clear', label: 'Clear', icon: <WeatherSunny24Regular style={{ width: 16, height: 16 }} /> },
    { value: 'cloudy', label: 'Cloudy', icon: <WeatherCloudy24Regular style={{ width: 16, height: 16 }} /> },
    { value: 'rain', label: 'Rain', icon: <WeatherRainShowersDay24Regular style={{ width: 16, height: 16 }} /> },
    { value: 'snow', label: 'Snow', icon: <WeatherSnowflake24Regular style={{ width: 16, height: 16 }} /> },
    { value: 'freeze_thaw', label: 'Freeze-Thaw Cycle', icon: <Temperature24Regular style={{ width: 16, height: 16 }} /> },
  ];

  const getRiskColor = (risk: string): 'success' | 'warning' | 'danger' => {
    switch (risk) {
      case 'low': return 'success';
      case 'medium': return 'warning';
      case 'high': return 'danger';
      default: return 'warning';
    }
  };

  return (
    <div className="glass-card" style={{
      position: 'fixed',
      bottom: 80,
      left: 360,
      width: isExpanded ? 500 : 280,
      padding: 'var(--spacing-md)',
      zIndex: 999,
      transition: 'all 0.3s ease',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <ArrowTrending24Regular style={{ color: 'var(--accent-purple)' }} />
          <Title3>What-If Simulator</Title3>
          {!isExpanded && (
            <Text size={200} style={{ color: 'var(--colorNeutralForeground3)' }}>
              Click to plan for different scenarios
            </Text>
          )}
        </div>
        <Tooltip content={isExpanded ? "Collapse simulator" : "Open simulator to test scenarios like temperature changes or crew shortages"} relationship="description">
          <Badge appearance="outline" style={{ cursor: 'pointer' }}>
            {isExpanded ? 'Collapse' : 'Try a Scenario'}
          </Badge>
        </Tooltip>
      </div>

      {isExpanded && (
        <>
          <Divider style={{ margin: 'var(--spacing-md) 0' }} />

          {/* User Guidance */}
          <div style={{
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-sm)',
            marginBottom: 'var(--spacing-md)',
          }}>
            <Text size={200}>
              <strong>How to use:</strong> Adjust the sliders below to simulate different conditions, then click "Run Simulation" to see AI predictions.
            </Text>
          </div>

          {/* Simulation Controls */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 'var(--spacing-md)',
          }}>
            {/* Temperature Change */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)' }}>
                <Text weight="semibold" size={200}>Temperature Change</Text>
                <Tooltip content="Simulate temperature variations" relationship="description">
                  <Caption1 style={{ color: 'var(--accent-primary)' }}>ⓘ</Caption1>
                </Tooltip>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <Slider
                  min={-30}
                  max={30}
                  step={5}
                  value={params.temperatureChange}
                  onChange={(_, data) => setParams(p => ({ ...p, temperatureChange: data.value }))}
                  style={{ flex: 1 }}
                />
                <Badge
                  appearance="filled"
                  color={params.temperatureChange < 0 ? 'informative' : params.temperatureChange > 0 ? 'danger' : 'subtle'}
                  style={{ minWidth: 50, textAlign: 'center' }}
                >
                  {params.temperatureChange > 0 ? '+' : ''}{params.temperatureChange}°F
                </Badge>
              </div>
            </div>

            {/* Days Ahead */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)' }}>
                <Clock24Regular style={{ fontSize: 14 }} />
                <Text weight="semibold" size={200}>Days Ahead</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <Slider
                  min={1}
                  max={14}
                  step={1}
                  value={params.daysAhead}
                  onChange={(_, data) => setParams(p => ({ ...p, daysAhead: data.value }))}
                  style={{ flex: 1 }}
                />
                <Badge appearance="outline" style={{ minWidth: 50, textAlign: 'center' }}>
                  {params.daysAhead} days
                </Badge>
              </div>
            </div>

            {/* Crew Availability */}
            <div>
              <Text weight="semibold" size={200} style={{ display: 'block', marginBottom: 'var(--spacing-xs)' }}>
                Crew Availability
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                <Slider
                  min={25}
                  max={100}
                  step={25}
                  value={params.crewAvailability}
                  onChange={(_, data) => setParams(p => ({ ...p, crewAvailability: data.value }))}
                  style={{ flex: 1 }}
                />
                <Badge
                  appearance="filled"
                  color={params.crewAvailability >= 75 ? 'success' : params.crewAvailability >= 50 ? 'warning' : 'danger'}
                  style={{ minWidth: 50, textAlign: 'center' }}
                >
                  {params.crewAvailability}%
                </Badge>
              </div>
            </div>

            {/* Weather Override */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)', marginBottom: 'var(--spacing-xs)' }}>
                <WeatherRainShowersDay24Regular style={{ fontSize: 14 }} />
                <Text weight="semibold" size={200}>Weather Override</Text>
              </div>
              <Dropdown
                placeholder="Select weather"
                value={params.weatherOverride || 'auto'}
                onOptionSelect={(_, data) => {
                  const value = data.optionValue as WeatherCondition | 'auto';
                  setParams(p => ({
                    ...p,
                    weatherOverride: value === 'auto' ? undefined : value,
                  }));
                }}
              >
                {weatherOptions.map(opt => (
                  <Option key={opt.value} value={opt.value} text={`${opt.icon} ${opt.label}`}>
                    {opt.icon} {opt.label}
                  </Option>
                ))}
              </Dropdown>
            </div>
          </div>

          {/* Simulate Button */}
          <Button
            appearance="primary"
            icon={<Play24Regular />}
            onClick={handleSimulate}
            disabled={isSimulating}
            style={{ width: '100%', marginTop: 'var(--spacing-md)' }}
          >
            {isSimulating ? 'Simulating...' : 'Run Simulation'}
          </Button>

          {/* Results */}
          {result && (
            <>
              <Divider style={{ margin: 'var(--spacing-md) 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Title3>Prediction Results</Title3>
                  <Badge appearance="filled" color={getRiskColor(result.riskLevel)}>
                    {result.riskLevel.toUpperCase()} RISK
                  </Badge>
                </div>

                {/* Impact Metrics */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 'var(--spacing-sm)',
                }}>
                  <Card style={{ padding: 'var(--spacing-sm)', textAlign: 'center' }}>
                    <Text size={600} weight="bold">{result.predictedWorkOrders}</Text>
                    <Caption1 style={{ display: 'block', color: 'var(--text-muted)' }}>
                      Predicted Issues
                    </Caption1>
                  </Card>
                  <Card style={{ padding: 'var(--spacing-sm)', textAlign: 'center' }}>
                    <Text size={600} weight="bold">{result.crewsRequired}</Text>
                    <Caption1 style={{ display: 'block', color: 'var(--text-muted)' }}>
                      Crews Needed
                    </Caption1>
                  </Card>
                  <Card style={{ padding: 'var(--spacing-sm)', textAlign: 'center' }}>
                    <Text size={600} weight="bold" style={{
                      color: result.budgetImpact > 0 ? 'var(--priority-high)' : 'var(--accent-success)',
                    }}>
                      {result.budgetImpact > 0 ? '+' : ''}{result.budgetImpact}%
                    </Text>
                    <Caption1 style={{ display: 'block', color: 'var(--text-muted)' }}>
                      Budget Impact
                    </Caption1>
                  </Card>
                </div>

                {/* Recommendations */}
                {result.recommendations.length > 0 && (
                  <div style={{ marginTop: 'var(--spacing-sm)' }}>
                    <Caption1 style={{ color: 'var(--text-muted)', marginBottom: 'var(--spacing-xs)', display: 'block' }}>
                      AI Recommendations
                    </Caption1>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                      {result.recommendations.slice(0, 3).map((rec, index) => (
                        <div
                          key={index}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 'var(--spacing-xs)',
                            padding: 'var(--spacing-xs)',
                            background: 'var(--glass-bg)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <Warning24Regular style={{ color: 'var(--accent-warning)', fontSize: 16, flexShrink: 0 }} />
                          <Caption1>{rec}</Caption1>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ScenarioSimulator;

import React from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  ProgressBar,
  Divider,
  Tooltip,
} from '@fluentui/react-components';
import {
  People24Regular,
  VehicleTruckProfile24Regular,
  Wrench24Regular,
  ArrowTrending24Regular,
  RoadCone24Regular,
  PersonWalking24Regular,
  Building24Regular,
} from '@fluentui/react-icons';
import type { CrewEstimation, Crew } from '../types/infrastructure';

interface CrewDashboardProps {
  crews: Crew[];
  estimation: CrewEstimation | null;
  isLoading?: boolean;
}

/**
 * Crew Dashboard - Glassmorphism panel showing crew capacity and AI-estimated requirements
 * 
 * Features:
 * - Current crew status visualization
 * - AI-estimated crew requirements with reasoning
 * - Capacity utilization bars
 * - Factor breakdown
 */
const CrewDashboard: React.FC<CrewDashboardProps> = ({
  crews,
  estimation,
  isLoading = false,
}) => {
  const availableCrews = crews.filter(c => c.status === 'available').length;
  const assignedCrews = crews.filter(c => c.status === 'assigned').length;
  const totalCrews = crews.length;

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'available': return 'var(--accent-success)';
      case 'assigned': return 'var(--accent-primary)';
      case 'on_break': return 'var(--accent-warning)';
      default: return 'var(--text-muted)';
    }
  };

  const getSpecializationIcon = (spec: string): React.ReactNode => {
    switch (spec) {
      case 'pothole': return <RoadCone24Regular style={{ fontSize: 16 }} />;
      case 'sidewalk': return <PersonWalking24Regular style={{ fontSize: 16 }} />;
      case 'concrete': return <Building24Regular style={{ fontSize: 16 }} />;
      default: return <Wrench24Regular style={{ fontSize: 16 }} />;
    }
  };

  return (
    <div className="crew-dashboard glass-panel fade-in" style={{
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--spacing-lg)',
      gap: 'var(--spacing-md)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <People24Regular style={{ color: 'var(--accent-primary)' }} />
          <Title2>Crew Capacity</Title2>
        </div>
        <Badge appearance="filled" color="success">
          {availableCrews} Available
        </Badge>
      </div>

      <Divider />

      {/* Crew Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--spacing-sm)',
      }}>
        <CrewStatCard
          label="Available"
          value={availableCrews}
          color="var(--accent-success)"
        />
        <CrewStatCard
          label="Assigned"
          value={assignedCrews}
          color="var(--accent-primary)"
        />
        <CrewStatCard
          label="Total"
          value={totalCrews}
          color="var(--text-secondary)"
        />
      </div>

      {/* AI Estimation */}
      {estimation && (
        <>
          <Divider />
          
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)',
            }}>
              <ArrowTrending24Regular style={{ color: 'var(--accent-purple)' }} />
              <Title3>AI Crew Estimation</Title3>
              <Tooltip content={`${Math.round(estimation.confidence * 100)}% confidence`} relationship="label">
                <Badge appearance="tint" color="brand">
                  {Math.round(estimation.confidence * 100)}%
                </Badge>
              </Tooltip>
            </div>

            {/* Crew Type Breakdown */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-sm)',
            }}>
              <CrewTypeRow
                icon={<RoadCone24Regular />}
                label="Pothole Crews"
                required={estimation.potholeCrew}
                available={crews.filter(c => c.specialization === 'pothole' && c.status === 'available').length}
              />
              <CrewTypeRow
                icon={<PersonWalking24Regular />}
                label="Sidewalk Crews"
                required={estimation.sidewalkCrews}
                available={crews.filter(c => c.specialization === 'sidewalk' && c.status === 'available').length}
              />
              <CrewTypeRow
                icon={<Building24Regular />}
                label="Concrete Crews"
                required={estimation.concreteCrews}
                available={crews.filter(c => c.specialization === 'concrete' && c.status === 'available').length}
              />
            </div>

            {/* Total Required */}
            <div style={{
              marginTop: 'var(--spacing-md)',
              padding: 'var(--spacing-sm)',
              background: 'var(--glass-bg)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <Text weight="semibold">Total Required</Text>
              <Text weight="bold" size={500} style={{
                color: estimation.totalCrews > availableCrews
                  ? 'var(--priority-high)'
                  : 'var(--accent-success)',
              }}>
                {estimation.totalCrews} Crews
              </Text>
            </div>

            {/* Factors */}
            {estimation.factors.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-md)' }}>
                <Caption1 style={{ color: 'var(--text-muted)', marginBottom: 'var(--spacing-xs)', display: 'block' }}>
                  Key Factors
                </Caption1>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                  {estimation.factors.slice(0, 4).map((factor, index) => (
                    <Tooltip key={index} content={`Weight: ${Math.round(factor.weight * 100)}%`} relationship="label">
                      <Badge
                        appearance="tint"
                        color={factor.impact === 'positive' ? 'success' : factor.impact === 'negative' ? 'danger' : 'informative'}
                      >
                        {factor.name}
                      </Badge>
                    </Tooltip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Crew List Preview */}
      {crews.length > 0 && (
        <>
          <Divider />
          
          <div>
            <Caption1 style={{ color: 'var(--text-muted)', marginBottom: 'var(--spacing-sm)', display: 'block' }}>
              Active Crews
            </Caption1>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-xs)',
              maxHeight: 120,
              overflowY: 'auto',
            }}>
              {crews.slice(0, 5).map((crew) => (
                <div
                  key={crew.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    background: 'var(--glass-bg)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span>{getSpecializationIcon(crew.specialization)}</span>
                    <Text size={200}>{crew.name}</Text>
                  </div>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: getStatusColor(crew.status),
                  }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================
// Sub-components
// ============================================

interface CrewStatCardProps {
  label: string;
  value: number;
  color: string;
}

const CrewStatCard: React.FC<CrewStatCardProps> = ({ label, value, color }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: 'var(--spacing-sm)',
    background: 'var(--glass-bg)',
    borderRadius: 'var(--radius-sm)',
  }}>
    <Text size={600} weight="bold" style={{ color }}>
      {value}
    </Text>
    <Caption1 style={{ color: 'var(--text-muted)' }}>{label}</Caption1>
  </div>
);

interface CrewTypeRowProps {
  icon: React.ReactNode;
  label: string;
  required: number;
  available: number;
}

const CrewTypeRow: React.FC<CrewTypeRowProps> = ({ icon, label, required, available }) => {
  const isSufficient = available >= required;
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)',
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 2,
        }}>
          <Caption1>{label}</Caption1>
          <Caption1 style={{
            color: isSufficient ? 'var(--accent-success)' : 'var(--priority-high)',
          }}>
            {available}/{required}
          </Caption1>
        </div>
        <ProgressBar
          value={Math.min(available / Math.max(required, 1), 1)}
          color={isSufficient ? 'success' : 'warning'}
          thickness="medium"
        />
      </div>
    </div>
  );
};

export default CrewDashboard;

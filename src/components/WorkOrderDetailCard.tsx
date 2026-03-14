/**
 * MAINTAIN AI — Work Order Detail Card
 *
 * Floating card that appears when a work order is selected in the table.
 * Shows a mini map preview, work order details, and quick action buttons.
 * Inspired by Ruixen Analytics floating card design.
 */

import React, { useEffect, useRef } from 'react';
import {
  Text,
  Caption1,
  Badge,
  Button,
  Tooltip,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Map24Regular,
  Send24Regular,
  Edit24Regular,
  Warning24Regular,
  Location24Regular,
  Clock24Regular,
  Money24Regular,
  VehicleTruckProfile24Regular,
  ArrowExpand24Regular,
  CheckmarkCircle24Regular,
} from '@fluentui/react-icons';

import type { WorkOrder, Crew } from '../types/infrastructure';

interface WorkOrderDetailCardProps {
  workOrder: WorkOrder;
  crews: Crew[];
  onClose: () => void;
  onViewOnMap: (wo: WorkOrder) => void;
  onDispatchCrew: (woId: string) => void;
  onEdit?: (wo: WorkOrder) => void;
  theme: string;
}

const severityConfig: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', label: 'Critical' },
  high:     { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', label: 'High' },
  medium:   { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', label: 'Medium' },
  low:      { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', label: 'Low' },
};

const typeLabels: Record<string, string> = {
  pothole: 'Pothole',
  sidewalk: 'Sidewalk',
  concrete: 'Concrete',
};

const WorkOrderDetailCard: React.FC<WorkOrderDetailCardProps> = ({
  workOrder,
  crews,
  onClose,
  onViewOnMap,
  onDispatchCrew,
  onEdit,
  theme,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const sev = severityConfig[workOrder.severity] || severityConfig.medium;
  const assignedCrew = crews.find(c => c.id === workOrder.assignedCrewId);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // OSM static tile for mini map preview
  const zoom = 16;
  const lat = workOrder.latitude;
  const lng = workOrder.longitude;
  // Convert lat/lng to tile coordinates
  const n = Math.pow(2, zoom);
  const tileX = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const tileY = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  const tileUrl = `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;

  const daysSinceCreated = Math.max(1, Math.round((Date.now() - new Date(workOrder.createdAt).getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="wo-detail-card-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        className="wo-detail-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button className="wo-detail-close" onClick={onClose}>
          <Dismiss24Regular />
        </button>

        {/* Severity accent bar */}
        <div className="wo-detail-accent" style={{ background: sev.color }} />

        {/* Map Preview */}
        <div className="wo-detail-map" onClick={() => onViewOnMap(workOrder)}>
          <img
            src={tileUrl}
            alt="Map location"
            className="wo-detail-map-img"
            onError={(e) => {
              // Fallback: hide img, show gradient
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="wo-detail-map-overlay">
            <div className="wo-detail-map-pin">
              <Location24Regular style={{ width: 20, height: 20 }} />
            </div>
            <span className="wo-detail-map-label">Click to view on map</span>
          </div>
          <div className="wo-detail-map-coords">
            {lat.toFixed(4)}°N, {Math.abs(lng).toFixed(4)}°W
          </div>
        </div>

        {/* Content */}
        <div className="wo-detail-body">
          {/* Header */}
          <div className="wo-detail-header">
            <div>
              <Text weight="bold" size={400} style={{ display: 'block', lineHeight: 1.3, color: 'var(--text-primary)' }}>
                {workOrder.title}
              </Text>
              <Caption1 style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                {workOrder.address}
              </Caption1>
            </div>
          </div>

          {/* Tags row */}
          <div className="wo-detail-tags">
            <Badge
              appearance="filled"
              style={{ background: sev.bg, color: sev.color, fontWeight: 700, fontSize: 11 }}
            >
              {sev.label}
            </Badge>
            <Badge
              appearance="filled"
              style={{ background: 'var(--glass-bg)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 11 }}
            >
              {typeLabels[workOrder.issueType] || workOrder.issueType}
            </Badge>
            <Badge
              appearance="filled"
              style={{
                background: workOrder.status === 'open' ? 'rgba(59, 130, 246, 0.12)' : workOrder.status === 'assigned' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                color: workOrder.status === 'open' ? '#3b82f6' : workOrder.status === 'assigned' ? '#f59e0b' : '#22c55e',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {workOrder.status === 'in_progress' ? 'In Progress' : workOrder.status.charAt(0).toUpperCase() + workOrder.status.slice(1)}
            </Badge>
            {workOrder.nearSchool && (
              <Badge
                appearance="filled"
                style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', fontWeight: 600, fontSize: 11 }}
              >
                <Warning24Regular style={{ width: 12, height: 12, marginRight: 2 }} /> Near School
              </Badge>
            )}
          </div>

          {/* Info grid */}
          <div className="wo-detail-grid">
            <div className="wo-detail-info-item">
              <Money24Regular style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
              <div>
                <Caption1 style={{ color: 'var(--text-muted)', fontSize: 10 }}>Estimated Cost</Caption1>
                <Text weight="semibold" size={200}>${workOrder.estimatedCost.toLocaleString()}</Text>
              </div>
            </div>
            <div className="wo-detail-info-item">
              <Clock24Regular style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
              <div>
                <Caption1 style={{ color: 'var(--text-muted)', fontSize: 10 }}>Created</Caption1>
                <Text weight="semibold" size={200}>
                  {new Date(workOrder.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ({daysSinceCreated}d ago)
                </Text>
              </div>
            </div>
            <div className="wo-detail-info-item">
              <Warning24Regular style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
              <div>
                <Caption1 style={{ color: 'var(--text-muted)', fontSize: 10 }}>Priority Score</Caption1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text weight="semibold" size={200}>{workOrder.priorityScore}</Text>
                  <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${workOrder.priorityScore}%`, height: '100%', borderRadius: 2,
                      background: workOrder.priorityScore >= 75 ? '#ef4444' : workOrder.priorityScore >= 50 ? '#f59e0b' : '#22c55e',
                    }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="wo-detail-info-item">
              <VehicleTruckProfile24Regular style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
              <div>
                <Caption1 style={{ color: 'var(--text-muted)', fontSize: 10 }}>Assigned Crew</Caption1>
                <Text weight="semibold" size={200} style={{ color: assignedCrew ? '#22c55e' : 'var(--text-secondary)' }}>
                  {assignedCrew ? assignedCrew.name : 'Unassigned'}
                </Text>
              </div>
            </div>
          </div>

          {/* Description */}
          {workOrder.description && (
            <div className="wo-detail-desc">
              <Caption1 style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {workOrder.description.length > 120 ? workOrder.description.substring(0, 120) + '...' : workOrder.description}
              </Caption1>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="wo-detail-actions">
          <Tooltip content="Open full map view" relationship="label">
            <Button
              appearance="subtle"
              icon={<ArrowExpand24Regular />}
              onClick={() => onViewOnMap(workOrder)}
              className="wo-detail-btn"
            >
              Map
            </Button>
          </Tooltip>
          {workOrder.status === 'open' && (
            <Tooltip content="Dispatch a crew to this work order" relationship="label">
              <Button
                appearance="primary"
                icon={<Send24Regular />}
                onClick={() => onDispatchCrew(workOrder.id)}
                className="wo-detail-btn"
              >
                Assign Crew
              </Button>
            </Tooltip>
          )}
          {workOrder.status === 'assigned' && (
            <div className="wo-detail-assigned-badge">
              <CheckmarkCircle24Regular style={{ width: 14, height: 14, color: '#22c55e' }} />
              <Caption1 style={{ color: '#22c55e', fontWeight: 600 }}>Crew Assigned</Caption1>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkOrderDetailCard;

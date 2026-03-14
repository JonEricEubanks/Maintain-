import React, { useState, useMemo, useCallback } from 'react';

// ============================================
// STATIC GRID MAP - NO EXTERNAL DEPENDENCIES
// All data is embedded directly - no API calls
// ============================================

interface WorkOrderMarker {
  id: string;
  title: string;
  address: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issueType: string;
  status: string;
  gridX: number; // 0-9 column
  gridY: number; // 0-9 row
}

interface CrewMarker {
  id: string;
  name: string;
  status: 'available' | 'assigned' | 'offline';
  gridX: number;
  gridY: number;
}

// EMBEDDED STATIC DATA - Lake Forest, IL work orders
const STATIC_WORK_ORDERS: WorkOrderMarker[] = [
  { id: 'WO-001', title: 'Water Main Break', address: '123 Deerpath Rd', severity: 'critical', issueType: 'Water', status: 'open', gridX: 2, gridY: 1 },
  { id: 'WO-002', title: 'Pothole Repair', address: '456 Western Ave', severity: 'high', issueType: 'Road', status: 'open', gridX: 4, gridY: 2 },
  { id: 'WO-003', title: 'Street Light Out', address: '789 Illinois Rd', severity: 'medium', issueType: 'Electrical', status: 'in_progress', gridX: 6, gridY: 1 },
  { id: 'WO-004', title: 'Sewer Backup', address: '321 Sheridan Rd', severity: 'critical', issueType: 'Sewer', status: 'open', gridX: 8, gridY: 3 },
  { id: 'WO-005', title: 'Sidewalk Crack', address: '654 McKinley Rd', severity: 'low', issueType: 'Sidewalk', status: 'open', gridX: 3, gridY: 4 },
  { id: 'WO-006', title: 'Traffic Signal', address: '987 Waukegan Rd', severity: 'high', issueType: 'Traffic', status: 'open', gridX: 5, gridY: 3 },
  { id: 'WO-007', title: 'Tree Removal', address: '147 Laurel Ave', severity: 'medium', issueType: 'Parks', status: 'open', gridX: 1, gridY: 5 },
  { id: 'WO-008', title: 'Fire Hydrant', address: '258 Conway Farms Dr', severity: 'high', issueType: 'Water', status: 'open', gridX: 7, gridY: 4 },
  { id: 'WO-009', title: 'Storm Drain Clog', address: '369 Green Bay Rd', severity: 'medium', issueType: 'Drainage', status: 'in_progress', gridX: 4, gridY: 6 },
  { id: 'WO-010', title: 'Gas Leak Report', address: '741 Telegraph Rd', severity: 'critical', issueType: 'Gas', status: 'open', gridX: 2, gridY: 7 },
  { id: 'WO-011', title: 'Graffiti Removal', address: '852 Market Square', severity: 'low', issueType: 'Vandalism', status: 'open', gridX: 5, gridY: 5 },
  { id: 'WO-012', title: 'Fallen Sign', address: '963 Academy Dr', severity: 'medium', issueType: 'Signs', status: 'open', gridX: 8, gridY: 6 },
  { id: 'WO-013', title: 'Water Pressure', address: '159 Washington Cir', severity: 'high', issueType: 'Water', status: 'open', gridX: 1, gridY: 2 },
  { id: 'WO-014', title: 'Guardrail Damage', address: '357 Route 41', severity: 'high', issueType: 'Road', status: 'open', gridX: 9, gridY: 1 },
  { id: 'WO-015', title: 'Park Bench Repair', address: '468 Forest Park', severity: 'low', issueType: 'Parks', status: 'open', gridX: 6, gridY: 7 },
  { id: 'WO-016', title: 'Manhole Cover', address: '579 Old Elm Rd', severity: 'critical', issueType: 'Sewer', status: 'open', gridX: 3, gridY: 8 },
  { id: 'WO-017', title: 'Crosswalk Paint', address: '680 School Ln', severity: 'medium', issueType: 'Road', status: 'open', gridX: 7, gridY: 8 },
  { id: 'WO-018', title: 'Fountain Repair', address: '791 Town Center', severity: 'low', issueType: 'Parks', status: 'open', gridX: 5, gridY: 9 },
  { id: 'WO-019', title: 'Cable Box Down', address: '802 Ridge Rd', severity: 'medium', issueType: 'Utilities', status: 'open', gridX: 0, gridY: 4 },
  { id: 'WO-020', title: 'Flooding Issue', address: '913 Lake Rd', severity: 'high', issueType: 'Drainage', status: 'open', gridX: 9, gridY: 5 },
];

const STATIC_CREWS: CrewMarker[] = [
  { id: 'C-01', name: 'Alpha Team', status: 'available', gridX: 2, gridY: 3 },
  { id: 'C-02', name: 'Beta Team', status: 'assigned', gridX: 6, gridY: 2 },
  { id: 'C-03', name: 'Delta Team', status: 'available', gridX: 4, gridY: 7 },
  { id: 'C-04', name: 'Gamma Team', status: 'offline', gridX: 8, gridY: 5 },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

const STATUS_COLORS: Record<string, string> = {
  available: '#22c55e',
  assigned: '#f97316',
  offline: '#6b7280',
};

interface StaticGridMapProps {
  theme?: 'light' | 'dark';
  onWorkOrderSelect?: (id: string | null) => void;
}

const StaticGridMap: React.FC<StaticGridMapProps> = ({ 
  theme = 'light',
  onWorkOrderSelect 
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);

  const isDark = theme === 'dark';
  
  const colors = useMemo(() => ({
    bg: isDark ? '#0f172a' : '#f8fafc',
    gridLine: isDark ? '#334155' : '#e2e8f0',
    text: isDark ? '#f1f5f9' : '#1e293b',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    cellBg: isDark ? '#1e293b' : '#ffffff',
    cellHover: isDark ? '#334155' : '#f1f5f9',
    border: isDark ? '#475569' : '#cbd5e1',
    header: isDark ? '#1e293b' : '#e2e8f0',
  }), [isDark]);

  const filteredWorkOrders = useMemo(() => {
    if (!filterSeverity) return STATIC_WORK_ORDERS;
    return STATIC_WORK_ORDERS.filter(wo => wo.severity === filterSeverity);
  }, [filterSeverity]);

  const handleWorkOrderClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
    onWorkOrderSelect?.(selectedId === id ? null : id);
  }, [selectedId, onWorkOrderSelect]);

  const selectedWorkOrder = useMemo(() => 
    STATIC_WORK_ORDERS.find(wo => wo.id === selectedId), 
    [selectedId]
  );

  const hoveredWorkOrder = useMemo(() => 
    STATIC_WORK_ORDERS.find(wo => wo.id === hoveredId), 
    [hoveredId]
  );

  // Grid dimensions
  const GRID_SIZE = 10;
  const CELL_SIZE = 60;
  const HEADER_HEIGHT = 30;
  const LABEL_WIDTH = 30;

  // Street names for axes
  const xLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const yLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: colors.bg,
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: colors.header,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontWeight: 600, color: colors.text, fontSize: '14px' }}>
            Lake Forest Infrastructure Map
          </span>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setFilterSeverity(null)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              background: filterSeverity === null ? '#3b82f6' : colors.cellBg,
              color: filterSeverity === null ? '#fff' : colors.textMuted,
            }}
          >
            All ({STATIC_WORK_ORDERS.length})
          </button>
          {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
            const count = STATIC_WORK_ORDERS.filter(wo => wo.severity === sev).length;
            return (
              <button
                key={sev}
                onClick={() => setFilterSeverity(filterSeverity === sev ? null : sev)}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: filterSeverity === sev ? SEVERITY_COLORS[sev] : colors.cellBg,
                  color: filterSeverity === sev ? '#fff' : colors.textMuted,
                }}
              >
                {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Grid map */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px',
        }}>
          <svg
            width={LABEL_WIDTH + GRID_SIZE * CELL_SIZE + 2}
            height={HEADER_HEIGHT + GRID_SIZE * CELL_SIZE + 2}
            style={{ display: 'block' }}
          >
            {/* Column headers */}
            {xLabels.map((label, i) => (
              <text
                key={`col-${i}`}
                x={LABEL_WIDTH + i * CELL_SIZE + CELL_SIZE / 2}
                y={HEADER_HEIGHT - 8}
                textAnchor="middle"
                fill={colors.textMuted}
                fontSize="12"
                fontWeight="500"
              >
                {label}
              </text>
            ))}

            {/* Row labels */}
            {yLabels.map((label, i) => (
              <text
                key={`row-${i}`}
                x={LABEL_WIDTH - 8}
                y={HEADER_HEIGHT + i * CELL_SIZE + CELL_SIZE / 2 + 4}
                textAnchor="end"
                fill={colors.textMuted}
                fontSize="12"
                fontWeight="500"
              >
                {label}
              </text>
            ))}

            {/* Grid cells */}
            <g transform={`translate(${LABEL_WIDTH}, ${HEADER_HEIGHT})`}>
              {Array.from({ length: GRID_SIZE }).map((_, row) =>
                Array.from({ length: GRID_SIZE }).map((_, col) => (
                  <rect
                    key={`cell-${row}-${col}`}
                    x={col * CELL_SIZE}
                    y={row * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={colors.cellBg}
                    stroke={colors.gridLine}
                    strokeWidth="1"
                  />
                ))
              )}

              {/* Crew markers */}
              {STATIC_CREWS.map(crew => (
                <g key={crew.id} transform={`translate(${crew.gridX * CELL_SIZE + CELL_SIZE / 2}, ${crew.gridY * CELL_SIZE + CELL_SIZE / 2})`}>
                  <rect
                    x="-16"
                    y="-8"
                    width="32"
                    height="16"
                    rx="4"
                    fill={STATUS_COLORS[crew.status]}
                    opacity="0.9"
                  />
                  <text
                    x="0"
                    y="4"
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="9"
                    fontWeight="600"
                  >
                    {crew.name.split(' ')[0]}
                  </text>
                </g>
              ))}

              {/* Work order markers */}
              {filteredWorkOrders.map(wo => {
                const isSelected = wo.id === selectedId;
                const isHovered = wo.id === hoveredId;
                const size = isSelected ? 14 : isHovered ? 12 : 10;

                return (
                  <g
                    key={wo.id}
                    transform={`translate(${wo.gridX * CELL_SIZE + CELL_SIZE / 2}, ${wo.gridY * CELL_SIZE + CELL_SIZE / 2})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleWorkOrderClick(wo.id)}
                    onMouseEnter={() => setHoveredId(wo.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Pulse animation for critical */}
                    {wo.severity === 'critical' && (
                      <circle
                        r={size + 4}
                        fill={SEVERITY_COLORS[wo.severity]}
                        opacity="0.3"
                      >
                        <animate
                          attributeName="r"
                          values={`${size + 4};${size + 10};${size + 4}`}
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0.3;0.1;0.3"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}

                    {/* Selection ring */}
                    {isSelected && (
                      <circle
                        r={size + 3}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                      />
                    )}

                    {/* Main marker */}
                    <circle
                      r={size}
                      fill={SEVERITY_COLORS[wo.severity]}
                      stroke={isDark ? '#1e293b' : '#fff'}
                      strokeWidth="2"
                    />

                    {/* Icon */}
                    <text
                      y="4"
                      textAnchor="middle"
                      fill="#fff"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      {wo.issueType === 'Water' ? 'W' :
                       wo.issueType === 'Road' ? 'R' :
                       wo.issueType === 'Sewer' ? 'S' :
                       wo.issueType === 'Gas' ? 'G' :
                       wo.issueType === 'Electrical' ? 'E' :
                       '●'}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Details panel */}
        <div style={{
          width: '280px',
          borderLeft: `1px solid ${colors.border}`,
          background: colors.cellBg,
          overflow: 'auto',
          flexShrink: 0,
        }}>
          {/* Hover/Selected info */}
          {(hoveredWorkOrder || selectedWorkOrder) && (
            <div style={{
              padding: '16px',
              borderBottom: `1px solid ${colors.border}`,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: SEVERITY_COLORS[(hoveredWorkOrder || selectedWorkOrder)!.severity],
                }} />
                <span style={{
                  fontWeight: 600,
                  color: colors.text,
                  fontSize: '14px',
                }}>
                  {(hoveredWorkOrder || selectedWorkOrder)!.id}
                </span>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: SEVERITY_COLORS[(hoveredWorkOrder || selectedWorkOrder)!.severity] + '20',
                  color: SEVERITY_COLORS[(hoveredWorkOrder || selectedWorkOrder)!.severity],
                  fontWeight: 500,
                }}>
                  {(hoveredWorkOrder || selectedWorkOrder)!.severity.toUpperCase()}
                </span>
              </div>
              <h3 style={{
                margin: '0 0 4px',
                fontSize: '16px',
                color: colors.text,
              }}>
                {(hoveredWorkOrder || selectedWorkOrder)!.title}
              </h3>
              <p style={{
                margin: '0 0 8px',
                fontSize: '13px',
                color: colors.textMuted,
              }}>
                {(hoveredWorkOrder || selectedWorkOrder)!.address}
              </p>
              <div style={{
                display: 'flex',
                gap: '8px',
              }}>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: isDark ? '#334155' : '#f1f5f9',
                  color: colors.textMuted,
                }}>
                  {(hoveredWorkOrder || selectedWorkOrder)!.issueType}
                </span>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: isDark ? '#334155' : '#f1f5f9',
                  color: colors.textMuted,
                }}>
                  {(hoveredWorkOrder || selectedWorkOrder)!.status.replace('_', ' ')}
                </span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div style={{ padding: '16px' }}>
            <h4 style={{
              margin: '0 0 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Priority Legend
            </h4>
            {Object.entries(SEVERITY_COLORS).map(([sev, color]) => (
              <div key={sev} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: color,
                }} />
                <span style={{
                  fontSize: '13px',
                  color: colors.text,
                  textTransform: 'capitalize',
                }}>
                  {sev}
                </span>
              </div>
            ))}

            <h4 style={{
              margin: '16px 0 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Crew Status
            </h4>
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
              }}>
                <div style={{
                  width: '24px',
                  height: '12px',
                  borderRadius: '4px',
                  background: color,
                }} />
                <span style={{
                  fontSize: '13px',
                  color: colors.text,
                  textTransform: 'capitalize',
                }}>
                  {status}
                </span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{
            padding: '16px',
            borderTop: `1px solid ${colors.border}`,
          }}>
            <h4 style={{
              margin: '0 0 12px',
              fontSize: '12px',
              fontWeight: 600,
              color: colors.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Statistics
            </h4>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
            }}>
              <div style={{
                padding: '12px',
                background: isDark ? '#1e293b' : '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#3b82f6' }}>
                  {STATIC_WORK_ORDERS.length}
                </div>
                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                  Work Orders
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: isDark ? '#1e293b' : '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#22c55e' }}>
                  {STATIC_CREWS.filter(c => c.status === 'available').length}
                </div>
                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                  Crews Available
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: isDark ? '#1e293b' : '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#ef4444' }}>
                  {STATIC_WORK_ORDERS.filter(wo => wo.severity === 'critical').length}
                </div>
                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                  Critical
                </div>
              </div>
              <div style={{
                padding: '12px',
                background: isDark ? '#1e293b' : '#f8fafc',
                borderRadius: '8px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#f97316' }}>
                  {STATIC_WORK_ORDERS.filter(wo => wo.status === 'open').length}
                </div>
                <div style={{ fontSize: '11px', color: colors.textMuted }}>
                  Open
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaticGridMap;

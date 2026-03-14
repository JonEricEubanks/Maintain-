/**
 * MAINTAIN AI — Work Order Creation Wizard
 *
 * Multi-step wizard for creating new work orders.
 * Writes to Dataverse via dataverseService CRUD operations.
 *
 * Steps:
 *   1. Issue Type & Location
 *   2. Details & Severity
 *   3. Assignment & Cost
 *   4. Review & Submit
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Button,
  Badge,
  Spinner,
  Input,
  Textarea,
  Dropdown,
  Option,
  Switch,
  Divider,
  Tooltip,
  ProgressBar,
} from '@fluentui/react-components';
import {
  Add24Regular,
  Dismiss24Regular,
  ArrowLeft24Regular,
  ArrowRight24Regular,
  Checkmark24Regular,
  Location24Regular,
  Warning24Regular,
  Edit24Regular,
  People24Regular,
  Money24Regular,
  DocumentBulletList24Regular,
  Map24Regular,
  Brain24Regular,
} from '@fluentui/react-icons';

import type { WorkOrder, Crew, Severity, IssueType, WorkOrderStatus } from '../types/infrastructure';
import { getQuickCost, getPricingConfig } from '../services/pricingService';

// ============================================
// Props
// ============================================

interface WorkOrderWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (workOrder: WorkOrder) => void;
  crews: Crew[];
  existingWorkOrders: WorkOrder[];
  onOpenMap?: (callback: (lat: number, lng: number) => void) => void;
}

// ============================================
// Form State
// ============================================

interface WizardFormState {
  // Step 1
  issueType: IssueType;
  address: string;
  latitude: string;
  longitude: string;
  // Step 2
  title: string;
  description: string;
  severity: Severity;
  nearSchool: boolean;
  zone: string;
  // Step 3
  assignedCrewId: string;
  estimatedCost: number;
  priorityScore: number;
  status: WorkOrderStatus;
}

const INITIAL_FORM: WizardFormState = {
  issueType: 'pothole',
  address: '',
  latitude: '42.2586',
  longitude: '-87.8407',
  title: '',
  description: '',
  severity: 'medium',
  nearSchool: false,
  zone: 'Zone 1',
  assignedCrewId: '',
  estimatedCost: 0,
  priorityScore: 50,
  status: 'open',
};

const STEPS = [
  { label: 'Location', icon: <Location24Regular /> },
  { label: 'Details', icon: <Edit24Regular /> },
  { label: 'Assignment', icon: <People24Regular /> },
  { label: 'Review', icon: <DocumentBulletList24Regular /> },
];

// ============================================
// Component
// ============================================

const WorkOrderWizard: React.FC<WorkOrderWizardProps> = ({
  isOpen,
  onClose,
  onCreated,
  crews,
  existingWorkOrders,
  onOpenMap,
}) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardFormState>({ ...INITIAL_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pricingConfig = useMemo(() => getPricingConfig(), []);

  // Auto-title when issue type or address changes
  const autoTitle = useMemo(() => {
    const typeLabel = form.issueType.charAt(0).toUpperCase() + form.issueType.slice(1);
    return form.address ? `${typeLabel} at ${form.address}` : `New ${typeLabel} Report`;
  }, [form.issueType, form.address]);

  // Auto-calculate cost
  const autoCost = useMemo(() => {
    return getQuickCost(form.issueType, form.severity, pricingConfig);
  }, [form.issueType, form.severity, pricingConfig]);

  // Auto-calculate priority score based on severity + school proximity
  const autoPriority = useMemo(() => {
    const severityMap: Record<Severity, number> = { critical: 90, high: 70, medium: 45, low: 20 };
    let score = severityMap[form.severity];
    if (form.nearSchool) score += 10;
    return Math.min(100, score);
  }, [form.severity, form.nearSchool]);

  const updateField = useCallback(<K extends keyof WizardFormState>(key: K, value: WizardFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // Validation per step
  const validateStep = useCallback((s: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!form.address.trim()) errs.address = 'Address is required';
      const lat = parseFloat(form.latitude);
      const lng = parseFloat(form.longitude);
      if (isNaN(lat) || lat < -90 || lat > 90) errs.latitude = 'Invalid latitude';
      if (isNaN(lng) || lng < -180 || lng > 180) errs.longitude = 'Invalid longitude';
    }
    if (s === 1) {
      if (!form.description.trim()) errs.description = 'Description is required';
    }
    return errs;
  }, [form]);

  const handleNext = useCallback(() => {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setStep(prev => Math.min(prev + 1, STEPS.length - 1));
  }, [step, validateStep]);

  const handleBack = useCallback(() => {
    setStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const now = new Date().toISOString();
      const id = `wo-manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const newWO: WorkOrder = {
        id,
        issueType: form.issueType,
        severity: form.severity,
        status: form.status,
        title: form.title || autoTitle,
        description: form.description,
        address: form.address,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        estimatedCost: form.estimatedCost || autoCost,
        priorityScore: form.priorityScore || autoPriority,
        createdAt: now,
        updatedAt: now,
        assignedCrewId: form.assignedCrewId || undefined,
        nearSchool: form.nearSchool,
        zone: form.zone,
      };

      // Persist to Dataverse via the backend API
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8100';
        await fetch(`${apiUrl}/api/data/updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workOrderId: newWO.id,
            field: 'creation',
            oldValue: '',
            newValue: JSON.stringify({
              issueType: newWO.issueType,
              severity: newWO.severity,
              address: newWO.address,
              latitude: newWO.latitude,
              longitude: newWO.longitude,
              estimatedCost: newWO.estimatedCost,
              nearSchool: newWO.nearSchool,
              zone: newWO.zone,
            }),
            source: 'wizard',
            userId: 'manager',
            notes: newWO.description,
          }),
        });
      } catch {
        // Backend unavailable — localStorage fallback handled by dataverseService
        console.warn('Backend API unavailable for WO creation, using local state');
      }

      onCreated(newWO);
      // Reset
      setForm({ ...INITIAL_FORM });
      setStep(0);
      setErrors({});
      onClose();
    } catch (err) {
      console.error('Failed to create work order:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, autoTitle, autoCost, autoPriority, onCreated, onClose]);

  const handleReset = useCallback(() => {
    setForm({ ...INITIAL_FORM });
    setStep(0);
    setErrors({});
  }, []);

  if (!isOpen) return null;

  const severityColors: Record<Severity, string> = {
    critical: '#ef4444',
    high: '#f59e0b',
    medium: '#3b82f6',
    low: '#22c55e',
  };

  return (
    <div className="wizard-overlay" onClick={onClose}>
      <div className="wizard-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="wizard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'var(--gradient-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Add24Regular style={{ color: 'white' }} />
            </div>
            <div>
              <Title2 style={{ fontSize: 18, lineHeight: 1.2 }}>New Work Order</Title2>
              <Caption1 style={{ color: 'var(--text-muted)' }}>Step {step + 1} of {STEPS.length}: {STEPS[step].label}</Caption1>
            </div>
          </div>
          <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />
        </div>

        {/* Progress Steps */}
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
              onClick={() => i < step && setStep(i)}
            >
              <div className="wizard-step-dot">
                {i < step ? <Checkmark24Regular style={{ width: 14, height: 14 }} /> : <span>{i + 1}</span>}
              </div>
              <Caption1 className="wizard-step-label">{s.label}</Caption1>
            </div>
          ))}
          <ProgressBar value={(step + 1) / STEPS.length} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} />
        </div>

        {/* Body */}
        <div className="wizard-body">
          {/* ── Step 1: Location ── */}
          {step === 0 && (
            <div className="wizard-step-content">
              <Title3 style={{ marginBottom: 16 }}>
                <Location24Regular style={{ marginRight: 8, color: 'var(--accent-primary)' }} />
                Issue Type & Location
              </Title3>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Issue Type</Text>
                <div className="wizard-type-grid">
                  {(['pothole', 'sidewalk', 'concrete'] as IssueType[]).map(type => (
                    <button
                      key={type}
                      className={`wizard-type-btn ${form.issueType === type ? 'selected' : ''}`}
                      onClick={() => updateField('issueType', type)}
                    >
                      <Text weight="semibold">{type.charAt(0).toUpperCase() + type.slice(1)}</Text>
                      <Caption1 style={{ color: 'var(--text-muted)' }}>
                        {type === 'pothole' ? 'Road surface damage' : type === 'sidewalk' ? 'Walkway hazard' : 'Structural repair'}
                      </Caption1>
                    </button>
                  ))}
                </div>
              </div>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Address *</Text>
                <Input
                  value={form.address}
                  onChange={(_, d) => updateField('address', d.value)}
                  placeholder="123 Main St, Lake Forest, IL"
                  style={{ width: '100%' }}
                />
                {errors.address && <Caption1 style={{ color: '#ef4444' }}>{errors.address}</Caption1>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="wizard-field">
                  <Text weight="semibold" size={200}>Latitude</Text>
                  <Input
                    value={form.latitude}
                    onChange={(_, d) => updateField('latitude', d.value)}
                    type="number"
                    style={{ width: '100%' }}
                  />
                  {errors.latitude && <Caption1 style={{ color: '#ef4444' }}>{errors.latitude}</Caption1>}
                </div>
                <div className="wizard-field">
                  <Text weight="semibold" size={200}>Longitude</Text>
                  <Input
                    value={form.longitude}
                    onChange={(_, d) => updateField('longitude', d.value)}
                    type="number"
                    style={{ width: '100%' }}
                  />
                  {errors.longitude && <Caption1 style={{ color: '#ef4444' }}>{errors.longitude}</Caption1>}
                </div>
              </div>

              {onOpenMap && (
                <Button
                  appearance="outline"
                  icon={<Map24Regular />}
                  onClick={() => onOpenMap((lat, lng) => {
                    updateField('latitude', lat.toFixed(6));
                    updateField('longitude', lng.toFixed(6));
                  })}
                  style={{ marginTop: 4 }}
                >
                  Pick Location on Map
                </Button>
              )}
            </div>
          )}

          {/* ── Step 2: Details ── */}
          {step === 1 && (
            <div className="wizard-step-content">
              <Title3 style={{ marginBottom: 16 }}>
                <Edit24Regular style={{ marginRight: 8, color: 'var(--accent-primary)' }} />
                Details & Severity
              </Title3>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Title</Text>
                <Input
                  value={form.title || autoTitle}
                  onChange={(_, d) => updateField('title', d.value)}
                  placeholder={autoTitle}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Description *</Text>
                <Textarea
                  value={form.description}
                  onChange={(_, d) => updateField('description', d.value)}
                  placeholder="Describe the issue in detail..."
                  rows={3}
                  resize="vertical"
                  style={{ width: '100%' }}
                />
                {errors.description && <Caption1 style={{ color: '#ef4444' }}>{errors.description}</Caption1>}
              </div>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Severity</Text>
                <div className="wizard-severity-grid">
                  {(['low', 'medium', 'high', 'critical'] as Severity[]).map(sev => (
                    <button
                      key={sev}
                      className={`wizard-severity-btn ${form.severity === sev ? 'selected' : ''}`}
                      onClick={() => updateField('severity', sev)}
                      style={{
                        borderColor: form.severity === sev ? severityColors[sev] : undefined,
                        background: form.severity === sev ? `${severityColors[sev]}15` : undefined,
                      }}
                    >
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: severityColors[sev],
                      }} />
                      <Text weight="semibold" style={{ textTransform: 'capitalize' }}>{sev}</Text>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="wizard-field">
                  <Text weight="semibold" size={200}>Zone</Text>
                  <Dropdown
                    value={form.zone}
                    onOptionSelect={(_, d) => updateField('zone', d.optionValue || 'Zone 1')}
                    style={{ width: '100%' }}
                  >
                    {['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'].map(z => (
                      <Option key={z} value={z} text={z}>{z}</Option>
                    ))}
                  </Dropdown>
                </div>
                <div className="wizard-field" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
                  <Switch
                    checked={form.nearSchool}
                    onChange={(_, d) => updateField('nearSchool', d.checked)}
                  />
                  <Text size={200}>Near a school</Text>
                  {form.nearSchool && <Warning24Regular style={{ color: '#ef4444' }} />}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Assignment ── */}
          {step === 2 && (
            <div className="wizard-step-content">
              <Title3 style={{ marginBottom: 16 }}>
                <People24Regular style={{ marginRight: 8, color: 'var(--accent-primary)' }} />
                Assignment & Cost
              </Title3>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Assign Crew (optional)</Text>
                <Dropdown
                  value={form.assignedCrewId ? crews.find(c => c.id === form.assignedCrewId)?.name || '' : 'Unassigned'}
                  onOptionSelect={(_, d) => updateField('assignedCrewId', d.optionValue || '')}
                  placeholder="Select a crew..."
                  style={{ width: '100%' }}
                >
                  <Option value="" text="Unassigned (assign later)">Unassigned (assign later)</Option>
                  {crews
                    .filter(c => c.status === 'available')
                    .map(c => {
                      const label = `${c.name} — ${c.memberCount} members · ${Math.round(c.efficiencyRating * 100)}% efficiency`;
                      return (
                        <Option key={c.id} value={c.id} text={label}>
                          {label}
                        </Option>
                      );
                    })}
                </Dropdown>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="wizard-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text weight="semibold" size={200}>Estimated Cost</Text>
                    <Tooltip content="AI-calculated based on issue type and severity" relationship="label">
                      <Badge size="small" color="informative" icon={<Brain24Regular />} style={{ cursor: 'help' }}>
                        AI
                      </Badge>
                    </Tooltip>
                  </div>
                  <Input
                    value={form.estimatedCost ? form.estimatedCost.toString() : autoCost.toString()}
                    onChange={(_, d) => updateField('estimatedCost', parseFloat(d.value) || 0)}
                    type="number"
                    contentBefore={<Text size={200}>$</Text>}
                    style={{ width: '100%' }}
                  />
                  <Caption1 style={{ color: 'var(--text-muted)' }}>
                    AI estimate: ${autoCost.toLocaleString()}
                  </Caption1>
                </div>

                <div className="wizard-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text weight="semibold" size={200}>Priority Score</Text>
                    <Badge size="small" color="informative" icon={<Brain24Regular />}>AI</Badge>
                  </div>
                  <Input
                    value={form.priorityScore ? form.priorityScore.toString() : autoPriority.toString()}
                    onChange={(_, d) => updateField('priorityScore', parseInt(d.value) || 0)}
                    type="number"
                    style={{ width: '100%' }}
                  />
                  <Caption1 style={{ color: 'var(--text-muted)' }}>
                    AI priority: {autoPriority}/100
                  </Caption1>
                </div>
              </div>

              <div className="wizard-field">
                <Text weight="semibold" size={200}>Initial Status</Text>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['open', 'assigned'] as WorkOrderStatus[]).map(s => (
                    <button
                      key={s}
                      className={`wizard-type-btn small ${form.status === s ? 'selected' : ''}`}
                      onClick={() => updateField('status', s)}
                    >
                      <Text weight="semibold" style={{ textTransform: 'capitalize' }}>{s}</Text>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 3 && (
            <div className="wizard-step-content">
              <Title3 style={{ marginBottom: 16 }}>
                <DocumentBulletList24Regular style={{ marginRight: 8, color: 'var(--accent-primary)' }} />
                Review & Submit
              </Title3>

              <div className="wizard-review-card">
                <div className="wizard-review-header">
                  <div>
                    <Text weight="bold" size={400}>{form.title || autoTitle}</Text>
                    <Caption1 style={{ display: 'block', color: 'var(--text-muted)', marginTop: 2 }}>
                      {form.address}
                    </Caption1>
                  </div>
                  <Badge
                    size="medium"
                    color={form.severity === 'critical' ? 'danger' : form.severity === 'high' ? 'warning' : form.severity === 'medium' ? 'informative' : 'success'}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {form.severity}
                  </Badge>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <div className="wizard-review-grid">
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Type</Caption1>
                    <Text weight="semibold" style={{ textTransform: 'capitalize' }}>{form.issueType}</Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Zone</Caption1>
                    <Text weight="semibold">{form.zone}</Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Near School</Caption1>
                    <Text weight="semibold">{form.nearSchool ? <><Warning24Regular style={{ fontSize: 14, color: 'var(--accent-warning)', verticalAlign: 'middle' }} /> Yes</> : 'No'}</Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Status</Caption1>
                    <Text weight="semibold" style={{ textTransform: 'capitalize' }}>{form.status}</Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Est. Cost</Caption1>
                    <Text weight="semibold" style={{ color: '#f59e0b' }}>
                      ${(form.estimatedCost || autoCost).toLocaleString()}
                    </Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Priority</Caption1>
                    <Text weight="semibold" style={{ color: 'var(--accent-primary)' }}>
                      {form.priorityScore || autoPriority}/100
                    </Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Crew</Caption1>
                    <Text weight="semibold">
                      {form.assignedCrewId ? crews.find(c => c.id === form.assignedCrewId)?.name || 'Unknown' : 'Unassigned'}
                    </Text>
                  </div>
                  <div className="wizard-review-item">
                    <Caption1 style={{ color: 'var(--text-muted)' }}>Coordinates</Caption1>
                    <Text weight="semibold" size={200}>
                      {parseFloat(form.latitude).toFixed(4)}, {parseFloat(form.longitude).toFixed(4)}
                    </Text>
                  </div>
                </div>

                {form.description && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Caption1 style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Description</Caption1>
                    <Text size={200}>{form.description}</Text>
                  </>
                )}
              </div>

              <div style={{
                padding: '12px 16px',
                background: 'rgba(59, 130, 246, 0.08)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                marginTop: 12,
              }}>
                <Text size={200} style={{ color: 'var(--text-secondary)' }}>
                  <Brain24Regular style={{ width: 14, height: 14, marginRight: 6, verticalAlign: 'middle', color: 'var(--accent-primary)' }} />
                  This work order will be saved to Dataverse and appear in the active queue.
                  {form.assignedCrewId ? ' The assigned crew will be notified.' : ' You can assign a crew later from the dispatch panel.'}
                </Text>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          <div>
            {step > 0 && (
              <Button appearance="subtle" icon={<ArrowLeft24Regular />} onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button appearance="subtle" onClick={handleReset}>Reset</Button>
            {step < STEPS.length - 1 ? (
              <Button appearance="primary" icon={<ArrowRight24Regular />} iconPosition="after" onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button
                appearance="primary"
                icon={isSubmitting ? <Spinner size="tiny" /> : <Checkmark24Regular />}
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating...' : 'Create Work Order'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkOrderWizard;

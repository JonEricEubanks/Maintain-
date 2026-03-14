/**
 * MAINTAIN AI — Field Inspection Form
 *
 * Mobile-friendly form for field crews to submit:
 * - Pre-repair assessments
 * - Completion reports with condition ratings
 * - Safety hazard flags
 * - Materials used and time tracking
 *
 * ALL WRITES go to Dataverse. MCP is never modified.
 */

import React, { useState, useCallback } from 'react';
import {
  Text,
  Title2,
  Title3,
  Caption1,
  Badge,
  Button,
  Input,
  Textarea,
  Dropdown,
  Option,
  Spinner,
  Divider,
  Switch,
  Field,
} from '@fluentui/react-components';
import {
  ClipboardTask24Regular,
  Checkmark24Regular,
  Warning24Regular,
  Clock24Regular,
  Money24Regular,
  Camera24Regular,
  Location24Regular,
  WeatherSunny24Regular,
  Add24Regular,
  Delete24Regular,
} from '@fluentui/react-icons';

import type {
  CrewDispatch,
  FieldInspection,
  InspectionType,
  ConditionRating,
  MaterialItem,
} from '../types/infrastructure';
import dispatchService from '../services/dispatchService';
import dataverseService from '../services/dataverseService';

// ============================================
// Props
// ============================================

interface FieldInspectionFormProps {
  dispatch?: CrewDispatch;
  onComplete?: (inspection: FieldInspection) => void;
  onCancel?: () => void;
}

// ============================================
// Component
// ============================================

const FieldInspectionForm: React.FC<FieldInspectionFormProps> = ({
  dispatch,
  onComplete,
  onCancel,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form state
  const [inspectorName, setInspectorName] = useState('');
  const [inspectionType, setInspectionType] = useState<InspectionType>('completion');
  const [conditionRating, setConditionRating] = useState<ConditionRating>(4);
  const [repairCompleted, setRepairCompleted] = useState(true);
  const [timeSpent, setTimeSpent] = useState(dispatch?.estimatedDuration?.toString() || '');
  const [actualCost, setActualCost] = useState(dispatch?.estimatedCost?.toString() || '');
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [safetyHazards, setSafetyHazards] = useState(false);
  const [hazardDescription, setHazardDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [weatherCondition, setWeatherCondition] = useState('');
  const [temperature, setTemperature] = useState('');

  // Add material row
  const addMaterial = () => {
    setMaterials([...materials, { name: '', quantity: 1, unit: 'pieces' }]);
  };

  const updateMaterial = (index: number, field: keyof MaterialItem, value: string | number) => {
    const updated = [...materials];
    (updated[index] as any)[field] = value;
    setMaterials(updated);
  };

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!inspectorName.trim() || !dispatch) return;
    setIsSubmitting(true);

    try {
      const inspectionData: Omit<FieldInspection, 'id' | 'name' | 'createdAt'> = {
        dispatchId: dispatch.id,
        workOrderId: dispatch.workOrderId,
        inspectorName: inspectorName.trim(),
        inspectionType,
        conditionRating,
        repairCompleted,
        timeSpent: timeSpent ? parseFloat(timeSpent) : undefined,
        materialsUsed: materials.filter(m => m.name.trim()),
        safetyHazardsFound: safetyHazards,
        hazardDescription: safetyHazards ? hazardDescription : undefined,
        notes: notes.trim() || undefined,
        weatherCondition: weatherCondition || undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
        latitude: dispatch.latitude,
        longitude: dispatch.longitude,
      };

      // If completion report, also close the dispatch
      if (inspectionType === 'completion' && repairCompleted) {
        const result = await dispatchService.submitFieldCompletion(
          dispatch.id,
          inspectionData,
          parseFloat(timeSpent) || dispatch.estimatedDuration,
          parseFloat(actualCost) || dispatch.estimatedCost,
        );
        if (result.inspection) {
          setSubmitted(true);
          onComplete?.(result.inspection);
        }
      } else {
        // Just log the inspection without completing dispatch
        const inspection = await dataverseService.createInspection(inspectionData);
        setSubmitted(true);
        onComplete?.(inspection);
      }
    } catch (err) {
      console.error('Failed to submit inspection:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    dispatch, inspectorName, inspectionType, conditionRating,
    repairCompleted, timeSpent, actualCost, materials, safetyHazards,
    hazardDescription, notes, weatherCondition, temperature, onComplete,
  ]);

  // Success state
  if (submitted) {
    return (
      <div className="glass-panel fade-in" style={{
        padding: 'var(--spacing-xl)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--spacing-md)',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(46, 213, 115, 0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Checkmark24Regular style={{ fontSize: 32, color: 'var(--accent-success)' }} />
        </div>
        <Title2>Inspection Submitted</Title2>
        <Text align="center" style={{ color: 'var(--text-muted)' }}>
          {dispatch?.name || 'Inspection'} — {repairCompleted ? 'Repair completed' : 'Inspection recorded'}.
          <br />Data saved to Dataverse for AI feedback loop.
        </Text>
        <Button appearance="primary" onClick={onCancel}>Done</Button>
      </div>
    );
  }

  return (
    <div className="field-inspection-form glass-panel fade-in" style={{
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--spacing-lg)',
      gap: 'var(--spacing-md)',
      maxHeight: '80vh',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
        <ClipboardTask24Regular style={{ color: 'var(--accent-primary)' }} />
        <Title2>Field Inspection</Title2>
      </div>

      {/* Dispatch Context */}
      {dispatch ? (
      <div style={{
        padding: 'var(--spacing-sm)',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
      }}>
        <Text weight="semibold">{dispatch.name}</Text>
        <Caption1 style={{ display: 'block', color: 'var(--text-muted)' }}>
          {dispatch.issueType} · {dispatch.priority} · {dispatch.address}
        </Caption1>
        <Caption1 style={{ display: 'block', color: 'var(--text-muted)' }}>
          Crew: {dispatch.crewName} · Est: {dispatch.estimatedDuration}h / ${dispatch.estimatedCost?.toLocaleString()}
        </Caption1>
      </div>
      ) : (
      <div style={{
        padding: 'var(--spacing-md)',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(107, 114, 128, 0.1)',
        border: '1px dashed rgba(107, 114, 128, 0.3)',
        textAlign: 'center',
      }}>
        <Caption1 style={{ color: 'var(--text-muted)' }}>
          Standalone inspection — no dispatch linked. Submit from the Dispatch Queue to link.
        </Caption1>
      </div>
      )}

      <Divider />

      {/* Inspector Name */}
      <Field label="Inspector Name" required>
        <Input
          value={inspectorName}
          onChange={(_, d) => setInspectorName(d.value)}
          placeholder="Enter your name"
        />
      </Field>

      {/* Inspection Type */}
      <Field label="Inspection Type">
        <Dropdown
          value={inspectionTypeLabels[inspectionType]}
          onOptionSelect={(_, d) => setInspectionType(d.optionValue as InspectionType)}
        >
          <Option value="pre_repair">Pre-Repair Assessment</Option>
          <Option value="in_progress">In-Progress Check</Option>
          <Option value="completion">Completion Report</Option>
          <Option value="quality_assurance">Quality Assurance</Option>
          <Option value="follow_up">Follow-Up</Option>
        </Dropdown>
      </Field>

      {/* Condition Rating */}
      <Field label="Condition Rating">
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          {([1, 2, 3, 4, 5] as ConditionRating[]).map(rating => (
            <Button
              key={rating}
              appearance={conditionRating === rating ? 'primary' : 'subtle'}
              onClick={() => setConditionRating(rating)}
              style={{ minWidth: 44, flex: 1 }}
            >
              {rating}{rating === 1 ? <Warning24Regular style={{ fontSize: 14, marginLeft: 2 }} /> : rating === 5 ? <Checkmark24Regular style={{ fontSize: 14, marginLeft: 2 }} /> : null}
            </Button>
          ))}
        </div>
        <Caption1 style={{ color: 'var(--text-muted)', marginTop: 4 }}>
          {conditionRatingLabels[conditionRating]}
        </Caption1>
      </Field>

      {/* Repair Completed */}
      <Field label="Repair Status">
        <Switch
          checked={repairCompleted}
          onChange={(_, d) => setRepairCompleted(d.checked)}
          label={repairCompleted ? 'Repair Completed' : 'Repair Incomplete'}
        />
      </Field>

      {/* Time & Cost */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
        <Field label="Time Spent (hours)">
          <Input
            type="number"
            value={timeSpent}
            onChange={(_, d) => setTimeSpent(d.value)}
            contentBefore={<Clock24Regular style={{ fontSize: 16 }} />}
          />
        </Field>
        <Field label="Actual Cost ($)">
          <Input
            type="number"
            value={actualCost}
            onChange={(_, d) => setActualCost(d.value)}
            contentBefore={<Money24Regular style={{ fontSize: 16 }} />}
          />
        </Field>
      </div>

      {/* Materials Used */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text weight="semibold">Materials Used</Text>
          <Button size="small" icon={<Add24Regular />} onClick={addMaterial}>Add</Button>
        </div>
        {materials.map((m, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr auto',
            gap: 'var(--spacing-xs)',
            marginTop: 'var(--spacing-xs)',
          }}>
            <Input
              placeholder="Material"
              value={m.name}
              onChange={(_, d) => updateMaterial(i, 'name', d.value)}
            />
            <Input
              type="number"
              placeholder="Qty"
              value={String(m.quantity)}
              onChange={(_, d) => updateMaterial(i, 'quantity', parseFloat(d.value) || 0)}
            />
            <Input
              placeholder="Unit"
              value={m.unit}
              onChange={(_, d) => updateMaterial(i, 'unit', d.value)}
            />
            <Button
              size="small"
              icon={<Delete24Regular />}
              appearance="subtle"
              onClick={() => removeMaterial(i)}
            />
          </div>
        ))}
      </div>

      {/* Safety Hazards */}
      <Field label="Safety Hazards">
        <Switch
          checked={safetyHazards}
          onChange={(_, d) => setSafetyHazards(d.checked)}
          label={safetyHazards ? 'Hazards Found' : 'No Hazards'}
        />
        {safetyHazards && (
          <Textarea
            value={hazardDescription}
            onChange={(_, d) => setHazardDescription(d.value)}
            placeholder="Describe the safety hazard..."
            style={{ marginTop: 'var(--spacing-xs)' }}
          />
        )}
      </Field>

      {/* Weather */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-sm)' }}>
        <Field label="Weather">
          <Input
            value={weatherCondition}
            onChange={(_, d) => setWeatherCondition(d.value)}
            placeholder="e.g. Clear"
            contentBefore={<WeatherSunny24Regular style={{ fontSize: 16 }} />}
          />
        </Field>
        <Field label="Temperature (°F)">
          <Input
            type="number"
            value={temperature}
            onChange={(_, d) => setTemperature(d.value)}
          />
        </Field>
      </div>

      {/* Notes */}
      <Field label="Notes">
        <Textarea
          value={notes}
          onChange={(_, d) => setNotes(d.value)}
          placeholder="Additional observations, photos taken, etc."
          rows={3}
        />
      </Field>

      <Divider />

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
        <Button
          appearance="primary"
          icon={<Checkmark24Regular />}
          onClick={handleSubmit}
          disabled={isSubmitting || !inspectorName.trim()}
          style={{ flex: 1 }}
        >
          {isSubmitting ? (
            <>
              <Spinner size="tiny" style={{ marginRight: 8 }} />
              Submitting...
            </>
          ) : (
            repairCompleted ? 'Submit & Complete' : 'Submit Inspection'
          )}
        </Button>
        <Button appearance="subtle" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
};

// ============================================
// Labels
// ============================================

const inspectionTypeLabels: Record<InspectionType, string> = {
  pre_repair: 'Pre-Repair Assessment',
  in_progress: 'In-Progress Check',
  completion: 'Completion Report',
  quality_assurance: 'Quality Assurance',
  follow_up: 'Follow-Up',
};

const conditionRatingLabels: Record<ConditionRating, string> = {
  1: '1 — Critical / Unsafe',
  2: '2 — Poor',
  3: '3 — Fair',
  4: '4 — Good',
  5: '5 — Excellent / Fully Repaired',
};

export default FieldInspectionForm;

/**
 * MAINTAIN AI — Crew Management Panel (Modal)
 *
 * Full CRUD panel for managing crew members.
 * Opened from the Ops tab in the UnifiedSidePanel.
 *
 * Features:
 *   - Crew roster list with status badges
 *   - Add new crew member form
 *   - Inline edit per crew row
 *   - Delete with confirmation
 *   - Status toggle
 *   - Persists to Dataverse via dataverseService
 *
 * 100 % inline styles — no Tailwind dependency.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Plus, Save, Trash2, Edit3, Users, ChevronDown,
  CheckCircle, Phone, Mail, Shield, MapPin, UserPlus,
  AlertTriangle, Loader2,
} from 'lucide-react';

import type {
  Crew,
  CrewMember,
  CrewStatus,
  CrewSpecialization,
} from '../types/infrastructure';
import dataverseService from '../services/dataverseService';

/* ═══════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════ */

const STATUS_COLORS: Record<CrewStatus, { bg: string; color: string; label: string }> = {
  available: { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: 'Available' },
  assigned:  { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'Assigned' },
  on_break:  { bg: 'rgba(249,115,22,0.15)', color: '#f97316', label: 'On Break' },
  off_duty:  { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Off Duty' },
};

const SPEC_OPTS: { value: CrewSpecialization; label: string; letter: string; color: string }[] = [
  { value: 'pothole',  label: 'Pothole',  letter: 'P', color: '#f59e0b' },
  { value: 'sidewalk', label: 'Sidewalk', letter: 'S', color: '#64748b' },
  { value: 'concrete', label: 'Concrete', letter: 'C', color: '#8b5cf6' },
  { value: 'general',  label: 'General',  letter: 'G', color: '#3b82f6' },
];

const STATUS_OPTS: CrewStatus[] = ['available', 'assigned', 'on_break', 'off_duty'];

type FormData = {
  name: string;
  specialization: CrewSpecialization;
  status: CrewStatus;
  memberCount: number;
  efficiencyRating: number;
  email: string;
  phone: string;
  zone: string;
  certifications: string;
  currentLat: number;
  currentLng: number;
};

const EMPTY_FORM: FormData = {
  name: '',
  specialization: 'general',
  status: 'available',
  memberCount: 3,
  efficiencyRating: 0.85,
  email: '',
  phone: '',
  zone: '',
  certifications: '',
  currentLat: 33.4484,
  currentLng: -112.074,
};

/* ═══════════════════════════════════════
   PROPS
   ═══════════════════════════════════════ */

interface CrewManagementPanelProps {
  crews: Crew[];
  onClose: () => void;
  onCrewsUpdated: (crews: CrewMember[]) => void;
}

/* ═══════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════ */

const CrewManagementPanel: React.FC<CrewManagementPanelProps> = ({
  crews: initialCrews,
  onClose,
  onCrewsUpdated,
}) => {
  const [members, setMembers] = useState<CrewMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // UI states
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filterSpec, setFilterSpec] = useState<CrewSpecialization | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<CrewStatus | 'all'>('all');

  // ── Load crew members ──
  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await dataverseService.getCrewMembers({ activeOnly: false });
      setMembers(data);
    } catch (e) {
      console.error('[CrewMgmt] load error', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // Flash messages
  const flash = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2500);
  };

  // ── Form state helpers ──
  const setField = <K extends keyof FormData>(key: K, val: FormData[K]) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  const populateForm = (m: CrewMember) => {
    setFormData({
      name: m.name,
      specialization: m.specialization,
      status: m.status,
      memberCount: m.memberCount,
      efficiencyRating: m.efficiencyRating,
      email: m.email || '',
      phone: m.phone || '',
      zone: m.zone || '',
      certifications: (m.certifications || []).join(', '),
      currentLat: m.currentLat,
      currentLng: m.currentLng,
    });
  };

  // ── CREATE ──
  const handleCreate = async () => {
    if (!formData.name.trim()) { setErrorMsg('Name is required'); return; }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await dataverseService.createCrewMember({
        name: formData.name.trim(),
        specialization: formData.specialization,
        status: formData.status,
        memberCount: formData.memberCount,
        efficiencyRating: formData.efficiencyRating,
        currentLat: formData.currentLat,
        currentLng: formData.currentLng,
        assignedWorkOrders: [],
        isActive: true,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        zone: formData.zone || undefined,
        certifications: formData.certifications ? formData.certifications.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      });
      setShowAddForm(false);
      setFormData({ ...EMPTY_FORM });
      flash('Crew member created');
      const updated = await dataverseService.getCrewMembers({ activeOnly: false });
      setMembers(updated);
      onCrewsUpdated(updated);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to create');
    } finally {
      setIsSaving(false);
    }
  };

  // ── UPDATE ──
  const handleUpdate = async () => {
    if (!editingId) return;
    if (!formData.name.trim()) { setErrorMsg('Name is required'); return; }
    setIsSaving(true);
    setErrorMsg(null);
    try {
      await dataverseService.updateCrewMember(editingId, {
        name: formData.name.trim(),
        specialization: formData.specialization,
        status: formData.status,
        memberCount: formData.memberCount,
        efficiencyRating: formData.efficiencyRating,
        currentLat: formData.currentLat,
        currentLng: formData.currentLng,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        zone: formData.zone || undefined,
        certifications: formData.certifications ? formData.certifications.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      });
      setEditingId(null);
      setFormData({ ...EMPTY_FORM });
      flash('Crew member updated');
      const updated = await dataverseService.getCrewMembers({ activeOnly: false });
      setMembers(updated);
      onCrewsUpdated(updated);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to update');
    } finally {
      setIsSaving(false);
    }
  };

  // ── DELETE ──
  const handleDelete = async (id: string) => {
    setIsSaving(true);
    try {
      await dataverseService.deleteCrewMember(id);
      setDeletingId(null);
      flash('Crew member removed');
      const updated = await dataverseService.getCrewMembers({ activeOnly: false });
      setMembers(updated);
      onCrewsUpdated(updated);
    } catch (e) {
      setErrorMsg('Failed to delete');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Toggle status quickly ──
  const cycleStatus = async (m: CrewMember) => {
    const order: CrewStatus[] = ['available', 'assigned', 'on_break', 'off_duty'];
    const next = order[(order.indexOf(m.status) + 1) % order.length];
    try {
      await dataverseService.updateCrewMember(m.id, { status: next });
      const updated = await dataverseService.getCrewMembers({ activeOnly: false });
      setMembers(updated);
      onCrewsUpdated(updated);
    } catch (e) {
      console.error('[CrewMgmt] cycleStatus error', e);
    }
  };

  // ── Toggle active / inactive ──
  const toggleActive = async (m: CrewMember) => {
    try {
      await dataverseService.updateCrewMember(m.id, { isActive: !m.isActive });
      const updated = await dataverseService.getCrewMembers({ activeOnly: false });
      setMembers(updated);
      onCrewsUpdated(updated);
    } catch (e) {
      console.error('[CrewMgmt] toggleActive error', e);
    }
  };

  // ── Filtered list ──
  const filtered = members.filter(m => {
    if (filterSpec !== 'all' && m.specialization !== filterSpec) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    return true;
  });

  // ── Stats ──
  const stats = {
    total: members.length,
    active: members.filter(m => m.isActive).length,
    available: members.filter(m => m.status === 'available').length,
    assigned: members.filter(m => m.status === 'assigned').length,
  };

  /* ═══════════════════════════════════════
     INPUT COMPONENT
     ═══════════════════════════════════════ */
  const InputField: React.FC<{
    label: string;
    value: string | number;
    onChange: (val: string) => void;
    type?: string;
    placeholder?: string;
    icon?: React.ReactNode;
    required?: boolean;
  }> = ({ label, value, onChange, type = 'text', placeholder, icon, required }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg-primary)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        padding: '8px 10px',
      }}>
        {icon && <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );

  /* ═══════════════════════════════════════
     SELECT COMPONENT
     ═══════════════════════════════════════ */
  const SelectField: React.FC<{
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (val: string) => void;
  }> = ({ label, value, options, onChange }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      <div style={{
        position: 'relative',
        background: 'var(--bg-primary)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
      }}>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13,
            padding: '8px 10px',
            fontFamily: 'inherit',
            appearance: 'none',
            cursor: 'pointer',
          }}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          width: 14, height: 14, color: 'var(--text-muted)', pointerEvents: 'none',
        }} />
      </div>
    </div>
  );

  /* ═══════════════════════════════════════
     CREW FORM (shared for Add & Edit)
     ═══════════════════════════════════════ */
  const renderForm = (mode: 'add' | 'edit') => (
    <div style={{
      background: 'var(--glass-bg)',
      border: '1px solid var(--glass-border)',
      borderRadius: 12,
      padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mode === 'add'
            ? <UserPlus style={{ width: 16, height: 16, color: 'var(--accent-primary)' }} />
            : <Edit3 style={{ width: 16, height: 16, color: 'var(--accent-warning)' }} />}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            {mode === 'add' ? 'New Crew Member' : 'Edit Crew Member'}
          </span>
        </div>
        <button
          onClick={() => { mode === 'add' ? setShowAddForm(false) : setEditingId(null); setFormData({ ...EMPTY_FORM }); setErrorMsg(null); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Row: Name + Specialization */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <InputField
          label="Crew Name"
          value={formData.name}
          onChange={v => setField('name', v)}
          placeholder="e.g. Pothole Alpha-1"
          icon={<Users style={{ width: 14, height: 14 }} />}
          required
        />
        <SelectField
          label="Specialization"
          value={formData.specialization}
          options={SPEC_OPTS.map(s => ({ value: s.value, label: s.label }))}
          onChange={v => setField('specialization', v as CrewSpecialization)}
        />
      </div>

      {/* Row: Status + Members + Efficiency */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <SelectField
          label="Status"
          value={formData.status}
          options={STATUS_OPTS.map(s => ({ value: s, label: STATUS_COLORS[s].label }))}
          onChange={v => setField('status', v as CrewStatus)}
        />
        <InputField
          label="Members"
          value={formData.memberCount}
          onChange={v => setField('memberCount', Math.max(1, parseInt(v) || 1))}
          type="number"
          placeholder="3"
        />
        <InputField
          label="Efficiency"
          value={Math.round(formData.efficiencyRating * 100)}
          onChange={v => setField('efficiencyRating', Math.min(1, Math.max(0, (parseInt(v) || 0) / 100)))}
          type="number"
          placeholder="85"
        />
      </div>

      {/* Row: Contact */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <InputField
          label="Email"
          value={formData.email}
          onChange={v => setField('email', v)}
          placeholder="crew@city.gov"
          icon={<Mail style={{ width: 14, height: 14 }} />}
        />
        <InputField
          label="Phone"
          value={formData.phone}
          onChange={v => setField('phone', v)}
          placeholder="(555) 123-4567"
          icon={<Phone style={{ width: 14, height: 14 }} />}
        />
      </div>

      {/* Row: Zone + Certs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <InputField
          label="Zone"
          value={formData.zone}
          onChange={v => setField('zone', v)}
          placeholder="NW-A, Downtown..."
          icon={<MapPin style={{ width: 14, height: 14 }} />}
        />
        <InputField
          label="Certifications"
          value={formData.certifications}
          onChange={v => setField('certifications', v)}
          placeholder="CDL, OSHA..."
          icon={<Shield style={{ width: 14, height: 14 }} />}
        />
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
          color: '#ef4444',
        }}>
          <AlertTriangle style={{ width: 14, height: 14 }} />
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          onClick={() => { mode === 'add' ? setShowAddForm(false) : setEditingId(null); setFormData({ ...EMPTY_FORM }); setErrorMsg(null); }}
          style={{
            padding: '8px 16px', borderRadius: 8,
            background: 'transparent',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={mode === 'add' ? handleCreate : handleUpdate}
          disabled={isSaving}
          style={{
            padding: '8px 16px', borderRadius: 8,
            background: mode === 'add' ? 'var(--accent-primary)' : 'var(--accent-warning)',
            border: 'none',
            color: mode === 'add' ? 'var(--accent-on-primary)' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: isSaving ? 'wait' : 'pointer',
            opacity: isSaving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {isSaving && <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} />}
          {mode === 'add' ? (isSaving ? 'Creating…' : 'Add Crew') : (isSaving ? 'Saving…' : 'Save Changes')}
        </button>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════
     RENDER
     ═══════════════════════════════════════ */
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel size-md" onClick={e => e.stopPropagation()}>
        {/* ══════ HEADER ══════ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(99,102,241,0.1))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Users style={{ width: 16, height: 16, color: '#6366f1' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Crew Management
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {stats.total} crews · {stats.active} active · {stats.available} available
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Add button */}
            <button
              onClick={() => { setShowAddForm(true); setEditingId(null); setFormData({ ...EMPTY_FORM }); setErrorMsg(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8,
                background: 'var(--accent-primary)',
                border: 'none',
                color: 'var(--accent-on-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
              Add Crew
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'transparent',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>

        {/* ══════ FILTER BAR ══════ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 18px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
          flexWrap: 'wrap',
        }}>
          {/* Specialization chips */}
          <div style={{ display: 'flex', gap: 4 }}>
            <FilterChip
              active={filterSpec === 'all'}
              label="All"
              onClick={() => setFilterSpec('all')}
            />
            {SPEC_OPTS.map(s => (
              <FilterChip
                key={s.value}
                active={filterSpec === s.value}
                label={s.label}
                color={s.color}
                onClick={() => setFilterSpec(filterSpec === s.value ? 'all' : s.value)}
              />
            ))}
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--glass-border)', margin: '0 4px' }} />

          {/* Status chips */}
          <div style={{ display: 'flex', gap: 4 }}>
            <FilterChip
              active={filterStatus === 'all'}
              label="All"
              onClick={() => setFilterStatus('all')}
            />
            {STATUS_OPTS.map(s => (
              <FilterChip
                key={s}
                active={filterStatus === s}
                label={STATUS_COLORS[s].label}
                color={STATUS_COLORS[s].color}
                onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              />
            ))}
          </div>
        </div>

        {/* ══════ BODY ══════ */}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Success toast */}
          {successMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12, fontWeight: 600, color: '#22c55e',
              animation: 'fadeIn 0.2s ease',
            }}>
              <CheckCircle style={{ width: 14, height: 14 }} />
              {successMsg}
            </div>
          )}

          {/* Add form */}
          {showAddForm && renderForm('add')}

          {/* Loading */}
          {isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <Loader2 style={{ width: 24, height: 24, color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px',
              color: 'var(--text-muted)',
            }}>
              <Users style={{ width: 40, height: 40, marginBottom: 12, opacity: 0.4 }} />
              <span style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No crews found</span>
              <span style={{ fontSize: 12 }}>
                {members.length > 0 ? 'Try adjusting your filters' : 'Click "Add Crew" to create your first crew'}
              </span>
            </div>
          )}

          {/* Crew list */}
          {!isLoading && filtered.map(m => {
            const isEditing = editingId === m.id;
            const isDeleting = deletingId === m.id;
            const st = STATUS_COLORS[m.status] || STATUS_COLORS.available;
            const spec = SPEC_OPTS.find(s => s.value === m.specialization) || SPEC_OPTS[3];
            const eff = Math.round(m.efficiencyRating * 100);

            if (isEditing) return <div key={m.id}>{renderForm('edit')}</div>;

            return (
              <div
                key={m.id}
                style={{
                  background: m.isActive ? 'var(--glass-bg)' : 'rgba(107,114,128,0.08)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  opacity: m.isActive ? 1 : 0.55,
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Delete confirmation */}
                {isDeleting && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 10,
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle style={{ width: 16, height: 16, color: '#ef4444' }} />
                      <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                        Delete <strong>{m.name}</strong>? This cannot be undone.
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setDeletingId(null)}
                        style={{
                          padding: '5px 12px', borderRadius: 6,
                          background: 'transparent', border: '1px solid var(--glass-border)',
                          color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={isSaving}
                        style={{
                          padding: '5px 12px', borderRadius: 6,
                          background: '#ef4444', border: 'none',
                          color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {isSaving ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Spec letter badge */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: spec.color + '22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: spec.color,
                  }}>
                    {spec.letter}
                  </div>

                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name}
                      </span>
                      {!m.isActive && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(107,114,128,0.2)', color: '#6b7280',
                        }}>
                          Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {m.memberCount}p · {spec.label}
                      </span>
                      {m.zone && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          · {m.zone}
                        </span>
                      )}
                      {m.email && (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          · {m.email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Efficiency */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: eff >= 85 ? '#22c55e' : eff >= 65 ? '#f59e0b' : '#ef4444',
                    }}>
                      {eff}%
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>Eff.</div>
                  </div>

                  {/* Status badge (clickable to cycle) */}
                  <button
                    onClick={() => cycleStatus(m)}
                    title="Click to change status"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 6,
                      background: st.bg, border: '1px solid ' + st.color + '40',
                      color: st.color,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: st.color,
                    }} />
                    {st.label}
                  </button>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => { setEditingId(m.id); setShowAddForm(false); populateForm(m); setErrorMsg(null); }}
                      title="Edit"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--glass-border)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Edit3 style={{ width: 13, height: 13 }} />
                    </button>
                    <button
                      onClick={() => toggleActive(m)}
                      title={m.isActive ? 'Deactivate' : 'Activate'}
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--glass-border)',
                        color: m.isActive ? 'var(--accent-success)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <CheckCircle style={{ width: 13, height: 13 }} />
                    </button>
                    <button
                      onClick={() => setDeletingId(m.id)}
                      title="Delete"
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--glass-border)',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════ FOOTER ══════ */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 18px',
          borderTop: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span>
            Showing {filtered.length} of {members.length} crews
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {dataverseService.isDataverseConnected()
              ? <><CheckCircle style={{ width: 12, height: 12, color: '#22c55e' }} /> Dataverse</>
              : <><AlertTriangle style={{ width: 12, height: 12, color: '#f59e0b' }} /> Local Storage</>
            }
          </span>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   FILTER CHIP SUB-COMPONENT
   ═══════════════════════════════════════ */
const FilterChip: React.FC<{
  active: boolean;
  label: string;
  color?: string;
  onClick: () => void;
}> = ({ active, label, color, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: '3px 10px', borderRadius: 6,
      background: active ? (color ? color + '22' : 'var(--accent-primary)22') : 'transparent',
      border: `1px solid ${active ? (color || 'var(--accent-primary)') + '44' : 'var(--glass-border)'}`,
      color: active ? (color || 'var(--accent-primary)') : 'var(--text-muted)',
      fontSize: 11, fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
      transition: 'all 0.15s ease',
    }}
  >
    {label}
  </button>
);

export default CrewManagementPanel;

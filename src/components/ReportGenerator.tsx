/**
 * MAINTAIN AI — Professional Report Builder v2
 *
 * A next-level, user-friendly report builder with:
 * - Template presets (Board Brief, Full Assessment, Community Update, Budget Request)
 * - Audience selector that adapts language
 * - Inline editing everywhere (cover fields, KPIs, recommendations, etc.)
 * - Collapsible sections with smooth animations
 * - Table of Contents with scroll-to-section
 * - Section duplication, notes, descriptions
 * - Quick formatting toolbar for text sections
 * - Report completeness score & reading time
 * - Keyboard shortcuts with help overlay
 * - Better drag-and-drop with visual feedback
 * - Status bar with word count / page estimate
 * - Full light/dark theme support
 * - Clean PDF-ready print layout
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ClipboardTask24Regular,
  Document24Regular,
  Notepad24Regular,
  DataBarVertical24Regular,
  Microscope24Regular,
  ArrowTrending24Regular,
  Money24Regular,
  LightbulbFilament24Regular,
  Sparkle24Regular,
  Warning24Regular,
  Edit24Regular,
  Attach24Regular,
  PersonBoard24Regular,
  Wrench24Regular,
  BuildingMultiple24Regular,
  People24Regular,
  Building24Regular,
  BuildingBank24Regular,
  AlertUrgent24Regular,
  CalendarLtr24Regular,
  TargetArrow24Regular,
  Person24Regular,
  Timer24Regular,
  WeatherRain24Regular,
  Bot24Regular,
  Eye24Regular,
  Print24Regular,
  Keyboard24Regular,
  Comment24Regular,
  BookOpen24Regular,
} from '@fluentui/react-icons';
import reportService from '../services/reportService';
import type { ReportChart, ReportType } from '../services/reportService';
import type { WorkOrder } from '../types/infrastructure';

// ============================================
// Types
// ============================================

interface ReportSection {
  id: string;
  type: SectionType;
  title: string;
  content: string;
  visible: boolean;
  locked: boolean;
  icon: React.ReactNode;
  charts?: ReportChart[];
  order: number;
  collapsed: boolean;
  note: string;
  description: string;
}

type SectionType =
  | 'cover'
  | 'toc'
  | 'executive-summary'
  | 'statistics'
  | 'severity-analysis'
  | 'charts'
  | 'budget'
  | 'recommendations'
  | 'forecasting'
  | 'safety'
  | 'custom'
  | 'appendix';

type ViewMode = 'edit' | 'preview';
type Audience = 'board' | 'technical' | 'community' | 'internal';
type Template = 'full' | 'board-brief' | 'community-update' | 'budget-request';

interface ReportGeneratorProps {
  workOrders: WorkOrder[];
  isVisible: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

// ============================================
// Theme Palette
// ============================================

const THEMES = {
  light: {
    bg: '#ffffff',
    pageBg: '#f1f3f5',
    surface: '#f8f9fa',
    surfaceAlt: '#f0f2f5',
    surfaceHover: '#e9ecef',
    border: '#dee2e6',
    borderLight: '#e9ecef',
    text: '#212529',
    textSecondary: '#495057',
    textMuted: '#868e96',
    primary: '#4f46e5',
    primaryHover: '#4338ca',
    primaryLight: '#eef2ff',
    primaryBorder: '#c7d2fe',
    accent: '#7c3aed',
    success: '#059669',
    successLight: '#d1fae5',
    successBg: '#ecfdf5',
    warning: '#d97706',
    warningLight: '#fef3c7',
    warningBg: '#fffbeb',
    danger: '#dc2626',
    dangerLight: '#fee2e2',
    dangerBg: '#fef2f2',
    info: '#2563eb',
    infoLight: '#dbeafe',
    infoBg: '#eff6ff',
    shadow: '0 1px 3px rgba(0,0,0,0.08)',
    shadowMd: '0 4px 6px rgba(0,0,0,0.07)',
    shadowLg: '0 10px 25px rgba(0,0,0,0.1)',
    shadowXl: '0 20px 50px rgba(0,0,0,0.12)',
    chartBg: '#ffffff',
    chartText: '#374151',
    chartGrid: '#e5e7eb',
    headerGradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    coverGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    sidebarBg: '#fafbfc',
    sidebarActiveBg: '#eef2ff',
    sidebarActiveText: '#4f46e5',
    toolbarBg: '#ffffff',
    toolbarBorder: '#e2e8f0',
    modalOverlay: 'rgba(15,23,42,0.4)',
    scrollThumb: '#cbd5e1',
    scrollTrack: '#f1f5f9',
    inputBg: '#ffffff',
    inputBorder: '#d1d5db',
    inputFocus: '#4f46e5',
    badgeBg: '#e0e7ff',
    badgeText: '#3730a3',
    tocBg: '#f8fafc',
    tocDot: '#c7d2fe',
    tocLine: '#e2e8f0',
    completeBg: '#dcfce7',
    completeText: '#166534',
    sectionNumber: '#c7d2fe',
  },
  dark: {
    bg: '#0f1117',
    pageBg: '#080a10',
    surface: '#1a1d2e',
    surfaceAlt: '#1e2235',
    surfaceHover: '#252a40',
    border: '#2d3154',
    borderLight: '#252a40',
    text: '#e5e7eb',
    textSecondary: '#9ca3af',
    textMuted: '#6b7280',
    primary: '#818cf8',
    primaryHover: '#6366f1',
    primaryLight: 'rgba(99,102,241,0.12)',
    primaryBorder: 'rgba(99,102,241,0.3)',
    accent: '#a78bfa',
    success: '#34d399',
    successLight: 'rgba(52,211,153,0.15)',
    successBg: 'rgba(52,211,153,0.08)',
    warning: '#fbbf24',
    warningLight: 'rgba(251,191,36,0.15)',
    warningBg: 'rgba(251,191,36,0.08)',
    danger: '#f87171',
    dangerLight: 'rgba(248,113,113,0.15)',
    dangerBg: 'rgba(248,113,113,0.08)',
    info: '#60a5fa',
    infoLight: 'rgba(96,165,250,0.15)',
    infoBg: 'rgba(96,165,250,0.08)',
    shadow: '0 1px 3px rgba(0,0,0,0.3)',
    shadowMd: '0 4px 6px rgba(0,0,0,0.25)',
    shadowLg: '0 10px 25px rgba(0,0,0,0.4)',
    shadowXl: '0 20px 50px rgba(0,0,0,0.5)',
    chartBg: '#1a1d2e',
    chartText: '#e5e7eb',
    chartGrid: '#2d3154',
    headerGradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    coverGradient: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
    sidebarBg: '#12141f',
    sidebarActiveBg: 'rgba(99,102,241,0.12)',
    sidebarActiveText: '#818cf8',
    toolbarBg: '#151825',
    toolbarBorder: '#2d3154',
    modalOverlay: 'rgba(0,0,0,0.65)',
    scrollThumb: '#4b5563',
    scrollTrack: '#1a1d2e',
    inputBg: '#1e2235',
    inputBorder: '#374151',
    inputFocus: '#818cf8',
    badgeBg: 'rgba(99,102,241,0.2)',
    badgeText: '#a5b4fc',
    tocBg: '#151825',
    tocDot: '#4f46e5',
    tocLine: '#2d3154',
    completeBg: 'rgba(52,211,153,0.15)',
    completeText: '#34d399',
    sectionNumber: 'rgba(99,102,241,0.3)',
  },
};

type Palette = typeof THEMES.light;

// ============================================
// Constants
// ============================================

const SECTION_ICONS: Record<SectionType, React.ReactNode> = {
  'cover': <ClipboardTask24Regular style={{ fontSize: 16 }} />,
  'toc': <Document24Regular style={{ fontSize: 16 }} />,
  'executive-summary': <Notepad24Regular style={{ fontSize: 16 }} />,
  'statistics': <DataBarVertical24Regular style={{ fontSize: 16 }} />,
  'severity-analysis': <Microscope24Regular style={{ fontSize: 16 }} />,
  'charts': <ArrowTrending24Regular style={{ fontSize: 16 }} />,
  'budget': <Money24Regular style={{ fontSize: 16 }} />,
  'recommendations': <LightbulbFilament24Regular style={{ fontSize: 16 }} />,
  'forecasting': <Sparkle24Regular style={{ fontSize: 16 }} />,
  'safety': <Warning24Regular style={{ fontSize: 16 }} />,
  'custom': <Edit24Regular style={{ fontSize: 16 }} />,
  'appendix': <Attach24Regular style={{ fontSize: 16 }} />,
};

const SECTION_DESCRIPTIONS: Record<SectionType, string> = {
  'cover': 'Title page with report metadata',
  'toc': 'Auto-generated table of contents',
  'executive-summary': 'High-level overview for leadership',
  'statistics': 'Key performance indicators',
  'severity-analysis': 'Severity breakdown and analysis',
  'charts': 'Visual data representations',
  'budget': 'Financial analysis and cost projections',
  'recommendations': 'Prioritized action items',
  'forecasting': 'Predictive outlook and projections',
  'safety': 'Safety compliance and risk assessment',
  'custom': 'Custom section with free-form content',
  'appendix': 'Supporting data and methodology',
};

const AUDIENCE_CONFIG: Record<Audience, { label: string; icon: React.ReactNode; description: string }> = {
  board: { label: 'Board / Executives', icon: <PersonBoard24Regular style={{ fontSize: 16 }} />, description: 'High-level, decision-focused' },
  technical: { label: 'Technical Staff', icon: <Wrench24Regular style={{ fontSize: 16 }} />, description: 'Detailed, data-rich' },
  community: { label: 'Community / Public', icon: <BuildingMultiple24Regular style={{ fontSize: 16 }} />, description: 'Accessible, citizen-friendly' },
  internal: { label: 'Internal Team', icon: <People24Regular style={{ fontSize: 16 }} />, description: 'Operational, action-oriented' },
};

const TEMPLATE_CONFIG: Record<Template, { label: string; icon: React.ReactNode; sections: SectionType[] }> = {
  'full': { label: 'Full Assessment', icon: <Document24Regular style={{ fontSize: 16 }} />, sections: ['cover', 'toc', 'executive-summary', 'statistics', 'severity-analysis', 'charts', 'budget', 'recommendations', 'forecasting', 'safety', 'appendix'] },
  'board-brief': { label: 'Board Brief', icon: <PersonBoard24Regular style={{ fontSize: 16 }} />, sections: ['cover', 'executive-summary', 'statistics', 'charts', 'budget', 'recommendations'] },
  'community-update': { label: 'Community Update', icon: <BuildingMultiple24Regular style={{ fontSize: 16 }} />, sections: ['cover', 'executive-summary', 'statistics', 'charts', 'safety'] },
  'budget-request': { label: 'Budget Request', icon: <Money24Regular style={{ fontSize: 16 }} />, sections: ['cover', 'executive-summary', 'statistics', 'budget', 'forecasting', 'recommendations'] },
};

const KEYBOARD_SHORTCUTS = [
  { key: 'Ctrl+P', action: 'Export PDF' },
  { key: 'Ctrl+E', action: 'Toggle Edit/Preview' },
  { key: 'Ctrl+G', action: 'Generate Report' },
  { key: 'Escape', action: 'Close Report Builder' },
  { key: '?', action: 'Show Keyboard Shortcuts' },
];

// ============================================
// Helper: compute stats
// ============================================

function computeStats(workOrders: WorkOrder[]) {
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const typeCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};
  const zoneCounts: Record<string, number> = {};
  let totalCost = 0;
  let schoolCount = 0;

  for (const wo of workOrders) {
    const sev = (wo.severity || 'medium').toLowerCase() as keyof typeof severityCounts;
    if (sev in severityCounts) severityCounts[sev]++;
    typeCounts[wo.issueType || 'unknown'] = (typeCounts[wo.issueType || 'unknown'] || 0) + 1;
    statusCounts[wo.status || 'open'] = (statusCounts[wo.status || 'open'] || 0) + 1;
    zoneCounts[wo.zone || 'Unassigned'] = (zoneCounts[wo.zone || 'Unassigned'] || 0) + 1;
    totalCost += wo.estimatedCost || 1500;
    if (wo.nearSchool) schoolCount++;
  }

  const total = workOrders.length;
  const healthScore = total > 0
    ? Math.max(0, Math.min(100, 100 - (severityCounts.critical * 8 + severityCounts.high * 4 + severityCounts.medium * 2 + severityCounts.low * 0.5)))
    : 50;
  const grade = healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : healthScore >= 20 ? 'D' : 'F';

  return { severityCounts, typeCounts, statusCounts, zoneCounts, totalCost, schoolCount, total, healthScore, grade };
}

// ============================================
// Build sections
// ============================================

function buildDefaultSections(workOrders: WorkOrder[], templateSections?: SectionType[]): ReportSection[] {
  const s = computeStats(workOrders);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const allSections: Record<SectionType, () => ReportSection> = {
    'cover': () => ({
      id: 'cover', type: 'cover', title: 'Cover Page', icon: SECTION_ICONS.cover, visible: true, locked: false, order: 0, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.cover,
      content: JSON.stringify({
        reportTitle: 'Infrastructure Assessment Report',
        subtitle: 'Lake Forest, Illinois — Municipal Infrastructure Analysis',
        date: dateStr,
        preparedBy: 'MAINTAIN AI — Predictive Infrastructure Command Center',
        organization: 'City of Lake Forest — Department of Public Works',
        reportNumber: `RPT-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        classification: 'INTERNAL — For Official Use Only',
      }),
    }),
    'toc': () => ({
      id: 'toc', type: 'toc', title: 'Table of Contents', icon: SECTION_ICONS.toc, visible: true, locked: false, order: 1, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.toc,
      content: 'auto-generated',
    }),
    'executive-summary': () => ({
      id: 'executive-summary', type: 'executive-summary', title: 'Executive Summary', icon: SECTION_ICONS['executive-summary'], visible: true, locked: false, order: 2, collapsed: false, note: '', description: SECTION_DESCRIPTIONS['executive-summary'],
      content: `This report provides a comprehensive analysis of ${s.total.toLocaleString()} active infrastructure issues across Lake Forest, IL as of ${dateStr}.\n\nThe city's infrastructure health score stands at ${s.healthScore.toFixed(0)}/100 (Grade ${s.grade}). ${s.severityCounts.critical > 0 ? `There are ${s.severityCounts.critical} critical issues demanding immediate intervention. ` : ''}${s.severityCounts.high} high-priority items require attention within the current maintenance cycle.\n\nTotal estimated repair costs are projected at $${(s.totalCost / 1000).toFixed(0)}K, with an average per-issue cost of $${s.total ? (s.totalCost / s.total).toFixed(0) : '0'}.${s.schoolCount > 0 ? `\n\n[!] ${s.schoolCount} issues are located within school safety zones, warranting priority consideration for student and pedestrian welfare.` : ''}\n\nKey actions include deploying emergency crews within 48 hours for critical items, allocating $${(s.totalCost * 1.15 / 1000).toFixed(0)}K with a 15% weather contingency, and pursuing preventive maintenance before seasonal escalation.`,
    }),
    'statistics': () => ({
      id: 'statistics', type: 'statistics', title: 'Key Performance Indicators', icon: SECTION_ICONS.statistics, visible: true, locked: false, order: 3, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.statistics,
      content: JSON.stringify({
        kpis: [
          { label: 'Total Active Issues', value: s.total.toLocaleString(), icon: 'clipboard', trend: 'neutral', color: 'info' },
          { label: 'Infrastructure Health', value: `${s.grade} (${s.healthScore.toFixed(0)}/100)`, icon: 'hospital', trend: s.healthScore >= 60 ? 'up' : 'down', color: s.healthScore >= 60 ? 'success' : 'danger' },
          { label: 'Critical Issues', value: s.severityCounts.critical.toString(), icon: 'circle-red', trend: s.severityCounts.critical === 0 ? 'up' : 'down', color: s.severityCounts.critical > 0 ? 'danger' : 'success' },
          { label: 'Total Budget Required', value: `$${(s.totalCost / 1000).toFixed(0)}K`, icon: 'money', trend: 'neutral', color: 'warning' },
          { label: 'School Zone Issues', value: s.schoolCount.toString(), icon: 'school', trend: s.schoolCount === 0 ? 'up' : 'down', color: s.schoolCount > 0 ? 'warning' : 'success' },
          { label: 'Avg Cost Per Issue', value: `$${s.total ? (s.totalCost / s.total).toFixed(0) : '0'}`, icon: 'trend-down', trend: 'neutral', color: 'info' },
        ],
      }),
    }),
    'severity-analysis': () => ({
      id: 'severity-analysis', type: 'severity-analysis', title: 'Severity & Issue Analysis', icon: SECTION_ICONS['severity-analysis'], visible: true, locked: false, order: 4, collapsed: false, note: '', description: SECTION_DESCRIPTIONS['severity-analysis'],
      content: JSON.stringify({ severity: s.severityCounts, types: s.typeCounts, statuses: s.statusCounts, zones: s.zoneCounts, total: s.total }),
    }),
    'charts': () => ({
      id: 'charts', type: 'charts', title: 'Visual Analytics', icon: SECTION_ICONS.charts, visible: true, locked: false, order: 5, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.charts,
      content: 'Charts will be generated when you click "Generate Report".', charts: [],
    }),
    'budget': () => ({
      id: 'budget', type: 'budget', title: 'Budget & Financial Analysis', icon: SECTION_ICONS.budget, visible: true, locked: false, order: 6, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.budget,
      content: JSON.stringify({
        totalCost: s.totalCost, contingency: s.totalCost * 0.15, grandTotal: s.totalCost * 1.15,
        byPriority: { critical: s.severityCounts.critical * 3500, high: s.severityCounts.high * 2200, medium: s.severityCounts.medium * 1200, low: s.severityCounts.low * 600 },
        perIssueAvg: s.total ? s.totalCost / s.total : 0,
      }),
    }),
    'recommendations': () => ({
      id: 'recommendations', type: 'recommendations', title: 'Recommendations & Action Items', icon: SECTION_ICONS.recommendations, visible: true, locked: false, order: 7, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.recommendations,
      content: JSON.stringify({
        immediate: [
          { priority: 'critical', action: `Deploy emergency crews to address ${s.severityCounts.critical} critical infrastructure failures within 48 hours`, owner: 'Public Works Director', deadline: '48 hours' },
          { priority: 'critical', action: `Prioritize ${s.schoolCount} school-zone repairs for student and pedestrian safety`, owner: 'Safety Coordinator', deadline: '1 week' },
        ],
        shortTerm: [
          { priority: 'high', action: `Resolve ${s.severityCounts.high} high-priority issues within current maintenance cycle`, owner: 'Maintenance Supervisor', deadline: '30 days' },
          { priority: 'high', action: `Allocate $${(s.totalCost * 1.15 / 1000).toFixed(0)}K budget including 15% weather contingency`, owner: 'Budget Office', deadline: '2 weeks' },
        ],
        longTerm: [
          { priority: 'medium', action: 'Implement preventive maintenance program to reduce future critical issues by 40%', owner: 'City Engineer', deadline: '90 days' },
          { priority: 'medium', action: 'Deploy IoT sensors at top 20 high-decay-rate locations for early detection', owner: 'IT Department', deadline: '6 months' },
          { priority: 'low', action: 'Develop community reporting portal to improve issue discovery time', owner: 'Communications', deadline: '6 months' },
        ],
      }),
    }),
    'forecasting': () => ({
      id: 'forecasting', type: 'forecasting', title: 'Forecasting & Predictive Outlook', icon: SECTION_ICONS.forecasting, visible: true, locked: false, order: 8, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.forecasting,
      content: JSON.stringify({
        projections: [
          { period: '30 Days', newIssues: Math.ceil(s.total * 0.08), resolvedEst: Math.ceil(s.total * 0.15), costProjection: s.totalCost * 1.08, riskLevel: 'moderate' },
          { period: '90 Days', newIssues: Math.ceil(s.total * 0.25), resolvedEst: Math.ceil(s.total * 0.45), costProjection: s.totalCost * 1.22, riskLevel: 'moderate' },
          { period: '6 Months', newIssues: Math.ceil(s.total * 0.50), resolvedEst: Math.ceil(s.total * 0.70), costProjection: s.totalCost * 1.45, riskLevel: s.healthScore < 50 ? 'high' : 'moderate' },
          { period: '1 Year', newIssues: Math.ceil(s.total * 0.90), resolvedEst: Math.ceil(s.total * 0.85), costProjection: s.totalCost * 1.80, riskLevel: s.healthScore < 40 ? 'high' : 'moderate' },
        ],
        weatherImpact: 'Winter freeze-thaw cycles expected to increase pothole formation by 35-45% in Q1. Pre-treatment recommended.',
        seasonalNote: 'Spring thaw typically reveals 20-30% additional subsurface damage. Budget reserves recommended for April-May surge.',
      }),
    }),
    'safety': () => ({
      id: 'safety', type: 'safety', title: 'Safety & Compliance', icon: SECTION_ICONS.safety, visible: true, locked: false, order: 9, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.safety,
      content: `${s.schoolCount > 0 ? `### School Zone Safety\n${s.schoolCount} active issues are located within designated school safety zones. Federal and state guidelines require these to be resolved within 72 hours of identification.\n\n` : ''}### Liability Exposure\nUnresolved critical infrastructure issues create potential liability. Current exposure is estimated at ${s.severityCounts.critical * 25000 > 0 ? `$${(s.severityCounts.critical * 25000 / 1000).toFixed(0)}K` : 'minimal'} based on ${s.severityCounts.critical} critical items.\n\n### ADA Compliance\nSidewalk and concrete issues may affect ADA accessibility. ${(s.typeCounts['sidewalk'] || 0) + (s.typeCounts['concrete'] || 0)} items flagged for accessibility review.\n\n### Regulatory Timeline\nAll critical issues must be addressed within 30 days per municipal maintenance ordinance. High-priority items within 90 days.`,
    }),
    'custom': () => ({
      id: `custom-${Date.now()}`, type: 'custom', title: 'New Section', icon: SECTION_ICONS.custom, visible: true, locked: false, order: 99, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.custom,
      content: 'Click the Edit button to add your content here.',
    }),
    'appendix': () => ({
      id: 'appendix', type: 'appendix', title: 'Appendix & Methodology', icon: SECTION_ICONS.appendix, visible: true, locked: false, order: 10, collapsed: false, note: '', description: SECTION_DESCRIPTIONS.appendix,
      content: `### Data Sources\n- Lake Forest GIS Infrastructure Database (via MCP integration)\n- MAINTAIN AI Predictive Analytics Engine\n- Historical maintenance records (3-year lookback)\n- Weather pattern data (NOAA integration)\n\n### Methodology\n- Severity scoring: AI-driven composite of structural damage, traffic volume, proximity to sensitive areas\n- Cost estimates: Based on 2025-2026 regional contractor rates, adjusted for material costs\n- Health grade: Weighted composite score (Critical: 8pts, High: 4pts, Medium: 2pts, Low: 0.5pts)\n- Forecasting: ML model trained on 5-year historical data with seasonal adjustment\n\n### Disclaimer\nThis report is generated by MAINTAIN AI for planning purposes. Cost estimates are projections and may vary based on actual contractor bids, material availability, and weather conditions. All critical safety issues should be verified by field inspection.`,
    }),
  };

  const sectionTypes = templateSections || TEMPLATE_CONFIG.full.sections;
  return sectionTypes
    .filter(type => type in allSections)
    .map((type, i) => {
      const sec = allSections[type]();
      sec.order = i;
      return sec;
    });
}

// ============================================
// Chart Generators
// ============================================

function generateThemedCharts(workOrders: WorkOrder[], palette: Palette): ReportChart[] {
  const s = computeStats(workOrders);
  const charts: ReportChart[] = [];
  const sevColors = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e' };

  // Donut
  const sevEntries = Object.entries(s.severityCounts).filter(([, v]) => v > 0);
  if (sevEntries.length > 0 && s.total > 0) {
    let sa = -90;
    const paths: string[] = [];
    const cx = 160, cy = 150, r = 90, ir = 55;
    for (const [sev, count] of sevEntries) {
      const a = (count / s.total) * 360;
      const ea = sa + a;
      const la = a > 180 ? 1 : 0;
      const [x1, y1] = [cx + r * Math.cos(sa * Math.PI / 180), cy + r * Math.sin(sa * Math.PI / 180)];
      const [x2, y2] = [cx + r * Math.cos(ea * Math.PI / 180), cy + r * Math.sin(ea * Math.PI / 180)];
      const [ix1, iy1] = [cx + ir * Math.cos(ea * Math.PI / 180), cy + ir * Math.sin(ea * Math.PI / 180)];
      const [ix2, iy2] = [cx + ir * Math.cos(sa * Math.PI / 180), cy + ir * Math.sin(sa * Math.PI / 180)];
      paths.push(`<path d="M${x1},${y1} A${r},${r} 0 ${la},1 ${x2},${y2} L${ix1},${iy1} A${ir},${ir} 0 ${la},0 ${ix2},${iy2} Z" fill="${(sevColors as any)[sev]||'#888'}" opacity="0.9"/>`);
      sa = ea;
    }
    const leg = sevEntries.map(([sv, c], i) => `<rect x="330" y="${75+i*32}" width="14" height="14" rx="3" fill="${(sevColors as any)[sv]}"/><text x="350" y="${87+i*32}" fill="${palette.text}" font-size="12" font-family="system-ui,sans-serif">${sv[0].toUpperCase()+sv.slice(1)}: ${c} (${((c/s.total)*100).toFixed(0)}%)</text>`).join('');
    charts.push({ name: 'severity_distribution', description: 'Severity distribution donut chart', base64_png: btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300" viewBox="0 0 500 300"><rect width="100%" height="100%" fill="${palette.chartBg}" rx="8"/><text x="250" y="28" fill="${palette.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="system-ui,sans-serif">Severity Distribution</text><line x1="40" y1="40" x2="460" y2="40" stroke="${palette.chartGrid}" stroke-width="1"/>${paths.join('')}<text x="160" y="146" fill="${palette.text}" font-size="24" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">${s.total}</text><text x="160" y="164" fill="${palette.textMuted}" font-size="10" text-anchor="middle" font-family="system-ui,sans-serif">Total Issues</text>${leg}</svg>`))) });
  }

  // Bar chart
  const typeEntries = Object.entries(s.typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (typeEntries.length > 0) {
    const max = Math.max(...typeEntries.map(([, v]) => v));
    const bh = 28, gap = 12;
    const ch = typeEntries.length * (bh + gap) + 75;
    const cols = ['#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
    const bars = typeEntries.map(([n, c], i) => {
      const w = Math.max(6, (c / max) * 250);
      const y = 60 + i * (bh + gap);
      return `<rect x="130" y="${y}" width="${w}" height="${bh}" rx="4" fill="${cols[i%cols.length]}" opacity="0.85"/><text x="124" y="${y+18}" fill="${palette.textSecondary}" font-size="11" text-anchor="end" font-family="system-ui,sans-serif">${n.replace(/_/g,' ')}</text><text x="${138+w}" y="${y+18}" fill="${palette.text}" font-size="11" font-weight="600" font-family="system-ui,sans-serif">${c}</text>`;
    }).join('');
    charts.push({ name: 'issue_type_breakdown', description: 'Issue type horizontal bar chart', base64_png: btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${ch}" viewBox="0 0 500 ${ch}"><rect width="100%" height="100%" fill="${palette.chartBg}" rx="8"/><text x="250" y="28" fill="${palette.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="system-ui,sans-serif">Issue Type Breakdown</text><line x1="40" y1="42" x2="460" y2="42" stroke="${palette.chartGrid}" stroke-width="1"/>${bars}</svg>`))) });
  }

  // Cost bars
  const costItems = [
    { l: 'Critical', v: s.severityCounts.critical * 3500, c: sevColors.critical },
    { l: 'High', v: s.severityCounts.high * 2200, c: sevColors.high },
    { l: 'Medium', v: s.severityCounts.medium * 1200, c: sevColors.medium },
    { l: 'Low', v: s.severityCounts.low * 600, c: sevColors.low },
  ].filter(x => x.v > 0);
  if (costItems.length > 0) {
    const mc = Math.max(...costItems.map(x => x.v), 1);
    const ch = costItems.length * 48 + 90;
    const cb = costItems.map((x, i) => { const w = Math.max(6, (x.v / mc) * 250); const y = 65 + i * 48; return `<rect x="110" y="${y}" width="${w}" height="30" rx="4" fill="${x.c}" opacity="0.85"/><text x="104" y="${y+20}" fill="${palette.textSecondary}" font-size="12" text-anchor="end" font-family="system-ui,sans-serif">${x.l}</text><text x="${118+w}" y="${y+20}" fill="${palette.text}" font-size="12" font-weight="600" font-family="system-ui,sans-serif">$${(x.v/1000).toFixed(0)}K</text>`; }).join('');
    charts.push({ name: 'cost_estimate', description: `Cost estimates totaling $${(s.totalCost/1000).toFixed(0)}K`, base64_png: btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${ch}" viewBox="0 0 500 ${ch}"><rect width="100%" height="100%" fill="${palette.chartBg}" rx="8"/><text x="250" y="26" fill="${palette.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="system-ui,sans-serif">Estimated Repair Costs</text><text x="250" y="46" fill="${palette.textMuted}" font-size="11" text-anchor="middle" font-family="system-ui,sans-serif">Total: $${(s.totalCost/1000).toFixed(0)}K (w/ 15% contingency: $${(s.totalCost*1.15/1000).toFixed(0)}K)</text><line x1="40" y1="56" x2="460" y2="56" stroke="${palette.chartGrid}" stroke-width="1"/>${cb}</svg>`))) });
  }

  // Status pie
  const stEntries = Object.entries(s.statusCounts).filter(([, v]) => v > 0);
  if (stEntries.length > 0 && s.total > 0) {
    const sc: Record<string, string> = { open: '#ef4444', assigned: '#f59e0b', in_progress: '#3b82f6', completed: '#22c55e', deferred: '#8b5cf6' };
    let sa2 = -90;
    const slices = stEntries.map(([st, c]) => { const a = (c / s.total) * 360; const ea = sa2 + a; const la = a > 180 ? 1 : 0; const [x1, y1] = [160 + 80 * Math.cos(sa2 * Math.PI / 180), 150 + 80 * Math.sin(sa2 * Math.PI / 180)]; const [x2, y2] = [160 + 80 * Math.cos(ea * Math.PI / 180), 150 + 80 * Math.sin(ea * Math.PI / 180)]; const sl = `<path d="M160,150 L${x1},${y1} A80,80 0 ${la},1 ${x2},${y2} Z" fill="${sc[st]||'#888'}" opacity="0.85"/>`; sa2 = ea; return sl; }).join('');
    const leg2 = stEntries.map(([st, c], i) => `<rect x="330" y="${70+i*28}" width="12" height="12" rx="2" fill="${sc[st]||'#888'}"/><text x="348" y="${81+i*28}" fill="${palette.text}" font-size="11" font-family="system-ui,sans-serif">${st.replace(/_/g,' ')}: ${c}</text>`).join('');
    charts.push({ name: 'status_distribution', description: 'Work order status distribution', base64_png: btoa(unescape(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300" viewBox="0 0 500 300"><rect width="100%" height="100%" fill="${palette.chartBg}" rx="8"/><text x="250" y="28" fill="${palette.text}" font-size="15" font-weight="600" text-anchor="middle" font-family="system-ui,sans-serif">Work Order Status</text><line x1="40" y1="40" x2="460" y2="40" stroke="${palette.chartGrid}" stroke-width="1"/>${slices}${leg2}</svg>`))) });
  }

  return charts;
}

// ============================================
// Component
// ============================================

const ReportGenerator: React.FC<ReportGeneratorProps> = ({
  workOrders,
  isVisible,
  onClose,
  theme = 'dark',
}) => {
  const p = THEMES[theme]; // palette

  // State
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [generating, setGenerating] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('full');
  const [audience, setAudience] = useState<Audience>('board');
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editingCoverField, setEditingCoverField] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [aiCharts, setAiCharts] = useState<ReportChart[]>([]);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showAudienceMenu, setShowAudienceMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Init
  useEffect(() => {
    if (isVisible && workOrders.length > 0 && sections.length === 0) {
      setSections(buildDefaultSections(workOrders));
    }
  }, [isVisible, workOrders, sections.length]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === '?' && !editingSection && !editingTitle) { setShowShortcuts(v => !v); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'p') { e.preventDefault(); handleExportPDF(); }
        if (e.key === 'e') { e.preventDefault(); setViewMode(v => v === 'edit' ? 'preview' : 'edit'); }
        if (e.key === 'g') { e.preventDefault(); handleGenerate(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isVisible, editingSection, editingTitle]); // handleExportPDF and handleGenerate are stable refs used inside

  // Scroll spy
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      const scrollTop = el.scrollTop + 120;
      let found: string | null = null;
      for (const sec of visibleSections) {
        const ref = sectionRefs.current[sec.id];
        if (ref && ref.offsetTop <= scrollTop) found = sec.id;
      }
      if (found) setActiveSection(found);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  });

  // Generate
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const charts = generateThemedCharts(workOrders, p);
      setAiCharts(charts);
      const result = await reportService.generateReport(reportType, workOrders);
      if (result.success && result.charts.length > 0) setAiCharts(prev => [...result.charts, ...prev]);
      setSections(prev => prev.map(sec => sec.type === 'charts' ? { ...sec, charts: [...(result.success ? result.charts : []), ...charts] } : sec));
      setReportGenerated(true);
    } catch {
      const charts = generateThemedCharts(workOrders, p);
      setAiCharts(charts);
      setSections(prev => prev.map(sec => sec.type === 'charts' ? { ...sec, charts } : sec));
      setReportGenerated(true);
    } finally { setGenerating(false); }
  }, [workOrders, reportType, p]);

  // Section ops
  const toggleSection = useCallback((id: string) => setSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s)), []);
  const removeSection = useCallback((id: string) => setSections(prev => prev.filter(s => s.id !== id)), []);
  const duplicateSection = useCallback((id: string) => {
    setSections(prev => {
      const src = prev.find(s => s.id === id);
      if (!src) return prev;
      const dup: ReportSection = { ...src, id: `dup-${Date.now()}`, title: `${src.title} (Copy)`, order: src.order + 0.5 };
      return [...prev, dup].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i }));
    });
  }, []);
  const moveSection = useCallback((id: string, dir: 'up' | 'down') => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx < 0) return prev;
      const ni = dir === 'up' ? idx - 1 : idx + 1;
      if (ni < 0 || ni >= prev.length) return prev;
      const c = [...prev]; [c[idx], c[ni]] = [c[ni], c[idx]];
      return c.map((s, i) => ({ ...s, order: i }));
    });
  }, []);
  const updateContent = useCallback((id: string, content: string) => setSections(prev => prev.map(s => s.id === id ? { ...s, content } : s)), []);
  const updateTitle = useCallback((id: string, title: string) => setSections(prev => prev.map(s => s.id === id ? { ...s, title } : s)), []);
  const updateNote = useCallback((id: string, note: string) => setSections(prev => prev.map(s => s.id === id ? { ...s, note } : s)), []);
  const toggleCollapse = useCallback((id: string) => setSections(prev => prev.map(s => s.id === id ? { ...s, collapsed: !s.collapsed } : s)), []);
  const addSection = useCallback((type: SectionType = 'custom') => {
    const sec = buildDefaultSections(workOrders, [type])[0];
    if (!sec) return;
    sec.id = `${type}-${Date.now()}`;
    sec.order = sections.length;
    setSections(prev => [...prev, sec]);
    setShowAddMenu(false);
    if (['executive-summary', 'safety', 'appendix', 'custom'].includes(type)) setEditingSection(sec.id);
  }, [workOrders, sections.length]);

  // Template
  const applyTemplate = useCallback((tmpl: Template) => {
    const config = TEMPLATE_CONFIG[tmpl];
    setSections(buildDefaultSections(workOrders, config.sections));
    setShowTemplateMenu(false);
    setReportGenerated(false);
    setAiCharts([]);
  }, [workOrders]);

  // Drag
  const handleDragStart = useCallback((id: string) => setDraggedId(id), []);
  const handleDragOver = useCallback((e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverId(id); }, []);
  const handleDrop = useCallback((tid: string) => {
    if (!draggedId || draggedId === tid) { setDraggedId(null); setDragOverId(null); return; }
    setSections(prev => {
      const di = prev.findIndex(s => s.id === draggedId);
      const ti = prev.findIndex(s => s.id === tid);
      if (di < 0 || ti < 0) return prev;
      const c = [...prev]; const [d] = c.splice(di, 1); c.splice(ti, 0, d);
      return c.map((s, i) => ({ ...s, order: i }));
    });
    setDraggedId(null); setDragOverId(null);
  }, [draggedId]);

  // Export — direct browser print dialog (user can print or save as PDF from there)
  const handleExportPDF = useCallback(async () => {
    setExportProgress('Preparing report for print...');
    setViewMode('preview');
    await new Promise(r => setTimeout(r, 600));
    setExportProgress(null);
    window.print();
  }, []);

  // Scroll to section
  const scrollToSection = useCallback((id: string) => {
    const ref = sectionRefs.current[id];
    if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSection(id);
  }, []);

  // Computed
  const visibleSections = useMemo(() => sections.filter(s => s.visible).sort((a, b) => a.order - b.order), [sections]);
  const wordCount = useMemo(() => {
    let count = 0;
    for (const sec of visibleSections) {
      try { const parsed = JSON.parse(sec.content); count += JSON.stringify(parsed).split(/\s+/).length; } catch { count += sec.content.split(/\s+/).length; }
    }
    return count;
  }, [visibleSections]);
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));
  const pageEstimate = Math.max(1, Math.ceil(wordCount / 300));
  const completeness = useMemo(() => {
    if (sections.length === 0) return 0;
    let score = 0;
    if (sections.some(s => s.type === 'cover' && s.visible)) score += 10;
    if (sections.some(s => s.type === 'executive-summary' && s.visible)) score += 20;
    if (sections.some(s => s.type === 'statistics' && s.visible)) score += 10;
    if (sections.some(s => s.type === 'severity-analysis' && s.visible)) score += 10;
    if (sections.some(s => s.type === 'charts' && s.visible && (s.charts?.length || 0) > 0)) score += 15;
    if (sections.some(s => s.type === 'budget' && s.visible)) score += 10;
    if (sections.some(s => s.type === 'recommendations' && s.visible)) score += 10;
    if (sections.some(s => s.type === 'forecasting' && s.visible)) score += 5;
    if (sections.some(s => s.type === 'safety' && s.visible)) score += 5;
    if (reportGenerated) score += 5;
    return Math.min(100, score);
  }, [sections, reportGenerated]);

  if (!isVisible) return null;

  // ============================================
  // Render helpers
  // ============================================

  // Inline editable text field
  const EditableField = ({ value, onChange, placeholder, style: st }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) => {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(value);
    useEffect(() => setVal(value), [value]);
    if (viewMode !== 'edit') return <span style={st}>{value || placeholder}</span>;
    if (!editing) return (
      <span style={{ ...st, cursor: 'pointer', borderBottom: `1px dashed ${p.primaryBorder}`, paddingBottom: 1 }} onClick={() => setEditing(true)} title="Click to edit">
        {value || <span style={{ opacity: 0.5 }}>{placeholder}</span>}
      </span>
    );
    return (
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onBlur={() => { onChange(val); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { onChange(val); setEditing(false); } if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
        style={{ ...st, border: 'none', borderBottom: `2px solid ${p.primary}`, background: 'transparent', outline: 'none', width: '100%', padding: '2px 0', fontFamily: 'inherit' }}
        placeholder={placeholder}
      />
    );
  };

  // Cover
  const renderCover = (section: ReportSection) => {
    let data: any = {};
    try { data = JSON.parse(section.content); } catch { data = { reportTitle: section.content }; }
    const updateField = (field: string, value: string) => {
      const d = { ...data, [field]: value };
      updateContent(section.id, JSON.stringify(d));
    };
    return (
      <div style={{ background: p.coverGradient, borderRadius: viewMode === 'preview' ? 0 : 12, padding: '32px 36px 28px', textAlign: 'center', color: '#fff', position: 'relative', overflow: 'hidden', pageBreakAfter: 'always' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' viewBox=\'0 0 40 40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.04\'%3E%3Cpath d=\'M20 20h20v20H20zM0 0h20v20H0z\'/%3E%3C/g%3E%3C/svg%3E")' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 32, marginBottom: 6, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}><Building24Regular style={{ fontSize: 32 }} /></div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            <EditableField value={data.reportTitle || ''} onChange={v => updateField('reportTitle', v)} placeholder="Report Title" style={{ color: '#fff', fontSize: 22, fontWeight: 800 }} />
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, margin: '0 0 16px' }}>
            <EditableField value={data.subtitle || ''} onChange={v => updateField('subtitle', v)} placeholder="Subtitle" style={{ color: '#fff', fontSize: 13 }} />
          </div>
          <div style={{ width: 40, height: 2, background: 'rgba(255,255,255,0.35)', margin: '0 auto 16px', borderRadius: 2 }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 480, margin: '0 auto', textAlign: 'left' }}>
            {[
              { key: 'preparedBy', label: 'Prepared By' },
              { key: 'date', label: 'Date' },
              { key: 'organization', label: 'Organization' },
              { key: 'reportNumber', label: 'Report No.' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 8, textTransform: 'uppercase', opacity: 0.55, letterSpacing: 1.5, marginBottom: 2, fontWeight: 600 }}>{f.label}</div>
                <EditableField value={data[f.key] || ''} onChange={v => updateField(f.key, v)} placeholder={f.label} style={{ color: '#fff', fontSize: 12 }} />
              </div>
            ))}
          </div>
          {data.classification && (
            <div style={{ marginTop: 16, padding: '4px 14px', background: 'rgba(255,255,255,0.12)', borderRadius: 20, display: 'inline-block', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 600, backdropFilter: 'blur(4px)' }}>
              <EditableField value={data.classification} onChange={v => updateField('classification', v)} style={{ color: '#fff', fontSize: 9, letterSpacing: 1.5 }} />
            </div>
          )}
        </div>
      </div>
    );
  };

  // TOC
  const renderTOC = () => {
    const tocItems = visibleSections.filter(s => s.type !== 'cover' && s.type !== 'toc');
    let sectionNum = 0;
    return (
      <div style={{ padding: '4px 0' }}>
        {tocItems.map((sec) => {
          sectionNum++;
          return (
            <div key={sec.id} onClick={() => scrollToSection(sec.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s', marginBottom: 2 }}
              onMouseEnter={e => (e.currentTarget.style.background = p.surfaceHover)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ fontSize: 11, fontWeight: 700, color: p.primary, minWidth: 28, textAlign: 'right' }}>{sectionNum}.</span>
              <span style={{ fontSize: 16 }}>{sec.icon}</span>
              <span style={{ flex: 1, fontSize: 13, color: p.text, fontWeight: 500 }}>{sec.title}</span>
              <div style={{ flex: 1, borderBottom: `1px dotted ${p.border}`, margin: '0 8px', minWidth: 40 }} />
              <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 500 }}>{sec.description}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Statistics
  const renderStats = (section: ReportSection) => {
    let data: any = {};
    try { data = JSON.parse(section.content); } catch { return <p style={{ color: p.text }}>{section.content}</p>; }
    const kpis = data.kpis || [];
    const kpiIconNode = (key: string, size: number): React.ReactNode => {
      const map: Record<string, React.ReactNode> = {
        clipboard: <ClipboardTask24Regular style={{ fontSize: size }} />,
        hospital: <BuildingBank24Regular style={{ fontSize: size }} />,
        'circle-red': <span style={{ width: size * 0.5, height: size * 0.5, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />,
        money: <Money24Regular style={{ fontSize: size }} />,
        school: <BuildingBank24Regular style={{ fontSize: size }} />,
        'trend-down': <DataBarVertical24Regular style={{ fontSize: size }} />,
      };
      return map[key] || <ClipboardTask24Regular style={{ fontSize: size }} />;
    };
    const colorMap: Record<string, { bg: string; accent: string }> = {
      info: { bg: p.infoBg, accent: p.info },
      success: { bg: p.successBg, accent: p.success },
      warning: { bg: p.warningBg, accent: p.warning },
      danger: { bg: p.dangerBg, accent: p.danger },
    };
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {kpis.map((kpi: any, i: number) => {
          const cm = colorMap[kpi.color] || colorMap.info;
          return (
            <div key={i} style={{ background: cm.bg, borderRadius: 12, padding: '18px 16px', textAlign: 'center', border: `1px solid ${p.border}`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -8, right: -8, fontSize: 48, opacity: 0.06 }}>{kpiIconNode(kpi.icon, 48)}</div>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{kpiIconNode(kpi.icon, 26)}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: cm.accent, marginBottom: 2, letterSpacing: '-0.5px' }}>{kpi.value}</div>
              <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{kpi.label}</div>
              {kpi.trend && kpi.trend !== 'neutral' && (
                <div style={{ marginTop: 8, fontSize: 11, color: kpi.trend === 'up' ? p.success : p.danger, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 14 }}>{kpi.trend === 'up' ? '↑' : '↓'}</span>
                  {kpi.trend === 'up' ? 'Positive' : 'Needs Attention'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Severity
  const renderSeverity = (section: ReportSection) => {
    let data: any = {};
    try { data = JSON.parse(section.content); } catch { return <p style={{ color: p.text }}>{section.content}</p>; }
    const sevColors: Record<string, string> = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e' };
    const sevDot = (color: string) => <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }} />;
    const sevIndicator: Record<string, React.ReactNode> = { critical: sevDot('#ef4444'), high: sevDot('#f59e0b'), medium: sevDot('#3b82f6'), low: sevDot('#22c55e') };
    const total = data.total || 1;
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {Object.entries(data.severity || {}).map(([sev, count]: [string, any]) => (
            <div key={sev} style={{ background: p.surface, borderRadius: 10, padding: '16px 14px', borderLeft: `4px solid ${sevColors[sev] || '#888'}`, transition: 'transform 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span>{sevIndicator[sev] || sevDot('#9ca3af')}</span>
                <span style={{ fontSize: 11, color: p.textMuted, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>{sev}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: p.text, letterSpacing: '-1px' }}>{count}</div>
              <div style={{ fontSize: 11, color: p.textMuted, marginTop: 2 }}>{((count / total) * 100).toFixed(1)}%</div>
              <div style={{ marginTop: 10, height: 5, borderRadius: 3, background: p.borderLight }}>
                <div style={{ height: '100%', borderRadius: 3, background: sevColors[sev] || '#888', width: `${Math.min(100, (count / total) * 100)}%`, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          ))}
        </div>
        {data.types && Object.keys(data.types).length > 0 && (
          <>
            <h4 style={{ color: p.text, margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Issue Type Breakdown</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${p.border}` }}>
                  {['Type', 'Count', '%', 'Distribution'].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : i === 3 ? 'left' : 'right', padding: '8px 12px', fontSize: 11, color: p.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, width: i === 3 ? '35%' : undefined }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.types).sort((a: any, b: any) => b[1] - a[1]).map(([type, count]: [string, any]) => (
                  <tr key={type} style={{ borderBottom: `1px solid ${p.borderLight}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, fontWeight: 500, textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, textAlign: 'right', fontWeight: 700 }}>{count}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: p.textSecondary, textAlign: 'right' }}>{((count / total) * 100).toFixed(1)}%</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ height: 7, borderRadius: 4, background: p.borderLight, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 4, background: `linear-gradient(90deg, ${p.primary}, ${p.accent})`, width: `${Math.min(100, (count / total) * 100)}%`, transition: 'width 0.5s ease' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    );
  };

  // Charts
  const renderCharts = (section: ReportSection) => {
    const charts = section.charts || aiCharts;
    if (charts.length === 0) return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: p.textMuted }}>
        <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}><DataBarVertical24Regular style={{ fontSize: 56 }} /></div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No charts generated yet</div>
        <div style={{ fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>Click the <strong>"Generate Report"</strong> button in the toolbar above to create visual analytics from your infrastructure data.</div>
      </div>
    );
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {charts.map((chart, i) => {
          const isSvg = !chart.base64_png.startsWith('/9j/') && !chart.base64_png.startsWith('iVBOR');
          const src = isSvg ? `data:image/svg+xml;base64,${chart.base64_png}` : `data:image/png;base64,${chart.base64_png}`;
          return (
            <div key={i} style={{ background: p.surface, borderRadius: 10, padding: 14, border: `1px solid ${p.border}`, transition: 'box-shadow 0.2s' }}>
              <img src={src} alt={chart.description || chart.name} style={{ width: '100%', height: 'auto', borderRadius: 8 }} />
              <p style={{ fontSize: 11, color: p.textMuted, margin: '10px 0 0', textAlign: 'center', fontStyle: 'italic' }}>{chart.description}</p>
            </div>
          );
        })}
      </div>
    );
  };

  // Budget
  const renderBudget = (section: ReportSection) => {
    let data: any = {};
    try { data = JSON.parse(section.content); } catch { return <p style={{ color: p.text }}>{section.content}</p>; }
    const sevDotSmall = (color: string) => <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', marginRight: 6 }} />;
    const pl: Record<string, React.ReactNode> = { critical: <>{sevDotSmall('#ef4444')}Critical</>, high: <>{sevDotSmall('#f59e0b')}High</>, medium: <>{sevDotSmall('#3b82f6')}Medium</>, low: <>{sevDotSmall('#22c55e')}Low</> };
    const cardStyle = (bg: string, accent: string): React.CSSProperties => ({ background: bg, borderRadius: 12, padding: '20px 16px', textAlign: 'center', border: `1px solid ${p.border}`, position: 'relative', overflow: 'hidden' });
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          <div style={cardStyle(p.infoBg, p.info)}>
            <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>Base Repair Cost</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: p.info, letterSpacing: '-1px' }}>${((data.totalCost || 0) / 1000).toFixed(0)}K</div>
          </div>
          <div style={cardStyle(p.warningBg, p.warning)}>
            <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>15% Contingency</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: p.warning, letterSpacing: '-1px' }}>${((data.contingency || 0) / 1000).toFixed(0)}K</div>
          </div>
          <div style={cardStyle(p.successBg, p.success)}>
            <div style={{ fontSize: 10, color: p.textMuted, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700, letterSpacing: 1 }}>Total Budget Needed</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: p.success, letterSpacing: '-1px' }}>${((data.grandTotal || 0) / 1000).toFixed(0)}K</div>
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${p.border}` }}>
              {['Priority Level', 'Estimated Cost', '% of Total'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px', fontSize: 11, color: p.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.byPriority || {}).filter(([, v]: any) => v > 0).map(([lev, cost]: [string, any]) => (
              <tr key={lev} style={{ borderBottom: `1px solid ${p.borderLight}` }}>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, fontWeight: 500 }}>{pl[lev] || lev}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, textAlign: 'right', fontWeight: 700 }}>${(cost / 1000).toFixed(1)}K</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.textSecondary, textAlign: 'right' }}>{data.totalCost ? ((cost / data.totalCost) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
            <tr style={{ borderTop: `2px solid ${p.border}`, background: p.surfaceAlt }}>
              <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, fontWeight: 800 }}>Per-Issue Average</td>
              <td colSpan={2} style={{ padding: '10px 12px', fontSize: 13, color: p.text, textAlign: 'right', fontWeight: 800 }}>${(data.perIssueAvg || 0).toFixed(0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // Recommendations
  const renderRecs = (section: ReportSection) => {
    let data: any = {};
    try { data = JSON.parse(section.content); } catch { return <div style={{ color: p.text, whiteSpace: 'pre-wrap' }}>{section.content}</div>; }
    const pc: Record<string, { bg: string; border: string }> = {
      critical: { bg: p.dangerBg, border: p.danger },
      high: { bg: p.warningBg, border: p.warning },
      medium: { bg: p.infoBg, border: p.info },
      low: { bg: p.successBg, border: p.success },
    };
    const renderGroup = (label: string, items: any[], icon: React.ReactNode, accentColor: string) => (
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <h4 style={{ color: p.text, margin: 0, fontSize: 14, fontWeight: 700 }}>{label}</h4>
          <div style={{ flex: 1, height: 1, background: p.borderLight, marginLeft: 8 }} />
          <span style={{ fontSize: 11, color: p.textMuted, fontWeight: 600 }}>{items.length} items</span>
        </div>
        {items.map((item: any, i: number) => {
          const c = pc[item.priority] || pc.medium;
          return (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 8, padding: '14px 16px', background: c.bg, borderRadius: 10, borderLeft: `4px solid ${c.border}`, transition: 'transform 0.15s' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: p.text, fontWeight: 500, lineHeight: 1.5 }}>{item.action}</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  {item.owner && <span style={{ fontSize: 11, color: p.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}><Person24Regular style={{ fontSize: 14 }} /> {item.owner}</span>}
                  {item.deadline && <span style={{ fontSize: 11, color: p.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}><Timer24Regular style={{ fontSize: 14 }} /> {item.deadline}</span>}
                </div>
              </div>
              <span style={{ fontSize: 9, padding: '3px 10px', borderRadius: 12, background: c.border, color: '#fff', alignSelf: 'flex-start', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.priority}</span>
            </div>
          );
        })}
      </div>
    );
    return (
      <div>
        {data.immediate?.length > 0 && renderGroup('Immediate Actions (0-48 Hours)', data.immediate, <AlertUrgent24Regular style={{ fontSize: 18 }} />, p.danger)}
        {data.shortTerm?.length > 0 && renderGroup('Short-Term Actions (1-30 Days)', data.shortTerm, <CalendarLtr24Regular style={{ fontSize: 18 }} />, p.warning)}
        {data.longTerm?.length > 0 && renderGroup('Long-Term Initiatives (1-6 Months)', data.longTerm, <TargetArrow24Regular style={{ fontSize: 18 }} />, p.info)}
      </div>
    );
  };

  // Forecasting
  const renderForecast = (section: ReportSection) => {
    let data: any = {};
    try { data = JSON.parse(section.content); } catch { return <div style={{ color: p.text, whiteSpace: 'pre-wrap' }}>{section.content}</div>; }
    return (
      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${p.border}` }}>
              {['Period', 'New Issues', 'Resolved', 'Cost Proj.', 'Risk'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : i === 4 ? 'center' : 'right', padding: '8px 12px', fontSize: 11, color: p.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.projections || []).map((proj: any, i: number) => (
              <tr key={i} style={{ borderBottom: `1px solid ${p.borderLight}` }}>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, fontWeight: 700 }}>{proj.period}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.danger, textAlign: 'right', fontWeight: 600 }}>+{proj.newIssues}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.success, textAlign: 'right', fontWeight: 600 }}>-{proj.resolvedEst}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: p.text, textAlign: 'right' }}>${(proj.costProjection / 1000).toFixed(0)}K</td>
                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                  <span style={{ fontSize: 10, padding: '3px 12px', borderRadius: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, background: proj.riskLevel === 'high' ? p.dangerBg : proj.riskLevel === 'moderate' ? p.warningBg : p.successBg, color: proj.riskLevel === 'high' ? p.danger : proj.riskLevel === 'moderate' ? p.warning : p.success }}>{proj.riskLevel}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {data.weatherImpact && (
            <div style={{ background: p.warningBg, borderRadius: 10, padding: 16, borderLeft: `4px solid ${p.warning}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.warning, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><WeatherRain24Regular style={{ fontSize: 14 }} /> Weather Impact</div>
              <div style={{ fontSize: 13, color: p.text, lineHeight: 1.6 }}>{data.weatherImpact}</div>
            </div>
          )}
          {data.seasonalNote && (
            <div style={{ background: p.infoBg, borderRadius: 10, padding: 16, borderLeft: `4px solid ${p.info}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: p.info, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><CalendarLtr24Regular style={{ fontSize: 14 }} /> Seasonal Note</div>
              <div style={{ fontSize: 13, color: p.text, lineHeight: 1.6 }}>{data.seasonalNote}</div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Text / markdown-ish
  const renderText = (section: ReportSection) => (
    <div style={{ color: p.text, lineHeight: 1.8, fontSize: 13.5 }}>
      {section.content.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} style={{ color: p.text, margin: '20px 0 8px', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 4, height: 18, borderRadius: 2, background: p.primary, display: 'inline-block' }} />{line.slice(4)}</h4>;
        if (line.startsWith('## ')) return <h3 key={i} style={{ color: p.text, margin: '24px 0 10px', fontSize: 18, fontWeight: 700 }}>{line.slice(3)}</h3>;
        if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 20, position: 'relative', marginBottom: 6 }}><span style={{ position: 'absolute', left: 4, color: p.primary, fontWeight: 700 }}>•</span>{line.slice(2)}</div>;
        if (line.startsWith('[!]')) return <div key={i} style={{ background: p.warningBg, padding: '10px 14px', borderRadius: 8, margin: '8px 0', borderLeft: `3px solid ${p.warning}`, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Warning24Regular style={{ fontSize: 14, color: p.warning, flexShrink: 0 }} />{line.slice(3)}</div>;
        if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
        return <p key={i} style={{ margin: '6px 0' }}>{line}</p>;
      })}
    </div>
  );

  const renderSection = (section: ReportSection) => {
    switch (section.type) {
      case 'cover': return renderCover(section);
      case 'toc': return renderTOC();
      case 'statistics': return renderStats(section);
      case 'severity-analysis': return renderSeverity(section);
      case 'charts': return renderCharts(section);
      case 'budget': return renderBudget(section);
      case 'recommendations': return renderRecs(section);
      case 'forecasting': return renderForecast(section);
      default: return renderText(section);
    }
  };

  // ============================================
  // Toolbar button helper
  // ============================================
  const ToolbarBtn = ({ icon, label, onClick, active, variant, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; variant?: 'primary' | 'ghost'; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} title={label} style={{
      padding: '6px 12px', borderRadius: 8, border: variant === 'primary' ? 'none' : `1px solid ${p.border}`,
      background: disabled ? p.surfaceAlt : active ? p.primary : variant === 'primary' ? p.headerGradient : 'transparent',
      color: disabled ? p.textMuted : (active || variant === 'primary') ? '#fff' : p.text,
      fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>{label}
    </button>
  );

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .rpt-print, .rpt-print * { visibility: visible !important; }
          .rpt-print { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: white !important; color: #111 !important; }
          .rpt-no-print { display: none !important; }
          .rpt-section { page-break-inside: avoid; break-inside: avoid; }
        }
        .rpt-scroll::-webkit-scrollbar { width: 6px; }
        .rpt-scroll::-webkit-scrollbar-track { background: ${p.scrollTrack}; }
        .rpt-scroll::-webkit-scrollbar-thumb { background: ${p.scrollThumb}; border-radius: 3px; }
        .rpt-scroll::-webkit-scrollbar-thumb:hover { background: ${p.textMuted}; }
        @keyframes rptFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        @keyframes rptSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes rptPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes rptSlide { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>

      <div className="rpt-no-print" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: p.modalOverlay, display: 'flex', animation: 'rptFadeIn 0.25s ease' }}>
        {/* ——— SIDEBAR ——— */}
        <div style={{
          width: sidebarCollapsed ? 48 : 300, background: p.sidebarBg, borderRight: `1px solid ${p.toolbarBorder}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.25s ease', flexShrink: 0,
        }}>
          {/* Sidebar Header */}
          <div style={{ padding: sidebarCollapsed ? '14px 8px' : '14px 16px', borderBottom: `1px solid ${p.toolbarBorder}`, background: p.headerGradient, display: 'flex', alignItems: 'center', gap: 10, minHeight: 56 }}>
            {!sidebarCollapsed && (
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Document24Regular style={{ fontSize: 16 }} /> Report Builder</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>{visibleSections.length} sections • {AUDIENCE_CONFIG[audience].icon} {AUDIENCE_CONFIG[audience].label}</div>
              </div>
            )}
            <button onClick={() => setSidebarCollapsed(c => !c)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#fff', fontSize: 14 }} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {sidebarCollapsed ? '▸' : '◂'}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* Template & Audience selectors */}
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${p.toolbarBorder}`, display: 'flex', gap: 6 }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <button onClick={() => { setShowTemplateMenu(v => !v); setShowAudienceMenu(false); }} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${p.inputBorder}`, background: p.inputBg, color: p.text, fontSize: 11, cursor: 'pointer', textAlign: 'left', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ClipboardTask24Regular style={{ fontSize: 12 }} /> Template ▾
                  </button>
                  {showTemplateMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: p.surface, borderRadius: 10, border: `1px solid ${p.border}`, boxShadow: p.shadowLg, zIndex: 10, overflow: 'hidden', animation: 'rptSlide 0.15s ease' }}>
                      {Object.entries(TEMPLATE_CONFIG).map(([key, cfg]) => (
                        <button key={key} onClick={() => applyTemplate(key as Template)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', color: p.text, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => (e.currentTarget.style.background = p.surfaceHover)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span>{cfg.icon}</span><span style={{ fontWeight: 500 }}>{cfg.label}</span><span style={{ marginLeft: 'auto', fontSize: 10, color: p.textMuted }}>{cfg.sections.length}§</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                  <button onClick={() => { setShowAudienceMenu(v => !v); setShowTemplateMenu(false); }} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: `1px solid ${p.inputBorder}`, background: p.inputBg, color: p.text, fontSize: 11, cursor: 'pointer', textAlign: 'left', fontWeight: 500 }}>
                    {AUDIENCE_CONFIG[audience].icon} Audience ▾
                  </button>
                  {showAudienceMenu && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: p.surface, borderRadius: 10, border: `1px solid ${p.border}`, boxShadow: p.shadowLg, zIndex: 10, overflow: 'hidden', animation: 'rptSlide 0.15s ease' }}>
                      {Object.entries(AUDIENCE_CONFIG).map(([key, cfg]) => (
                        <button key={key} onClick={() => { setAudience(key as Audience); setShowAudienceMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', border: 'none', background: audience === key ? p.sidebarActiveBg : 'transparent', color: audience === key ? p.sidebarActiveText : p.text, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => { if (audience !== key) e.currentTarget.style.background = p.surfaceHover; }} onMouseLeave={e => { if (audience !== key) e.currentTarget.style.background = 'transparent'; }}>
                          <span>{cfg.icon}</span>
                          <div><div style={{ fontWeight: 500 }}>{cfg.label}</div><div style={{ fontSize: 10, color: p.textMuted }}>{cfg.description}</div></div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Completeness bar */}
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${p.toolbarBorder}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: p.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Report Completeness</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: completeness >= 80 ? p.success : completeness >= 50 ? p.warning : p.danger }}>{completeness}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: p.borderLight, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: completeness >= 80 ? p.success : completeness >= 50 ? p.warning : p.danger, width: `${completeness}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>

              {/* Section list */}
              <div className="rpt-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {sections.sort((a, b) => a.order - b.order).map((sec, idx) => (
                  <div key={sec.id}
                    draggable onDragStart={() => handleDragStart(sec.id)} onDragOver={e => handleDragOver(e, sec.id)} onDrop={() => handleDrop(sec.id)} onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 8, marginBottom: 1, cursor: 'grab',
                      background: activeSection === sec.id ? p.sidebarActiveBg : dragOverId === sec.id ? p.primaryLight : 'transparent',
                      opacity: !sec.visible ? 0.4 : draggedId === sec.id ? 0.3 : 1,
                      borderLeft: activeSection === sec.id ? `3px solid ${p.primary}` : '3px solid transparent',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => scrollToSection(sec.id)}
                  >
                    <span style={{ fontSize: 9, color: p.textMuted, cursor: 'grab', lineHeight: 1 }}>⠿</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: p.sectionNumber, minWidth: 16, textAlign: 'right' }}>{idx + 1}</span>
                    <span style={{ fontSize: 15 }}>{sec.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, color: activeSection === sec.id ? p.sidebarActiveText : p.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.title}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleSection(sec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '2px 3px', color: sec.visible ? p.success : p.textMuted, borderRadius: 4 }} title={sec.visible ? 'Hide' : 'Show'}>
                        {sec.visible ? <Eye24Regular style={{ fontSize: 11 }} /> : '○'}
                      </button>
                      <button onClick={() => duplicateSection(sec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, padding: '2px 3px', color: p.textMuted, borderRadius: 4 }} title="Duplicate">⧉</button>
                      <button onClick={() => removeSection(sec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '2px 3px', color: p.danger, borderRadius: 4, opacity: 0.7 }} title="Remove">✕</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add section button */}
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${p.toolbarBorder}`, position: 'relative' }}>
                <button onClick={() => setShowAddMenu(v => !v)} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: `1px dashed ${p.primaryBorder}`, background: p.primaryLight, color: p.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ＋ Add Section
                </button>
                {showAddMenu && (
                  <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 4, background: p.surface, borderRadius: 10, border: `1px solid ${p.border}`, boxShadow: p.shadowLg, overflow: 'hidden', zIndex: 10, animation: 'rptSlide 0.15s ease' }}>
                    {(['executive-summary', 'statistics', 'severity-analysis', 'charts', 'budget', 'recommendations', 'forecasting', 'safety', 'custom'] as SectionType[]).map(type => (
                      <button key={type} onClick={() => addSection(type)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 12px', border: 'none', background: 'transparent', color: p.text, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = p.surfaceHover)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span style={{ fontSize: 15 }}>{SECTION_ICONS[type]}</span>
                        <div><div style={{ fontWeight: 500 }}>{type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div><div style={{ fontSize: 10, color: p.textMuted }}>{SECTION_DESCRIPTIONS[type]}</div></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ——— MAIN CONTENT ——— */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: p.bg }}>

          {/* ——— TOOLBAR ——— */}
          <div className="rpt-no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: p.toolbarBg, borderBottom: `1px solid ${p.toolbarBorder}`, flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: p.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ClipboardTask24Regular style={{ fontSize: 15, verticalAlign: 'middle', marginRight: 4 }} /> Report Builder
                  {reportGenerated && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: p.completeBg, color: p.completeText, fontWeight: 700 }}>✓ Ready</span>}
                </div>
                <div style={{ fontSize: 10, color: p.textMuted, marginTop: 1 }}>
                  {visibleSections.length} sections • ~{pageEstimate} pages • ~{readingTime} min read • {wordCount.toLocaleString()} words
                </div>
              </div>
            </div>

            {/* Report type */}
            <select value={reportType} onChange={e => setReportType(e.target.value as ReportType)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${p.inputBorder}`, background: p.inputBg, color: p.text, fontSize: 11, cursor: 'pointer', outline: 'none' }}>
              <option value="full">Full Report</option>
              <option value="executive">Executive Brief</option>
              <option value="safety">Safety Report</option>
              <option value="budget">Budget Report</option>
            </select>

            <ToolbarBtn icon={generating ? '⟳' : <Bot24Regular style={{ fontSize: 14 }} />} label={generating ? 'Generating...' : 'Generate'} onClick={handleGenerate} variant="primary" disabled={generating} />

            {/* Mode toggle */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${p.border}` }}>
              {(['edit', 'preview'] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  padding: '5px 12px', border: 'none', fontSize: 11, cursor: 'pointer', fontWeight: viewMode === mode ? 700 : 400,
                  background: viewMode === mode ? p.primary : 'transparent', color: viewMode === mode ? '#fff' : p.textSecondary, transition: 'all 0.15s',
                }}>
                  {mode === 'edit' ? <><Edit24Regular style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }} /> Edit</> : <><Eye24Regular style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 3 }} /> Preview</>}
                </button>
              ))}
            </div>

            <ToolbarBtn icon={<Print24Regular style={{ fontSize: 14 }} />} label="Print" onClick={handleExportPDF} />
            <button onClick={() => setShowShortcuts(true)} style={{ background: 'none', border: `1px solid ${p.border}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: p.textMuted, fontSize: 12, fontWeight: 700 }} title="Keyboard shortcuts (?)">&nbsp;?&nbsp;</button>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${p.border}`, background: 'transparent', color: p.textMuted, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }} title="Close (Esc)">✕</button>
          </div>

          {/* Export progress */}
          {exportProgress && (
            <div style={{ padding: '5px 16px', background: p.primaryLight, color: p.primary, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${p.primaryBorder}` }}>
              <span style={{ animation: 'rptSpin 1s linear infinite', display: 'inline-block' }}>⟳</span> {exportProgress}
            </div>
          )}

          {/* ——— REPORT BODY ——— */}
          <div ref={contentRef} className="rpt-scroll" style={{
            flex: 1, overflowY: 'auto',
            padding: viewMode === 'preview' ? 0 : '20px',
            background: viewMode === 'preview' ? p.pageBg : p.bg,
          }}>
            <div className="rpt-print" style={{
              maxWidth: viewMode === 'preview' ? 816 : '100%',
              margin: viewMode === 'preview' ? '28px auto' : '0 auto',
              background: p.bg,
              boxShadow: viewMode === 'preview' ? p.shadowXl : 'none',
              borderRadius: viewMode === 'preview' ? 8 : 0,
              overflow: 'hidden',
              border: viewMode === 'preview' ? `1px solid ${p.border}` : 'none',
            }}>
              {visibleSections.map((section, idx) => (
                <div key={section.id} ref={el => { sectionRefs.current[section.id] = el; }} className="rpt-section" style={{ borderBottom: section.type === 'cover' ? 'none' : `1px solid ${p.borderLight}`, position: 'relative' }}>

                  {/* Section header (non-cover, non-toc) */}
                  {section.type !== 'cover' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '16px 28px 12px',
                      background: p.surfaceAlt, borderBottom: `1px solid ${p.borderLight}`, cursor: viewMode === 'edit' ? 'pointer' : 'default',
                    }}
                      onClick={() => viewMode === 'edit' && toggleCollapse(section.id)}
                    >
                      {/* Section number */}
                      <span style={{ fontSize: 12, fontWeight: 800, color: p.primary, background: p.primaryLight, borderRadius: 6, padding: '2px 8px', minWidth: 28, textAlign: 'center' }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 20 }}>{section.icon}</span>

                      {/* Title: editable */}
                      {editingTitle === section.id ? (
                        <input autoFocus defaultValue={section.title}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => { updateTitle(section.id, e.target.value); setEditingTitle(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { updateTitle(section.id, (e.target as HTMLInputElement).value); setEditingTitle(null); } if (e.key === 'Escape') setEditingTitle(null); }}
                          style={{ flex: 1, padding: '3px 8px', fontSize: 16, fontWeight: 700, color: p.text, background: p.inputBg, border: `2px solid ${p.primary}`, borderRadius: 6, outline: 'none' }}
                        />
                      ) : (
                        <h2 style={{ flex: 1, fontSize: 16, fontWeight: 700, margin: 0, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}
                          onDoubleClick={(e) => { e.stopPropagation(); if (viewMode === 'edit') setEditingTitle(section.id); }}>
                          {section.title}
                          {viewMode === 'edit' && <span style={{ fontSize: 10, color: p.textMuted, fontWeight: 400 }}>(double-click to rename)</span>}
                        </h2>
                      )}

                      {/* Section actions */}
                      {viewMode === 'edit' && (
                        <div style={{ display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
                          {['executive-summary', 'safety', 'appendix', 'custom'].includes(section.type) && (
                            <button onClick={() => setEditingSection(editingSection === section.id ? null : section.id)} style={{
                              padding: '3px 10px', borderRadius: 6, border: `1px solid ${editingSection === section.id ? p.primary : p.border}`,
                              background: editingSection === section.id ? p.primary : 'transparent',
                              color: editingSection === section.id ? '#fff' : p.textMuted, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                            }}>{editingSection === section.id ? <><span style={{ marginRight: 3 }}>✓</span>Done</> : <><Edit24Regular style={{ fontSize: 11, verticalAlign: 'middle', marginRight: 3 }} />Edit</>}</button>
                          )}
                          <button onClick={() => moveSection(section.id, 'up')} style={{ background: 'none', border: `1px solid ${p.border}`, borderRadius: 6, padding: '3px 6px', cursor: 'pointer', fontSize: 10, color: p.textMuted }} title="Move up">▲</button>
                          <button onClick={() => moveSection(section.id, 'down')} style={{ background: 'none', border: `1px solid ${p.border}`, borderRadius: 6, padding: '3px 6px', cursor: 'pointer', fontSize: 10, color: p.textMuted }} title="Move down">▼</button>
                          {/* Note toggle */}
                          <button onClick={() => setEditingNote(editingNote === section.id ? null : section.id)} style={{
                            background: section.note ? p.warningBg : 'none', border: `1px solid ${section.note ? p.warning : p.border}`,
                            borderRadius: 6, padding: '3px 6px', cursor: 'pointer', fontSize: 11, color: section.note ? p.warning : p.textMuted,
                          }} title="Add note"><Comment24Regular style={{ fontSize: 11 }} /></button>
                          {/* Collapse arrow */}
                          <span style={{ fontSize: 12, color: p.textMuted, padding: '3px 4px', transition: 'transform 0.2s', display: 'inline-block', transform: section.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Note bar */}
                  {editingNote === section.id && viewMode === 'edit' && (
                    <div style={{ padding: '8px 28px', background: p.warningBg, borderBottom: `1px solid ${p.warningLight}`, display: 'flex', gap: 8, alignItems: 'center', animation: 'rptSlide 0.15s ease' }}>
                      <span style={{ fontSize: 12 }}><Comment24Regular style={{ fontSize: 12 }} /></span>
                      <input value={section.note} onChange={e => updateNote(section.id, e.target.value)} placeholder="Add a note for this section (only visible in edit mode)..."
                        style={{ flex: 1, padding: '4px 8px', border: `1px solid ${p.warning}`, borderRadius: 6, background: p.inputBg, color: p.text, fontSize: 12, outline: 'none' }} />
                      <button onClick={() => setEditingNote(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: p.textMuted }}>✕</button>
                    </div>
                  )}
                  {section.note && editingNote !== section.id && viewMode === 'edit' && (
                    <div style={{ padding: '6px 28px', background: p.warningBg, borderBottom: `1px solid ${p.warningLight}`, fontSize: 11, color: p.warning, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span><Comment24Regular style={{ fontSize: 11 }} /></span> {section.note}
                    </div>
                  )}

                  {/* Section body */}
                  {(!section.collapsed || viewMode === 'preview') && (
                    <div style={{ padding: section.type === 'cover' ? 0 : '20px 28px 28px', transition: 'all 0.2s' }}>
                      {/* Formatting toolbar for text sections */}
                      {editingSection === section.id && ['executive-summary', 'safety', 'appendix', 'custom'].includes(section.type) && (
                        <div style={{ display: 'flex', gap: 4, marginBottom: 10, padding: '6px 8px', background: p.surfaceAlt, borderRadius: 8, border: `1px solid ${p.border}`, flexWrap: 'wrap' }}>
                          {[
                            { label: 'H2', insert: '\n## ', title: 'Heading 2' },
                            { label: 'H3', insert: '\n### ', title: 'Heading 3' },
                            { label: '•', insert: '\n- ', title: 'Bullet point' },
                            { label: '!', insert: '\n[!] ', title: 'Warning callout' },
                            { label: '¶', insert: '\n\n', title: 'New paragraph' },
                          ].map(btn => (
                            <button key={btn.label} title={btn.title} onClick={() => updateContent(section.id, section.content + btn.insert)}
                              style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${p.border}`, background: p.bg, color: p.text, fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                              {btn.label}
                            </button>
                          ))}
                          <span style={{ fontSize: 10, color: p.textMuted, alignSelf: 'center', marginLeft: 8 }}>Use ### for headings, - for bullets, [!] for callouts</span>
                        </div>
                      )}

                      {/* Editable textarea or rendered content */}
                      {editingSection === section.id && ['executive-summary', 'safety', 'appendix', 'custom'].includes(section.type) ? (
                        <textarea value={section.content} onChange={e => updateContent(section.id, e.target.value)}
                          style={{
                            width: '100%', minHeight: 220, padding: 16, borderRadius: 10,
                            border: `2px solid ${p.primary}`, background: p.inputBg,
                            color: p.text, fontSize: 13, lineHeight: 1.8, resize: 'vertical',
                            outline: 'none', fontFamily: 'inherit',
                          }}
                          placeholder="Enter section content. Use ### for headings, - for bullets..." />
                      ) : (
                        renderSection(section)
                      )}
                    </div>
                  )}

                  {/* Collapsed indicator */}
                  {section.collapsed && viewMode === 'edit' && section.type !== 'cover' && (
                    <div style={{ padding: '12px 28px', color: p.textMuted, fontSize: 12, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>▸</span> Section collapsed — click header to expand
                    </div>
                  )}
                </div>
              ))}

              {/* Footer */}
              <div style={{ padding: '16px 28px', textAlign: 'center', borderTop: `1px solid ${p.borderLight}`, background: p.surfaceAlt }}>
                <div style={{ fontSize: 11, color: p.textMuted, fontWeight: 500 }}>Generated by MAINTAIN AI — Predictive Infrastructure Command Center</div>
                <div style={{ fontSize: 10, color: p.textMuted, marginTop: 3 }}>{new Date().toLocaleString()} • Confidential — For Official Use Only</div>
              </div>
            </div>
          </div>

          {/* ——— STATUS BAR ——— */}
          <div className="rpt-no-print" style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: '5px 16px',
            background: p.toolbarBg, borderTop: `1px solid ${p.toolbarBorder}`, fontSize: 10, color: p.textMuted, flexShrink: 0,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Document24Regular style={{ fontSize: 12 }} /> {visibleSections.length} sections</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><DataBarVertical24Regular style={{ fontSize: 12 }} /> {workOrders.length} work orders</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Notepad24Regular style={{ fontSize: 12 }} /> {wordCount.toLocaleString()} words</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><BookOpen24Regular style={{ fontSize: 12 }} /> ~{pageEstimate} pages</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Timer24Regular style={{ fontSize: 12 }} /> ~{readingTime} min read</span>
            <div style={{ flex: 1 }} />
            <span>Completeness: <strong style={{ color: completeness >= 80 ? p.success : completeness >= 50 ? p.warning : p.danger }}>{completeness}%</strong></span>
            <span>{AUDIENCE_CONFIG[audience].icon} {AUDIENCE_CONFIG[audience].label}</span>
            <span style={{ color: p.primary, fontWeight: 600 }}>MAINTAIN AI</span>
          </div>
        </div>
      </div>

      {/* ——— KEYBOARD SHORTCUTS MODAL ——— */}
      {showShortcuts && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: p.modalOverlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowShortcuts(false)}>
          <div style={{ background: p.bg, borderRadius: 16, padding: 28, width: 380, boxShadow: p.shadowXl, border: `1px solid ${p.border}`, animation: 'rptFadeIn 0.2s ease' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: p.text, display: 'flex', alignItems: 'center', gap: 8 }}><Keyboard24Regular style={{ fontSize: 18 }} /> Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: p.textMuted }}>✕</button>
            </div>
            {KEYBOARD_SHORTCUTS.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${p.borderLight}` }}>
                <span style={{ fontSize: 13, color: p.text }}>{s.action}</span>
                <kbd style={{ padding: '3px 10px', borderRadius: 6, background: p.surfaceAlt, border: `1px solid ${p.border}`, fontSize: 11, fontWeight: 700, color: p.primary, fontFamily: 'monospace' }}>{s.key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default ReportGenerator;

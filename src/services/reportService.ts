/**
 * MAINTAIN AI — Report Generation Service
 *
 * Calls the Python report agent (Code Interpreter) to generate
 * infrastructure reports with AI narrative + matplotlib charts.
 * Falls back to local SVG placeholder generation when the agent
 * API is unreachable.
 */

import type { WorkOrder } from '../types/infrastructure';

// ============================================
// Types
// ============================================

export interface ReportChart {
  name: string;
  base64_png: string;
  description: string;
}

export interface ReportMetadata {
  model: string;
  report_type: string;
  processing_time_ms: number;
  data_points: number;
  charts_generated: number;
  generated_at: string;
}

export interface ReportResult {
  success: boolean;
  narrative: string;
  charts: ReportChart[];
  metadata: ReportMetadata;
}

export type ReportType = 'full' | 'executive' | 'safety' | 'budget';

// ============================================
// Agent API URL
// ============================================

const AGENT_API_URL = process.env.REACT_APP_AGENT_API_URL || '';

let apiAvailable: boolean | null = null;

// ============================================
// Service
// ============================================

/**
 * Generate a full infrastructure report with AI narrative and charts.
 */
async function generateReport(
  reportType: ReportType = 'full',
  workOrders: WorkOrder[] = [],
  customPrompt?: string,
): Promise<ReportResult> {
  // Try the Python agent first
  const agentResult = await callReportApi(reportType, workOrders, customPrompt);
  if (agentResult) return agentResult;

  // Fall back to local generation
  console.info('[ReportService] Agent API unavailable, generating local report');
  return generateLocalReport(reportType, workOrders);
}

/**
 * Call the Python report agent API.
 */
async function callReportApi(
  reportType: ReportType,
  workOrders: WorkOrder[],
  customPrompt?: string,
): Promise<ReportResult | null> {
  if (apiAvailable === false || !AGENT_API_URL) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000); // 2 minute timeout for chart generation

    const resp = await fetch(`${AGENT_API_URL}/api/agents/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        report_type: reportType,
        custom_prompt: customPrompt || null,
        workOrders: workOrders.map(wo => ({
          id: wo.id,
          issueType: wo.issueType,
          severity: wo.severity,
          address: wo.address,
          nearSchool: wo.nearSchool,
          status: wo.status,
          estimatedCost: wo.estimatedCost,
          latitude: wo.latitude,
          longitude: wo.longitude,
        })),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) throw new Error(`Report API ${resp.status}`);
    apiAvailable = true;
    return await resp.json() as ReportResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Content Security Policy')) {
      apiAvailable = false;
    }
    console.warn('[ReportService] Agent API failed:', msg);
    return null;
  }
}

/**
 * Reset API availability (allow retry after agent restart).
 */
export function resetReportApi(): void {
  apiAvailable = null;
}

// ============================================
// Local Fallback Report
// ============================================

function generateLocalReport(reportType: ReportType, workOrders: WorkOrder[]): ReportResult {
  const start = performance.now();
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const typeCounts: Record<string, number> = {};
  let totalCost = 0;
  let schoolProximity = 0;

  for (const wo of workOrders) {
    const sev = (wo.severity || 'medium').toLowerCase() as keyof typeof severityCounts;
    if (sev in severityCounts) severityCounts[sev]++;
    const t = wo.issueType || 'unknown';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    totalCost += wo.estimatedCost || 1500;
    if (wo.nearSchool) schoolProximity++;
  }

  const total = workOrders.length;
  const healthScore = total > 0
    ? Math.max(0, 100 - (severityCounts.critical * 8 + severityCounts.high * 4 + severityCounts.medium * 2 + severityCounts.low * 0.5))
    : 50;
  const grade = healthScore >= 80 ? 'A' : healthScore >= 60 ? 'B' : healthScore >= 40 ? 'C' : healthScore >= 20 ? 'D' : 'F';

  const typeBreakdown = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- **${k.replace(/_/g, ' ')}**: ${v} issues (${((v / total) * 100).toFixed(1)}%)`)
    .join('\n');

  const narrative = `# Lake Forest Infrastructure Report

**Generated:** ${new Date().toLocaleString()}  
**Report Type:** ${reportType.charAt(0).toUpperCase() + reportType.slice(1)}  
**Infrastructure Health Grade:** ${grade} (${healthScore.toFixed(0)}/100)

---

## Executive Summary

Analysis of **${total.toLocaleString()} active infrastructure issues** across Lake Forest, IL reveals 
${severityCounts.critical > 0 ? `**${severityCounts.critical} critical** issues requiring immediate attention, ` : ''}${severityCounts.high} high-priority items, and an estimated **$${(totalCost / 1000).toFixed(0)}K** in total repair costs.
${schoolProximity > 0 ? `[!] **${schoolProximity} issues** are located near schools — these should be prioritized for safety.` : ''}

## Severity Distribution

| Level | Count | Percentage |
|-------|-------|------------|
| !! Critical | ${severityCounts.critical} | ${total ? ((severityCounts.critical / total) * 100).toFixed(1) : 0}% |
| ! High | ${severityCounts.high} | ${total ? ((severityCounts.high / total) * 100).toFixed(1) : 0}% |
| - Medium | ${severityCounts.medium} | ${total ? ((severityCounts.medium / total) * 100).toFixed(1) : 0}% |
| ~ Low | ${severityCounts.low} | ${total ? ((severityCounts.low / total) * 100).toFixed(1) : 0}% |

## Issue Type Breakdown

${typeBreakdown || '- No data available'}

## Budget Estimate

| Category | Estimated Cost |
|----------|---------------|
| Total Repair Costs | **$${(totalCost / 1000).toFixed(0)}K** |
| Per-Issue Average | $${total ? (totalCost / total).toFixed(0) : '0'} |
| Critical Issues Only | $${((severityCounts.critical * 3500 + severityCounts.high * 2200) / 1000).toFixed(0)}K |

## Top 5 Recommendations

1. **Address ${severityCounts.critical} critical issues immediately** — deploy emergency crews within 48 hours
2. **Prioritize ${schoolProximity} school-zone repairs** — safety-first approach for student welfare
3. **Allocate $${(totalCost * 1.15 / 1000).toFixed(0)}K budget** — includes 15% contingency for weather delays
4. **Deploy ${Math.ceil(total / 50)} crews** — based on current workload capacity analysis
5. **Schedule preventive maintenance** — address medium-severity issues before winter escalation

---

*Generated by MAINTAIN AI — Predictive Infrastructure Command Center*  
*Data sourced from Lake Forest GIS via MAINTAIN MCP*
`;

  // Generate local SVG charts as fallback
  const charts = generateLocalCharts(severityCounts, typeCounts, totalCost, total);

  return {
    success: true,
    narrative,
    charts,
    metadata: {
      model: 'local-fallback',
      report_type: reportType,
      processing_time_ms: performance.now() - start,
      data_points: total,
      charts_generated: charts.length,
      generated_at: new Date().toISOString(),
    },
  };
}

// ============================================
// Local SVG Chart Generation
// ============================================

function svgToPngBase64(svgString: string, width: number, height: number): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve('');
      return;
    }
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png').split(',')[1]);
    };
    img.onerror = () => resolve('');
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)));
  });
}

function generateLocalCharts(
  severityCounts: Record<string, number>,
  typeCounts: Record<string, number>,
  totalCost: number,
  total: number,
): ReportChart[] {
  // We'll generate simple inline SVG data URIs as fallback
  // These will be replaced by actual base64 PNGs from the Python agent when available
  const charts: ReportChart[] = [];
  const dark = '#1a1a2e';
  const colors = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e' };

  // Chart 1: Severity donut (SVG)
  const sevEntries = Object.entries(severityCounts).filter(([, v]) => v > 0);
  if (sevEntries.length > 0) {
    let startAngle = 0;
    const paths: string[] = [];
    const cx = 200, cy = 170, r = 100, innerR = 60;

    for (const [sev, count] of sevEntries) {
      const pct = count / total;
      const angle = pct * 360;
      const endAngle = startAngle + angle;
      const largeArc = angle > 180 ? 1 : 0;

      const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
      const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
      const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
      const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
      const ix1 = cx + innerR * Math.cos((endAngle * Math.PI) / 180);
      const iy1 = cy + innerR * Math.sin((endAngle * Math.PI) / 180);
      const ix2 = cx + innerR * Math.cos((startAngle * Math.PI) / 180);
      const iy2 = cy + innerR * Math.sin((startAngle * Math.PI) / 180);

      paths.push(
        `<path d="M${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} L${ix1},${iy1} A${innerR},${innerR} 0 ${largeArc},0 ${ix2},${iy2} Z" fill="${(colors as Record<string, string>)[sev] || '#888'}"/>`
      );
      startAngle = endAngle;
    }

    const legendItems = sevEntries.map(([sev, count], i) =>
      `<rect x="320" y="${40 + i * 28}" width="14" height="14" rx="3" fill="${(colors as Record<string, string>)[sev]}"/>` +
      `<text x="340" y="${52 + i * 28}" fill="#e5e5e5" font-size="13">${sev.charAt(0).toUpperCase() + sev.slice(1)}: ${count} (${((count / total) * 100).toFixed(0)}%)</text>`
    ).join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${Math.max(340, 60 + sevEntries.length * 28)}" viewBox="0 0 500 ${Math.max(340, 60 + sevEntries.length * 28)}">
      <rect width="100%" height="100%" fill="${dark}" rx="12"/>
      <text x="200" y="35" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">Severity Distribution</text>
      ${paths.join('\n')}
      <text x="200" y="166" fill="#ffffff" font-size="24" font-weight="bold" text-anchor="middle">${total}</text>
      <text x="200" y="185" fill="#999" font-size="11" text-anchor="middle">Total Issues</text>
      ${legendItems}
    </svg>`;

    charts.push({
      name: 'severity_distribution',
      base64_png: btoa(unescape(encodeURIComponent(svg))),
      description: 'Severity distribution donut chart',
    });
  }

  // Chart 2: Issue type bar chart (SVG)
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (typeEntries.length > 0) {
    const maxVal = Math.max(...typeEntries.map(([, v]) => v));
    const barHeight = 30;
    const gap = 12;
    const chartH = typeEntries.length * (barHeight + gap) + 80;
    const barColors = ['#6366f1', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];

    const bars = typeEntries.map(([name, count], i) => {
      const w = (count / maxVal) * 300;
      const y = 60 + i * (barHeight + gap);
      return `<rect x="120" y="${y}" width="${w}" height="${barHeight}" rx="4" fill="${barColors[i % barColors.length]}"/>` +
        `<text x="115" y="${y + 20}" fill="#e5e5e5" font-size="12" text-anchor="end">${name.replace(/_/g, ' ')}</text>` +
        `<text x="${125 + w}" y="${y + 20}" fill="#ffffff" font-size="12" font-weight="bold">${count}</text>`;
    }).join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${chartH}" viewBox="0 0 500 ${chartH}">
      <rect width="100%" height="100%" fill="${dark}" rx="12"/>
      <text x="250" y="35" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">Issue Type Breakdown</text>
      ${bars}
    </svg>`;

    charts.push({
      name: 'issue_type_breakdown',
      base64_png: btoa(unescape(encodeURIComponent(svg))),
      description: 'Horizontal bar chart of issue types',
    });
  }

  // Chart 3: Cost estimate (SVG)
  {
    const critCost = severityCounts.critical * 3500;
    const highCost = severityCounts.high * 2200;
    const medCost = severityCounts.medium * 1200;
    const lowCost = severityCounts.low * 600;
    const costs = [
      { label: 'Critical', value: critCost, color: colors.critical },
      { label: 'High', value: highCost, color: colors.high },
      { label: 'Medium', value: medCost, color: colors.medium },
      { label: 'Low', value: lowCost, color: colors.low },
    ].filter(c => c.value > 0);

    const maxCost = Math.max(...costs.map(c => c.value), 1);
    const chartH = costs.length * 50 + 100;

    const costBars = costs.map((c, i) => {
      const w = (c.value / maxCost) * 280;
      const y = 70 + i * 50;
      return `<rect x="100" y="${y}" width="${w}" height="32" rx="4" fill="${c.color}"/>` +
        `<text x="95" y="${y + 22}" fill="#e5e5e5" font-size="12" text-anchor="end">${c.label}</text>` +
        `<text x="${108 + w}" y="${y + 22}" fill="#ffffff" font-size="12" font-weight="bold">$${(c.value / 1000).toFixed(0)}K</text>`;
    }).join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="${chartH}" viewBox="0 0 500 ${chartH}">
      <rect width="100%" height="100%" fill="${dark}" rx="12"/>
      <text x="250" y="30" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">Estimated Repair Costs</text>
      <text x="250" y="52" fill="#999" font-size="13" text-anchor="middle">Total: $${(totalCost / 1000).toFixed(0)}K</text>
      ${costBars}
    </svg>`;

    charts.push({
      name: 'cost_estimate',
      base64_png: btoa(unescape(encodeURIComponent(svg))),
      description: `Estimated repair costs totaling $${(totalCost / 1000).toFixed(0)}K`,
    });
  }

  return charts;
}

// ============================================
// Export
// ============================================

const reportService = {
  generateReport,
  resetReportApi,
};

export default reportService;

/**
 * MAINTAIN AI - Custom Pricing & Parameters Service
 * 
 * Allows public works users to define their own material costs,
 * labor rates, crew parameters, and analysis settings.
 * Persists to localStorage so settings survive between sessions.
 */

// ============================================
// Types
// ============================================

export interface MaterialCost {
  id: string;
  name: string;
  unit: string;         // e.g., "ton", "bag", "sq ft", "linear ft"
  costPerUnit: number;
  category: 'pothole' | 'sidewalk' | 'concrete' | 'general';
  description: string;
}

export interface LaborRate {
  id: string;
  role: string;         // e.g., "Crew Lead", "Laborer", "Equipment Operator"
  hourlyRate: number;
  overtimeRate: number;
}

export interface CrewTemplate {
  id: string;
  name: string;
  specialization: 'pothole' | 'sidewalk' | 'concrete' | 'general';
  memberCount: number;
  hoursPerDay: number;
  ordersPerDay: number; // how many work orders one crew can handle per day
  laborRoles: string[]; // IDs of LaborRate entries
}

export interface RepairCostTemplate {
  id: string;
  issueType: 'pothole' | 'sidewalk' | 'concrete';
  severity: 'low' | 'medium' | 'high' | 'critical';
  baseLaborHours: number;
  materials: Array<{ materialId: string; quantity: number }>;
  equipmentCostFlat: number; // flat equipment cost per job
  description: string;
}

export interface AnalysisParameters {
  // Cluster analysis
  clusterCount: number;
  
  // Forecast
  forecastDays: number;
  simulationRuns: number;
  
  // Weather multipliers
  weatherMultipliers: {
    clear: number;
    cloudy: number;
    rain: number;
    snow: number;
    freezing: number;
    freeze_thaw: number;
  };
  
  // Severity weights (for prioritization)
  severityWeights: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  
  // Priority factors
  schoolProximityWeight: number;
  ageDecayWeight: number;
  densityWeight: number;
  
  // Crew availability
  defaultCrewAvailability: number; // percentage
  
  // Budget
  annualBudget: number;
  contingencyPercent: number;
}

export interface UserPricingConfig {
  materials: MaterialCost[];
  laborRates: LaborRate[];
  crewTemplates: CrewTemplate[];
  repairCosts: RepairCostTemplate[];
  analysisParams: AnalysisParameters;
  lastUpdated: string;
  configName: string;
}

// ============================================
// Default Configuration
// ============================================

const DEFAULT_MATERIALS: MaterialCost[] = [
  // Pothole materials
  { id: 'mat-coldpatch', name: 'Cold Patch Asphalt', unit: 'bag (50lb)', costPerUnit: 18, category: 'pothole', description: 'Quick-set cold mix for temporary repairs' },
  { id: 'mat-hotmix', name: 'Hot Mix Asphalt', unit: 'ton', costPerUnit: 125, category: 'pothole', description: 'Standard hot mix for permanent repairs' },
  { id: 'mat-tack', name: 'Tack Coat', unit: 'gallon', costPerUnit: 8, category: 'pothole', description: 'Bonding agent between old and new asphalt' },
  { id: 'mat-gravel', name: 'Crushed Gravel Base', unit: 'ton', costPerUnit: 35, category: 'pothole', description: 'Base material for deep repairs' },
  
  // Sidewalk materials
  { id: 'mat-concrete-std', name: 'Ready-Mix Concrete', unit: 'cubic yard', costPerUnit: 165, category: 'sidewalk', description: 'Standard 4000 PSI concrete mix' },
  { id: 'mat-rebar', name: 'Rebar (#4)', unit: 'linear ft', costPerUnit: 1.25, category: 'sidewalk', description: 'Reinforcement steel' },
  { id: 'mat-forms', name: 'Form Lumber', unit: 'board ft', costPerUnit: 3.50, category: 'sidewalk', description: 'Reusable forming lumber' },
  { id: 'mat-curing', name: 'Curing Compound', unit: 'gallon', costPerUnit: 22, category: 'sidewalk', description: 'Concrete curing compound' },
  
  // Concrete materials
  { id: 'mat-concrete-hi', name: 'High-Strength Concrete', unit: 'cubic yard', costPerUnit: 195, category: 'concrete', description: '5000+ PSI structural concrete' },
  { id: 'mat-mesh', name: 'Wire Mesh', unit: 'sheet (5x10)', costPerUnit: 15, category: 'concrete', description: 'Welded wire reinforcement' },
  { id: 'mat-sealant', name: 'Joint Sealant', unit: 'tube', costPerUnit: 12, category: 'concrete', description: 'Flexible expansion joint sealant' },
  
  // General
  { id: 'mat-paint', name: 'Traffic Paint', unit: 'gallon', costPerUnit: 35, category: 'general', description: 'Road marking paint' },
  { id: 'mat-signs', name: 'Work Zone Signs', unit: 'each', costPerUnit: 45, category: 'general', description: 'Temporary work zone signage' },
  { id: 'mat-barricades', name: 'Barricades', unit: 'each', costPerUnit: 25, category: 'general', description: 'Type III barricades' },
];

const DEFAULT_LABOR_RATES: LaborRate[] = [
  { id: 'labor-lead', role: 'Crew Lead', hourlyRate: 38, overtimeRate: 57 },
  { id: 'labor-worker', role: 'Laborer', hourlyRate: 25, overtimeRate: 37.50 },
  { id: 'labor-operator', role: 'Equipment Operator', hourlyRate: 35, overtimeRate: 52.50 },
  { id: 'labor-flagger', role: 'Flagger/Traffic Control', hourlyRate: 22, overtimeRate: 33 },
  { id: 'labor-inspector', role: 'Inspector', hourlyRate: 42, overtimeRate: 63 },
];

const DEFAULT_CREW_TEMPLATES: CrewTemplate[] = [
  {
    id: 'crew-pothole',
    name: 'Pothole Repair Crew',
    specialization: 'pothole',
    memberCount: 3,
    hoursPerDay: 8,
    ordersPerDay: 8,
    laborRoles: ['labor-lead', 'labor-worker', 'labor-worker'],
  },
  {
    id: 'crew-sidewalk',
    name: 'Sidewalk Repair Crew',
    specialization: 'sidewalk',
    memberCount: 4,
    hoursPerDay: 8,
    ordersPerDay: 3,
    laborRoles: ['labor-lead', 'labor-worker', 'labor-worker', 'labor-operator'],
  },
  {
    id: 'crew-concrete',
    name: 'Concrete Repair Crew',
    specialization: 'concrete',
    memberCount: 5,
    hoursPerDay: 8,
    ordersPerDay: 2,
    laborRoles: ['labor-lead', 'labor-worker', 'labor-worker', 'labor-operator', 'labor-flagger'],
  },
];

const DEFAULT_REPAIR_COSTS: RepairCostTemplate[] = [
  // Potholes
  { id: 'repair-pothole-low', issueType: 'pothole', severity: 'low', baseLaborHours: 1, materials: [{ materialId: 'mat-coldpatch', quantity: 2 }], equipmentCostFlat: 50, description: 'Small pothole, cold patch' },
  { id: 'repair-pothole-medium', issueType: 'pothole', severity: 'medium', baseLaborHours: 2, materials: [{ materialId: 'mat-hotmix', quantity: 0.25 }, { materialId: 'mat-tack', quantity: 1 }], equipmentCostFlat: 100, description: 'Medium pothole, hot mix repair' },
  { id: 'repair-pothole-high', issueType: 'pothole', severity: 'high', baseLaborHours: 3, materials: [{ materialId: 'mat-hotmix', quantity: 0.5 }, { materialId: 'mat-tack', quantity: 2 }, { materialId: 'mat-gravel', quantity: 0.25 }], equipmentCostFlat: 200, description: 'Large pothole with base repair' },
  { id: 'repair-pothole-critical', issueType: 'pothole', severity: 'critical', baseLaborHours: 5, materials: [{ materialId: 'mat-hotmix', quantity: 1 }, { materialId: 'mat-tack', quantity: 3 }, { materialId: 'mat-gravel', quantity: 0.5 }], equipmentCostFlat: 350, description: 'Critical pothole, full depth repair' },
  
  // Sidewalks
  { id: 'repair-sidewalk-low', issueType: 'sidewalk', severity: 'low', baseLaborHours: 3, materials: [{ materialId: 'mat-concrete-std', quantity: 0.5 }, { materialId: 'mat-curing', quantity: 0.5 }], equipmentCostFlat: 100, description: 'Minor grinding or patch' },
  { id: 'repair-sidewalk-medium', issueType: 'sidewalk', severity: 'medium', baseLaborHours: 5, materials: [{ materialId: 'mat-concrete-std', quantity: 1 }, { materialId: 'mat-rebar', quantity: 20 }, { materialId: 'mat-forms', quantity: 16 }], equipmentCostFlat: 200, description: 'Panel replacement (1 section)' },
  { id: 'repair-sidewalk-high', issueType: 'sidewalk', severity: 'high', baseLaborHours: 8, materials: [{ materialId: 'mat-concrete-std', quantity: 2 }, { materialId: 'mat-rebar', quantity: 40 }, { materialId: 'mat-forms', quantity: 32 }], equipmentCostFlat: 350, description: 'Multi-panel replacement' },
  { id: 'repair-sidewalk-critical', issueType: 'sidewalk', severity: 'critical', baseLaborHours: 12, materials: [{ materialId: 'mat-concrete-std', quantity: 4 }, { materialId: 'mat-rebar', quantity: 80 }, { materialId: 'mat-forms', quantity: 48 }, { materialId: 'mat-curing', quantity: 2 }], equipmentCostFlat: 500, description: 'Major sidewalk reconstruction' },
  
  // Concrete
  { id: 'repair-concrete-low', issueType: 'concrete', severity: 'low', baseLaborHours: 6, materials: [{ materialId: 'mat-concrete-hi', quantity: 1 }, { materialId: 'mat-sealant', quantity: 2 }], equipmentCostFlat: 200, description: 'Minor curb or apron patching' },
  { id: 'repair-concrete-medium', issueType: 'concrete', severity: 'medium', baseLaborHours: 10, materials: [{ materialId: 'mat-concrete-hi', quantity: 2 }, { materialId: 'mat-mesh', quantity: 2 }, { materialId: 'mat-sealant', quantity: 4 }], equipmentCostFlat: 400, description: 'Section replacement with reinforcement' },
  { id: 'repair-concrete-high', issueType: 'concrete', severity: 'high', baseLaborHours: 16, materials: [{ materialId: 'mat-concrete-hi', quantity: 4 }, { materialId: 'mat-mesh', quantity: 4 }, { materialId: 'mat-rebar', quantity: 60 }], equipmentCostFlat: 600, description: 'Major structural repair' },
  { id: 'repair-concrete-critical', issueType: 'concrete', severity: 'critical', baseLaborHours: 24, materials: [{ materialId: 'mat-concrete-hi', quantity: 6 }, { materialId: 'mat-mesh', quantity: 6 }, { materialId: 'mat-rebar', quantity: 100 }], equipmentCostFlat: 1000, description: 'Full reconstruction' },
];

const DEFAULT_ANALYSIS_PARAMS: AnalysisParameters = {
  clusterCount: 4,
  forecastDays: 14,
  simulationRuns: 1000,
  weatherMultipliers: {
    clear: 1.0,
    cloudy: 1.05,
    rain: 1.3,
    snow: 1.5,
    freezing: 1.4,
    freeze_thaw: 1.6,
  },
  severityWeights: {
    critical: 2.0,
    high: 1.5,
    medium: 1.0,
    low: 0.7,
  },
  schoolProximityWeight: 0.30,
  ageDecayWeight: 0.20,
  densityWeight: 0.25,
  defaultCrewAvailability: 100,
  annualBudget: 500000,
  contingencyPercent: 15,
};

// ============================================
// Storage Key
// ============================================

const STORAGE_KEY = 'infrawatch-pricing-config';

// ============================================
// Service Functions
// ============================================

/**
 * Get the current pricing configuration (user-customized or defaults)
 */
export function getPricingConfig(): UserPricingConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as UserPricingConfig;
      // Merge with defaults in case new fields were added
      return {
        ...getDefaultConfig(),
        ...parsed,
        analysisParams: { ...DEFAULT_ANALYSIS_PARAMS, ...parsed.analysisParams },
      };
    }
  } catch (e) {
    console.warn('Failed to load pricing config, using defaults:', e);
  }
  return getDefaultConfig();
}

/**
 * Save updated pricing configuration
 */
export function savePricingConfig(config: UserPricingConfig): void {
  config.lastUpdated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Reset to factory defaults
 */
export function resetPricingConfig(): UserPricingConfig {
  localStorage.removeItem(STORAGE_KEY);
  return getDefaultConfig();
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): UserPricingConfig {
  return {
    materials: [...DEFAULT_MATERIALS],
    laborRates: [...DEFAULT_LABOR_RATES],
    crewTemplates: [...DEFAULT_CREW_TEMPLATES],
    repairCosts: [...DEFAULT_REPAIR_COSTS],
    analysisParams: { ...DEFAULT_ANALYSIS_PARAMS },
    lastUpdated: new Date().toISOString(),
    configName: 'Default Configuration',
  };
}

/**
 * Calculate the full cost of a single repair using custom pricing
 */
export function calculateRepairCost(
  issueType: 'pothole' | 'sidewalk' | 'concrete',
  severity: 'low' | 'medium' | 'high' | 'critical',
  config: UserPricingConfig
): {
  totalCost: number;
  laborCost: number;
  materialCost: number;
  equipmentCost: number;
  laborHours: number;
  breakdown: Array<{ item: string; qty: number; unit: string; unitCost: number; total: number }>;
} {
  // Find the repair template
  const template = config.repairCosts.find(
    r => r.issueType === issueType && r.severity === severity
  );
  
  if (!template) {
    return { totalCost: 0, laborCost: 0, materialCost: 0, equipmentCost: 0, laborHours: 0, breakdown: [] };
  }
  
  // Find the crew template for this type
  const crew = config.crewTemplates.find(c => c.specialization === issueType) || config.crewTemplates[0];
  
  // Calculate labor cost
  let laborCost = 0;
  const breakdown: Array<{ item: string; qty: number; unit: string; unitCost: number; total: number }> = [];
  
  crew.laborRoles.forEach(roleId => {
    const rate = config.laborRates.find(r => r.id === roleId);
    if (rate) {
      const effectiveRate = rate.hourlyRate;
      const cost = effectiveRate * template.baseLaborHours;
      laborCost += cost;
      breakdown.push({
        item: `${rate.role} Labor`,
        qty: template.baseLaborHours,
        unit: 'hours',
        unitCost: effectiveRate,
        total: cost,
      });
    }
  });
  
  // Calculate material cost
  let materialCost = 0;
  template.materials.forEach(mat => {
    const material = config.materials.find(m => m.id === mat.materialId);
    if (material) {
      const cost = material.costPerUnit * mat.quantity;
      materialCost += cost;
      breakdown.push({
        item: material.name,
        qty: mat.quantity,
        unit: material.unit,
        unitCost: material.costPerUnit,
        total: cost,
      });
    }
  });
  
  // Equipment cost
  breakdown.push({
    item: 'Equipment',
    qty: 1,
    unit: 'flat rate',
    unitCost: template.equipmentCostFlat,
    total: template.equipmentCostFlat,
  });
  
  const totalCost = laborCost + materialCost + template.equipmentCostFlat;
  
  return {
    totalCost: Math.round(totalCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    materialCost: Math.round(materialCost * 100) / 100,
    equipmentCost: template.equipmentCostFlat,
    laborHours: template.baseLaborHours,
    breakdown,
  };
}

/**
 * Calculate costs for a batch of work orders using custom pricing
 */
export function calculateBatchCost(
  workOrders: Array<{ issueType: string; severity: string }>,
  config: UserPricingConfig
): {
  totalCost: number;
  totalLaborCost: number;
  totalMaterialCost: number;
  totalEquipmentCost: number;
  totalLaborHours: number;
  contingency: number;
  grandTotal: number;
  byType: Record<string, { count: number; cost: number }>;
  bySeverity: Record<string, { count: number; cost: number }>;
} {
  let totalCost = 0;
  let totalLaborCost = 0;
  let totalMaterialCost = 0;
  let totalEquipmentCost = 0;
  let totalLaborHours = 0;
  const byType: Record<string, { count: number; cost: number }> = {};
  const bySeverity: Record<string, { count: number; cost: number }> = {};
  
  workOrders.forEach(wo => {
    const type = wo.issueType as 'pothole' | 'sidewalk' | 'concrete';
    const severity = wo.severity as 'low' | 'medium' | 'high' | 'critical';
    const result = calculateRepairCost(type, severity, config);
    
    totalCost += result.totalCost;
    totalLaborCost += result.laborCost;
    totalMaterialCost += result.materialCost;
    totalEquipmentCost += result.equipmentCost;
    totalLaborHours += result.laborHours;
    
    // Track by type
    if (!byType[type]) byType[type] = { count: 0, cost: 0 };
    byType[type].count++;
    byType[type].cost += result.totalCost;
    
    // Track by severity
    if (!bySeverity[severity]) bySeverity[severity] = { count: 0, cost: 0 };
    bySeverity[severity].count++;
    bySeverity[severity].cost += result.totalCost;
  });
  
  const contingency = totalCost * (config.analysisParams.contingencyPercent / 100);
  
  return {
    totalCost: Math.round(totalCost),
    totalLaborCost: Math.round(totalLaborCost),
    totalMaterialCost: Math.round(totalMaterialCost),
    totalEquipmentCost: Math.round(totalEquipmentCost),
    totalLaborHours: Math.round(totalLaborHours),
    contingency: Math.round(contingency),
    grandTotal: Math.round(totalCost + contingency),
    byType,
    bySeverity,
  };
}

/**
 * Export config as JSON for sharing
 */
export function exportConfig(config: UserPricingConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Import config from JSON string
 */
export function importConfig(jsonString: string): UserPricingConfig | null {
  try {
    const parsed = JSON.parse(jsonString) as UserPricingConfig;
    if (parsed.materials && parsed.laborRates && parsed.analysisParams) {
      savePricingConfig(parsed);
      return parsed;
    }
  } catch (e) {
    console.error('Failed to import config:', e);
  }
  return null;
}

export default {
  getPricingConfig,
  savePricingConfig,
  resetPricingConfig,
  getDefaultConfig,
  calculateRepairCost,
  calculateBatchCost,
  getQuickCost,
  exportConfig,
  importConfig,
};

/**
 * Lightweight cost lookup — returns just the total cost number.
 * Uses the same calculateRepairCost engine so every cost in the app
 * comes from one source of truth (user-configurable pricing config).
 */
export function getQuickCost(
  issueType: string,
  severity: string,
  config?: UserPricingConfig
): number {
  const cfg = config || getPricingConfig();
  const result = calculateRepairCost(
    issueType as 'pothole' | 'sidewalk' | 'concrete',
    severity as 'low' | 'medium' | 'high' | 'critical',
    cfg
  );
  return result.totalCost || 300; // fallback if no template matched
}

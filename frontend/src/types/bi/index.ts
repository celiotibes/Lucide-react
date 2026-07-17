/**
 * Business Intelligence Types
 * Tipos centralizados para o módulo de BI Contábil
 */

// KPI Definitions
export interface KPI {
  id: string;
  name: string;
  value: number;
  previousValue: number;
  unit: 'currency' | 'percentage' | 'count';
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  status: 'success' | 'warning' | 'danger' | 'neutral';
  lastUpdated: Date;
}

export interface FinancialKPIs {
  grossRevenue: KPI;
  netRevenue: KPI;
  operationalCosts: KPI;
  ebitda: KPI;
  profitMargin: KPI;
  liquidityCurrent: KPI;
  cashFlow: KPI;
}

// Financial Movements
export interface FinancialMovement {
  id: string;
  propertyId: string;
  accountId: string;
  movementDate: Date;
  amount: number;
  movementType: 'revenue' | 'cost' | 'expense' | 'investment';
  category: string;
  description: string;
  platform: string;
  reference: string;
  createdAt: Date;
}

// Chart of Accounts (Plano de Contas)
export interface ChartAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentAccountId?: string;
  balance: number;
  isActive: boolean;
}

// Cost Centers
export interface CostCenter {
  costCenterId: string;
  propertyId: string;
  name: string;
  budget: number;
  spent: number;
  responsible?: string;
}

// Dashboard Data
export interface DashboardData {
  period: {
    startDate: Date;
    endDate: Date;
  };
  kpis: FinancialKPIs;
  movements: FinancialMovement[];
  costCenters: CostCenter[];
  charts: {
    waterfall?: WaterfallChartData;
    sankey?: SankeyChartData;
    heatmap?: HeatmapChartData;
  };
}

// Waterfall Chart (DRE)
export interface WaterfallChartData {
  stages: Array<{
    name: string;
    value: number;
    isTotal?: boolean;
    color?: string;
  }>;
}

// Sankey Diagram (Cash Flow)
export interface SankeyChartData {
  nodes: Array<{
    name: string;
    category: 'revenue' | 'expense' | 'investment';
  }>;
  links: Array<{
    source: number;
    target: number;
    value: number;
  }>;
}

// Heatmap
export interface HeatmapChartData {
  categories: string[];
  series: Array<{
    name: string;
    data: number[];
  }>;
}

// Filter State
export interface BiFilterState {
  propertyIds: string[];
  startDate: Date;
  endDate: Date;
  categories: string[];
  accounts: string[];
}

// Pagination
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// API Response
export interface BiApiResponse<T> {
  data: T;
  meta: {
    timestamp: Date;
    executionTime: number;
  };
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

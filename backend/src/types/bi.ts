/**
 * Business Intelligence Types (Backend)
 * Tipos compartilhados entre frontend e backend
 */

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

export interface BiFilterState {
  propertyIds: string[];
  startDate: Date;
  endDate: Date;
  categories: string[];
  accounts: string[];
}

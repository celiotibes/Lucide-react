// Financial data types and interfaces for BI components

export interface FinancialData {
  period: string // YYYY-MM
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  ebitda: number
  interest: number
  taxes: number
  netIncome: number
}

export interface KPIMetric {
  label: string
  value: number
  format: 'currency' | 'percentage' | 'number'
  previousValue?: number
  trend?: 'up' | 'down' | 'neutral'
  status?: 'good' | 'warning' | 'critical'
}

export interface CostCenter {
  name: string
  budget: number
  spent: number
  percentage: number
  trend?: number // percentage change
  status: 'normal' | 'warning' | 'critical'
}

export interface CashFlowItem {
  source: string
  amount: number
  category: 'revenue' | 'expense' | 'investment' | 'financing'
}

export interface WaterfallStep {
  name: string
  value: number
  isTotal?: boolean
  color?: string
}

export interface SankeyNode {
  name: string
}

export interface SankeyLink {
  source: number
  target: number
  value: number
}

export interface FinancialReport {
  type: 'income_statement' | 'cash_flow' | 'balance_sheet'
  period: string
  data: Record<string, number>
  notes?: string[]
}

export interface FinancialImport {
  filename: string
  uploadedAt: Date
  rows: number
  status: 'pending' | 'processing' | 'success' | 'error'
  error?: string
}

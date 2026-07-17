// Star Schema Data Model for Financial Analysis
// Optimized for BI queries and dimensional analysis

export interface DimDate {
  dateKey: string // YYYYMMDD
  date: Date
  year: number
  month: number
  quarter: number
  dayOfWeek: number
  week: number
  isWeekend: boolean
}

export interface DimAccount {
  accountKey: string
  accountCode: string
  accountName: string
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  category: string
  subCategory: string
  isActive: boolean
}

export interface DimCostCenter {
  costCenterKey: string
  costCenterCode: string
  costCenterName: string
  departmentCode: string
  departmentName: string
  managerName: string
  isActive: boolean
}

export interface FactBalancete {
  balanceteKey: string
  dateKey: string
  accountKey: string
  costCenterKey: string
  debitAmount: number
  creditAmount: number
  balanceAmount: number
  createdAt: Date
  updatedAt: Date
}

export interface FactIncomeStatement {
  incomeKey: string
  dateKey: string
  periodKey: string // YYYY-MM
  accountKey: string
  costCenterKey: string
  amount: number
  percentage: number
  createdAt: Date
  updatedAt: Date
}

export interface FactCashFlow {
  cashFlowKey: string
  dateKey: string
  periodKey: string
  categoryKey: string
  subcategoryKey: string
  amount: number
  createdAt: Date
  updatedAt: Date
}

export interface StarSchemaDatabase {
  dimDate: DimDate[]
  dimAccount: DimAccount[]
  dimCostCenter: DimCostCenter[]
  factBalancete: FactBalancete[]
  factIncomeStatement: FactIncomeStatement[]
  factCashFlow: FactCashFlow[]
}

export interface ImportMapping {
  sourceColumn: string
  targetField: string
  dataType: 'string' | 'number' | 'date'
  required: boolean
  format?: string
}

export interface ImportResult {
  success: boolean
  totalRows: number
  importedRows: number
  failedRows: number
  errors: string[]
  warnings: string[]
  timestamp: Date
}

export interface CSVRow {
  [key: string]: string | number | null
}

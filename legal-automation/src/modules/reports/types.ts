// src/modules/reports/types.ts

export type ReportType = 'case_summary' | 'financial' | 'performance' | 'timeline' | 'analytics';
export type ReportFormat = 'pdf' | 'excel' | 'json' | 'html';
export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'gauge';

export interface Report {
  id: string;
  userId: string;
  name: string;
  type: ReportType;
  description?: string;
  format: ReportFormat;
  filters?: Record<string, any>;
  generatedAt: Date;
  data: Record<string, any>;
  fileUrl?: string;
  expiresAt?: Date;
}

export interface CaseAnalyticsData {
  totalCases: number;
  openCases: number;
  closedCases: number;
  winRate: number;
  averageResolutionTime: number;
  totalClaimAmount: number;
  recoveredAmount: number;
  casesByType: { type: string; count: number }[];
  casesByStatus: { status: string; count: number }[];
  monthlyTrend: { month: string; cases: number; wins: number }[];
}

export interface FinancialAnalyticsData {
  totalBilled: number;
  totalCollected: number;
  outstandingAmount: number;
  collectionRate: number;
  averageBillPerCase: number;
  topClients: { clientId: string; amount: number; caseCount: number }[];
  monthlyRevenue: { month: string; amount: number }[];
  billableHours: { type: string; hours: number; amount: number }[];
  invoicingTrend: {
    invoicesSent: number;
    invoicesPaid: number;
    avgPaymentDays: number;
  };
}

export interface PerformanceMetrics {
  lawyerId?: string;
  periodFrom: Date;
  periodTo: Date;
  casesHandled: number;
  winRate: number;
  averageTimeToResolution: number;
  billableHours: number;
  clientSatisfaction?: number;
  specializations: string[];
  caseSuccess: { caseType: string; successRate: number }[];
  productivity: { week: string; casesCompleted: number; billableHours: number }[];
}

export interface TimelineData {
  caseId: string;
  events: TimelineEvent[];
  milestones: Milestone[];
  estimatedResolution?: Date;
}

export interface TimelineEvent {
  date: Date;
  title: string;
  description: string;
  type: 'filing' | 'hearing' | 'decision' | 'appeal' | 'settlement' | 'other';
  actor?: string;
}

export interface Milestone {
  date: Date;
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
  priority: 'critical' | 'high' | 'normal';
}

export interface Dashboard {
  id: string;
  userId: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'gauge';
  chartType?: ChartType;
  title: string;
  dataSource: string;
  filters?: Record<string, any>;
  position: { x: number; y: number };
  size: { width: number; height: number };
  refreshInterval?: number; // seconds
}

export interface MetricCard {
  id: string;
  title: string;
  value: string | number;
  unit?: string;
  trend?: number; // percentage change
  trendDirection?: 'up' | 'down' | 'neutral';
  icon?: string;
  color?: string;
}

export interface ChartData {
  title: string;
  type: ChartType;
  data: any[];
  xAxis?: string;
  yAxis?: string;
  series?: string[];
  options?: Record<string, any>;
}

export interface ReportTemplate {
  id: string;
  name: string;
  type: ReportType;
  description: string;
  fields: ReportField[];
  defaultFormat: ReportFormat;
  createdBy?: string;
}

export interface ReportField {
  name: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'number';
  required: boolean;
  options?: string[];
}

export interface ExportOptions {
  format: ReportFormat;
  includeCharts: boolean;
  includeRawData: boolean;
  pageSize?: 'A4' | 'A3' | 'letter';
  orientation?: 'portrait' | 'landscape';
  companyInfo?: {
    name: string;
    logo?: string;
    contact?: string;
  };
}

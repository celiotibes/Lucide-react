// ============ REPORT TYPES ============

export type ReportFormat = 'pdf' | 'excel' | 'csv' | 'html';
export type ReportType =
  | 'case_summary'
  | 'financial_summary'
  | 'deadline_report'
  | 'performance_metrics'
  | 'invoice_report'
  | 'cost_analysis'
  | 'time_tracking'
  | 'kpi_dashboard'
  | 'case_timeline'
  | 'process_movements';

export interface ReportRequest {
  reportType: ReportType;
  format: ReportFormat;
  filters?: ReportFilters;
  options?: ReportOptions;
  scheduleRecurring?: ScheduleRecurringReport;
}

export interface ReportFilters {
  caseIds?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  tribunals?: string[];
  status?: string[];
  priority?: string[];
  clientIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  keyword?: string;
}

export interface ReportOptions {
  includeCharts?: boolean;
  includeSummary?: boolean;
  includeDetails?: boolean;
  pageSize?: 'letter' | 'a4';
  orientation?: 'portrait' | 'landscape';
  theme?: 'light' | 'dark';
  language?: 'pt-BR' | 'en-US';
  watermark?: string;
  companyLogoUrl?: string;
}

export interface ScheduleRecurringReport {
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  time?: string; // HH:mm
  recipients?: string[]; // Email addresses
  enabled?: boolean;
}

export interface ReportMetadata {
  id: string;
  userId: string;
  reportType: ReportType;
  format: ReportFormat;
  title: string;
  description?: string;
  generatedAt: Date;
  filePath: string;
  fileSize: number;
  pageCount?: number;
  status: 'generated' | 'processing' | 'failed';
  error?: string;
}

export interface ReportData {
  title: string;
  description?: string;
  generatedAt: Date;
  generatedBy: string;
  reportPeriod?: {
    from: Date;
    to: Date;
  };
  summary: Record<string, any>;
  details?: Record<string, any>[];
  charts?: ChartSpec[];
  tables?: TableSpec[];
  metadata?: Record<string, any>;
}

export interface ChartSpec {
  id: string;
  type: 'line' | 'bar' | 'pie' | 'area' | 'scatter';
  title: string;
  data: ChartData[];
  options?: ChartOptions;
}

export interface ChartData {
  label: string;
  value: number;
  color?: string;
  metadata?: Record<string, any>;
}

export interface ChartOptions {
  showLegend?: boolean;
  showValues?: boolean;
  stacked?: boolean;
  minHeight?: number;
  aspectRatio?: number;
}

export interface TableSpec {
  title: string;
  columns: TableColumn[];
  rows: Record<string, any>[];
  totals?: Record<string, any>;
  options?: TableOptions;
}

export interface TableColumn {
  key: string;
  header: string;
  type: 'text' | 'number' | 'date' | 'currency' | 'percentage';
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableOptions {
  alternateRows?: boolean;
  frozenHeader?: boolean;
  showPageNumbers?: boolean;
}

export interface CaseSummaryReport extends ReportData {
  caseDetails: CaseReportDetails[];
  totalCases: number;
  activeCases: number;
  concludedCases: number;
  statusDistribution: Record<string, number>;
  priorityDistribution: Record<string, number>;
}

export interface CaseReportDetails {
  caseNumber: string;
  processNumber: string;
  clientName: string;
  status: string;
  priority: string;
  openDate: Date;
  daysOpen: number;
  nextDeadline?: Date;
  lastUpdate: Date;
  totalCost: number;
  totalRevenue: number;
  profit: number;
}

export interface FinancialSummaryReport extends ReportData {
  periodRevenue: number;
  periodCosts: number;
  periodProfit: number;
  profitMargin: number;
  topClients: ClientFinancials[];
  topCases: CaseFinancials[];
  expensesByCategory: Record<string, number>;
  revenueBySource: Record<string, number>;
  invoiceMetrics: InvoiceMetrics;
  cashFlowProjection: CashFlowData[];
}

export interface ClientFinancials {
  clientId: string;
  clientName: string;
  totalInvoiced: number;
  totalCosts: number;
  profit: number;
  caseCount: number;
}

export interface CaseFinancials {
  caseId: string;
  caseNumber: string;
  revenue: number;
  costs: number;
  profit: number;
  status: string;
}

export interface InvoiceMetrics {
  totalInvoices: number;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  averagePaymentTime: number; // days
  overdueCount: number;
}

export interface CashFlowData {
  date: Date;
  inflow: number;
  outflow: number;
  net: number;
}

export interface DeadlineReport extends ReportData {
  urgentDeadlines: DeadlineItem[];
  upcomingDeadlines: DeadlineItem[];
  overdueDeadlines: DeadlineItem[];
  completedDeadlines: DeadlineItem[];
  deadlineMetrics: {
    totalDeadlines: number;
    overdue: number;
    onTime: number;
    completionRate: number;
  };
}

export interface DeadlineItem {
  id: string;
  caseNumber: string;
  title: string;
  dueDate: Date;
  daysUntil: number;
  priority: string;
  status: string;
  assignedTo: string;
}

export interface PerformanceMetricsReport extends ReportData {
  userMetrics: UserPerformance[];
  teamMetrics: TeamPerformance;
  caseMetrics: CaseMetrics;
  timeMetrics: TimeMetrics;
  qualityMetrics: QualityMetrics;
}

export interface UserPerformance {
  userId: string;
  userName: string;
  casesHandled: number;
  casesCompleted: number;
  totalHours: number;
  billableHours: number;
  utilization: number;
  avgCaseDuration: number;
  revenue: number;
}

export interface TeamPerformance {
  totalCases: number;
  casesCompleted: number;
  avgCompletionTime: number;
  teamUtilization: number;
  totalRevenue: number;
  totalCosts: number;
  profitMargin: number;
}

export interface CaseMetrics {
  avgCaseDuration: number;
  medianCaseDuration: number;
  casesOnTime: number;
  casesMissedDeadline: number;
  casesEscalated: number;
}

export interface TimeMetrics {
  totalHoursLogged: number;
  billableHours: number;
  nonBillableHours: number;
  utilizationRate: number;
  avgHoursPerCase: number;
}

export interface QualityMetrics {
  casesWithIssues: number;
  appealsWon: number;
  appealsLost: number;
  clientSatisfaction: number;
  revisionsRequired: number;
}

export interface TimeTrackingReport extends ReportData {
  timeEntries: TimeEntryDetail[];
  summaryByUser: TimeEntrySummary[];
  summaryByCase: TimeEntrySummary[];
  totalHours: number;
  totalBillableHours: number;
  utilizationPercentage: number;
  billing: BillingInfo[];
}

export interface TimeEntryDetail {
  date: Date;
  user: string;
  caseNumber: string;
  description: string;
  hours: number;
  billable: boolean;
  rate?: number;
  amount?: number;
  category: string;
}

export interface TimeEntrySummary {
  name: string;
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  utilizationRate: number;
  estimatedBilling?: number;
}

export interface BillingInfo {
  caseNumber: string;
  billableHours: number;
  hourlyRate: number;
  totalAmount: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  reportType: ReportType;
  defaultFormat: ReportFormat;
  htmlTemplate: string;
  cssStyles: string;
  sections: TemplateSection[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateSection {
  id: string;
  order: number;
  type: 'header' | 'title' | 'summary' | 'chart' | 'table' | 'text' | 'footer';
  content: string;
  dataMapping?: Record<string, string>;
  pageBreak?: boolean;
}

export interface ScheduledReport {
  id: string;
  userId: string;
  reportType: ReportType;
  schedule: ScheduleRecurringReport;
  lastRun?: Date;
  nextRun: Date;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============ ERROR TYPES ============

export class ReportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

export class ReportGenerationError extends ReportError {
  constructor(message: string) {
    super('GENERATION_ERROR', message);
    this.name = 'ReportGenerationError';
  }
}

export class ReportTemplateError extends ReportError {
  constructor(message: string) {
    super('TEMPLATE_ERROR', message);
    this.name = 'ReportTemplateError';
  }
}

// src/modules/reports/index.ts
export { ReportsService } from './reports.service';
export { setupReportsRoutes } from './routes';
export type {
  Report,
  ReportType,
  ReportFormat,
  CaseAnalyticsData,
  FinancialAnalyticsData,
  PerformanceMetrics,
  TimelineData,
  Dashboard,
  DashboardWidget,
  MetricCard,
  ChartData,
  ReportTemplate,
  ExportOptions,
} from './types';

/**
 * Analytics Module Exports
 */

export {
  analyticsService,
  EventType,
  type AnalyticsEvent,
  type AnalyticsMetrics,
  type PrivacySettings,
} from './analyticsService';

export {
  crashReportingService,
  type CrashReport,
  type Breadcrumb,
  type CrashContext,
} from './crashReportingService';

export {
  performanceMetrics,
  type PerformanceMetric,
  type PerformanceTimestamp,
  type AppPerformanceStats,
} from './performanceMetrics';

// Unified analytics export
export const analytics = {
  events: analyticsService,
  crashes: crashReportingService,
  performance: performanceMetrics,
};

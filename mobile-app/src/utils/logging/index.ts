/**
 * Secure Logging System - Exports
 */

// Logger
export { SecureLogger, LogLevel, secureLogger } from './logger';
export type { LogEntry, LoggerConfig } from './logger';

// Log Masking
export { LogMasker, logMasker, DEFAULT_MASKING_CONFIG } from './logMasking';
export type { MaskingConfig } from './logMasking';

// Remote Logger
export { RemoteLogger, createRemoteLogger, RemoteLoggerProvider } from './remoteLogger';
export type { RemoteLoggerConfig, RemoteEvent, Breadcrumb } from './remoteLogger';

// Audit Logger
export { AuditLogger, auditLogger, AuditEventType } from './auditLog';
export type { AuditEvent, AuditConfig } from './auditLog';

// Examples
export {
  example1_basicLogging,
  example2_moduleLogging,
  example3_objectMasking,
  example4_userActionTracking,
  example5_securityLogging,
  example6_remoteLogging,
  example7_urlMasking,
  example8_logsAndStats,
  example9_maskingStats,
  example10_auditExport,
  example11_loginFlow,
  example12_dataExport,
  runAllExamples,
} from './examples';

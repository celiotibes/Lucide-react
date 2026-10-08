/**
 * Log Aggregation - Phase 22.17: Advanced Monitoring & Observability
 *
 * Manages:
 * - Structured logging aggregation
 * - Log shipping to external services
 * - Log correlation with traces
 * - Retention policies
 * - Log filtering and sampling
 *
 * @module observability/logAggregation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  traceId?: string;
  spanId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
  tags?: string[];
}

export interface LogFilter {
  level?: LogLevel;
  startTime?: number;
  endTime?: number;
  traceId?: string;
  tags?: string[];
  searchTerm?: string;
}

export interface LogAggregationConfig {
  maxLogs: number;
  level: LogLevel;
  samplingRate: number;
  enableConsoleOutput: boolean;
  enableShipping: boolean;
  shippingInterval: number;
}

const LOG_STORAGE_KEY = '@crmt:aggregated_logs';
const DEFAULT_CONFIG: LogAggregationConfig = {
  maxLogs: 1000,
  level: 'info',
  samplingRate: 1.0,
  enableConsoleOutput: true,
  enableShipping: true,
  shippingInterval: 30000,
};

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class LogAggregation {
  private logs: LogEntry[] = [];
  private config: LogAggregationConfig = DEFAULT_CONFIG;
  private isInitialized = false;
  private shippingTimer: NodeJS.Timeout | null = null;
  private logSequence = 0;

  /**
   * Initialize log aggregation
   */
  async initialize(customConfig?: Partial<LogAggregationConfig>): Promise<void> {
    try {
      if (this.isInitialized) return;

      this.config = { ...this.config, ...customConfig };
      await this.loadLogsFromStorage();

      if (this.config.enableShipping) {
        this.startShipping();
      }

      this.isInitialized = true;
      logger.info('LogAggregation initialized');
    } catch (error) {
      logger.error('Failed to initialize LogAggregation', error, 'Logging');
    }
  }

  /**
   * Log message with level
   */
  log(level: LogLevel, message: string, context?: Record<string, any>, tags?: string[]): void {
    if (!this.isInitialized) return;

    // Check if we should log based on level
    if (LOG_LEVELS[level] < LOG_LEVELS[this.config.level]) {
      return;
    }

    // Check sampling
    if (Math.random() > this.config.samplingRate) {
      return;
    }

    try {
      const entry: LogEntry = {
        id: this.generateLogId(),
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
        metadata: {
          sequence: this.logSequence++,
        },
        tags,
      };

      this.addLog(entry);

      // Console output for debugging
      if (this.config.enableConsoleOutput) {
        this.outputToConsole(entry);
      }
    } catch (error) {
      logger.warn('Failed to log message', {}, 'Logging');
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: Record<string, any>, tags?: string[]): void {
    this.log('info', message, context, tags);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: Record<string, any>, tags?: string[]): void {
    this.log('debug', message, context, tags);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: Record<string, any>, tags?: string[]): void {
    this.log('warn', message, context, tags);
  }

  /**
   * Log error message
   */
  logError(error: Error, context?: Record<string, any>, tags?: string[]): void {
    if (!this.isInitialized) return;

    try {
      const entry: LogEntry = {
        id: this.generateLogId(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: error.message,
        context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {
          sequence: this.logSequence++,
        },
        tags,
      };

      this.addLog(entry);

      if (this.config.enableConsoleOutput) {
        this.outputToConsole(entry);
      }
    } catch (err) {
      logger.warn('Failed to log error', {}, 'Logging');
    }
  }

  /**
   * Add log entry with correlation
   */
  private addLog(entry: LogEntry): void {
    this.logs.push(entry);

    // Enforce max logs
    if (this.logs.length > this.config.maxLogs) {
      this.logs = this.logs.slice(-this.config.maxLogs);
    }
  }

  /**
   * Correlate log with trace
   */
  correlateWithTrace(traceId: string, spanId: string): void {
    if (this.logs.length > 0) {
      const lastLog = this.logs[this.logs.length - 1];
      lastLog.traceId = traceId;
      lastLog.spanId = spanId;
    }
  }

  /**
   * Get logs with filtering
   */
  getLogs(filter?: LogFilter): LogEntry[] {
    let filtered = [...this.logs];

    if (filter) {
      if (filter.level) {
        filtered = filtered.filter((log) => log.level === filter.level);
      }

      if (filter.startTime) {
        filtered = filtered.filter((log) => new Date(log.timestamp).getTime() >= filter.startTime!);
      }

      if (filter.endTime) {
        filtered = filtered.filter((log) => new Date(log.timestamp).getTime() <= filter.endTime!);
      }

      if (filter.traceId) {
        filtered = filtered.filter((log) => log.traceId === filter.traceId);
      }

      if (filter.tags && filter.tags.length > 0) {
        filtered = filtered.filter(
          (log) => log.tags && log.tags.some((tag) => filter.tags!.includes(tag))
        );
      }

      if (filter.searchTerm) {
        const term = filter.searchTerm.toLowerCase();
        filtered = filtered.filter(
          (log) =>
            log.message.toLowerCase().includes(term) ||
            JSON.stringify(log.context).toLowerCase().includes(term)
        );
      }
    }

    return filtered;
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Get error logs
   */
  getErrorLogs(): LogEntry[] {
    return this.getLogsByLevel('error');
  }

  /**
   * Get warning logs
   */
  getWarningLogs(): LogEntry[] {
    return this.getLogsByLevel('warn');
  }

  /**
   * Get logs by tag
   */
  getLogsByTag(tag: string): LogEntry[] {
    return this.logs.filter((log) => log.tags && log.tags.includes(tag));
  }

  /**
   * Get logs by trace ID
   */
  getLogsByTraceId(traceId: string): LogEntry[] {
    return this.logs.filter((log) => log.traceId === traceId);
  }

  /**
   * Get log statistics
   */
  getStatistics(): {
    total: number;
    byLevel: Record<LogLevel, number>;
    errorRate: number;
    mostRecentError?: LogEntry;
  } {
    const byLevel: Record<LogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.level]++;
    });

    const errorRate = this.logs.length > 0 ? byLevel.error / this.logs.length : 0;
    const mostRecentError = this.logs.filter((log) => log.level === 'error').pop();

    return {
      total: this.logs.length,
      byLevel,
      errorRate,
      mostRecentError,
    };
  }

  /**
   * Export logs
   */
  exportLogs(format: 'json' | 'csv' = 'json', filter?: LogFilter): string {
    try {
      const logsToExport = filter ? this.getLogs(filter) : this.logs;

      if (format === 'csv') {
        return this.exportAsCSV(logsToExport);
      } else {
        return JSON.stringify(
          {
            exportDate: new Date().toISOString(),
            count: logsToExport.length,
            logs: logsToExport,
            statistics: this.getStatistics(),
          },
          null,
          2
        );
      }
    } catch (error) {
      logger.error('Failed to export logs', error, 'Logging');
      throw error;
    }
  }

  /**
   * Export logs as CSV
   */
  private exportAsCSV(logs: LogEntry[]): string {
    const headers = ['timestamp', 'level', 'message', 'traceId', 'context'];
    const rows = logs.map((log) => [
      log.timestamp,
      log.level,
      log.message,
      log.traceId || '',
      log.context ? JSON.stringify(log.context) : '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }

  /**
   * Clear old logs
   */
  clearOldLogs(retentionMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - retentionMs;
    const before = this.logs.length;

    this.logs = this.logs.filter((log) => new Date(log.timestamp).getTime() > cutoffTime);

    logger.info(`Cleared ${before - this.logs.length} old logs`);
  }

  /**
   * Clear all logs
   */
  clearAllLogs(): void {
    this.logs = [];
    this.logSequence = 0;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Set sampling rate
   */
  setSamplingRate(rate: number): void {
    this.config.samplingRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Start log shipping
   */
  private startShipping(): void {
    this.shippingTimer = setInterval(async () => {
      try {
        const logsToShip = this.logs.filter((log) => log.level === 'error' || log.level === 'warn');
        if (logsToShip.length > 0) {
          await this.shipLogs(logsToShip);
        }
      } catch (error) {
        logger.warn('Failed to ship logs', {}, 'Logging');
      }
    }, this.config.shippingInterval);
  }

  /**
   * Ship logs to backend
   */
  private async shipLogs(logsToShip: LogEntry[]): Promise<void> {
    try {
      // In production, send to backend/logging service
      logger.debug(`Shipping ${logsToShip.length} critical logs`, {
        errorCount: logsToShip.filter((l) => l.level === 'error').length,
        warnCount: logsToShip.filter((l) => l.level === 'warn').length,
      });

      // Mock API call
      // await fetch('/api/logs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ logs: logsToShip })
      // });
    } catch (error) {
      logger.warn('Failed to send logs to backend', {}, 'Logging');
    }
  }

  /**
   * Output to console
   */
  private outputToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;

    if (entry.level === 'error') {
      console.error(prefix, entry.message, entry.context || '');
      if (entry.error) {
        console.error(entry.error.stack);
      }
    } else if (entry.level === 'warn') {
      console.warn(prefix, entry.message, entry.context || '');
    } else if (entry.level === 'debug') {
      console.debug(prefix, entry.message, entry.context || '');
    } else {
      console.log(prefix, entry.message, entry.context || '');
    }
  }

  /**
   * Generate log ID
   */
  private generateLogId(): string {
    return `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Load logs from storage
   */
  private async loadLogsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
        // Update sequence number
        this.logSequence = this.logs.length;
      }
    } catch (error) {
      logger.error('Failed to load logs', error, 'Logging');
    }
  }

  /**
   * Persist logs to storage
   */
  async persistLogs(): Promise<void> {
    try {
      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      logger.warn('Failed to persist logs', {}, 'Logging');
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.shippingTimer) {
      clearInterval(this.shippingTimer);
    }
    this.persistLogs();
  }
}

export const logAggregation = new LogAggregation();

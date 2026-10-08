/**
 * Logger Service - Phase 22.9: Error Handling & Logging
 *
 * Features:
 * - Multiple log levels: DEBUG, INFO, WARN, ERROR, FATAL
 * - Structured logging with timestamps, module names, and metadata
 * - Automatic log rotation (10MB max per session)
 * - AsyncStorage persistence (last 100 logs)
 * - Log export for email/sharing
 * - Type-safe with TypeScript
 * - Performance monitoring
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  metadata?: Record<string, any>;
  stack?: string;
  sessionId?: string;
}

export interface LogStats {
  totalLogs: number;
  byLevel: Record<LogLevel, number>;
  oldestLog: string | null;
  newestLog: string | null;
  storageSize: number;
}

const LOG_STORAGE_KEY = '@crmt:logs';
const LOG_SESSION_ID_KEY = '@crmt:session_id';
const MAX_LOGS_IN_MEMORY = 100;
const MAX_LOGS_IN_STORAGE = 100;
const MAX_LOG_SIZE_MB = 10;
const LOG_RETENTION_DAYS = 7;

class Logger {
  private minLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private sessionId: string = '';
  private isProcessing = false;
  private memorySize = 0;
  private readonly maxMemorySize = MAX_LOG_SIZE_MB * 1024 * 1024; // 10MB

  constructor() {
    this.initializeSession();
    this.loadLogsFromStorage();
  }

  /**
   * Initialize session ID for log tracking
   */
  private async initializeSession(): Promise<void> {
    try {
      let sessionId = await AsyncStorage.getItem(LOG_SESSION_ID_KEY);
      if (!sessionId) {
        sessionId = this.generateSessionId();
        await AsyncStorage.setItem(LOG_SESSION_ID_KEY, sessionId);
      }
      this.sessionId = sessionId;
      this.debug('Logger initialized', { sessionId });
    } catch (error) {
      console.error('Failed to initialize session', error);
      this.sessionId = this.generateSessionId();
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set minimum log level
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Get current log level
   */
  getMinLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Check if log should be recorded based on level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const minIndex = levels.indexOf(this.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= minIndex;
  }

  /**
   * Format log entry with timestamp and level
   */
  private formatLogMessage(level: LogLevel, message: string, module?: string): string {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const moduleStr = module ? ` [${module}]` : '';
    return `${timestamp} [${level}]${moduleStr} ${message}`;
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    module?: string,
    metadata?: any,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      sessionId: this.sessionId,
    };

    if (module) {
      entry.module = module;
    }

    if (metadata) {
      // Sanitize metadata to avoid circular references
      entry.metadata = this.sanitizeMetadata(metadata);
    }

    // Extract stack trace from Error objects
    if (metadata instanceof Error) {
      entry.stack = metadata.stack;
      entry.message = `${message}: ${metadata.message}`;
    }

    return entry;
  }

  /**
   * Sanitize metadata to avoid circular references
   */
  private sanitizeMetadata(data: any, depth = 0, maxDepth = 5): any {
    if (depth > maxDepth) {
      return '[Max depth reached]';
    }

    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };
    }

    if (Array.isArray(data)) {
      return data.slice(0, 10).map((item) => this.sanitizeMetadata(item, depth + 1, maxDepth));
    }

    const sanitized: Record<string, any> = {};
    const keys = Object.keys(data).slice(0, 10); // Limit keys
    for (const key of keys) {
      try {
        sanitized[key] = this.sanitizeMetadata(data[key], depth + 1, maxDepth);
      } catch {
        sanitized[key] = '[Error serializing]';
      }
    }
    return sanitized;
  }

  /**
   * Check if memory limit exceeded and perform rotation if needed
   */
  private checkMemoryLimit(): void {
    const currentSize = JSON.stringify(this.logs).length;
    if (currentSize > this.maxMemorySize && this.logs.length > 10) {
      // Keep only half of the logs
      this.logs = this.logs.slice(-Math.floor(this.logs.length / 2));
    }
  }

  /**
   * Persist logs to AsyncStorage
   */
  private async persistLogs(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      // Check memory limit
      this.checkMemoryLimit();

      // Clean old logs
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - LOG_RETENTION_DAYS);
      const cutoffTimestamp = cutoffTime.toISOString();

      const filteredLogs = this.logs
        .filter((log) => log.timestamp > cutoffTimestamp)
        .slice(-MAX_LOGS_IN_STORAGE);

      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(filteredLogs));
    } catch (error) {
      console.error('Failed to persist logs', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Load logs from AsyncStorage
   */
  private async loadLogsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load logs from storage', error);
      this.logs = [];
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: any, module?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, module, metadata);
      this.logs.push(entry);
      console.log(this.formatLogMessage(LogLevel.DEBUG, message, module), metadata);
      this.persistLogs();
    }
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: any, module?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(LogLevel.INFO, message, module, metadata);
      this.logs.push(entry);
      console.log(this.formatLogMessage(LogLevel.INFO, message, module), metadata);
      this.persistLogs();
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: any, module?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry(LogLevel.WARN, message, module, metadata);
      this.logs.push(entry);
      console.warn(this.formatLogMessage(LogLevel.WARN, message, module), metadata);
      this.persistLogs();
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: any, module?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createLogEntry(LogLevel.ERROR, message, module, error);
      this.logs.push(entry);
      console.error(this.formatLogMessage(LogLevel.ERROR, message, module), error);
      this.persistLogs();
    }
  }

  /**
   * Log fatal error
   */
  fatal(message: string, error?: any, module?: string): void {
    if (this.shouldLog(LogLevel.FATAL)) {
      const entry = this.createLogEntry(LogLevel.FATAL, message, module, error);
      this.logs.push(entry);
      console.error(this.formatLogMessage(LogLevel.FATAL, message, module), error);
      this.persistLogs();
    }
  }

  /**
   * Get all logs or filtered by level
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return [...this.logs];
  }

  /**
   * Get logs after specific timestamp
   */
  getLogsAfter(timestamp: string): LogEntry[] {
    return this.logs.filter((log) => log.timestamp > timestamp);
  }

  /**
   * Get logs by module
   */
  getLogsByModule(module: string): LogEntry[] {
    return this.logs.filter((log) => log.module === module);
  }

  /**
   * Export logs as formatted string
   */
  async exportLogs(): Promise<string> {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        platform: Platform.OS,
        version: '1.0',
        sessionId: this.sessionId,
        stats: this.getStats(),
        logs: this.logs.map((log) => ({
          ...log,
          formattedTime: new Date(log.timestamp).toLocaleString('pt-BR'),
        })),
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      this.error('Failed to export logs', error, 'Logger');
      throw error;
    }
  }

  /**
   * Export logs as CSV for better compatibility
   */
  async exportLogsAsCSV(): Promise<string> {
    try {
      const headers = ['Timestamp', 'Level', 'Module', 'Message', 'Metadata'];
      const rows = this.logs.map((log) => [
        new Date(log.timestamp).toLocaleString('pt-BR'),
        log.level,
        log.module || '-',
        log.message,
        log.metadata ? JSON.stringify(log.metadata) : '-',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

      return csvContent;
    } catch (error) {
      this.error('Failed to export logs as CSV', error, 'Logger');
      throw error;
    }
  }

  /**
   * Clear all logs
   */
  async clearLogs(): Promise<void> {
    try {
      this.logs = [];
      await AsyncStorage.removeItem(LOG_STORAGE_KEY);
      this.info('Logs cleared');
    } catch (error) {
      this.error('Failed to clear logs', error, 'Logger');
    }
  }

  /**
   * Get comprehensive log statistics
   */
  getStats(): LogStats {
    const byLevel: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.FATAL]: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.level]++;
    });

    const storageSize = JSON.stringify(this.logs).length;

    return {
      totalLogs: this.logs.length,
      byLevel,
      oldestLog: this.logs[0]?.timestamp || null,
      newestLog: this.logs[this.logs.length - 1]?.timestamp || null,
      storageSize,
    };
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.logs.filter((log) => log.level === LogLevel.ERROR || log.level === LogLevel.FATAL)
      .length;
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const stats = this.getStats();
    console.group('📊 Logger Statistics');
    console.log(`Total logs: ${stats.totalLogs}`);
    console.log(`Debug: ${stats.byLevel.DEBUG}`);
    console.log(`Info: ${stats.byLevel.INFO}`);
    console.log(`Warn: ${stats.byLevel.WARN}`);
    console.log(`Error: ${stats.byLevel.ERROR}`);
    console.log(`Fatal: ${stats.byLevel.FATAL}`);
    console.log(`Storage size: ${(stats.storageSize / 1024).toFixed(2)} KB`);
    console.log(`Session: ${this.sessionId}`);
    console.groupEnd();
  }
}

// Create singleton instance
export const logger = new Logger();

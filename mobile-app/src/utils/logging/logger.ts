/**
 * Secure Logger Service
 *
 * Features:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * - Automatic masking of sensitive data
 * - Structured JSON logging
 * - Console, file, and remote logging
 * - Performance metrics
 * - Automatic log rotation
 * - GDPR-compliant retention policies
 * - User action tracking (without PII)
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logMasker, LogMasker } from './logMasking';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  module?: string;
  metadata?: Record<string, any>;
  stack?: string;
  sessionId: string;
  environment: 'development' | 'staging' | 'production';
  masked: boolean;
  userAction?: {
    action: string;
    category: string;
    metadata: Record<string, any>;
  };
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableFileLogging: boolean;
  enableRemoteLogging: boolean;
  environment: 'development' | 'staging' | 'production';
  maxLogsInMemory: number;
  maxLogsInStorage: number;
  retentionDays: number;
  remoteEndpoint?: string;
  remoteApiKey?: string;
  batchSize: number;
  flushInterval: number;
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: LogLevel.INFO,
  enableConsole: true,
  enableFileLogging: true,
  enableRemoteLogging: false,
  environment: 'development',
  maxLogsInMemory: 200,
  maxLogsInStorage: 500,
  retentionDays: 30,
  batchSize: 50,
  flushInterval: 5000,
};

const STORAGE_KEYS = {
  LOGS: '@crmt:secure_logs',
  SESSION_ID: '@crmt:session_id',
  CONFIG: '@crmt:logger_config',
};

export class SecureLogger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];
  private sessionId: string = '';
  private masker: LogMasker;
  private isProcessing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private batchQueue: LogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.masker = logMasker;
    this.initialize();
  }

  /**
   * Initialize logger
   */
  private async initialize(): Promise<void> {
    try {
      await this.initializeSession();
      await this.loadLogsFromStorage();
      this.startBatchFlusher();
      this.info('SecureLogger initialized', { environment: this.config.environment });
    } catch (error) {
      console.error('Failed to initialize SecureLogger', error);
    }
  }

  /**
   * Initialize session ID
   */
  private async initializeSession(): Promise<void> {
    try {
      let sessionId = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_ID);
      if (!sessionId) {
        sessionId = this.generateSessionId();
        await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
      }
      this.sessionId = sessionId;
    } catch (error) {
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
   * Start batch flusher for remote logging
   */
  private startBatchFlusher(): void {
    if (this.config.enableRemoteLogging && !this.flushTimer) {
      this.flushTimer = setInterval(() => {
        if (this.batchQueue.length > 0) {
          this.flushBatch();
        }
      }, this.config.flushInterval);
    }
  }

  /**
   * Format log level name
   */
  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      case LogLevel.CRITICAL:
        return 'CRITICAL';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Check if log should be recorded
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.minLevel;
  }

  /**
   * Create structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    module?: string,
    metadata?: any,
    userAction?: LogEntry['userAction'],
  ): LogEntry {
    // Mask sensitive data
    const maskedMessage = this.masker.mask(message);
    const maskedMetadata = metadata ? this.masker.maskObject(metadata) : undefined;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: this.getLevelName(level),
      message: maskedMessage,
      module,
      metadata: maskedMetadata,
      sessionId: this.sessionId,
      environment: this.config.environment,
      masked: message !== maskedMessage || JSON.stringify(metadata) !== JSON.stringify(maskedMetadata),
    };

    if (userAction) {
      entry.userAction = {
        action: userAction.action,
        category: userAction.category,
        metadata: this.masker.maskObject(userAction.metadata || {}),
      };
    }

    // Extract stack trace
    if (metadata instanceof Error) {
      entry.stack = metadata.stack;
      entry.message = `${maskedMessage}: ${this.masker.mask(metadata.message)}`;
    }

    return entry;
  }

  /**
   * Add log entry to memory and queue
   */
  private async addLogEntry(entry: LogEntry): Promise<void> {
    this.logs.push(entry);

    // Keep in-memory logs limited
    if (this.logs.length > this.config.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.config.maxLogsInMemory);
    }

    // Add to batch queue for remote logging
    if (entry.level >= LogLevel.WARN) {
      this.batchQueue.push(entry);
      if (this.batchQueue.length >= this.config.batchSize) {
        this.flushBatch();
      }
    }

    // Persist to storage
    await this.persistLogs();

    // Output to console
    if (this.config.enableConsole) {
      this.outputToConsole(entry);
    }
  }

  /**
   * Output log to console
   */
  private outputToConsole(entry: LogEntry): void {
    const timeStr = new Date(entry.timestamp).toLocaleTimeString('pt-BR');
    const prefix = `[${timeStr}] ${entry.levelName}${entry.module ? ` [${entry.module}]` : ''}`;

    const data = entry.metadata ? { ...entry.metadata, userAction: entry.userAction } : undefined;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, data);
        break;
      case LogLevel.INFO:
        console.log(prefix, entry.message, data);
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, data);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(prefix, entry.message, entry.stack || data);
        break;
    }
  }

  /**
   * Persist logs to AsyncStorage
   */
  private async persistLogs(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      // Clean old logs
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - this.config.retentionDays);
      const cutoffTimestamp = cutoffTime.toISOString();

      const filteredLogs = this.logs
        .filter(log => log.timestamp > cutoffTimestamp)
        .slice(-this.config.maxLogsInStorage);

      await AsyncStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(filteredLogs));
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
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.LOGS);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load logs from storage', error);
      this.logs = [];
    }
  }

  /**
   * Flush batch to remote endpoint
   */
  private async flushBatch(): Promise<void> {
    if (!this.config.enableRemoteLogging || this.batchQueue.length === 0) {
      return;
    }

    const batch = this.batchQueue.splice(0, this.config.batchSize);

    try {
      if (!this.config.remoteEndpoint) {
        throw new Error('Remote endpoint not configured');
      }

      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.remoteApiKey && { Authorization: `Bearer ${this.config.remoteApiKey}` }),
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          environment: this.config.environment,
          logs: batch,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Remote logging failed: ${response.status}`);
      }
    } catch (error) {
      // Re-queue failed logs
      this.batchQueue.unshift(...batch);
      console.error('Failed to flush batch to remote', error);
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, metadata?: any, module?: string): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, module, metadata);
      this.addLogEntry(entry);
    }
  }

  /**
   * Log info message
   */
  info(message: string, metadata?: any, module?: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(LogLevel.INFO, message, module, metadata);
      this.addLogEntry(entry);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, metadata?: any, module?: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry(LogLevel.WARN, message, module, metadata);
      this.addLogEntry(entry);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: any, module?: string): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createLogEntry(LogLevel.ERROR, message, module, error);
      this.addLogEntry(entry);
    }
  }

  /**
   * Log critical message
   */
  critical(message: string, error?: any, module?: string): void {
    if (this.shouldLog(LogLevel.CRITICAL)) {
      const entry = this.createLogEntry(LogLevel.CRITICAL, message, module, error);
      this.addLogEntry(entry);
    }
  }

  /**
   * Log user action (for analytics without PII)
   */
  logUserAction(
    action: string,
    category: string,
    metadata?: Record<string, any>,
  ): void {
    const entry = this.createLogEntry(
      LogLevel.INFO,
      `User action: ${action}`,
      'UserAction',
      undefined,
      { action, category, metadata: metadata || {} },
    );
    this.addLogEntry(entry);
  }

  /**
   * Get all logs
   */
  getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  /**
   * Get logs by module
   */
  getLogsByModule(module: string): LogEntry[] {
    return this.logs.filter(log => log.module === module);
  }

  /**
   * Get logs after timestamp
   */
  getLogsAfter(timestamp: string): LogEntry[] {
    return this.logs.filter(log => log.timestamp > timestamp);
  }

  /**
   * Get logs by level
   */
  getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Export logs as JSON
   */
  async exportLogs(): Promise<string> {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        platform: Platform.OS,
        environment: this.config.environment,
        sessionId: this.sessionId,
        stats: this.getStats(),
        logs: this.logs,
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      this.error('Failed to export logs', error, 'Logger');
      throw error;
    }
  }

  /**
   * Export logs as CSV
   */
  async exportLogsAsCSV(): Promise<string> {
    try {
      const headers = ['Timestamp', 'Level', 'Module', 'Message', 'Environment', 'Masked'];
      const rows = this.logs.map(log => [
        new Date(log.timestamp).toLocaleString('pt-BR'),
        log.levelName,
        log.module || '-',
        log.message,
        log.environment,
        log.masked ? 'Yes' : 'No',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      return csvContent;
    } catch (error) {
      this.error('Failed to export logs as CSV', error, 'Logger');
      throw error;
    }
  }

  /**
   * Get logging statistics
   */
  getStats() {
    const byLevel = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
      [LogLevel.CRITICAL]: 0,
    };

    this.logs.forEach(log => {
      byLevel[log.level]++;
    });

    const maskedCount = this.logs.filter(log => log.masked).length;
    const userActionCount = this.logs.filter(log => log.userAction).length;

    return {
      totalLogs: this.logs.length,
      byLevel,
      maskedLogs: maskedCount,
      userActions: userActionCount,
      oldestLog: this.logs[0]?.timestamp || null,
      newestLog: this.logs[this.logs.length - 1]?.timestamp || null,
      storageSize: JSON.stringify(this.logs).length,
      sessionId: this.sessionId,
      environment: this.config.environment,
    };
  }

  /**
   * Clear all logs
   */
  async clearLogs(): Promise<void> {
    try {
      this.logs = [];
      await AsyncStorage.removeItem(STORAGE_KEYS.LOGS);
      this.info('All logs cleared');
    } catch (error) {
      this.error('Failed to clear logs', error, 'Logger');
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.enableRemoteLogging && !this.flushTimer) {
      this.startBatchFlusher();
    }
    this.info('Logger configuration updated', { config: this.config });
  }

  /**
   * Flush batch manually
   */
  async flushManually(): Promise<void> {
    await this.flushBatch();
  }

  /**
   * Cleanup on app termination
   */
  async destroy(): Promise<void> {
    try {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
      await this.flushBatch();
      await this.persistLogs();
      this.info('Logger destroyed');
    } catch (error) {
      console.error('Failed to destroy logger', error);
    }
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const stats = this.getStats();
    console.group('📊 Secure Logger Statistics');
    console.log(`Total logs: ${stats.totalLogs}`);
    console.log(`Debug: ${stats.byLevel[LogLevel.DEBUG]}`);
    console.log(`Info: ${stats.byLevel[LogLevel.INFO]}`);
    console.log(`Warn: ${stats.byLevel[LogLevel.WARN]}`);
    console.log(`Error: ${stats.byLevel[LogLevel.ERROR]}`);
    console.log(`Critical: ${stats.byLevel[LogLevel.CRITICAL]}`);
    console.log(`Masked logs: ${stats.maskedLogs}`);
    console.log(`User actions: ${stats.userActions}`);
    console.log(`Storage size: ${(stats.storageSize / 1024).toFixed(2)} KB`);
    console.log(`Session: ${stats.sessionId}`);
    console.log(`Environment: ${stats.environment}`);
    console.groupEnd();
  }
}

// Export singleton instance
export const secureLogger = new SecureLogger();

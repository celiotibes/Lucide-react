import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: any;
  stack?: string;
}

const LOG_STORAGE_KEY = '@crmt:logs';
const MAX_LOGS = 1000;
const LOG_RETENTION_DAYS = 7;

class Logger {
  private minLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];
  private logQueue: LogEntry[] = [];
  private isProcessing = false;

  constructor() {
    this.loadLogsFromStorage();
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const minIndex = levels.indexOf(this.minLevel);
    const levelIndex = levels.indexOf(level);
    return levelIndex >= minIndex;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: any,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (metadata) {
      entry.metadata = metadata;
    }

    if (metadata instanceof Error) {
      entry.stack = metadata.stack;
    }

    return entry;
  }

  private async persistLogs(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      // Keep only recent logs
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - LOG_RETENTION_DAYS);
      const cutoffTimestamp = cutoffTime.toISOString();

      this.logs = this.logs
        .filter((log) => log.timestamp > cutoffTimestamp)
        .slice(-MAX_LOGS);

      await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('Failed to persist logs', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async loadLogsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(LOG_STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load logs from storage', error);
    }
  }

  debug(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const entry = this.createLogEntry(LogLevel.DEBUG, message, metadata);
      this.logs.push(entry);
      console.log(`[DEBUG] ${message}`, metadata);
      this.persistLogs();
    }
  }

  info(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const entry = this.createLogEntry(LogLevel.INFO, message, metadata);
      this.logs.push(entry);
      console.log(`[INFO] ${message}`, metadata);
      this.persistLogs();
    }
  }

  warn(message: string, metadata?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const entry = this.createLogEntry(LogLevel.WARN, message, metadata);
      this.logs.push(entry);
      console.warn(`[WARN] ${message}`, metadata);
      this.persistLogs();
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const entry = this.createLogEntry(LogLevel.ERROR, message, error);
      this.logs.push(entry);
      console.error(`[ERROR] ${message}`, error);
      this.persistLogs();
    }
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return this.logs;
  }

  getLogsAfter(timestamp: string): LogEntry[] {
    return this.logs.filter((log) => log.timestamp > timestamp);
  }

  async exportLogs(): Promise<string> {
    return JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        platform: Platform.OS,
        logs: this.logs,
      },
      null,
      2,
    );
  }

  async clearLogs(): Promise<void> {
    try {
      this.logs = [];
      await AsyncStorage.removeItem(LOG_STORAGE_KEY);
      this.info('Logs cleared');
    } catch (error) {
      this.error('Failed to clear logs', error);
    }
  }

  getStats(): {
    totalLogs: number;
    byLevel: Record<LogLevel, number>;
    oldestLog: string | null;
    newestLog: string | null;
  } {
    const byLevel = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 0,
      [LogLevel.WARN]: 0,
      [LogLevel.ERROR]: 0,
    };

    this.logs.forEach((log) => {
      byLevel[log.level]++;
    });

    return {
      totalLogs: this.logs.length,
      byLevel,
      oldestLog: this.logs[0]?.timestamp || null,
      newestLog: this.logs[this.logs.length - 1]?.timestamp || null,
    };
  }
}

export const logger = new Logger();

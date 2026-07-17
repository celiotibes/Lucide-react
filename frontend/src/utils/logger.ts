/**
 * Frontend Logger
 * Sistema de logging estruturado para o frontend
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
  timestamp: Date;
}

class FrontendLogger {
  private context: string;
  private isDevelopment = process.env.NODE_ENV === 'development';

  constructor(context: string) {
    this.context = context;
  }

  private format(level: LogLevel, message: string, data?: unknown): string {
    const time = new Date().toISOString();
    const prefix = `[${time}] [${level}] [${this.context}]`;

    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (!this.isDevelopment) return;

    const formatted = this.format('DEBUG', message, data);
    console.debug(formatted);
  }

  info(message: string, data?: unknown): void {
    const formatted = this.format('INFO', message, data);
    console.log(formatted);
  }

  warn(message: string, data?: unknown): void {
    const formatted = this.format('WARN', message, data);
    console.warn(formatted);
  }

  error(message: string, error?: Error, data?: unknown): void {
    const formatted = this.format('ERROR', message, data);
    console.error(formatted);
    if (error) {
      console.error('Error Details:', error);
    }
  }

  time(label: string): void {
    if (this.isDevelopment) {
      console.time(`[${this.context}] ${label}`);
    }
  }

  timeEnd(label: string): void {
    if (this.isDevelopment) {
      console.timeEnd(`[${this.context}] ${label}`);
    }
  }
}

const loggers: Map<string, FrontendLogger> = new Map();

export class Logger {
  static getLogger(context: string): FrontendLogger {
    if (!loggers.has(context)) {
      loggers.set(context, new FrontendLogger(context));
    }
    return loggers.get(context)!;
  }
}

export default Logger;

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  error?: string;
  data?: Record<string, unknown>;
  duration?: number; // ms
}

class LoggerService {
  private static isDev = process.env.NODE_ENV !== 'production';
  private static minLevel = process.env.LOG_LEVEL ? LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] : LogLevel.INFO;

  private static canLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.minLevel);
  }

  private static formatEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = entry.level.padEnd(5);
    const context = `[${entry.context}]`.padEnd(25);
    let msg = entry.message;

    if (entry.error) {
      msg += ` - ${entry.error}`;
    }

    if (entry.duration !== undefined) {
      msg += ` (${entry.duration}ms)`;
    }

    let output = `${timestamp} ${level} ${context} ${msg}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
      output += ` ${JSON.stringify(entry.data)}`;
    }

    return output;
  }

  private static log(level: LogLevel, context: string, message: string, error?: Error | string, data?: Record<string, unknown>, duration?: number) {
    if (!this.canLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      error: error instanceof Error ? error.message : typeof error === 'string' ? error : undefined,
      data,
      duration,
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        if (error instanceof Error && this.isDev) {
          console.error(error.stack);
        }
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.DEBUG:
        if (this.isDev) {
          console.debug(formatted);
        }
        break;
      default:
        console.log(formatted);
    }
  }

  static info(context: string, message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.INFO, context, message, undefined, data);
  }

  static warn(context: string, message: string, error?: Error | string, data?: Record<string, unknown>) {
    this.log(LogLevel.WARN, context, message, error, data);
  }

  static error(context: string, message: string, error?: Error | string, data?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, context, message, error, data);
  }

  static debug(context: string, message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, context, message, undefined, data);
  }

  static time(context: string, message: string, duration: number, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      context,
      message,
      data,
      duration,
    };

    const formatted = this.formatEntry(entry);
    console.log(formatted);
  }

  static getLogger(context: string) {
    return {
      info: (message: string, data?: Record<string, unknown>) => this.info(context, message, data),
      warn: (message: string, error?: Error | string, data?: Record<string, unknown>) => this.warn(context, message, error, data),
      error: (message: string, error?: Error | string, data?: Record<string, unknown>) => this.error(context, message, error, data),
      debug: (message: string, data?: Record<string, unknown>) => this.debug(context, message, data),
      time: (message: string, duration: number, data?: Record<string, unknown>) => this.time(context, message, duration, data),
    };
  }
}

export const Logger = LoggerService;

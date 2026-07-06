// Simple structured logging for the application
export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  data?: Record<string, unknown>;
}

class Logger {
  private static isDev = process.env.NODE_ENV !== "production";

  private static formatEntry(entry: LogEntry): string {
    const base = `[${entry.timestamp}] ${entry.level}`;
    const ctx = entry.context ? ` [${entry.context}]` : "";
    const msg = entry.message;
    const err = entry.error ? ` - ${entry.error}` : "";
    const data = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    return `${base}${ctx} ${msg}${err}${data}`;
  }

  private static log(level: LogLevel, context: string, message: string, error?: Error | string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error: error instanceof Error ? error.message : (typeof error === "string" ? error : undefined),
      data,
    };

    const formatted = this.formatEntry(entry);

    if (level === LogLevel.ERROR) {
      console.error(formatted);
      if (error instanceof Error && Logger.isDev) {
        console.error(error.stack);
      }
    } else if (level === LogLevel.WARN) {
      console.warn(formatted);
    } else if (level === LogLevel.DEBUG && Logger.isDev) {
      console.debug(formatted);
    } else {
      console.log(formatted);
    }
  }

  static info(context: string, message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.INFO, context, message, undefined, data);
  }

  static warn(context: string, message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.WARN, context, message, undefined, data);
  }

  static error(context: string, message: string, error?: Error | string, data?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, context, message, error, data);
  }

  static debug(context: string, message: string, data?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, context, message, undefined, data);
  }
}

export default Logger;

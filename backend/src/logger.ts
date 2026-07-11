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

  static info(context: string | Record<string, unknown>, message?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    // Handle overloads: (context, message, data) or (message, data)
    if (typeof context === "object" && message === undefined) {
      // Legacy format: Logger.info({ context, ... })
      const ctx = (context as Record<string, unknown>).context as string || "App";
      const msg = (context as Record<string, unknown>).message as string || "Info";
      const dataObj = context as Record<string, unknown>;
      this.log(LogLevel.INFO, ctx, msg, undefined, dataObj);
    } else if (typeof context === "string") {
      // Standard format: Logger.info("context", "message", {...})
      const msg = typeof message === "string" ? message : "Info";
      const dataObj = typeof message === "object" ? message : (data || {});
      this.log(LogLevel.INFO, context, msg, undefined, dataObj);
    } else {
      this.log(LogLevel.INFO, "App", "Info", undefined, {});
    }
  }

  static warn(context: string | Record<string, unknown>, message?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    if (typeof context === "object" && message === undefined) {
      const ctx = (context as Record<string, unknown>).context as string || "App";
      const msg = (context as Record<string, unknown>).message as string || "Warning";
      const dataObj = context as Record<string, unknown>;
      this.log(LogLevel.WARN, ctx, msg, undefined, dataObj);
    } else if (typeof context === "string") {
      const msg = typeof message === "string" ? message : "Warning";
      const dataObj = typeof message === "object" ? message : (data || {});
      this.log(LogLevel.WARN, context, msg, undefined, dataObj);
    } else {
      this.log(LogLevel.WARN, "App", "Warning", undefined, {});
    }
  }

  static error(context: string | Record<string, unknown>, message?: string | Error | Record<string, unknown>, error?: Error | string | Record<string, unknown>, data?: Record<string, unknown>) {
    if (typeof context === "object" && message === undefined) {
      const ctx = (context as Record<string, unknown>).context as string || "App";
      const msg = (context as Record<string, unknown>).message as string || "Error";
      const err = (context as Record<string, unknown>).error as Error | string | undefined;
      const dataObj = context as Record<string, unknown>;
      this.log(LogLevel.ERROR, ctx, msg, err, dataObj);
    } else if (typeof context === "string") {
      const msg = typeof message === "string" ? message : "Error";
      let err: Error | string | undefined;
      let dataObj: Record<string, unknown> | undefined;

      if (typeof message === "object") {
        dataObj = message;
      } else if (typeof error === "string" || error instanceof Error) {
        err = error;
        dataObj = typeof error === "object" && !(error instanceof Error) ? (error as Record<string, unknown>) : (data || {});
      }
      this.log(LogLevel.ERROR, context, msg, err, dataObj);
    } else {
      this.log(LogLevel.ERROR, "App", "Error", undefined, {});
    }
  }

  static debug(context: string | Record<string, unknown>, message?: string | Record<string, unknown>, data?: Record<string, unknown>) {
    if (typeof context === "object" && message === undefined) {
      const ctx = (context as Record<string, unknown>).context as string || "App";
      const msg = (context as Record<string, unknown>).message as string || "Debug";
      const dataObj = context as Record<string, unknown>;
      this.log(LogLevel.DEBUG, ctx, msg, undefined, dataObj);
    } else if (typeof context === "string") {
      const msg = typeof message === "string" ? message : "Debug";
      const dataObj = typeof message === "object" ? message : (data || {});
      this.log(LogLevel.DEBUG, context, msg, undefined, dataObj);
    } else {
      this.log(LogLevel.DEBUG, "App", "Debug", undefined, {});
    }
  }
}

export default Logger;

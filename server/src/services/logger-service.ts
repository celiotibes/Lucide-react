import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SEC-011: Structured Logging Service with Winston
 * Centralized logging with:
 * - Structured JSON format
 * - Request ID correlation
 * - Multiple transports (console + file)
 * - Log rotation and levels
 */

let winstonLogger: any = null;

// Initialize Winston logger at module load time
function initWinston() {
  try {
    // Only initialize Winston in node environments
    const winston = require('winston');

    // Custom format to add requestId context
    const customFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    );

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, requestId, ...meta }: any) => {
        const requestIdStr = requestId ? `[${requestId}] ` : '';
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} ${level}: ${requestIdStr}${message} ${metaStr}`.trim();
      })
    );

    // Create logger instance
    winstonLogger = winston.createLogger({
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
      format: customFormat,
      defaultMeta: {},
      transports: [
        // Console transport
        new winston.transports.Console({
          format: consoleFormat,
        }),
        // File transport - All logs
        new winston.transports.File({
          filename: path.join(__dirname, '../../logs/app.log'),
          format: customFormat,
        }),
        // File transport - Errors only
        new winston.transports.File({
          filename: path.join(__dirname, '../../logs/error.log'),
          level: 'error',
          format: customFormat,
        }),
      ],
    });
  } catch (e) {
    // Winston not available (e.g., in tests)
    winstonLogger = null;
  }
}

// Initialize at module load
initWinston();

// Fallback mock logger if Winston is not available
const mockLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[DEBUG] ${message}`, meta);
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(`[INFO] ${message}`, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(`[WARN] ${message}`, meta);
  },
  error: (message: string, error?: Error | Record<string, unknown>) => {
    if (error instanceof Error) {
      console.error(`[ERROR] ${message}`, { message: error.message, stack: error.stack });
    } else {
      console.error(`[ERROR] ${message}`, error);
    }
  },
  child: (meta: any) => ({
    debug: (msg: string, data?: any) => console.log(`[DEBUG] [${meta.requestId}] ${msg}`, data),
    info: (msg: string, data?: any) => console.log(`[INFO] [${meta.requestId}] ${msg}`, data),
    warn: (msg: string, data?: any) => console.warn(`[WARN] [${meta.requestId}] ${msg}`, data),
    error: (msg: string, error?: any) => console.error(`[ERROR] [${meta.requestId}] ${msg}`, error),
  }),
};

export const logger = winstonLogger || mockLogger;

// Child logger factory with requestId
export function createRequestLogger(requestId: string) {
  return logger.child({ requestId });
}

// Export convenience methods with types
export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => logger.debug(message, meta),
  info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
  error: (message: string, error?: Error | Record<string, unknown>) => logger.error(message, error),
};

export default logger;

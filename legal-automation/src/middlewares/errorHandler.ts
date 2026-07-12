/**
 * Global Error Handler Middleware
 * Standardizes error responses across the API with:
 * - Consistent JSON structure
 * - HTTP status codes
 * - Error codes and messages
 * - Detailed error information for debugging
 * - Trace IDs for request tracking
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, handleError } from '@utils/errors';
import { logger } from '@utils/logger';
import { generateTraceId } from '@utils/tracing';

export interface StandardErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  traceId: string;
  path?: string;
  method?: string;
}

/**
 * Express error handler middleware
 * Place this AFTER all other middleware and route handlers
 * app.use(errorHandler) - typically last in middleware chain
 */
export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Ensure we have a trace ID for request tracking
  const traceId = req.headers['x-trace-id'] as string || generateTraceId();

  // Convert any error to AppError
  const appError = handleError(error);

  // Build standardized error response
  const errorResponse: StandardErrorResponse = {
    statusCode: appError.statusCode,
    code: appError.code,
    message: appError.message,
    details: appError.details,
    timestamp: new Date().toISOString(),
    traceId,
    path: req.path,
    method: req.method,
  };

  // Log error with trace ID for debugging
  const logData = {
    traceId,
    statusCode: appError.statusCode,
    code: appError.code,
    message: appError.message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    details: appError.details,
  };

  // Log level based on status code
  if (appError.statusCode >= 500) {
    logger.error(logData, `[${traceId}] Server Error (${appError.statusCode})`);
  } else if (appError.statusCode >= 400) {
    logger.warn(logData, `[${traceId}] Client Error (${appError.statusCode})`);
  } else {
    logger.info(logData, `[${traceId}] Unexpected Status (${appError.statusCode})`);
  }

  // Set response headers
  res.setHeader('X-Trace-ID', traceId);
  res.setHeader('Content-Type', 'application/json');

  // Handle rate limit errors specially
  if (appError.statusCode === 429) {
    // Add rate limit headers
    res.setHeader('Retry-After', '60'); // Retry after 60 seconds
    if (appError.details?.['X-RateLimit-Limit']) {
      res.setHeader('X-RateLimit-Limit', appError.details['X-RateLimit-Limit']);
    }
    if (appError.details?.['X-RateLimit-Remaining']) {
      res.setHeader('X-RateLimit-Remaining', appError.details['X-RateLimit-Remaining']);
    }
    if (appError.details?.['X-RateLimit-Reset']) {
      res.setHeader('X-RateLimit-Reset', appError.details['X-RateLimit-Reset']);
    }
  }

  // Send error response
  res.status(appError.statusCode).json(errorResponse);
};

/**
 * Async error wrapper for route handlers
 * Wraps async route handlers to catch errors and pass to error handler
 *
 * Usage:
 * router.get('/path', asyncHandler(async (req, res) => {
 *   const data = await db.query(...);
 *   res.json(data);
 * }));
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/**
 * 404 Handler Middleware
 * Should be placed AFTER all route handlers
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const traceId = req.headers['x-trace-id'] as string || generateTraceId();
  const error = new AppError(
    404,
    `Rota não encontrada: ${req.method} ${req.path}`,
    'NOT_FOUND',
    {
      method: req.method,
      path: req.path,
    },
  );
  res.setHeader('X-Trace-ID', traceId);
  next(error);
};

/**
 * Request validation error handler
 * Formats validation errors from libraries like joi, zod, express-validator
 */
export class ValidationErrorFormatter {
  static formatJoiError(details: Array<{ field: string; message: string }>): Record<string, unknown> {
    return details.reduce(
      (acc, err) => {
        acc[err.field] = err.message;
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  static formatZodError(errors: Array<{ path: string[]; message: string }>): Record<string, unknown> {
    return errors.reduce(
      (acc, err) => {
        const path = err.path.join('.');
        acc[path] = err.message;
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }
}

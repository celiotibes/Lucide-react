/**
 * Request Tracing Utility
 * Generates and manages trace IDs for request tracking across the system
 * Helps with debugging and request correlation in logs
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique trace ID
 * Format: req-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
export function generateTraceId(): string {
  return `req-${uuidv4()}`;
}

/**
 * Middleware to add trace ID to all requests
 * If X-Trace-ID header exists, reuse it; otherwise generate new one
 *
 * Usage: app.use(addTraceIdMiddleware)
 */
export const addTraceIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Check if trace ID already exists (from upstream service)
  let traceId = req.headers['x-trace-id'] as string;

  if (!traceId) {
    traceId = generateTraceId();
  }

  // Attach to request object for access in route handlers
  (req as any).traceId = traceId;

  // Add to response headers
  res.setHeader('X-Trace-ID', traceId);

  // Continue to next middleware
  next();
};

/**
 * Get trace ID from current request
 */
export function getTraceId(req: Request): string {
  return (req as any).traceId || generateTraceId();
}

/**
 * RequestContext - manages request-scoped data
 * Useful for storing data that should be available throughout request lifecycle
 */
export interface RequestContext {
  traceId: string;
  userId?: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

// Use WeakMap to store context per request
const requestContextMap = new WeakMap<Request, RequestContext>();

/**
 * Create and attach request context
 */
export function createRequestContext(req: Request, userId?: string): RequestContext {
  const context: RequestContext = {
    traceId: (req as any).traceId || generateTraceId(),
    userId,
    startTime: Date.now(),
    metadata: {},
  };

  requestContextMap.set(req, context);
  return context;
}

/**
 * Get current request context
 */
export function getRequestContext(req: Request): RequestContext {
  let context = requestContextMap.get(req);

  if (!context) {
    context = createRequestContext(req);
  }

  return context;
}

/**
 * Update request metadata
 */
export function updateRequestMetadata(req: Request, metadata: Record<string, unknown>): void {
  const context = getRequestContext(req);
  context.metadata = { ...context.metadata, ...metadata };
}

/**
 * Middleware to create request context for all requests
 * Usage: app.use(requestContextMiddleware)
 */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Create context if not already created
  getRequestContext(req);
  next();
};

/**
 * Middleware to log request duration and add timing information
 * Usage: app.use(requestTimingMiddleware)
 */
export const requestTimingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const context = getRequestContext(req);

  // Hook into response finish event
  res.on('finish', () => {
    const duration = Date.now() - context.startTime;
    res.setHeader('X-Response-Time-Ms', String(duration));
  });

  next();
};

/**
 * Middleware to correlate distributed traces
 * Accepts trace context from upstream services and propagates to downstream
 *
 * Supports:
 * - W3C Trace Context (traceparent header)
 * - Jaeger (uber-trace-id header)
 * - Custom X-Trace-ID header
 */
export const traceContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  let traceId = (req as any).traceId;

  // Check W3C Trace Context format: traceparent: 00-0af7651916cd43dd-b9c7c3d12d1908a7-01
  const traceparent = req.headers.traceparent as string;
  if (traceparent) {
    const parts = traceparent.split('-');
    if (parts.length >= 3) {
      traceId = `${parts[1]}-${parts[2]}`;
    }
  }

  // Check Jaeger format: uber-trace-id: 80f6287c9070cc86:4e55d91d67b6cd7f:0:1
  const jaegerTraceId = req.headers['uber-trace-id'] as string;
  if (jaegerTraceId && !traceId) {
    const parts = jaegerTraceId.split(':');
    if (parts.length >= 2) {
      traceId = parts[0];
    }
  }

  // Use X-Trace-ID or generate new one
  if (!traceId) {
    traceId = req.headers['x-trace-id'] as string || generateTraceId();
  }

  (req as any).traceId = traceId;
  res.setHeader('X-Trace-ID', traceId);

  // Propagate trace context to response headers for downstream services
  if (traceparent) {
    res.setHeader('Traceparent', traceparent);
  }
  if (jaegerTraceId) {
    res.setHeader('Uber-Trace-ID', jaegerTraceId);
  }

  next();
};

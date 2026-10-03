import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../services/logger-service.js';

/**
 * SEC-011: Request ID Middleware
 * Injects a unique requestId for request correlation
 */

// Extend Express Request type to include requestId and logger
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      logger: ReturnType<typeof createRequestLogger>;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Get or create requestId
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // Attach to request
  req.requestId = requestId;
  req.logger = createRequestLogger(requestId);

  // Add to response headers
  res.setHeader('x-request-id', requestId);

  // Log request start
  req.logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Log response when finished
  res.on('finish', () => {
    req.logger.info('HTTP Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      contentLength: res.get('content-length'),
    });
  });

  next();
}

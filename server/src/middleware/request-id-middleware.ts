import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../services/logger-service.js';

/**
 * SEC-011: Request ID Middleware with Sampling
 * Injects a unique requestId for request correlation and implements
 * reservoir sampling to control logging volume:
 * - Production: log 10% of requests (reduce noise, save storage)
 * - Development: log 100% of requests (full debugging)
 * - Skip health checks (/api/health) and metrics (/metrics)
 */

// Extend Express Request type to include requestId and logger
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      logger: ReturnType<typeof createRequestLogger>;
      shouldLog?: boolean;
    }
  }
}

/**
 * OBS-003: Reservoir Sampling Implementation
 * Statistical sampling technique to select random items from a stream
 * without knowing the total size in advance
 *
 * Sample rate: 10% in production (0.1), 100% in development (1.0)
 */
class ReservoirSampler {
  private sampleRate: number;
  private requestCount: number = 0;

  constructor(sampleRate: number = 0.1) {
    this.sampleRate = Math.max(0, Math.min(1, sampleRate));
  }

  /**
   * Determine if a request should be logged based on reservoir sampling
   * @returns true if request should be logged, false otherwise
   */
  shouldLog(): boolean {
    this.requestCount++;

    // Always sample if rate is 1.0 (100%)
    if (this.sampleRate >= 1.0) {
      return true;
    }

    // Never sample if rate is 0 or less
    if (this.sampleRate <= 0) {
      return false;
    }

    // Probabilistic sampling
    return Math.random() < this.sampleRate;
  }

  /**
   * Get sampling statistics
   */
  getStats() {
    return {
      requestCount: this.requestCount,
      sampleRate: this.sampleRate,
    };
  }
}

// Initialize sampler based on environment
const sampleRate = process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
const requestSampler = new ReservoirSampler(sampleRate);

/**
 * Routes that should never be logged (health checks, metrics, etc.)
 */
const SKIP_LOGGING_PATHS = [
  /^\/api\/health(?:$|\?)/,  // /api/health and /api/health?leve=true
  /^\/metrics(?:$|\?)/,      // /metrics endpoint
];

/**
 * Check if a path should skip logging
 */
function shouldSkipLogging(path: string): boolean {
  return SKIP_LOGGING_PATHS.some(pattern => pattern.test(path));
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Get or create requestId
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // Attach to request
  req.requestId = requestId;
  req.logger = createRequestLogger(requestId);

  // Add to response headers
  res.setHeader('x-request-id', requestId);

  // Determine if this request should be logged (reservoir sampling + skip list)
  const isHealthCheck = shouldSkipLogging(req.path);
  const shouldLogRequest = !isHealthCheck && requestSampler.shouldLog();
  req.shouldLog = shouldLogRequest;

  // Track request start time for total duration
  const requestStartTime = Date.now();

  // Log request start (only if sampled)
  if (shouldLogRequest) {
    req.logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      sampled: true,
    });
  } else if (process.env.DEBUG_SAMPLING === 'true') {
    // Debug mode: log that request was skipped
    req.logger.debug('HTTP Request (skipped by sampling)', {
      method: req.method,
      path: req.path,
      sampleRate: sampleRate,
    });
  }

  // Log response when finished
  res.on('finish', () => {
    const totalDuration = Date.now() - requestStartTime;

    if (shouldLogRequest) {
      req.logger.info('HTTP Response', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        contentLength: res.get('content-length'),
        durationMs: totalDuration,
        sampled: true,
      });
    } else if (process.env.DEBUG_SAMPLING === 'true') {
      // Debug mode: log total duration even for skipped requests
      req.logger.debug('HTTP Response (skipped by sampling)', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: totalDuration,
        sampleRate: sampleRate,
      });
    }
  });

  next();
}

/**
 * Export sampler for metrics/monitoring purposes
 */
export function getRequestSamplerStats() {
  return requestSampler.getStats();
}

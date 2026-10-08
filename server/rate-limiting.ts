/**
 * Rate Limiting Middleware
 * Phase 22.18 — API Security
 *
 * Protects against brute force, DoS attacks, and excessive API usage
 * Implements per-IP and per-endpoint rate limiting with configurable thresholds
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string; // Response message
  statusCode?: number; // Response status code
  headers?: boolean; // Include RateLimit headers
  skipFailedRequests?: boolean; // Don't count failed requests
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

/**
 * Default rate limit configurations
 */
export const RATE_LIMIT_DEFAULTS = {
  // Global public endpoints
  public: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  },

  // Authenticated API endpoints
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 500,
  },

  // Expensive operations (OCR, PDF processing)
  expensive: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20,
  },

  // Authentication endpoints (prevent brute force)
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
  },

  // File upload endpoints
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
  },
};

/**
 * In-memory store for rate limit tracking
 * In production, use Redis or similar distributed cache
 */
class RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();

  /**
   * Increment request count for key
   * @returns true if limit not exceeded, false if exceeded
   */
  increment(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now >= record.resetTime) {
      // New window
      this.store.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return true;
    }

    // Existing window
    record.count++;
    return record.count <= config.maxRequests;
  }

  /**
   * Get current request count and remaining time
   */
  getStatus(key: string, config: RateLimitConfig): {
    count: number;
    limit: number;
    resetTime: number;
    remaining: number;
  } {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now >= record.resetTime) {
      return {
        count: 0,
        limit: config.maxRequests,
        resetTime: now + config.windowMs,
        remaining: config.maxRequests,
      };
    }

    return {
      count: record.count,
      limit: config.maxRequests,
      resetTime: record.resetTime,
      remaining: Math.max(0, config.maxRequests - record.count),
    };
  }

  /**
   * Clear expired entries (run periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now >= record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

// Global store instance
const store = new RateLimitStore();

// Cleanup every 10 minutes
setInterval(() => store.cleanup(), 10 * 60 * 1000);

/**
 * Extract client IP address
 * Considers X-Forwarded-For header (proxy) and falls back to socket
 */
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can be a list: "client, proxy1, proxy2"
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Rate limit middleware factory
 * Creates a middleware function with specified configuration
 */
export function rateLimit(config: RateLimitConfig = RATE_LIMIT_DEFAULTS.public) {
  const {
    windowMs,
    maxRequests,
    message = 'Too many requests, please try again later',
    statusCode = 429,
    headers = true,
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = getClientIP(req);
    const key = `${clientIP}`;

    const status = store.getStatus(key, { windowMs, maxRequests });
    const allowed = store.increment(key, { windowMs, maxRequests });

    // Set rate limit headers
    if (headers) {
      res.setHeader('RateLimit-Limit', status.limit);
      res.setHeader('RateLimit-Remaining', status.remaining);
      res.setHeader('RateLimit-Reset', Math.ceil(status.resetTime / 1000));
      res.setHeader('Retry-After', Math.ceil((status.resetTime - Date.now()) / 1000));
    }

    if (!allowed) {
      return res.status(statusCode).json({
        error: message,
        retryAfter: Math.ceil((status.resetTime - Date.now()) / 1000),
      });
    }

    next();
  };
}

/**
 * Per-endpoint rate limiter
 * Different limits for different endpoints
 */
export function endpointRateLimit(
  routePath: string,
  config: RateLimitConfig = RATE_LIMIT_DEFAULTS.api
) {
  const {
    windowMs,
    maxRequests,
    message = `Rate limit exceeded for ${routePath}`,
    statusCode = 429,
    headers = true,
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = getClientIP(req);
    const key = `${clientIP}:${routePath}:${req.method}`;

    const status = store.getStatus(key, { windowMs, maxRequests });
    const allowed = store.increment(key, { windowMs, maxRequests });

    if (headers) {
      res.setHeader('RateLimit-Limit', status.limit);
      res.setHeader('RateLimit-Remaining', status.remaining);
      res.setHeader('RateLimit-Reset', Math.ceil(status.resetTime / 1000));
    }

    if (!allowed) {
      return res.status(statusCode).json({
        error: message,
        endpoint: routePath,
        retryAfter: Math.ceil((status.resetTime - Date.now()) / 1000),
      });
    }

    next();
  };
}

/**
 * User-based rate limiter
 * For authenticated endpoints, limit per user ID instead of IP
 */
export function userRateLimit(config: RateLimitConfig = RATE_LIMIT_DEFAULTS.api) {
  const {
    windowMs,
    maxRequests,
    message = 'User rate limit exceeded',
    statusCode = 429,
    headers = true,
  } = config;

  return (req: Request & { userId?: string }, res: Response, next: NextFunction) => {
    // Requires user ID to be set by auth middleware
    if (!req.userId) {
      return next(); // Skip if no user
    }

    const key = `user:${req.userId}`;
    const status = store.getStatus(key, { windowMs, maxRequests });
    const allowed = store.increment(key, { windowMs, maxRequests });

    if (headers) {
      res.setHeader('RateLimit-Limit', status.limit);
      res.setHeader('RateLimit-Remaining', status.remaining);
      res.setHeader('RateLimit-Reset', Math.ceil(status.resetTime / 1000));
    }

    if (!allowed) {
      return res.status(statusCode).json({
        error: message,
        retryAfter: Math.ceil((status.resetTime - Date.now()) / 1000),
      });
    }

    next();
  };
}

/**
 * Sliding window rate limiter
 * More precise than fixed windows - resets after each request
 */
export function slidingWindowRateLimit(config: RateLimitConfig = RATE_LIMIT_DEFAULTS.public) {
  const { windowMs, maxRequests } = config;

  const requests = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = getClientIP(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    let recentRequests = requests.get(clientIP) || [];
    recentRequests = recentRequests.filter(time => time > windowStart);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000),
      });
    }

    recentRequests.push(now);
    requests.set(clientIP, recentRequests);

    // Cleanup old entries
    if (requests.size > 10000) {
      const oldestTime = now - windowMs;
      for (const [ip, times] of requests.entries()) {
        const filtered = times.filter(t => t > oldestTime);
        if (filtered.length === 0) {
          requests.delete(ip);
        } else {
          requests.set(ip, filtered);
        }
      }
    }

    next();
  };
}

/**
 * Rate limit status endpoint
 * For monitoring and debugging
 */
export function rateLimitStatus(req: Request, res: Response) {
  const clientIP = getClientIP(req);
  res.json({
    clientIP,
    message: 'Rate limiting is active',
    limits: RATE_LIMIT_DEFAULTS,
  });
}

/**
 * Whitelist IPs or patterns
 * Bypasses rate limiting for trusted sources
 */
export class RateLimitWhitelist {
  private whitelist: Set<string> = new Set();

  add(ip: string): void {
    this.whitelist.add(ip);
  }

  remove(ip: string): void {
    this.whitelist.delete(ip);
  }

  has(ip: string): boolean {
    return this.whitelist.has(ip);
  }

  middleware(config: RateLimitConfig = RATE_LIMIT_DEFAULTS.public) {
    const baseMiddleware = rateLimit(config);

    return (req: Request, res: Response, next: NextFunction) => {
      const clientIP = getClientIP(req);

      if (this.has(clientIP)) {
        return next(); // Skip rate limiting
      }

      baseMiddleware(req, res, next);
    };
  }
}

/**
 * Integration example for Express app
 *
 * // In your Express server setup:
 *
 * import express from 'express';
 * import {
 *   rateLimit,
 *   endpointRateLimit,
 *   userRateLimit,
 *   RATE_LIMIT_DEFAULTS,
 * } from './rate-limiting';
 *
 * const app = express();
 *
 * // Global rate limiting (all endpoints)
 * app.use(rateLimit(RATE_LIMIT_DEFAULTS.public));
 *
 * // Per-endpoint rate limiting
 * app.post('/api/ocr',
 *   endpointRateLimit('/api/ocr', RATE_LIMIT_DEFAULTS.expensive),
 *   handleOCR
 * );
 *
 * // Authenticated endpoints
 * app.post('/api/data',
 *   authenticate,
 *   userRateLimit(RATE_LIMIT_DEFAULTS.api),
 *   handleData
 * );
 *
 * // Auth endpoints (stricter)
 * app.post('/api/auth/login',
 *   endpointRateLimit('/api/auth/login', RATE_LIMIT_DEFAULTS.auth),
 *   handleLogin
 * );
 */

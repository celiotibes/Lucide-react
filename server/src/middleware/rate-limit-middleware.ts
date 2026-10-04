/**
 * SEC-XXX: Adaptive Rate Limiting
 *
 * Implements bucket-based rate limiting per user_id + IP with:
 * - Per-user rate limits (userId + IP combination)
 * - TTL-based bucket cleanup
 * - X-RateLimit-* headers in responses
 * - Different limits for critical endpoints (login, payment)
 * - Exponential backoff hints for clients
 *
 * Critical endpoints (10 req/min):
 * - POST /api/auth/login
 * - POST /api/auth/bootstrap
 * - POST /api/payments/*
 *
 * Regular endpoints (100 req/15min):
 * - All other API endpoints
 */

import type { Request, Response, NextFunction } from "express";
import { logger } from "../services/logger-service.js";

interface RateLimitBucket {
  requestCount: number;
  windowStart: number;
  blocked: boolean;
  blockedUntil?: number;
  violationCount: number; // Track number of consecutive violations for exponential backoff
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  limit: number; // Number of requests allowed in window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  handler?: (req: Request, res: Response, next: NextFunction) => void;
}

/**
 * In-memory store for rate limit buckets
 * In production, use Redis for distributed rate limiting
 */
class RateLimitStore {
  private buckets: Map<string, RateLimitBucket> = new Map();
  private cleanupInterval: NodeJS.Timer;

  constructor(cleanupIntervalMs: number = 60000) {
    // Clean up expired buckets every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * Get or create a bucket for a key
   */
  private getBucket(key: string): RateLimitBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, {
        requestCount: 0,
        windowStart: Date.now(),
        blocked: false,
        violationCount: 0,
      });
    }
    return this.buckets.get(key)!;
  }

  /**
   * Check if request should be rate limited
   * Returns { allowed, remaining, resetTime }
   */
  check(key: string, limit: number, windowMs: number): {
    allowed: boolean;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  } {
    const now = Date.now();
    const bucket = this.getBucket(key);

    // Check if bucket window has expired
    if (now - bucket.windowStart > windowMs) {
      // Reset bucket
      bucket.requestCount = 0;
      bucket.windowStart = now;
      bucket.blocked = false;
      bucket.violationCount = 0;
      delete bucket.blockedUntil;
    }

    // Check if currently blocked
    if (bucket.blocked && bucket.blockedUntil && now < bucket.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: bucket.blockedUntil,
        retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      };
    }

    // Unblock if window passed (but keep violationCount for exponential backoff)
    if (bucket.blocked) {
      bucket.blocked = false;
      delete bucket.blockedUntil;
      bucket.requestCount = 0;
      // Don't reset violationCount - it persists for exponential backoff within same window
    }

    // Increment counter
    bucket.requestCount += 1;
    const remaining = Math.max(0, limit - bucket.requestCount);
    const resetTime = bucket.windowStart + windowMs;

    // Check if limit exceeded
    if (bucket.requestCount > limit) {
      bucket.violationCount += 1;
      bucket.blocked = true;
      // Exponential backoff: 10s for 1st violation, 20s for 2nd, 60s for 3rd+
      const backoffMs = bucket.violationCount === 1 ? 10000 : bucket.violationCount === 2 ? 20000 : 60000;
      bucket.blockedUntil = now + backoffMs;

      return {
        allowed: false,
        remaining: 0,
        resetTime: resetTime,
        retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      };
    }

    return {
      allowed: true,
      remaining,
      resetTime,
    };
  }

  /**
   * Clean up expired buckets
   */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, bucket] of this.buckets.entries()) {
      // Remove buckets older than 24 hours
      if (now - bucket.windowStart > maxAge) {
        this.buckets.delete(key);
      }
    }

    logger.debug("[RateLimit] Cleanup completed", {
      remainingBuckets: this.buckets.size,
    });
  }

  /**
   * Clear all buckets (for testing)
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Destroy the store
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
  }
}

/**
 * Shared rate limit store instance
 */
const rateLimitStore = new RateLimitStore();

/**
 * Generate rate limit key from IP + optional userId
 */
function generateRateLimitKey(
  req: Request,
  includeUserId: boolean = false,
): string {
  const ip = req.ip || "unknown";
  const userId = includeUserId && (req.auth as any)?.usuario?.id ? (req.auth as any).usuario.id : null;

  return userId ? `${userId}:${ip}` : ip;
}

/**
 * Get rate limit config for endpoint
 */
function getEndpointConfig(req: Request): {
  limit: number;
  windowMs: number;
} {
  const path = req.path;

  // Critical endpoints: 10 req/min
  const criticalEndpoints = [
    /^\/api\/auth\/login$/,
    /^\/api\/auth\/bootstrap$/,
    /^\/api\/payments\//,
    /^\/api\/auth\/permissoes$/,
  ];

  const isCritical = criticalEndpoints.some((pattern) =>
    pattern.test(path),
  );

  if (isCritical) {
    return {
      limit: 10,
      windowMs: 60 * 1000, // 1 minute
    };
  }

  // Default: 100 req/15min
  return {
    limit: 100,
    windowMs: 15 * 60 * 1000,
  };
}

/**
 * Create rate limiting middleware
 * Uses userId + IP combination for authenticated users, just IP for others
 */
export function createRateLimitMiddleware(customConfig?: Partial<RateLimitConfig & { store?: RateLimitStore }>) {
  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    // Get endpoint-specific config
    const endpointConfig = getEndpointConfig(req);
    const { store, ...restConfig } = customConfig || {};
    const config: RateLimitConfig = {
      ...endpointConfig,
      ...restConfig,
    };

    // Use provided store or global store
    const storeInstance = store || rateLimitStore;

    // Generate rate limit key (includeUserId for authenticated requests)
    const isAuthenticated = !!(req.auth as any)?.usuario;
    const key = generateRateLimitKey(req, isAuthenticated);

    // Check rate limit
    const result = storeInstance.check(key, config.limit, config.windowMs);

    // Set rate limit headers (standard X-RateLimit-* format)
    const resetDate = new Date(result.resetTime);
    res.set("X-RateLimit-Limit", config.limit.toString());
    res.set("X-RateLimit-Remaining", result.remaining.toString());
    res.set("X-RateLimit-Reset", Math.ceil(result.resetTime / 1000).toString());

    if (result.retryAfter !== undefined) {
      res.set("Retry-After", result.retryAfter.toString());
    }

    // Log rate limit check (only if limit approaching or exceeded)
    if (result.remaining < 5 || !result.allowed) {
      logger.warn("[RateLimit] Limit check", {
        key: key.includes(":") ? key.split(":")[0] : "anonymous",
        endpoint: req.path,
        remaining: result.remaining,
        limit: config.limit,
        allowed: result.allowed,
      });
    }

    // Handle rate limit exceeded
    if (!result.allowed) {
      const statusCode = 429; // Too Many Requests
      const errorMessage =
        config.message || "Too many requests, please try again later.";

      return res.status(statusCode).json({
        erro: errorMessage,
        retryAfter: result.retryAfter,
        resetTime: resetDate.toISOString(),
      });
    }

    // Continue to next middleware
    next();
  };
}

/**
 * Middleware factory for different rate limit configurations
 */
export const rateLimitMiddleware = {
  /**
   * Critical endpoints: 10 req/min
   */
  critical: createRateLimitMiddleware({
    limit: 10,
    windowMs: 60 * 1000,
    message: "Too many requests to this critical endpoint",
  }),

  /**
   * Regular endpoints: 100 req/15min
   */
  standard: createRateLimitMiddleware({
    limit: 100,
    windowMs: 15 * 60 * 1000,
    message: "Too many requests, please try again later",
  }),

  /**
   * Strict: 5 req/min (for admin operations)
   */
  strict: createRateLimitMiddleware({
    limit: 5,
    windowMs: 60 * 1000,
    message: "Too many requests to this sensitive operation",
  }),

  /**
   * Relaxed: 500 req/hour (for read-only operations)
   */
  relaxed: createRateLimitMiddleware({
    limit: 500,
    windowMs: 60 * 60 * 1000,
    message: "Rate limit exceeded",
  }),
};

/**
 * Adaptive middleware that applies different limits based on endpoint
 */
export const adaptiveRateLimit = createRateLimitMiddleware();

/**
 * Export for testing purposes
 */
export { RateLimitStore, generateRateLimitKey, getEndpointConfig, rateLimitStore };

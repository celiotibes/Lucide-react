import { Request, Response, NextFunction } from 'express';
import { AppError } from '@utils/errors';
import { logger } from '@utils/logger';

// ============================================================================
// RATE LIMITING MIDDLEWARE - API Protection & DDoS Prevention
// ============================================================================

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface ClientLimiter {
  count: number;
  resetTime: number;
  blocked?: boolean;
}

export class RateLimiter {
  private clients: Map<string, ClientLimiter> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig = { windowMs: 60000, maxRequests: 100 }) {
    this.config = config;
    this.startCleanupInterval();
  }

  /**
   * Get client identifier
   */
  private getClientId(req: Request): string {
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  /**
   * Check rate limit for client
   */
  checkLimit(req: Request): { allowed: boolean; remaining: number; resetTime: number } {
    const clientId = this.getClientId(req);
    const now = Date.now();

    let limiter = this.clients.get(clientId);

    if (!limiter || now >= limiter.resetTime) {
      limiter = {
        count: 0,
        resetTime: now + this.config.windowMs,
        blocked: false,
      };
      this.clients.set(clientId, limiter);
    }

    limiter.count++;

    const allowed = limiter.count <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - limiter.count);

    if (!allowed) {
      limiter.blocked = true;
    }

    return {
      allowed,
      remaining,
      resetTime: limiter.resetTime,
    };
  }

  /**
   * Get client stats
   */
  getClientStats(clientId: string): ClientLimiter | null {
    return this.clients.get(clientId) || null;
  }

  /**
   * Reset client limit
   */
  resetClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  /**
   * Get all clients
   */
  getAllClients(): Map<string, ClientLimiter> {
    return new Map(this.clients);
  }

  /**
   * Cleanup expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      this.clients.forEach((limiter, clientId) => {
        if (now >= limiter.resetTime + 60000) {
          toDelete.push(clientId);
        }
      });

      toDelete.forEach((clientId) => this.clients.delete(clientId));

      if (toDelete.length > 0) {
        logger.debug({ deleted: toDelete.length }, 'Cleaned up rate limit entries');
      }
    }, 60000);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalClients: number;
    blockedClients: number;
    averageRequests: number;
  } {
    const clients = Array.from(this.clients.values());

    return {
      totalClients: clients.length,
      blockedClients: clients.filter((c) => c.blocked).length,
      averageRequests:
        clients.length > 0
          ? clients.reduce((sum, c) => sum + c.count, 0) / clients.length
          : 0,
    };
  }

  reset(): void {
    this.clients.clear();
    logger.info('RateLimiter resetado');
  }
}

/**
 * Create rate limiting middleware
 */
export const createRateLimitMiddleware = (config?: RateLimitConfig) => {
  const limiter = new RateLimiter(config);

  return (req: Request, res: Response, next: NextFunction) => {
    const { allowed, remaining, resetTime } = limiter.checkLimit(req);

    res.setHeader('X-RateLimit-Limit', limiter['config'].maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());

    if (!allowed) {
      logger.warn(
        { clientId: req.ip, endpoint: req.path },
        'Rate limit exceeded',
      );

      throw new AppError(
        'Too many requests. Please try again later.',
        429,
        'RATE_LIMIT_EXCEEDED',
      );
    }

    next();
  };
};

export default new RateLimiter();

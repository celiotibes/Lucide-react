import { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { cacheService } from '@services/CacheService';

// ============================================================================
// CACHE MIDDLEWARE - HTTP Response Caching
// ============================================================================

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
}

/**
 * Generate cache key from request
 */
function defaultKeyGenerator(req: Request): string {
  return `${req.method}:${req.path}:${JSON.stringify(req.query)}`;
}

/**
 * Create cache middleware
 */
export const createCacheMiddleware = (options: CacheOptions = {}) => {
  const {
    ttl = 300000,
    keyGenerator = defaultKeyGenerator,
    condition = (req) => req.method === 'GET',
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = keyGenerator(req);

    if (!condition(req, res)) {
      return next();
    }

    const cached = cacheService.get(cacheKey);

    if (cached) {
      logger.debug({ cacheKey }, 'Cache hit');
      res.set('X-Cache-Hit', 'true');
      return res.json(cached);
    }

    res.set('X-Cache-Hit', 'false');

    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      cacheService.set(cacheKey, data, ttl);
      logger.debug({ cacheKey }, 'Cache set');
      return originalJson(data);
    };

    next();
  };
};

/**
 * Invalidate cache patterns
 */
export const invalidateCache = (pattern: string): number => {
  const keys = cacheService.keys();
  let count = 0;

  keys.forEach((key) => {
    if (key.includes(pattern)) {
      cacheService.delete(key);
      count++;
    }
  });

  logger.info({ pattern, count }, 'Invalidated cache entries');
  return count;
};

/**
 * Cache specific endpoints
 */
export const GET_CACHE = createCacheMiddleware({
  ttl: 300000,
  condition: (req) => req.method === 'GET' && !req.query.nocache,
});

export const ANALYTICS_CACHE = createCacheMiddleware({
  ttl: 1800000,
  condition: (req) => req.path.includes('/analytics') || req.path.includes('/statistics'),
});

export const SHORT_CACHE = createCacheMiddleware({
  ttl: 60000,
  condition: (req) => req.method === 'GET',
});

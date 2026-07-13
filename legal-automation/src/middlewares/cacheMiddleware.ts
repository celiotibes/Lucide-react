import { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { cacheService } from '@services/CacheService';
import { redisCacheService } from '@services/RedisCacheService';

// ============================================================================
// CACHE MIDDLEWARE - HTTP Response Caching (In-Memory + Redis)
// ============================================================================

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request, res: Response) => boolean;
  useRedis?: boolean;
}

/**
 * Generate cache key from request
 */
function defaultKeyGenerator(req: Request): string {
  const userId = (req as any).user?.id || 'anonymous';
  return `${req.method}:${userId}:${req.path}:${JSON.stringify(req.query)}`;
}

/**
 * Create cache middleware com suporte híbrido (memória + Redis)
 */
export const createCacheMiddleware = (options: CacheOptions = {}) => {
  const {
    ttl = 300,
    keyGenerator = defaultKeyGenerator,
    condition = (req) => req.method === 'GET',
    useRedis = redisCacheService.isReady(),
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!condition(req, res)) {
      return next();
    }

    const cacheKey = keyGenerator(req);

    try {
      // Tenta obter do cache (Redis primeiro se disponível, depois memória)
      let cached = null;

      if (useRedis && redisCacheService.isReady()) {
        cached = await redisCacheService.get<any>(cacheKey, 'http');
      } else {
        cached = cacheService.get(cacheKey);
      }

      if (cached) {
        logger.debug({ cacheKey }, 'Cache hit');
        res.set('X-Cache', 'HIT');
        res.set('X-Cache-TTL', ttl.toString());
        return res.json(cached);
      }
    } catch (error) {
      logger.error({ error, cacheKey }, 'Erro ao obter do cache');
    }

    res.set('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);

    res.json = function (data: any) {
      const ttlSeconds = ttl || 300;

      // Armazena em ambos (memória para rápido acesso local, Redis para distribuído)
      try {
        cacheService.set(cacheKey, data, ttlSeconds * 1000);

        if (useRedis && redisCacheService.isReady()) {
          redisCacheService.set(cacheKey, data, {
            ttl: ttlSeconds,
            namespace: 'http',
          }).catch((error) => {
            logger.error({ error, cacheKey }, 'Erro ao armazenar em Redis');
          });
        }
      } catch (error) {
        logger.error({ error, cacheKey }, 'Erro ao armazenar em cache');
      }

      logger.debug({ cacheKey }, 'Cache set');
      return originalJson(data);
    };

    next();
  };
};

/**
 * Invalida padrão de cache
 */
export const invalidateCache = async (pattern: string, useRedis: boolean = true): Promise<number> => {
  let count = 0;

  // Invalida memória
  const keys = cacheService.keys();
  keys.forEach((key) => {
    if (key.includes(pattern)) {
      cacheService.delete(key);
      count++;
    }
  });

  // Invalida Redis
  if (useRedis && redisCacheService.isReady()) {
    const redisCount = await redisCacheService.invalidatePattern(pattern, 'http');
    count += redisCount;
  }

  logger.info({ pattern, count }, 'Cache invalidated');
  return count;
};

/**
 * Configurações de cache pré-definidas
 */
export const GET_CACHE = createCacheMiddleware({
  ttl: 300, // 5 minutos
  condition: (req) => req.method === 'GET' && !req.query.nocache,
});

export const ANALYTICS_CACHE = createCacheMiddleware({
  ttl: 1800, // 30 minutos
  condition: (req) => req.path.includes('/analytics') || req.path.includes('/statistics'),
});

export const SHORT_CACHE = createCacheMiddleware({
  ttl: 60, // 1 minuto
  condition: (req) => req.method === 'GET',
});

export const SEARCH_CACHE = createCacheMiddleware({
  ttl: 600, // 10 minutos
  condition: (req) => req.path.includes('/search'),
});

export const LONG_CACHE = createCacheMiddleware({
  ttl: 3600, // 1 hora
  condition: (req) => req.method === 'GET' && req.path.includes('/reference'),
});

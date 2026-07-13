/**
 * Cache Management Router
 * Endpoints para gerenciar cache distribuído
 */

import { Router, Request, Response } from 'express';
import { redisCacheService } from '@services/RedisCacheService';
import { cacheService } from '@services/CacheService';
import { invalidateCache } from '@middlewares/cacheMiddleware';
import { logger } from '@utils/logger';
import { asyncHandler } from '@middlewares/errorHandler';
import { verifyToken } from '@middlewares/authMiddleware';
import { ValidationError } from '@utils/errors';

const router = Router();

/**
 * Limpar todo o cache (memória e Redis)
 * DELETE /api/v1/cache
 */
router.delete(
  '/',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { namespace } = req.query;

    if (namespace) {
      await redisCacheService.flush(namespace as string);
      cacheService.clear();
      logger.info({ namespace }, 'Cache namespace limpo');
    } else {
      await redisCacheService.flush();
      cacheService.clear();
      logger.info('Cache completamente limpo');
    }

    res.json({
      success: true,
      message: 'Cache limpo com sucesso',
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Invalida padrão de cache
 * DELETE /api/v1/cache/pattern?pattern=*&namespace=app
 */
router.delete(
  '/pattern',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { pattern, namespace = 'app' } = req.query;

    if (!pattern || typeof pattern !== 'string') {
      throw new ValidationError('Pattern query parameter é obrigatório');
    }

    const count = await redisCacheService.invalidatePattern(pattern, namespace as string);

    // Também invalida memória
    const memoryKeys = cacheService.keys();
    let memoryCount = 0;
    memoryKeys.forEach((key) => {
      if (key.includes(pattern)) {
        cacheService.delete(key);
        memoryCount++;
      }
    });

    logger.info({ pattern, redisCount: count, memoryCount }, 'Padrão invalidado');

    res.json({
      success: true,
      invalidated: {
        redis: count,
        memory: memoryCount,
        total: count + memoryCount,
      },
      pattern,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Obtém estatísticas de cache
 * GET /api/v1/cache/stats
 */
router.get(
  '/stats',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const redisStats = redisCacheService.getStats();
    const memoryStats = cacheService.getStats();

    res.json({
      success: true,
      cache: {
        redis: {
          ...redisStats,
          connected: redisCacheService.isReady(),
        },
        memory: {
          ...memoryStats,
          totalMemory: memoryStats.memoryUsage,
        },
      },
      combined: {
        totalHits: redisStats.hits + memoryStats.hits,
        totalMisses: redisStats.misses + memoryStats.misses,
        totalSets: redisStats.sets + memoryStats.hits,
        overallHitRate:
          (redisStats.hits + memoryStats.hits) /
            (redisStats.hits +
              redisStats.misses +
              memoryStats.hits +
              memoryStats.misses) || 0,
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Reseta estatísticas de cache
 * POST /api/v1/cache/stats/reset
 */
router.post(
  '/stats/reset',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    redisCacheService.resetStats();
    cacheService.reset();

    logger.info('Estatísticas de cache resetadas');

    res.json({
      success: true,
      message: 'Estatísticas resetadas',
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Status do Redis
 * GET /api/v1/cache/redis/status
 */
router.get(
  '/redis/status',
  asyncHandler(async (req: Request, res: Response) => {
    const isReady = redisCacheService.isReady();

    res.json({
      success: true,
      redis: {
        connected: isReady,
        status: isReady ? 'connected' : 'disconnected',
        stats: isReady ? redisCacheService.getStats() : null,
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Warm up cache (pré-carrega dados populares)
 * POST /api/v1/cache/warmup
 */
router.post(
  '/warmup',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { namespace = 'app' } = req.body;

    logger.info({ namespace }, 'Cache warmup iniciado');

    // Aqui você pode adicionar lógica para pré-carregar dados frequentes
    // Por exemplo: clientes populares, casos em progresso, etc.

    res.json({
      success: true,
      message: 'Cache warmup iniciado',
      namespace,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Health check detalhado
 * GET /api/v1/cache/health
 */
router.get(
  '/health',
  asyncHandler(async (req: Request, res: Response) => {
    const redisReady = redisCacheService.isReady();
    const memoryReady = true; // Memória sempre está pronta

    const redisStats = redisReady ? redisCacheService.getStats() : null;
    const memoryStats = cacheService.getStats();

    const status =
      redisReady && memoryReady
        ? 'healthy'
        : redisReady || memoryReady
          ? 'degraded'
          : 'unhealthy';

    res.status(status === 'healthy' ? 200 : 206).json({
      success: status !== 'unhealthy',
      status,
      cache: {
        redis: {
          ready: redisReady,
          stats: redisStats,
        },
        memory: {
          ready: memoryReady,
          stats: memoryStats,
        },
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Migrar dados da memória para Redis
 * POST /api/v1/cache/migrate
 */
router.post(
  '/migrate',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    if (!redisCacheService.isReady()) {
      throw new ValidationError('Redis não está disponível');
    }

    const memoryKeys = cacheService.keys();
    let migratedCount = 0;

    for (const key of memoryKeys) {
      const value = cacheService.get(key);
      if (value) {
        await redisCacheService.set(key, value, {
          ttl: 3600,
          namespace: 'migrated',
        });
        migratedCount++;
      }
    }

    logger.info({ count: migratedCount }, 'Cache migrado para Redis');

    res.json({
      success: true,
      migrated: migratedCount,
      message: `${migratedCount} itens migrados de memória para Redis`,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Listar namespace de cache
 * GET /api/v1/cache/namespaces
 */
router.get(
  '/namespaces',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    // Redis não expõe namespaces diretamente
    // Aqui você poderia manter um registro de namespaces ativos

    const knownNamespaces = [
      'app',
      'http',
      'session',
      'search',
      'analytics',
      'user',
      'client',
      'case',
    ];

    res.json({
      success: true,
      namespaces: knownNamespaces,
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;

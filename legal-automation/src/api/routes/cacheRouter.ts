import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '@utils/logger';
import { cacheService, contractCache, clientCache, analyticsCache } from '@services/CacheService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * GET /cache/statistics - Get cache statistics
 */
router.get('/statistics', (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = {
      general: cacheService.getStats(),
      contracts: contractCache.getStats(),
      clients: clientCache.getStats(),
      analytics: analyticsCache.getStats(),
    };

    res.json({
      statusCode: 200,
      data: stats,
      message: 'Estatísticas de cache obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /cache/keys - Get all cache keys
 */
router.get('/keys', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cache: cacheType } = req.query;

    let keys: string[] = [];

    switch (cacheType) {
      case 'contracts':
        keys = contractCache.keys();
        break;
      case 'clients':
        keys = clientCache.keys();
        break;
      case 'analytics':
        keys = analyticsCache.keys();
        break;
      default:
        keys = cacheService.keys();
    }

    res.json({
      statusCode: 200,
      data: keys,
      total: keys.length,
      message: 'Chaves de cache obtidas com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cache/keys/:key - Delete specific cache key
 */
router.delete('/keys/:key', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key } = req.params;
    const { cache: cacheType } = req.query;

    let deleted = false;

    switch (cacheType) {
      case 'contracts':
        deleted = contractCache.delete(key);
        break;
      case 'clients':
        deleted = clientCache.delete(key);
        break;
      case 'analytics':
        deleted = analyticsCache.delete(key);
        break;
      default:
        deleted = cacheService.delete(key);
    }

    if (!deleted) {
      return res.status(404).json({
        statusCode: 404,
        data: null,
        message: `Chave ${key} não encontrada no cache`,
      });
    }

    res.json({
      statusCode: 200,
      message: `Chave ${key} removida do cache com sucesso`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /cache/clear - Clear all cache
 */
router.delete('/clear', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { cache: cacheType } = req.query;

    switch (cacheType) {
      case 'contracts':
        contractCache.clear();
        break;
      case 'clients':
        clientCache.clear();
        break;
      case 'analytics':
        analyticsCache.clear();
        break;
      default:
        cacheService.clear();
        contractCache.clear();
        clientCache.clear();
        analyticsCache.clear();
    }

    res.json({
      statusCode: 200,
      message: 'Cache limpo com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /cache/reset - Reset cache (testing only)
 */
router.post('/reset', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { confirmReset } = req.body;

    if (!confirmReset) {
      throw new AppError('Confirmação de reset é obrigatória', 400, 'VALIDATION_ERROR');
    }

    cacheService.reset();
    contractCache.reset();
    clientCache.reset();
    analyticsCache.reset();

    res.json({
      statusCode: 200,
      message: 'Cache resetado com sucesso',
    });
  } catch (error) {
    next(error);
  }
});

export default router;

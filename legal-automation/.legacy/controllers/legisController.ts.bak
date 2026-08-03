/**
 * Legis Controller
 * REST endpoints for jurisprudence search and analysis
 */

import { Router, Request, Response } from 'express';
import { logger } from '@utils/logger';
import { legisIntegrationService } from '@services/LegisIntegrationService';
import { auditLogService } from '@services/AuditLogService';
import { AppError } from '@utils/errors';

const router = Router();

/**
 * POST /api/v1/legis/search
 * Buscar jurisprudência por palavras-chave
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { keywords, court = 'both', pageNumber = 1, pageSize = 10 } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new AppError(400, 'Palavras-chave são obrigatórias');
    }

    logger.info(
      {
        keywords: keywords.join(', '),
        court,
        pageNumber,
        pageSize,
      },
      'Iniciando busca de jurisprudência',
    );

    const result = await legisIntegrationService.searchJurisprudence(
      keywords,
      court as 'STJ' | 'STF' | 'both',
      pageNumber,
      pageSize,
    );

    // Registrar na auditoria
    await auditLogService.log({
      action: 'JURISPRUDENCE_SEARCH',
      entityType: 'Jurisprudence',
      entityId: `search_${keywords.join('_')}`,
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          keywords: keywords.join(', '),
          court,
          resultsCount: result.totalResults,
        },
      },
      status: 'success',
    });

    res.json({
      success: true,
      data: result,
      pagination: {
        pageNumber: result.pageNumber,
        pageSize: result.pageSize,
        totalResults: result.totalResults,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao buscar jurisprudência');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/legis/analyze
 * Analisar caso contra jurisprudência
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { caseNumber, subjects, keywords } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    if (!caseNumber) {
      throw new AppError(400, 'Número do processo é obrigatório');
    }

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new AppError(400, 'Palavras-chave são obrigatórias');
    }

    logger.info(
      {
        caseNumber,
        subjects: subjects?.join(', '),
        keywords: keywords.join(', '),
      },
      'Iniciando análise jurisprudencial',
    );

    const analysis = await legisIntegrationService.analyzeCase(
      caseNumber,
      subjects || [],
      keywords,
      userId,
    );

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao analisar jurisprudência');
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/legis/most-cited
 * Obter decisões mais citadas
 */
router.get('/most-cited', async (req: Request, res: Response) => {
  try {
    const court = (req.query.court as 'STJ' | 'STF' | 'both') || 'both';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    logger.info(
      {
        court,
        limit,
      },
      'Obtendo decisões mais citadas',
    );

    const decisions = await legisIntegrationService.getMostCitedDecisions(court, limit);

    res.json({
      success: true,
      data: decisions,
      count: decisions.length,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter decisões mais citadas');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/v1/legis/statistics
 * Obter estatísticas de jurisprudência
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = await legisIntegrationService.getStatistics();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao obter estatísticas');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * POST /api/v1/legis/invalidate-cache
 * Invalidar cache de jurisprudência
 */
router.post('/invalidate-cache', async (req: Request, res: Response) => {
  try {
    const { keywords } = req.body;
    const userId = (req as any).user?.id || 'unknown';

    await legisIntegrationService.invalidateCache(keywords);

    // Registrar na auditoria
    await auditLogService.log({
      action: 'JURISPRUDENCE_CACHE_INVALIDATE',
      entityType: 'Jurisprudence',
      entityId: 'cache',
      userId,
      ipAddress: req.ip || 'unknown',
      changes: {
        after: {
          keywords: keywords?.join(', ') || 'all',
        },
      },
      status: 'success',
    });

    logger.info({ keywords }, 'Cache de jurisprudência invalidado');

    res.json({
      success: true,
      message: 'Cache invalidado com sucesso',
    });
  } catch (error) {
    logger.error({ error }, 'Erro ao invalidar cache');
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export default router;

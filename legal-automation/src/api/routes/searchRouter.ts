/**
 * Advanced Search Router
 * Endpoints para busca full-text avançada com Elasticsearch
 */

import { Router, Request, Response } from 'express';
import { elasticsearchService } from '@services/ElasticsearchService';
import { logger } from '@utils/logger';
import { asyncHandler } from '@middlewares/errorHandler';
import { verifyToken } from '@middlewares/authMiddleware';
import { ValidationError } from '@utils/errors';

const router = Router();

/**
 * Search de clientes
 * GET /api/v1/search/clients?q=termo&status=CUSTOMER&page=1&limit=20
 */
router.get(
  '/clients',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, status, page = '1', limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const results = await elasticsearchService.search(
      'clients',
      q,
      { status: status as string },
      pageNum,
      limitNum,
    );

    logger.info(
      { query: q, total: results.total, page: pageNum },
      'Busca de clientes realizada',
    );

    res.json({
      success: true,
      data: results,
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Search de casos
 * GET /api/v1/search/cases?q=termo&status=IN_PROGRESS&clientId=xxx&caseType=Civil
 */
router.get(
  '/cases',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, status, clientId, caseType, page = '1', limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const results = await elasticsearchService.search(
      'cases',
      q,
      {
        status: status as string,
        clientId: clientId as string,
        caseType: caseType as string,
      },
      pageNum,
      limitNum,
    );

    logger.info(
      { query: q, total: results.total, page: pageNum },
      'Busca de casos realizada',
    );

    res.json({
      success: true,
      data: results,
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Search de contratos
 * GET /api/v1/search/contracts?q=termo&status=SIGNED&clientId=xxx
 */
router.get(
  '/contracts',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, status, clientId, page = '1', limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const results = await elasticsearchService.search(
      'contracts',
      q,
      { status: status as string, clientId: clientId as string },
      pageNum,
      limitNum,
    );

    logger.info(
      { query: q, total: results.total, page: pageNum },
      'Busca de contratos realizada',
    );

    res.json({
      success: true,
      data: results,
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Search de faturas
 * GET /api/v1/search/invoices?q=termo&status=OVERDUE&clientId=xxx
 */
router.get(
  '/invoices',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, status, clientId, page = '1', limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const results = await elasticsearchService.search(
      'invoices',
      q,
      { status: status as string, clientId: clientId as string },
      pageNum,
      limitNum,
    );

    logger.info(
      { query: q, total: results.total, page: pageNum },
      'Busca de faturas realizada',
    );

    res.json({
      success: true,
      data: results,
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Search de intimações
 * GET /api/v1/search/intimations?q=termo&caseId=xxx&isProcessed=false
 */
router.get(
  '/intimations',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, caseId, page = '1', limit = '20' } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

    const results = await elasticsearchService.search(
      'intimations',
      q,
      { clientId: caseId as string },
      pageNum,
      limitNum,
    );

    logger.info(
      { query: q, total: results.total, page: pageNum },
      'Busca de intimações realizada',
    );

    res.json({
      success: true,
      data: results,
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Busca global (todos os índices)
 * GET /api/v1/search/global?q=termo&type=cases,clients,contracts
 */
router.get(
  '/global',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, type = 'cases,clients,contracts,invoices,intimations', page = '1', limit = '20' } =
      req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const indexes = (type as string).split(',').map((t) => t.trim());

    const allResults = [];
    const searchPromises = indexes.map((index) =>
      elasticsearchService
        .search(index, q, {}, pageNum, limitNum)
        .then((results) => results.results.map((r) => ({ ...r, type: index })))
        .catch(() => []),
    );

    const results = await Promise.all(searchPromises);
    for (const result of results) {
      allResults.push(...result);
    }

    // Ordena por score relevância
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

    logger.info(
      { query: q, total: allResults.length, types: indexes.length },
      'Busca global realizada',
    );

    res.json({
      success: true,
      data: {
        total: allResults.length,
        page: pageNum,
        limit: limitNum,
        results: allResults.slice(0, limitNum),
      },
      query: q,
      types: indexes,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Busca com agregações (facetas)
 * GET /api/v1/search/cases/facets?q=termo
 */
router.get(
  '/cases/facets',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      throw new ValidationError('Query parameter "q" é obrigatório');
    }

    const aggregations = {
      by_status: {
        terms: { field: 'status', size: 10 },
      },
      by_case_type: {
        terms: { field: 'caseType', size: 10 },
      },
      by_court: {
        terms: { field: 'courtName', size: 10 },
      },
      by_outcome: {
        terms: { field: 'outcome', size: 10 },
      },
      amount_range: {
        range: {
          field: 'amountClaimed',
          ranges: [
            { to: 10000 },
            { from: 10000, to: 50000 },
            { from: 50000, to: 100000 },
            { from: 100000 },
          ],
        },
      },
    };

    const results = await elasticsearchService.searchWithAggregations('cases', q, aggregations);

    logger.info({ query: q }, 'Busca com facetas realizada');

    res.json({
      success: true,
      data: {
        total: results.total,
        facets: results.aggregations,
      },
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Sugestões de busca (autocomplete)
 * GET /api/v1/search/suggest?q=ter&type=clients
 */
router.get(
  '/suggest',
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { q, type = 'cases' } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      throw new ValidationError('Query parameter "q" deve ter pelo menos 2 caracteres');
    }

    // Busca com limite pequeno para autocomplete
    const results = await elasticsearchService.search(
      type as string,
      q,
      {},
      1,
      10,
    );

    const suggestions = results.results.map((r) => ({
      id: r.id,
      title: r.data.name || r.data.title || r.data.caseNumber || '',
      type: type,
      score: r.score,
    }));

    res.json({
      success: true,
      suggestions,
      query: q,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Status do Elasticsearch
 * GET /api/v1/search/status
 */
router.get(
  '/status',
  asyncHandler(async (req: Request, res: Response) => {
    const isReady = elasticsearchService.isReady();

    res.json({
      success: true,
      elasticsearch: {
        connected: isReady,
        status: isReady ? 'ready' : 'disconnected',
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

export default router;

/**
 * BI Routes - Endpoints REST para módulo de Business Intelligence
 * Fornece acesso a KPIs, movimentações e relatórios financeiros
 */

import { Router, Request, Response } from 'express';
import { Logger } from '../../shared/logger';
import { pool } from '../../db/pool';
import { redis } from '../../cache/redis';
import { KPICalculator } from '../services/kpi-calculator';
import { FinancialTransformer } from '../utils/transformers/financial-transformer';
import { ratingCache } from '../../shared/cache';

const logger = Logger.getLogger('BiRoutes');
const router = Router();

/**
 * GET /api/bi/kpis
 * Busca KPIs principais para um período e propriedades
 */
router.post('/kpis', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, propertyIds = [] } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate e endDate são obrigatórios',
      });
    }

    logger.info('Buscando KPIs', { startDate, endDate, propertyCount: propertyIds.length });

    // Tentar cache primeiro
    const cacheKey = `bi:kpis:${startDate}:${endDate}:${propertyIds.join(',')}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      logger.debug('KPIs retornados do cache', { cacheKey });
      return res.json({
        data: JSON.parse(cached),
        meta: {
          timestamp: new Date(),
          source: 'cache',
        },
      });
    }

    // Buscar movimentações do período
    const query = `
      SELECT * FROM fact_financial_movements
      WHERE date_id BETWEEN $1::DATE AND $2::DATE
      ${propertyIds.length > 0 ? 'AND property_id = ANY($3::uuid[])' : ''}
      ORDER BY date_id DESC
    `;

    const params = propertyIds.length > 0 ? [startDate, endDate, propertyIds] : [startDate, endDate];
    const result = await pool.query(query, params);

    const movements = result.rows.map((row) => ({
      id: row.movement_id,
      propertyId: row.property_id,
      accountId: row.account_id,
      movementDate: new Date(row.date_id),
      amount: parseFloat(row.amount),
      movementType: row.movement_type,
      category: 'operational', // Mapeado do banco
      description: row.description,
      platform: row.platform,
      reference: row.reference_number,
      createdAt: new Date(row.created_at),
    }));

    // Calcular KPIs
    const calculator = new KPICalculator();
    const previousStartDate = new Date(new Date(startDate).getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const previousResult = await pool.query(
      query.replace('$1::DATE AND $2::DATE', '$1::DATE AND $3::DATE'),
      [previousStartDate, startDate, ...params.slice(2)]
    );

    const previousMovements = previousResult.rows.map((row) => ({
      id: row.movement_id,
      propertyId: row.property_id,
      accountId: row.account_id,
      movementDate: new Date(row.date_id),
      amount: parseFloat(row.amount),
      movementType: row.movement_type,
      category: 'operational',
      description: row.description,
      platform: row.platform,
      reference: row.reference_number,
      createdAt: new Date(row.created_at),
    }));

    const kpis = await calculator.calculateAllKPIs(
      movements,
      previousMovements,
      propertyIds[0] || 'all'
    );

    // Cachear resultado por 1 hora
    await redis.setex(cacheKey, 3600, JSON.stringify(kpis));

    logger.info('KPIs calculados com sucesso', {
      startDate,
      endDate,
      ebitda: kpis.ebitda.value,
    });

    res.json({
      data: kpis,
      meta: {
        timestamp: new Date(),
        executionTime: Date.now(),
        source: 'calculated',
      },
    });
  } catch (error) {
    logger.error('Erro ao buscar KPIs', error as Error);
    res.status(500).json({
      error: 'Erro ao calcular KPIs',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

/**
 * GET /api/bi/movements
 * Lista movimentações financeiras com filtros
 */
router.get('/movements', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, propertyId, platform, limit = 100, offset = 0 } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate e endDate são obrigatórios',
      });
    }

    logger.info('Buscando movimentações', { startDate, endDate, propertyId, platform });

    let query = `
      SELECT * FROM fact_financial_movements
      WHERE date_id BETWEEN $1::DATE AND $2::DATE
    `;
    const params: any[] = [startDate, endDate];

    if (propertyId) {
      query += ` AND property_id = $${params.length + 1}`;
      params.push(propertyId);
    }

    if (platform) {
      query += ` AND platform = $${params.length + 1}`;
      params.push(platform);
    }

    // Contar total
    const countResult = await pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*) as total'),
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Buscar com paginação
    query += ` ORDER BY date_id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const movements = result.rows.map((row) => ({
      id: row.movement_id,
      propertyId: row.property_id,
      amount: parseFloat(row.amount),
      movementType: row.movement_type,
      platform: row.platform,
      date: row.date_id,
      description: row.description,
    }));

    res.json({
      data: movements,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        pages: Math.ceil(total / parseInt(limit as string)),
      },
      meta: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error('Erro ao buscar movimentações', error as Error);
    res.status(500).json({
      error: 'Erro ao buscar movimentações',
    });
  }
});

/**
 * GET /api/bi/reports/waterfall
 * Gera dados para gráfico de cascata (DRE)
 */
router.post('/reports/waterfall', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, propertyId } = req.body;

    if (!startDate || !endDate || !propertyId) {
      return res.status(400).json({
        error: 'startDate, endDate e propertyId são obrigatórios',
      });
    }

    logger.info('Gerando relatório Waterfall', { startDate, endDate, propertyId });

    const query = `
      SELECT movement_type, SUM(amount) as total
      FROM fact_financial_movements
      WHERE property_id = $1 AND date_id BETWEEN $2::DATE AND $3::DATE
      GROUP BY movement_type
      ORDER BY movement_type
    `;

    const result = await pool.query(query, [propertyId, startDate, endDate]);

    const calculator = new KPICalculator();
    const movements = result.rows.map((row) => ({
      id: '',
      propertyId,
      accountId: '',
      movementDate: new Date(startDate),
      amount: parseFloat(row.total),
      movementType: row.movement_type,
      category: '',
      description: '',
      platform: '',
      reference: '',
      createdAt: new Date(),
    }));

    const waterfallData = calculator.calculateWaterfallData(movements);

    res.json({
      data: waterfallData,
      meta: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error('Erro ao gerar Waterfall', error as Error);
    res.status(500).json({
      error: 'Erro ao gerar Waterfall',
    });
  }
});

/**
 * GET /api/bi/reports/sankey
 * Gera dados para diagrama Sankey (fluxo de caixa)
 */
router.post('/reports/sankey', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, propertyId } = req.body;

    if (!startDate || !endDate || !propertyId) {
      return res.status(400).json({
        error: 'startDate, endDate e propertyId são obrigatórios',
      });
    }

    logger.info('Gerando relatório Sankey', { startDate, endDate, propertyId });

    const query = `
      SELECT platform, movement_type, SUM(amount) as total
      FROM fact_financial_movements
      WHERE property_id = $1 AND date_id BETWEEN $2::DATE AND $3::DATE
      GROUP BY platform, movement_type
      ORDER BY platform, movement_type
    `;

    const result = await pool.query(query, [propertyId, startDate, endDate]);

    const calculator = new KPICalculator();
    const movements = result.rows.map((row) => ({
      id: '',
      propertyId,
      accountId: '',
      movementDate: new Date(startDate),
      amount: parseFloat(row.total),
      movementType: row.movement_type,
      category: row.platform,
      description: '',
      platform: row.platform,
      reference: '',
      createdAt: new Date(),
    }));

    const sankeyData = calculator.calculateSankeyData(movements);

    res.json({
      data: sankeyData,
      meta: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error('Erro ao gerar Sankey', error as Error);
    res.status(500).json({
      error: 'Erro ao gerar Sankey',
    });
  }
});

/**
 * POST /api/bi/movements/sync
 * Enfileira sincronização de movimentações financeiras
 */
router.post('/movements/sync', async (req: Request, res: Response) => {
  try {
    const { propertyId, startDate, endDate, platforms } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        error: 'propertyId é obrigatório',
      });
    }

    logger.info('Sincronização enfileirada', {
      propertyId,
      startDate,
      endDate,
      platforms,
    });

    // Enfileirar job de sincronização
    // const queue = getQueue('sync-financial-reporting');
    // const job = await queue.add('sync', {
    //   propertyId,
    //   startDate: startDate || new Date().toISOString().split('T')[0],
    //   endDate: endDate || new Date().toISOString().split('T')[0],
    //   platforms: platforms || ['booking', 'hospeda', 'tripadvisor'],
    // });

    res.json({
      data: {
        status: 'enqueued',
        // jobId: job.id,
        propertyId,
      },
      meta: {
        timestamp: new Date(),
      },
    });
  } catch (error) {
    logger.error('Erro ao enfileirar sincronização', error as Error);
    res.status(500).json({
      error: 'Erro ao sincronizar',
    });
  }
});

/**
 * GET /api/bi/health
 * Health check do módulo BI
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const dbHealth = await pool.query('SELECT 1');
    const redisHealth = await redis.ping();

    res.json({
      status: 'healthy',
      services: {
        database: dbHealth.rows.length > 0 ? 'ok' : 'error',
        cache: redisHealth === 'PONG' ? 'ok' : 'error',
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Health check falhou', error as Error);
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});

export const biRouter = router;

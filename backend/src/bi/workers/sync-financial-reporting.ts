/**
 * Worker: Sincronizar Dados Financeiros e Calcular KPIs
 * ETL automático que extrai dados de movimentações, transforma em formato padrão,
 * calcula KPIs e persiste em Star Schema
 */

import { Worker, Job } from 'bullmq';
import { pool } from '../../db/pool';
import { redis } from '../../cache/redis';
import { Logger } from '../../shared/logger';
import { KPICalculator } from '../services/kpi-calculator';
import { FinancialTransformer } from '../utils/transformers/financial-transformer';
import { ratingCache, occupancyCache } from '../../shared/cache';

const logger = Logger.getLogger('SyncFinancialReportingWorker');

interface FinancialReportingJob {
  propertyId: string;
  startDate: string;
  endDate: string;
  platforms?: ('booking' | 'hospeda' | 'tripadvisor')[];
}

const worker = new Worker(
  'sync-financial-reporting',
  async (job: Job<FinancialReportingJob>) => {
    const { propertyId, startDate, endDate, platforms = ['booking', 'hospeda', 'tripadvisor'] } =
      job.data;
    const startTime = Date.now();

    try {
      logger.info('Iniciando sincronização de relatório financeiro', {
        propertyId,
        dateRange: `${startDate} até ${endDate}`,
        platforms,
      });

      const kpiCalculator = new KPICalculator();
      const transformer = new FinancialTransformer();

      // 1. EXTRACT: Extrair dados de cada plataforma
      logger.debug('Fase Extract: Buscando dados de plataformas', { propertyId });
      const allMovements: any[] = [];

      for (const platform of platforms) {
        try {
          const movements = await extractMovementsFromPlatform(
            propertyId,
            startDate,
            endDate,
            platform
          );
          allMovements.push(
            ...movements.map((m) => ({ ...m, _platform: platform }))
          );

          logger.debug(`Dados extraídos de ${platform}`, {
            propertyId,
            count: movements.length,
          });
        } catch (error) {
          logger.warn(`Erro ao extrair dados de ${platform}`, error as Error, {
            propertyId,
          });
        }
      }

      // 2. TRANSFORM: Normalizar dados para formato padrão
      logger.debug('Fase Transform: Normalizando dados', {
        propertyId,
        totalMovements: allMovements.length,
      });

      const normalizedMovements = allMovements
        .map((movement) => {
          try {
            return transformer.normalizeMovements([movement], movement._platform)[0];
          } catch (error) {
            logger.warn('Erro ao transformar movimento', error as Error);
            return null;
          }
        })
        .filter((m) => m && transformer.validateMovement(m));

      logger.info('Dados transformados com sucesso', {
        propertyId,
        original: allMovements.length,
        normalized: normalizedMovements.length,
      });

      // 3. LOAD: Persistir em Star Schema
      logger.debug('Fase Load: Persistindo dados no banco', { propertyId });

      for (const movement of normalizedMovements) {
        await persistFinancialMovement(movement);
      }

      // 4. CALCULATE: Calcular KPIs
      logger.debug('Fase Calculate: Calculando KPIs', { propertyId });

      // Buscar movimentações do período anterior para cálculo de tendência
      const previousMovements = await fetchMovementsFromDB(
        propertyId,
        new Date(new Date(startDate).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        startDate
      );

      const kpis = await kpiCalculator.calculateAllKPIs(
        normalizedMovements,
        previousMovements,
        propertyId
      );

      // 5. CACHE: Cachear KPIs para dashboard rápido
      logger.debug('Fase Cache: Cacheando KPIs', { propertyId });
      const cacheKey = `financial:kpis:${propertyId}:${endDate}`;
      await redis.setex(cacheKey, 86400, JSON.stringify(kpis)); // 24h TTL

      // 6. AGGREGATE: Atualizar tabelas agregadas
      logger.debug('Fase Aggregate: Atualizando agregações', { propertyId });
      await updateAggregatedKPIs(propertyId, startDate, endDate, kpis);

      const duration = Date.now() - startTime;
      logger.info('Sincronização de relatório financeiro concluída', {
        propertyId,
        duration_ms: duration,
        movementsProcessed: normalizedMovements.length,
        kpisCalculated: Object.keys(kpis).length,
      });

      return {
        status: 'completed',
        duration_ms: duration,
        movementsProcessed: normalizedMovements.length,
        kpisCalculated: Object.keys(kpis).length,
      };
    } catch (error) {
      logger.error('Erro na sincronização de relatório financeiro', error as Error, {
        propertyId,
      });
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    },
  }
);

/**
 * Extrai movimentações de uma plataforma específica
 */
async function extractMovementsFromPlatform(
  propertyId: string,
  startDate: string,
  endDate: string,
  platform: 'booking' | 'hospeda' | 'tripadvisor'
): Promise<any[]> {
  const query = `
    SELECT * FROM platform_listings
    WHERE property_id = $1 AND platform = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [propertyId, platform]);
  if (result.rows.length === 0) return [];

  // Aqui você faria a chamada real à API de cada plataforma
  // Por enquanto, retornando dados simulados
  return [];
}

/**
 * Busca movimentações do banco de dados
 */
async function fetchMovementsFromDB(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const query = `
    SELECT * FROM fact_financial_movements
    WHERE property_id = $1
    AND date_id BETWEEN $2::DATE AND $3::DATE
    ORDER BY date_id DESC
  `;

  const result = await pool.query(query, [propertyId, startDate, endDate]);
  return result.rows;
}

/**
 * Persiste uma movimentação financeira no banco
 */
async function persistFinancialMovement(movement: any): Promise<void> {
  const query = `
    INSERT INTO fact_financial_movements
    (property_id, account_id, date_id, movement_type, amount, description, reference_number, platform)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT DO NOTHING
  `;

  await pool.query(query, [
    movement.propertyId,
    movement.accountId,
    movement.movementDate.toISOString().split('T')[0],
    movement.movementType,
    movement.amount,
    movement.description,
    movement.reference,
    movement.platform,
  ]);
}

/**
 * Atualiza tabelas de agregação (KPIs diários/mensais)
 */
async function updateAggregatedKPIs(
  propertyId: string,
  startDate: string,
  endDate: string,
  kpis: any
): Promise<void> {
  const dateParts = endDate.split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]);

  const query = `
    INSERT INTO agg_daily_kpis
    (property_id, date_id, gross_revenue, net_revenue, operational_costs, ebitda,
     profit_margin_percentage, cash_flow, calculated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (property_id, date_id) DO UPDATE SET
    gross_revenue = EXCLUDED.gross_revenue,
    net_revenue = EXCLUDED.net_revenue,
    operational_costs = EXCLUDED.operational_costs,
    ebitda = EXCLUDED.ebitda,
    profit_margin_percentage = EXCLUDED.profit_margin_percentage,
    cash_flow = EXCLUDED.cash_flow,
    updated_at = NOW()
  `;

  await pool.query(query, [
    propertyId,
    endDate,
    kpis.grossRevenue?.value || 0,
    kpis.netRevenue?.value || 0,
    kpis.operationalCosts?.value || 0,
    kpis.ebitda?.value || 0,
    kpis.profitMargin?.value || 0,
    kpis.cashFlow?.value || 0,
  ]);

  // Atualizar agregação mensal
  const monthlyQuery = `
    INSERT INTO agg_monthly_kpis
    (property_id, year, month, gross_revenue, ebitda, profit_margin_percentage, calculated_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (property_id, year, month) DO UPDATE SET
    gross_revenue = EXCLUDED.gross_revenue,
    ebitda = EXCLUDED.ebitda,
    profit_margin_percentage = EXCLUDED.profit_margin_percentage
  `;

  await pool.query(monthlyQuery, [
    propertyId,
    year,
    month,
    kpis.grossRevenue?.value || 0,
    kpis.ebitda?.value || 0,
    kpis.profitMargin?.value || 0,
  ]);

  logger.info('Agregações atualizadas', {
    propertyId,
    year,
    month,
  });
}

worker.on('completed', (job) => {
  logger.info('Job de sincronização financeira concluído', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Job de sincronização financeira falhou', err, { jobId: job?.id });
});

export default worker;

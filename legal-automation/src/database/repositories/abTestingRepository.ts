import { query } from '../connection';
import { logger } from '@utils/logger';

export interface ABTestResult {
  id: string;
  task_type: string;
  model_a: string;
  model_b: string;
  quality_a: number | null;
  quality_b: number | null;
  cost_a: number | null;
  cost_b: number | null;
  winner: string | null;
  confidence: number | null;
  samples_a: number;
  samples_b: number;
  average_latency_a: number | null;
  average_latency_b: number | null;
  success_rate_a: number | null;
  success_rate_b: number | null;
  test_metadata: any;
  created_at: Date;
  updated_at: Date;
}

export class ABTestingRepository {
  async createResult(data: Omit<ABTestResult, 'id' | 'created_at' | 'updated_at'>): Promise<ABTestResult> {
    try {
      const result = await query(
        `INSERT INTO ab_testing_results (
          task_type, model_a, model_b, quality_a, quality_b, cost_a, cost_b,
          winner, confidence, samples_a, samples_b,
          average_latency_a, average_latency_b, success_rate_a, success_rate_b,
          test_metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          data.task_type,
          data.model_a,
          data.model_b,
          data.quality_a,
          data.quality_b,
          data.cost_a,
          data.cost_b,
          data.winner,
          data.confidence,
          data.samples_a,
          data.samples_b,
          data.average_latency_a,
          data.average_latency_b,
          data.success_rate_a,
          data.success_rate_b,
          JSON.stringify(data.test_metadata),
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar resultado de A/B test');
      throw error;
    }
  }

  async findById(id: string): Promise<ABTestResult | null> {
    try {
      const result = await query('SELECT * FROM ab_testing_results WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar A/B test ${id}`);
      throw error;
    }
  }

  async findByTaskType(
    taskType: string,
    limit: number = 10,
    offset: number = 0,
  ): Promise<{ data: ABTestResult[]; total: number }> {
    try {
      const resultData = await query(
        `SELECT * FROM ab_testing_results
         WHERE task_type = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [taskType, limit, offset],
      );

      const resultCount = await query('SELECT COUNT(*) as total FROM ab_testing_results WHERE task_type = $1', [
        taskType,
      ]);

      return {
        data: resultData.rows,
        total: parseInt(resultCount.rows[0].total),
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar A/B tests para tarefa ${taskType}`);
      throw error;
    }
  }

  async findLatestByTaskType(taskType: string): Promise<ABTestResult | null> {
    try {
      const result = await query(
        `SELECT * FROM ab_testing_results
         WHERE task_type = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [taskType],
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar último A/B test para ${taskType}`);
      throw error;
    }
  }

  async getResultsByDateRange(
    taskType: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ABTestResult[]> {
    try {
      const result = await query(
        `SELECT * FROM ab_testing_results
         WHERE task_type = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY created_at DESC`,
        [taskType, startDate, endDate],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar A/B tests por período`);
      throw error;
    }
  }

  async getWinRateByModel(model: string): Promise<{ wins: number; losses: number }> {
    try {
      const result = await query(
        `SELECT
          COUNT(*) FILTER (WHERE winner = $1) as wins,
          COUNT(*) FILTER (WHERE (model_a = $1 OR model_b = $1) AND winner != $1) as losses
         FROM ab_testing_results
         WHERE model_a = $1 OR model_b = $1`,
        [model],
      );

      return {
        wins: parseInt(result.rows[0].wins || 0),
        losses: parseInt(result.rows[0].losses || 0),
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao calcular win rate para modelo ${model}`);
      throw error;
    }
  }

  async getAverageMetricsByModel(model: string): Promise<any> {
    try {
      const result = await query(
        `SELECT
          AVG(CASE WHEN model_a = $1 THEN quality_a ELSE quality_b END) as avg_quality,
          AVG(CASE WHEN model_a = $1 THEN cost_a ELSE cost_b END) as avg_cost,
          AVG(CASE WHEN model_a = $1 THEN average_latency_a ELSE average_latency_b END) as avg_latency,
          AVG(CASE WHEN model_a = $1 THEN success_rate_a ELSE success_rate_b END) as avg_success_rate
         FROM ab_testing_results
         WHERE model_a = $1 OR model_b = $1`,
        [model],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter métricas médias para ${model}`);
      throw error;
    }
  }

  async getAllResults(
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: ABTestResult[]; total: number }> {
    try {
      const resultData = await query(
        'SELECT * FROM ab_testing_results ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      );

      const resultCount = await query('SELECT COUNT(*) as total FROM ab_testing_results');

      return {
        data: resultData.rows,
        total: parseInt(resultCount.rows[0].total),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar resultados de A/B tests');
      throw error;
    }
  }

  async getAnalyticsByTaskType(taskType: string): Promise<any> {
    try {
      const result = await query(
        `SELECT
          COUNT(*) as total_tests,
          COUNT(DISTINCT model_a || '|' || model_b) as unique_matchups,
          AVG(confidence) as avg_confidence,
          MAX(created_at) as latest_test,
          MIN(created_at) as first_test
         FROM ab_testing_results
         WHERE task_type = $1`,
        [taskType],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter analytics para ${taskType}`);
      throw error;
    }
  }
}

export const abTestingRepository = new ABTestingRepository();

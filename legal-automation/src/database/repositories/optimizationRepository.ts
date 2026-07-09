import { query } from '../connection';
import { logger } from '@utils/logger';

export interface OptimizationStrategy {
  id: string;
  task_type: string;
  recommended_model: string;
  confidence: number | null;
  estimated_savings: number | null;
  last_ab_test_id: string | null;
  strategy_metadata: any;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class OptimizationRepository {
  async createStrategy(data: Omit<OptimizationStrategy, 'id' | 'created_at' | 'updated_at'>): Promise<OptimizationStrategy> {
    try {
      const result = await query(
        `INSERT INTO optimization_strategies (
          task_type, recommended_model, confidence, estimated_savings, last_ab_test_id, strategy_metadata, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (task_type) DO UPDATE SET
          recommended_model = $2,
          confidence = $3,
          estimated_savings = $4,
          last_ab_test_id = $5,
          strategy_metadata = $6,
          updated_at = NOW()
        RETURNING *`,
        [
          data.task_type,
          data.recommended_model,
          data.confidence,
          data.estimated_savings,
          data.last_ab_test_id,
          JSON.stringify(data.strategy_metadata),
          data.active,
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao criar/atualizar estratégia de otimização');
      throw error;
    }
  }

  async findByTaskType(taskType: string): Promise<OptimizationStrategy | null> {
    try {
      const result = await query('SELECT * FROM optimization_strategies WHERE task_type = $1', [taskType]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar estratégia para ${taskType}`);
      throw error;
    }
  }

  async findById(id: string): Promise<OptimizationStrategy | null> {
    try {
      const result = await query('SELECT * FROM optimization_strategies WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar estratégia ${id}`);
      throw error;
    }
  }

  async updateStrategy(
    taskType: string,
    data: Partial<Omit<OptimizationStrategy, 'id' | 'created_at' | 'task_type'>>,
  ): Promise<OptimizationStrategy> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.recommended_model !== undefined) {
        updates.push(`recommended_model = $${paramCount}`);
        values.push(data.recommended_model);
        paramCount++;
      }

      if (data.confidence !== undefined) {
        updates.push(`confidence = $${paramCount}`);
        values.push(data.confidence);
        paramCount++;
      }

      if (data.estimated_savings !== undefined) {
        updates.push(`estimated_savings = $${paramCount}`);
        values.push(data.estimated_savings);
        paramCount++;
      }

      if (data.last_ab_test_id !== undefined) {
        updates.push(`last_ab_test_id = $${paramCount}`);
        values.push(data.last_ab_test_id);
        paramCount++;
      }

      if (data.strategy_metadata !== undefined) {
        updates.push(`strategy_metadata = $${paramCount}`);
        values.push(JSON.stringify(data.strategy_metadata));
        paramCount++;
      }

      if (data.active !== undefined) {
        updates.push(`active = $${paramCount}`);
        values.push(data.active);
        paramCount++;
      }

      updates.push(`updated_at = $${paramCount}`);
      values.push(new Date());
      paramCount++;

      values.push(taskType);

      const result = await query(
        `UPDATE optimization_strategies SET ${updates.join(', ')} WHERE task_type = $${paramCount} RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        throw new Error(`Estratégia não encontrada para ${taskType}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao atualizar estratégia para ${taskType}`);
      throw error;
    }
  }

  async getAllStrategies(
    limit: number = 50,
    offset: number = 0,
  ): Promise<{ data: OptimizationStrategy[]; total: number }> {
    try {
      const resultData = await query(
        'SELECT * FROM optimization_strategies ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      );

      const resultCount = await query('SELECT COUNT(*) as total FROM optimization_strategies');

      return {
        data: resultData.rows,
        total: parseInt(resultCount.rows[0].total),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar estratégias');
      throw error;
    }
  }

  async getActiveStrategies(): Promise<OptimizationStrategy[]> {
    try {
      const result = await query('SELECT * FROM optimization_strategies WHERE active = true ORDER BY created_at DESC');
      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar estratégias ativas');
      throw error;
    }
  }

  async getTotalSavings(): Promise<number> {
    try {
      const result = await query(
        'SELECT COALESCE(SUM(estimated_savings), 0) as total FROM optimization_strategies WHERE active = true',
      );
      return parseFloat(result.rows[0].total || 0);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao calcular economia total');
      throw error;
    }
  }

  async getModelFrequency(): Promise<Record<string, number>> {
    try {
      const result = await query(
        `SELECT recommended_model, COUNT(*) as count
         FROM optimization_strategies
         WHERE active = true
         GROUP BY recommended_model
         ORDER BY count DESC`,
      );

      const frequency: Record<string, number> = {};
      for (const row of result.rows) {
        frequency[row.recommended_model] = parseInt(row.count);
      }

      return frequency;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao calcular frequência de modelos');
      throw error;
    }
  }

  async deactivateStrategy(taskType: string): Promise<void> {
    try {
      await query(
        'UPDATE optimization_strategies SET active = false, updated_at = NOW() WHERE task_type = $1',
        [taskType],
      );
      logger.info(`Estratégia para ${taskType} desativada`);
    } catch (error) {
      logger.error({ err: error }, `Erro ao desativar estratégia para ${taskType}`);
      throw error;
    }
  }
}

export const optimizationRepository = new OptimizationRepository();

import { query } from '../connection';
import { logger } from '@utils/logger';

export interface SystemAnalytics {
  id: string;
  metric_name: string;
  metric_value: number | null;
  task_type: string | null;
  provider: string | null;
  period_start: Date | null;
  period_end: Date | null;
  analytics_data: any;
  created_at: Date;
}

export class AnalyticsRepository {
  async recordMetric(
    metricName: string,
    metricValue: number,
    taskType?: string,
    provider?: string,
    analyticsData?: any,
  ): Promise<SystemAnalytics> {
    try {
      const result = await query(
        `INSERT INTO system_analytics (
          metric_name, metric_value, task_type, provider, analytics_data
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [metricName, metricValue, taskType || null, provider || null, JSON.stringify(analyticsData || {})],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao registrar métrica ${metricName}`);
      throw error;
    }
  }

  async recordPeriodMetric(
    metricName: string,
    metricValue: number,
    periodStart: Date,
    periodEnd: Date,
    taskType?: string,
    provider?: string,
    analyticsData?: any,
  ): Promise<SystemAnalytics> {
    try {
      const result = await query(
        `INSERT INTO system_analytics (
          metric_name, metric_value, task_type, provider, period_start, period_end, analytics_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          metricName,
          metricValue,
          taskType || null,
          provider || null,
          periodStart,
          periodEnd,
          JSON.stringify(analyticsData || {}),
        ],
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, `Erro ao registrar métrica de período ${metricName}`);
      throw error;
    }
  }

  async getMetricsByName(metricName: string, limit: number = 100): Promise<SystemAnalytics[]> {
    try {
      const result = await query(
        `SELECT * FROM system_analytics
         WHERE metric_name = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [metricName, limit],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar métricas ${metricName}`);
      throw error;
    }
  }

  async getMetricsByDateRange(
    metricName: string,
    startDate: Date,
    endDate: Date,
  ): Promise<SystemAnalytics[]> {
    try {
      const result = await query(
        `SELECT * FROM system_analytics
         WHERE metric_name = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY created_at DESC`,
        [metricName, startDate, endDate],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar métricas por período`);
      throw error;
    }
  }

  async getMetricsByTaskType(taskType: string, limit: number = 100): Promise<SystemAnalytics[]> {
    try {
      const result = await query(
        `SELECT * FROM system_analytics
         WHERE task_type = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [taskType, limit],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar métricas para tarefa ${taskType}`);
      throw error;
    }
  }

  async getMetricsByProvider(provider: string, limit: number = 100): Promise<SystemAnalytics[]> {
    try {
      const result = await query(
        `SELECT * FROM system_analytics
         WHERE provider = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [provider, limit],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, `Erro ao buscar métricas para provider ${provider}`);
      throw error;
    }
  }

  async getAverageMetric(metricName: string, hoursBack: number = 24): Promise<number | null> {
    try {
      const result = await query(
        `SELECT AVG(metric_value) as avg_value
         FROM system_analytics
         WHERE metric_name = $1 AND created_at > NOW() - INTERVAL '1 hour' * $2`,
        [metricName, hoursBack],
      );

      return result.rows[0].avg_value || null;
    } catch (error) {
      logger.error({ err: error }, `Erro ao calcular média de ${metricName}`);
      throw error;
    }
  }

  async getCostAnalytics(hoursBack: number = 24): Promise<any> {
    try {
      const result = await query(
        `SELECT
          provider,
          COUNT(*) as request_count,
          AVG(metric_value) as avg_cost,
          SUM(metric_value) as total_cost,
          MIN(metric_value) as min_cost,
          MAX(metric_value) as max_cost
         FROM system_analytics
         WHERE metric_name LIKE 'cost_%' AND created_at > NOW() - INTERVAL '1 hour' * $1
         GROUP BY provider
         ORDER BY total_cost DESC`,
        [hoursBack],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter análise de custos');
      throw error;
    }
  }

  async getPerformanceAnalytics(hoursBack: number = 24): Promise<any> {
    try {
      const result = await query(
        `SELECT
          task_type,
          COUNT(*) as request_count,
          AVG(CASE WHEN metric_name LIKE 'latency_%' THEN metric_value END) as avg_latency,
          MIN(CASE WHEN metric_name LIKE 'latency_%' THEN metric_value END) as min_latency,
          MAX(CASE WHEN metric_name LIKE 'latency_%' THEN metric_value END) as max_latency,
          AVG(CASE WHEN metric_name LIKE 'success_%' THEN metric_value END) as success_rate
         FROM system_analytics
         WHERE created_at > NOW() - INTERVAL '1 hour' * $1
         GROUP BY task_type
         ORDER BY avg_latency DESC`,
        [hoursBack],
      );

      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter análise de performance');
      throw error;
    }
  }

  async getAllMetrics(limit: number = 50, offset: number = 0): Promise<{ data: SystemAnalytics[]; total: number }> {
    try {
      const resultData = await query(
        'SELECT * FROM system_analytics ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      );

      const resultCount = await query('SELECT COUNT(*) as total FROM system_analytics');

      return {
        data: resultData.rows,
        total: parseInt(resultCount.rows[0].total),
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao listar todas as métricas');
      throw error;
    }
  }

  async cleanupOldMetrics(daysOld: number = 30): Promise<number> {
    try {
      const result = await query(
        `DELETE FROM system_analytics
         WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
        [daysOld],
      );

      logger.info(`Limpeza concluída: ${result.rowCount} registros antigos removidos`);
      return result.rowCount || 0;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao limpar métricas antigas');
      throw error;
    }
  }

  async getSystemSummary(): Promise<any> {
    try {
      const result = await query(
        `SELECT
          COUNT(DISTINCT metric_name) as unique_metrics,
          COUNT(*) as total_records,
          MAX(created_at) as latest_metric,
          COUNT(DISTINCT provider) as unique_providers,
          COUNT(DISTINCT task_type) as unique_tasks
         FROM system_analytics`,
      );

      return result.rows[0];
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter resumo do sistema');
      throw error;
    }
  }
}

export const analyticsRepository = new AnalyticsRepository();

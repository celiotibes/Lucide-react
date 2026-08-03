import { logger } from '@utils/logger';
import { rateLimitingRepository } from '@database/repositories';
import { abTestingRepository } from '@database/repositories';
import { optimizationRepository } from '@database/repositories';
import { analyticsRepository } from '@database/repositories';

// ============================================================================
// PERSISTENCE SERVICE - Phase 5.6
// ============================================================================
export class PersistenceService {
  /**
   * Persist rate limiting quotas to database
   */
  async persistRateLimitQuota(
    userId: string,
    tier: string,
    dailyConsumed: number,
    hourlyConsumed: number,
    minutelyConsumed: number,
  ): Promise<void> {
    try {
      const existing = await rateLimitingRepository.findByUserId(userId);

      if (!existing) {
        await rateLimitingRepository.findOrCreateQuota(userId);
      } else {
        await rateLimitingRepository.updateConsumed(userId, dailyConsumed, hourlyConsumed, minutelyConsumed);
      }
    } catch (error) {
      logger.error({ err: error }, `Erro ao persistir quota para usuário ${userId}`);
      throw error;
    }
  }

  /**
   * Load rate limiting quota from database
   */
  async loadRateLimitQuota(userId: string): Promise<any> {
    try {
      const quota = await rateLimitingRepository.findOrCreateQuota(userId);
      return {
        tier: quota.tier,
        dailyLimit: quota.daily_limit,
        hourlyLimit: quota.hourly_limit,
        minutelyLimit: quota.minutely_limit,
        dailyConsumed: quota.daily_consumed,
        hourlyConsumed: quota.hourly_consumed,
        minutelyConsumed: quota.minutely_consumed,
        active: quota.active,
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao carregar quota do usuário ${userId}`);
      throw error;
    }
  }

  /**
   * Persist A/B test result to database
   */
  async persistABTestResult(testResult: any): Promise<string> {
    try {
      const result = await abTestingRepository.createResult({
        task_type: testResult.taskType,
        model_a: testResult.modelA,
        model_b: testResult.modelB,
        quality_a: testResult.qualityA,
        quality_b: testResult.qualityB,
        cost_a: testResult.costA,
        cost_b: testResult.costB,
        winner: testResult.winner,
        confidence: testResult.confidence,
        samples_a: testResult.samplesA || 0,
        samples_b: testResult.samplesB || 0,
        average_latency_a: testResult.averageLatencyA,
        average_latency_b: testResult.averageLatencyB,
        success_rate_a: testResult.successRateA,
        success_rate_b: testResult.successRateB,
        test_metadata: testResult.metadata || {},
      });

      logger.info(`A/B test ${result.id} persistido para tarefa ${testResult.taskType}`);
      return result.id;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao persistir resultado de A/B test');
      throw error;
    }
  }

  /**
   * Load A/B test results from database for a task type
   */
  async loadABTestResults(taskType: string, limit: number = 10): Promise<any[]> {
    try {
      const { data } = await abTestingRepository.findByTaskType(taskType, limit);

      return data.map((result: any) => ({
        id: result.id,
        taskType: result.task_type,
        modelA: result.model_a,
        modelB: result.model_b,
        qualityA: result.quality_a,
        qualityB: result.quality_b,
        costA: result.cost_a,
        costB: result.cost_b,
        winner: result.winner,
        confidence: result.confidence,
        samplesA: result.samples_a,
        samplesB: result.samples_b,
        averageLatencyA: result.average_latency_a,
        averageLatencyB: result.average_latency_b,
        successRateA: result.success_rate_a,
        successRateB: result.success_rate_b,
        metadata: result.test_metadata,
        createdAt: result.created_at,
      }));
    } catch (error) {
      logger.error({ err: error }, `Erro ao carregar A/B tests para ${taskType}`);
      throw error;
    }
  }

  /**
   * Persist optimization strategy to database
   */
  async persistOptimizationStrategy(strategy: any): Promise<string> {
    try {
      const result = await optimizationRepository.createStrategy({
        task_type: strategy.taskType,
        recommended_model: strategy.recommendedModel,
        confidence: strategy.confidence,
        estimated_savings: strategy.estimatedSavings,
        last_ab_test_id: strategy.lastABTestId,
        strategy_metadata: strategy.metadata || {},
        active: true,
      });

      logger.info(`Estratégia de otimização ${result.id} persistida para ${strategy.taskType}`);
      return result.id;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao persistir estratégia de otimização');
      throw error;
    }
  }

  /**
   * Load optimization strategy from database
   */
  async loadOptimizationStrategy(taskType: string): Promise<any | null> {
    try {
      const strategy = await optimizationRepository.findByTaskType(taskType);

      if (!strategy) {
        return null;
      }

      return {
        id: strategy.id,
        taskType: strategy.task_type,
        recommendedModel: strategy.recommended_model,
        confidence: strategy.confidence,
        estimatedSavings: strategy.estimated_savings,
        lastABTestId: strategy.last_ab_test_id,
        metadata: strategy.strategy_metadata,
        active: strategy.active,
        createdAt: strategy.created_at,
        updatedAt: strategy.updated_at,
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao carregar estratégia para ${taskType}`);
      throw error;
    }
  }

  /**
   * Record system analytics metric
   */
  async recordAnalytic(
    metricName: string,
    metricValue: number,
    taskType?: string,
    provider?: string,
    analyticsData?: any,
  ): Promise<void> {
    try {
      await analyticsRepository.recordMetric(metricName, metricValue, taskType, provider, analyticsData);
    } catch (error) {
      logger.error({ err: error }, `Erro ao registrar métrica ${metricName}`);
      throw error;
    }
  }

  /**
   * Get cost analytics
   */
  async getCostAnalytics(hoursBack: number = 24): Promise<any> {
    try {
      return await analyticsRepository.getCostAnalytics(hoursBack);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter análise de custos');
      throw error;
    }
  }

  /**
   * Get performance analytics
   */
  async getPerformanceAnalytics(hoursBack: number = 24): Promise<any> {
    try {
      return await analyticsRepository.getPerformanceAnalytics(hoursBack);
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter análise de performance');
      throw error;
    }
  }

  /**
   * Get system summary
   */
  async getSystemSummary(): Promise<any> {
    try {
      return await analyticsRepository.getSystemSummary();
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter resumo do sistema');
      throw error;
    }
  }

  /**
   * Clean old analytics data
   */
  async cleanupOldAnalytics(daysOld: number = 30): Promise<number> {
    try {
      const removed = await analyticsRepository.cleanupOldMetrics(daysOld);
      logger.info(`${removed} registros antigos de analytics removidos`);
      return removed;
    } catch (error) {
      logger.error({ err: error }, 'Erro ao limpar dados antigos');
      throw error;
    }
  }

  /**
   * Get quota statistics
   */
  async getQuotaStatistics(): Promise<any> {
    try {
      return await rateLimitingRepository.getStatisticsLastHour();
    } catch (error) {
      logger.error({ err: error }, 'Erro ao obter estatísticas de quota');
      throw error;
    }
  }

  /**
   * Get A/B testing analytics
   */
  async getABTestingAnalytics(taskType: string): Promise<any> {
    try {
      return await abTestingRepository.getAnalyticsByTaskType(taskType);
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter analytics de A/B testing para ${taskType}`);
      throw error;
    }
  }

  /**
   * Get model performance from historical data
   */
  async getModelPerformance(model: string): Promise<any> {
    try {
      const winRate = await abTestingRepository.getWinRateByModel(model);
      const metrics = await abTestingRepository.getAverageMetricsByModel(model);

      return {
        model,
        wins: winRate.wins,
        losses: winRate.losses,
        winRate: winRate.wins + winRate.losses > 0
          ? winRate.wins / (winRate.wins + winRate.losses)
          : 0,
        averageQuality: metrics.avg_quality,
        averageCost: metrics.avg_cost,
        averageLatency: metrics.avg_latency,
        averageSuccessRate: metrics.avg_success_rate,
      };
    } catch (error) {
      logger.error({ err: error }, `Erro ao obter performance do modelo ${model}`);
      throw error;
    }
  }

  /**
   * Sync in-memory data to database
   */
  async syncAllData(
    rateLimitingService: any,
    abTestingService: any,
    autoOptimizationService: any,
  ): Promise<{ synced: number; failed: number }> {
    let synced = 0;
    let failed = 0;

    try {
      logger.info('Iniciando sincronização completa de dados');

      // Sync rate limiting quotas
      const quotas = await rateLimitingRepository.getAllQuotas(1000);
      synced += quotas.data.length;

      // Sync A/B test results
      const abTests = await abTestingRepository.getAllResults(1000);
      synced += abTests.data.length;

      // Sync optimization strategies
      const strategies = await optimizationRepository.getAllStrategies(1000);
      synced += strategies.data.length;

      logger.info(`Sincronização concluída: ${synced} registros sincronizados`);
      return { synced, failed };
    } catch (error) {
      logger.error({ err: error }, 'Erro durante sincronização completa');
      failed++;
      return { synced, failed };
    }
  }
}

export const persistenceService = new PersistenceService();

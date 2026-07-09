import { PersistenceService } from '../PersistenceService';
import * as rateLimitingRepo from '@database/repositories/rateLimitingRepository';
import * as abTestingRepo from '@database/repositories/abTestingRepository';
import * as optimizationRepo from '@database/repositories/optimizationRepository';
import * as analyticsRepo from '@database/repositories/analyticsRepository';

describe('PersistenceService', () => {
  let service: PersistenceService;

  beforeEach(() => {
    service = new PersistenceService();

    // Mock repository methods
    jest.spyOn(rateLimitingRepo.rateLimitingRepository, 'findByUserId').mockResolvedValue(null as any);
    jest.spyOn(rateLimitingRepo.rateLimitingRepository, 'findOrCreateQuota').mockResolvedValue({
      id: 'quota-1',
      user_id: 'user-1',
      tier: 'free',
      daily_limit: 100,
      hourly_limit: 20,
      minutely_limit: 5,
      daily_consumed: 0,
      hourly_consumed: 0,
      minutely_consumed: 0,
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
      last_reset_daily: new Date(),
      last_reset_hourly: new Date(),
      last_reset_minutely: new Date(),
    } as any);

    jest.spyOn(abTestingRepo.abTestingRepository, 'createResult').mockResolvedValue({
      id: 'test-1',
      task_type: 'analyze',
      model_a: 'claude',
      model_b: 'gemini',
      quality_a: 8.5,
      quality_b: 7.5,
      cost_a: 0.05,
      cost_b: 0.03,
      winner: 'claude',
      confidence: 0.85,
      samples_a: 10,
      samples_b: 10,
      average_latency_a: 1500,
      average_latency_b: 1200,
      success_rate_a: 0.95,
      success_rate_b: 0.92,
      test_metadata: {},
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    jest.spyOn(abTestingRepo.abTestingRepository, 'findByTaskType').mockResolvedValue({
      data: [],
      total: 0,
    });

    jest.spyOn(optimizationRepo.optimizationRepository, 'createStrategy').mockResolvedValue({
      id: 'strategy-1',
      task_type: 'analyze',
      recommended_model: 'claude',
      confidence: 0.85,
      estimated_savings: 45.0,
      last_ab_test_id: 'test-1',
      strategy_metadata: {},
      active: true,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    jest.spyOn(optimizationRepo.optimizationRepository, 'findByTaskType').mockResolvedValue(null as any);

    jest.spyOn(analyticsRepo.analyticsRepository, 'recordMetric').mockResolvedValue(undefined);
    jest.spyOn(analyticsRepo.analyticsRepository, 'getCostAnalytics').mockResolvedValue([]);
    jest.spyOn(analyticsRepo.analyticsRepository, 'getPerformanceAnalytics').mockResolvedValue([]);
    jest.spyOn(analyticsRepo.analyticsRepository, 'getSystemSummary').mockResolvedValue({
      unique_metrics: 5,
      total_records: 100,
      unique_providers: 3,
      unique_tasks: 4,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rate Limiting Persistence', () => {
    it('should persist rate limit quota', async () => {
      await service.persistRateLimitQuota('user-1', 'free', 50, 10, 2);
      expect(rateLimitingRepo.rateLimitingRepository.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('should load rate limit quota', async () => {
      const quota = await service.loadRateLimitQuota('user-1');
      expect(quota).toHaveProperty('tier');
      expect(quota).toHaveProperty('dailyLimit');
    });

    it('should get quota statistics', async () => {
      jest.spyOn(rateLimitingRepo.rateLimitingRepository, 'getStatisticsLastHour').mockResolvedValue({
        active_users: 10,
        avg_daily_usage: 0.35,
      } as any);

      const stats = await service.getQuotaStatistics();
      expect(stats).toHaveProperty('active_users');
    });
  });

  describe('A/B Testing Persistence', () => {
    it('should persist A/B test result', async () => {
      const testResult = {
        taskType: 'analyze',
        modelA: 'claude',
        modelB: 'gemini',
        qualityA: 8.5,
        qualityB: 7.5,
        costA: 0.05,
        costB: 0.03,
        winner: 'claude',
        confidence: 0.85,
        samplesA: 10,
        samplesB: 10,
        averageLatencyA: 1500,
        averageLatencyB: 1200,
        successRateA: 0.95,
        successRateB: 0.92,
        metadata: {},
      };

      const id = await service.persistABTestResult(testResult);
      expect(id).toBe('test-1');
      expect(abTestingRepo.abTestingRepository.createResult).toHaveBeenCalled();
    });

    it('should load A/B test results', async () => {
      jest.spyOn(abTestingRepo.abTestingRepository, 'findByTaskType').mockResolvedValue({
        data: [
          {
            id: 'test-1',
            task_type: 'analyze',
            model_a: 'claude',
            model_b: 'gemini',
            quality_a: 8.5,
            quality_b: 7.5,
            winner: 'claude',
            created_at: new Date(),
          } as any,
        ],
        total: 1,
      });

      const results = await service.loadABTestResults('analyze', 10);
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('taskType', 'analyze');
    });

    it('should get A/B testing analytics', async () => {
      jest.spyOn(abTestingRepo.abTestingRepository, 'getAnalyticsByTaskType').mockResolvedValue({
        total_tests: 10,
        unique_matchups: 3,
        avg_confidence: 0.82,
      } as any);

      const analytics = await service.getABTestingAnalytics('analyze');
      expect(analytics).toHaveProperty('total_tests');
    });
  });

  describe('Optimization Strategy Persistence', () => {
    it('should persist optimization strategy', async () => {
      const strategy = {
        taskType: 'analyze',
        recommendedModel: 'claude',
        confidence: 0.85,
        estimatedSavings: 45.0,
        lastABTestId: 'test-1',
        metadata: {},
      };

      const id = await service.persistOptimizationStrategy(strategy);
      expect(id).toBe('strategy-1');
      expect(optimizationRepo.optimizationRepository.createStrategy).toHaveBeenCalled();
    });

    it('should load optimization strategy', async () => {
      jest.spyOn(optimizationRepo.optimizationRepository, 'findByTaskType').mockResolvedValue({
        id: 'strategy-1',
        task_type: 'analyze',
        recommended_model: 'claude',
        confidence: 0.85,
        estimated_savings: 45.0,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      const strategy = await service.loadOptimizationStrategy('analyze');
      expect(strategy).toHaveProperty('taskType', 'analyze');
      expect(strategy?.recommendedModel).toBe('claude');
    });

    it('should return null if strategy not found', async () => {
      jest.spyOn(optimizationRepo.optimizationRepository, 'findByTaskType').mockResolvedValue(null as any);

      const strategy = await service.loadOptimizationStrategy('unknown');
      expect(strategy).toBeNull();
    });
  });

  describe('Analytics', () => {
    it('should record analytic', async () => {
      await service.recordAnalytic('cost_analysis', 42.5, 'analyze', 'claude');
      expect(analyticsRepo.analyticsRepository.recordMetric).toHaveBeenCalledWith(
        'cost_analysis',
        42.5,
        'analyze',
        'claude',
        undefined,
      );
    });

    it('should get cost analytics', async () => {
      jest.spyOn(analyticsRepo.analyticsRepository, 'getCostAnalytics').mockResolvedValue([
        {
          provider: 'claude',
          request_count: 100,
          total_cost: 5.5,
        },
      ] as any);

      const analytics = await service.getCostAnalytics(24);
      expect(analytics).toHaveLength(1);
      expect(analytics[0].provider).toBe('claude');
    });

    it('should get performance analytics', async () => {
      jest.spyOn(analyticsRepo.analyticsRepository, 'getPerformanceAnalytics').mockResolvedValue([
        {
          task_type: 'analyze',
          request_count: 50,
          avg_latency: 1500,
        },
      ] as any);

      const analytics = await service.getPerformanceAnalytics(24);
      expect(analytics).toHaveLength(1);
      expect(analytics[0].task_type).toBe('analyze');
    });

    it('should get system summary', async () => {
      const summary = await service.getSystemSummary();
      expect(summary).toHaveProperty('unique_metrics', 5);
      expect(summary).toHaveProperty('total_records', 100);
    });

    it('should cleanup old analytics', async () => {
      jest.spyOn(analyticsRepo.analyticsRepository, 'cleanupOldMetrics').mockResolvedValue(50);

      const removed = await service.cleanupOldAnalytics(30);
      expect(removed).toBe(50);
    });
  });

  describe('Model Performance', () => {
    it('should get model performance from historical data', async () => {
      jest.spyOn(abTestingRepo.abTestingRepository, 'getWinRateByModel').mockResolvedValue({
        wins: 8,
        losses: 2,
      });

      jest.spyOn(abTestingRepo.abTestingRepository, 'getAverageMetricsByModel').mockResolvedValue({
        avg_quality: 8.3,
        avg_cost: 0.048,
        avg_latency: 1450,
        avg_success_rate: 0.94,
      } as any);

      const performance = await service.getModelPerformance('claude');
      expect(performance.model).toBe('claude');
      expect(performance.wins).toBe(8);
      expect(performance.losses).toBe(2);
      expect(performance.winRate).toBeCloseTo(0.8, 2);
      expect(performance.averageQuality).toBe(8.3);
    });

    it('should handle zero win rate', async () => {
      jest.spyOn(abTestingRepo.abTestingRepository, 'getWinRateByModel').mockResolvedValue({
        wins: 0,
        losses: 0,
      });

      jest.spyOn(abTestingRepo.abTestingRepository, 'getAverageMetricsByModel').mockResolvedValue({
        avg_quality: 0,
        avg_cost: 0,
        avg_latency: 0,
        avg_success_rate: 0,
      } as any);

      const performance = await service.getModelPerformance('unknown');
      expect(performance.winRate).toBe(0);
    });
  });

  describe('Data Sync', () => {
    it('should sync all data', async () => {
      jest.spyOn(rateLimitingRepo.rateLimitingRepository, 'getAllQuotas').mockResolvedValue({
        data: Array(5).fill({}),
        total: 5,
      } as any);

      jest.spyOn(abTestingRepo.abTestingRepository, 'getAllResults').mockResolvedValue({
        data: Array(8).fill({}),
        total: 8,
      } as any);

      jest.spyOn(optimizationRepo.optimizationRepository, 'getAllStrategies').mockResolvedValue({
        data: Array(3).fill({}),
        total: 3,
      } as any);

      const result = await service.syncAllData({}, {}, {});
      expect(result.synced).toBe(16); // 5 + 8 + 3
      expect(result.failed).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limiting persistence errors gracefully', async () => {
      jest.spyOn(rateLimitingRepo.rateLimitingRepository, 'findByUserId').mockRejectedValue(new Error('DB error'));

      await expect(service.persistRateLimitQuota('user-1', 'free', 50, 10, 2)).rejects.toThrow('DB error');
    });

    it('should handle A/B test persistence errors', async () => {
      jest.spyOn(abTestingRepo.abTestingRepository, 'createResult').mockRejectedValue(new Error('DB error'));

      const testResult = {
        taskType: 'analyze',
        modelA: 'claude',
        modelB: 'gemini',
        qualityA: 8.5,
        qualityB: 7.5,
      };

      await expect(service.persistABTestResult(testResult)).rejects.toThrow('DB error');
    });
  });
});

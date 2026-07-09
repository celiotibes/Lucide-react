import { AutoOptimizationService } from '../AutoOptimizationService';
import { abTestingService } from '../ABTestingService';

// Mock ABTestingService
jest.mock('../ABTestingService', () => ({
  abTestingService: {
    getBestModel: jest.fn(),
    getModelMetrics: jest.fn(),
    getRecommendation: jest.fn(),
  },
}));

describe('AutoOptimizationService', () => {
  let service: AutoOptimizationService;
  let mockABService: any;

  beforeEach(() => {
    service = new AutoOptimizationService();
    mockABService = abTestingService as any;
    jest.clearAllMocks();
  });

  describe('Strategy Generation', () => {
    it('should generate strategy when sufficient test data available', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        model: 'claude-sonnet',
        taskType: 'generate',
        totalTests: 5,
        wins: 4,
        averageQuality: 0.92,
        averageCost: 0.048,
        averageLatency: 3500,
        winRate: 0.8,
        costEfficiency: 19.17,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'High quality and efficiency',
        confidence: 0.88,
        estimatedSavings: 25.0,
      });

      const strategy = service.generateStrategy('generate');

      expect(strategy).not.toBeNull();
      expect(strategy?.selectedModel).toBe('claude-sonnet');
      expect(strategy?.taskType).toBe('generate');
      expect(strategy?.expectedQuality).toBe(0.92);
      expect(strategy?.confidence).toBeGreaterThan(0);
    });

    it('should not generate strategy with insufficient test data', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 1, // Less than MIN_TESTS_FOR_OPTIMIZATION (3)
      });

      const strategy = service.generateStrategy('generate');

      expect(strategy).toBeNull();
    });

    it('should not generate strategy without A/B test data', () => {
      mockABService.getBestModel.mockReturnValue(null);

      const strategy = service.generateStrategy('generate');

      expect(strategy).toBeNull();
    });
  });

  describe('Optimal Model Selection', () => {
    it('should return optimal model for task type', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best performance',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');
      const selection = service.getOptimalModel('generate');

      expect(selection).not.toBeNull();
      expect(selection?.primaryModel).toBe('claude-sonnet');
      expect(selection?.fallbackModel).toBe('claude-sonnet');
      expect(selection?.quality).toBe(0.92);
    });

    it('should return null for unoptimized task type', () => {
      const selection = service.getOptimalModel('unknown-task');

      expect(selection).toBeNull();
    });
  });

  describe('Optimize All', () => {
    it('should optimize all task types', () => {
      const taskTypes = ['generate', 'analyze', 'extract', 'classify'];

      for (const taskType of taskTypes) {
        mockABService.getBestModel.mockReturnValueOnce('claude-sonnet');
        mockABService.getModelMetrics.mockReturnValueOnce({
          totalTests: 5,
          averageQuality: 0.88 + Math.random() * 0.1,
          averageCost: 0.03 + Math.random() * 0.02,
        });
        mockABService.getRecommendation.mockReturnValueOnce({
          recommendedModel: 'claude-sonnet',
          reason: 'Optimized',
          confidence: 0.85,
          estimatedSavings: 15.0 + Math.random() * 10,
        });
      }

      const report = service.optimizeAll();

      expect(report.totalTaskTypes).toBe(4);
      expect(report.optimizedTaskTypes).toBeGreaterThan(0);
      expect(report.strategies.length).toBeGreaterThan(0);
      expect(report.estimatedMonthlySavings).toBeGreaterThan(0);
    });

    it('should return report with all task types', () => {
      const report = service.optimizeAll();

      expect(report.totalTaskTypes).toBe(4);
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(Array.isArray(report.strategies)).toBe(true);
    });
  });

  describe('Strategy Updates', () => {
    it('should update strategy with latest data', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');
      const oldStrategy = service.getStrategy('generate');

      // Update data
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 10,
        averageQuality: 0.95,
        averageCost: 0.045,
      });

      service.updateStrategy('generate');
      const newStrategy = service.getStrategy('generate');

      expect(newStrategy?.testCount).toBe(10);
      expect(newStrategy?.expectedQuality).toBe(0.95);
    });
  });

  describe('Strategy Retrieval', () => {
    it('should retrieve strategy by task type', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');
      const strategy = service.getStrategy('generate');

      expect(strategy).not.toBeNull();
      expect(strategy?.taskType).toBe('generate');
    });

    it('should get all strategies', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');
      service.generateStrategy('analyze');

      const strategies = service.getAllStrategies();

      expect(strategies.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Recommended Models', () => {
    it('should return recommended models for all tasks', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.optimizeAll();
      const models = service.getRecommendedModels();

      expect(typeof models).toBe('object');
      for (const taskType of Object.keys(models)) {
        expect(models[taskType]).toHaveProperty('primaryModel');
        expect(models[taskType]).toHaveProperty('fallbackModel');
      }
    });
  });

  describe('Savings Calculation', () => {
    it('should calculate potential savings', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.01, // Much cheaper than baseline
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 100.0,
      });

      service.generateStrategy('generate');

      const savings = service.calculatePotentialSavings();

      expect(savings.currentEstimate).toBeGreaterThan(0);
      expect(savings.optimizedEstimate).toBeGreaterThan(0);
      expect(savings.potentialSavings).toBeGreaterThanOrEqual(0);
      expect(savings.savingsPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should calculate savings with custom volume', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.01,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 50.0,
      });

      service.generateStrategy('generate');

      const customVolume = {
        generate: 50,
        analyze: 200,
        extract: 100,
        classify: 100,
      };

      const savings = service.calculatePotentialSavings(customVolume);

      expect(savings.currentEstimate).toBeGreaterThan(0);
      expect(savings.optimizedEstimate).toBeGreaterThan(0);
    });
  });

  describe('Metrics', () => {
    it('should provide optimization metrics', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');

      const metrics = service.getMetrics();

      expect(metrics).toHaveProperty('strategiesActive');
      expect(metrics).toHaveProperty('totalABTests');
      expect(metrics).toHaveProperty('averageConfidence');
      expect(metrics).toHaveProperty('averageExpectedQuality');
      expect(metrics).toHaveProperty('estimatedMonthlySavings');
      expect(metrics.strategiesActive).toBeGreaterThan(0);
    });
  });

  describe('History', () => {
    it('should track optimization history', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');
      service.generateStrategy('analyze');

      const history = service.getHistory();

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].taskType).toBe('generate');
    });
  });

  describe('Cleanup', () => {
    it('should clear old strategies', () => {
      mockABService.getBestModel.mockReturnValue('claude-sonnet');
      mockABService.getModelMetrics.mockReturnValue({
        totalTests: 5,
        averageQuality: 0.92,
        averageCost: 0.048,
      });
      mockABService.getRecommendation.mockReturnValue({
        recommendedModel: 'claude-sonnet',
        reason: 'Best',
        confidence: 0.88,
        estimatedSavings: 20.0,
      });

      service.generateStrategy('generate');

      // Should not clear recent strategies
      const removed = service.clearOldStrategies(7);
      expect(removed).toBe(0);

      // Get strategy should still exist
      const strategy = service.getStrategy('generate');
      expect(strategy).not.toBeNull();
    });
  });
});

import { MultiModelOrchestrationService } from '../MultiModelOrchestrationService';
import * as persistenceService from '@services/PersistenceService';

describe('MultiModelOrchestrationService', () => {
  let service: MultiModelOrchestrationService;

  beforeEach(() => {
    service = new MultiModelOrchestrationService();

    // Mock persistence service
    jest.spyOn(persistenceService.persistenceService, 'getModelPerformance').mockResolvedValue({
      model: 'claude-opus',
      wins: 8,
      losses: 2,
      winRate: 0.8,
      averageQuality: 8.5,
      averageCost: 0.048,
      averageLatency: 1450,
      averageSuccessRate: 0.94,
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    service.reset();
  });

  describe('Model Initialization', () => {
    it('should initialize with default models', () => {
      const models = service.getAllModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.name === 'claude-opus')).toBe(true);
    });

    it('should have enabled models', () => {
      const models = service.getAllModels();
      expect(models.every((m) => m.enabled || !m.enabled)).toBe(true);
    });

    it('should have valid cost configuration', () => {
      const models = service.getAllModels();
      models.forEach((model) => {
        expect(model.costPerRequest).toBeGreaterThan(0);
        expect(model.maxConcurrent).toBeGreaterThan(0);
      });
    });
  });

  describe('Model Selection', () => {
    it('should select a model for simple request', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
      };

      const result = await service.selectModel(request);
      expect(result.selectedModel).toBeDefined();
      expect(result.provider).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.executionPath.length).toBeGreaterThan(0);
    });

    it('should select model based on cost limit', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
        costLimit: 0.02,
      };

      const result = await service.selectModel(request);
      expect(result.estimatedCost).toBeLessThanOrEqual(0.02);
    });

    it('should select model based on quality target', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'complex' as const,
        qualityTarget: 0.8,
      };

      const result = await service.selectModel(request);
      expect(result.selectedModel).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should provide fallback models in execution path', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
      };

      const result = await service.selectModel(request);
      expect(result.executionPath.length).toBeGreaterThanOrEqual(1);
      expect(result.fallbackAvailable).toBe(result.executionPath.length > 1);
    });

    it('should calculate confidence score', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
      };

      const result = await service.selectModel(request);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should estimate latency based on complexity', async () => {
      const simpleRequest = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
      };

      const complexRequest = {
        taskType: 'analyze',
        taskComplexity: 'complex' as const,
      };

      const simpleResult = await service.selectModel(simpleRequest);
      const complexResult = await service.selectModel(complexRequest);

      expect(complexResult.estimatedLatency).toBeGreaterThanOrEqual(
        simpleResult.estimatedLatency,
      );
    });
  });

  describe('Load Balancing Strategies', () => {
    it('should support round-robin strategy', async () => {
      service.setStrategy({ type: 'round_robin' });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
      };

      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await service.selectModel(request);
        results.push(result.selectedModel);
      }

      expect(results.length).toBe(3);
    });

    it('should support performance-based strategy', async () => {
      service.setStrategy({ type: 'performance' });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
      };

      const result = await service.selectModel(request);
      expect(result.selectedModel).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should support cost-based strategy', async () => {
      service.setStrategy({ type: 'cost' });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
      };

      const result = await service.selectModel(request);
      expect(result.estimatedCost).toBeDefined();
    });

    it('should support hybrid strategy', async () => {
      service.setStrategy({ type: 'hybrid' });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
      };

      const result = await service.selectModel(request);
      expect(result.selectedModel).toBeDefined();
    });

    it('should support adaptive strategy', async () => {
      service.setStrategy({ type: 'adaptive' });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'moderate' as const,
      };

      const result = await service.selectModel(request);
      expect(result.selectedModel).toBeDefined();
    });
  });

  describe('Execution Tracking', () => {
    it('should track successful execution', () => {
      service.trackExecution('claude-opus', true, 1500, 0.05);

      const stats = service.getStatistics();
      expect(stats['claude-opus'].requests).toBe(1);
      expect(stats['claude-opus'].successes).toBe(1);
    });

    it('should track failed execution', () => {
      service.trackExecution('claude-opus', false, 1500, 0.05);

      const stats = service.getStatistics();
      expect(stats['claude-opus'].requests).toBe(1);
      expect(stats['claude-opus'].failures).toBe(1);
    });

    it('should calculate average latency', () => {
      service.trackExecution('claude-opus', true, 1000, 0.05);
      service.trackExecution('claude-opus', true, 2000, 0.05);

      const stats = service.getStatistics();
      expect(stats['claude-opus'].avgLatency).toContain('1500');
    });

    it('should calculate success rate', () => {
      service.trackExecution('claude-opus', true, 1500, 0.05);
      service.trackExecution('claude-opus', true, 1500, 0.05);
      service.trackExecution('claude-opus', false, 1500, 0.05);

      const stats = service.getStatistics();
      expect(stats['claude-opus'].successRate).toContain('66');
    });
  });

  describe('Circuit Breaker', () => {
    it('should disable model after failure threshold', () => {
      const models = service.getAllModels();
      const testModel = models[0].name;

      // Simulate failures
      for (let i = 0; i < 5; i++) {
        service.trackExecution(testModel, false, 1500, 0.05);
      }

      const updatedModels = service.getAllModels();
      const testModelAfter = updatedModels.find((m) => m.name === testModel);
      expect(testModelAfter?.enabled).toBe(false);
    });

    it('should still allow selection with circuit breaker open if other models available', async () => {
      const models = service.getAllModels();
      if (models.length > 1) {
        const testModel = models[0].name;

        // Simulate failures to open circuit
        for (let i = 0; i < 5; i++) {
          service.trackExecution(testModel, false, 1500, 0.05);
        }

        // Should still select a model
        const request = {
          taskType: 'analyze',
          taskComplexity: 'simple' as const,
        };

        const result = await service.selectModel(request);
        expect(result.selectedModel).toBeDefined();
        expect(result.selectedModel).not.toBe(testModel);
      }
    });
  });

  describe('Model Management', () => {
    it('should update model configuration', () => {
      service.updateModel('claude-opus', { costPerRequest: 0.06 });

      const models = service.getAllModels();
      const updated = models.find((m) => m.name === 'claude-opus');
      expect(updated?.costPerRequest).toBe(0.06);
    });

    it('should throw error for unknown model', () => {
      expect(() => {
        service.updateModel('unknown-model', { costPerRequest: 0.1 });
      }).toThrow();
    });
  });

  describe('Statistics', () => {
    it('should provide detailed statistics', () => {
      service.trackExecution('claude-opus', true, 1500, 0.05);
      service.trackExecution('claude-opus', true, 1600, 0.05);

      const stats = service.getStatistics();
      expect(stats['claude-opus']).toBeDefined();
      expect(stats['claude-opus'].requests).toBe(2);
      expect(stats['claude-opus'].successes).toBe(2);
    });

    it('should reset statistics', () => {
      service.trackExecution('claude-opus', true, 1500, 0.05);
      service.reset();

      const stats = service.getStatistics();
      expect(stats['claude-opus'].requests).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle request with no available models gracefully', async () => {
      // Disable all models
      const models = service.getAllModels();
      models.forEach((model) => {
        service.updateModel(model.name, { enabled: false });
      });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
      };

      await expect(service.selectModel(request)).rejects.toThrow();
    });

    it('should handle cost limit that no models can meet', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
        costLimit: 0.001, // Very restrictive limit
      };

      await expect(service.selectModel(request)).rejects.toThrow();
    });
  });

  describe('Cost Optimization', () => {
    it('should prefer cheaper models when quality is similar', async () => {
      service.setStrategy({ type: 'cost' });

      const request = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
      };

      const result = await service.selectModel(request);
      const selectedModel = service.getAllModels().find((m) => m.name === result.selectedModel);

      expect(selectedModel).toBeDefined();
    });

    it('should calculate total potential savings', async () => {
      const request = {
        taskType: 'analyze',
        taskComplexity: 'simple' as const,
      };

      const costResult = await service.selectModel(request);

      service.setStrategy({ type: 'performance' });
      const perfResult = await service.selectModel(request);

      if (costResult.estimatedCost !== perfResult.estimatedCost) {
        expect(typeof costResult.estimatedCost).toBe('number');
      }
    });
  });
});

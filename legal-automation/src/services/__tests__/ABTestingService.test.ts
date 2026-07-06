import { ABTestingService, ABTestConfig } from '../ABTestingService';

describe('ABTestingService', () => {
  let abService: ABTestingService;

  beforeEach(() => {
    abService = new ABTestingService();
  });

  describe('Quality Evaluation', () => {
    it('should evaluate quality based on response length', () => {
      // Short response gets lower score
      const shortResponse = 'Brief';
      const shortScore = (abService as any).evaluateQuality(shortResponse, 'analyze', {});

      // Long response gets higher score
      const longResponse = 'A'.repeat(3000);
      const longScore = (abService as any).evaluateQuality(longResponse, 'analyze', {});

      expect(longScore).toBeGreaterThan(shortScore);
    });

    it('should give higher scores for structured content', () => {
      const unstructured = 'This is plain text without structure.';
      const unstructuredScore = (abService as any).evaluateQuality(
        unstructured,
        'analyze',
        {}
      );

      const structured = `Resumo:
Este é um texto estruturado.

Recomendações:
1. Primeira recomendação
2. Segunda recomendação`;

      const structuredScore = (abService as any).evaluateQuality(structured, 'analyze', {});

      expect(structuredScore).toBeGreaterThan(unstructuredScore);
    });

    it('should evaluate task-specific quality for generate', () => {
      const withoutPetition = 'Some generic text';
      const withoutScore = (abService as any).evaluateQuality(
        withoutPetition,
        'generate',
        {}
      );

      const withPetition = `PETIÇÃO INICIAL
Artigo 5º da Constituição Federal
Descrição detalhada`;

      const withScore = (abService as any).evaluateQuality(withPetition, 'generate', {});

      expect(withScore).toBeGreaterThan(withoutScore);
    });

    it('should evaluate task-specific quality for extract', () => {
      const plainText = 'Some plain text response';
      const plainScore = (abService as any).evaluateQuality(plainText, 'extract', {});

      const jsonText = '{"partes": ["João"], "pretensoes": ["Indenização"]}';
      const jsonScore = (abService as any).evaluateQuality(jsonText, 'extract', {});

      expect(jsonScore).toBeGreaterThan(plainScore);
    });

    it('should reward Claude provider in quality score', () => {
      const response = 'A'.repeat(2000);
      const claudeScore = (abService as any).evaluateQuality(response, 'analyze', {
        provider: 'claude',
      });

      const geminiScore = (abService as any).evaluateQuality(response, 'analyze', {
        provider: 'gemini',
      });

      expect(claudeScore).toBeGreaterThan(geminiScore);
    });

    it('should penalize cached responses slightly', () => {
      const response = 'A'.repeat(2000);
      const freshScore = (abService as any).evaluateQuality(response, 'analyze', {
        provider: 'claude',
        cached: false,
      });

      const cachedScore = (abService as any).evaluateQuality(response, 'analyze', {
        provider: 'claude',
        cached: true,
      });

      expect(freshScore).toBeGreaterThan(cachedScore);
    });

    it('should return score between 0 and 1', () => {
      const score = (abService as any).evaluateQuality(
        'Test response',
        'analyze',
        { provider: 'claude' }
      );

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('Winner Determination', () => {
    it('should declare clear winner when quality difference is high', () => {
      const { winner, confidence } = (abService as any).determineWinner(
        0.9, // Quality A
        0.5, // Quality B
        0.01, // Cost A
        0.02 // Cost B
      );

      expect(winner).toBe('a');
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should declare tie when quality is similar', () => {
      const { winner } = (abService as any).determineWinner(
        0.5,  // Quality A
        0.51, // Quality B (very close)
        0.01,
        0.01
      );

      expect(winner).toBe('tie');
    });

    it('should factor in cost efficiency', () => {
      // A is slightly better quality but much more expensive
      const { winner: winnerCostAware } = (abService as any).determineWinner(
        0.91,  // Quality A
        0.90,  // Quality B
        0.05,  // Cost A (expensive)
        0.01   // Cost B (cheap)
      );

      // With small quality difference (1%), result is a tie
      const { winner: winnerEqualCost } = (abService as any).determineWinner(
        0.91,  // Quality A
        0.90,  // Quality B
        0.01,  // Cost A
        0.01   // Cost B
      );

      expect(winnerEqualCost).toBe('tie');
    });

    it('should increase confidence with larger margin', () => {
      const { confidence: lowConfidence } = (abService as any).determineWinner(
        0.55,  // Small difference
        0.54,
        0.01,
        0.01
      );

      const { confidence: highConfidence } = (abService as any).determineWinner(
        0.9,   // Large difference
        0.5,
        0.01,
        0.01
      );

      expect(highConfidence).toBeGreaterThan(lowConfidence);
    });
  });

  describe('Performance Tracking', () => {
    it('should update model performance after test', () => {
      const mockResult = {
        testId: 'test-1',
        timestamp: new Date(),
        modelA: 'claude-sonnet',
        modelB: 'gemini-pro',
        taskType: 'generate',
        prompt: 'Test prompt',
        responseA: 'Response A',
        responseB: 'Response B',
        qualityScoreA: 0.9,
        qualityScoreB: 0.7,
        costA: 0.01,
        costB: 0.02,
        latencyA: 1000,
        latencyB: 2000,
        winner: 'a' as const,
        confidence: 0.95,
        marginOfVictory: 0.2,
      };

      (abService as any).updateModelPerformance(mockResult);

      const perfA = abService.getModelMetrics('claude-sonnet', 'generate');
      expect(perfA).not.toBeNull();
      expect(perfA?.totalTests).toBe(1);
      expect(perfA?.wins).toBe(1);
      expect(perfA?.averageQuality).toBe(0.9);
      expect(perfA?.averageCost).toBe(0.01);
    });

    it('should track multiple tests for same model', () => {
      for (let i = 0; i < 3; i++) {
        const winner: 'a' | 'b' = i % 2 === 0 ? 'a' : 'b';
        const mockResult = {
          testId: `test-${i}`,
          timestamp: new Date(),
          modelA: 'claude-sonnet',
          modelB: 'gemini-pro',
          taskType: 'analyze',
          prompt: `Prompt ${i}`,
          responseA: `Response A${i}`,
          responseB: `Response B${i}`,
          qualityScoreA: 0.85 + i * 0.02,
          qualityScoreB: 0.70 + i * 0.02,
          costA: 0.002,
          costB: 0.003,
          latencyA: 500,
          latencyB: 1000,
          winner,
          confidence: 0.90,
          marginOfVictory: 0.15,
        };

        (abService as any).updateModelPerformance(mockResult);
      }

      const perfA = abService.getModelMetrics('claude-sonnet', 'analyze');
      expect(perfA?.totalTests).toBe(3);
      expect(perfA?.wins).toBe(2); // Won 2 out of 3
      expect(perfA?.winRate).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate cost efficiency', () => {
      const mockResult = {
        testId: 'test-1',
        timestamp: new Date(),
        modelA: 'claude-haiku',
        modelB: 'gemini-pro',
        taskType: 'classify',
        prompt: 'Test',
        responseA: 'Response A',
        responseB: 'Response B',
        qualityScoreA: 0.8,
        qualityScoreB: 0.8,
        costA: 0.001,
        costB: 0.001,
        latencyA: 300,
        latencyB: 500,
        winner: 'tie' as const,
        confidence: 0.5,
        marginOfVictory: 0.0,
      };

      (abService as any).updateModelPerformance(mockResult);

      const perf = abService.getModelMetrics('claude-haiku', 'classify');
      expect(perf?.costEfficiency).toBe(800); // 0.8 / 0.001
    });
  });

  describe('Result Filtering', () => {
    beforeEach(() => {
      // Add test results
      for (let i = 0; i < 5; i++) {
        (abService as any).testResults.push({
          testId: `test-${i}`,
          timestamp: new Date(),
          modelA: i % 2 === 0 ? 'claude-sonnet' : 'gemini-pro',
          modelB: i % 2 === 0 ? 'gemini-pro' : 'claude-sonnet',
          taskType: i < 3 ? 'generate' : 'analyze',
          prompt: `Prompt ${i}`,
          responseA: `Response A${i}`,
          responseB: `Response B${i}`,
          qualityScoreA: 0.7 + i * 0.05,
          qualityScoreB: 0.6 + i * 0.05,
          costA: 0.01,
          costB: 0.02,
          latencyA: 1000,
          latencyB: 2000,
          winner: (i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'tie') as any,
          confidence: 0.9,
          marginOfVictory: 0.1,
        });
      }
    });

    it('should filter by modelA', () => {
      const results = abService.getResults({ modelA: 'claude-sonnet' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.modelA === 'claude-sonnet')).toBe(true);
    });

    it('should filter by taskType', () => {
      const results = abService.getResults({ taskType: 'generate' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.taskType === 'generate')).toBe(true);
    });

    it('should filter by winner', () => {
      const results = abService.getResults({ winner: 'a' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.winner === 'a')).toBe(true);
    });

    it('should filter by minimum confidence', () => {
      const results = abService.getResults({ minConfidence: 0.85 });
      expect(results.every((r) => r.confidence >= 0.85)).toBe(true);
    });

    it('should combine multiple filters', () => {
      const results = abService.getResults({
        modelA: 'claude-sonnet',
        taskType: 'generate',
        winner: 'a',
      });

      expect(
        results.every(
          (r) => r.modelA === 'claude-sonnet' && r.taskType === 'generate' && r.winner === 'a'
        )
      ).toBe(true);
    });
  });

  describe('Best Model Selection', () => {
    beforeEach(() => {
      // Simulate multiple tests
      const testResults = [
        {
          modelA: 'claude-sonnet',
          modelB: 'gemini-pro',
          taskType: 'generate',
          qualityA: 0.95,
          qualityB: 0.75,
          costA: 0.03,
          costB: 0.01,
          winnerA: true,
        },
        {
          modelA: 'claude-haiku',
          modelB: 'gemini-pro',
          taskType: 'analyze',
          qualityA: 0.85,
          qualityB: 0.75,
          costA: 0.002,
          costB: 0.003,
          winnerA: true,
        },
      ];

      for (const test of testResults) {
        const winner: 'a' | 'b' = test.winnerA ? 'a' : 'b';
        const mockResult = {
          testId: `test-${test.modelA}`,
          timestamp: new Date(),
          modelA: test.modelA,
          modelB: test.modelB,
          taskType: test.taskType,
          prompt: 'Test',
          responseA: 'Response A',
          responseB: 'Response B',
          qualityScoreA: test.qualityA,
          qualityScoreB: test.qualityB,
          costA: test.costA,
          costB: test.costB,
          latencyA: 1000,
          latencyB: 1500,
          winner,
          confidence: 0.9,
          marginOfVictory: 0.15,
        };

        (abService as any).updateModelPerformance(mockResult);
      }
    });

    it('should identify best model for task type', () => {
      const bestForGenerate = abService.getBestModel('generate');
      expect(bestForGenerate).not.toBeNull();
      expect(bestForGenerate).toMatch(/^(claude|gemini)-/);
    });

    it('should return null for non-tested task type', () => {
      const best = abService.getBestModel('non-existent-task');
      expect(best).toBeNull();
    });

    it('should provide model metrics', () => {
      const metrics = abService.getModelMetrics('claude-sonnet', 'generate');
      expect(metrics).not.toBeNull();
      expect(metrics?.totalTests).toBeGreaterThan(0);
      expect(metrics?.winRate).toBeGreaterThanOrEqual(0);
      expect(metrics?.costEfficiency).toBeGreaterThan(0);
    });
  });

  describe('Recommendations', () => {
    beforeEach(() => {
      // Add mock performance data
      const mockResult = {
        testId: 'test-recommend',
        timestamp: new Date(),
        modelA: 'claude-haiku',
        modelB: 'gemini-pro',
        taskType: 'analyze',
        prompt: 'Test',
        responseA: 'Response A',
        responseB: 'Response B',
        qualityScoreA: 0.88,
        qualityScoreB: 0.75,
        costA: 0.002,
        costB: 0.003,
        latencyA: 400,
        latencyB: 600,
        winner: 'a' as const,
        confidence: 0.92,
        marginOfVictory: 0.13,
      };

      (abService as any).updateModelPerformance(mockResult);
    });

    it('should generate recommendation for tested task', () => {
      const rec = abService.getRecommendation('analyze');
      expect(rec).not.toBeNull();
      expect(rec?.recommendedModel).toBeDefined();
      expect(rec?.reason).toBeDefined();
      expect(rec?.confidence).toBeGreaterThan(0);
      expect(rec?.estimatedSavings).toBeGreaterThanOrEqual(0);
    });

    it('should return null for untested task', () => {
      const rec = abService.getRecommendation('unknown-task');
      expect(rec).toBeNull();
    });

    it('should include estimated savings in recommendation', () => {
      const rec = abService.getRecommendation('analyze');
      expect(rec?.estimatedSavings).toBeDefined();
      expect(typeof rec?.estimatedSavings).toBe('number');
    });
  });

  describe('Result Summaries', () => {
    it('should summarize multiple test results', () => {
      const results = [
        {
          testId: 'test-1',
          winner: 'a' as const,
          confidence: 0.9,
        },
        {
          testId: 'test-2',
          winner: 'b' as const,
          confidence: 0.85,
        },
        {
          testId: 'test-3',
          winner: 'a' as const,
          confidence: 0.92,
        },
      ];

      const summary = (abService as any).summarizeResults(results as any);

      expect(summary.totalTests).toBe(3);
      expect(summary.aWins).toBe(2);
      expect(summary.bWins).toBe(1);
      expect(summary.ties).toBe(0);
      expect(summary.avgConfidence).toBeCloseTo((0.9 + 0.85 + 0.92) / 3, 2);
    });
  });
});

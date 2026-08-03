import { logger } from '@utils/logger';
import { llmPool } from '@/ai/llmPool';

export interface ABTestResult {
  testId: string;
  timestamp: Date;
  modelA: string;
  modelB: string;
  taskType: string;
  prompt: string;
  responseA: string;
  responseB: string;
  qualityScoreA: number;
  qualityScoreB: number;
  costA: number;
  costB: number;
  latencyA: number;
  latencyB: number;
  winner: 'a' | 'b' | 'tie';
  confidence: number;
  marginOfVictory: number;
}

export interface ModelPerformance {
  provider: string;
  model: string;
  taskType: string;
  totalTests: number;
  wins: number;
  averageQuality: number;
  averageCost: number;
  averageLatency: number;
  winRate: number;
  costEfficiency: number; // quality / cost ratio
}

export interface ABTestConfig {
  modelA: string;
  modelB: string;
  taskType: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  iterations?: number;
}

export class ABTestingService {
  private testResults: ABTestResult[] = [];
  private modelPerformance: Map<string, ModelPerformance> = new Map();
  private readonly resultsFolder = './ab-test-results';

  /**
   * Run A/B test comparing two models on the same prompt
   */
  async runTest(config: ABTestConfig): Promise<ABTestResult> {
    const startTime = Date.now();
    const testId = `ab-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info(`Starting A/B test: ${testId} (${config.modelA} vs ${config.modelB})`);

    try {
      // Run both models in parallel
      const [resultA, resultB] = await Promise.all([
        this.runModelTest(config.modelA, config),
        this.runModelTest(config.modelB, config),
      ]);

      // Evaluate quality
      const qualityA = this.evaluateQuality(
        resultA.response,
        config.taskType,
        resultA.metadata
      );
      const qualityB = this.evaluateQuality(
        resultB.response,
        config.taskType,
        resultB.metadata
      );

      // Determine winner
      const { winner, confidence, margin } = this.determineWinner(
        qualityA,
        qualityB,
        resultA.cost,
        resultB.cost
      );

      const result: ABTestResult = {
        testId,
        timestamp: new Date(),
        modelA: config.modelA,
        modelB: config.modelB,
        taskType: config.taskType,
        prompt: config.prompt.substring(0, 500), // Store truncated prompt
        responseA: resultA.response.substring(0, 1000),
        responseB: resultB.response.substring(0, 1000),
        qualityScoreA: qualityA,
        qualityScoreB: qualityB,
        costA: resultA.cost,
        costB: resultB.cost,
        latencyA: resultA.latency,
        latencyB: resultB.latency,
        winner,
        confidence,
        marginOfVictory: margin,
      };

      this.testResults.push(result);
      this.updateModelPerformance(result);

      logger.info(
        `A/B test completed: ${testId} - Winner: ${config.modelA === result.modelA ? 'A' : 'B'} ` +
          `(confidence: ${(confidence * 100).toFixed(1)}%)`
      );

      return result;
    } catch (error) {
      logger.error({ err: error }, `A/B test failed: ${testId}`);
      throw error;
    }
  }

  /**
   * Run multiple iterations of A/B test
   */
  async runMultipleTests(config: ABTestConfig): Promise<ABTestResult[]> {
    const iterations = config.iterations || 5;
    const results: ABTestResult[] = [];

    logger.info(
      `Running ${iterations} iterations of A/B test: ${config.modelA} vs ${config.modelB}`
    );

    for (let i = 0; i < iterations; i++) {
      const result = await this.runTest({
        ...config,
        iterations: 1,
      });
      results.push(result);

      // Small delay between iterations
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const summary = this.summarizeResults(results);
    logger.info(`A/B test series completed: ${JSON.stringify(summary)}`);

    return results;
  }

  /**
   * Get best model for a specific task type
   */
  getBestModel(taskType: string): string | null {
    let bestModel: string | null = null;
    let bestScore = -1;

    for (const [key, perf] of this.modelPerformance.entries()) {
      if (perf.taskType === taskType) {
        const score = perf.costEfficiency;
        if (score > bestScore) {
          bestScore = score;
          bestModel = key;
        }
      }
    }

    return bestModel;
  }

  /**
   * Get performance metrics for a model
   */
  getModelMetrics(model: string, taskType?: string): ModelPerformance | null {
    for (const [key, perf] of this.modelPerformance.entries()) {
      if (key === `${model}:${taskType}` || key === model) {
        return perf;
      }
    }
    return null;
  }

  /**
   * Get test results with filtering
   */
  getResults(filters?: {
    modelA?: string;
    modelB?: string;
    taskType?: string;
    winner?: 'a' | 'b' | 'tie';
    minConfidence?: number;
  }): ABTestResult[] {
    return this.testResults.filter((result) => {
      if (filters?.modelA && result.modelA !== filters.modelA) return false;
      if (filters?.modelB && result.modelB !== filters.modelB) return false;
      if (filters?.taskType && result.taskType !== filters.taskType) return false;
      if (filters?.winner && result.winner !== filters.winner) return false;
      if (filters?.minConfidence && result.confidence < filters.minConfidence) return false;
      return true;
    });
  }

  /**
   * Generate recommendation based on A/B tests
   */
  getRecommendation(taskType: string): {
    recommendedModel: string;
    reason: string;
    confidence: number;
    estimatedSavings: number;
  } | null {
    const bestModel = this.getBestModel(taskType);
    if (!bestModel) return null;

    const metrics = this.getModelMetrics(bestModel, taskType);
    if (!metrics) return null;

    const savings = this.estimateSavings(taskType, bestModel);

    return {
      recommendedModel: bestModel,
      reason: `${bestModel} has ${(metrics.winRate * 100).toFixed(1)}% win rate and ${(metrics.costEfficiency).toFixed(2)}x cost efficiency`,
      confidence: Math.min(1, metrics.winRate * (metrics.totalTests / 10)),
      estimatedSavings: savings,
    };
  }

  // ========== Private Methods ==========

  private async runModelTest(
    model: string,
    config: ABTestConfig
  ): Promise<{ response: string; cost: number; latency: number; metadata: any }> {
    const startTime = Date.now();

    try {
      const response = await llmPool.call(config.prompt, {
        taskType: config.taskType as any,
        maxTokens: config.maxTokens || 1024,
        temperature: config.temperature || 0.3,
      });

      const latency = Date.now() - startTime;

      return {
        response: response.content,
        cost: response.cost || 0,
        latency,
        metadata: {
          provider: response.provider,
          model: response.model,
          tokensUsed: response.tokensUsed,
          cached: response.cached,
        },
      };
    } catch (error) {
      logger.error({ err: error }, `Failed to run test for model: ${model}`);
      throw error;
    }
  }

  private evaluateQuality(
    response: string,
    taskType: string,
    metadata: any
  ): number {
    let score = 0.5; // Base score

    // Length-based evaluation
    const length = response.length;
    if (length < 50) score -= 0.2;
    if (length > 100 && length < 5000) score += 0.15;
    if (length > 5000) score += 0.25;

    // Structure-based evaluation
    if (response.includes('\n\n')) score += 0.1; // Multiple paragraphs
    if (response.match(/\d+\./)) score += 0.1; // Numbered lists
    if (response.match(/[A-Z][a-z]+\:/)) score += 0.05; // Structured sections

    // Specific task evaluation
    if (taskType === 'generate') {
      if (response.includes('PETIÇÃO') || response.includes('Petição')) score += 0.15;
      if (response.match(/Artigo\s+\d+/i)) score += 0.1;
    } else if (taskType === 'analyze') {
      if (response.match(/resumo|summary/i)) score += 0.1;
      if (response.match(/recomend|sugestion/i)) score += 0.1;
    } else if (taskType === 'extract') {
      if (response.includes('{') || response.includes('[')) score += 0.15;
    }

    // Metadata-based (provider quality)
    if (metadata.provider === 'claude') score += 0.15;
    if (metadata.cached) score -= 0.05; // Slightly penalize cached (want fresh eval)

    // Clamp to 0-1
    return Math.max(0, Math.min(1, score));
  }

  private determineWinner(
    qualityA: number,
    qualityB: number,
    costA: number,
    costB: number
  ): { winner: 'a' | 'b' | 'tie'; confidence: number; margin: number } {
    // Calculate quality score (weighted by cost efficiency)
    const costEfficiencyA = costA > 0 ? qualityA / costA : qualityA;
    const costEfficiencyB = costB > 0 ? qualityB / costB : qualityB;

    const scoreA = qualityA * 0.7 + (1 - costA / Math.max(costA, costB)) * 0.3;
    const scoreB = qualityB * 0.7 + (1 - costB / Math.max(costA, costB)) * 0.3;

    const margin = Math.abs(scoreA - scoreB);
    const confidence = Math.min(1, margin * 2); // Higher margin = higher confidence

    let winner: 'a' | 'b' | 'tie' = 'tie';
    if (scoreA > scoreB * 1.05) {
      winner = 'a';
    } else if (scoreB > scoreA * 1.05) {
      winner = 'b';
    }

    return { winner, confidence, margin };
  }

  private updateModelPerformance(result: ABTestResult): void {
    // Update Model A performance
    const keyA = `${result.modelA}:${result.taskType}`;
    const perfA = this.modelPerformance.get(keyA) || {
      provider: result.modelA.split('-')[0],
      model: result.modelA,
      taskType: result.taskType,
      totalTests: 0,
      wins: 0,
      averageQuality: 0,
      averageCost: 0,
      averageLatency: 0,
      winRate: 0,
      costEfficiency: 0,
    };

    perfA.totalTests++;
    if (result.winner === 'a') perfA.wins++;
    perfA.averageQuality = (perfA.averageQuality * (perfA.totalTests - 1) + result.qualityScoreA) / perfA.totalTests;
    perfA.averageCost = (perfA.averageCost * (perfA.totalTests - 1) + result.costA) / perfA.totalTests;
    perfA.averageLatency = (perfA.averageLatency * (perfA.totalTests - 1) + result.latencyA) / perfA.totalTests;
    perfA.winRate = perfA.wins / perfA.totalTests;
    perfA.costEfficiency = perfA.averageCost > 0 ? perfA.averageQuality / perfA.averageCost : 0;

    this.modelPerformance.set(keyA, perfA);

    // Update Model B performance
    const keyB = `${result.modelB}:${result.taskType}`;
    const perfB = this.modelPerformance.get(keyB) || {
      provider: result.modelB.split('-')[0],
      model: result.modelB,
      taskType: result.taskType,
      totalTests: 0,
      wins: 0,
      averageQuality: 0,
      averageCost: 0,
      averageLatency: 0,
      winRate: 0,
      costEfficiency: 0,
    };

    perfB.totalTests++;
    if (result.winner === 'b') perfB.wins++;
    perfB.averageQuality = (perfB.averageQuality * (perfB.totalTests - 1) + result.qualityScoreB) / perfB.totalTests;
    perfB.averageCost = (perfB.averageCost * (perfB.totalTests - 1) + result.costB) / perfB.totalTests;
    perfB.averageLatency = (perfB.averageLatency * (perfB.totalTests - 1) + result.latencyB) / perfB.totalTests;
    perfB.winRate = perfB.wins / perfB.totalTests;
    perfB.costEfficiency = perfB.averageCost > 0 ? perfB.averageQuality / perfB.averageCost : 0;

    this.modelPerformance.set(keyB, perfB);
  }

  private summarizeResults(
    results: ABTestResult[]
  ): { totalTests: number; aWins: number; bWins: number; ties: number; avgConfidence: number } {
    const summary = {
      totalTests: results.length,
      aWins: results.filter((r) => r.winner === 'a').length,
      bWins: results.filter((r) => r.winner === 'b').length,
      ties: results.filter((r) => r.winner === 'tie').length,
      avgConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
    };
    return summary;
  }

  private estimateSavings(taskType: string, model: string): number {
    const perf = this.getModelMetrics(model, taskType);
    if (!perf) return 0;

    // Estimate monthly savings based on cost difference
    // Assuming 20-30 operations of this type per day
    const operationsPerDay = taskType === 'generate' ? 20 : taskType === 'analyze' ? 150 : 75;
    const operationsPerMonth = operationsPerDay * 30;

    // Baseline Gemini cost vs optimized model
    const baselineCost = 0.002; // Example baseline
    const savingsPerOperation = Math.max(0, baselineCost - perf.averageCost);

    return savingsPerOperation * operationsPerMonth;
  }
}

export const abTestingService = new ABTestingService();

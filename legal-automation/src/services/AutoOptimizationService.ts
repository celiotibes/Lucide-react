import { logger } from '@utils/logger';
import { abTestingService } from '@services/ABTestingService';

export interface OptimizationStrategy {
  taskType: string;
  selectedModel: string;
  reason: string;
  confidence: number;
  expectedQuality: number;
  expectedCost: number;
  estimatedSavings: number;
  lastUpdated: Date;
  testCount: number;
}

export interface ModelSelection {
  taskType: string;
  primaryModel: string;
  fallbackModel: string;
  confidence: number;
  quality: number;
  cost: number;
}

export interface OptimizationReport {
  totalTaskTypes: number;
  optimizedTaskTypes: number;
  estimatedMonthlySavings: number;
  averageQualityImprovement: number;
  strategies: OptimizationStrategy[];
  timestamp: Date;
}

// ============================================================================
// AUTO-OPTIMIZATION SERVICE
// ============================================================================
export class AutoOptimizationService {
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private optimizationHistory: OptimizationStrategy[] = [];
  private readonly MIN_TESTS_FOR_OPTIMIZATION = 3; // Need at least 3 tests to optimize

  /**
   * Get optimal model for task type
   */
  getOptimalModel(taskType: string): ModelSelection | null {
    // First check if we have a cached strategy
    const strategy = this.strategies.get(taskType);
    if (strategy) {
      return {
        taskType,
        primaryModel: strategy.selectedModel,
        fallbackModel: 'claude-sonnet', // Always fallback to Claude
        confidence: strategy.confidence,
        quality: strategy.expectedQuality,
        cost: strategy.expectedCost,
      };
    }

    // No optimization strategy yet
    return null;
  }

  /**
   * Generate optimization strategy for task type
   */
  generateStrategy(taskType: string): OptimizationStrategy | null {
    const bestModel = abTestingService.getBestModel(taskType);
    if (!bestModel) {
      logger.warn(`No A/B test data available for task: ${taskType}`);
      return null;
    }

    const metrics = abTestingService.getModelMetrics(bestModel, taskType);
    if (!metrics || metrics.totalTests < this.MIN_TESTS_FOR_OPTIMIZATION) {
      logger.warn(
        `Insufficient test data for task ${taskType} (${metrics?.totalTests || 0} tests)`
      );
      return null;
    }

    const recommendation = abTestingService.getRecommendation(taskType);
    if (!recommendation) {
      return null;
    }

    const strategy: OptimizationStrategy = {
      taskType,
      selectedModel: bestModel,
      reason: recommendation.reason,
      confidence: recommendation.confidence,
      expectedQuality: metrics.averageQuality,
      expectedCost: metrics.averageCost,
      estimatedSavings: recommendation.estimatedSavings,
      lastUpdated: new Date(),
      testCount: metrics.totalTests,
    };

    // Store strategy
    this.strategies.set(taskType, strategy);
    this.optimizationHistory.push(strategy);

    logger.info(
      `Optimization strategy generated for ${taskType}: ${bestModel} ` +
        `(confidence: ${(strategy.confidence * 100).toFixed(1)}%)`
    );

    return strategy;
  }

  /**
   * Optimize all task types based on A/B test results
   */
  optimizeAll(): OptimizationReport {
    const taskTypes = ['generate', 'analyze', 'extract', 'classify'];
    const strategies: OptimizationStrategy[] = [];
    let totalSavings = 0;
    let totalQualityImprovement = 0;

    for (const taskType of taskTypes) {
      const strategy = this.generateStrategy(taskType);
      if (strategy) {
        strategies.push(strategy);
        totalSavings += strategy.estimatedSavings;
        totalQualityImprovement += strategy.expectedQuality;
      }
    }

    const report: OptimizationReport = {
      totalTaskTypes: taskTypes.length,
      optimizedTaskTypes: strategies.length,
      estimatedMonthlySavings: totalSavings,
      averageQualityImprovement: totalQualityImprovement / Math.max(1, strategies.length),
      strategies,
      timestamp: new Date(),
    };

    logger.info(
      `Optimization report: ${strategies.length}/${taskTypes.length} tasks optimized, ` +
        `savings: $${totalSavings.toFixed(2)}/month`
    );

    return report;
  }

  /**
   * Update strategy (refresh based on latest A/B test data)
   */
  updateStrategy(taskType: string): OptimizationStrategy | null {
    const newStrategy = this.generateStrategy(taskType);
    if (!newStrategy) return null;

    const oldStrategy = this.strategies.get(taskType);
    if (oldStrategy && oldStrategy.selectedModel !== newStrategy.selectedModel) {
      logger.info(
        `Strategy updated for ${taskType}: ${oldStrategy.selectedModel} → ${newStrategy.selectedModel}`
      );
    }

    return newStrategy;
  }

  /**
   * Get optimization strategy for task type
   */
  getStrategy(taskType: string): OptimizationStrategy | null {
    return this.strategies.get(taskType) || null;
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): OptimizationStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get optimization history
   */
  getHistory(): OptimizationStrategy[] {
    return this.optimizationHistory;
  }

  /**
   * Clear old strategies (older than 7 days)
   */
  clearOldStrategies(olderThanDays: number = 7): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let removed = 0;
    for (const [key, strategy] of this.strategies.entries()) {
      if (strategy.lastUpdated < cutoffDate) {
        this.strategies.delete(key);
        removed++;
      }
    }

    logger.info(`Cleared ${removed} old optimization strategies`);
    return removed;
  }

  /**
   * Get recommended models for all tasks
   */
  getRecommendedModels(): Record<string, ModelSelection> {
    const result: Record<string, ModelSelection> = {};
    const taskTypes = ['generate', 'analyze', 'extract', 'classify'];

    for (const taskType of taskTypes) {
      const model = this.getOptimalModel(taskType);
      if (model) {
        result[taskType] = model;
      }
    }

    return result;
  }

  /**
   * Calculate potential savings if strategies adopted
   */
  calculatePotentialSavings(expectedVolume?: Record<string, number>): {
    currentEstimate: number;
    optimizedEstimate: number;
    potentialSavings: number;
    savingsPercentage: number;
  } {
    const defaultVolume: Record<string, number> = {
      generate: 20,
      analyze: 150,
      extract: 75,
      classify: 50,
    };

    const volume = { ...defaultVolume, ...expectedVolume };

    let currentCost = 0;
    let optimizedCost = 0;

    // Estimate current cost (assume Gemini for all)
    const baselineCostPerTask = {
      generate: 0.048, // Claude-sonnet
      analyze: 0.02, // Gemini average
      extract: 0.03, // Claude average
      classify: 0.01, // Grok
    };

    for (const [taskType, count] of Object.entries(volume)) {
      const baseCost = baselineCostPerTask[taskType as keyof typeof baselineCostPerTask] || 0.02;
      currentCost += baseCost * count * 30; // monthly
    }

    // Calculate optimized cost using strategies
    for (const [taskType, count] of Object.entries(volume)) {
      const strategy = this.getStrategy(taskType);
      if (strategy) {
        optimizedCost += strategy.expectedCost * count * 30; // monthly
      } else {
        const baseCost = baselineCostPerTask[taskType as keyof typeof baselineCostPerTask] || 0.02;
        optimizedCost += baseCost * count * 30; // monthly
      }
    }

    const potentialSavings = currentCost - optimizedCost;
    const savingsPercentage = currentCost > 0 ? (potentialSavings / currentCost) * 100 : 0;

    return {
      currentEstimate: currentCost,
      optimizedEstimate: optimizedCost,
      potentialSavings: Math.max(0, potentialSavings),
      savingsPercentage,
    };
  }

  /**
   * Get optimization metrics
   */
  getMetrics() {
    const strategies = this.getAllStrategies();
    const totalTests = strategies.reduce((sum, s) => sum + s.testCount, 0);
    const avgConfidence =
      strategies.length > 0 ? strategies.reduce((sum, s) => sum + s.confidence, 0) / strategies.length : 0;
    const avgQuality =
      strategies.length > 0 ? strategies.reduce((sum, s) => sum + s.expectedQuality, 0) / strategies.length : 0;
    const totalSavings = strategies.reduce((sum, s) => sum + s.estimatedSavings, 0);

    return {
      strategiesActive: strategies.length,
      totalABTests: totalTests,
      averageConfidence: avgConfidence,
      averageExpectedQuality: avgQuality,
      estimatedMonthlySavings: totalSavings,
      lastUpdate: strategies.length > 0 ? strategies[strategies.length - 1].lastUpdated : null,
    };
  }
}

export const autoOptimizationService = new AutoOptimizationService();

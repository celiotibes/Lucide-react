import { logger } from '@utils/logger';
import { persistenceService } from '@services/PersistenceService';
import { abTestingService } from '@services/ABTestingService';

// ============================================================================
// MULTI-MODEL ORCHESTRATION SERVICE - Phase 5.7
// ============================================================================

export interface ModelConfig {
  name: string;
  provider: string;
  costPerRequest: number;
  maxConcurrent: number;
  healthScore: number;
  enabled: boolean;
}

export interface LoadBalancingStrategy {
  type: 'round_robin' | 'performance' | 'cost' | 'hybrid' | 'adaptive';
  weights?: Record<string, number>;
  fallbackOrder?: string[];
}

export interface OrchestrationRequest {
  taskType: string;
  taskComplexity: 'simple' | 'moderate' | 'complex';
  qualityTarget?: number;
  costLimit?: number;
  timeout?: number;
}

export interface OrchestrationResult {
  selectedModel: string;
  provider: string;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number;
  fallbackAvailable: boolean;
  executionPath: string[];
}

export class MultiModelOrchestrationService {
  private models: Map<string, ModelConfig> = new Map();
  private currentStrategy: LoadBalancingStrategy = { type: 'adaptive' };
  private modelStats: Map<string, any> = new Map();
  private circuitBreakers: Map<string, { failures: number; lastFailure: Date }> = new Map();
  private roundRobinIndex: number = 0;
  private readonly FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_BREAK_DURATION = 60000; // 1 minute

  constructor() {
    this.initializeDefaultModels();
  }

  private initializeDefaultModels(): void {
    const defaultModels: ModelConfig[] = [
      {
        name: 'claude-opus',
        provider: 'claude',
        costPerRequest: 0.05,
        maxConcurrent: 100,
        healthScore: 1.0,
        enabled: true,
      },
      {
        name: 'claude-sonnet',
        provider: 'claude',
        costPerRequest: 0.02,
        maxConcurrent: 200,
        healthScore: 1.0,
        enabled: true,
      },
      {
        name: 'gemini-ultra',
        provider: 'gemini',
        costPerRequest: 0.03,
        maxConcurrent: 150,
        healthScore: 0.95,
        enabled: true,
      },
      {
        name: 'gemini-pro',
        provider: 'gemini',
        costPerRequest: 0.01,
        maxConcurrent: 300,
        healthScore: 0.9,
        enabled: true,
      },
    ];

    for (const model of defaultModels) {
      this.models.set(model.name, model);
      this.modelStats.set(model.name, {
        successCount: 0,
        failureCount: 0,
        totalLatency: 0,
        requestCount: 0,
        lastUpdated: new Date(),
      });
    }

    logger.info(`✓ ${defaultModels.length} modelos padrão inicializados`);
  }

  /**
   * Select best model for a given request
   */
  async selectModel(request: OrchestrationRequest): Promise<OrchestrationResult> {
    try {
      // Get available models
      const availableModels = Array.from(this.models.values()).filter((m) => m.enabled && !this.isCircuitBreakerOpen(m.name));

      if (availableModels.length === 0) {
        throw new Error('Nenhum modelo disponível');
      }

      // Get historical performance data
      const performanceData = await this.getPerformanceData(request.taskType);

      // Apply strategy based on request characteristics
      let selectedModel: ModelConfig;

      if (request.costLimit !== undefined) {
        selectedModel = this.selectByCost(availableModels, request.costLimit, performanceData);
      } else if (request.qualityTarget !== undefined) {
        selectedModel = this.selectByQuality(availableModels, request.qualityTarget, performanceData);
      } else {
        selectedModel = this.selectByStrategy(availableModels, performanceData);
      }

      // Build execution path with fallbacks
      const executionPath = this.buildFallbackPath(selectedModel.name, availableModels);

      const estimatedLatency = this.estimateLatency(selectedModel, request.taskComplexity);
      const confidence = this.calculateConfidence(selectedModel, performanceData);

      return {
        selectedModel: selectedModel.name,
        provider: selectedModel.provider,
        estimatedCost: selectedModel.costPerRequest,
        estimatedLatency,
        confidence,
        fallbackAvailable: executionPath.length > 1,
        executionPath,
      };
    } catch (error) {
      logger.error({ err: error }, 'Erro ao selecionar modelo');
      throw error;
    }
  }

  /**
   * Select model based on cost constraints
   */
  private selectByCost(
    models: ModelConfig[],
    costLimit: number,
    performanceData: any,
  ): ModelConfig {
    const affordableModels = models.filter((m) => m.costPerRequest <= costLimit);

    if (affordableModels.length === 0) {
      throw new Error(`Nenhum modelo disponível dentro do limite de custo $${costLimit}`);
    }

    // Sort by cost-efficiency (quality/cost ratio)
    affordableModels.sort((a, b) => {
      const aQuality = performanceData[a.name]?.avgQuality || 0.8;
      const bQuality = performanceData[b.name]?.avgQuality || 0.8;
      return (bQuality / b.costPerRequest) - (aQuality / a.costPerRequest);
    });

    return affordableModels[0];
  }

  /**
   * Select model based on quality requirements
   */
  private selectByQuality(
    models: ModelConfig[],
    qualityTarget: number,
    performanceData: any,
  ): ModelConfig {
    // Filter models that meet quality target
    const qualityModels = models.filter((m) => {
      const quality = performanceData[m.name]?.avgQuality || 0.8;
      return quality >= qualityTarget;
    });

    if (qualityModels.length === 0) {
      // If no model meets target, use highest quality
      models.sort((a, b) => {
        const aQuality = performanceData[a.name]?.avgQuality || 0.8;
        const bQuality = performanceData[b.name]?.avgQuality || 0.8;
        return bQuality - aQuality;
      });
      return models[0];
    }

    // Among quality-compliant models, choose cheapest
    qualityModels.sort((a, b) => a.costPerRequest - b.costPerRequest);
    return qualityModels[0];
  }

  /**
   * Select model based on configured strategy
   */
  private selectByStrategy(
    models: ModelConfig[],
    performanceData: any,
  ): ModelConfig {
    switch (this.currentStrategy.type) {
      case 'round_robin':
        return this.roundRobinSelect(models);
      case 'performance':
        return this.performanceBasedSelect(models, performanceData);
      case 'cost':
        return this.costBasedSelect(models);
      case 'hybrid':
        return this.hybridSelect(models, performanceData);
      case 'adaptive':
      default:
        return this.adaptiveSelect(models, performanceData);
    }
  }

  /**
   * Round-robin model selection
   */
  private roundRobinSelect(models: ModelConfig[]): ModelConfig {
    const selectedModel = models[this.roundRobinIndex % models.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % models.length;
    return selectedModel;
  }

  /**
   * Performance-based selection
   */
  private performanceBasedSelect(
    models: ModelConfig[],
    performanceData: any,
  ): ModelConfig {
    models.sort((a, b) => {
      const aScore = (performanceData[a.name]?.avgQuality || 0.8) *
        (1 - performanceData[a.name]?.errorRate || 0.1) *
        a.healthScore;
      const bScore = (performanceData[b.name]?.avgQuality || 0.8) *
        (1 - performanceData[b.name]?.errorRate || 0.1) *
        b.healthScore;
      return bScore - aScore;
    });
    return models[0];
  }

  /**
   * Cost-based selection
   */
  private costBasedSelect(models: ModelConfig[]): ModelConfig {
    return models.reduce((cheapest, current) =>
      current.costPerRequest < cheapest.costPerRequest ? current : cheapest,
    );
  }

  /**
   * Hybrid selection (quality + cost balance)
   */
  private hybridSelect(
    models: ModelConfig[],
    performanceData: any,
  ): ModelConfig {
    models.sort((a, b) => {
      const aScore = (performanceData[a.name]?.avgQuality || 0.8) * 0.7 +
        (1 - (a.costPerRequest / Math.max(...models.map((m) => m.costPerRequest)))) * 0.3;
      const bScore = (performanceData[b.name]?.avgQuality || 0.8) * 0.7 +
        (1 - (b.costPerRequest / Math.max(...models.map((m) => m.costPerRequest)))) * 0.3;
      return bScore - aScore;
    });
    return models[0];
  }

  /**
   * Adaptive selection based on current conditions
   */
  private adaptiveSelect(
    models: ModelConfig[],
    performanceData: any,
  ): ModelConfig {
    // Use performance-based when quality variance is high
    const qualityVariance = this.calculateVariance(
      models.map((m) => performanceData[m.name]?.avgQuality || 0.8),
    );

    if (qualityVariance > 0.15) {
      return this.performanceBasedSelect(models, performanceData);
    }

    // Use cost-based when quality is similar
    return this.costBasedSelect(models);
  }

  /**
   * Build fallback execution path
   */
  private buildFallbackPath(primaryModel: string, allModels: ModelConfig[]): string[] {
    const path: string[] = [primaryModel];
    const remaining = allModels.filter((m) => m.name !== primaryModel);

    // Sort remaining by performance score
    remaining.sort((a, b) => {
      const aScore = a.healthScore / a.costPerRequest;
      const bScore = b.healthScore / b.costPerRequest;
      return bScore - aScore;
    });

    // Add top 2 fallbacks
    path.push(...remaining.slice(0, 2).map((m) => m.name));
    return path;
  }

  /**
   * Get performance data for a task type
   */
  private async getPerformanceData(taskType: string): Promise<any> {
    try {
      const performanceData: any = {};

      for (const model of this.models.values()) {
        const stats = this.modelStats.get(model.name);
        const historicalPerf = await persistenceService.getModelPerformance(model.name);

        performanceData[model.name] = {
          avgQuality: historicalPerf?.averageQuality || 0.8,
          avgCost: historicalPerf?.averageCost || model.costPerRequest,
          avgLatency: historicalPerf?.averageLatency || 1500,
          successRate: historicalPerf?.averageSuccessRate || 0.9,
          errorRate: 1 - (historicalPerf?.averageSuccessRate || 0.9),
          requestCount: stats?.requestCount || 0,
        };
      }

      return performanceData;
    } catch (error) {
      logger.warn({ err: error }, 'Erro ao obter dados de performance, usando valores padrão');
      return {};
    }
  }

  /**
   * Estimate latency for a model and complexity
   */
  private estimateLatency(model: ModelConfig, complexity: 'simple' | 'moderate' | 'complex'): number {
    const baseLatency = 500;
    const complexityMultiplier = { simple: 1, moderate: 1.5, complex: 2 };
    return Math.round(baseLatency * complexityMultiplier[complexity] * (1 - model.healthScore * 0.2));
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(model: ModelConfig, performanceData: any): number {
    const perf = performanceData[model.name];
    if (!perf) return model.healthScore;

    return (perf.successRate * 0.5 + model.healthScore * 0.5) * (1 - perf.errorRate);
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Track model execution
   */
  trackExecution(modelName: string, success: boolean, latency: number, cost: number): void {
    try {
      const stats = this.modelStats.get(modelName);
      if (!stats) return;

      stats.requestCount++;
      stats.totalLatency += latency;
      if (success) {
        stats.successCount++;
      } else {
        stats.failureCount++;
        this.recordModelFailure(modelName);
      }
      stats.lastUpdated = new Date();

      this.modelStats.set(modelName, stats);

      logger.debug(
        `Model ${modelName} tracking: success=${success}, latency=${latency}ms, cost=$${cost}`,
      );
    } catch (error) {
      logger.error({ err: error }, `Erro ao rastrear execução do modelo ${modelName}`);
    }
  }

  /**
   * Record model failure for circuit breaker
   */
  private recordModelFailure(modelName: string): void {
    const breaker = this.circuitBreakers.get(modelName) || { failures: 0, lastFailure: new Date() };
    breaker.failures++;
    breaker.lastFailure = new Date();

    if (breaker.failures >= this.FAILURE_THRESHOLD) {
      this.models.get(modelName)!.enabled = false;
      logger.warn(`Circuit breaker aberto para modelo ${modelName}`);
    }

    this.circuitBreakers.set(modelName, breaker);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(modelName: string): boolean {
    const breaker = this.circuitBreakers.get(modelName);
    if (!breaker) return false;

    const timeSinceFailure = Date.now() - breaker.lastFailure.getTime();
    if (timeSinceFailure > this.CIRCUIT_BREAK_DURATION) {
      breaker.failures = Math.max(0, breaker.failures - 1);
      if (breaker.failures < this.FAILURE_THRESHOLD) {
        this.models.get(modelName)!.enabled = true;
        logger.info(`Circuit breaker resetado para modelo ${modelName}`);
      }
    }

    return this.models.get(modelName)?.enabled === false;
  }

  /**
   * Set load balancing strategy
   */
  setStrategy(strategy: LoadBalancingStrategy): void {
    this.currentStrategy = strategy;
    logger.info(`Estratégia de balanceamento atualizada: ${strategy.type}`);
  }

  /**
   * Get all models
   */
  getAllModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * Update model configuration
   */
  updateModel(modelName: string, config: Partial<ModelConfig>): void {
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Modelo ${modelName} não encontrado`);
    }

    Object.assign(model, config);
    logger.info(`Modelo ${modelName} atualizado`);
  }

  /**
   * Get orchestration statistics
   */
  getStatistics(): any {
    const stats: any = {};

    for (const [modelName, modelStats] of this.modelStats.entries()) {
      const avgLatency = modelStats.requestCount > 0
        ? Math.round(modelStats.totalLatency / modelStats.requestCount)
        : 0;
      const successRate = modelStats.requestCount > 0
        ? modelStats.successCount / modelStats.requestCount
        : 0;

      stats[modelName] = {
        requests: modelStats.requestCount,
        successes: modelStats.successCount,
        failures: modelStats.failureCount,
        successRate: (successRate * 100).toFixed(1) + '%',
        avgLatency: avgLatency + 'ms',
        lastUpdated: modelStats.lastUpdated,
      };
    }

    return stats;
  }

  /**
   * Reset statistics
   */
  reset(): void {
    for (const stats of this.modelStats.values()) {
      stats.successCount = 0;
      stats.failureCount = 0;
      stats.totalLatency = 0;
      stats.requestCount = 0;
    }
    this.circuitBreakers.clear();
    logger.info('Estatísticas de orquestração resetadas');
  }
}

export const multiModelOrchestrationService = new MultiModelOrchestrationService();

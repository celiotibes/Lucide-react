import { logger } from '@utils/logger';
import { config } from '@utils/config';
import { RateLimitError, AppError } from '@utils/errors';

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  timeout?: number;
  cacheKey?: string;
  taskType?: 'generate' | 'analyze' | 'extract' | 'classify';
  complexity?: 'low' | 'medium' | 'high';
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  cached: boolean;
  cost?: number;
}

export type LLMProvider = 'claude' | 'gemini' | 'grok' | 'ollama' | 'offline';

interface ProviderConfig {
  primary: LLMProvider;
  fallbacks: LLMProvider[];
  offlineEnabled: boolean;
  cacheTTL: number;
  costTracking: boolean;
}

interface CostEntry {
  date: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  taskType: string;
}

// ============================================================================
// ROTEADOR INTELIGENTE DE COMPLEXIDADE
// ============================================================================
export class ComplexityRouter {
  determineModel(options: LLMOptions, prompt: string): LLMProvider {
    const taskType = options.taskType || 'analyze';
    const complexity = this.estimateComplexity(prompt);

    switch (taskType) {
      case 'classify':
        if (complexity <= 1) return 'ollama';
        if (complexity <= 2) return 'claude';
        return 'claude';

      case 'analyze':
        if (complexity <= 2) return 'claude';
        return 'claude';

      case 'extract':
        return 'claude';

      case 'generate':
        return 'claude';
    }

    return 'claude';
  }

  private estimateComplexity(prompt: string): number {
    let score = 0;
    const text = prompt.toLowerCase();

    if (/classificar|categoria|tipo|simples/i.test(text)) score -= 2;
    if (/listar|enumerar|resumo breve/i.test(text)) score -= 1;

    if (/análise jurídica|interpretação|nuance/i.test(text)) score += 3;
    if (/precedente|jurisprudência|aplicação|controverso/i.test(text)) score += 2;
    if (/risco|implicação legal|consequência/i.test(text)) score += 2;

    const words = text.split(/\s+/).length;
    if (words > 500) score += 1;
    if (words > 1000) score += 2;

    return Math.max(0, Math.min(10, score));
  }
}

// ============================================================================
// TRACKER DE CUSTOS
// ============================================================================
export class CostTracker {
  private costs: CostEntry[] = [];
  private monthlyBudget = 500;

  logCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    taskType: string,
  ): void {
    const cost = this.calculateCost(provider, model, inputTokens, outputTokens);

    this.costs.push({
      date: new Date().toISOString(),
      provider,
      model,
      inputTokens,
      outputTokens,
      cost,
      taskType,
    });

    const monthlyTotal = this.getMonthlyTotal();
    const percentage = (monthlyTotal / this.monthlyBudget) * 100;

    if (percentage > 80) {
      logger.warn(`⚠️  Orçamento mensal em ${percentage.toFixed(1)}%`);
    }
  }

  private calculateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    const rates: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 3 / 1000000, output: 15 / 1000000 },
      'claude-3-5-haiku-20241022': { input: 0.8 / 1000000, output: 4 / 1000000 },
      'gemini-1.5-flash': { input: 0.075 / 1000000, output: 0.3 / 1000000 },
      'gemini-nano': { input: 0.03 / 1000000, output: 0.12 / 1000000 },
      'grok-2': { input: 2 / 1000000, output: 10 / 1000000 },
    };

    const rate = rates[model] || { input: 0.005 / 1000000, output: 0.02 / 1000000 };
    return inputTokens * rate.input + outputTokens * rate.output;
  }

  getMonthlyTotal(): number {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.costs
      .filter(c => new Date(c.date) > monthStart)
      .reduce((sum, c) => sum + c.cost, 0);
  }

  getStatistics(): {
    totalCost: number;
    byProvider: Record<string, number>;
    byTask: Record<string, number>;
  } {
    const byProvider: Record<string, number> = {};
    const byTask: Record<string, number> = {};

    for (const cost of this.costs) {
      byProvider[cost.provider] = (byProvider[cost.provider] || 0) + cost.cost;
      byTask[cost.taskType] = (byTask[cost.taskType] || 0) + cost.cost;
    }

    return {
      totalCost: this.costs.reduce((sum, c) => sum + c.cost, 0),
      byProvider,
      byTask,
    };
  }
}

export class LLMPool {
  private config: ProviderConfig;
  private cache: Map<string, { content: string; timestamp: number }> = new Map();
  private claudeClient: any;
  private geminiClient: any;
  private grokClient: any;
  private ollamaUrl: string;
  private router: ComplexityRouter;
  private costTracker: CostTracker;

  constructor() {
    this.config = {
      primary: (config.ai_primary_model as LLMProvider) || 'claude',
      fallbacks: (config.ai_fallback_models?.split(',') as LLMProvider[]) || ['gemini', 'grok', 'ollama'],
      offlineEnabled: config.ai_offline_mode !== 'false',
      cacheTTL: parseInt(config.ai_cache_ttl || '604800'),
      costTracking: true,
    };

    this.router = new ComplexityRouter();
    this.costTracker = new CostTracker();

    this.initializeClients();
    this.startCacheCleanup();
  }

  private initializeClients(): void {
    // Claude
    if (this.config.primary === 'claude' || this.config.fallbacks.includes('claude')) {
      if (config.claude_api_key) {
        try {
          const Anthropic = require('@anthropic-ai/sdk').default;
          this.claudeClient = new Anthropic({ apiKey: config.claude_api_key });
          logger.info('✓ Claude client inicializado');
        } catch (error) {
          logger.warn('Claude não disponível:', error instanceof Error ? error.message : 'desconhecido');
        }
      } else {
        logger.warn('Claude API key não configurada');
      }
    }

    if (this.config.primary === 'gemini' || this.config.fallbacks.includes('gemini')) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this.geminiClient = new GoogleGenerativeAI(config.gemini_api_key);
        logger.info('✓ Gemini client inicializado');
      } catch (error) {
        logger.warn('Gemini não disponível:', error instanceof Error ? error.message : 'desconhecido');
      }
    }

    if (this.config.primary === 'grok' || this.config.fallbacks.includes('grok')) {
      logger.info('✓ Grok client configurado');
    }

    if (this.config.primary === 'ollama' || this.config.fallbacks.includes('ollama')) {
      this.ollamaUrl = config.ollama_base_url || 'http://localhost:11434';
      logger.info(`✓ Ollama configurado: ${this.ollamaUrl}`);
    }
  }

  async call(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    const cacheKey = options.cacheKey || this.generateCacheKey(prompt);

    // Verificar cache
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      logger.debug(`Cache hit para: ${cacheKey.substring(0, 50)}...`);
      return {
        content: cached,
        provider: 'cache',
        model: 'cached',
        tokensUsed: 0,
        cached: true,
      };
    }

    // Usar ComplexityRouter para determinar melhor provedor
    const provider = this.router.determineModel(options, prompt);
    logger.info(`🤖 Roteando para: ${provider} (task: ${options.taskType || 'analyze'})`);

    const providers = [provider, ...this.config.fallbacks.filter(f => f !== provider)];

    for (const fallbackProvider of providers) {
      try {
        logger.debug(`Tentando ${fallbackProvider}...`);
        const response = await this.callProvider(fallbackProvider, prompt, options);

        // Cache resultado
        this.setInCache(cacheKey, response.content, this.config.cacheTTL);

        // Rastrear custo
        if (this.config.costTracking) {
          this.costTracker.logCost(
            response.provider,
            response.model,
            Math.ceil(prompt.length / 4),
            response.tokensUsed,
            options.taskType || 'unknown',
          );
        }

        return response;
      } catch (error) {
        logger.warn(`${fallbackProvider} falhou:`, error instanceof Error ? error.message : 'desconhecido');

        if (fallbackProvider === providers[providers.length - 1]) {
          // Última opção
          if (this.config.offlineEnabled) {
            logger.warn('Todos os provedores falharam, usando modo offline');
            return this.offlineMode(prompt);
          }
          throw new AppError(503, 'Todos os provedores de IA indisponíveis');
        }
      }
    }

    throw new AppError(503, 'Nenhum provedor de IA disponível');
  }

  private async callProvider(
    provider: LLMProvider,
    prompt: string,
    options: LLMOptions,
  ): Promise<LLMResponse> {
    const timeout = options.timeout || 30000;

    switch (provider) {
      case 'claude':
        return this.callClaude(prompt, options);
      case 'gemini':
        return this.callGemini(prompt, options, timeout);
      case 'grok':
        return this.callGrok(prompt, options, timeout);
      case 'ollama':
        return this.callOllama(prompt, options, timeout);
      default:
        throw new AppError(400, `Provedor desconhecido: ${provider}`);
    }
  }

  private async callClaude(
    prompt: string,
    options: LLMOptions,
  ): Promise<LLMResponse> {
    if (!this.claudeClient) {
      throw new Error('Claude client não inicializado');
    }

    try {
      const response = await this.claudeClient.messages.create({
        model: this.selectClaudeModel(options),
        max_tokens: options.maxTokens || 2048,
        temperature: options.temperature ?? 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      return {
        content: response.content[0].type === 'text' ? response.content[0].text : '',
        provider: 'claude',
        model: response.model,
        tokensUsed: response.usage.output_tokens,
        cached: false,
      };
    } catch (error) {
      throw new AppError(500, `Erro ao chamar Claude: ${error}`);
    }
  }

  private selectClaudeModel(options: LLMOptions): string {
    const complexity = options.complexity || 'medium';

    switch (complexity) {
      case 'low':
        return config.claude_model_haiku || 'claude-3-5-haiku-20241022';
      case 'medium':
        return config.claude_model || 'claude-3-5-sonnet-20241022';
      case 'high':
        return config.claude_model || 'claude-3-5-sonnet-20241022';
      default:
        return config.claude_model || 'claude-3-5-sonnet-20241022';
    }
  }

  private async callGemini(
    prompt: string,
    options: LLMOptions,
    timeout: number,
  ): Promise<LLMResponse> {
    if (!this.geminiClient) {
      throw new Error('Gemini client não inicializado');
    }

    const model = this.geminiClient.getGenerativeModel({
      model: config.gemini_model || 'gemini-1.5-flash',
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 2048,
        topP: options.topP ?? 0.9,
      },
    });

    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        setTimeout(() => reject(new Error('Timeout Gemini')), timeout),
    );

    try {
      const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise,
      ]);

      const response = result as any;
      const content = response.response.text();

      return {
        content,
        provider: 'gemini',
        model: config.gemini_model || 'gemini-1.5-flash',
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('429')) {
        throw new RateLimitError('Gemini rate limit excedido');
      }
      throw error;
    }
  }

  private async callGrok(
    prompt: string,
    options: LLMOptions,
    timeout: number,
  ): Promise<LLMResponse> {
    const axios = require('axios');

    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        setTimeout(() => reject(new Error('Timeout Grok')), timeout),
    );

    try {
      const response = await Promise.race([
        axios.post(
          'https://api.xai.com/v1/chat/completions',
          {
            model: config.grok_model || 'grok-4.1-fast',
            messages: [{ role: 'user', content: prompt }],
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 2048,
          },
          {
            headers: {
              Authorization: `Bearer ${config.grok_api_key}`,
              'Content-Type': 'application/json',
            },
          },
        ),
        timeoutPromise,
      ]);

      const content = response.data.choices[0].message.content;

      return {
        content,
        provider: 'grok',
        model: config.grok_model || 'grok-4.1-fast',
        tokensUsed: response.data.usage?.total_tokens || 0,
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('429')) {
        throw new RateLimitError('Grok rate limit excedido');
      }
      throw error;
    }
  }

  private async callOllama(
    prompt: string,
    options: LLMOptions,
    timeout: number,
  ): Promise<LLMResponse> {
    const axios = require('axios');

    const timeoutPromise = new Promise<never>(
      (_, reject) =>
        setTimeout(() => reject(new Error('Timeout Ollama')), timeout),
    );

    try {
      const response = await Promise.race([
        axios.post(
          `${this.ollamaUrl}/api/generate`,
          {
            model: config.ollama_model || 'initium/law_model',
            prompt,
            stream: false,
            temperature: options.temperature ?? 0.3,
            num_predict: options.maxTokens ?? 2048,
          },
          { timeout },
        ),
        timeoutPromise,
      ]);

      return {
        content: response.data.response,
        provider: 'ollama',
        model: config.ollama_model || 'initium/law_model',
        tokensUsed: 0, // Ollama não retorna token count
        cached: false,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
        throw new Error('Ollama não disponível. Ensure `ollama serve` is running');
      }
      throw error;
    }
  }

  private offlineMode(prompt: string): LLMResponse {
    logger.warn('Usando modo offline (degradado)');

    // Implementação simples de template matching
    const templates: Record<string, string> = {
      'gerar petição': 'Rascunho de petição (modo offline) - Requer revisão manual',
      'analisar movimentos':
        'Análise de movimentos (modo offline) - Sincronize com servidor depois',
      'validar petição': 'Validação (modo offline) - Cheque manual necessário',
    };

    for (const [keyword, response] of Object.entries(templates)) {
      if (prompt.toLowerCase().includes(keyword)) {
        return {
          content: response,
          provider: 'offline',
          model: 'template',
          tokensUsed: 0,
          cached: false,
        };
      }
    }

    return {
      content: 'Modo offline: Serviço indisponível. Tente novamente mais tarde.',
      provider: 'offline',
      model: 'fallback',
      tokensUsed: 0,
      cached: false,
    };
  }

  private generateCacheKey(prompt: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(prompt).digest('hex');
  }

  private getFromCache(key: string): string | null {
    const cached = this.cache.get(key);

    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.config.cacheTTL * 1000) {
      this.cache.delete(key);
      return null;
    }

    return cached.content;
  }

  private setInCache(key: string, content: string, ttl: number): void {
    this.cache.set(key, {
      content,
      timestamp: Date.now(),
    });
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, value] of this.cache.entries()) {
        if (now - value.timestamp > this.config.cacheTTL * 1000) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.debug(`Cache cleanup: ${cleaned} entradas removidas`);
      }
    }, 60 * 60 * 1000); // A cada hora
  }

  getStatus(): object {
    return {
      primaryProvider: this.config.primary,
      fallbacks: this.config.fallbacks,
      cacheSize: this.cache.size,
      cacheTTL: this.config.cacheTTL,
      offlineEnabled: this.config.offlineEnabled,
      claudeAvailable: !!this.claudeClient,
      geminiAvailable: !!this.geminiClient,
      ollamaUrl: this.ollamaUrl,
    };
  }

  getStats(): {
    totalCost: number;
    byProvider: Record<string, number>;
    byTask: Record<string, number>;
  } {
    return this.costTracker.getStatistics();
  }

  getCostBudgetStatus(): {
    used: number;
    budget: number;
    percentageUsed: number;
    status: 'ok' | 'warning' | 'critical';
  } {
    const used = this.costTracker.getMonthlyTotal();
    const budget = 500;

    return {
      used,
      budget,
      percentageUsed: (used / budget) * 100,
      status: used / budget > 0.9 ? 'critical' : used / budget > 0.7 ? 'warning' : 'ok',
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Cache de IA limpo');
  }
}

export const llmPool = new LLMPool();

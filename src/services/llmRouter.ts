/**
 * 4-Tier LLM Router Service
 * Routes requests to optimal LLM based on cost, speed, and quality
 */

import type {
  LLMRequest,
  LLMResponse,
  LLMConfig,
  ModelMetrics,
  RoutingDecision,
  LLMRouterConfig,
  LLMProvider,
  LLMModel,
  RoutingStrategy,
} from '../types/llm'
import { LLMProvider, LLMModel, RoutingStrategy } from '../types/llm'

class LLMRouter {
  private config: LLMRouterConfig
  private modelMetrics: Map<string, ModelMetrics>
  private requestCache: Map<string, LLMResponse>
  private configs: Map<LLMProvider, LLMConfig>
  private requestHistory: Array<{ timestamp: number; model: LLMModel; cost: number }>

  constructor(config: LLMRouterConfig) {
    this.config = config
    this.modelMetrics = this.initializeMetrics()
    this.requestCache = new Map()
    this.configs = new Map()
    this.requestHistory = []
  }

  /**
   * Initialize model metrics for all available models
   */
  private initializeMetrics(): Map<string, ModelMetrics> {
    const metrics = new Map<string, ModelMetrics>()

    // Claude models
    metrics.set(LLMModel.CLAUDE_OPUS, {
      provider: LLMProvider.CLAUDE,
      model: LLMModel.CLAUDE_OPUS,
      costPer1kTokens: 0.015,
      avgLatencyMs: 800,
      qualityScore: 10,
      maxContextTokens: 200000,
      costIndex: 9,
      speedIndex: 6,
      qualityIndex: 10,
    })

    metrics.set(LLMModel.CLAUDE_SONNET, {
      provider: LLMProvider.CLAUDE,
      model: LLMModel.CLAUDE_SONNET,
      costPer1kTokens: 0.003,
      avgLatencyMs: 600,
      qualityScore: 8.5,
      maxContextTokens: 200000,
      costIndex: 6,
      speedIndex: 7,
      qualityIndex: 9,
    })

    metrics.set(LLMModel.CLAUDE_HAIKU, {
      provider: LLMProvider.CLAUDE,
      model: LLMModel.CLAUDE_HAIKU,
      costPer1kTokens: 0.0008,
      avgLatencyMs: 400,
      qualityScore: 7,
      maxContextTokens: 200000,
      costIndex: 2,
      speedIndex: 8,
      qualityIndex: 7,
    })

    // Groq models (free/fast)
    metrics.set(LLMModel.GROQ_MIXTRAL, {
      provider: LLMProvider.GROQ,
      model: LLMModel.GROQ_MIXTRAL,
      costPer1kTokens: 0,
      avgLatencyMs: 300,
      qualityScore: 7.5,
      maxContextTokens: 32768,
      costIndex: 1,
      speedIndex: 9,
      qualityIndex: 7,
    })

    metrics.set(LLMModel.GROQ_LLAMA, {
      provider: LLMProvider.GROQ,
      model: LLMModel.GROQ_LLAMA,
      costPer1kTokens: 0,
      avgLatencyMs: 250,
      qualityScore: 7,
      maxContextTokens: 4096,
      costIndex: 1,
      speedIndex: 10,
      qualityIndex: 6,
    })

    metrics.set(LLMModel.GROQ_GEMMA, {
      provider: LLMProvider.GROQ,
      model: LLMModel.GROQ_GEMMA,
      costPer1kTokens: 0,
      avgLatencyMs: 200,
      qualityScore: 6,
      maxContextTokens: 8192,
      costIndex: 1,
      speedIndex: 10,
      qualityIndex: 5,
    })

    // Google Gemini models
    metrics.set(LLMModel.GEMINI_PRO, {
      provider: LLMProvider.GEMINI,
      model: LLMModel.GEMINI_PRO,
      costPer1kTokens: 0.0005,
      avgLatencyMs: 700,
      qualityScore: 8,
      maxContextTokens: 1000000,
      costIndex: 3,
      speedIndex: 6,
      qualityIndex: 8,
    })

    metrics.set(LLMModel.GEMINI_FLASH, {
      provider: LLMProvider.GEMINI,
      model: LLMModel.GEMINI_FLASH,
      costPer1kTokens: 0.00005,
      avgLatencyMs: 400,
      qualityScore: 7.5,
      maxContextTokens: 1000000,
      costIndex: 2,
      speedIndex: 9,
      qualityIndex: 7,
    })

    // Ollama models (local, no cost)
    metrics.set(LLMModel.OLLAMA_MISTRAL, {
      provider: LLMProvider.OLLAMA,
      model: LLMModel.OLLAMA_MISTRAL,
      costPer1kTokens: 0,
      avgLatencyMs: 500,
      qualityScore: 7,
      maxContextTokens: 8192,
      costIndex: 1,
      speedIndex: 8,
      qualityIndex: 6,
    })

    metrics.set(LLMModel.OLLAMA_NEURAL, {
      provider: LLMProvider.OLLAMA,
      model: LLMModel.OLLAMA_NEURAL,
      costPer1kTokens: 0,
      avgLatencyMs: 600,
      qualityScore: 6.5,
      maxContextTokens: 4096,
      costIndex: 1,
      speedIndex: 7,
      qualityIndex: 5,
    })

    metrics.set(LLMModel.OLLAMA_DOLPHIN, {
      provider: LLMProvider.OLLAMA,
      model: LLMModel.OLLAMA_DOLPHIN,
      costPer1kTokens: 0,
      avgLatencyMs: 700,
      qualityScore: 7.5,
      maxContextTokens: 16384,
      costIndex: 1,
      speedIndex: 6,
      qualityIndex: 7,
    })

    return metrics
  }

  /**
   * Register configuration for an LLM provider
   */
  registerConfig(config: LLMConfig): void {
    this.configs.set(config.provider, config)
  }

  /**
   * Route request to optimal model based on strategy
   */
  async route(request: LLMRequest): Promise<LLMResponse> {
    const strategy = request.strategy || this.config.strategy

    // Check cache first
    const cacheKey = this.generateCacheKey(request)
    if (this.config.enableCaching) {
      const cached = this.requestCache.get(cacheKey)
      if (cached) {
        return { ...cached, cached: true }
      }
    }

    // Make routing decision
    const decision = this.makeRoutingDecision(request, strategy)

    // Get configuration for selected provider
    const config = this.configs.get(decision.selectedProvider)
    if (!config) {
      throw new Error(`No configuration found for provider: ${decision.selectedProvider}`)
    }

    // Execute request with retries
    let lastError: Error | null = null
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await this.executeRequest(
          request,
          config,
          decision.selectedModel
        )
        this.requestHistory.push({
          timestamp: Date.now(),
          model: decision.selectedModel,
          cost: response.cost,
        })
        if (this.config.enableCaching) {
          this.requestCache.set(cacheKey, response)
        }
        return response
      } catch (error) {
        lastError = error as Error
        // Try fallback providers
        if (attempt < this.config.retryAttempts) {
          const nextProvider = this.config.fallbackProviders[attempt % this.config.fallbackProviders.length]
          const nextConfig = this.configs.get(nextProvider)
          if (nextConfig) {
            try {
              return await this.executeRequest(request, nextConfig, LLMModel.CLAUDE_HAIKU)
            } catch (fallbackError) {
              // Continue to next attempt
            }
          }
        }
      }
    }

    throw new Error(
      `LLM request failed after ${this.config.retryAttempts} retries: ${lastError?.message}`
    )
  }

  /**
   * Make routing decision based on strategy
   */
  private makeRoutingDecision(request: LLMRequest, strategy: RoutingStrategy): RoutingDecision {
    const models = Array.from(this.modelMetrics.values())

    let selected: ModelMetrics | null = null
    let reason = ''

    switch (strategy) {
      case RoutingStrategy.COST_OPTIMIZED:
        selected = models.reduce((min, m) => (m.costIndex < min.costIndex ? m : min))
        reason = 'Cost-optimized: selected lowest cost model'
        break

      case RoutingStrategy.SPEED_OPTIMIZED:
        selected = models.reduce((max, m) => (m.speedIndex > max.speedIndex ? m : max))
        reason = 'Speed-optimized: selected fastest model'
        break

      case RoutingStrategy.QUALITY_OPTIMIZED:
        selected = models.reduce((max, m) => (m.qualityIndex > max.qualityIndex ? m : max))
        reason = 'Quality-optimized: selected highest quality model'
        break

      case RoutingStrategy.FASTEST_AVAILABLE:
        selected = models.reduce((min, m) =>
          m.avgLatencyMs < min.avgLatencyMs ? m : min
        )
        reason = 'Fastest available: selected lowest latency model'
        break

      case RoutingStrategy.BALANCED:
      default:
        const scores = models.map((m) => ({
          model: m,
          score: (m.speedIndex + m.qualityIndex * 2 - m.costIndex) / 4,
        }))
        const highest = scores.reduce((max, s) => (s.score > max.score ? s : max))
        selected = highest.model
        reason = 'Balanced: optimized for speed + quality vs cost'
        break
    }

    return {
      selectedModel: selected.model,
      selectedProvider: selected.provider,
      reason,
      estimatedCost: selected.costPer1kTokens * (request.maxTokens || 1000) / 1000,
      estimatedLatency: selected.avgLatencyMs,
    }
  }

  /**
   * Execute request against specific LLM API
   */
  private async executeRequest(
    request: LLMRequest,
    config: LLMConfig,
    model: LLMModel
  ): Promise<LLMResponse> {
    const startTime = Date.now()

    // Route to appropriate provider
    let content: string
    switch (config.provider) {
      case LLMProvider.CLAUDE:
        content = await this.callClaudeAPI(request, config, model)
        break
      case LLMProvider.GROQ:
        content = await this.callGroqAPI(request, config, model)
        break
      case LLMProvider.GEMINI:
        content = await this.callGeminiAPI(request, config, model)
        break
      case LLMProvider.OLLAMA:
        content = await this.callOllamaAPI(request, config, model)
        break
      default:
        throw new Error(`Unknown provider: ${config.provider}`)
    }

    const latency = Date.now() - startTime
    const metrics = this.modelMetrics.get(model)!
    const tokensUsed = this.estimateTokens(content)
    const cost = (tokensUsed / 1000) * metrics.costPer1kTokens

    return {
      content,
      provider: config.provider,
      model,
      tokensUsed,
      cost,
      latency,
    }
  }

  /**
   * Call Claude API
   */
  private async callClaudeAPI(
    request: LLMRequest,
    config: LLMConfig,
    _model: LLMModel
  ): Promise<string> {
    const apiKey = config.apiKey || process.env.VITE_CLAUDE_API_KEY
    if (!apiKey) {
      throw new Error('Claude API key not configured')
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model || 'claude-opus-4.1',
        max_tokens: config.maxTokens || 2048,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`)
    }

    const data = await response.json() as any
    return data.content[0].text
  }

  /**
   * Call Groq API (free/fast)
   */
  private async callGroqAPI(
    request: LLMRequest,
    config: LLMConfig,
    _model: LLMModel
  ): Promise<string> {
    const apiKey = config.apiKey || process.env.VITE_GROQ_API_KEY
    if (!apiKey) {
      throw new Error('Groq API key not configured')
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model || 'mixtral-8x7b-32768',
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content: request.prompt },
        ],
        max_tokens: config.maxTokens || 2048,
        temperature: config.temperature || 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`)
    }

    const data = await response.json() as any
    return data.choices[0].message.content
  }

  /**
   * Call Google Gemini API
   */
  private async callGeminiAPI(
    request: LLMRequest,
    config: LLMConfig,
    _model: LLMModel
  ): Promise<string> {
    const apiKey = config.apiKey || process.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: request.prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: config.maxTokens || 2048,
            temperature: config.temperature || 0.7,
          },
          systemInstruction: request.system ? { parts: [{ text: request.system }] } : undefined,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`)
    }

    const data = await response.json() as any
    return data.candidates[0].content.parts[0].text
  }

  /**
   * Call Ollama API (local)
   */
  private async callOllamaAPI(
    request: LLMRequest,
    config: LLMConfig,
    _model: LLMModel
  ): Promise<string> {
    const baseUrl = config.baseUrl || 'http://localhost:11434'

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model || 'mistral',
        prompt: request.prompt,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`)
    }

    const data = await response.json() as any
    return data.response
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(request: LLMRequest): string {
    return `${request.prompt}-${request.system || ''}-${request.maxTokens || 0}`
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3)
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    totalRequests: number
    totalCost: number
    averageCostPerRequest: number
    mostUsedModel: LLMModel | null
  } {
    const totalCost = this.requestHistory.reduce((sum, r) => sum + r.cost, 0)
    const totalRequests = this.requestHistory.length
    const modelCounts = new Map<LLMModel, number>()

    this.requestHistory.forEach((r) => {
      modelCounts.set(r.model, (modelCounts.get(r.model) || 0) + 1)
    })

    const mostUsedModel = Array.from(modelCounts.entries()).reduce(
      (max, [model, count]) => (count > (modelCounts.get(max) || 0) ? model : max),
      null as LLMModel | null
    )

    return {
      totalRequests,
      totalCost,
      averageCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
      mostUsedModel,
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.requestCache.clear()
  }
}

// Export singleton instance
const defaultConfig: LLMRouterConfig = {
  strategy: RoutingStrategy.BALANCED,
  primaryProvider: LLMProvider.CLAUDE,
  fallbackProviders: [LLMProvider.GROQ, LLMProvider.GEMINI, LLMProvider.OLLAMA],
  enableCaching: true,
  retryAttempts: 3,
  requestTimeout: 30000,
}

export const llmRouter = new LLMRouter(defaultConfig)
export { LLMRouter }

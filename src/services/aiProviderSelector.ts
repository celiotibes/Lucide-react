/**
 * AI Provider Selector - Otimização de custo & qualidade
 * Rota requisições para o melhor modelo por caso de uso
 */

export type AIProviderName = 'claude' | 'gemini' | 'grok' | 'ollama'
export type CaseOfUse = 
  | 'legalAnalysis'
  | 'emailExtraction'
  | 'searchQuery'
  | 'contraArguments'
  | 'driveSync'
  | 'ragAnalysis'
  | 'llmRouting'

export interface AIProvider {
  name: AIProviderName
  model: string
  cost: number // $/1M tokens
  speed: 'fast' | 'medium' | 'slow'
  quality: number // 0-100
  maxTokens: number
  rateLimitPerMinute: number
}

export interface ProviderConfig {
  apiKeys: {
    claude?: string
    gemini?: string
    grok?: string
    ollama?: string
  }
  fallbackChain: AIProviderName[] // Ordem de fallback
  cachingEnabled: boolean
  cacheTTLDays: number
  costTrackingEnabled: boolean
}

// Mapeamento de providers por caso de uso
const PROVIDER_MAP: Record<CaseOfUse, AIProvider> = {
  // TIER 1: Premium - Análise jurídica complexa
  legalAnalysis: {
    name: 'claude',
    model: 'claude-3-5-haiku-20241022', // Mais barato que Sonnet
    cost: 0.80, // $0.80/1M entrada
    speed: 'fast',
    quality: 95,
    maxTokens: 4096,
    rateLimitPerMinute: 100,
  },

  // TIER 2: Económico - Extração NLP
  emailExtraction: {
    name: 'gemini',
    model: 'gemini-2.0-flash',
    cost: 0.075, // $0.075/1M tokens (cheapest)
    speed: 'fast',
    quality: 85,
    maxTokens: 4096,
    rateLimitPerMinute: 600,
  },

  searchQuery: {
    name: 'gemini',
    model: 'gemini-2.0-flash',
    cost: 0.075,
    speed: 'fast',
    quality: 80,
    maxTokens: 2048,
    rateLimitPerMinute: 600,
  },

  // TIER 3: Estratégico - Análise alternativa
  contraArguments: {
    name: 'grok',
    model: 'grok-2',
    cost: 0.05, // $0.05/1M entrada (cheapest premium)
    speed: 'fast',
    quality: 88,
    maxTokens: 8192,
    rateLimitPerMinute: 200,
  },

  // TIER 4: Local - Zero custo & segurança
  driveSync: {
    name: 'ollama',
    model: 'mistral:latest',
    cost: 0,
    speed: 'fast',
    quality: 100, // Para orchestração, qualidade não importa
    maxTokens: 4096,
    rateLimitPerMinute: 1000,
  },

  ragAnalysis: {
    name: 'ollama',
    model: 'mistral:latest', // Fine-tuned jurídico
    cost: 0,
    speed: 'medium',
    quality: 92,
    maxTokens: 8192,
    rateLimitPerMinute: 500,
  },

  llmRouting: {
    name: 'ollama',
    model: 'mistral:latest',
    cost: 0,
    speed: 'fast',
    quality: 100,
    maxTokens: 2048,
    rateLimitPerMinute: 1000,
  },
}

// Fallback chain global
const FALLBACK_CHAIN: AIProviderName[] = ['claude', 'gemini', 'grok', 'ollama']

interface CallLog {
  timestamp: Date
  caseOfUse: CaseOfUse
  provider: AIProviderName
  tokensUsed: number
  costUSD: number
  latencyMs: number
  success: boolean
}

class AIProviderSelector {
  private config: ProviderConfig
  private callLogs: CallLog[] = []
  private cacheKey = 'lucide_ai_cache'
  private logsKey = 'lucide_ai_logs'

  constructor(config: ProviderConfig) {
    this.config = config
    this.loadLogs()
  }

  /**
   * Seleciona o melhor provider para um caso de uso
   */
  selectProvider(caseOfUse: CaseOfUse): AIProvider {
    const provider = PROVIDER_MAP[caseOfUse]
    if (!provider) {
      throw new Error(`Unknown case of use: ${caseOfUse}`)
    }
    return provider
  }

  /**
   * Executa requisição com fallback automático
   */
  async executeWithFallback(
    caseOfUse: CaseOfUse,
    prompt: string,
    fallbackChain: AIProviderName[] = FALLBACK_CHAIN
  ): Promise<{
    response: string
    provider: AIProviderName
    tokensUsed: number
    costUSD: number
  }> {
    const startTime = Date.now()
    const primaryProvider = this.selectProvider(caseOfUse).name

    for (const providerName of fallbackChain) {
      try {
        const result = await this.callProvider(providerName, caseOfUse, prompt)
        const latency = Date.now() - startTime
        const cost = this.calculateCost(caseOfUse, result.tokens)

        // Log call
        this.logCall({
          timestamp: new Date(),
          caseOfUse,
          provider: providerName,
          tokensUsed: result.tokens,
          costUSD: cost,
          latencyMs: latency,
          success: true,
        })

        return {
          response: result.text,
          provider: providerName,
          tokensUsed: result.tokens,
          costUSD: cost,
        }
      } catch (error) {
        console.error(`Provider ${providerName} failed:`, error)
        // Continue to next fallback
      }
    }

    throw new Error(`All providers failed for case: ${caseOfUse}`)
  }

  /**
   * Chamar provider específico (implementar para cada um)
   */
  private async callProvider(
    providerName: AIProviderName,
    caseOfUse: CaseOfUse,
    prompt: string
  ): Promise<{ text: string; tokens: number }> {
    const provider = PROVIDER_MAP[caseOfUse]

    // Simular resposta (em prod, chamar APIs reais)
    return {
      text: `Resposta de ${providerName} para ${caseOfUse}`,
      tokens: Math.ceil(prompt.length / 4), // Estimativa
    }
  }

  /**
   * Calcular custo de uma requisição
   */
  private calculateCost(caseOfUse: CaseOfUse, tokens: number): number {
    const provider = PROVIDER_MAP[caseOfUse]
    return (tokens / 1_000_000) * provider.cost
  }

  /**
   * Log de chamadas (para análise de custos)
   */
  private logCall(log: CallLog): void {
    this.callLogs.push(log)
    this.saveLogs()
  }

  /**
   * Obter estatísticas de custo e uso
   */
  getStats(): {
    totalCalls: number
    totalCostUSD: number
    avgLatencyMs: number
    byProvider: Record<AIProviderName, { calls: number; cost: number }>
    byCaseOfUse: Record<CaseOfUse, { calls: number; cost: number }>
  } {
    const byProvider: Record<AIProviderName, { calls: number; cost: number }> = {
      claude: { calls: 0, cost: 0 },
      gemini: { calls: 0, cost: 0 },
      grok: { calls: 0, cost: 0 },
      ollama: { calls: 0, cost: 0 },
    }

    const byCaseOfUse: Record<CaseOfUse, { calls: number; cost: number }> = {
      legalAnalysis: { calls: 0, cost: 0 },
      emailExtraction: { calls: 0, cost: 0 },
      searchQuery: { calls: 0, cost: 0 },
      contraArguments: { calls: 0, cost: 0 },
      driveSync: { calls: 0, cost: 0 },
      ragAnalysis: { calls: 0, cost: 0 },
      llmRouting: { calls: 0, cost: 0 },
    }

    let totalCost = 0
    let totalLatency = 0

    for (const log of this.callLogs) {
      if (log.success) {
        byProvider[log.provider].calls += 1
        byProvider[log.provider].cost += log.costUSD
        byCaseOfUse[log.caseOfUse].calls += 1
        byCaseOfUse[log.caseOfUse].cost += log.costUSD
        totalCost += log.costUSD
        totalLatency += log.latencyMs
      }
    }

    return {
      totalCalls: this.callLogs.filter(l => l.success).length,
      totalCostUSD: totalCost,
      avgLatencyMs: this.callLogs.length > 0 ? totalLatency / this.callLogs.length : 0,
      byProvider,
      byCaseOfUse,
    }
  }

  private saveLogs(): void {
    localStorage.setItem(this.logsKey, JSON.stringify(this.callLogs))
  }

  private loadLogs(): void {
    const stored = localStorage.getItem(this.logsKey)
    if (stored) {
      this.callLogs = JSON.parse(stored)
    }
  }

  clearLogs(): void {
    this.callLogs = []
    localStorage.removeItem(this.logsKey)
  }
}

// Singleton instance
const config: ProviderConfig = {
  apiKeys: {
    claude: process.env.VITE_CLAUDE_API_KEY,
    gemini: process.env.VITE_GEMINI_API_KEY,
    grok: process.env.VITE_GROK_API_KEY,
    ollama: 'http://localhost:11434', // Local Ollama
  },
  fallbackChain: FALLBACK_CHAIN,
  cachingEnabled: true,
  cacheTTLDays: 90,
  costTrackingEnabled: true,
}

export const aiSelector = new AIProviderSelector(config)

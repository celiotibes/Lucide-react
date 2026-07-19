/**
 * LLM Types and Interfaces
 * Defines types for multi-model LLM routing
 */

export const LLMProvider = {
  CLAUDE: 'claude',
  GROQ: 'groq',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
} as const
export type LLMProvider = typeof LLMProvider[keyof typeof LLMProvider]

export const LLMModel = {
  // Claude models
  CLAUDE_OPUS: 'claude-opus-4.1',
  CLAUDE_SONNET: 'claude-sonnet-5',
  CLAUDE_HAIKU: 'claude-haiku-4.5',

  // Groq models (free/fast)
  GROQ_MIXTRAL: 'mixtral-8x7b-32768',
  GROQ_LLAMA: 'llama2-70b-4096',
  GROQ_GEMMA: 'gemma-7b-it',

  // Google Gemini models
  GEMINI_PRO: 'gemini-1.5-pro',
  GEMINI_FLASH: 'gemini-1.5-flash',

  // Ollama models (local)
  OLLAMA_MISTRAL: 'mistral',
  OLLAMA_NEURAL: 'neural-chat',
  OLLAMA_DOLPHIN: 'dolphin-mixtral',
} as const
export type LLMModel = typeof LLMModel[keyof typeof LLMModel]

export const RoutingStrategy = {
  COST_OPTIMIZED: 'cost-optimized',
  SPEED_OPTIMIZED: 'speed-optimized',
  QUALITY_OPTIMIZED: 'quality-optimized',
  BALANCED: 'balanced',
  FASTEST_AVAILABLE: 'fastest-available',
} as const
export type RoutingStrategy = typeof RoutingStrategy[keyof typeof RoutingStrategy]

export interface LLMConfig {
  provider: LLMProvider
  model: LLMModel
  apiKey?: string
  baseUrl?: string
  maxTokens?: number
  temperature?: number
  timeout?: number
}

export interface LLMRequest {
  prompt: string
  system?: string
  maxTokens?: number
  temperature?: number
  strategy?: RoutingStrategy
  fallbackProviders?: LLMProvider[]
}

export interface LLMResponse {
  content: string
  provider: LLMProvider
  model: LLMModel
  tokensUsed: number
  cost: number
  latency: number
  cached?: boolean
}

export interface ModelMetrics {
  provider: LLMProvider
  model: LLMModel
  costPer1kTokens: number
  avgLatencyMs: number
  qualityScore: number // 1-10 scale
  maxContextTokens: number
  costIndex: number // 1-10 (1=cheapest, 10=expensive)
  speedIndex: number // 1-10 (1=slowest, 10=fastest)
  qualityIndex: number // 1-10 (1=basic, 10=best)
}

export interface RoutingDecision {
  selectedModel: LLMModel
  selectedProvider: LLMProvider
  reason: string
  estimatedCost: number
  estimatedLatency: number
}

export interface LLMRouterConfig {
  strategy: RoutingStrategy
  primaryProvider: LLMProvider
  fallbackProviders: LLMProvider[]
  enableCaching: boolean
  retryAttempts: number
  requestTimeout: number
}

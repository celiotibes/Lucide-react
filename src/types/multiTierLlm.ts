/**
 * Multi-Tier LLM Stack Type Definitions
 * Types for 4-Tier intelligent routing API
 */

/**
 * Tipos de tarefa suportadas no roteador inteligente
 */
export type TaskType =
  | 'hermenautica_juridica'
  | 'analise_rapida'
  | 'classificacao_caso'
  | 'busca_jurisprudencia'
  | 'sumarizacao'
  | 'extracao_entidades'
  | 'analise_dados_sensiveis'

/**
 * Tiers de LLM disponíveis
 */
export type LLMTier = 'TIER1_PREMIUM' | 'TIER2_FAST_FREE' | 'TIER3_CHEAP' | 'TIER4_PRIVATE'

/**
 * Provedores de LLM
 */
export type LLMProvider = 'claude' | 'groq' | 'gemini' | 'ollama'

/**
 * Request para análise inteligente
 */
export interface AnalyzeRequest {
  prompt: string
  task_type: TaskType
  is_urgent?: boolean
  allow_premium?: boolean
  temperature?: number
  max_tokens?: number
}

/**
 * Response de análise inteligente
 */
export interface AnalyzeResponse {
  provider: LLMProvider
  response: string
  task_type: TaskType
  tokens_used: number
  cost_usd: number
  latency_ms: number
  confidence: number
  primary_choice: boolean
  fallback_used?: boolean
  model: string
  tier: LLMTier
}

/**
 * Configuração de tier
 */
export interface TierConfig {
  provider: string
  cost: string
  latency: string
  quality: string
  use_case: string
}

/**
 * Configuração completa do multi-tier router
 */
export interface MultiTierConfig {
  cost_aware: boolean
  fallback_enabled: boolean
  default_tier: LLMTier
  tiers: Record<string, TierConfig>
  task_types: Record<TaskType, LLMTier>
}

/**
 * Estatísticas de uso por provider
 */
export interface ProviderStats {
  calls: number
  cost: number
  tokens: number
}

/**
 * Estatísticas de uso do multi-tier router
 */
export interface UsageStats {
  total_calls: number
  total_cost_usd: number
  cost_per_call: number
  by_provider: Record<LLMProvider, ProviderStats>
}

/**
 * Status de saúde do multi-tier router
 */
export interface MultiTierHealth {
  status: 'healthy' | 'unavailable'
  message: string
  router_initialized: boolean
}

/**
 * Resultado de análise com metadata
 */
export interface AnalysisResult {
  content: string
  provider: LLMProvider
  tier: LLMTier
  tokensUsed: number
  costUSD: number
  latencyMs: number
  confidence: number
  isFromFallback: boolean
  model: string
}

/**
 * Histórico de análise
 */
export interface AnalysisHistory {
  id: string
  timestamp: Date
  taskType: TaskType
  prompt: string
  result: AnalysisResult
  isUrgent: boolean
}

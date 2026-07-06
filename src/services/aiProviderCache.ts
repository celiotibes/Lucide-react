/**
 * AI Provider Cache Service - FASE 7 Iteração 2
 * Caching inteligente com ROI-based invalidation
 */

import type { CaseOfUse } from './aiProviderSelector'

interface CacheEntry {
  response: string
  provider: string
  quality: number
  cost: number
  timestamp: number
  ttlMs: number
  hits: number
}

interface CacheMetrics {
  hitRate: number
  totalSavings: number
  hitsByCase: Record<CaseOfUse, number>
  costSavedByCase: Record<CaseOfUse, number>
}

// ROI Analysis: Casos com mais valor em cache (qualidade alta + custo alto)
const CACHE_ROI_CONFIG: Record<CaseOfUse, { enabled: boolean; ttlHours: number; roiScore: number }> = {
  // TIER 1: Alto ROI (caro + usado frequentemente)
  legalAnalysis: {
    enabled: true,
    ttlHours: 24,    // 24h - análises jurídicas reutilizáveis
    roiScore: 0.95,  // Muito alto (Claude caro + alta frequência)
  },

  // TIER 2: Médio-Alto ROI
  ragAnalysis: {
    enabled: true,
    ttlHours: 12,    // 12h - RAG pode ser reutilizado
    roiScore: 0.82,  // Alto (operação cara mesmo com Ollama)
  },

  contraArguments: {
    enabled: true,
    ttlHours: 24,    // 24h - contra-argumentos estáticos reutilizáveis
    roiScore: 0.78,  // Alto (Grok não é tão barato)
  },

  // TIER 3: Médio ROI
  emailExtraction: {
    enabled: true,
    ttlHours: 6,     // 6h - refs mudam conforme emails
    roiScore: 0.65,  // Médio (Gemini já é barato)
  },

  // TIER 4: Baixo ROI (não cachear)
  searchQuery: {
    enabled: false,   // Queries são geralmente únicas
    ttlHours: 0,
    roiScore: 0.40,
  },

  driveSync: {
    enabled: false,   // Metadados mudam constantemente
    ttlHours: 0,
    roiScore: 0.20,
  },

  llmRouting: {
    enabled: false,   // Meta-routing precisa ser fresco
    ttlHours: 0,
    roiScore: 0.15,
  },
}

export class AIProviderCache {
  private cache = new Map<string, CacheEntry>()
  private storageKey = 'lucide_ai_provider_cache'
  private metricsKey = 'lucide_ai_cache_metrics'

  constructor() {
    this.loadFromStorage()
  }

  /**
   * Gera chave de cache baseada em caso de uso + hash do prompt
   */
  private getCacheKey(caseOfUse: CaseOfUse, prompt: string): string {
    // Hash simples do prompt para detecção de duplicatas
    let hash = 0
    for (let i = 0; i < Math.min(prompt.length, 200); i++) {
      hash = ((hash << 5) - hash) + prompt.charCodeAt(i)
      hash = hash & hash // Converter para 32-bit integer
    }
    return `${caseOfUse}:${Math.abs(hash)}`
  }

  /**
   * Recuperar resultado em cache se válido
   */
  get(caseOfUse: CaseOfUse, prompt: string): CacheEntry | null {
    const key = this.getCacheKey(caseOfUse, prompt)
    const entry = this.cache.get(key)

    if (!entry) return null

    // Verificar se ainda está válido (TTL)
    const ageMs = Date.now() - entry.timestamp
    if (ageMs > entry.ttlMs) {
      this.cache.delete(key) // Expirou
      console.log(`⏰ Cache expired for ${key}`)
      return null
    }

    // Validar qualidade (invalida se caiu abaixo de 80)
    if (entry.quality < 80) {
      this.cache.delete(key)
      console.warn(`⚠️ Cache quality degraded (${entry.quality}/100) - invalidated`)
      return null
    }

    // Hit! Atualizar counter
    entry.hits++
    this.saveToStorage()
    return entry
  }

  /**
   * Armazenar resultado em cache (se ROI positivo)
   */
  set(
    caseOfUse: CaseOfUse,
    prompt: string,
    response: string,
    provider: string,
    quality: number,
    cost: number
  ): void {
    const config = CACHE_ROI_CONFIG[caseOfUse]

    // Não cachear se ROI baixo
    if (!config.enabled || config.roiScore < 0.5) {
      return
    }

    const key = this.getCacheKey(caseOfUse, prompt)
    const ttlMs = config.ttlHours * 60 * 60 * 1000

    this.cache.set(key, {
      response,
      provider,
      quality,
      cost,
      timestamp: Date.now(),
      ttlMs,
      hits: 0,
    })

    this.saveToStorage()
    console.log(`💾 Cached: ${key} (TTL: ${config.ttlHours}h, ROI: ${(config.roiScore * 100).toFixed(0)}%)`)
  }

  /**
   * Calcular métricas de cache
   */
  getMetrics(): CacheMetrics {
    const metrics: CacheMetrics = {
      hitRate: 0,
      totalSavings: 0,
      hitsByCase: {
        legalAnalysis: 0,
        emailExtraction: 0,
        searchQuery: 0,
        contraArguments: 0,
        driveSync: 0,
        ragAnalysis: 0,
        llmRouting: 0,
      },
      costSavedByCase: {
        legalAnalysis: 0,
        emailExtraction: 0,
        searchQuery: 0,
        contraArguments: 0,
        driveSync: 0,
        ragAnalysis: 0,
        llmRouting: 0,
      },
    }

    let totalCost = 0
    let totalHits = 0

    const entries = Array.from(this.cache.values())
    for (const entry of entries) {
      totalHits += entry.hits
      totalCost += entry.cost * entry.hits

      // Inferir case of use da chave (formato: caseOfUse:hash)
      const caseOfUse = Object.keys(metrics.hitsByCase).find((c) => entry.provider)
      if (caseOfUse && caseOfUse in metrics.hitsByCase) {
        metrics.hitsByCase[caseOfUse as CaseOfUse] += entry.hits
        metrics.costSavedByCase[caseOfUse as CaseOfUse] += entry.cost * entry.hits
      }
    }

    metrics.hitRate = totalHits > 0 ? (totalHits / (totalHits + this.cache.size)) * 100 : 0
    metrics.totalSavings = totalCost

    return metrics
  }

  /**
   * Limpar cache expirado
   */
  cleanup(): void {
    let removed = 0
    const now = Date.now()
    const entries = Array.from(this.cache.entries())

    for (const [key, entry] of entries) {
      if (now - entry.timestamp > entry.ttlMs) {
        this.cache.delete(key)
        removed++
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cleaned ${removed} expired cache entries`)
      this.saveToStorage()
    }
  }

  /**
   * Salvar cache em localStorage
   */
  private saveToStorage(): void {
    try {
      const data = Array.from(this.cache.entries())
      localStorage.setItem(this.storageKey, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save cache:', error)
    }
  }

  /**
   * Carregar cache de localStorage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey)
      if (!data) return

      const entries = JSON.parse(data) as [string, CacheEntry][]
      for (const [key, entry] of entries) {
        this.cache.set(key, entry)
      }

      console.log(`📂 Loaded ${this.cache.size} cached entries from storage`)
    } catch (error) {
      console.error('Failed to load cache:', error)
    }
  }

  /**
   * Stats em formato human-readable
   */
  printStats(): string {
    const metrics = this.getMetrics()
    const lines = [
      '📊 CACHE STATISTICS',
      '═'.repeat(50),
      `Hit Rate: ${metrics.hitRate.toFixed(1)}%`,
      `Total Savings: $${metrics.totalSavings.toFixed(4)}`,
      `Cached Entries: ${this.cache.size}`,
      '',
      'Hits by Case:',
      ...Object.entries(metrics.hitsByCase)
        .filter(([, hits]) => hits > 0)
        .map(([c, hits]) => `  ${c}: ${hits} hits ($${metrics.costSavedByCase[c as CaseOfUse].toFixed(4)} saved)`),
    ]
    return lines.join('\n')
  }
}

// Singleton export
export const aiProviderCache = new AIProviderCache()

/**
 * AI Provider Auto-Tuning - FASE 7 Iteración 3
 * Ajuste automático de scoring weights baseado em performance histórica
 */

import type { AIProviderName, CaseOfUse } from './aiProviderSelector'

interface ProviderPerformanceRecord {
  provider: AIProviderName
  caseOfUse: CaseOfUse
  quality: number
  cost: number
  latency: number
  success: boolean
  timestamp: number
}

interface ProviderWeights {
  quality: number // 0-1, higher = quality prioritized
  cost: number // 0-1, higher = cost prioritized
  latency: number // 0-1, higher = speed prioritized
}

interface ProviderScore {
  provider: AIProviderName
  score: number
  quality: number
  costScore: number
  latencyScore: number
  weights: ProviderWeights
}

// Default weights (baseline)
const DEFAULT_WEIGHTS: ProviderWeights = {
  quality: 0.5,
  cost: 0.3,
  latency: 0.2,
}

export class AIProviderAutoTuning {
  private performanceHistory: ProviderPerformanceRecord[] = []
  private storageKey = 'lucide_ai_perf_history'
  private weightsKey = 'lucide_ai_tuned_weights'
  private weights: Record<CaseOfUse, ProviderWeights> = {
    legalAnalysis: { ...DEFAULT_WEIGHTS },
    emailExtraction: { ...DEFAULT_WEIGHTS },
    searchQuery: { ...DEFAULT_WEIGHTS },
    contraArguments: { ...DEFAULT_WEIGHTS },
    driveSync: { ...DEFAULT_WEIGHTS },
    ragAnalysis: { ...DEFAULT_WEIGHTS },
    llmRouting: { ...DEFAULT_WEIGHTS },
  }

  constructor() {
    this.loadFromStorage()
  }

  /**
   * Registrar performance de uma chamada do provider
   */
  recordPerformance(
    provider: AIProviderName,
    caseOfUse: CaseOfUse,
    quality: number,
    cost: number,
    latency: number,
    success: boolean = true
  ): void {
    const record: ProviderPerformanceRecord = {
      provider,
      caseOfUse,
      quality,
      cost,
      latency,
      success,
      timestamp: Date.now(),
    }

    this.performanceHistory.push(record)

    // Manter apenas últimas 1000 records para não sobrecarregar
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000)
    }

    // Recalcular pesos periodicamente (a cada 10 records)
    if (this.performanceHistory.length % 10 === 0) {
      this.recalculateWeights()
    }

    this.saveToStorage()
  }

  /**
   * Calcular score para um provider baseado em pesos atualizados
   */
  scoreProvider(
    provider: AIProviderName,
    quality: number,
    cost: number,
    latency: number,
    caseOfUse: CaseOfUse
  ): ProviderScore {
    const weights = this.weights[caseOfUse] || DEFAULT_WEIGHTS

    // Normalizar valores
    const qualityNorm = Math.min(100, Math.max(0, quality)) / 100
    const costNorm = Math.min(1, Math.max(0, 1 - cost * 100000))
    const latencyNorm = Math.min(1, Math.max(0, 1 - latency / 1000))

    // Calcular score com pesos
    const score = (qualityNorm * weights.quality) +
                  (costNorm * weights.cost) +
                  (latencyNorm * weights.latency)

    return {
      provider,
      score: Math.min(1, score),
      quality: qualityNorm,
      costScore: costNorm,
      latencyScore: latencyNorm,
      weights,
    }
  }

  /**
   * Recalcular pesos baseado em histórico de performance
   * Usa média móvel ponderada (recent events têm mais peso)
   */
  private recalculateWeights(): void {
    const caseOfUses: CaseOfUse[] = [
      'legalAnalysis',
      'emailExtraction',
      'searchQuery',
      'contraArguments',
      'driveSync',
      'ragAnalysis',
      'llmRouting',
    ]

    for (const caseOfUse of caseOfUses) {
      const recentRecords = this.performanceHistory
        .filter((r) => r.caseOfUse === caseOfUse && r.success)
        .slice(-50) // Últimas 50 records

      if (recentRecords.length < 5) {
        // Não há dados suficientes para ajuste, manter pesos padrão
        continue
      }

      // Calcular correlação entre cada métrica e sucesso
      // (sucesso = qualidade > 85 AND latência < 2000)
      let qualityImpact = 0
      let costImpact = 0
      let latencyImpact = 0

      for (const record of recentRecords) {
        // Qualidade: mais importante se foi usado depois (hit)
        qualityImpact += record.quality > 80 ? 1 : -0.5

        // Custo: menos impacto se qualidade boa
        costImpact += record.quality > 80 ? 0.2 : 1

        // Latência: importante se rápido e bem-sucedido
        latencyImpact += record.latency < 500 ? 1 : 0.3
      }

      // Normalizar impactos para somar a 1
      const total = Math.abs(qualityImpact) + Math.abs(costImpact) + Math.abs(latencyImpact)
      if (total > 0) {
        this.weights[caseOfUse] = {
          quality: Math.max(0.3, Math.abs(qualityImpact) / total), // Min 30% quality
          cost: Math.abs(costImpact) / total,
          latency: Math.abs(latencyImpact) / total,
        }

        // Normalizar novamente (some a 1)
        const sum = this.weights[caseOfUse].quality +
                   this.weights[caseOfUse].cost +
                   this.weights[caseOfUse].latency
        this.weights[caseOfUse].quality /= sum
        this.weights[caseOfUse].cost /= sum
        this.weights[caseOfUse].latency /= sum

        console.log(
          `🔄 Weights updated for ${caseOfUse}: ` +
          `Q=${this.weights[caseOfUse].quality.toFixed(2)} ` +
          `C=${this.weights[caseOfUse].cost.toFixed(2)} ` +
          `L=${this.weights[caseOfUse].latency.toFixed(2)}`
        )
      }
    }

    this.saveToStorage()
  }

  /**
   * Obter pesos para um caso de uso
   */
  getWeights(caseOfUse: CaseOfUse): ProviderWeights {
    return this.weights[caseOfUse] || DEFAULT_WEIGHTS
  }

  /**
   * Obter relatório de ajustes realizados
   */
  getTuningReport(): string {
    const lines = [
      '🔧 AUTO-TUNING REPORT',
      '═'.repeat(60),
      '',
    ]

    for (const [caseOfUse, weights] of Object.entries(this.weights)) {
      lines.push(`${caseOfUse}:`)
      lines.push(
        `  Quality: ${(weights.quality * 100).toFixed(1)}% | ` +
        `Cost: ${(weights.cost * 100).toFixed(1)}% | ` +
        `Latency: ${(weights.latency * 100).toFixed(1)}%`
      )
    }

    lines.push('')
    lines.push(`Performance records tracked: ${this.performanceHistory.length}`)

    return lines.join('\n')
  }

  /**
   * Resetar pesos aos valores padrão
   */
  resetWeights(): void {
    for (const caseOfUse of Object.keys(this.weights) as CaseOfUse[]) {
      this.weights[caseOfUse] = { ...DEFAULT_WEIGHTS }
    }
    this.saveToStorage()
    console.log('✨ Weights reset to defaults')
  }

  /**
   * Salvar ao localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.weightsKey, JSON.stringify(this.weights))
      const historyStr = JSON.stringify(this.performanceHistory)
      if (historyStr.length < 5_000_000) { // Limite de 5MB
        localStorage.setItem(this.storageKey, historyStr)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('⚠️ Auto-tuning storage quota exceeded')
        this.performanceHistory = this.performanceHistory.slice(-500)
        this.saveToStorage() // Retry com menos dados
      }
    }
  }

  /**
   * Carregar do localStorage
   */
  private loadFromStorage(): void {
    try {
      const weightsData = localStorage.getItem(this.weightsKey)
      if (weightsData) {
        const loaded = JSON.parse(weightsData)
        this.weights = { ...this.weights, ...loaded }
      }

      const historyData = localStorage.getItem(this.storageKey)
      if (historyData) {
        this.performanceHistory = JSON.parse(historyData)
      }
    } catch (error) {
      console.warn('⚠️ Failed to load auto-tuning data')
    }
  }
}

// Singleton export
export const aiProviderAutoTuning = new AIProviderAutoTuning()

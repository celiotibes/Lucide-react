/**
 * AI Provider Monitoring - FASE 7 Iteração 2
 * Alertas e detecção de anomalias em produção
 */

import type { AIProviderName, CaseOfUse } from './aiProviderSelector'

interface MonitoringEvent {
  timestamp: Date
  type: 'fallback' | 'quality_degradation' | 'cost_spike' | 'latency_high' | 'provider_error'
  severity: 'low' | 'medium' | 'high' | 'critical'
  provider: AIProviderName
  caseOfUse: CaseOfUse
  message: string
  metadata: Record<string, any>
}

interface ProviderHealth {
  provider: AIProviderName
  successRate: number
  avgQuality: number
  avgLatency: number
  recentErrors: number
  lastErrorTime?: Date
  status: 'healthy' | 'degraded' | 'unhealthy'
}

interface AnomalyDetection {
  detected: boolean
  type: string
  severity: string
  expectedValue: number
  actualValue: number
  deviation: number // percentage
}

const ALERT_THRESHOLDS = {
  // Quality alerts
  QUALITY_CRITICAL: 75,     // Alerta se < 75%
  QUALITY_WARNING: 85,      // Aviso se < 85%

  // Latency alerts (ms)
  LATENCY_CRITICAL: 2000,   // Crítico se > 2s
  LATENCY_WARNING: 1000,    // Aviso se > 1s

  // Error rate alerts
  ERROR_RATE_CRITICAL: 0.2, // > 20% error rate
  ERROR_RATE_WARNING: 0.1,  // > 10% error rate

  // Cost anomaly detection
  COST_SPIKE_MULTIPLIER: 2.0, // Alert if 2x above average
}

export class AIProviderMonitoring {
  private events: MonitoringEvent[] = []
  private eventsKey = 'lucide_ai_monitoring_events'
  private alerts: string[] = []
  private maxEvents = 1000 // Manter últimos 1000 eventos

  constructor() {
    this.loadEvents()
  }

  /**
   * Registrar evento de monitoramento
   */
  recordEvent(event: Omit<MonitoringEvent, 'timestamp'>): void {
    const monitoringEvent: MonitoringEvent = {
      ...event,
      timestamp: new Date(),
    }

    this.events.push(monitoringEvent)

    // Manter apenas últimos N eventos
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }

    // Processar alerta se necessário
    this.processAlert(monitoringEvent)

    // Salvar
    this.saveEvents()

    // Log
    this.logEvent(monitoringEvent)
  }

  /**
   * Processar e gerar alerta
   */
  private processAlert(event: MonitoringEvent): void {
    let shouldAlert = false
    let alertMessage = ''

    switch (event.type) {
      case 'quality_degradation':
        if (event.metadata.quality < ALERT_THRESHOLDS.QUALITY_CRITICAL) {
          shouldAlert = true
          alertMessage = `🚨 CRITICAL: Quality degradation for ${event.provider} (${event.metadata.quality}/100) on ${event.caseOfUse}`
        } else if (event.metadata.quality < ALERT_THRESHOLDS.QUALITY_WARNING) {
          shouldAlert = true
          alertMessage = `⚠️ WARNING: Quality below threshold for ${event.provider} (${event.metadata.quality}/100)`
        }
        break

      case 'latency_high':
        if (event.metadata.latency > ALERT_THRESHOLDS.LATENCY_CRITICAL) {
          shouldAlert = true
          alertMessage = `🚨 CRITICAL: High latency for ${event.provider} (${event.metadata.latency}ms)`
        } else if (event.metadata.latency > ALERT_THRESHOLDS.LATENCY_WARNING) {
          shouldAlert = true
          alertMessage = `⚠️ WARNING: Elevated latency for ${event.provider} (${event.metadata.latency}ms)`
        }
        break

      case 'provider_error':
        shouldAlert = true
        alertMessage = `❌ ERROR: ${event.provider} failed for ${event.caseOfUse} - ${event.message}`
        break

      case 'fallback':
        shouldAlert = true
        alertMessage = `🔄 FALLBACK: ${event.provider} failed, using fallback`
        break

      case 'cost_spike':
        shouldAlert = true
        alertMessage = `💰 COST SPIKE: Unexpected cost increase - ${event.message}`
        break
    }

    if (shouldAlert) {
      this.alerts.push(alertMessage)
      console.log(alertMessage)
    }
  }

  /**
   * Detectar anomalias baseado em histórico
   */
  detectAnomalies(provider: AIProviderName, metric: string, currentValue: number): AnomalyDetection {
    // Pegar últimos 10 eventos do mesmo provider
    const recentEvents = this.events
      .filter((e) => e.provider === provider && e.metadata[metric] !== undefined)
      .slice(-10)

    if (recentEvents.length < 3) {
      return {
        detected: false,
        type: 'insufficient_data',
        severity: 'low',
        expectedValue: 0,
        actualValue: currentValue,
        deviation: 0,
      }
    }

    // Calcular média
    const avg = recentEvents.reduce((sum, e) => sum + e.metadata[metric], 0) / recentEvents.length
    const deviation = ((currentValue - avg) / avg) * 100

    // Threshold: 50% deviation é anomalia
    if (Math.abs(deviation) > 50) {
      return {
        detected: true,
        type: metric,
        severity: Math.abs(deviation) > 100 ? 'critical' : 'high',
        expectedValue: avg,
        actualValue: currentValue,
        deviation: Math.round(deviation),
      }
    }

    return {
      detected: false,
      type: metric,
      severity: 'low',
      expectedValue: avg,
      actualValue: currentValue,
      deviation: Math.round(deviation),
    }
  }

  /**
   * Calcular saúde de um provider
   */
  getProviderHealth(provider: AIProviderName): ProviderHealth {
    const events = this.events.filter((e) => e.provider === provider && e.type !== 'cost_spike')

    if (events.length === 0) {
      return {
        provider,
        successRate: 1.0,
        avgQuality: 0,
        avgLatency: 0,
        recentErrors: 0,
        status: 'healthy',
      }
    }

    // Calcular métricas
    const errors = events.filter((e) => e.type === 'provider_error').length
    const successRate = 1 - errors / events.length

    const qualityEvents = events.filter((e) => e.metadata.quality !== undefined)
    const avgQuality =
      qualityEvents.length > 0
        ? qualityEvents.reduce((sum, e) => sum + e.metadata.quality, 0) / qualityEvents.length
        : 0

    const latencyEvents = events.filter((e) => e.metadata.latency !== undefined)
    const avgLatency =
      latencyEvents.length > 0
        ? latencyEvents.reduce((sum, e) => sum + e.metadata.latency, 0) / latencyEvents.length
        : 0

    const recentErrorTime = events
      .filter((e) => e.type === 'provider_error')
      .map((e) => e.timestamp)
      .pop()

    // Determinar status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (successRate < 0.8 || avgQuality < ALERT_THRESHOLDS.QUALITY_CRITICAL) {
      status = 'unhealthy'
    } else if (successRate < 0.95 || avgQuality < ALERT_THRESHOLDS.QUALITY_WARNING) {
      status = 'degraded'
    }

    return {
      provider,
      successRate,
      avgQuality,
      avgLatency,
      recentErrors: errors,
      lastErrorTime: recentErrorTime,
      status,
    }
  }

  /**
   * Obter saúde de todos os providers
   */
  getAllProvidersHealth(): ProviderHealth[] {
    const providers: AIProviderName[] = ['claude', 'gemini', 'grok', 'ollama']
    return providers.map((p) => this.getProviderHealth(p))
  }

  /**
   * Recomendações baseadas em saúde
   */
  getRecommendations(): string[] {
    const health = this.getAllProvidersHealth()
    const recommendations: string[] = []

    for (const h of health) {
      if (h.status === 'unhealthy') {
        recommendations.push(`🚨 ${h.provider}: UNHEALTHY - Consider increasing fallback priority`)
      } else if (h.status === 'degraded') {
        recommendations.push(`⚠️ ${h.provider}: DEGRADED - Monitor closely, may need attention`)
      }

      if (h.avgLatency > ALERT_THRESHOLDS.LATENCY_WARNING) {
        recommendations.push(`⏱️ ${h.provider}: High latency (${h.avgLatency.toFixed(0)}ms) - Check network/service`)
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ All providers healthy and performing well')
    }

    return recommendations
  }

  /**
   * Obter alertas recentes
   */
  getRecentAlerts(limit: number = 10): string[] {
    return this.alerts.slice(-limit)
  }

  /**
   * Limpar alertas antigos
   */
  clearOldAlerts(olderThanHours: number = 24): number {
    const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000
    const beforeCount = this.events.length
    this.events = this.events.filter((e) => e.timestamp.getTime() > cutoff)
    this.saveEvents()
    return beforeCount - this.events.length
  }

  /**
   * Gerar relatório de monitoramento
   */
  generateReport(): string {
    const health = this.getAllProvidersHealth()
    const recommendations = this.getRecommendations()

    const lines = [
      '📊 AI PROVIDER HEALTH REPORT',
      '═'.repeat(60),
      '',
      '🏥 Provider Status:',
      ...health.map(
        (h) =>
          `  ${h.provider.padEnd(10)}: ${h.status.padEnd(12)} | Success: ${(h.successRate * 100).toFixed(0)}% | Quality: ${h.avgQuality.toFixed(0)}/100`
      ),
      '',
      '💡 Recommendations:',
      ...recommendations.map((r) => `  ${r}`),
      '',
      `📈 Total Events Tracked: ${this.events.length}`,
      `⏰ Latest Event: ${this.events[this.events.length - 1]?.timestamp.toISOString() || 'None'}`,
    ]

    return lines.join('\n')
  }

  /**
   * Salvar eventos em localStorage
   */
  private saveEvents(): void {
    try {
      const data = this.events.map((e) => ({
        ...e,
        timestamp: e.timestamp.toISOString(),
      }))
      localStorage.setItem(this.eventsKey, JSON.stringify(data))
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'QuotaExceededError') {
          console.warn('⚠️ Monitoring storage quota exceeded - keeping recent events only')
          this.events = this.events.slice(-500) // Keep only 500 events
          this.saveEvents() // Retry save
        } else if (error.name === 'SecurityError' || error.name === 'TypeError') {
          console.warn('⚠️ localStorage unavailable - events will not persist')
        }
      }
    }
  }

  /**
   * Carregar eventos de localStorage
   */
  private loadEvents(): void {
    try {
      const data = localStorage.getItem(this.eventsKey)
      if (!data) return

      this.events = JSON.parse(data).map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }))
    } catch (error) {
      if (error instanceof Error) {
        if (error instanceof SyntaxError) {
          console.warn('⚠️ Corrupted monitoring data - starting fresh')
          this.events = []
        } else if (error.name === 'SecurityError' || error.name === 'TypeError') {
          console.warn('⚠️ localStorage unavailable - monitoring will not persist')
        } else {
          console.error('Failed to load monitoring events:', error)
        }
      }
    }
  }

  /**
   * Log de evento formatado
   */
  private logEvent(event: MonitoringEvent): void {
    const icon =
      event.type === 'fallback'
        ? '🔄'
        : event.type === 'quality_degradation'
          ? '⚠️'
          : event.type === 'provider_error'
            ? '❌'
            : '📊'

    console.log(
      `${icon} [${event.severity.toUpperCase()}] ${event.provider} - ${event.caseOfUse}: ${event.message}`
    )
  }
}

// Singleton export
export const aiProviderMonitoring = new AIProviderMonitoring()

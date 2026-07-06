import { useState, useCallback } from 'react'
import { aiSelector, type CaseOfUse } from '../services/aiProviderSelector'
import { aiProviderCache } from '../services/aiProviderCache'
import { aiProviderMonitoring } from '../services/aiProviderMonitoring'

interface UseAIProviderReturn {
  response: string | null
  loading: boolean
  error: string | null
  provider: string | null
  costUSD: number
  quality: number
  isCached: boolean
  executeAI: (caseOfUse: CaseOfUse, prompt: string) => Promise<void>
  getStats: () => any
  getHealth: () => any
}

export function useAIProvider(): UseAIProviderReturn {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [costUSD, setCostUSD] = useState(0)
  const [quality, setQuality] = useState(0)
  const [isCached, setIsCached] = useState(false)

  const executeAI = useCallback(async (caseOfUse: CaseOfUse, prompt: string) => {
    try {
      setLoading(true)
      setError(null)
      setIsCached(false)

      // Try cache first
      const cached = aiProviderCache.get(caseOfUse, prompt)
      if (cached) {
        setResponse(cached.response)
        setProvider(cached.provider)
        setCostUSD(cached.cost)
        setQuality(cached.quality)
        setIsCached(true)
        console.log(`💾 Cache hit for ${caseOfUse}`)
        return
      }

      // No cache hit - execute with fallback
      const result = await aiSelector.executeWithFallback(caseOfUse, prompt)

      // Estimate quality (in production, would come from API)
      const estimatedQuality = Math.min(100, Math.max(0, 80 + Math.random() * 20))

      setResponse(result.response)
      setProvider(result.provider)
      setCostUSD(result.costUSD)
      setQuality(estimatedQuality)

      // Cache the result
      aiProviderCache.set(caseOfUse, prompt, result.response, result.provider, estimatedQuality, result.costUSD)

      // Record monitoring event
      aiProviderMonitoring.recordEvent({
        type: 'quality_degradation',
        severity: estimatedQuality < 80 ? 'high' : 'low',
        provider: result.provider as any,
        caseOfUse,
        message: `Quality: ${estimatedQuality.toFixed(0)}/100`,
        metadata: { quality: estimatedQuality, latency: 0 },
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(message)

      // Record error event
      aiProviderMonitoring.recordEvent({
        type: 'provider_error',
        severity: 'high',
        provider: 'claude',
        caseOfUse,
        message,
        metadata: { error: message },
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const getStats = useCallback(() => {
    return aiSelector.getStats()
  }, [])

  const getHealth = useCallback(() => {
    return aiProviderMonitoring.getAllProvidersHealth()
  }, [])

  return {
    response,
    loading,
    error,
    provider,
    costUSD,
    quality,
    isCached,
    executeAI,
    getStats,
    getHealth,
  }
}

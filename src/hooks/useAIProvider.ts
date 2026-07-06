import { useState, useCallback } from 'react'
import { aiSelector, type CaseOfUse } from '../services/aiProviderSelector'

interface UseAIProviderReturn {
  response: string | null
  loading: boolean
  error: string | null
  provider: string | null
  costUSD: number
  executeAI: (caseOfUse: CaseOfUse, prompt: string) => Promise<void>
  getStats: () => any
}

export function useAIProvider(): UseAIProviderReturn {
  const [response, setResponse] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [costUSD, setCostUSD] = useState(0)

  const executeAI = useCallback(async (caseOfUse: CaseOfUse, prompt: string) => {
    try {
      setLoading(true)
      setError(null)

      const result = await aiSelector.executeWithFallback(caseOfUse, prompt)

      setResponse(result.response)
      setProvider(result.provider)
      setCostUSD(result.costUSD)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erro desconhecido'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const getStats = useCallback(() => {
    return aiSelector.getStats()
  }, [])

  return {
    response,
    loading,
    error,
    provider,
    costUSD,
    executeAI,
    getStats,
  }
}

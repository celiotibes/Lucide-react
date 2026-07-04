/**
 * useMultiTierLlm Hook
 * Custom hook para integração com 4-Tier LLM Stack
 */

import { useState, useCallback, useEffect } from 'react'
import { getMultiTierLlmClient } from '../services/multiTierLlmClient'
import type {
  AnalyzeRequest,
  AnalysisResult,
  TaskType,
  UsageStats,
  MultiTierConfig,
  MultiTierHealth,
} from '../types/multiTierLlm'

interface UseMultiTierLlmState {
  result: AnalysisResult | null
  loading: boolean
  error: string | null
  stats: UsageStats | null
  config: MultiTierConfig | null
  health: MultiTierHealth | null
}

interface UseMultiTierLlmActions {
  analyze: (request: AnalyzeRequest) => Promise<void>
  analyzeQuick: (prompt: string) => Promise<void>
  analyzeHermenautica: (prompt: string, isUrgent?: boolean) => Promise<void>
  classifyCase: (caseDescription: string) => Promise<void>
  searchJurisprudence: (query: string) => Promise<void>
  summarizeDocument: (content: string, maxTokens?: number) => Promise<void>
  extractEntities: (text: string) => Promise<void>
  analyzeSensitiveData: (data: string) => Promise<void>
  getStats: () => Promise<void>
  resetStats: () => Promise<void>
  getConfig: () => Promise<void>
  checkHealth: () => Promise<void>
  clearResult: () => void
  clearError: () => void
}

interface UseMultiTierLlmReturn extends UseMultiTierLlmState, UseMultiTierLlmActions {}

/**
 * Hook para usar o Multi-Tier LLM Stack
 *
 * Fornece métodos convenientes para análise inteligente com roteamento automático.
 *
 * @example
 * ```tsx
 * const { result, loading, error, analyze } = useMultiTierLlm()
 *
 * const handleAnalyze = async () => {
 *   await analyze({
 *     prompt: 'Analise esta petição...',
 *     task_type: 'hermenautica_juridica',
 *     is_urgent: false
 *   })
 * }
 * ```
 */
export function useMultiTierLlm(): UseMultiTierLlmReturn {
  const [state, setState] = useState<UseMultiTierLlmState>({
    result: null,
    loading: false,
    error: null,
    stats: null,
    config: null,
    health: null,
  })

  const client = getMultiTierLlmClient()

  // Análise genérica
  const analyze = useCallback(
    async (request: AnalyzeRequest) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.analyzeIntelligent(request)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Análise rápida
  const analyzeQuick = useCallback(
    async (prompt: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.analyzeQuick(prompt)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Hermenêutica jurídica
  const analyzeHermenautica = useCallback(
    async (prompt: string, isUrgent: boolean = false) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.analyzeHermenautica(prompt, isUrgent)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Classificação de caso
  const classifyCase = useCallback(
    async (caseDescription: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.classifyCase(caseDescription)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Busca jurisprudência
  const searchJurisprudence = useCallback(
    async (query: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.searchJurisprudence(query)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Sumarizar documento
  const summarizeDocument = useCallback(
    async (content: string, maxTokens: number = 500) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.summarizeDocument(content, maxTokens)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Extrair entidades
  const extractEntities = useCallback(
    async (text: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.extractEntities(text)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Analisar dados sensíveis
  const analyzeSensitiveData = useCallback(
    async (data: string) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const result = await client.analyzeSensitiveData(data)
        setState(prev => ({
          ...prev,
          result,
          loading: false,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
          loading: false,
        }))
      }
    },
    [client]
  )

  // Obter estatísticas
  const getStats = useCallback(async () => {
    try {
      const stats = await client.getStats()
      setState(prev => ({
        ...prev,
        stats,
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao obter estatísticas',
      }))
    }
  }, [client])

  // Resetar estatísticas
  const resetStats = useCallback(async () => {
    try {
      await client.resetStats()
      await getStats()
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao resetar estatísticas',
      }))
    }
  }, [client, getStats])

  // Obter configuração
  const getConfig = useCallback(async () => {
    try {
      const config = await client.getConfig()
      setState(prev => ({
        ...prev,
        config,
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao obter configuração',
      }))
    }
  }, [client])

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const health = await client.health()
      setState(prev => ({
        ...prev,
        health,
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao verificar saúde',
      }))
    }
  }, [client])

  // Limpar resultado
  const clearResult = useCallback(() => {
    setState(prev => ({
      ...prev,
      result: null,
    }))
  }, [])

  // Limpar erro
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }))
  }, [])

  // Verificar health ao montar o componente
  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  return {
    ...state,
    analyze,
    analyzeQuick,
    analyzeHermenautica,
    classifyCase,
    searchJurisprudence,
    summarizeDocument,
    extractEntities,
    analyzeSensitiveData,
    getStats,
    resetStats,
    getConfig,
    checkHealth,
    clearResult,
    clearError,
  }
}

export default useMultiTierLlm

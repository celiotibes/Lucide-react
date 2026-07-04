/**
 * useAdvancedResearch Hook
 * Custom hook para integração com Advanced Research API (RAG + 4-Tier)
 */

import { useState, useCallback, useEffect } from 'react'
import axios from 'axios'

export type ResearchMode = 'rag_enhanced' | 'quick_analysis' | 'hybrid'

interface SourceInfo {
  type: string
  tribunal_info: string
  relevance: number
}

export interface AdvancedSearchResult {
  id: string
  analysis: string
  provider: string
  tier: string
  tokens_used: number
  cost_usd: number
  latency_ms: number
  sources: SourceInfo[]
  confidence: number
  is_fallback: boolean
  created_at: string
}

interface ConversationMessage {
  id: string
  query: string
  analysis: string
  provider: string
  tier: string
  cost_usd: number
  created_at: string
}

export interface ConversationHistory {
  conversation_id: string
  messages: ConversationMessage[]
  total_cost_usd: number
  total_queries: number
}

interface ResearchStatistics {
  total_searches: number
  total_cost_usd: number
  total_tokens: number
  conversations: number
  router_stats: any
}

interface UseAdvancedResearchState {
  result: AdvancedSearchResult | null
  loading: boolean
  error: string | null
  conversation: ConversationHistory | null
  statistics: ResearchStatistics | null
}

interface UseAdvancedResearchActions {
  search: (
    query: string,
    mode?: ResearchMode,
    taskType?: string,
    isUrgent?: boolean,
    conversationId?: string
  ) => Promise<void>
  getConversation: (conversationId: string) => Promise<void>
  deleteConversation: (conversationId: string) => Promise<void>
  getStatistics: () => Promise<void>
  clearAllStatistics: () => Promise<void>
  clearResult: () => void
  clearError: () => void
}

interface UseAdvancedResearchReturn extends UseAdvancedResearchState, UseAdvancedResearchActions {}

/**
 * Hook para usar Advanced Research com RAG + 4-Tier LLM Stack
 *
 * Suporta:
 * - RAG com jurisprudência do Pinecone
 * - Roteamento inteligente 4-Tier
 * - Histórico de conversas
 * - Estatísticas de uso
 *
 * @example
 * ```tsx
 * const { result, loading, error, search } = useAdvancedResearch()
 *
 * const handleSearch = async () => {
 *   await search('Qual a jurisprudência sobre dano moral?', 'hybrid')
 * }
 * ```
 */
export function useAdvancedResearch(): UseAdvancedResearchReturn {
  const [state, setState] = useState<UseAdvancedResearchState>({
    result: null,
    loading: false,
    error: null,
    conversation: null,
    statistics: null,
  })

  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const apiClient = axios.create({
    baseURL: baseURL,
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  // Executar busca avançada
  const search = useCallback(
    async (
      query: string,
      mode: ResearchMode = 'hybrid',
      taskType: string = 'hermenautica_juridica',
      isUrgent: boolean = false,
      conversationId?: string
    ) => {
      setState(prev => ({ ...prev, loading: true, error: null }))
      try {
        const response = await apiClient.post<AdvancedSearchResult>(
          '/api/research/search/advanced',
          {
            query,
            mode,
            task_type: taskType,
            is_urgent: isUrgent,
            conversation_id: conversationId,
          }
        )

        setState(prev => ({
          ...prev,
          result: response.data,
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
    [apiClient]
  )

  // Obter histórico de conversa
  const getConversation = useCallback(
    async (conversationId: string) => {
      try {
        const response = await apiClient.get<ConversationHistory>(
          `/api/research/conversation/${conversationId}`
        )

        setState(prev => ({
          ...prev,
          conversation: response.data,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro ao obter histórico',
        }))
      }
    },
    [apiClient]
  )

  // Deletar conversa
  const deleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await apiClient.delete(`/api/research/conversation/${conversationId}`)

        setState(prev => ({
          ...prev,
          conversation: null,
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Erro ao deletar conversa',
        }))
      }
    },
    [apiClient]
  )

  // Obter estatísticas
  const getStatistics = useCallback(async () => {
    try {
      const response = await apiClient.get<ResearchStatistics>('/api/research/statistics')

      setState(prev => ({
        ...prev,
        statistics: response.data,
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao obter estatísticas',
      }))
    }
  }, [apiClient])

  // Limpar todas as estatísticas
  const clearAllStatistics = useCallback(async () => {
    try {
      await apiClient.post('/api/research/statistics/clear')
      setState(prev => ({
        ...prev,
        statistics: null,
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Erro ao limpar estatísticas',
      }))
    }
  }, [apiClient])

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

  return {
    ...state,
    search,
    getConversation,
    deleteConversation,
    getStatistics,
    clearAllStatistics,
    clearResult,
    clearError,
  }
}

export default useAdvancedResearch

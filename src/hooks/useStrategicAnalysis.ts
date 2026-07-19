/**
 * Strategic Analysis Hook
 * Manages strategic analysis state and AI-powered weakness detection
 */

import { useState, useCallback } from 'react'
import type { StrategicAnalysisResult } from '../types/strategicAnalysis'
import { strategicAnalysisService } from '../services/strategicAnalysisService'

interface UseStrategicAnalysisState {
  result: StrategicAnalysisResult | null
  loading: boolean
  error: string | null
}

export function useStrategicAnalysis() {
  const [state, setState] = useState<UseStrategicAnalysisState>({
    result: null,
    loading: false,
    error: null,
  })

  const analyze = useCallback(async (title: string, content: string, legalArea?: string) => {
    if (!content.trim()) {
      setState((prev) => ({
        ...prev,
        error: 'Conteúdo do documento é obrigatório',
      }))
      return
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result = await strategicAnalysisService.analyzePetition(title, content, legalArea)
      setState((prev) => ({ ...prev, result, loading: false }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }))
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      result: null,
      loading: false,
      error: null,
    })
  }, [])

  return {
    result: state.result,
    loading: state.loading,
    error: state.error,
    analyze,
    reset,
  }
}

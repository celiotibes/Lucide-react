/**
 * Outcome Predictor Hook
 * Manages case outcome prediction state
 */

import { useState, useCallback } from 'react'
import type { CaseOutcomePrediction } from '../types/outcomePredictor'
import { outcomePredictorService } from '../services/outcomePredictorService'

interface UseOutcomePredictorState {
  prediction: CaseOutcomePrediction | null
  loading: boolean
  error: string | null
}

export function useOutcomePredictor() {
  const [state, setState] = useState<UseOutcomePredictorState>({
    prediction: null,
    loading: false,
    error: null,
  })

  const predict = useCallback(
    async (content: string, legalArea: string = '', strengthScore?: number, weaknessScore?: number) => {
      if (!content.trim()) {
        setState((prev) => ({ ...prev, error: 'Conteúdo é obrigatório' }))
        return
      }

      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const prediction = await outcomePredictorService.predictOutcome(
          content,
          legalArea,
          strengthScore,
          weaknessScore
        )
        setState((prev) => ({ ...prev, prediction, loading: false }))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
        setState((prev) => ({ ...prev, error: errorMessage, loading: false }))
      }
    },
    []
  )

  const reset = useCallback(() => {
    setState({
      prediction: null,
      loading: false,
      error: null,
    })
  }, [])

  return {
    prediction: state.prediction,
    loading: state.loading,
    error: state.error,
    predict,
    reset,
  }
}

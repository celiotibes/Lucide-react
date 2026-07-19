/**
 * Jurisprudence Timeline Hook
 * Manages timeline data, filtering, and analysis
 */

import { useState, useCallback } from 'react'
import type { TimelineAnalysis, TimelineFilter } from '../types/jurisprudenceTimeline'
import { jurisprudenceTimelineService } from '../services/jurisprudenceTimelineService'

interface UseTimelineState {
  analysis: TimelineAnalysis | null
  loading: boolean
  error: string | null
  filter: TimelineFilter
}

export function useJurisprudenceTimeline() {
  const [state, setState] = useState<UseTimelineState>({
    analysis: null,
    loading: false,
    error: null,
    filter: {},
  })

  const generateTimeline = useCallback(
    async (legalIssue: string, startYear: number, endYear: number) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const analysis = await jurisprudenceTimelineService.generateTimeline(
          legalIssue,
          startYear,
          endYear,
          state.filter
        )
        setState((prev) => ({ ...prev, analysis, loading: false }))
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        setState((prev) => ({ ...prev, error: errorMessage, loading: false }))
      }
    },
    [state.filter]
  )

  const updateFilter = useCallback((newFilter: Partial<TimelineFilter>) => {
    setState((prev) => ({
      ...prev,
      filter: { ...prev.filter, ...newFilter },
    }))
  }, [])

  const clearFilter = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filter: {},
    }))
  }, [])

  const reset = useCallback(() => {
    setState({
      analysis: null,
      loading: false,
      error: null,
      filter: {},
    })
  }, [])

  return {
    analysis: state.analysis,
    loading: state.loading,
    error: state.error,
    filter: state.filter,
    generateTimeline,
    updateFilter,
    clearFilter,
    reset,
  }
}

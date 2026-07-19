/**
 * useRAG Hook
 * React hook for using RAG service in components
 */

import { useState, useCallback } from 'react'
import { ragService } from '../services/ragService'
import type {
  RAGSearchQuery,
  RAGSearchResult,
  PetitionAnalysisRequest,
  PetitionAnalysisResult,
  ConflictDetection,
  ComparisonAnalysis,
} from '../types/rag'

interface UseRAGState {
  searchResults: RAGSearchResult | null
  analysisResults: PetitionAnalysisResult | null
  conflictDetection: ConflictDetection | null
  comparisonAnalysis: ComparisonAnalysis | null
  loading: boolean
  error: string | null
}

export function useRAG() {
  const [state, setState] = useState<UseRAGState>({
    searchResults: null,
    analysisResults: null,
    conflictDetection: null,
    comparisonAnalysis: null,
    loading: false,
    error: null,
  })

  const searchJurisprudence = useCallback(async (query: RAGSearchQuery) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const results = await ragService.searchJurisprudence(query)
      setState((prev) => ({ ...prev, searchResults: results, loading: false }))
      return results
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      return null
    }
  }, [])

  const searchLegislation = useCallback(async (query: RAGSearchQuery) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const results = await ragService.searchLegislation(query)
      setState((prev) => ({ ...prev, searchResults: results, loading: false }))
      return results
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      return null
    }
  }, [])

  const analyzePetition = useCallback(async (request: PetitionAnalysisRequest) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const results = await ragService.analyzePetition(request)
      setState((prev) => ({ ...prev, analysisResults: results, loading: false }))
      return results
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      return null
    }
  }, [])

  const detectConflicts = useCallback(async (content: string, title: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const results = await ragService.detectConflicts(content, title)
      setState((prev) => ({ ...prev, conflictDetection: results, loading: false }))
      return results
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Conflict detection failed'
      setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
      return null
    }
  }, [])

  const generateCounterArguments = useCallback(
    async (petitionContent: string, petitionTitle: string, jurisprudence: any[]) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const results = await ragService.generateCounterArguments(
          petitionContent,
          petitionTitle,
          jurisprudence
        )
        setState((prev) => ({ ...prev, loading: false }))
        return results
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Counter-argument generation failed'
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
        return null
      }
    },
    []
  )

  const compareAgainstJurisprudence = useCallback(
    async (petitionContent: string, jurisprudence: any[]) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const results = await ragService.compareAgainstJurisprudence(petitionContent, jurisprudence)
        setState((prev) => ({ ...prev, comparisonAnalysis: results, loading: false }))
        return results
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Comparison failed'
        setState((prev) => ({ ...prev, loading: false, error: errorMessage }))
        return null
      }
    },
    []
  )

  const clearResults = useCallback(() => {
    setState({
      searchResults: null,
      analysisResults: null,
      conflictDetection: null,
      comparisonAnalysis: null,
      loading: false,
      error: null,
    })
  }, [])

  return {
    ...state,
    searchJurisprudence,
    searchLegislation,
    analyzePetition,
    detectConflicts,
    generateCounterArguments,
    compareAgainstJurisprudence,
    clearResults,
  }
}

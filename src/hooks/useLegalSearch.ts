/**
 * useLegalSearch Hook
 * Custom hook for legal document search and analysis
 */

import { useState, useCallback } from 'react'
import { legalDataHunterClient } from '../services/legalDataHunter'
import type {
  LegalQuery,
  LegalResult,
  LegalDocument,
  PetitionAnalysis,
  StrategicAnalysis,
  JurisdictionComparison,
} from '../types/legal'

interface UseLegalSearchState {
  results: LegalResult[]
  loading: boolean
  error: string | null
  lastQuery?: LegalQuery
  resultCount: number
}

interface UseLegalSearchAnalysisState {
  petitionAnalysis?: PetitionAnalysis
  strategicAnalysis?: StrategicAnalysis
  jurisdictionComparison?: JurisdictionComparison
  analysisLoading: boolean
  analysisError: string | null
}

/**
 * Hook para pesquisa jurídica
 */
export function useLegalSearch() {
  const [state, setState] = useState<UseLegalSearchState>({
    results: [],
    loading: false,
    error: null,
    resultCount: 0,
  })

  const [analysisState, setAnalysisState] = useState<UseLegalSearchAnalysisState>({
    analysisLoading: false,
    analysisError: null,
  })

  /**
   * Executar pesquisa jurídica
   */
  const search = useCallback(async (query: LegalQuery) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const results = await legalDataHunterClient.search(query)
      setState(prev => ({
        ...prev,
        results,
        loading: false,
        resultCount: results.length,
        lastQuery: query,
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, loading: false, error: errorMessage }))
    }
  }, [])

  /**
   * Pesquisar jurisprudência
   */
  const searchCaseLaw = useCallback(
    async (
      query: string,
      jurisdiction: string,
      filters?: { court?: string, yearFrom?: number, yearTo?: number },
    ) => {
      return search({
        query,
        jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        searchType: 'case_law',
        filters,
      })
    },
    [search],
  )

  /**
   * Pesquisar legislação
   */
  const searchStatutes = useCallback(
    async (
      query: string,
      jurisdiction: string,
      filters?: { yearFrom?: number, yearTo?: number, topic?: string },
    ) => {
      return search({
        query,
        jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        searchType: 'statute',
        filters,
      })
    },
    [search],
  )

  /**
   * Pesquisar doutrina
   */
  const searchDoctrine = useCallback(
    async (query: string, jurisdiction: string) => {
      return search({
        query,
        jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        searchType: 'doctrine',
      })
    },
    [search],
  )

  /**
   * Analisar petição criticamente
   */
  const analyzePetition = useCallback(async (document: LegalDocument) => {
    setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

    try {
      const analysis = await legalDataHunterClient.analyzePetition(document)
      setAnalysisState(prev => ({
        ...prev,
        petitionAnalysis: analysis,
        analysisLoading: false,
      }))
      return analysis
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setAnalysisState(prev => ({ ...prev, analysisLoading: false, analysisError: errorMessage }))
      throw error
    }
  }, [])

  /**
   * Análise estratégica com blindagem e contra-ataques
   */
  const analyzeStrategic = useCallback(
    async (documentId: string, legalArguments: string, jurisdiction: string) => {
      setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

      try {
        const analysis = await legalDataHunterClient.analyzeStrategic(
          documentId,
          legalArguments,
          jurisdiction,
        )
        setAnalysisState(prev => ({
          ...prev,
          strategicAnalysis: analysis,
          analysisLoading: false,
        }))
        return analysis
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setAnalysisState(prev => ({ ...prev, analysisLoading: false, analysisError: errorMessage }))
        throw error
      }
    },
    [],
  )

  /**
   * Comparar jurisdições
   */
  const compareJurisdictions = useCallback(
    async (topic: string, jurisdictions: string[]) => {
      setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

      try {
        const comparison = await legalDataHunterClient.compareJurisdictions(topic, jurisdictions)
        setAnalysisState(prev => ({
          ...prev,
          jurisdictionComparison: comparison,
          analysisLoading: false,
        }))
        return comparison
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setAnalysisState(prev => ({ ...prev, analysisLoading: false, analysisError: errorMessage }))
        throw error
      }
    },
    [],
  )

  /**
   * Limpar resultados
   */
  const clearResults = useCallback(() => {
    setState({
      results: [],
      loading: false,
      error: null,
      resultCount: 0,
    })
  }, [])

  /**
   * Limpar análises
   */
  const clearAnalysis = useCallback(() => {
    setAnalysisState({
      analysisLoading: false,
      analysisError: null,
    })
  }, [])

  return {
    // Search state
    results: state.results,
    loading: state.loading,
    error: state.error,
    resultCount: state.resultCount,
    lastQuery: state.lastQuery,

    // Analysis state
    petitionAnalysis: analysisState.petitionAnalysis,
    strategicAnalysis: analysisState.strategicAnalysis,
    jurisdictionComparison: analysisState.jurisdictionComparison,
    analysisLoading: analysisState.analysisLoading,
    analysisError: analysisState.analysisError,

    // Methods
    search,
    searchCaseLaw,
    searchStatutes,
    searchDoctrine,
    analyzePetition,
    analyzeStrategic,
    compareJurisdictions,
    clearResults,
    clearAnalysis,
  }
}

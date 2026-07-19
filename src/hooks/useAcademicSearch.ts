/**
 * useAcademicSearch Hook
 * Custom hook for academic article search on PubMed
 */

import { useState, useCallback } from 'react'
import { pubmedClient } from '../services/pubmedClient'
import type {
  Article,
  PubmedQuery,
  CitationFormat,
  FormattedCitation,
  RelatedArticles,
  AdvancedSearchQuery,
} from '../types/academic'

interface UseAcademicSearchState {
  articles: Article[]
  loading: boolean
  error: string | null
  lastQuery?: PubmedQuery
  totalResults: number
}

interface UseAcademicSearchAnalysisState {
  relatedArticles?: RelatedArticles
  formattedCitations: FormattedCitation[]
  analysisLoading: boolean
  analysisError: string | null
}

/**
 * Hook para pesquisa acadêmica no PubMed
 */
export function useAcademicSearch() {
  const [state, setState] = useState<UseAcademicSearchState>({
    articles: [],
    loading: false,
    error: null,
    totalResults: 0,
  })

  const [analysisState, setAnalysisState] = useState<UseAcademicSearchAnalysisState>({
    formattedCitations: [],
    analysisLoading: false,
    analysisError: null,
  })

  /**
   * Executar pesquisa de artigos
   */
  const search = useCallback(async (query: PubmedQuery) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = await pubmedClient.search(query)
      setState(prev => ({
        ...prev,
        articles: result.articles,
        loading: false,
        totalResults: result.totalResults,
        lastQuery: query,
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, loading: false, error: errorMessage }))
    }
  }, [])

  /**
   * Pesquisa avançada com operadores booleanos
   */
  const advancedSearch = useCallback(async (query: AdvancedSearchQuery) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const result = await pubmedClient.advancedSearch(query)
      setState(prev => ({
        ...prev,
        articles: result.results,
        loading: false,
        totalResults: result.totalFound,
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, loading: false, error: errorMessage }))
    }
  }, [])

  /**
   * Pesquisar por autor
   */
  const searchByAuthor = useCallback(async (authorName: string, limit = 20) => {
    const query: PubmedQuery = {
      keywords: [authorName],
      limit,
    }
    return search(query)
  }, [search])

  /**
   * Pesquisar por journal
   */
  const searchByJournal = useCallback(
    async (journalName: string, yearFrom?: number, yearTo?: number, limit = 20) => {
      const query: PubmedQuery = {
        keywords: [journalName],
        limit,
        filters: {
          yearFrom,
          yearTo,
        },
      }
      return search(query)
    },
    [search],
  )

  /**
   * Obter artigos relacionados
   */
  const getRelatedArticles = useCallback(async (pmid: string) => {
    setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

    try {
      const related = await pubmedClient.getRelatedArticles(pmid)
      setAnalysisState(prev => ({
        ...prev,
        relatedArticles: related,
        analysisLoading: false,
      }))
      return related
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setAnalysisState(prev => ({ ...prev, analysisLoading: false, analysisError: errorMessage }))
      throw error
    }
  }, [])

  /**
   * Formatar citação
   */
  const formatCitation = useCallback(
    (article: Article, style: CitationFormat): FormattedCitation => {
      const citation = pubmedClient.formatCitation(article, style)

      // Adicionar ao histórico
      setAnalysisState(prev => ({
        ...prev,
        formattedCitations: [...prev.formattedCitations, citation],
      }))

      return citation
    },
    [],
  )

  /**
   * Formatar múltiplas citações
   */
  const formatMultipleCitations = useCallback(
    (articles: Article[], style: CitationFormat): FormattedCitation[] => {
      const citations = articles.map(article => pubmedClient.formatCitation(article, style))

      setAnalysisState(prev => ({
        ...prev,
        formattedCitations: [...prev.formattedCitations, ...citations],
      }))

      return citations
    },
    [],
  )

  /**
   * Limpar resultados de busca
   */
  const clearResults = useCallback(() => {
    setState({
      articles: [],
      loading: false,
      error: null,
      totalResults: 0,
    })
  }, [])

  /**
   * Limpar análises
   */
  const clearAnalysis = useCallback(() => {
    setAnalysisState({
      formattedCitations: [],
      analysisLoading: false,
      analysisError: null,
    })
  }, [])

  /**
   * Limpar tudo
   */
  const clearAll = useCallback(() => {
    clearResults()
    clearAnalysis()
  }, [clearResults, clearAnalysis])

  return {
    // Search state
    articles: state.articles,
    loading: state.loading,
    error: state.error,
    totalResults: state.totalResults,
    lastQuery: state.lastQuery,

    // Analysis state
    relatedArticles: analysisState.relatedArticles,
    formattedCitations: analysisState.formattedCitations,
    analysisLoading: analysisState.analysisLoading,
    analysisError: analysisState.analysisError,

    // Methods
    search,
    advancedSearch,
    searchByAuthor,
    searchByJournal,
    getRelatedArticles,
    formatCitation,
    formatMultipleCitations,
    clearResults,
    clearAnalysis,
    clearAll,
  }
}

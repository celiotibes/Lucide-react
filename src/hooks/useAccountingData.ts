/**
 * useAccountingData Hook
 * Custom hook for accounting, tax, and compliance research
 */

import { useState, useCallback } from 'react'
import { accountingClient } from '../services/accountingClient'
import type {
  AccountingQuery,
  AccountingDocument,
  TaxComplianceAnalysis,
  AuditAnalysis,
  ForensicAccounting,
} from '../types/accounting'

interface UseAccountingDataState {
  documents: AccountingDocument[]
  loading: boolean
  error: string | null
  lastQuery?: AccountingQuery
  totalResults: number
}

interface UseAccountingDataAnalysisState {
  taxCompliance?: TaxComplianceAnalysis
  auditAnalysis?: AuditAnalysis
  forensicAnalysis?: ForensicAccounting
  analysisLoading: boolean
  analysisError: string | null
}

/**
 * Hook para pesquisa contábil, fiscal e de auditoria
 */
export function useAccountingData() {
  const [state, setState] = useState<UseAccountingDataState>({
    documents: [],
    loading: false,
    error: null,
    totalResults: 0,
  })

  const [analysisState, setAnalysisState] = useState<UseAccountingDataAnalysisState>({
    analysisLoading: false,
    analysisError: null,
  })

  /**
   * Pesquisar documentos contábeis
   */
  const search = useCallback(async (query: AccountingQuery) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const results = await accountingClient.search(query)
      setState(prev => ({
        ...prev,
        documents: results,
        loading: false,
        totalResults: results.length,
        lastQuery: query,
      }))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, loading: false, error: errorMessage }))
    }
  }, [])

  /**
   * Pesquisar por tipo específico
   */
  const searchByType = useCallback(
    async (type: string, jurisdiction: string, year: number) => {
      const query: AccountingQuery = {
        type: 'tax',
        jurisdiction: jurisdiction as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        year,
        keywords: [type],
      }
      return search(query)
    },
    [search],
  )

  /**
   * Pesquisar IRPF (Imposto de Renda Pessoa Física)
   */
  const searchIRPF = useCallback(async (year: number) => {
    return searchByType('IRPF', 'BR', year)
  }, [searchByType])

  /**
   * Pesquisar IRPJ (Imposto de Renda Pessoa Jurídica)
   */
  const searchIRPJ = useCallback(async (year: number) => {
    return searchByType('IRPJ', 'BR', year)
  }, [searchByType])

  /**
   * Pesquisar NF-e (Nota Fiscal Eletrônica)
   */
  const searchNFe = useCallback(async (year: number) => {
    return searchByType('NF-e', 'BR', year)
  }, [searchByType])

  /**
   * Pesquisar ECD (Escrituração Contábil Digital)
   */
  const searchECD = useCallback(async (year: number) => {
    return searchByType('ECD', 'BR', year)
  }, [searchByType])

  /**
   * Pesquisar EFD (Escrituração Fiscal Digital)
   */
  const searchEFD = useCallback(async (year: number) => {
    return searchByType('EFD', 'BR', year)
  }, [searchByType])

  /**
   * Pesquisar SPED (Sistema Público de Escrituração Digital)
   */
  const searchSPED = useCallback(async (year: number) => {
    return searchByType('SPED', 'BR', year)
  }, [searchByType])

  /**
   * Analisar conformidade fiscal
   */
  const analyzeTaxCompliance = useCallback(
    async (companyData: {
      name: string
      cnpj: string
      jurisdiction: string
      fiscalYear: number
      documents: Record<string, unknown>
    }) => {
      setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

      try {
        const analysis = await accountingClient.analyzeTaxCompliance(companyData)
        setAnalysisState(prev => ({
          ...prev,
          taxCompliance: analysis,
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
   * Analisar auditoria
   */
  const analyzeAudit = useCallback(
    async (auditData: {
      company: { name: string, cnpj: string, fiscalYear: number }
      auditType: 'external' | 'internal' | 'forensic'
      scope: string
      documents: Record<string, unknown>
    }) => {
      setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

      try {
        const analysis = await accountingClient.analyzeAudit(auditData)
        setAnalysisState(prev => ({
          ...prev,
          auditAnalysis: analysis,
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
   * Análise forense contábil
   */
  const analyzeForensic = useCallback(
    async (caseData: {
      caseId: string
      caseType: 'fraud_investigation' | 'asset_valuation' | 'dispute_resolution'
      investigationScope: string
      documents: Record<string, unknown>
    }) => {
      setAnalysisState(prev => ({ ...prev, analysisLoading: true, analysisError: null }))

      try {
        const analysis = await accountingClient.analyzeForensic(caseData)
        setAnalysisState(prev => ({
          ...prev,
          forensicAnalysis: analysis,
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
   * Limpar resultados
   */
  const clearResults = useCallback(() => {
    setState({
      documents: [],
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
      analysisLoading: false,
      analysisError: null,
    })
  }, [])

  return {
    // Search state
    documents: state.documents,
    loading: state.loading,
    error: state.error,
    totalResults: state.totalResults,
    lastQuery: state.lastQuery,

    // Analysis state
    taxCompliance: analysisState.taxCompliance,
    auditAnalysis: analysisState.auditAnalysis,
    forensicAnalysis: analysisState.forensicAnalysis,
    analysisLoading: analysisState.analysisLoading,
    analysisError: analysisState.analysisError,

    // Methods
    search,
    searchByType,
    searchIRPF,
    searchIRPJ,
    searchNFe,
    searchECD,
    searchEFD,
    searchSPED,
    analyzeTaxCompliance,
    analyzeAudit,
    analyzeForensic,
    clearResults,
    clearAnalysis,
  }
}

/**
 * useJudicialCompliance Hook
 * Integration with Brazilian judicial infrastructure
 */

import { useState, useCallback } from 'react'
import { judicialComplianceService } from '@/services/judicialComplianceService'
import type {
  ProofCorrelationMatrix,
  SemanticMetadataIndex,
  BindingJurisprudenceQuad,
  JudicialComplianceReport,
  JudicialHermeneuticReview,
  CallOutBox,
} from '@/types/judicial'
import type { PetitionAnalysis } from '@/types/legal'

interface UseJudicialComplianceState {
  proofMatrix: ProofCorrelationMatrix | null
  metadataIndex: SemanticMetadataIndex | null
  jurisprudenceQuad: BindingJurisprudenceQuad[]
  callOutBoxes: CallOutBox[]
  complianceReport: JudicialComplianceReport | null
  hermeneuticReview: JudicialHermeneuticReview | null
  loading: boolean
  error: string | null
}

/**
 * Hook para integração com infraestrutura judicial brasileira
 * Gerencia estados e métodos para conformidade com tribunais (TJPR, TJSC, TRF4, etc.)
 */
export function useJudicialCompliance() {
  const [state, setState] = useState<UseJudicialComplianceState>({
    proofMatrix: null,
    metadataIndex: null,
    jurisprudenceQuad: [],
    callOutBoxes: [],
    complianceReport: null,
    hermeneuticReview: null,
    loading: false,
    error: null,
  })

  /**
   * Gera Matriz de Correlação Probatória
   */
  const generateProofMatrix = useCallback(
    async (petitionId: string, evidenceBlocks: any[]) => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const matrix = await judicialComplianceService.generateProofMatrix(
          petitionId,
          evidenceBlocks
        )

        setState(prev => ({
          ...prev,
          proofMatrix: matrix,
          loading: false,
        }))

        return matrix
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        throw error
      }
    },
    []
  )

  /**
   * Extrai Índice de Metadados para IA
   */
  const extractMetadataIndex = useCallback(
    async (petitionId: string, petitionText: string, metadata: any) => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const index = await judicialComplianceService.extractMetadataIndex(
          petitionId,
          petitionText,
          metadata
        )

        setState(prev => ({
          ...prev,
          metadataIndex: index,
          loading: false,
        }))

        return index
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        throw error
      }
    },
    []
  )

  /**
   * Valida citações jurídicas contra repositórios oficiais
   */
  const validateJurisprudence = useCallback(async (citations: string[]) => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const jurisprudence = await judicialComplianceService.validateJurisprudenceCitations(
        citations
      )

      setState(prev => ({
        ...prev,
        jurisprudenceQuad: jurisprudence,
        loading: false,
      }))

      return jurisprudence
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({ ...prev, loading: false, error: errorMessage }))
      throw error
    }
  }, [])

  /**
   * Detecta Prompt Injection em tempo real
   */
  const detectPromptInjection = useCallback(async (pdfContent: string) => {
    try {
      const result = await judicialComplianceService.detectPromptInjection(pdfContent)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error detecting prompt injection:', errorMessage)
      return { riskLevel: 'safe' as const, findings: [] }
    }
  }, [])

  /**
   * Valida compatibilidade com sistema processual (Eproc, PJe, Projudi)
   */
  const validateTrialSystemCompatibility = useCallback(
    async (petitionData: any, targetSystem: 'eproc' | 'pje' | 'projudi') => {
      try {
        const compatibility = await judicialComplianceService.validateTrialSystemCompatibility(
          petitionData,
          targetSystem
        )
        return compatibility
      } catch (error) {
        console.error('Error validating trial system compatibility:', error)
        return 'incompatible' as const
      }
    },
    []
  )

  /**
   * Calcula Risk Score conforme Berna/Atalaia
   */
  const calculateRiskScore = useCallback(async (petitionData: any) => {
    try {
      const result = await judicialComplianceService.calculateBernaAtalaiaRiskScore(
        petitionData
      )
      return result
    } catch (error) {
      console.error('Error calculating risk score:', error)
      return {
        score: 0,
        abusivityLevel: 'low' as const,
        riskFactors: [],
      }
    }
  }, [])

  /**
   * Gera Call-Out boxes para UX Legal
   */
  const generateCallOutBoxes = useCallback(
    (proofMatrix: ProofCorrelationMatrix, jurisprudence: BindingJurisprudenceQuad[]) => {
      try {
        const boxes = judicialComplianceService.generateCallOutBoxes(proofMatrix, jurisprudence)

        setState(prev => ({
          ...prev,
          callOutBoxes: boxes,
        }))

        return boxes
      } catch (error) {
        console.error('Error generating call-out boxes:', error)
        return []
      }
    },
    []
  )

  /**
   * Gera Relatório Completo de Conformidade Judicial
   */
  const generateComplianceReport = useCallback(
    async (
      petitionId: string,
      petitionAnalysis: PetitionAnalysis,
      proofMatrix: ProofCorrelationMatrix,
      metadataIndex: SemanticMetadataIndex,
      jurisprudenceQuad: BindingJurisprudenceQuad[]
    ) => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const report = await judicialComplianceService.generateComplianceReport(
          petitionId,
          petitionAnalysis,
          proofMatrix,
          metadataIndex,
          jurisprudenceQuad
        )

        setState(prev => ({
          ...prev,
          complianceReport: report,
          loading: false,
        }))

        return report
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        throw error
      }
    },
    []
  )

  /**
   * Gera Hermeneutic Review para contexto judicial
   */
  const generateHermeneuticReview = useCallback(
    async (petitionId: string, petitionAnalysis: PetitionAnalysis) => {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const review = await judicialComplianceService.generateJudicialHermeneuticReview(
          petitionId,
          petitionAnalysis
        )

        setState(prev => ({
          ...prev,
          hermeneuticReview: review,
          loading: false,
        }))

        return review
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        setState(prev => ({ ...prev, loading: false, error: errorMessage }))
        throw error
      }
    },
    []
  )

  /**
   * Limpar todos os estados
   */
  const clearAll = useCallback(() => {
    setState({
      proofMatrix: null,
      metadataIndex: null,
      jurisprudenceQuad: [],
      callOutBoxes: [],
      complianceReport: null,
      hermeneuticReview: null,
      loading: false,
      error: null,
    })
  }, [])

  /**
   * Limpar apenas erros
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  return {
    // State
    proofMatrix: state.proofMatrix,
    metadataIndex: state.metadataIndex,
    jurisprudenceQuad: state.jurisprudenceQuad,
    callOutBoxes: state.callOutBoxes,
    complianceReport: state.complianceReport,
    hermeneuticReview: state.hermeneuticReview,
    loading: state.loading,
    error: state.error,

    // Methods
    generateProofMatrix,
    extractMetadataIndex,
    validateJurisprudence,
    detectPromptInjection,
    validateTrialSystemCompatibility,
    calculateRiskScore,
    generateCallOutBoxes,
    generateComplianceReport,
    generateHermeneuticReview,
    clearAll,
    clearError,

    // Helpers
    hasProofMatrix: !!state.proofMatrix,
    hasMetadataIndex: !!state.metadataIndex,
    hasJurisprudence: state.jurisprudenceQuad.length > 0,
    hasComplianceReport: !!state.complianceReport,
    hasHermeneuticReview: !!state.hermeneuticReview,
    isCompliant: state.complianceReport?.promptInjectionRisk.riskLevel === 'safe',
  }
}

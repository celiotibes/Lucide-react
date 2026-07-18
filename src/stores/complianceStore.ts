import { create } from 'zustand'
import { apiService } from '../services/apiClient'

export interface ComplianceMetric {
  id: string
  name: string
  value: number
  target: number
  status: 'compliant' | 'warning' | 'critical'
  description?: string
}

export interface ComplianceState {
  metrics: ComplianceMetric[]
  summary: any
  riskAssessment: any
  auditTrail: any[]
  isLoading: boolean
  error: string | null

  fetchMetrics: () => Promise<void>
  fetchRiskAssessment: () => Promise<void>
  fetchAuditTrail: (params?: any) => Promise<void>
  updateMetricLocal: (id: string, data: Partial<ComplianceMetric>) => void
  clearError: () => void
}

export const useComplianceStore = create<ComplianceState>((set) => ({
  metrics: [],
  summary: null,
  riskAssessment: null,
  auditTrail: [],
  isLoading: false,
  error: null,

  fetchMetrics: async () => {
    set({ isLoading: true, error: null })
    try {
      const [metrics, summary] = await Promise.all([
        apiService.getComplianceMetrics(),
        apiService.getComplianceSummary(),
      ])
      set({ metrics, summary, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch metrics'
      set({
        error: message,
        isLoading: false,
      })
      throw err
    }
  },

  fetchRiskAssessment: async () => {
    try {
      const data = await apiService.getRiskAssessment()
      set({ riskAssessment: data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch risk assessment'
      set({ error: message })
      throw err
    }
  },

  fetchAuditTrail: async (params) => {
    try {
      const data = await apiService.getAuditTrail(params)
      set({ auditTrail: data })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch audit trail'
      set({ error: message })
      throw err
    }
  },

  updateMetricLocal: (id: string, data: Partial<ComplianceMetric>) => {
    set((state) => ({
      metrics: state.metrics.map((m) =>
        m.id === id ? { ...m, ...data } : m
      ),
    }))
  },

  clearError: () => set({ error: null }),
}))

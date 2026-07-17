import { useState, useEffect, useCallback } from 'react'
import { FinancialData, KPIMetric } from '../types/financial'
import { FinancialAnalysisService } from '../services/bi/financialAnalysis'

interface FinancialState {
  data: FinancialData | null
  kpis: KPIMetric[]
  loading: boolean
  error: string | null
}

// Mock financial data for demonstration
const getMockFinancialData = (period: string): FinancialData => {
  const baseRevenue = 1000000
  const variance = Math.random() * 0.2 - 0.1 // ±10% variance

  return {
    period,
    revenue: baseRevenue * (1 + variance),
    cogs: baseRevenue * 0.35 * (1 + variance),
    grossProfit: baseRevenue * 0.65 * (1 + variance),
    operatingExpenses: baseRevenue * 0.3 * (1 + variance),
    ebitda: baseRevenue * 0.35 * (1 + variance),
    interest: baseRevenue * 0.03 * (1 + variance),
    taxes: (baseRevenue * 0.32 - baseRevenue * 0.03) * 0.34 * (1 + variance),
    netIncome: (baseRevenue * 0.35 - baseRevenue * 0.03) * 0.66 * (1 + variance),
  }
}

export function useFinancialData(period?: string) {
  const [state, setState] = useState<FinancialState>({
    data: null,
    kpis: [],
    loading: true,
    error: null,
  })

  const loadData = useCallback(async (targetPeriod: string) => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Try to load from localStorage first
      const stored = localStorage.getItem(`financial_${targetPeriod}`)
      const data = stored ? JSON.parse(stored) : getMockFinancialData(targetPeriod)

      // Calculate KPIs
      const kpis = FinancialAnalysisService.calculateKPIs(data)

      setState({
        data,
        kpis,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Erro ao carregar dados financeiros',
      }))
    }
  }, [])

  useEffect(() => {
    const targetPeriod = period || new Date().toISOString().slice(0, 7)
    loadData(targetPeriod)
  }, [period, loadData])

  const updateData = useCallback((newData: FinancialData) => {
    try {
      localStorage.setItem(`financial_${newData.period}`, JSON.stringify(newData))
      const kpis = FinancialAnalysisService.calculateKPIs(newData)
      setState({
        data: newData,
        kpis,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Erro ao salvar dados',
      }))
    }
  }, [])

  const refreshData = useCallback(async () => {
    const targetPeriod = state.data?.period || new Date().toISOString().slice(0, 7)
    await loadData(targetPeriod)
  }, [state.data?.period, loadData])

  return {
    ...state,
    loadData,
    updateData,
    refreshData,
  }
}

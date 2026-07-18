import { create } from 'zustand'
import { apiService } from '../services/apiClient'

export interface Case {
  id: string
  number: string
  status: 'active' | 'paused' | 'concluded'
  title: string
  description?: string
  deadline: string
  progress: number
  clientName?: string
  judge?: string
  lastUpdate?: string
}

export interface CasesState {
  cases: Case[]
  selectedCase: Case | null
  isLoading: boolean
  error: string | null

  fetchCases: (params?: any) => Promise<void>
  fetchCaseDetail: (id: string) => Promise<Case>
  createCase: (data: any) => Promise<Case>
  updateCase: (id: string, data: any) => Promise<Case>
  updateCaseLocal: (id: string, data: Partial<Case>) => void
  deleteCase: (id: string) => Promise<void>
  selectCase: (caseOrId: Case | string | null) => void
  clearError: () => void
}

export const useCasesStore = create<CasesState>((set) => ({
  cases: [],
  selectedCase: null,
  isLoading: false,
  error: null,

  fetchCases: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiService.getCases(params)
      set({ cases: data, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch cases'
      set({
        error: message,
        isLoading: false,
      })
      throw err
    }
  },

  fetchCaseDetail: async (id: string) => {
    try {
      return await apiService.getCaseDetail(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch case'
      set({ error: message })
      throw err
    }
  },

  createCase: async (data: any) => {
    try {
      return await apiService.createCase(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create case'
      set({ error: message })
      throw err
    }
  },

  updateCase: async (id: string, data: any) => {
    try {
      return await apiService.updateCase(id, data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update case'
      set({ error: message })
      throw err
    }
  },

  updateCaseLocal: (id: string, data: Partial<Case>) => {
    set((state) => ({
      cases: state.cases.map((c) =>
        c.id === id ? { ...c, ...data, lastUpdate: new Date().toISOString() } : c
      ),
      selectedCase:
        state.selectedCase?.id === id
          ? { ...state.selectedCase, ...data, lastUpdate: new Date().toISOString() }
          : state.selectedCase,
    }))
  },

  deleteCase: async (id: string) => {
    try {
      await apiService.deleteCase(id)
      set((state) => ({
        cases: state.cases.filter((c) => c.id !== id),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete case'
      set({ error: message })
      throw err
    }
  },

  selectCase: (caseOrId) => {
    if (!caseOrId) {
      set({ selectedCase: null })
      return
    }

    if (typeof caseOrId === 'string') {
      set((state) => ({
        selectedCase: state.cases.find((c) => c.id === caseOrId) || null,
      }))
    } else {
      set({ selectedCase: caseOrId })
    }
  },

  clearError: () => set({ error: null }),
}))

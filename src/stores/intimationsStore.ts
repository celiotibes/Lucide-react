import { create } from 'zustand'
import { apiService } from '../services/apiClient'

export interface Intimation {
  id: string
  number: string
  status: 'pending' | 'processed' | 'archived'
  title: string
  description?: string
  deadline: string
  confidence?: number
  source?: string
  lastUpdate?: string
}

export interface IntimationsState {
  intimations: Intimation[]
  selectedIntimation: Intimation | null
  isLoading: boolean
  error: string | null

  fetchIntimations: (params?: any) => Promise<void>
  fetchIntimationDetail: (id: string) => Promise<Intimation>
  processIntimation: (id: string) => Promise<void>
  updateIntimationResponse: (id: string, response: any) => Promise<void>
  selectIntimation: (intimationOrId: Intimation | string | null) => void
  clearError: () => void
}

export const useIntimationsStore = create<IntimationsState>((set) => ({
  intimations: [],
  selectedIntimation: null,
  isLoading: false,
  error: null,

  fetchIntimations: async (params) => {
    set({ isLoading: true, error: null })
    try {
      const data = await apiService.getIntimations(params)
      set({ intimations: data, isLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch intimations'
      set({
        error: message,
        isLoading: false,
      })
      throw err
    }
  },

  fetchIntimationDetail: async (id: string) => {
    try {
      return await apiService.getIntimationDetail(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch intimation'
      set({ error: message })
      throw err
    }
  },

  processIntimation: async (id: string) => {
    try {
      await apiService.processIntimation(id)
      set((state) => ({
        intimations: state.intimations.map((i) =>
          i.id === id ? { ...i, status: 'processed' as const } : i
        ),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process intimation'
      set({ error: message })
      throw err
    }
  },

  updateIntimationResponse: async (id: string, response: any) => {
    try {
      await apiService.updateIntimationResponse(id, response)
      set((state) => ({
        intimations: state.intimations.map((i) =>
          i.id === id ? { ...i, status: 'processed' as const } : i
        ),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update response'
      set({ error: message })
      throw err
    }
  },

  selectIntimation: (intimationOrId) => {
    if (!intimationOrId) {
      set({ selectedIntimation: null })
      return
    }

    if (typeof intimationOrId === 'string') {
      set((state) => ({
        selectedIntimation: state.intimations.find((i) => i.id === intimationOrId) || null,
      }))
    } else {
      set({ selectedIntimation: intimationOrId })
    }
  },

  clearError: () => set({ error: null }),
}))

import { create } from 'zustand'
import { apiService, TokenManager, AuthTokens } from '../services/apiClient'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearError: () => void
  initializeAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!TokenManager.getAccessToken(),
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      await apiService.login(email, password)
      const profile = await apiService.getProfile()
      set({
        user: profile,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      set({
        error: message,
        isLoading: false,
        isAuthenticated: false,
      })
      throw err
    }
  },

  logout: async () => {
    set({ isLoading: true })
    try {
      await apiService.logout()
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  refreshUser: async () => {
    try {
      const profile = await apiService.getProfile()
      set({ user: profile, isAuthenticated: true })
    } catch (err) {
      set({ isAuthenticated: false, user: null, error: 'Failed to refresh profile' })
    }
  },

  initializeAuth: () => {
    const hasToken = !!TokenManager.getAccessToken()
    set({ isAuthenticated: hasToken })
  },

  clearError: () => set({ error: null }),
}))

import { create } from 'zustand'
import { getWebSocketService } from '../services/websocketService'
import { Intimation, Case } from '../types'

interface WebSocketState {
  isConnected: boolean
  isConnecting: boolean
  connectionError: string | null
  unreadIntimations: number
  recentIntimationUpdate: Intimation | null
  recentCaseUpdate: Case | null

  connect: () => Promise<void>
  disconnect: () => void
  setIsConnected: (connected: boolean) => void
  setIsConnecting: (connecting: boolean) => void
  setConnectionError: (error: string | null) => void
  setUnreadIntimations: (count: number) => void
  setRecentIntimationUpdate: (intimation: Intimation | null) => void
  setRecentCaseUpdate: (caseItem: Case | null) => void
  incrementUnreadIntimations: () => void
  decrementUnreadIntimations: () => void
  resetUnreadIntimations: () => void
}

const useWebSocketStore = create<WebSocketState>((set) => {
  const ws = getWebSocketService()

  return {
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    unreadIntimations: 0,
    recentIntimationUpdate: null,
    recentCaseUpdate: null,

    connect: async () => {
      set({ isConnecting: true, connectionError: null })
      try {
        await ws.connect()
        set({ isConnected: true, isConnecting: false })

        // Subscribe to events
        ws.subscribeToIntimations()
        ws.subscribeToCases()
        ws.subscribeToCompliance()

        // Listen for updates
        ws.on('intimation:updated', (data) => {
          set({ recentIntimationUpdate: data as Intimation })
          set((state) => ({ unreadIntimations: state.unreadIntimations + 1 }))
        })

        ws.on('case:updated', (data) => {
          set({ recentCaseUpdate: data as Case })
        })

        ws.on('error', (error) => {
          set({ connectionError: String(error) })
        })
      } catch (error) {
        set({
          isConnecting: false,
          isConnected: false,
          connectionError: error instanceof Error ? error.message : 'Connection failed',
        })
      }
    },

    disconnect: () => {
      ws.unsubscribeFromIntimations()
      ws.unsubscribeFromCases()
      ws.unsubscribeFromCompliance()
      ws.disconnect()
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: null,
      })
    },

    setIsConnected: (connected) => set({ isConnected: connected }),
    setIsConnecting: (connecting) => set({ isConnecting: connecting }),
    setConnectionError: (error) => set({ connectionError: error }),
    setUnreadIntimations: (count) => set({ unreadIntimations: count }),
    setRecentIntimationUpdate: (intimation) =>
      set({ recentIntimationUpdate: intimation }),
    setRecentCaseUpdate: (caseItem) => set({ recentCaseUpdate: caseItem }),

    incrementUnreadIntimations: () =>
      set((state) => ({ unreadIntimations: state.unreadIntimations + 1 })),
    decrementUnreadIntimations: () =>
      set((state) => ({
        unreadIntimations: Math.max(0, state.unreadIntimations - 1),
      })),
    resetUnreadIntimations: () => set({ unreadIntimations: 0 }),
  }
})

export default useWebSocketStore

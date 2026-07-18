import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useCallback,
} from 'react'
import useWebSocketStore from '../stores/websocketStore'
import { useAuth } from './AuthContext'

interface WebSocketContextType {
  isConnected: boolean
  isConnecting: boolean
  connectionError: string | null
  unreadIntimations: number
  connect: () => Promise<void>
  disconnect: () => void
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined)

interface WebSocketProviderProps {
  children: ReactNode
  autoConnect?: boolean
}

export function WebSocketProvider({
  children,
  autoConnect = true,
}: WebSocketProviderProps) {
  const { isAuthenticated } = useAuth()
  const {
    isConnected,
    isConnecting,
    connectionError,
    unreadIntimations,
    connect,
    disconnect,
  } = useWebSocketStore()

  useEffect(() => {
    if (autoConnect && isAuthenticated && !isConnected && !isConnecting) {
      connect().catch((error) => {
        console.error('Failed to connect WebSocket:', error)
      })
    }

    return () => {
      if (isConnected) {
        disconnect()
      }
    }
  }, [autoConnect, isAuthenticated, isConnected, isConnecting, connect, disconnect])

  const value: WebSocketContextType = {
    isConnected,
    isConnecting,
    connectionError,
    unreadIntimations,
    connect,
    disconnect,
  }

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within WebSocketProvider')
  }
  return context
}

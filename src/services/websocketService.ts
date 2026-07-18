import { io, Socket } from 'socket.io-client'

export interface WebSocketMessage {
  type: string
  data: unknown
  timestamp: number
}

export interface IntimationUpdate {
  id: string
  status: string
  processedAt?: string
  confidence?: number
}

export interface CaseUpdate {
  id: string
  progress?: number
  status?: string
  lastUpdate?: string
}

export interface ComplianceMetricUpdate {
  id: string
  value: number
  status: string
}

type MessageHandler = (data: unknown) => void

class WebSocketService {
  private socket: Socket | null = null
  private url: string
  private isConnecting = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private handlers: Map<string, Set<MessageHandler>> = new Map()

  constructor(url?: string) {
    this.url = url || (import.meta.env.VITE_API_URL || 'http://localhost:3000')
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve()
        return
      }

      if (this.isConnecting) {
        reject(new Error('Connection attempt already in progress'))
        return
      }

      this.isConnecting = true

      try {
        this.socket = io(this.url, {
          reconnection: true,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: this.maxReconnectAttempts,
          transports: ['websocket', 'polling'],
          auth: {
            token: localStorage.getItem('auth_token') || '',
          },
        })

        this.socket.on('connect', () => {
          this.isConnecting = false
          this.reconnectAttempts = 0
          console.log('✅ WebSocket connected')
          resolve()
        })

        this.socket.on('connect_error', (error) => {
          this.isConnecting = false
          console.error('❌ WebSocket connection error:', error)
          reject(error)
        })

        this.socket.on('disconnect', (reason) => {
          console.warn('⚠️ WebSocket disconnected:', reason)
          if (reason === 'io server disconnect') {
            this.reconnect()
          }
        })

        this.socket.on('error', (error) => {
          console.error('❌ WebSocket error:', error)
        })

        // Generic message handler
        this.socket.on('message', (message: WebSocketMessage) => {
          this.emit('message', message)
        })

        // Intimation events
        this.socket.on('intimation:created', (data) => {
          this.emit('intimation:created', data)
        })

        this.socket.on('intimation:updated', (data: IntimationUpdate) => {
          this.emit('intimation:updated', data)
        })

        this.socket.on('intimation:processed', (data: IntimationUpdate) => {
          this.emit('intimation:processed', data)
        })

        // Case events
        this.socket.on('case:updated', (data: CaseUpdate) => {
          this.emit('case:updated', data)
        })

        this.socket.on('case:completed', (data: CaseUpdate) => {
          this.emit('case:completed', data)
        })

        // Compliance events
        this.socket.on('compliance:metric-updated', (data: ComplianceMetricUpdate) => {
          this.emit('compliance:metric-updated', data)
        })

        // Notification events
        this.socket.on('notification:received', (data) => {
          this.emit('notification:received', data)
        })
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
      console.log('WebSocket disconnected')
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error)
        })
      }, delay)
    } else {
      console.error('Max reconnection attempts reached')
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false
  }

  emit(event: string, data: unknown): void {
    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (error) {
          console.error(`Error in handler for event ${event}:`, error)
        }
      })
    }
  }

  on(event: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }

    const handlers = this.handlers.get(event)!
    handlers.add(handler)

    // Return unsubscribe function
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.handlers.delete(event)
      }
    }
  }

  off(event: string, handler?: MessageHandler): void {
    if (!handler) {
      this.handlers.delete(event)
      return
    }

    const handlers = this.handlers.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.handlers.delete(event)
      }
    }
  }

  // Socket.io specific methods
  send(event: string, data?: unknown, callback?: (response: unknown) => void): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data, callback)
    } else {
      console.warn('WebSocket not connected, cannot send message')
    }
  }

  // Intimation specific methods
  subscribeToIntimations(): void {
    this.send('subscribe:intimations')
  }

  unsubscribeFromIntimations(): void {
    this.send('unsubscribe:intimations')
  }

  processIntimation(intimationId: string): void {
    this.send('intimation:process', { id: intimationId })
  }

  // Case specific methods
  subscribeToCases(): void {
    this.send('subscribe:cases')
  }

  unsubscribeFromCases(): void {
    this.send('unsubscribe:cases')
  }

  // Compliance specific methods
  subscribeToCompliance(): void {
    this.send('subscribe:compliance')
  }

  unsubscribeFromCompliance(): void {
    this.send('unsubscribe:compliance')
  }

  getSocketId(): string | undefined {
    return this.socket?.id
  }
}

// Singleton instance
let instance: WebSocketService | null = null

export function getWebSocketService(): WebSocketService {
  if (!instance) {
    instance = new WebSocketService()
  }
  return instance
}

export function createWebSocketService(url?: string): WebSocketService {
  return new WebSocketService(url)
}

export default WebSocketService

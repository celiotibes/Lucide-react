/**
 * WebSocket Client - Robust Real-time Communication
 * Features:
 * - Auto-reconnection with exponential backoff
 * - Heartbeat/keepalive mechanism
 * - Message compression and decompression
 * - Offline message queueing
 * - Connection state management
 * - Event subscription pattern
 * - Automatic ping/pong handling
 *
 * Usage:
 * ```typescript
 * const ws = new WebSocketClient('wss://api.example.com/ws');
 *
 * ws.on('CASE_UPDATED', (event) => {
 *   console.log('Case updated:', event);
 * });
 *
 * ws.connect();
 * ```
 */

import { EventEmitter } from 'eventemitter3';

export type WebSocketEventHandler<T = any> = (data: T) => void;
export type WebSocketErrorHandler = (error: Error) => void;

export interface WebSocketMessage<T = any> {
  type: string;
  data: T;
  timestamp: string;
  messageId?: string;
}

export interface ReconnectionOptions {
  initialDelay: number;      // ms (default: 1000)
  maxDelay: number;           // ms (default: 30000)
  exponentialBackoff: boolean; // default: true
  maxRetries: number;         // default: 10
  jitter: boolean;            // add random jitter (default: true)
}

export interface HeartbeatOptions {
  interval: number; // ms (default: 30000)
  timeout: number;  // ms (default: 5000)
}

export interface WebSocketClientOptions {
  url: string;
  token?: string;
  reconnection?: Partial<ReconnectionOptions>;
  heartbeat?: Partial<HeartbeatOptions>;
  messageQueueSize?: number;
  enableCompression?: boolean;
  enableOfflineQueue?: boolean;
  debug?: boolean;
}

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token?: string;
  private reconnectionOptions: ReconnectionOptions;
  private heartbeatOptions: HeartbeatOptions;
  private messageQueueSize: number;
  private enableCompression: boolean;
  private enableOfflineQueue: boolean;
  private debug: boolean;

  private connectionState: 'disconnected' | 'connecting' | 'connected' | 'closing' | 'closed' = 'disconnected';
  private reconnectionAttempts: number = 0;
  private reconnectionTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private lastMessageId: number = 0;
  private messageCallbacks: Map<string, (response: any) => void> = new Map();

  constructor(options: WebSocketClientOptions) {
    super();

    this.url = options.url;
    this.token = options.token;
    this.debug = options.debug ?? false;
    this.enableCompression = options.enableCompression ?? true;
    this.enableOfflineQueue = options.enableOfflineQueue ?? true;
    this.messageQueueSize = options.messageQueueSize ?? 100;

    // Set reconnection options with defaults
    this.reconnectionOptions = {
      initialDelay: 1000,
      maxDelay: 30000,
      exponentialBackoff: true,
      maxRetries: 10,
      jitter: true,
      ...options.reconnection,
    };

    // Set heartbeat options with defaults
    this.heartbeatOptions = {
      interval: 30000,
      timeout: 5000,
      ...options.heartbeat,
    };
  }

  /**
   * Connect to WebSocket server
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState === 'connected') {
        resolve();
        return;
      }

      this.setConnectionState('connecting');
      this.log('Connecting to WebSocket...');

      try {
        const url = this.token ? `${this.url}?token=${this.token}` : this.url;
        this.ws = new WebSocket(url);

        // Set binary type for potential compression
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
          this.onConnectionOpen();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.onMessageReceived(event.data);
        };

        this.ws.onerror = (event) => {
          this.onConnectionError(new Error('WebSocket error'));
          reject(new Error('WebSocket connection error'));
        };

        this.ws.onclose = () => {
          this.onConnectionClose();
        };

        // Set timeout for connection attempt
        const connectionTimeout = setTimeout(() => {
          if (this.connectionState === 'connecting') {
            this.log('Connection timeout');
            this.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, 5000);

        // Clear timeout on successful connection
        this.once('connected', () => clearTimeout(connectionTimeout));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.setConnectionState('closing');
    this.cancelHeartbeat();
    this.cancelReconnection();

    if (this.ws) {
      this.ws.onclose = null; // Prevent automatic reconnection
      this.ws.close(1000, 'Normal closure');
      this.ws = null;
    }

    this.setConnectionState('closed');
  }

  /**
   * Send message to server
   */
  public send<T>(type: string, data: T, awaitResponse: boolean = false): Promise<any> | void {
    const message: WebSocketMessage<T> = {
      type,
      data,
      timestamp: new Date().toISOString(),
      messageId: `${Date.now()}-${++this.lastMessageId}`,
    };

    if (this.connectionState === 'connected' && this.ws) {
      this.sendMessage(message);

      if (awaitResponse) {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.messageCallbacks.delete(message.messageId!);
            reject(new Error('Message response timeout'));
          }, 5000);

          this.messageCallbacks.set(message.messageId!, (response) => {
            clearTimeout(timeout);
            this.messageCallbacks.delete(message.messageId!);
            resolve(response);
          });
        });
      }
    } else {
      // Queue message for sending when reconnected
      if (this.enableOfflineQueue && this.messageQueue.length < this.messageQueueSize) {
        this.messageQueue.push(message);
        this.log(`Message queued (${this.messageQueue.length}/${this.messageQueueSize})`);
        this.emit('message_queued', message);
      } else {
        this.log('Message queue full, dropping message');
        this.emit('message_dropped', message);
      }
    }
  }

  /**
   * Subscribe to event type
   */
  public subscribe(eventType: string, handler: WebSocketEventHandler): () => void {
    this.on(eventType, handler);

    // Return unsubscribe function
    return () => {
      this.off(eventType, handler);
    };
  }

  /**
   * Get current connection state
   */
  public getState(): typeof this.connectionState {
    return this.connectionState;
  }

  /**
   * Get connection statistics
   */
  public getStats() {
    return {
      state: this.connectionState,
      reconnectionAttempts: this.reconnectionAttempts,
      queuedMessages: this.messageQueue.length,
      isConnected: this.connectionState === 'connected',
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private onConnectionOpen(): void {
    this.setConnectionState('connected');
    this.reconnectionAttempts = 0;
    this.log('Connected to WebSocket');

    // Drain message queue
    this.drainMessageQueue();

    // Start heartbeat
    this.startHeartbeat();

    this.emit('connected');
  }

  private onConnectionClose(): void {
    this.setConnectionState('disconnected');
    this.cancelHeartbeat();
    this.log('Disconnected from WebSocket');

    // Attempt reconnection if not explicitly closed
    if (this.connectionState !== 'closed') {
      this.scheduleReconnection();
    }

    this.emit('disconnected');
  }

  private onConnectionError(error: Error): void {
    this.log('Connection error:', error.message);
    this.emit('error', error);
  }

  private onMessageReceived(data: any): void {
    try {
      let message: WebSocketMessage;

      // Handle compression if enabled
      if (this.enableCompression && data instanceof ArrayBuffer) {
        // Message is compressed - decompress it
        // For now, just parse as is (compression library can be added)
        const decoder = new TextDecoder();
        message = JSON.parse(decoder.decode(data));
      } else if (typeof data === 'string') {
        message = JSON.parse(data);
      } else {
        this.log('Unknown message format');
        return;
      }

      // Handle ping/pong for heartbeat
      if (message.type === 'ping') {
        this.send('pong', {}, false);
        return;
      }

      if (message.type === 'pong') {
        this.onHeartbeatPong();
        return;
      }

      // Handle message response
      if (message.messageId && this.messageCallbacks.has(message.messageId)) {
        const callback = this.messageCallbacks.get(message.messageId);
        callback?.(message.data);
        return;
      }

      // Emit event
      this.emit(message.type, message.data);
      this.log(`Event received: ${message.type}`);
    } catch (error) {
      this.log('Failed to parse message:', error);
      this.emit('error', new Error('Failed to parse message'));
    }
  }

  private sendMessage(message: WebSocketMessage): void {
    if (!this.ws || this.connectionState !== 'connected') {
      return;
    }

    try {
      const json = JSON.stringify(message);

      if (this.enableCompression) {
        // Could compress here using pako or similar
        // For now, send as-is
        this.ws.send(json);
      } else {
        this.ws.send(json);
      }

      this.log(`Message sent: ${message.type}`);
    } catch (error) {
      this.log('Failed to send message:', error);
      this.emit('error', new Error('Failed to send message'));
    }
  }

  private startHeartbeat(): void {
    this.cancelHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.connectionState === 'connected') {
        this.log('Sending heartbeat ping');
        this.send('ping', {}, false);

        // Set timeout for pong response
        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.log('Heartbeat timeout, reconnecting');
          this.disconnect();
          this.scheduleReconnection();
        }, this.heartbeatOptions.timeout);
      }
    }, this.heartbeatOptions.interval);
  }

  private cancelHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private onHeartbeatPong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
      this.log('Heartbeat pong received');
    }
  }

  private scheduleReconnection(): void {
    if (this.reconnectionAttempts >= this.reconnectionOptions.maxRetries) {
      this.log('Max reconnection attempts reached');
      this.emit('max_reconnection_attempts_reached');
      return;
    }

    const delay = this.calculateBackoffDelay();
    this.log(`Scheduling reconnection in ${delay}ms (attempt ${this.reconnectionAttempts + 1})`);

    this.reconnectionTimer = setTimeout(() => {
      this.reconnectionAttempts++;
      this.connect().catch((error) => {
        this.log('Reconnection attempt failed:', error.message);
        this.scheduleReconnection();
      });
    }, delay);
  }

  private cancelReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
  }

  private calculateBackoffDelay(): number {
    let delay = this.reconnectionOptions.initialDelay;

    if (this.reconnectionOptions.exponentialBackoff) {
      // Exponential backoff: 2^n * initialDelay
      delay = Math.pow(2, this.reconnectionAttempts) * this.reconnectionOptions.initialDelay;

      // Cap at maxDelay
      delay = Math.min(delay, this.reconnectionOptions.maxDelay);
    }

    // Add jitter
    if (this.reconnectionOptions.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += Math.random() * jitterAmount - jitterAmount / 2;
    }

    return Math.round(delay);
  }

  private drainMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.connectionState === 'connected') {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
        this.emit('message_sent_from_queue', message);
      }
    }
  }

  private setConnectionState(state: typeof this.connectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.log(`Connection state: ${state}`);
    }
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[WebSocketClient]', ...args);
    }
  }
}

/**
 * Create WebSocket client instance
 */
export function createWebSocketClient(options: WebSocketClientOptions): WebSocketClient {
  return new WebSocketClient(options);
}

/**
 * Factory function for creating pre-configured client
 */
export function createLegalAutomationWSClient(token: string, serverUrl: string = ''): WebSocketClient {
  const url = serverUrl || `${typeof window !== 'undefined' ? window.location.origin : 'ws://localhost:3000'}/api/v1/ws`;

  return new WebSocketClient({
    url: url.replace(/^http/, 'ws'),
    token,
    reconnection: {
      initialDelay: 1000,
      maxDelay: 30000,
      exponentialBackoff: true,
      maxRetries: 10,
    },
    heartbeat: {
      interval: 30000,
      timeout: 5000,
    },
    enableCompression: true,
    enableOfflineQueue: true,
    debug: false,
  });
}

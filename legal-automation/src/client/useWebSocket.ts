/**
 * React Hook for WebSocket Integration
 * Provides easy integration of real-time features into React components
 *
 * Usage:
 * ```typescript
 * function CaseUpdates() {
 *   const { connected, subscribe, send } = useWebSocket(authToken);
 *
 *   useEffect(() => {
 *     const unsubscribe = subscribe('CASE_UPDATED', (event) => {
 *       console.log('Case updated:', event);
 *     });
 *
 *     return unsubscribe;
 *   }, []);
 *
 *   return (
 *     <div>
 *       Status: {connected ? '✅ Connected' : '❌ Disconnected'}
 *     </div>
 *   );
 * }
 * ```
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WebSocketClient, createLegalAutomationWSClient, WebSocketEventHandler, WebSocketClientOptions } from './WebSocketClient';

export interface UseWebSocketOptions extends Partial<WebSocketClientOptions> {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export interface UseWebSocketReturn {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  error: Error | null;
  stats: ReturnType<WebSocketClient['getStats']>;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: <T>(type: string, data: T, awaitResponse?: boolean) => Promise<any> | void;
  subscribe: (eventType: string, handler: WebSocketEventHandler) => () => void;
  off: (eventType: string, handler: WebSocketEventHandler) => void;
}

/**
 * React Hook for WebSocket
 */
export function useWebSocket(token: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const wsRef = useRef<WebSocketClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<ReturnType<WebSocketClient['getStats']>>({
    state: 'disconnected',
    reconnectionAttempts: 0,
    queuedMessages: 0,
    isConnected: false,
  });

  const autoConnect = options.autoConnect ?? true;

  // Create WebSocket client instance
  const wsClient = useMemo(() => {
    if (!wsRef.current) {
      wsRef.current = createLegalAutomationWSClient(token, options.url);
    }
    return wsRef.current;
  }, [token, options.url]);

  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(wsClient.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, [wsClient]);

  // Set up connection event listeners
  useEffect(() => {
    const handleConnected = () => {
      setConnected(true);
      setConnecting(false);
      setReconnecting(false);
      setError(null);
      options.onConnect?.();
    };

    const handleDisconnected = () => {
      setConnected(false);
      setReconnecting(true);
      options.onDisconnect?.();
    };

    const handleError = (err: Error) => {
      setError(err);
      options.onError?.(err);
    };

    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);
    wsClient.on('error', handleError);

    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
      wsClient.off('error', handleError);
    };
  }, [wsClient, options]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && !connected && !connecting) {
      setConnecting(true);
      wsClient.connect().catch((err) => {
        setError(err);
        setConnecting(false);
      });
    }

    // Cleanup: disconnect on unmount
    return () => {
      // Don't disconnect on unmount to keep connection alive
      // Users can call disconnect() explicitly if needed
    };
  }, [autoConnect, wsClient, connected, connecting]);

  // Memoized connect function
  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await wsClient.connect();
      setConnecting(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connection failed'));
      setConnecting(false);
      throw err;
    }
  }, [wsClient]);

  // Memoized disconnect function
  const disconnect = useCallback(() => {
    wsClient.disconnect();
  }, [wsClient]);

  // Memoized send function
  const send = useCallback(
    <T,>(type: string, data: T, awaitResponse?: boolean) => {
      return wsClient.send(type, data, awaitResponse);
    },
    [wsClient],
  );

  // Memoized subscribe function
  const subscribe = useCallback(
    (eventType: string, handler: WebSocketEventHandler) => {
      return wsClient.subscribe(eventType, handler);
    },
    [wsClient],
  );

  // Memoized off function
  const off = useCallback(
    (eventType: string, handler: WebSocketEventHandler) => {
      wsClient.off(eventType, handler);
    },
    [wsClient],
  );

  return {
    connected,
    connecting,
    reconnecting,
    error,
    stats,
    connect,
    disconnect,
    send,
    subscribe,
    off,
  };
}

/**
 * Hook for subscribing to specific event with automatic cleanup
 *
 * Usage:
 * ```typescript
 * function CaseWidget() {
 *   const { connected } = useWebSocket(token);
 *   const caseData = useWebSocketEvent('CASE_UPDATED', connected);
 *
 *   return <div>{caseData ? JSON.stringify(caseData) : 'No updates'}</div>;
 * }
 * ```
 */
export function useWebSocketEvent<T = any>(
  eventType: string,
  wsClient: WebSocketClient,
  initialData: T | null = null,
): T | null {
  const [data, setData] = useState<T | null>(initialData);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe(eventType, (event: T) => {
      setData(event);
    });

    return unsubscribe;
  }, [eventType, wsClient]);

  return data;
}

/**
 * Hook for subscribing to multiple events
 *
 * Usage:
 * ```typescript
 * function Dashboard() {
 *   const { connected } = useWebSocket(token);
 *   const events = useWebSocketEvents(connected, [
 *     'CASE_UPDATED',
 *     'CONTRACT_SIGNED',
 *     'PAYMENT_RECEIVED'
 *   ]);
 *
 *   useEffect(() => {
 *     console.log('Recent events:', events);
 *   }, [events]);
 * }
 * ```
 */
export function useWebSocketEvents(
  wsClient: WebSocketClient,
  eventTypes: string[],
  maxHistoryPerEvent: number = 10,
): Record<string, any[]> {
  const [events, setEvents] = useState<Record<string, any[]>>(
    eventTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
  );

  useEffect(() => {
    const unsubscribers = eventTypes.map((eventType) =>
      wsClient.subscribe(eventType, (event: any) => {
        setEvents((prev) => ({
          ...prev,
          [eventType]: [event, ...prev[eventType]].slice(0, maxHistoryPerEvent),
        }));
      }),
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [eventType, wsClient, eventTypes, maxHistoryPerEvent]);

  return events;
}

/**
 * Hook for sending messages with loading state
 *
 * Usage:
 * ```typescript
 * function UpdateCase() {
 *   const { send, loading, error } = useSendWebSocketMessage();
 *
 *   const handleUpdate = async () => {
 *     await send('UPDATE_CASE', { caseId: '123', status: 'closed' });
 *   };
 *
 *   return (
 *     <button onClick={handleUpdate} disabled={loading}>
 *       {loading ? 'Updating...' : 'Update Case'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useSendWebSocketMessage(wsClient: WebSocketClient) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(
    async <T,>(type: string, data: T) => {
      setLoading(true);
      setError(null);

      try {
        const response = await wsClient.send(type, data, true);
        setLoading(false);
        return response;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to send message');
        setError(error);
        setLoading(false);
        throw error;
      }
    },
    [wsClient],
  );

  return { send, loading, error };
}

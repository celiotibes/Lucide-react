import { EventEmitter } from 'events';
import { WebSocket, Server as WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';
import { logger } from '@utils/logger';
import {
  WebSocketMessage,
  AnyWebSocketEvent,
  WebSocketConnection,
} from 'websocket';

interface ClientConnection {
  userId: string;
  clientId: string;
  ws: WebSocket;
  connectedAt: Date;
}

export class WebSocketManager extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private connections: Map<string, ClientConnection[]> = new Map();
  private clientConnections: Map<string, ClientConnection> = new Map();

  async initialize(server: HTTPServer): Promise<void> {
    try {
      this.wss = new WebSocketServer({ server });

      this.wss.on('connection', (ws: WebSocket, req) => {
        this.handleNewConnection(ws, req);
      });

      logger.info('✓ WebSocket server initialized');
    } catch (error) {
      logger.error({ err: error }, 'Erro ao inicializar WebSocket server');
      throw error;
    }
  }

  private handleNewConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();
    const url = new URL(`http://localhost${req.url}`);
    const userId = url.searchParams.get('userId');
    const token = url.searchParams.get('token');

    if (!userId || !token) {
      ws.close(1008, 'Missing authentication parameters');
      return;
    }

    const connection: ClientConnection = {
      userId,
      clientId,
      ws,
      connectedAt: new Date(),
    };

    this.clientConnections.set(clientId, connection);

    if (!this.connections.has(userId)) {
      this.connections.set(userId, []);
    }
    this.connections.get(userId)!.push(connection);

    logger.info(
      { clientId, userId, totalConnections: this.connections.get(userId)!.length },
      'Novo cliente WebSocket conectado'
    );

    ws.on('message', (data: string) => this.handleMessage(clientId, data));
    ws.on('close', () => this.handleDisconnect(clientId));
    ws.on('error', (error) => this.handleError(clientId, error));

    this.sendToClient(clientId, {
      type: 'connection',
      data: { clientId, connectedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    } as any);
  }

  private handleMessage(clientId: string, data: string): void {
    try {
      const message = JSON.parse(data);
      logger.debug({ clientId, message }, 'WebSocket message received');
      this.emit('message', { clientId, message });
    } catch (error) {
      logger.error({ clientId, err: error }, 'Erro ao processar mensagem WebSocket');
    }
  }

  private handleDisconnect(clientId: string): void {
    const connection = this.clientConnections.get(clientId);
    if (!connection) return;

    const { userId } = connection;
    const userConnections = this.connections.get(userId) || [];
    const filtered = userConnections.filter((c) => c.clientId !== clientId);

    if (filtered.length === 0) {
      this.connections.delete(userId);
    } else {
      this.connections.set(userId, filtered);
    }

    this.clientConnections.delete(clientId);

    logger.info(
      { clientId, userId, remainingConnections: filtered.length },
      'Cliente WebSocket desconectado'
    );
  }

  private handleError(clientId: string, error: Error): void {
    logger.error({ clientId, err: error }, 'Erro WebSocket');
  }

  sendToUser(userId: string, event: AnyWebSocketEvent): void {
    const message: WebSocketMessage = {
      type: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
      userId,
    };

    const connections = this.connections.get(userId) || [];
    let sentCount = 0;

    for (const connection of connections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.send(JSON.stringify(message), (error) => {
          if (error) {
            logger.error({ userId, clientId: connection.clientId, err: error },
              'Erro ao enviar mensagem WebSocket');
          } else {
            sentCount++;
          }
        });
      }
    }

    if (sentCount === 0 && connections.length > 0) {
      logger.warn({ userId, totalConnections: connections.length },
        'Nenhuma conexão aberta para enviar mensagem');
    }
  }

  sendToClient(clientId: string, event: AnyWebSocketEvent): void {
    const connection = this.clientConnections.get(clientId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ clientId }, 'Cliente não encontrado ou conexão fechada');
      return;
    }

    const message: WebSocketMessage = {
      type: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
      userId: connection.userId,
    };

    connection.ws.send(JSON.stringify(message), (error) => {
      if (error) {
        logger.error({ clientId, err: error }, 'Erro ao enviar mensagem ao cliente');
      }
    });
  }

  broadcastToAllUsers(event: Omit<WebSocketMessage, 'userId'>): void {
    const message = JSON.stringify(event);

    for (const connections of this.connections.values()) {
      for (const connection of connections) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send(message, (error) => {
            if (error) {
              logger.error({ clientId: connection.clientId, err: error },
                'Erro ao enviar broadcast');
            }
          });
        }
      }
    }
  }

  closeConnection(clientId: string): void {
    const connection = this.clientConnections.get(clientId);
    if (connection) {
      connection.ws.close(1000, 'Closed by server');
    }
  }

  closeUserConnections(userId: string): void {
    const connections = this.connections.get(userId) || [];
    for (const connection of connections) {
      connection.ws.close(1000, 'User closed');
    }
  }

  getConnectionStats(): {
    totalUsers: number;
    totalConnections: number;
    userConnectionCounts: Record<string, number>;
  } {
    const userConnectionCounts: Record<string, number> = {};
    let totalConnections = 0;

    for (const [userId, connections] of this.connections) {
      userConnectionCounts[userId] = connections.length;
      totalConnections += connections.length;
    }

    return {
      totalUsers: this.connections.size,
      totalConnections,
      userConnectionCounts,
    };
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  shutdown(): void {
    if (this.wss) {
      for (const connections of this.connections.values()) {
        for (const connection of connections) {
          connection.ws.close(1000, 'Server shutdown');
        }
      }
      this.wss.close();
      logger.info('WebSocket server shutdown complete');
    }
  }
}

export const webSocketManager = new WebSocketManager();

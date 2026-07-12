import { webSocketManager } from '@services/WebSocketManager';
import { eventService, EVENTS } from '@services/EventEmitterService';
import { logger } from '@utils/logger';

// ============================================================================
// WEBSOCKET EVENT SERVICE - Real-time Updates via WebSocket
// ============================================================================

interface RealtimeEvent {
  type: string;
  data: any;
  aggregateId?: string;
  timestamp: string;
}

class WebSocketEventService {
  private eventListeners: Map<string, (event: RealtimeEvent) => void> = new Map();

  initialize(): void {
    // Listen to all application events and broadcast via WebSocket
    Object.values(EVENTS).forEach((eventType: string) => {
      eventService.on(eventType, (payload: any) => {
        this.broadcastEvent(eventType, payload);
      });
    });

    logger.info('WebSocket Event Service initialized');
  }

  private broadcastEvent(eventType: string, payload: any): void {
    const realtimeEvent: RealtimeEvent = {
      type: eventType,
      data: payload,
      aggregateId: payload.id || payload.caseId || payload.contractId,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all connected users
    webSocketManager.broadcastToAllUsers({
      type: 'event',
      data: realtimeEvent,
      timestamp: new Date().toISOString(),
    } as any);

    logger.debug({ eventType, hasAggregateId: !!realtimeEvent.aggregateId }, 'Event broadcast via WebSocket');
  }

  /**
   * Send real-time update to specific user
   */
  notifyUser(userId: string, event: RealtimeEvent): void {
    webSocketManager.sendToUser(userId, {
      type: 'notification',
      data: event,
    } as any);
  }

  /**
   * Notify user about case updates
   */
  notifyCaseUpdate(userId: string, caseId: string, updates: any): void {
    this.notifyUser(userId, {
      type: 'CASE_UPDATED',
      data: { caseId, updates },
      aggregateId: caseId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify user about contract changes
   */
  notifyContractUpdate(userId: string, contractId: string, status: string): void {
    this.notifyUser(userId, {
      type: 'CONTRACT_UPDATED',
      data: { contractId, status },
      aggregateId: contractId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify user about invoice payment
   */
  notifyPaymentReceived(userId: string, invoiceId: string, amount: number): void {
    this.notifyUser(userId, {
      type: 'PAYMENT_RECEIVED',
      data: { invoiceId, amount },
      aggregateId: invoiceId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify user about deadline approaching
   */
  notifyDeadlineApproaching(userId: string, caseId: string, daysRemaining: number): void {
    this.notifyUser(userId, {
      type: 'DEADLINE_APPROACHING',
      data: { caseId, daysRemaining },
      aggregateId: caseId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Notify user about task assignment
   */
  notifyTaskAssigned(userId: string, taskId: string, taskDetails: any): void {
    this.notifyUser(userId, {
      type: 'TASK_ASSIGNED',
      data: { taskId, taskDetails },
      aggregateId: taskId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast system-wide notification
   */
  broadcastSystemNotification(title: string, message: string, severity: 'info' | 'warning' | 'error'): void {
    webSocketManager.broadcastToAllUsers({
      type: 'system_notification',
      data: { title, message, severity },
      timestamp: new Date().toISOString(),
    } as any);
  }

  /**
   * Send analytics update to user
   */
  sendAnalyticsUpdate(userId: string, analytics: any): void {
    this.notifyUser(userId, {
      type: 'ANALYTICS_UPDATE',
      data: analytics,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get real-time connection statistics
   */
  getConnectionStats(): any {
    return webSocketManager.getConnectionStats();
  }

  /**
   * Register a custom event listener
   */
  on(eventType: string, handler: (event: RealtimeEvent) => void): void {
    this.eventListeners.set(eventType, handler);
    logger.debug({ eventType }, 'Custom WebSocket event listener registered');
  }

  /**
   * Unregister event listener
   */
  off(eventType: string): void {
    this.eventListeners.delete(eventType);
    logger.debug({ eventType }, 'Custom WebSocket event listener unregistered');
  }
}

export const webSocketEventService = new WebSocketEventService();

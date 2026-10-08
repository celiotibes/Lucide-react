import { Platform } from 'react-native';

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  type: 'anomaly' | 'document-expiry' | 'transaction-approval' | 'sync-complete';
  data: {
    anomalyId?: string;
    documentId?: string;
    transactionId?: string;
    priority: 'low' | 'normal' | 'high';
    timestamp: string;
  };
}

export interface PushNotificationPermissions {
  granted: boolean;
  ios?: {
    alert: boolean;
    badge: boolean;
    sound: boolean;
  };
  android?: {
    alert: boolean;
    sound: boolean;
  };
}

class PushNotificationService {
  private isInitialized = false;
  private listeners: Map<string, Function[]> = new Map();

  /**
   * Initialize push notifications
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Request permissions
      const hasPermission = await this.requestPermissions();

      if (!hasPermission) {
        console.warn('Push notification permissions not granted');
        return;
      }

      // Setup notification handlers
      this.setupNotificationHandlers();
      this.isInitialized = true;

      console.log('Push notifications initialized');
    } catch (error) {
      console.error('Error initializing push notifications:', error);
      throw error;
    }
  }

  /**
   * Request push notification permissions
   */
  private async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'ios') {
        // For iOS, would use react-native-permissions or expo-notifications
        return true;
      } else {
        // For Android, would use react-native-permissions
        return true;
      }
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Setup notification event handlers
   */
  private setupNotificationHandlers(): void {
    // Setup notification received handler
    // Setup notification response handler (when user taps notification)
    // Setup notification dismissed handler
  }

  /**
   * Send a push notification
   */
  async sendNotification(notification: PushNotification): Promise<void> {
    try {
      if (!this.isInitialized) {
        throw new Error('Push notification service not initialized');
      }

      // Send notification based on type
      switch (notification.type) {
        case 'anomaly':
          await this.sendAnomalyAlert(notification);
          break;
        case 'document-expiry':
          await this.sendDocumentExpiryReminder(notification);
          break;
        case 'transaction-approval':
          await this.sendTransactionApprovalRequest(notification);
          break;
        case 'sync-complete':
          await this.sendSyncCompleteNotification(notification);
          break;
      }

      // Emit event for local listeners
      this.emit('notification:sent', notification);
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  /**
   * Send anomaly alert notification
   */
  private async sendAnomalyAlert(notification: PushNotification): Promise<void> {
    // In production, this would send to native notification system
    console.log('Sending anomaly alert:', {
      title: notification.title,
      body: notification.body,
      priority: notification.data.priority
    });

    // Emit for local listeners
    this.emit('notification:anomaly', notification);
  }

  /**
   * Send document expiry reminder
   */
  private async sendDocumentExpiryReminder(notification: PushNotification): Promise<void> {
    console.log('Sending document expiry reminder:', {
      title: notification.title,
      body: notification.body
    });

    this.emit('notification:document-expiry', notification);
  }

  /**
   * Send transaction approval request
   */
  private async sendTransactionApprovalRequest(notification: PushNotification): Promise<void> {
    console.log('Sending transaction approval request:', {
      title: notification.title,
      body: notification.body
    });

    this.emit('notification:transaction-approval', notification);
  }

  /**
   * Send sync complete notification
   */
  private async sendSyncCompleteNotification(notification: PushNotification): Promise<void> {
    console.log('Sending sync complete notification:', {
      title: notification.title,
      body: notification.body
    });

    this.emit('notification:sync-complete', notification);
  }

  /**
   * Request badge count update
   */
  setBadgeCount(count: number): void {
    try {
      if (Platform.OS === 'ios') {
        // iOS badge setup
      } else {
        // Android notification dot
      }
      console.log('Badge count set to:', count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  /**
   * Get current badge count
   */
  async getBadgeCount(): Promise<number> {
    try {
      if (Platform.OS === 'ios') {
        // Get iOS badge
        return 0;
      } else {
        // Get Android notification count
        return 0;
      }
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    try {
      console.log('Clearing all notifications');
      this.emit('notifications:cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
      throw error;
    }
  }

  /**
   * Get current notification permissions
   */
  async getPermissions(): Promise<PushNotificationPermissions> {
    try {
      if (Platform.OS === 'ios') {
        return {
          granted: true,
          ios: {
            alert: true,
            badge: true,
            sound: true
          }
        };
      } else {
        return {
          granted: true,
          android: {
            alert: true,
            sound: true
          }
        };
      }
    } catch (error) {
      console.error('Error getting notification permissions:', error);
      return { granted: false };
    }
  }

  /**
   * Schedule a notification for later
   */
  async scheduleNotification(
    notification: PushNotification,
    delayMs: number
  ): Promise<string> {
    try {
      const notificationId = `scheduled-${Date.now()}`;
      console.log('Scheduling notification:', {
        id: notificationId,
        delayMs,
        ...notification
      });

      // Schedule notification timer
      setTimeout(() => {
        this.sendNotification(notification);
      }, delayMs);

      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  /**
   * Cancel a scheduled notification
   */
  async cancelNotification(notificationId: string): Promise<void> {
    try {
      console.log('Cancelling notification:', notificationId);
      this.emit('notification:cancelled', { id: notificationId });
    } catch (error) {
      console.error('Error cancelling notification:', error);
      throw error;
    }
  }

  /**
   * Listen to notification events
   */
  on(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    const callbacks = this.listeners.get(event)!;
    callbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Emit notification event
   */
  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Cleanup service
   */
  async cleanup(): Promise<void> {
    try {
      await this.clearAllNotifications();
      this.listeners.clear();
      this.isInitialized = false;
      console.log('Push notification service cleaned up');
    } catch (error) {
      console.error('Error cleaning up push notifications:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();

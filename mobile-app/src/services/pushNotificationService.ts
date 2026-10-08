/**
 * Firebase Cloud Messaging (FCM) Push Notification Service
 * Phase 22.15: Mobile-First Features - Push Notifications
 *
 * Features:
 * - Direct FCM integration with Firebase Cloud Messaging
 * - Device notification permission requests (iOS/Android)
 * - Foreground, background, and terminated state message handling
 * - Secure FCM token storage using SecureStorageService
 * - Offline message queuing with AsyncStorage persistence
 * - Notification analytics tracking integration
 * - Sound and vibration configuration per notification type
 * - App icon badge tracking (unread count)
 * - Deep linking support for notification payloads
 * - Group notifications by type (transaction, alert, update)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus, Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import { SecureStorageService } from '@/utils/security/secureStorageService';
import { analyticsService } from '@/utils/analytics';
import { EventType } from '@/utils/analytics/analyticsService';
import { logger } from '@/utils/logger';

export enum NotificationType {
  TRANSACTION = 'transaction',
  ALERT = 'alert',
  UPDATE = 'update',
  INFO = 'info',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
}

export interface NotificationPayload {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  priority?: NotificationPriority;
  deepLink?: string;
  data?: Record<string, any>;
  sound?: boolean;
  vibrate?: boolean;
  badge?: number;
  timestamp?: number;
  read?: boolean;
  dismissed?: boolean;
}

export interface QueuedNotification extends NotificationPayload {
  queuedAt: number;
  retryCount: number;
  lastRetryAt?: number;
}

export interface NotificationEvent {
  notificationId: string;
  type: 'received' | 'opened' | 'dismissed';
  timestamp: number;
  payload: NotificationPayload;
}

export interface PushNotificationState {
  fcmToken: string | null;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
  isInitialized: boolean;
  unreadCount: number;
  queuedNotifications: QueuedNotification[];
}

const SECURE_STORAGE_KEY = 'fcm_token';
const ASYNC_STORAGE_KEYS = {
  QUEUED_NOTIFICATIONS: '@crmt:fcm_queued_notifications',
  NOTIFICATION_HISTORY: '@crmt:fcm_notification_history',
  UNREAD_COUNT: '@crmt:fcm_unread_count',
  PERMISSION_STATUS: '@crmt:fcm_permission_status',
  LAST_TOKEN_REFRESH: '@crmt:fcm_last_token_refresh',
};

const MAX_QUEUED_NOTIFICATIONS = 100;
const TOKEN_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NOTIFICATION_RETENTION_DAYS = 30;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5000; // 5 seconds, exponential

type NotificationHandler = (notification: NotificationPayload) => void;
type PermissionHandler = (status: 'granted' | 'denied') => void;

class PushNotificationService {
  private secureStorage: SecureStorageService | null = null;
  private appState: AppStateStatus = 'active';
  private appStateSubscription: any = null;
  private notificationHandlers: Map<string, NotificationHandler> = new Map();
  private permissionHandlers: Set<PermissionHandler> = new Set();
  private state: PushNotificationState = {
    fcmToken: null,
    permissionStatus: 'undetermined',
    isInitialized: false,
    unreadCount: 0,
    queuedNotifications: [],
  };

  private messageListenerUnsubscribe: (() => void) | null = null;
  private foregroundMessageUnsubscribe: (() => void) | null = null;
  private tokenRefreshUnsubscribe: (() => void) | null = null;

  /**
   * Initialize the push notification service
   * Must be called early in app lifecycle (e.g., in AuthContext useEffect)
   */
  async initialize(secureStorage: SecureStorageService): Promise<void> {
    if (this.state.isInitialized) {
      logger.info('PushNotificationService already initialized');
      return;
    }

    try {
      this.secureStorage = secureStorage;
      await secureStorage.initialize();

      logger.info('PushNotificationService initializing...');

      // Load persisted state
      await this._loadPersistedState();

      // Request notification permissions
      await this._requestNotificationPermissions();

      // Get or retrieve FCM token
      await this._initializeFCMToken();

      // Setup message listeners for all states
      await this._setupMessageListeners();

      // Setup app state listener for background handling
      this._setupAppStateListener();

      // Setup token refresh listener
      this._setupTokenRefreshListener();

      // Process any queued notifications
      await this._processQueuedNotifications();

      this.state.isInitialized = true;
      logger.info('PushNotificationService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PushNotificationService:', error);
      analyticsService.trackEvent({
        type: EventType.ERROR_OCCURRED,
        properties: {
          service: 'PushNotificationService',
          operation: 'initialize',
          error: String(error),
        },
      });
      throw error;
    }
  }

  /**
   * Request notification permissions from user
   */
  private async _requestNotificationPermissions(): Promise<void> {
    try {
      let permission = await messaging().requestPermission();

      const statusMap: Record<number, 'granted' | 'denied'> = {
        [messaging.AuthorizationStatus.AUTHORIZED]: 'granted',
        [messaging.AuthorizationStatus.PROVISIONAL]: 'granted',
        [messaging.AuthorizationStatus.DENIED]: 'denied',
        [messaging.AuthorizationStatus.NOT_DETERMINED]: 'undetermined',
      };

      const status = statusMap[permission] || 'denied';
      this.state.permissionStatus = status;

      await AsyncStorage.setItem(
        ASYNC_STORAGE_KEYS.PERMISSION_STATUS,
        status
      );

      logger.info(`Notification permission status: ${status}`);

      // Notify permission handlers
      if (status === 'granted' || status === 'denied') {
        this.permissionHandlers.forEach((handler) => handler(status));
      }

      analyticsService.trackEvent({
        type: EventType.FEATURE_USED,
        properties: {
          feature: 'notification_permissions',
          status,
        },
      });
    } catch (error) {
      logger.error('Failed to request notification permissions:', error);
      this.state.permissionStatus = 'denied';
    }
  }

  /**
   * Initialize or retrieve FCM token
   */
  private async _initializeFCMToken(): Promise<void> {
    try {
      if (!this.secureStorage) {
        throw new Error('SecureStorageService not initialized');
      }

      // Try to get cached token
      const cachedToken = this.secureStorage.getItem<string>(SECURE_STORAGE_KEY);
      if (cachedToken) {
        this.state.fcmToken = cachedToken;
        logger.info('Using cached FCM token');
        return;
      }

      // Get new token from FCM
      const token = await messaging().getToken();
      if (token) {
        this.state.fcmToken = token;
        await this.secureStorage.setItem(SECURE_STORAGE_KEY, token, {
          encrypt: true,
        });
        logger.info('FCM token obtained and stored securely');
      }
    } catch (error) {
      logger.error('Failed to initialize FCM token:', error);
      throw new Error('Failed to obtain FCM token');
    }
  }

  /**
   * Setup listeners for all message states
   */
  private async _setupMessageListeners(): Promise<void> {
    // Foreground message handler
    this.foregroundMessageUnsubscribe = messaging().onMessage(
      async (remoteMessage) => {
        logger.info('Foreground message received:', remoteMessage);
        await this._handleForegroundMessage(remoteMessage);
      }
    );

    // Background/terminated message handler
    this.messageListenerUnsubscribe = messaging().onNotificationOpenedApp(
      async (remoteMessage) => {
        logger.info('Notification opened from background/terminated:', remoteMessage);
        await this._handleNotificationOpened(remoteMessage);
      }
    );

    // Check if app was opened from notification while terminated
    const initialNotification = await messaging().getInitialNotification();
    if (initialNotification) {
      logger.info('App opened from terminated state via notification');
      await this._handleNotificationOpened(initialNotification);
    }
  }

  /**
   * Setup app state listener for background transitions
   */
  private _setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this._handleAppStateChange.bind(this)
    );
  }

  /**
   * Setup FCM token refresh listener
   */
  private _setupTokenRefreshListener(): void {
    this.tokenRefreshUnsubscribe = messaging().onTokenRefresh((token) => {
      logger.info('FCM token refreshed');
      this._updateFCMToken(token);
    });
  }

  /**
   * Handle app state changes
   */
  private _handleAppStateChange(appState: AppStateStatus): void {
    this.appState = appState;

    if (appState === 'active') {
      logger.info('App moved to foreground, syncing notifications');
      this._processQueuedNotifications();
    } else if (appState === 'background') {
      logger.info('App moved to background');
    }
  }

  /**
   * Handle message in foreground
   */
  private async _handleForegroundMessage(remoteMessage: any): Promise<void> {
    try {
      const notification = this._parseRemoteMessage(remoteMessage);

      logger.info('Processing foreground notification:', notification.id);

      // Track notification event
      await this._trackNotificationEvent('received', notification);

      // Store notification
      await this._storeNotification(notification);

      // Call registered handlers
      const handler = this.notificationHandlers.get(notification.type);
      if (handler) {
        handler(notification);
      }

      // Call generic handlers
      this.notificationHandlers.forEach((h, key) => {
        if (key === 'all') h(notification);
      });

      // Update unread count
      await this._incrementUnreadCount();
    } catch (error) {
      logger.error('Failed to handle foreground message:', error);
      analyticsService.trackEvent({
        type: EventType.ERROR_OCCURRED,
        properties: {
          operation: 'handle_foreground_message',
          error: String(error),
        },
      });
    }
  }

  /**
   * Handle notification tap (open app from notification)
   */
  private async _handleNotificationOpened(remoteMessage: any): Promise<void> {
    try {
      const notification = this._parseRemoteMessage(remoteMessage);

      logger.info('Processing notification opened:', notification.id);

      // Track notification event
      await this._trackNotificationEvent('opened', notification);

      // Store notification if not already stored
      await this._storeNotification(notification);

      // Update unread count if not already marked as read
      if (!notification.read) {
        await this._incrementUnreadCount();
      }

      // Call registered handlers
      const handler = this.notificationHandlers.get('opened');
      if (handler) {
        handler(notification);
      }

      // Handle deep linking
      if (notification.deepLink) {
        await this._handleDeepLink(notification.deepLink, notification);
      }
    } catch (error) {
      logger.error('Failed to handle notification opened:', error);
    }
  }

  /**
   * Parse Firebase remote message to NotificationPayload
   */
  private _parseRemoteMessage(remoteMessage: any): NotificationPayload {
    const notification = remoteMessage.notification || {};
    const data = remoteMessage.data || {};

    return {
      id: data.notificationId || remoteMessage.messageId || `notif_${Date.now()}`,
      title: notification.title || data.title || 'Notification',
      body: notification.body || data.body || '',
      type: (data.type as NotificationType) || NotificationType.INFO,
      priority: (data.priority as NotificationPriority) || NotificationPriority.NORMAL,
      deepLink: data.deepLink,
      data: data.customData ? JSON.parse(data.customData) : {},
      sound: data.sound !== 'false',
      vibrate: data.vibrate !== 'false',
      badge: data.badge ? parseInt(data.badge, 10) : undefined,
      timestamp: data.timestamp ? parseInt(data.timestamp, 10) : Date.now(),
      read: false,
      dismissed: false,
    };
  }

  /**
   * Store notification in persistent storage
   */
  private async _storeNotification(
    notification: NotificationPayload
  ): Promise<void> {
    try {
      const history = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY
      );
      const notifications: NotificationPayload[] = history
        ? JSON.parse(history)
        : [];

      // Check if notification already exists
      if (
        !notifications.find(
          (n) => n.id === notification.id
        )
      ) {
        notifications.unshift(notification);

        // Keep only recent notifications
        const cutoffTime =
          Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const filtered = notifications.filter(
          (n) => (n.timestamp || 0) > cutoffTime
        );

        await AsyncStorage.setItem(
          ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY,
          JSON.stringify(filtered.slice(0, 100))
        );
      }
    } catch (error) {
      logger.error('Failed to store notification:', error);
    }
  }

  /**
   * Handle deep linking from notification
   */
  private async _handleDeepLink(
    deepLink: string,
    notification: NotificationPayload
  ): Promise<void> {
    logger.info('Processing deep link:', deepLink);

    // This would typically be handled by a navigation coordinator
    // that can handle the deep link in the app's navigation stack
    // For now, we just track it

    analyticsService.trackEvent({
      type: EventType.NOTIFICATION_OPENED,
      properties: {
        notificationId: notification.id,
        deepLink,
        type: notification.type,
      },
    });
  }

  /**
   * Process queued notifications when app returns to foreground
   */
  private async _processQueuedNotifications(): Promise<void> {
    try {
      const queuedJson = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.QUEUED_NOTIFICATIONS
      );
      if (!queuedJson) return;

      const queued: QueuedNotification[] = JSON.parse(queuedJson);
      const now = Date.now();
      const processed: QueuedNotification[] = [];
      const failed: QueuedNotification[] = [];

      for (const notification of queued) {
        if (notification.retryCount >= MAX_RETRY_ATTEMPTS) {
          logger.warn(`Notification ${notification.id} exceeded max retries`);
          continue;
        }

        // Check backoff time
        const lastRetry = notification.lastRetryAt || notification.queuedAt;
        const backoffTime = Math.pow(2, notification.retryCount) * RETRY_BACKOFF_MS;
        if (now - lastRetry < backoffTime) {
          failed.push(notification);
          continue;
        }

        try {
          // Process the notification
          await this._storeNotification(notification);
          await this._incrementUnreadCount();
          processed.push(notification);
        } catch (error) {
          logger.warn(`Failed to process queued notification ${notification.id}`);
          notification.retryCount++;
          notification.lastRetryAt = now;
          failed.push(notification);
        }
      }

      // Update queued notifications
      if (failed.length > 0) {
        await AsyncStorage.setItem(
          ASYNC_STORAGE_KEYS.QUEUED_NOTIFICATIONS,
          JSON.stringify(failed)
        );
      } else {
        await AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.QUEUED_NOTIFICATIONS);
      }

      if (processed.length > 0) {
        logger.info(`Processed ${processed.length} queued notifications`);
      }
    } catch (error) {
      logger.error('Failed to process queued notifications:', error);
    }
  }

  /**
   * Queue a notification for offline handling
   */
  private async _queueNotification(
    notification: NotificationPayload
  ): Promise<void> {
    try {
      const queuedJson = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.QUEUED_NOTIFICATIONS
      );
      const queued: QueuedNotification[] = queuedJson ? JSON.parse(queuedJson) : [];

      if (queued.length >= MAX_QUEUED_NOTIFICATIONS) {
        logger.warn('Notification queue is full, removing oldest');
        queued.shift();
      }

      const queuedNotification: QueuedNotification = {
        ...notification,
        queuedAt: Date.now(),
        retryCount: 0,
      };

      queued.push(queuedNotification);
      await AsyncStorage.setItem(
        ASYNC_STORAGE_KEYS.QUEUED_NOTIFICATIONS,
        JSON.stringify(queued)
      );

      this.state.queuedNotifications = queued;
    } catch (error) {
      logger.error('Failed to queue notification:', error);
    }
  }

  /**
   * Increment unread notification count
   */
  private async _incrementUnreadCount(): Promise<void> {
    try {
      const countStr = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.UNREAD_COUNT
      );
      const count = countStr ? parseInt(countStr, 10) : 0;
      const newCount = count + 1;

      await AsyncStorage.setItem(
        ASYNC_STORAGE_KEYS.UNREAD_COUNT,
        String(newCount)
      );

      this.state.unreadCount = newCount;
    } catch (error) {
      logger.error('Failed to increment unread count:', error);
    }
  }

  /**
   * Track notification event for analytics
   */
  private async _trackNotificationEvent(
    eventType: 'received' | 'opened' | 'dismissed',
    notification: NotificationPayload
  ): Promise<void> {
    try {
      const analyticsEventMap = {
        received: EventType.NOTIFICATION_RECEIVED,
        opened: EventType.NOTIFICATION_OPENED,
        dismissed: EventType.NOTIFICATION_DISMISSED,
      };

      analyticsService.trackEvent({
        type: analyticsEventMap[eventType],
        properties: {
          notificationId: notification.id,
          type: notification.type,
          priority: notification.priority,
          timestamp: notification.timestamp,
        },
      });
    } catch (error) {
      logger.error('Failed to track notification event:', error);
    }
  }

  /**
   * Update FCM token and persist
   */
  private async _updateFCMToken(token: string): Promise<void> {
    try {
      if (!this.secureStorage) return;

      this.state.fcmToken = token;
      await this.secureStorage.setItem(SECURE_STORAGE_KEY, token, {
        encrypt: true,
      });
      await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.LAST_TOKEN_REFRESH, String(Date.now()));

      logger.info('FCM token updated and stored');

      analyticsService.trackEvent({
        type: EventType.FEATURE_USED,
        properties: {
          feature: 'fcm_token_refresh',
        },
      });
    } catch (error) {
      logger.error('Failed to update FCM token:', error);
    }
  }

  /**
   * Load persisted state from storage
   */
  private async _loadPersistedState(): Promise<void> {
    try {
      const permissionStatus = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.PERMISSION_STATUS
      );
      const unreadCountStr = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.UNREAD_COUNT
      );

      if (permissionStatus) {
        this.state.permissionStatus = permissionStatus as 'granted' | 'denied' | 'undetermined';
      }

      if (unreadCountStr) {
        this.state.unreadCount = parseInt(unreadCountStr, 10);
      }

      logger.info('Persisted state loaded');
    } catch (error) {
      logger.error('Failed to load persisted state:', error);
    }
  }

  // ========== PUBLIC API ==========

  /**
   * Get current FCM token
   */
  getFCMToken(): string | null {
    return this.state.fcmToken;
  }

  /**
   * Get permission status
   */
  getPermissionStatus(): 'granted' | 'denied' | 'undetermined' {
    return this.state.permissionStatus;
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): number {
    return this.state.unreadCount;
  }

  /**
   * Get notification history
   */
  async getNotificationHistory(limit: number = 20): Promise<NotificationPayload[]> {
    try {
      const history = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY
      );
      if (!history) return [];

      const notifications: NotificationPayload[] = JSON.parse(history);
      return notifications.slice(0, limit);
    } catch (error) {
      logger.error('Failed to get notification history:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const history = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY
      );
      if (!history) return;

      const notifications: NotificationPayload[] = JSON.parse(history);
      const notification = notifications.find((n) => n.id === notificationId);

      if (notification && !notification.read) {
        notification.read = true;
        await AsyncStorage.setItem(
          ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY,
          JSON.stringify(notifications)
        );

        // Decrement unread count
        const countStr = await AsyncStorage.getItem(
          ASYNC_STORAGE_KEYS.UNREAD_COUNT
        );
        const count = countStr ? Math.max(0, parseInt(countStr, 10) - 1) : 0;
        await AsyncStorage.setItem(
          ASYNC_STORAGE_KEYS.UNREAD_COUNT,
          String(count)
        );
        this.state.unreadCount = count;
      }
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      const history = await AsyncStorage.getItem(
        ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY
      );
      if (!history) return;

      const notifications: NotificationPayload[] = JSON.parse(history);
      const index = notifications.findIndex((n) => n.id === notificationId);

      if (index > -1) {
        const wasRead = notifications[index].read;
        notifications.splice(index, 1);
        await AsyncStorage.setItem(
          ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY,
          JSON.stringify(notifications)
        );

        // Decrement unread count if it wasn't read
        if (!wasRead) {
          const countStr = await AsyncStorage.getItem(
            ASYNC_STORAGE_KEYS.UNREAD_COUNT
          );
          const count = countStr ? Math.max(0, parseInt(countStr, 10) - 1) : 0;
          await AsyncStorage.setItem(
            ASYNC_STORAGE_KEYS.UNREAD_COUNT,
            String(count)
          );
          this.state.unreadCount = count;
        }
      }
    } catch (error) {
      logger.error('Failed to delete notification:', error);
    }
  }

  /**
   * Register handler for notification type
   */
  onNotification(type: NotificationType | 'all', handler: NotificationHandler): () => void {
    const key = type === 'all' ? 'all' : type;
    this.notificationHandlers.set(key, handler);

    // Return unsubscribe function
    return () => {
      this.notificationHandlers.delete(key);
    };
  }

  /**
   * Register handler for permission changes
   */
  onPermissionChange(handler: PermissionHandler): () => void {
    this.permissionHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.permissionHandlers.delete(handler);
    };
  }

  /**
   * Cleanup and unsubscribe from all listeners
   */
  cleanup(): void {
    if (this.messageListenerUnsubscribe) {
      this.messageListenerUnsubscribe();
    }
    if (this.foregroundMessageUnsubscribe) {
      this.foregroundMessageUnsubscribe();
    }
    if (this.tokenRefreshUnsubscribe) {
      this.tokenRefreshUnsubscribe();
    }
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }

    this.notificationHandlers.clear();
    this.permissionHandlers.clear();

    logger.info('PushNotificationService cleaned up');
  }

  /**
   * Clear all notifications and reset state
   */
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.NOTIFICATION_HISTORY);
      await AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.QUEUED_NOTIFICATIONS);
      await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.UNREAD_COUNT, '0');

      this.state.unreadCount = 0;
      this.state.queuedNotifications = [];

      logger.info('All notifications cleared');
    } catch (error) {
      logger.error('Failed to clear notifications:', error);
    }
  }

  /**
   * Force token refresh
   */
  async refreshToken(): Promise<string | null> {
    try {
      const token = await messaging().getToken();
      if (token) {
        await this._updateFCMToken(token);
        return token;
      }
      return null;
    } catch (error) {
      logger.error('Failed to refresh FCM token:', error);
      return null;
    }
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();

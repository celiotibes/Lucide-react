/**
 * useNotifications Hook
 * Phase 22.15: Mobile-First Features - Notifications Hook
 *
 * Provides easy access to push notification service and state
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  pushNotificationService,
  NotificationPayload,
  NotificationType,
  NotificationPriority,
  PushNotificationState,
} from '@/services/pushNotificationService';
import { logger } from '@/utils/logger';

export interface UseNotificationsReturn {
  // State
  unreadCount: number;
  permissionStatus: 'granted' | 'denied' | 'undetermined';
  isInitialized: boolean;
  fcmToken: string | null;

  // Methods
  getNotificationHistory: (limit?: number) => Promise<NotificationPayload[]>;
  markAsRead: (notificationId: string) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  requestPermissions: () => Promise<void>;
  refreshToken: () => Promise<string | null>;

  // Subscriptions
  onNotification: (
    type: NotificationType | 'all',
    handler: (notification: NotificationPayload) => void
  ) => () => void;
  onPermissionChange: (
    handler: (status: 'granted' | 'denied') => void
  ) => () => void;
}

/**
 * Hook to access push notification service and state
 * Must be used within a component that renders after PushNotificationService is initialized
 */
export function useNotifications(): UseNotificationsReturn {
  const [unreadCount, setUnreadCount] = useState(
    pushNotificationService.getUnreadCount()
  );
  const [permissionStatus, setPermissionStatus] = useState(
    pushNotificationService.getPermissionStatus()
  );
  const [isInitialized, setIsInitialized] = useState(
    (pushNotificationService as any).state?.isInitialized ?? false
  );
  const [fcmToken, setFcmToken] = useState(
    pushNotificationService.getFCMToken()
  );

  // Track subscription handlers
  const notificationUnsubscribeRef = useRef<(() => void) | null>(null);
  const permissionUnsubscribeRef = useRef<(() => void) | null>(null);

  const getNotificationHistory = useCallback(
    (limit: number = 20): Promise<NotificationPayload[]> => {
      return pushNotificationService.getNotificationHistory(limit);
    },
    []
  );

  const markAsRead = useCallback(
    async (notificationId: string): Promise<void> => {
      await pushNotificationService.markAsRead(notificationId);
      setUnreadCount(pushNotificationService.getUnreadCount());
    },
    []
  );

  const deleteNotification = useCallback(
    async (notificationId: string): Promise<void> => {
      await pushNotificationService.deleteNotification(notificationId);
      setUnreadCount(pushNotificationService.getUnreadCount());
    },
    []
  );

  const clearAll = useCallback(async (): Promise<void> => {
    await pushNotificationService.clearAll();
    setUnreadCount(0);
  }, []);

  const requestPermissions = useCallback(async (): Promise<void> => {
    // Note: Permission request is typically done during initialization
    // This can be called to re-request if denied
    const status = pushNotificationService.getPermissionStatus();
    setPermissionStatus(status);
  }, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const token = await pushNotificationService.refreshToken();
    setFcmToken(token);
    return token;
  }, []);

  const onNotification = useCallback(
    (
      type: NotificationType | 'all',
      handler: (notification: NotificationPayload) => void
    ): (() => void) => {
      return pushNotificationService.onNotification(type, handler);
    },
    []
  );

  const onPermissionChange = useCallback(
    (handler: (status: 'granted' | 'denied') => void): (() => void) => {
      return pushNotificationService.onPermissionChange(handler);
    },
    []
  );

  // Subscribe to state updates
  useEffect(() => {
    // Subscribe to notification updates
    notificationUnsubscribeRef.current = pushNotificationService.onNotification(
      'all',
      () => {
        // Update unread count when new notification arrives
        setUnreadCount(pushNotificationService.getUnreadCount());
      }
    );

    // Subscribe to permission changes
    permissionUnsubscribeRef.current = pushNotificationService.onPermissionChange(
      (status) => {
        setPermissionStatus(status);
      }
    );

    // Update token
    setFcmToken(pushNotificationService.getFCMToken());
    setIsInitialized((pushNotificationService as any).state?.isInitialized ?? false);

    // Cleanup
    return () => {
      if (notificationUnsubscribeRef.current) {
        notificationUnsubscribeRef.current();
      }
      if (permissionUnsubscribeRef.current) {
        permissionUnsubscribeRef.current();
      }
    };
  }, []);

  return {
    unreadCount,
    permissionStatus,
    isInitialized,
    fcmToken,
    getNotificationHistory,
    markAsRead,
    deleteNotification,
    clearAll,
    requestPermissions,
    refreshToken,
    onNotification,
    onPermissionChange,
  };
}

/**
 * Hook to handle notifications of a specific type
 */
export function useNotificationListener(
  type: NotificationType | 'all',
  callback: (notification: NotificationPayload) => void
): void {
  useEffect(() => {
    const unsubscribe = pushNotificationService.onNotification(type, callback);
    return unsubscribe;
  }, [type, callback]);
}

/**
 * Hook to track unread notification count
 */
export function useUnreadNotifications(): number {
  const [unreadCount, setUnreadCount] = useState(
    pushNotificationService.getUnreadCount()
  );

  useEffect(() => {
    // Update when notifications change
    const unsubscribe = pushNotificationService.onNotification('all', () => {
      setUnreadCount(pushNotificationService.getUnreadCount());
    });

    return unsubscribe;
  }, []);

  return unreadCount;
}

/**
 * Hook to track FCM token changes
 */
export function useFCMToken(): string | null {
  const [token, setToken] = useState(pushNotificationService.getFCMToken());

  useEffect(() => {
    // Initial token
    setToken(pushNotificationService.getFCMToken());

    // Subscribe to token refresh
    const unsubscribe = pushNotificationService.onPermissionChange(() => {
      setToken(pushNotificationService.getFCMToken());
    });

    return unsubscribe;
  }, []);

  return token;
}

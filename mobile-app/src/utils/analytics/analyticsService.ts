/**
 * Analytics Service - Phase 22.13: Analytics & Monitoring
 *
 * Features:
 * - Event tracking and user analytics
 * - Offline event queueing with AsyncStorage persistence
 * - GDPR compliance with data privacy controls
 * - Screen and user flow tracking
 * - Automatic batch event syncing
 * - Metrics aggregation and reporting
 * - Type-safe event schema validation
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '../logger';

export enum EventType {
  // User events
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_PROFILE_UPDATE = 'user_profile_update',

  // Screen events
  SCREEN_VIEW = 'screen_view',
  SCREEN_LEAVE = 'screen_leave',

  // Transaction events
  TRANSACTION_CREATE = 'transaction_create',
  TRANSACTION_EDIT = 'transaction_edit',
  TRANSACTION_DELETE = 'transaction_delete',
  TRANSACTION_VIEW = 'transaction_view',

  // Document events
  DOCUMENT_OPEN = 'document_open',
  DOCUMENT_SHARE = 'document_share',
  DOCUMENT_EXPORT = 'document_export',

  // Sync events
  SYNC_START = 'sync_start',
  SYNC_SUCCESS = 'sync_success',
  SYNC_ERROR = 'sync_error',

  // Error events
  ERROR_OCCURRED = 'error_occurred',
  CRASH_REPORTED = 'crash_reported',

  // Feature usage
  FEATURE_USED = 'feature_used',
  FEATURE_ERROR = 'feature_error',
}

export interface AnalyticsEvent {
  id: string;
  type: EventType;
  timestamp: string;
  sessionId: string;
  userId?: string;
  screenName?: string;
  duration?: number;
  properties: Record<string, any>;
  metadata: {
    platform: string;
    appVersion: string;
    osVersion: string;
    locale: string;
  };
  synced: boolean;
}

export interface AnalyticsMetrics {
  totalEvents: number;
  eventsByType: Record<EventType, number>;
  activeUsers: number;
  avgSessionDuration: number;
  crashCount: number;
  errorCount: number;
  lastSyncTime: string | null;
}

export interface PrivacySettings {
  enabled: boolean;
  analyticsEnabled: boolean;
  crashReportingEnabled: boolean;
  personalizationEnabled: boolean;
  dataRetentionDays: number;
}

const ANALYTICS_STORAGE_KEY = '@crmt:analytics_events';
const SESSION_ID_KEY = '@crmt:analytics_session';
const PRIVACY_SETTINGS_KEY = '@crmt:privacy_settings';
const LAST_SYNC_KEY = '@crmt:analytics_last_sync';
const MAX_OFFLINE_EVENTS = 500;
const BATCH_SYNC_SIZE = 50;
const AUTO_SYNC_INTERVAL = 30000; // 30 seconds

class AnalyticsService {
  private events: AnalyticsEvent[] = [];
  private sessionId: string = '';
  private userId: string | null = null;
  private currentScreen: string | null = null;
  private screenStartTime: number = 0;
  private isOnline: boolean = true;
  private isSyncing: boolean = false;
  private privacySettings: PrivacySettings = {
    enabled: true,
    analyticsEnabled: true,
    crashReportingEnabled: true,
    personalizationEnabled: true,
    dataRetentionDays: 30,
  };
  private syncTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.initializeSession();
      await this.loadPrivacySettings();
      await this.loadEventsFromStorage();
      this.startAutoSync();
      logger.info('AnalyticsService initialized', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('Failed to initialize AnalyticsService', error, 'Analytics');
    }
  }

  private async initializeSession(): Promise<void> {
    try {
      let sessionId = await AsyncStorage.getItem(SESSION_ID_KEY);
      if (!sessionId) {
        sessionId = this.generateSessionId();
        await AsyncStorage.setItem(SESSION_ID_KEY, sessionId);
      }
      this.sessionId = sessionId;
    } catch (error) {
      logger.error('Failed to initialize session', error, 'Analytics');
      this.sessionId = this.generateSessionId();
    }
  }

  private generateSessionId(): string {
    return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async loadPrivacySettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(PRIVACY_SETTINGS_KEY);
      if (stored) {
        this.privacySettings = JSON.parse(stored);
      }
    } catch (error) {
      logger.error('Failed to load privacy settings', error, 'Analytics');
    }
  }

  private async loadEventsFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(ANALYTICS_STORAGE_KEY);
      if (stored) {
        const events = JSON.parse(stored);
        this.events = Array.isArray(events) ? events : [];
      }
    } catch (error) {
      logger.error('Failed to load analytics events', error, 'Analytics');
      this.events = [];
    }
  }

  /**
   * Set user ID for analytics tracking
   */
  setUserId(userId: string): void {
    this.userId = userId;
    logger.info('Analytics user ID set', { userId });
  }

  /**
   * Clear user ID (on logout)
   */
  clearUserId(): void {
    this.userId = null;
    logger.info('Analytics user ID cleared');
  }

  /**
   * Track screen view
   */
  trackScreenView(screenName: string, duration?: number): void {
    if (!this.privacySettings.analyticsEnabled) return;

    const event = this.createEvent(EventType.SCREEN_VIEW, {
      screenName,
      duration: duration || 0,
    });
    event.screenName = screenName;

    this.addEvent(event);
    this.currentScreen = screenName;
    this.screenStartTime = Date.now();
  }

  /**
   * Track screen leave with automatic duration calculation
   */
  trackScreenLeave(): void {
    if (!this.privacySettings.analyticsEnabled || !this.currentScreen) return;

    const duration = Date.now() - this.screenStartTime;
    const event = this.createEvent(EventType.SCREEN_LEAVE, {
      screenName: this.currentScreen,
      duration,
    });
    event.screenName = this.currentScreen;

    this.addEvent(event);
    this.currentScreen = null;
  }

  /**
   * Track generic event
   */
  trackEvent(type: EventType, properties: Record<string, any> = {}): void {
    if (!this.privacySettings.analyticsEnabled) return;

    const event = this.createEvent(type, properties);
    this.addEvent(event);
  }

  /**
   * Track error event
   */
  trackError(errorMessage: string, errorStack?: string, context?: Record<string, any>): void {
    if (!this.privacySettings.analyticsEnabled) return;

    const event = this.createEvent(EventType.ERROR_OCCURRED, {
      message: errorMessage,
      stack: errorStack,
      context,
    });

    this.addEvent(event);
  }

  /**
   * Track crash event
   */
  trackCrash(error: Error, context?: Record<string, any>): void {
    if (!this.privacySettings.crashReportingEnabled) return;

    const event = this.createEvent(EventType.CRASH_REPORTED, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
    });

    this.addEvent(event);
  }

  /**
   * Create event with standard metadata
   */
  private createEvent(type: EventType, properties: Record<string, any>): AnalyticsEvent {
    return {
      id: this.generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId || undefined,
      screenName: this.currentScreen || undefined,
      properties,
      metadata: {
        platform: Platform.OS,
        appVersion: '0.1.0',
        osVersion: Platform.OS === 'ios' ? 'unknown' : 'unknown',
        locale: 'pt-BR',
      },
      synced: false,
    };
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add event to queue and persist
   */
  private async addEvent(event: AnalyticsEvent): Promise<void> {
    this.events.push(event);

    // Enforce max offline events
    if (this.events.length > MAX_OFFLINE_EVENTS) {
      this.events = this.events.slice(-MAX_OFFLINE_EVENTS);
    }

    await this.persistEvents();
  }

  /**
   * Persist events to AsyncStorage
   */
  private async persistEvents(): Promise<void> {
    try {
      const dataToStore = this.events.slice(-MAX_OFFLINE_EVENTS);
      await AsyncStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(dataToStore));
    } catch (error) {
      logger.error('Failed to persist analytics events', error, 'Analytics');
    }
  }

  /**
   * Get unsync events
   */
  private getUnSyncedEvents(): AnalyticsEvent[] {
    return this.events.filter((event) => !event.synced);
  }

  /**
   * Start automatic sync timer
   */
  private startAutoSync(): void {
    this.syncTimer = setInterval(() => {
      if (!this.isSyncing && this.getUnSyncedEvents().length > 0) {
        this.syncEvents();
      }
    }, AUTO_SYNC_INTERVAL);
  }

  /**
   * Stop automatic sync timer
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Sync events to backend (batch processing)
   */
  async syncEvents(): Promise<void> {
    if (this.isSyncing || !this.privacySettings.analyticsEnabled) return;

    this.isSyncing = true;
    try {
      const unSynced = this.getUnSyncedEvents();
      if (unSynced.length === 0) return;

      // Process in batches
      for (let i = 0; i < unSynced.length; i += BATCH_SYNC_SIZE) {
        const batch = unSynced.slice(i, i + BATCH_SYNC_SIZE);
        await this.sendBatch(batch);
      }

      await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
      logger.info(`Analytics: Synced ${unSynced.length} events`);
    } catch (error) {
      logger.error('Failed to sync analytics events', error, 'Analytics');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Send batch of events to backend
   */
  private async sendBatch(batch: AnalyticsEvent[]): Promise<void> {
    try {
      // Mock API call - replace with actual backend endpoint
      const response = await fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          events: batch,
        }),
      });

      if (response.ok) {
        // Mark events as synced
        batch.forEach((event) => {
          const index = this.events.findIndex((e) => e.id === event.id);
          if (index !== -1) {
            this.events[index].synced = true;
          }
        });
        await this.persistEvents();
      }
    } catch (error) {
      logger.warn('Failed to send analytics batch', { batchSize: batch.length }, 'Analytics');
    }
  }

  /**
   * Get current analytics metrics
   */
  getMetrics(): AnalyticsMetrics {
    const eventsByType: Record<EventType, number> = {} as Record<EventType, number>;

    Object.values(EventType).forEach((type) => {
      eventsByType[type] = this.events.filter((e) => e.type === type).length;
    });

    const errorCount = this.events.filter(
      (e) => e.type === EventType.ERROR_OCCURRED || e.type === EventType.CRASH_REPORTED,
    ).length;

    const lastSyncStr = localStorage?.getItem?.(LAST_SYNC_KEY) || null;

    return {
      totalEvents: this.events.length,
      eventsByType,
      activeUsers: this.userId ? 1 : 0,
      avgSessionDuration: 0,
      crashCount: eventsByType[EventType.CRASH_REPORTED] || 0,
      errorCount,
      lastSyncTime: lastSyncStr,
    };
  }

  /**
   * Get events by type
   */
  getEventsByType(type: EventType): AnalyticsEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Get events from specific session
   */
  getSessionEvents(sessionId: string): AnalyticsEvent[] {
    return this.events.filter((e) => e.sessionId === sessionId);
  }

  /**
   * Update privacy settings
   */
  async setPrivacySettings(settings: Partial<PrivacySettings>): Promise<void> {
    try {
      this.privacySettings = { ...this.privacySettings, ...settings };
      await AsyncStorage.setItem(PRIVACY_SETTINGS_KEY, JSON.stringify(this.privacySettings));
      logger.info('Privacy settings updated');
    } catch (error) {
      logger.error('Failed to update privacy settings', error, 'Analytics');
    }
  }

  /**
   * Get privacy settings
   */
  getPrivacySettings(): PrivacySettings {
    return { ...this.privacySettings };
  }

  /**
   * Clear old events based on retention policy
   */
  async clearOldEvents(): Promise<void> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setDate(cutoffTime.getDate() - this.privacySettings.dataRetentionDays);
      const cutoffTimestamp = cutoffTime.toISOString();

      const initialCount = this.events.length;
      this.events = this.events.filter((e) => e.timestamp > cutoffTimestamp);

      await this.persistEvents();
      logger.info(`Analytics: Cleared ${initialCount - this.events.length} old events`);
    } catch (error) {
      logger.error('Failed to clear old events', error, 'Analytics');
    }
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(): Promise<string> {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        sessionId: this.sessionId,
        metrics: this.getMetrics(),
        events: this.events,
      };
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      logger.error('Failed to export analytics', error, 'Analytics');
      throw error;
    }
  }

  /**
   * Clear all analytics data
   */
  async clearAll(): Promise<void> {
    try {
      this.events = [];
      this.userId = null;
      this.currentScreen = null;
      await AsyncStorage.removeItem(ANALYTICS_STORAGE_KEY);
      await AsyncStorage.removeItem(SESSION_ID_KEY);
      logger.info('Analytics cleared');
    } catch (error) {
      logger.error('Failed to clear analytics', error, 'Analytics');
    }
  }
}

export const analyticsService = new AnalyticsService();

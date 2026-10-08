/**
 * useAnalytics Hook - Phase 22.13: Analytics & Monitoring
 *
 * Custom React hook for easy analytics integration in components
 * Handles screen tracking, event tracking, and analytics cleanup
 */

import { useEffect } from 'react';
import { analyticsService, EventType, AnalyticsEvent } from '../utils/analytics';
import { crashReportingService } from '../utils/analytics/crashReportingService';
import { performanceMetrics } from '../utils/analytics/performanceMetrics';

export interface UseAnalyticsOptions {
  screenName?: string;
  trackScreenTime?: boolean;
  autoSync?: boolean;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const { screenName, trackScreenTime = true, autoSync = true } = options;

  // Track screen view on mount
  useEffect(() => {
    if (screenName && trackScreenTime) {
      analyticsService.trackScreenView(screenName);

      // Track screen leave on unmount
      return () => {
        analyticsService.trackScreenLeave();
      };
    }
  }, [screenName, trackScreenTime]);

  // Auto sync events periodically
  useEffect(() => {
    if (autoSync) {
      const syncTimer = setInterval(() => {
        analyticsService.syncEvents();
        crashReportingService.syncCrashes();
      }, 30000);

      return () => clearInterval(syncTimer);
    }
  }, [autoSync]);

  // Return analytics functions
  return {
    // Event tracking
    trackEvent: (type: EventType, properties?: Record<string, any>) => {
      analyticsService.trackEvent(type, properties);
    },

    // Error tracking
    trackError: (message: string, stack?: string, context?: Record<string, any>) => {
      analyticsService.trackError(message, stack, context);
    },

    // Crash tracking
    trackCrash: (error: Error, context?: Record<string, any>) => {
      analyticsService.trackCrash(error, context);
    },

    // Add breadcrumb
    addBreadcrumb: (
      category: string,
      message: string,
      level?: 'debug' | 'info' | 'warning' | 'error',
      data?: Record<string, any>,
    ) => {
      crashReportingService.addBreadcrumb(category, message, level, data);
    },

    // Screen tracking
    trackScreenView: (screen: string) => {
      analyticsService.trackScreenView(screen);
    },

    trackScreenLeave: () => {
      analyticsService.trackScreenLeave();
    },

    // Performance tracking
    markPerformance: (name: string) => {
      performanceMetrics.mark(name);
    },

    measurePerformance: (name: string, startMark: string) => {
      return performanceMetrics.measure(name, startMark);
    },

    // Get metrics
    getMetrics: () => analyticsService.getMetrics(),
    getPerformanceSummary: () => performanceMetrics.getSummary(),
    getCrashCount: () => crashReportingService.getCrashCount(),

    // User management
    setUserId: (userId: string) => analyticsService.setUserId(userId),
    clearUserId: () => analyticsService.clearUserId(),

    // Context management
    setContext: (context: Record<string, any>) => {
      crashReportingService.setContext(context);
    },
    clearContext: () => crashReportingService.clearContext(),

    // Privacy settings
    getPrivacySettings: () => analyticsService.getPrivacySettings(),
    setPrivacySettings: (settings: any) => analyticsService.setPrivacySettings(settings),

    // Sync
    syncEvents: () => analyticsService.syncEvents(),
    syncCrashes: () => crashReportingService.syncCrashes(),

    // Export/Clear
    exportAnalytics: () => analyticsService.exportAnalytics(),
    clearAnalytics: () => analyticsService.clearAll(),
  };
}

// Type export
export type UseAnalyticsReturn = ReturnType<typeof useAnalytics>;

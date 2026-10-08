# Analytics System Documentation

## Overview

The Analytics System for Lucide React Mobile App provides comprehensive event tracking, crash reporting, and performance monitoring with offline-first architecture, GDPR compliance, and comprehensive privacy controls.

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Setup and Configuration](#setup-and-configuration)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Privacy and GDPR Compliance](#privacy-and-gdpr-compliance)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

## Features

### Core Analytics
- **Event Tracking**: Track user actions, screen views, and custom events
- **Offline-First**: Events queue locally and sync when connection is available
- **Batch Processing**: Events are synced in batches of 50 for efficiency
- **Screen Tracking**: Automatic screen view and duration tracking
- **Error Tracking**: Comprehensive error logging with context
- **Crash Reporting**: Sentry integration for critical errors

### Performance Monitoring
- **Startup Time**: Track app initialization performance
- **Memory Usage**: Monitor RAM consumption and availability
- **API Response Time**: Track API latency with percentile calculations
- **Network Latency**: Monitor network performance
- **Screen Render Time**: Track UI rendering performance
- **Frame Rate**: Monitor animation performance

### Privacy & Security
- **GDPR Compliant**: User consent management and data retention
- **Privacy Controls**: Users can disable analytics, crash reporting, personalization
- **Data Retention**: Automatic deletion of events based on retention policy
- **No PII**: No personally identifiable information is collected by default
- **Encrypted Storage**: Events stored securely in AsyncStorage

## Architecture

### Components

```
┌─────────────────────────────────────────────┐
│         Application Components              │
└──────────────┬──────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐   ┌────▼─────────┐
│ useAnalytics│   │  Dashboard   │
│    Hook     │   │  Component   │
└──────┬──────┘   └────┬─────────┘
       │                │
       └────────┬───────┘
                │
     ┌──────────┴──────────┐
     │                     │
┌────▼─────────┐    ┌─────▼──────────┐
│ Analytics    │    │  Crash         │
│ Service      │    │  Reporting     │
└────┬─────────┘    │  Service       │
     │              └─────┬──────────┘
     │                    │
     └────────┬───────────┘
              │
       ┌──────▼──────────┐
       │ Performance     │
       │ Metrics Service │
       └─────────────────┘
              │
       ┌──────▼──────────────────┐
       │  AsyncStorage Persistence│
       │  (Offline Queue)         │
       └──────────────────────────┘
```

### Event Flow

1. **Event Generation**: User action or system event triggers analytics
2. **Queuing**: Event stored in memory and AsyncStorage
3. **Offline Storage**: Events persist locally with retention policy
4. **Automatic Sync**: Timer runs every 30 seconds to sync queued events
5. **Batch Processing**: Events processed in batches of 50
6. **Backend Sync**: Events sent to backend API endpoint
7. **Confirmation**: Synced events marked and old events cleared

### Data Storage

Events are stored in AsyncStorage with the following structure:

```json
{
  "id": "evt-1728415234567-abc123",
  "timestamp": "2026-10-08T12:00:34.567Z",
  "type": "screen_view",
  "properties": {
    "screen": "HomeScreen",
    "duration": 5000
  },
  "userId": "user123",
  "sessionId": "session456",
  "synced": false,
  "syncAttempts": 0
}
```

## Setup and Configuration

### Installation

The analytics system is integrated into the project. No additional dependencies are required beyond those already installed:
- `@react-native-async-storage/async-storage`
- `react-native-paper`
- Existing logger utility

### Initialization

Analytics services initialize automatically on app launch:

```typescript
import { analyticsService, crashReportingService, performanceMetrics } from '@/utils/analytics';

// Services are singletons - automatically initialized
// No additional setup required
```

### Configuration

#### API Endpoint Configuration

Update the API endpoint in `analyticsService.ts`:

```typescript
const API_ENDPOINT = 'https://your-api.com/api/analytics';
const CRASH_ENDPOINT = 'https://your-api.com/api/crashes';
```

#### Sentry Configuration

Update Sentry DSN in `crashReportingService.ts`:

```typescript
const SENTRY_DSN = 'https://your-key@sentry.io/project-id';
```

#### Event Retention

Modify retention in `analyticsService.ts`:

```typescript
const DATA_RETENTION_DAYS = 30; // Events older than 30 days are deleted
```

### Environment Variables

Create `.env.analytics` for environment-specific configuration:

```env
REACT_APP_ANALYTICS_ENDPOINT=https://api.example.com/analytics
REACT_APP_CRASH_ENDPOINT=https://api.example.com/crashes
REACT_APP_SENTRY_DSN=https://key@sentry.io/project
```

## API Reference

### AnalyticsService

#### Event Tracking

```typescript
// Track a custom event
analyticsService.trackEvent('button_clicked', {
  buttonName: 'login',
  screen: 'LoginScreen',
});

// Track screen view
analyticsService.trackScreenView('HomeScreen');

// Track screen departure
analyticsService.trackScreenLeave();

// Track error
analyticsService.trackError(
  'Network timeout',
  'Error: timeout',
  { endpoint: '/api/data' }
);

// Track crash
analyticsService.trackCrash(error, { severity: 'high' });
```

#### User Management

```typescript
// Set user identifier
analyticsService.setUserId('user@example.com');

// Clear user identifier
analyticsService.clearUserId();
```

#### Data Access

```typescript
// Get current metrics
const metrics = analyticsService.getMetrics();
// Returns: { totalEvents, errorCount, crashCount, lastSyncTime, ... }

// Export all analytics data
const exported = await analyticsService.exportAnalytics();
// Returns: JSON string with all events
```

#### Privacy & Data Management

```typescript
// Get privacy settings
const settings = analyticsService.getPrivacySettings();

// Update privacy settings
analyticsService.setPrivacySettings({
  analyticsEnabled: true,
  crashReportingEnabled: true,
  personalizationEnabled: false,
  dataRetentionDays: 30,
});

// Clear events older than specified days
analyticsService.clearOldEvents(30);

// Clear all data
await analyticsService.clearAll();
```

#### Synchronization

```typescript
// Manually sync queued events
await analyticsService.syncEvents();

// Auto-sync timer runs every 30 seconds (configurable)
```

### CrashReportingService

#### Error Reporting

```typescript
// Report error
crashReportingService.reportError(error, 'ErrorCategory');

// Get crash reports
const crashes = crashReportingService.getCrashReports();

// Get crash count
const count = crashReportingService.getCrashCount();

// Get unsynced crash count
const unsyncedCount = crashReportingService.getUnsyncedCrashCount();
```

#### Breadcrumb Tracking

```typescript
// Add breadcrumb for error context
crashReportingService.addBreadcrumb(
  'user_action',
  'Button clicked',
  'info',
  { buttonId: 'btn-123' }
);

// Get all breadcrumbs
const breadcrumbs = crashReportingService.getBreadcrumbs();

// Clear breadcrumbs
await crashReportingService.clearBreadcrumbs();
```

#### Context Management

```typescript
// Set context for crash reports
crashReportingService.setContext({
  userId: 'user123',
  sessionId: 'session456',
  screen: 'HomeScreen',
  action: 'data_fetch',
});

// Get current context
const context = crashReportingService.getContext();

// Clear context
crashReportingService.clearContext();
```

#### Synchronization

```typescript
// Sync unsynced crash reports
await crashReportingService.syncCrashes();

// Export crash reports
const exported = await crashReportingService.exportCrashReports();

// Clear crash reports
await crashReportingService.clearCrashReports();
```

### PerformanceMetricsService

#### Performance Tracking

```typescript
// Record a performance metric
performanceMetrics.recordMetric('custom_operation', 150, 'ms', {
  operation: 'data_fetch',
});

// Track API request
performanceMetrics.trackApiRequest('/api/users', 250, 200);

// Track network latency
performanceMetrics.trackNetworkLatency(50, 'api.example.com');

// Track database operation
performanceMetrics.trackDatabaseOperation('SELECT', 100, 'users');

// Track screen render time
performanceMetrics.trackScreenRender('HomeScreen', 500);

// Track frame rate
performanceMetrics.trackFrameRate(60);
```

#### Performance Marks

```typescript
// Mark a point in time
performanceMetrics.mark('operation_start');

// Measure duration between marks
const duration = performanceMetrics.measure('operation', 'operation_start');
// Returns: duration in milliseconds
```

#### Metrics Query

```typescript
// Get metrics by name
const metrics = performanceMetrics.getMetricsByName('api_response_time');

// Get metrics by type
const apiMetrics = performanceMetrics.getMetricsByType('api');

// Get metrics in time range
const rangeMetrics = performanceMetrics.getMetricsInRange(startTime, endTime);

// Get all metrics
const allMetrics = performanceMetrics.getAllMetrics();
```

#### Analytics Summary

```typescript
// Get performance summary
const summary = performanceMetrics.getSummary();
// Returns: {
//   startupTime: number (ms),
//   memoryUsage: number (MB),
//   memoryAvailable: number (MB),
//   avgApiResponseTime: number (ms),
//   avgNetworkLatency: number (ms),
//   crashes: number,
//   errors: number,
// }

// Get average API response time
const avg = performanceMetrics.getAverageApiResponseTime();

// Get p95 API response time
const p95 = performanceMetrics.getP95ApiResponseTime();

// Get p99 API response time
const p99 = performanceMetrics.getP99ApiResponseTime();

// Get average network latency
const latency = performanceMetrics.getAverageNetworkLatency();

// Export metrics
const exported = await performanceMetrics.exportMetrics();

// Clear metrics
performanceMetrics.clearMetrics();

// Stop memory monitoring
performanceMetrics.stopMemoryMonitoring();
```

### useAnalytics Hook

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

export const MyComponent: React.FC = () => {
  const {
    trackEvent,
    trackError,
    trackCrash,
    addBreadcrumb,
    trackScreenView,
    trackScreenLeave,
    getMetrics,
    getPerformanceSummary,
    setUserId,
    setPrivacySettings,
    syncEvents,
    syncCrashes,
    exportAnalytics,
    clearAnalytics,
  } = useAnalytics({
    screenName: 'MyScreen',
    trackScreenTime: true,
    autoSync: true,
  });

  return (
    <View>
      <Button onPress={() => trackEvent('button_click')} title="Click Me" />
    </View>
  );
};
```

## Usage Examples

### Basic Event Tracking

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

export const HomeScreen: React.FC = () => {
  const { trackEvent } = useAnalytics({
    screenName: 'HomeScreen',
    autoSync: true,
  });

  const handleLogin = () => {
    trackEvent('login_successful', {
      method: 'email',
      timestamp: new Date().toISOString(),
    });
  };

  return <Button onPress={handleLogin} title="Login" />;
};
```

### Error Handling and Tracking

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

export const DataComponent: React.FC = () => {
  const { trackError, addBreadcrumb } = useAnalytics();

  const fetchData = async () => {
    try {
      addBreadcrumb('api_call', 'Fetching data', 'info');
      const response = await fetch('/api/data');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      trackError('Data fetch failed', error.stack, {
        endpoint: '/api/data',
        retry: false,
      });
      addBreadcrumb('api_error', 'API request failed', 'error', {
        error: error.message,
      });
    }
  };

  return <Button onPress={fetchData} title="Fetch Data" />;
};
```

### Performance Monitoring

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';
import { performanceMetrics } from '@/utils/analytics';

export const ListScreen: React.FC = () => {
  const { getPerformanceSummary } = useAnalytics();

  useEffect(() => {
    // Mark start of operation
    performanceMetrics.mark('list_load_start');

    loadList();

    // Measure operation
    const duration = performanceMetrics.measure('list_load', 'list_load_start');
    console.log(`List loaded in ${duration}ms`);
  }, []);

  const getMetrics = () => {
    const summary = getPerformanceSummary();
    console.log('Performance Summary:', summary);
  };

  return <Button onPress={getMetrics} title="Show Metrics" />;
};
```

### Privacy Settings

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

export const PrivacyScreen: React.FC = () => {
  const { setPrivacySettings } = useAnalytics();

  const handleDisableAnalytics = () => {
    setPrivacySettings({
      analyticsEnabled: false,
      crashReportingEnabled: true,
      personalizationEnabled: false,
      dataRetentionDays: 7,
    });
  };

  return <Button onPress={handleDisableAnalytics} title="Disable Analytics" />;
};
```

## Privacy and GDPR Compliance

### User Consent

Before collecting any analytics:

1. Show privacy policy and obtain explicit user consent
2. Set privacy preferences based on user choice:

```typescript
const { setPrivacySettings } = useAnalytics();

setPrivacySettings({
  analyticsEnabled: userConsent.analytics,
  crashReportingEnabled: userConsent.crashes,
  personalizationEnabled: userConsent.personalization,
  dataRetentionDays: 30,
});
```

### Data Retention

Events are automatically deleted based on retention policy:

```typescript
// Clear events older than 30 days (runs daily)
analyticsService.clearOldEvents(30);
```

### Right to be Forgotten

Users can request all data to be deleted:

```typescript
// Export data for transparency
const exported = await analyticsService.exportAnalytics();

// Delete all data
await analyticsService.clearAll();
await crashReportingService.clearCrashReports();
```

### PII Protection

By default, no personally identifiable information is collected. For user identification:

```typescript
// Only use anonymous user IDs or hashed identifiers
analyticsService.setUserId('user_hash_xyz');

// Never set PII directly:
// ❌ analyticsService.setUserId('john@example.com');
// ✅ analyticsService.setUserId('user_hash_' + hashEmail(email));
```

## Testing

### Unit Tests

Run analytics service tests:

```bash
npm test -- __tests__/utils/analytics/analyticsService.test.ts
npm test -- __tests__/utils/analytics/crashReportingService.test.ts
npm test -- __tests__/utils/analytics/performanceMetrics.test.ts
```

### Integration Tests

Test analytics integration with components:

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import { useAnalytics } from '@/hooks/useAnalytics';

describe('Analytics Integration', () => {
  it('should track events', () => {
    const { result } = renderHook(() => useAnalytics());

    act(() => {
      result.current.trackEvent('test_event');
    });

    const metrics = result.current.getMetrics();
    expect(metrics.totalEvents).toBeGreaterThan(0);
  });
});
```

## Troubleshooting

### Events Not Syncing

**Problem**: Events queued but not syncing to backend

**Solutions**:
1. Check network connectivity
2. Verify API endpoint is correct
3. Check AsyncStorage permissions
4. Review logs: `logger.info('Analytics', ...)`

### High Memory Usage

**Problem**: App memory increasing over time

**Solutions**:
1. Clear old events: `analyticsService.clearOldEvents(7)`
2. Stop memory monitoring if not needed: `performanceMetrics.stopMemoryMonitoring()`
3. Reduce MAX_STORED_METRICS in performanceMetrics.ts

### Crashes Not Reported

**Problem**: Crash reports not appearing in Sentry

**Solutions**:
1. Verify Sentry DSN is correct
2. Check crash reporting is enabled in privacy settings
3. Verify global error handler setup
4. Check network connectivity during sync

### AsyncStorage Quota Exceeded

**Problem**: "QuotaExceededError" from AsyncStorage

**Solutions**:
1. Reduce data retention days
2. Clear old events more frequently
3. Reduce MAX_OFFLINE_EVENTS limit
4. Implement selective event tracking

## API Endpoints

### Event Syncing

**POST** `/api/analytics/events`

Request:
```json
{
  "events": [
    {
      "id": "evt-xxx",
      "type": "screen_view",
      "properties": { },
      "timestamp": "2026-10-08T12:00:00Z"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "synced": 50,
  "failed": 0
}
```

### Crash Reporting

**POST** `/api/crashes`

Request:
```json
{
  "event_id": "crash-xxx",
  "message": "Error message",
  "timestamp": "2026-10-08T12:00:00Z",
  "exception": {
    "values": [
      {
        "type": "Error",
        "value": "Error message",
        "stacktrace": { "frames": [ ] }
      }
    ]
  }
}
```

Response:
```json
{
  "success": true,
  "id": "crash-xxx"
}
```

## Performance Benchmarks

Expected performance metrics:
- **Event Tracking**: <5ms per event
- **Batch Sync**: <1s for 50 events (with network)
- **Memory Overhead**: <10MB for 1000 queued events
- **Startup Impact**: <100ms

## Security Considerations

1. **HTTPS Only**: All API calls use HTTPS
2. **No Token Leakage**: Auth tokens never included in analytics
3. **Data Minimization**: Collect only necessary data
4. **Encryption**: Use device-level encryption for AsyncStorage
5. **Access Control**: Restrict analytics access to authenticated users

## Support

For issues or questions:
1. Check this documentation
2. Review test files for usage examples
3. Check logger output for errors
4. Submit issue to project repository

---

**Last Updated**: October 8, 2026
**Version**: 1.0.0

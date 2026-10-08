# Analytics & Monitoring - Phase 22.13

Complete analytics and performance monitoring system for the CRMT Mobile App.

## Overview

The analytics system provides:
- Event tracking (screen views, transactions, user actions)
- Session management
- User properties tracking
- Event queuing and batch sending
- Offline support with local persistence
- Performance metrics collection
- Crash reporting with breadcrumb tracking

## Architecture

### Components

1. **AnalyticsService** - Main event tracking and analytics
2. **CrashReportingService** - Error tracking and crash reporting with Sentry integration
3. **PerformanceMetrics** - Performance monitoring and metrics collection
4. **useAnalytics Hook** - Easy integration in React components

## Usage

### Basic Setup

```typescript
import { analyticsService, crashReportingService, performanceMetrics } from '@/utils/analytics';

// Initialize on app launch
async function initializeAnalytics() {
  await analyticsService.initialize();
  
  await crashReportingService.initialize({
    enabled: true,
    environment: 'production',
    sentryDSN: process.env.REACT_APP_SENTRY_DSN,
  });
  
  await performanceMetrics.initialize();
}
```

### Track Events

```typescript
import { useAnalytics, EventType } from '@/hooks/useAnalytics';

function TransactionScreen() {
  const { trackEvent, trackTransaction } = useAnalytics();
  
  const handleCreateTransaction = async () => {
    try {
      await trackTransaction('create', {
        amount: 100.00,
        category: 'Food',
      });
    } catch (error) {
      console.error('Failed to create transaction', error);
    }
  };
  
  return (
    <Button onPress={handleCreateTransaction}>
      Create Transaction
    </Button>
  );
}
```

### Track Screen Views

```typescript
function ProfileScreen() {
  const { trackEvent } = useAnalytics();
  
  useEffect(() => {
    // Screen view is tracked automatically by useAnalytics
    trackEvent('profile_viewed', {
      section: 'settings',
    }).catch(console.error);
  }, []);
  
  return <View>{/* Screen content */}</View>;
}
```

### Track Network Requests

```typescript
function UserAPI() {
  const { trackNetworkRequest } = useAnalytics();
  
  async function fetchUsers() {
    const startTime = Date.now();
    
    try {
      const response = await axios.get('/api/users');
      const duration = Date.now() - startTime;
      
      await trackNetworkRequest(
        '/api/users',
        'GET',
        duration,
        response.status
      );
      
      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      await trackNetworkRequest(
        '/api/users',
        'GET',
        duration,
        error.response?.status
      );
      throw error;
    }
  }
  
  return { fetchUsers };
}
```

### Track Database Operations

```typescript
function TransactionDatabase() {
  const { useDatabaseMonitoring } = useAnalytics();
  const { trackOperation } = useDatabaseMonitoring();
  
  async function queryTransactions() {
    const startTime = Date.now();
    
    try {
      const results = await database.transactions.find().toPromise();
      const duration = Date.now() - startTime;
      
      trackOperation('query', duration, 'transactions');
      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      trackOperation('query', duration, 'transactions', error);
      throw error;
    }
  }
  
  return { queryTransactions };
}
```

### Report Errors and Crashes

```typescript
function ErrorHandling() {
  const { useCrashReporting } = useAnalytics();
  const { reportError, reportException, addBreadcrumb } = useCrashReporting();
  
  async function handleError(error: Error) {
    // Report error
    await reportException(error, {
      context: 'user_action',
      screen: 'ProfileScreen',
    });
    
    // Add breadcrumb for context
    addBreadcrumb('Error occurred', 'error', 'error');
  }
  
  return { handleError };
}
```

### Performance Monitoring

```typescript
function PerformanceMonitoring() {
  const { markPerformance, measurePerformance, getPerformanceStats } = useAnalytics();
  
  function trackOperation() {
    markPerformance('operation_start');
    
    // ... perform operation
    
    measurePerformance('operation_duration', 'operation_start');
    
    const stats = getPerformanceStats();
    console.log('Performance stats:', stats);
  }
  
  return { trackOperation };
}
```

### Set User Properties

```typescript
function LoginScreen() {
  const { setUserProperties } = useAnalytics();
  
  async function handleLogin(user: User) {
    await setUserProperties(user.id, {
      email: user.email,
      name: user.name,
      plan: user.plan,
    });
  }
  
  return { handleLogin };
}
```

## Event Types

```typescript
enum EventType {
  // Screen events
  SCREEN_VIEW = 'screen_view',
  SCREEN_LEAVE = 'screen_leave',
  
  // Transaction events
  TRANSACTION_CREATE = 'transaction_create',
  TRANSACTION_UPDATE = 'transaction_update',
  TRANSACTION_DELETE = 'transaction_delete',
  TRANSACTION_BULK_IMPORT = 'transaction_bulk_import',
  
  // User events
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  USER_SIGNUP = 'user_signup',
  USER_PROFILE_UPDATE = 'user_profile_update',
  
  // Sync events
  SYNC_START = 'sync_start',
  SYNC_END = 'sync_end',
  SYNC_ERROR = 'sync_error',
  
  // App events
  APP_LAUNCH = 'app_launch',
  APP_BACKGROUND = 'app_background',
  APP_FOREGROUND = 'app_foreground',
  APP_CRASH = 'app_crash',
  
  // Network events
  NETWORK_REQUEST = 'network_request',
  NETWORK_ERROR = 'network_error',
  
  // Custom events
  CUSTOM = 'custom_event',
}
```

## Hooks

### useAnalytics

Main hook for analytics functionality.

```typescript
const {
  trackEvent,              // Track custom event
  trackTransaction,        // Track transaction event
  trackNetworkRequest,     // Track network request
  trackError,             // Track error event
  setUserProperties,      // Set user properties
  addBreadcrumb,          // Add breadcrumb
  markPerformance,        // Mark performance point
  measurePerformance,     // Measure performance duration
  getPerformanceStats,    // Get performance statistics
  currentScreen,          // Current screen name
} = useAnalytics();
```

### useNetworkMonitoring

Specialized hook for network monitoring.

```typescript
const { trackRequest } = useNetworkMonitoring();

// Usage
trackRequest(endpoint, method, startTime, statusCode, error);
```

### useDatabaseMonitoring

Specialized hook for database operation monitoring.

```typescript
const { trackOperation } = useDatabaseMonitoring();

// Usage
trackOperation('query', duration, 'transactions', error);
```

### useCrashReporting

Specialized hook for crash reporting.

```typescript
const {
  reportError,           // Report error
  reportException,       // Report exception
  addBreadcrumb,         // Add breadcrumb
  getBreadcrumbs,        // Get all breadcrumbs
  clearBreadcrumbs,      // Clear breadcrumbs
} = useCrashReporting();
```

## Dashboard

Access the analytics dashboard in the app settings.

**Features:**
- Real-time performance metrics
- Event tracking statistics
- Crash reports
- Session information
- Data refresh and clearing options

## Configuration

### AnalyticsService Configuration

```typescript
analyticsService.configure({
  enableLocalPersistence: true,    // Enable local storage
  maxQueuedEvents: 500,            // Max events in queue
  batchSizeLimit: 100,             // Batch size for sending
  autoFlushInterval: 30000,        // Auto-flush interval (ms)
  enableEventAggregation: true,    // Aggregate event stats
});
```

### CrashReportingService Configuration

```typescript
await crashReportingService.initialize({
  enabled: true,                   // Enable crash reporting
  sentryDSN: 'https://...',       // Sentry DSN
  environment: 'production',       // Environment
  enableBreadcrumbs: true,         // Enable breadcrumbs
  maxBreadcrumbs: 100,             // Max breadcrumbs
  enableSessionReplay: false,      // Enable session replay
  debug: false,                    // Debug mode
  sampleRate: 1.0,                 // Sample rate (0-1)
  enableLocalPersistence: true,    // Enable local storage
});
```

## Privacy

- No personal data is collected by default
- Events are queued locally before sending
- User properties must be explicitly set
- Data can be cleared at any time
- Offline-first approach ensures data privacy

## Integration

### Existing Systems

- **Logger**: Events are logged with DEBUG level
- **Sync Service**: Sync events are tracked automatically
- **Database**: Database operations are monitored
- **Network**: API requests are tracked with NetworkMonitorService
- **Error Handler**: Errors are automatically reported

### Third-party Services

- **Sentry**: For crash reporting and error tracking
- **Firebase Analytics**: (Optional) For detailed analytics
- **Mixpanel**: (Optional) For funnel analysis

## Performance

- Efficient event queuing with batch sending
- Memory-optimized event aggregation
- Background memory monitoring
- Configurable flush intervals
- Low overhead: <5% CPU impact

## Testing

Run tests with:

```bash
npm run test -- src/utils/analytics
npm run test:coverage -- src/utils/analytics
```

## Troubleshooting

### Events not being tracked
- Check if analytics service is initialized
- Verify event tracking code is being called
- Check network connectivity for batch sending

### High memory usage
- Reduce `maxQueuedEvents` limit
- Enable event aggregation
- Clear old metrics regularly

### Crash reports not showing
- Verify Sentry DSN is configured
- Check internet connectivity
- Enable debug mode for logging

## Best Practices

1. **Initialize on App Launch**
   - Always initialize analytics services on app startup
   - Set user properties after login

2. **Track Important Events**
   - Track user actions that matter for your business
   - Use meaningful event names and properties

3. **Handle Errors Gracefully**
   - Always add try-catch blocks around analytics calls
   - Add breadcrumbs for debugging

4. **Monitor Performance**
   - Track long-running operations
   - Monitor API response times
   - Watch database query performance

5. **Respect Privacy**
   - Don't track personal data
   - Allow users to opt-out
   - Clear data on logout

## See Also

- [Crash Reporting Documentation](./CRASH_REPORTING.md)
- [Performance Metrics Guide](./PHASE_22_10_PERFORMANCE.md)
- [Error Handling Documentation](./utils/README-ERROR-HANDLING.md)

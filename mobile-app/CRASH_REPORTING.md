# Crash Reporting - Phase 22.13

Comprehensive crash reporting and error tracking with Sentry integration.

## Overview

The crash reporting system provides:
- Automatic crash detection and reporting
- Error tracking with stack traces
- Breadcrumb trail for debugging
- User identification
- Session replay capability
- Source map support
- Development/Production differentiation

## Sentry Integration

### Setup

1. **Create Sentry Account**
   - Go to [sentry.io](https://sentry.io)
   - Create a new React Native project
   - Copy your DSN (Data Source Name)

2. **Configure Environment**
   ```bash
   # .env or .env.production
   REACT_APP_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   ```

3. **Initialize in App**
   ```typescript
   import { crashReportingService } from '@/utils/analytics';
   
   async function initializeApp() {
     await crashReportingService.initialize({
       enabled: true,
       sentryDSN: process.env.REACT_APP_SENTRY_DSN,
       environment: 'production',
     });
   }
   ```

## Usage

### Automatic Error Reporting

Errors are automatically captured and reported:

```typescript
try {
  await fetchData();
} catch (error) {
  // Error is automatically reported by global error handler
  console.error('Failed to fetch data', error);
}
```

### Manual Error Reporting

Report errors manually when needed:

```typescript
import { crashReportingService } from '@/utils/analytics';

// Report an Error object
const error = new Error('Something went wrong');
const crashId = await crashReportingService.reportError(error, {
  context: 'user_action',
  screen: 'HomeScreen',
});

// Report a string error
const crashId = await crashReportingService.reportError('Error message');
```

### Using Hooks

```typescript
import { useCrashReporting } from '@/hooks/useAnalytics';

function MyComponent() {
  const { reportError, reportException } = useCrashReporting();
  
  async function handleError() {
    const error = new Error('Test error');
    
    // Report exception
    await reportException(error, {
      component: 'MyComponent',
      action: 'handleError',
    });
  }
  
  return (
    <Button onPress={handleError}>
      Report Error
    </Button>
  );
}
```

## Breadcrumbs

Breadcrumbs are trails of events leading up to a crash, helping you understand the context.

### Add Custom Breadcrumb

```typescript
import { crashReportingService } from '@/utils/analytics';

crashReportingService.addBreadcrumb({
  message: 'User clicked save button',
  category: 'user_action',
  level: 'info',
  data: {
    buttonId: 'save_btn',
    timestamp: Date.now(),
  },
});
```

### Specialized Breadcrumbs

```typescript
// Log breadcrumb
crashReportingService.addLogBreadcrumb('Processing transaction', 'info');
crashReportingService.addLogBreadcrumb('Transaction failed', 'error');

// Navigation breadcrumb
crashReportingService.addNavigationBreadcrumb('HomeScreen', 'navigate');
crashReportingService.addNavigationBreadcrumb('ProfileScreen', 'push');

// Network breadcrumb
crashReportingService.addNetworkBreadcrumb('GET', '/api/users', 200, 150);
crashReportingService.addNetworkBreadcrumb('POST', '/api/login', 401, 250);
```

### Using Hook

```typescript
import { useCrashReporting } from '@/hooks/useAnalytics';

function MyComponent() {
  const { addBreadcrumb } = useCrashReporting();
  
  useEffect(() => {
    addBreadcrumb('Component mounted', 'lifecycle');
    
    return () => {
      addBreadcrumb('Component unmounted', 'lifecycle');
    };
  }, [addBreadcrumb]);
  
  return <View>{/* Component content */}</View>;
}
```

## User Identification

Link crash reports to specific users:

```typescript
import { crashReportingService } from '@/utils/analytics';

async function loginUser(user: User) {
  // Identify user for crash reports
  crashReportingService.setUser(
    user.id,
    user.email,
    user.username
  );
  
  // ... login logic
}

function logout() {
  crashReportingService.clearUser();
}
```

## Session Tracking

### Session ID

Each crash report includes a unique session ID:

```typescript
const sessionId = crashReportingService.getSessionId();
console.log('Session:', sessionId);
```

### Session Replay

Enable session replay to record user interactions (use with caution for privacy):

```typescript
await crashReportingService.initialize({
  enableSessionReplay: true,
  // ...
});
```

## Configuration

### Full Configuration Example

```typescript
await crashReportingService.initialize({
  // Enable/disable crash reporting
  enabled: true,
  
  // Sentry DSN for error tracking
  sentryDSN: process.env.REACT_APP_SENTRY_DSN,
  
  // Environment (development, staging, production)
  environment: 'production',
  
  // Enable breadcrumb tracking
  enableBreadcrumbs: true,
  
  // Maximum breadcrumbs to keep
  maxBreadcrumbs: 100,
  
  // Enable session replay
  enableSessionReplay: false,
  
  // Debug mode (logs to console)
  debug: process.env.NODE_ENV === 'development',
  
  // Sample rate (0 to 1)
  // 0 = no reports, 1 = all reports
  sampleRate: process.env.NODE_ENV === 'production' ? 0.9 : 1.0,
  
  // Enable local persistence
  enableLocalPersistence: true,
});
```

## Crash Report Structure

```typescript
interface CrashReport {
  id: string;                    // Unique crash ID
  timestamp: number;             // When crash occurred
  message: string;               // Error message
  errorType: string;             // Error type
  stack?: string;                // Stack trace
  context?: Record<string, any>; // Additional context
  breadcrumbs: Breadcrumb[];     // Event trail
  userId?: string;               // User ID (if set)
  sessionId?: string;            // Session ID
  deviceInfo?: DeviceInfo;       // Device information
  isDevelopment: boolean;        // Development flag
}
```

## Viewing Crash Reports

### In Sentry Dashboard

1. Go to [sentry.io](https://sentry.io)
2. Select your project
3. View recent crashes and errors
4. Click on specific crash to see:
   - Full stack trace
   - User information
   - Breadcrumbs trail
   - Device and environment info
   - Source maps (for production)

### In App Dashboard

Access crash reports in the app's analytics dashboard:

```typescript
import AnalyticsScreen from '@/screens/analytics/AnalyticsScreen';

<AnalyticsScreen />
```

The Crashes tab shows:
- Total crash count
- Recent crash reports
- Breadcrumb trails
- Error messages

## Error Context

Add context to errors for better debugging:

```typescript
try {
  await processTransaction(transaction);
} catch (error) {
  await crashReportingService.reportError(error, {
    component: 'TransactionScreen',
    action: 'processTransaction',
    transactionId: transaction.id,
    userId: user.id,
    timestamp: Date.now(),
  });
}
```

## Development vs Production

### Development Mode

```typescript
await crashReportingService.initialize({
  environment: 'development',
  debug: true,
  sampleRate: 1.0, // Report all errors
});
```

### Production Mode

```typescript
await crashReportingService.initialize({
  environment: 'production',
  debug: false,
  sampleRate: 0.9, // Report 90% of errors
});
```

## Privacy Considerations

1. **No Personal Data**
   - Don't include passwords, tokens, or API keys
   - Don't include sensitive financial data
   - Use context parameter carefully

2. **User Consent**
   - Inform users about crash reporting
   - Allow opt-out if possible
   - Respect privacy settings

3. **Data Retention**
   - Configure Sentry to delete old data
   - Regularly review stored crashes
   - Clean up test/development crashes

## Source Maps

Configure source maps for better stack traces in production:

1. **Generate Source Maps**
   ```bash
   npm run build -- --sourcemap
   ```

2. **Upload to Sentry**
   ```bash
   sentry-cli releases files upload-sourcemaps .
   ```

3. **Link Release**
   ```typescript
   await crashReportingService.initialize({
     release: '1.0.0',
     dist: 'android',
   });
   ```

## Troubleshooting

### Crashes Not Appearing in Sentry

1. **Check DSN Configuration**
   ```bash
   echo $REACT_APP_SENTRY_DSN
   ```

2. **Verify Network Connection**
   - Check internet connectivity
   - Check proxy/firewall settings

3. **Enable Debug Mode**
   ```typescript
   await crashReportingService.initialize({
     debug: true,
     // ...
   });
   ```

### High Memory Usage

1. **Reduce Breadcrumb Limit**
   ```typescript
   await crashReportingService.initialize({
     maxBreadcrumbs: 50,
     // ...
   });
   ```

2. **Lower Sample Rate**
   ```typescript
   await crashReportingService.initialize({
     sampleRate: 0.5, // 50% of errors
     // ...
   });
   ```

### Missing Stack Traces

1. **Enable Source Maps**
2. **Check Error Handling**
   - Ensure Error objects are used
   - Avoid generic error strings

### Breadcrumbs Not Captured

1. **Check Config**
   ```typescript
   enableBreadcrumbs: true
   ```

2. **Verify Breadcrumb Level**
   - Error/warning level breadcrumbs are always captured
   - Info/debug depend on configuration

## Best Practices

1. **Always Initialize on App Launch**
   ```typescript
   async function initializeApp() {
     await crashReportingService.initialize({
       enabled: true,
       sentryDSN: process.env.REACT_APP_SENTRY_DSN,
     });
   }
   ```

2. **Set User After Login**
   ```typescript
   crashReportingService.setUser(userId, email, username);
   ```

3. **Add Breadcrumbs for Context**
   ```typescript
   crashReportingService.addBreadcrumb({
     message: 'Important action',
     category: 'user_action',
   });
   ```

4. **Report Errors with Context**
   ```typescript
   await crashReportingService.reportError(error, {
     context: 'operation_name',
     screen: 'ScreenName',
   });
   ```

5. **Regular Monitoring**
   - Check Sentry dashboard regularly
   - Address high-priority errors first
   - Track error trends over time

## Testing

Test crash reporting:

```typescript
// Test error reporting
const error = new Error('Test crash');
await crashReportingService.reportError(error);

// View in app dashboard
// Or check Sentry after network request completes
```

## See Also

- [Analytics Documentation](./ANALYTICS.md)
- [Error Handling Guide](./utils/README-ERROR-HANDLING.md)
- [Sentry Documentation](https://docs.sentry.io/platforms/react-native/)

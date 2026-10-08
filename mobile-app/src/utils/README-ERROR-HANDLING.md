# Phase 22.9: Error Handling & Logging

## Overview

Complete error handling and logging system for React Native mobile app with:

- **Logger Service**: Multi-level logging with AsyncStorage persistence
- **Error Handler**: Comprehensive error classification and handling
- **Error Boundaries**: Component-level and app-level error catching
- **Service Wrappers**: Error handling utilities for async operations
- **Custom Hooks**: React hooks for error handling in components

## Components

### 1. Logger Service (`logger.ts`)

Enhanced logging with structured JSON output, rotation, and persistence.

**Log Levels:**
- `DEBUG`: Development information
- `INFO`: General information
- `WARN`: Warning messages
- `ERROR`: Error messages
- `FATAL`: Critical errors

**Usage:**

```typescript
import { logger, LogLevel } from '@/utils/logger';

// Basic logging
logger.debug('Debug message', { details: 'value' });
logger.info('Info message', { details: 'value' }, 'ModuleName');
logger.warn('Warning message');
logger.error('Error message', error);
logger.fatal('Fatal error', error);

// Get logs
const allLogs = logger.getLogs();
const errorLogs = logger.getLogs(LogLevel.ERROR);
const logsSince = logger.getLogsAfter('2024-01-01T00:00:00Z');
const moduleLogss = logger.getLogsByModule('AuthService');

// Export logs
const jsonLogs = await logger.exportLogs();
const csvLogs = await logger.exportLogsAsCSV();

// Statistics
const stats = logger.getStats();
logger.printSummary();

// Clear logs
await logger.clearLogs();
```

**Features:**
- Session tracking for debugging
- Memory rotation (10MB max)
- AsyncStorage persistence (100 logs max)
- CSV and JSON export
- Performance stats

### 2. Error Handler (`errorHandler.ts`)

Comprehensive error classification and handling with retry logic.

**Error Categories:**
- `NETWORK`: Network connectivity issues
- `DATABASE`: Database operation errors
- `VALIDATION`: Input validation errors
- `AUTHENTICATION`: Auth-related errors
- `AUTHORIZATION`: Permission-related errors
- `NOT_FOUND`: Resource not found (404)
- `CONFLICT`: Resource conflict (409)
- `SERVER`: Server errors (5xx)
- `UNKNOWN`: Unclassified errors

**Usage:**

```typescript
import { ErrorHandler } from '@/utils/errorHandler';

// Classify error
const errorContext = ErrorHandler.classifyError(error, 'ModuleName');
console.log(errorContext.category); // 'NETWORK'
console.log(errorContext.userMessage); // User-friendly message

// Log error
ErrorHandler.logError(errorContext);

// Retry with exponential backoff
const result = await ErrorHandler.retry(
  async () => {
    return await someAsyncOperation();
  },
  {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  'ModuleName'
);

// Check error type
if (ErrorHandler.isNetworkError(error)) {
  console.log('Network error - may retry');
}

if (ErrorHandler.isAuthError(error)) {
  console.log('Auth error - refresh token');
}

// Get user message
const userMessage = ErrorHandler.classifyError(error, module).userMessage;

// Create error report
const report = ErrorHandler.createErrorReport(error, 'Operation', 'Module');
```

**Retry Options:**
```typescript
interface RetryOptions {
  maxAttempts?: number;        // Default: 3
  initialDelay?: number;       // Default: 1000ms
  maxDelay?: number;           // Default: 30000ms
  backoffMultiplier?: number;  // Default: 2
  shouldRetry?: (error) => boolean; // Custom retry logic
}
```

### 3. Error Boundaries

Component-based error catching at different levels.

#### App Error Boundary
Catches unhandled errors in entire application:

```typescript
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary';

<AppErrorBoundary>
  <App />
</AppErrorBoundary>
```

**Props:**
- `children`: React nodes
- `fallback?`: Custom fallback UI
- `onError?`: Custom error handler callback

#### Screen Error Boundary
Catches errors in individual screens:

```typescript
import { ScreenErrorBoundary } from '@/components/errors/ScreenErrorBoundary';

<ScreenErrorBoundary screenName="HomeScreen" onReset={handleReset}>
  <HomeScreen />
</ScreenErrorBoundary>
```

**Props:**
- `children`: React nodes
- `screenName?`: Screen identifier for logging
- `onReset?`: Reset callback
- `fallback?`: Custom fallback UI

#### Component Error Boundary
Catches errors in individual components:

```typescript
import { ComponentErrorBoundary } from '@/components/errors/ComponentErrorBoundary';

<ComponentErrorBoundary 
  componentName="UserCard"
  showError={true}
>
  <UserCard />
</ComponentErrorBoundary>
```

**Props:**
- `children`: React nodes
- `componentName?`: Component identifier
- `fallback?`: Custom fallback UI or function
- `showError?`: Show error message (default: true)

### 4. Service Error Handler (`serviceErrorHandler.ts`)

Utilities for handling errors in service operations.

**Usage:**

```typescript
import {
  withErrorHandler,
  withNetworkErrorHandler,
  withDatabaseErrorHandler,
  safeServiceCall,
  createSuccessResponse,
  createErrorResponse,
} from '@/utils/serviceErrorHandler';

// Wrap service operation
const response = await withErrorHandler(
  async () => {
    return await userService.getProfile();
  },
  {
    operation: 'fetchUserProfile',
    module: 'UserService',
    retryOptions: { maxAttempts: 3 },
    notifyUser: true,
  }
);

if (response.success) {
  console.log(response.data);
} else {
  console.log(response.error?.userMessage);
}

// Network error handler
const networkResponse = await withNetworkErrorHandler(
  async () => {
    return await api.get('/users');
  },
  {
    operation: 'fetchUsers',
    module: 'UserService',
  }
);

// Safe service call with default value
const users = await safeServiceCall(
  'fetchUsers',
  () => userService.getAll(),
  'UserService',
  [] // default value
);

// Offline support
const data = await withOfflineSupport(
  () => fetchData(),
  cachedData, // fallback
  {
    operation: 'fetchData',
    module: 'DataService',
  }
);
```

**Response Structure:**
```typescript
interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorContext;
  retried?: boolean;
}
```

### 5. Error Hook (`useErrorHandler.ts`)

Custom React hook for error handling in components.

**Usage:**

```typescript
import { useErrorHandler, useAsync } from '@/hooks/useErrorHandler';

function MyComponent() {
  const {
    error,
    userMessage,
    isLoading,
    isRetrying,
    clearError,
    handleError,
    retry,
    executeWithErrorHandling,
  } = useErrorHandler({
    locale: 'pt-BR',
    onError: (error) => {
      console.log('Error occurred:', error);
    },
  });

  const loadData = async () => {
    const result = await executeWithErrorHandling(
      () => fetchData(),
      { maxAttempts: 3 }
    );
  };

  return (
    <View>
      {error && (
        <Text style={{ color: 'red' }}>
          {userMessage}
        </Text>
      )}
      {/* ... */}
    </View>
  );
}

// Using useAsync hook
function AsyncComponent() {
  const {
    status,
    data,
    error,
    userMessage,
    execute,
  } = useAsync(
    () => fetchUserData(),
    true, // immediate
    { locale: 'pt-BR' }
  );

  if (status === 'pending') return <Text>Loading...</Text>;
  if (status === 'error') return <Text>{userMessage}</Text>;
  if (status === 'success') return <Text>{data?.name}</Text>;
}
```

## Error Messages

All error messages are stored in `/constants/errors.ts` with i18n support.

**Supported Languages:**
- `pt-BR`: Portuguese (Brazil)
- `en-US`: English (US)

**Getting User Message:**
```typescript
import { getErrorMessage } from '@/constants/errors';

const message = getErrorMessage(ERROR_CODES.NETWORK_ERROR, 'pt-BR');
// "Erro de conexão. Verifique sua internet."
```

## Database Error Handling

Special handling for database-specific errors:

```typescript
import { ErrorHandler } from '@/utils/errorHandler';

try {
  await database.transaction(async (tx) => {
    await tx.executeSql('INSERT ...');
  });
} catch (error) {
  const dbError = ErrorHandler.handleDatabaseError(
    error,
    'insertUser',
    'DatabaseService'
  );

  if (dbError.code === ERROR_CODES.DATABASE_CONSTRAINT) {
    // Handle constraint violation
  }
}
```

**Common Database Errors:**
- `DATABASE_CONSTRAINT`: Primary key, unique constraint, foreign key violation
- `DATABASE_IO_ERROR`: Storage read/write errors (retryable)
- `STORAGE_QUOTA_ERROR`: Out of storage space
- `DATA_INTEGRITY_ERROR`: Corruption detected

## Network Error Handling

Automatic retry with exponential backoff for network errors:

```typescript
const result = await ErrorHandler.retry(
  () => api.get('/users'),
  {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  }
);
```

**Backoff Calculation:**
- Attempt 1: 1000ms
- Attempt 2: 2000ms
- Attempt 3: 4000ms
- Max: 30000ms
- Jitter: ±50% randomization

## Best Practices

### 1. Service Layer
```typescript
class UserService {
  async getProfile() {
    return withErrorHandler(
      () => api.get('/user/profile'),
      {
        operation: 'getProfile',
        module: 'UserService',
        retryOptions: { maxAttempts: 2 },
      }
    );
  }
}
```

### 2. Components
```typescript
function UserProfile() {
  const { error, userMessage, executeWithErrorHandling, isLoading } = useErrorHandler();

  const loadProfile = async () => {
    await executeWithErrorHandling(() => userService.getProfile());
  };

  return (
    <ScreenErrorBoundary screenName="UserProfile">
      {error && <ErrorAlert message={userMessage} />}
      {isLoading && <Spinner />}
      {/* ... */}
    </ScreenErrorBoundary>
  );
}
```

### 3. Async Operations
```typescript
async function syncData() {
  const result = await withOfflineSupport(
    () => api.sync(),
    cachedData,
    {
      operation: 'sync',
      module: 'SyncService',
    }
  );

  if (!result.success) {
    logger.warn('Sync failed', result.error?.userMessage);
  }
}
```

## Production Considerations

1. **Error Reporting**: Configure Sentry or similar service
2. **PII Sanitization**: Don't log sensitive data
3. **Error Rate Monitoring**: Track error metrics
4. **User Notifications**: Show user-friendly messages only
5. **Log Rotation**: Automatic cleanup after 7 days
6. **Storage Limits**: Max 100 logs in AsyncStorage

## Debugging

### View Logs
```typescript
logger.printSummary();
const logs = await logger.exportLogs();
const csv = await logger.exportLogsAsCSV();
```

### Check Error Stats
```typescript
const stats = logger.getStats();
console.log('Total errors:', stats.byLevel.ERROR);
console.log('Total logs:', stats.totalLogs);
console.log('Storage size:', stats.storageSize);
```

### Enable Debug Logging
```typescript
import { logger, LogLevel } from '@/utils/logger';

logger.setMinLevel(LogLevel.DEBUG);
```

## Files Created

- `src/utils/logger.ts` - Enhanced logger service
- `src/utils/errorHandler.ts` - Error classification and handling
- `src/utils/serviceErrorHandler.ts` - Service operation wrappers
- `src/constants/errors.ts` - Error codes and messages
- `src/hooks/useErrorHandler.ts` - Custom error handling hook
- `src/components/errors/AppErrorBoundary.tsx` - App-level error boundary
- `src/components/errors/ScreenErrorBoundary.tsx` - Screen-level error boundary
- `src/components/errors/ComponentErrorBoundary.tsx` - Component-level error boundary

## Migration Checklist

- [ ] Add `AppErrorBoundary` to app root
- [ ] Add `ScreenErrorBoundary` to key screens
- [ ] Update service classes to use error handlers
- [ ] Replace manual error handling with hooks
- [ ] Configure error reporting service
- [ ] Test error scenarios
- [ ] Update documentation
- [ ] Monitor error rates in production

# Firebase Cloud Messaging (FCM) Push Notifications

**Phase 22.15: Mobile-First Features**

Complete Firebase Cloud Messaging integration for React Native mobile app with offline message queuing, secure token storage, and comprehensive analytics tracking.

## Table of Contents

1. [Overview](#overview)
2. [Installation & Setup](#installation--setup)
3. [Configuration](#configuration)
4. [API Reference](#api-reference)
5. [Usage Examples](#usage-examples)
6. [Notification Center](#notification-center)
7. [Offline Queuing](#offline-queuing)
8. [Analytics Integration](#analytics-integration)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

## Overview

The Push Notification Service provides production-ready Firebase Cloud Messaging integration with the following features:

### Core Features

- **Direct FCM Integration**: Uses `@react-native-firebase/messaging` for native FCM
- **Secure Token Storage**: FCM tokens encrypted and stored via SecureStorageService
- **Permission Handling**: Automatic iOS/Android notification permission requests
- **Multi-State Message Handling**: Supports foreground, background, and terminated app states
- **Offline Message Queuing**: Persists failed notifications to AsyncStorage with retry logic
- **Analytics Integration**: Tracks notification events for user engagement metrics
- **Notification Grouping**: Supports transaction, alert, update, and info notification types
- **Deep Linking**: Navigates to relevant screens when notifications are tapped
- **Unread Count Badge**: Tracks and displays unread notification count on app icon

### Performance Characteristics

- Token refresh interval: 30 days
- Notification retention: 30 days of history
- Max queued notifications: 100 messages
- Max retry attempts: 3 with exponential backoff
- Retry backoff: 5 seconds, doubles for each retry

## Installation & Setup

### Step 1: Install Dependencies

```bash
cd mobile-app
npm install @react-native-firebase/app @react-native-firebase/messaging
```

### Step 2: Add Firebase Configuration to app.json

The app.json already includes Firebase configuration variables:

```json
{
  "expo": {
    "extra": {
      "firebaseApiKey": "${FIREBASE_API_KEY}",
      "firebaseAuthDomain": "${FIREBASE_AUTH_DOMAIN}",
      "firebaseProjectId": "${FIREBASE_PROJECT_ID}",
      "firebaseStorageBucket": "${FIREBASE_STORAGE_BUCKET}",
      "firebaseMessagingSenderId": "${FIREBASE_MESSAGING_SENDER_ID}",
      "firebaseAppId": "${FIREBASE_APP_APP_ID}"
    }
  }
}
```

### Step 3: Set Environment Variables

Create `.env.local` file:

```bash
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

### Step 4: Initialize Firebase in Auth Context

Update `src/store/auth-context.tsx`:

```typescript
import { pushNotificationService } from '@/services/pushNotificationService';
import { SecureStorageService } from '@/utils/security/secureStorageService';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // ... existing code ...

  useEffect(() => {
    const initializePushNotifications = async () => {
      try {
        const secureStorage = new SecureStorageService();
        await pushNotificationService.initialize(secureStorage);
        console.log('Push notifications initialized');
      } catch (error) {
        console.error('Failed to initialize push notifications:', error);
      }
    };

    initializePushNotifications();

    return () => {
      pushNotificationService.cleanup();
    };
  }, []);

  // ... rest of component ...
};
```

### Step 5: Add Notification Center to Navigation

Update your navigation stack:

```typescript
import { NotificationCenterScreen } from '@/screens/notifications/NotificationCenterScreen';

// In your navigator:
<Stack.Screen
  name="NotificationCenter"
  component={NotificationCenterScreen}
  options={{
    title: 'Notifications',
  }}
/>
```

### Step 6: Request iOS Notification Permissions (if needed)

For iOS 13+, users must grant permission. Add to app initialization:

```typescript
import { Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';

// Request permission on first app launch
async function requestNotificationPermission() {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Notification permissions granted');
    }
  } catch (error) {
    console.error('Failed to request notification permission:', error);
  }
}
```

## Configuration

### Notification Types

```typescript
enum NotificationType {
  TRANSACTION = 'transaction',  // Financial transaction notifications
  ALERT = 'alert',              // Critical alerts
  UPDATE = 'update',             // App updates
  INFO = 'info',                 // General information
}
```

### Notification Priority

```typescript
enum NotificationPriority {
  LOW = 'low',        // Non-urgent, no sound/vibration
  NORMAL = 'normal',  // Standard priority
  HIGH = 'high',      // Urgent, play sound/vibration
}
```

### Notification Payload Structure

```typescript
interface NotificationPayload {
  id: string;                      // Unique notification ID
  title: string;                   // Notification title
  body: string;                    // Notification body/message
  type: NotificationType;          // Notification category
  priority?: NotificationPriority; // Priority level
  deepLink?: string;               // Navigation path
  data?: Record<string, any>;      // Custom data
  sound?: boolean;                 // Play sound (default: true)
  vibrate?: boolean;               // Vibrate (default: true)
  badge?: number;                  // Badge count
  timestamp?: number;              // Message timestamp
  read?: boolean;                  // Read status
  dismissed?: boolean;             // Dismissed status
}
```

## API Reference

### PushNotificationService Methods

#### Initialization

```typescript
// Initialize the service (call once on app startup)
await pushNotificationService.initialize(secureStorage: SecureStorageService)
```

#### Token Management

```typescript
// Get current FCM token
const token = pushNotificationService.getFCMToken(): string | null

// Force token refresh
const newToken = await pushNotificationService.refreshToken(): Promise<string | null>
```

#### Permission Management

```typescript
// Get current permission status
const status = pushNotificationService.getPermissionStatus()
// Returns: 'granted' | 'denied' | 'undetermined'
```

#### Notification History

```typescript
// Get notification history
const notifications = await pushNotificationService.getNotificationHistory(limit?: number)
// Default limit: 20

// Mark notification as read
await pushNotificationService.markAsRead(notificationId: string)

// Delete notification
await pushNotificationService.deleteNotification(notificationId: string)

// Clear all notifications
await pushNotificationService.clearAll()
```

#### Unread Count

```typescript
// Get unread notification count
const count = pushNotificationService.getUnreadCount(): number
```

#### Subscriptions

```typescript
// Subscribe to notifications of specific type
const unsubscribe = pushNotificationService.onNotification(
  type: NotificationType | 'all',
  handler: (notification: NotificationPayload) => void
)
// Returns unsubscribe function

// Subscribe to permission changes
const unsubscribe = pushNotificationService.onPermissionChange(
  handler: (status: 'granted' | 'denied') => void
)
// Returns unsubscribe function
```

#### Cleanup

```typescript
// Unsubscribe from all listeners (call on app exit)
pushNotificationService.cleanup()
```

### useNotifications Hook

Complete hook for notification management in components:

```typescript
const {
  unreadCount,           // Current unread count
  permissionStatus,      // 'granted' | 'denied' | 'undetermined'
  isInitialized,        // Service initialization status
  fcmToken,             // Current FCM token
  getNotificationHistory,
  markAsRead,
  deleteNotification,
  clearAll,
  requestPermissions,
  refreshToken,
  onNotification,       // Subscribe to notifications
  onPermissionChange,   // Subscribe to permission changes
} = useNotifications()
```

### Additional Hooks

```typescript
// Listen to specific notification type
useNotificationListener(
  type: NotificationType | 'all',
  callback: (notification: NotificationPayload) => void
)

// Track unread count
const unreadCount = useUnreadNotifications(): number

// Get current FCM token
const token = useFCMToken(): string | null
```

## Usage Examples

### Example 1: Initialize in Auth Context

```typescript
// src/store/auth-context.tsx
import { pushNotificationService } from '@/services/pushNotificationService';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  useEffect(() => {
    const initializePushNotifications = async () => {
      try {
        const secureStorage = new SecureStorageService();
        await pushNotificationService.initialize(secureStorage);
      } catch (error) {
        console.error('FCM initialization failed:', error);
      }
    };

    initializePushNotifications();

    return () => pushNotificationService.cleanup();
  }, []);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Example 2: Display Unread Badge in Navigation

```typescript
import { useUnreadNotifications } from '@/hooks/useNotifications';

function HeaderRight() {
  const unreadCount = useUnreadNotifications();

  return (
    <TouchableOpacity>
      <MaterialCommunityIcons name="bell" size={24} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
```

### Example 3: Handle Transaction Notifications

```typescript
import { useNotificationListener } from '@/hooks/useNotifications';
import { NotificationType } from '@/services/pushNotificationService';

function TransactionScreen() {
  const navigation = useNavigation();

  useNotificationListener(NotificationType.TRANSACTION, (notification) => {
    // Handle transaction notification
    console.log('Transaction received:', notification);

    // Optionally navigate to transaction details
    if (notification.data?.transactionId) {
      navigation.navigate('TransactionDetails', {
        id: notification.data.transactionId,
      });
    }
  });

  return (
    // Component JSX
  );
}
```

### Example 4: Custom Notification Handler

```typescript
import { useNotifications } from '@/hooks/useNotifications';

function MyComponent() {
  const { onNotification } = useNotifications();

  useEffect(() => {
    // Subscribe to all notifications
    const unsubscribe = onNotification('all', (notification) => {
      console.log('Notification received:', notification);

      // Show toast, play sound, etc.
      showToast({
        message: notification.title,
        type: notification.type,
      });
    });

    return unsubscribe;
  }, [onNotification]);

  return (
    // Component JSX
  );
}
```

### Example 5: Manage Notification Permissions

```typescript
import { useNotifications } from '@/hooks/useNotifications';

function SettingsScreen() {
  const { permissionStatus, onPermissionChange } = useNotifications();

  useEffect(() => {
    const unsubscribe = onPermissionChange((status) => {
      console.log('Permission changed:', status);
    });

    return unsubscribe;
  }, [onPermissionChange]);

  return (
    <View>
      <Text>
        Notification Permission: {permissionStatus}
      </Text>
    </View>
  );
}
```

## Notification Center

The Notification Center Screen (`NotificationCenterScreen`) provides a full-featured UI for managing notifications:

### Features

- **Notification List**: Display recent notifications with formatting
- **Type Filtering**: Filter by notification type (All, Transactions, Alerts, Updates)
- **Mark as Read**: Click to mark individual notifications as read
- **Delete**: Swipe or tap to delete notifications
- **Unread Badge**: Shows count of unread notifications
- **Deep Linking**: Tap notification to navigate to relevant screen
- **Refresh**: Pull-to-refresh to reload notifications
- **Empty State**: User-friendly message when no notifications

### Integration

Add to your navigation:

```typescript
import { NotificationCenterScreen } from '@/screens/notifications/NotificationCenterScreen';

<Stack.Screen
  name="NotificationCenter"
  component={NotificationCenterScreen}
/>
```

Navigate to it from your nav menu:

```typescript
navigation.navigate('NotificationCenter')
```

## Offline Queuing

Messages received while app is closed are automatically queued and processed when the app returns to foreground:

### How It Works

1. Messages are stored in AsyncStorage when app is in background
2. When app returns to foreground, queued messages are processed
3. Failed messages are retried with exponential backoff
4. Max 3 retry attempts per message
5. Messages older than 30 days are automatically cleaned up

### Configuration

Adjust in `pushNotificationService.ts`:

```typescript
const MAX_QUEUED_NOTIFICATIONS = 100;          // Max queued messages
const MAX_RETRY_ATTEMPTS = 3;                  // Max retries
const RETRY_BACKOFF_MS = 5000;                 // Initial backoff (5s)
const NOTIFICATION_RETENTION_DAYS = 30;        // Keep 30 days history
```

### Monitoring Queued Notifications

```typescript
// Get queued notifications count
const { queuedNotifications } = useNotifications();
console.log(`${queuedNotifications.length} notifications queued`);
```

## Analytics Integration

All notification events are automatically tracked for analytics:

### Tracked Events

```typescript
// Notification received (foreground)
EventType.NOTIFICATION_RECEIVED: {
  notificationId: string;
  type: NotificationType;
  priority: NotificationPriority;
  timestamp: number;
}

// Notification opened (tapped)
EventType.NOTIFICATION_OPENED: {
  notificationId: string;
  type: NotificationType;
  deepLink?: string;
}

// Notification dismissed
EventType.NOTIFICATION_DISMISSED: {
  notificationId: string;
  type: NotificationType;
}

// Permission granted/denied
FEATURE_USED: {
  feature: 'notification_permissions';
  status: 'granted' | 'denied';
}
```

### View Analytics

Check analytics dashboard for notification metrics:

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function AnalyticsDashboard() {
  const analytics = useAnalytics();

  // Access notification events
  const notificationMetrics = analytics.getEventsByType('NOTIFICATION_RECEIVED');

  return (
    // Display metrics
  );
}
```

## Troubleshooting

### Issue: FCM Token Not Obtained

**Symptom**: `getFCMToken()` returns null

**Solutions**:
1. Verify Firebase project is set up and messaging is enabled
2. Check `app.json` has correct Firebase configuration
3. Ensure environment variables are set
4. Check device has Google Play Services installed (Android)
5. Check iOS has APNs certificate configured

```typescript
// Debug
const token = await pushNotificationService.refreshToken();
if (!token) {
  console.warn('Failed to obtain FCM token');
}
```

### Issue: Permissions Not Requested on iOS

**Symptom**: iOS app doesn't show permission dialog

**Solutions**:
1. Check `app.json` has iOS configuration
2. Run `eas build --platform ios` for EAS build
3. Call `requestPermission()` explicitly
4. Check `NSUserNotificationsCenterUsageDescription` in Info.plist

### Issue: Notifications Not Received in Foreground

**Symptom**: Foreground messages don't appear

**Solutions**:
1. Verify `onMessage` listener is registered
2. Check notification permissions are granted
3. Ensure `push_notification_service.initialize()` was called
4. Check that handler is subscribed properly

```typescript
// Test handler
const unsubscribe = pushNotificationService.onNotification('all', (notif) => {
  console.log('Notification received!', notif);
});
```

### Issue: Background Messages Not Processing

**Symptom**: Messages received while app is closed don't appear

**Solutions**:
1. Ensure app has notification permissions
2. Check AsyncStorage queuing is working
3. Verify FCM message has valid notification payload
4. Check device power saving mode isn't blocking notifications

### Issue: Permission Status Not Updating

**Symptom**: `getPermissionStatus()` stays 'undetermined'

**Solutions**:
1. Delete and reinstall app
2. Check iOS notification settings in Settings > [App Name]
3. Explicitly call `requestPermission()` via Firebase
4. Check `onPermissionChange` handlers are registered

### Issue: Unread Count Not Updating

**Symptom**: Unread badge doesn't update

**Solutions**:
1. Verify notifications are being received
2. Check AsyncStorage UNREAD_COUNT key
3. Ensure `markAsRead()` is called
4. Try clearing and reopening app

### Debug Logging

Enable detailed logging:

```typescript
// In pushNotificationService.ts, check logger calls
import { logger } from '@/utils/logger';

// Check logs with:
adb logcat | grep "PushNotificationService"  // Android
or
xcrun simctl spawn booted log stream --predicate 'eventMessage contains "PushNotificationService"'  // iOS
```

## Best Practices

### 1. Initialize Early

Initialize push notifications early in app lifecycle (in AuthProvider or App.tsx):

```typescript
useEffect(() => {
  const secureStorage = new SecureStorageService();
  pushNotificationService.initialize(secureStorage);
}, []);
```

### 2. Always Clean Up

Remove listeners when component unmounts:

```typescript
useEffect(() => {
  const unsubscribe = pushNotificationService.onNotification('all', handler);
  return unsubscribe;
}, []);
```

### 3. Use Typed Notification Payloads

Always send complete notification payloads from backend:

```json
{
  "notification": {
    "title": "Transaction Received",
    "body": "$100.00 transferred"
  },
  "data": {
    "notificationId": "notif_123",
    "type": "transaction",
    "priority": "high",
    "deepLink": "/transactions/txn_123",
    "customData": "{\"transactionId\": \"txn_123\"}"
  }
}
```

### 4. Handle Deep Links Properly

Always validate deep links before navigation:

```typescript
useNotificationListener('all', (notification) => {
  if (notification.deepLink) {
    try {
      navigation.navigate(notification.deepLink, notification.data);
    } catch (error) {
      console.error('Invalid deep link:', notification.deepLink);
    }
  }
});
```

### 5. Respect User Preferences

Always check and respect notification permission status:

```typescript
const { permissionStatus } = useNotifications();

if (permissionStatus === 'denied') {
  // Don't try to show notifications
} else if (permissionStatus === 'undetermined') {
  // Offer to enable notifications
}
```

### 6. Monitor Queued Notifications

Monitor offline queuing to catch sync issues:

```typescript
useEffect(() => {
  // Check queued count periodically
  const interval = setInterval(() => {
    const queuedCount = pushNotificationService.getUnreadCount();
    if (queuedCount > 10) {
      console.warn(`High queued notification count: ${queuedCount}`);
    }
  }, 60000); // Check every minute

  return () => clearInterval(interval);
}, []);
```

### 7. Test Notifications

Use Firebase Console to send test notifications:

1. Go to Firebase Console > Cloud Messaging
2. Create new campaign
3. Select your app
4. Send test message to device

### 8. Monitor Analytics

Track notification engagement:

```typescript
// Check notification open rate
const events = analyticsService.getEventsByType('NOTIFICATION_OPENED');
const openRate = events.length / totalNotificationsSent;
```

### 9. Handle Network Errors Gracefully

Offline queuing handles failed sends automatically, but monitor:

```typescript
// In analytics, check for notification errors
const errors = analyticsService.getEventsByType('ERROR_OCCURRED')
  .filter(e => e.properties.service === 'PushNotificationService');

if (errors.length > threshold) {
  // Alert monitoring system
}
```

### 10. Regular Token Refresh

FCM tokens can become invalid; refresh periodically:

```typescript
// Refresh token daily
useEffect(() => {
  const interval = setInterval(() => {
    pushNotificationService.refreshToken();
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  return () => clearInterval(interval);
}, []);
```

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review [Usage Examples](#usage-examples)
3. Check Firebase Documentation: https://firebase.google.com/docs/cloud-messaging
4. Check react-native-firebase: https://rnfirebase.io/messaging/usage

## Related Documentation

- [Phase 22.14 Security Hardening](../SECURITY.md)
- [Phase 22.13 Analytics & Monitoring](../ANALYTICS.md)
- [Firebase Setup Guide](../FIREBASE.md)

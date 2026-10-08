# Firebase Cloud Messaging Push Notifications

**Phase 22.15: Mobile-First Features - Complete Implementation**

Production-ready Firebase Cloud Messaging integration for CRMT React Native mobile app.

## Overview

This implementation provides:

- Direct FCM integration using `@react-native-firebase/messaging`
- Secure FCM token storage with SecureStorageService (Phase 22.14)
- Comprehensive offline message queuing with retry logic
- Deep linking support for notification-driven navigation
- Analytics integration with notification event tracking (Phase 22.13)
- Full notification center UI with filtering and management
- Unread notification badge tracking
- Type-safe TypeScript implementation with complete test coverage

## Files Implemented

### Core Service
- `src/services/pushNotificationService.ts` - Main FCM service (600+ lines)

### UI Components
- `src/screens/notifications/NotificationCenterScreen.tsx` - Full-featured notification center
- `src/screens/notifications/index.ts` - Screen exports

### Hooks
- `src/hooks/useNotifications.ts` - Complete notification management hook

### Tests
- `src/services/__tests__/pushNotificationService.test.ts` - 20+ comprehensive test cases

### Documentation
- `docs/PUSH_NOTIFICATIONS.md` - Complete API reference (1000+ lines)
- `docs/PUSH_NOTIFICATIONS_INTEGRATION.md` - Step-by-step setup guide
- `docs/PUSH_NOTIFICATIONS_EXAMPLES.md` - Real-world code examples
- `PUSH_NOTIFICATIONS_README.md` - This file

### Configuration Updates
- `app.json` - Firebase plugins and Android/iOS permissions
- `package.json` - Firebase dependencies
- `src/services/index.ts` - Service exports
- `src/hooks/index.ts` - Hook exports
- `src/utils/analytics/analyticsService.ts` - New notification event types

## Quick Start

### 1. Install Dependencies

```bash
cd mobile-app
npm install
```

### 2. Setup Firebase

1. Create Firebase project at https://console.firebase.google.com
2. Download `google-services.json` for Android
3. Download `GoogleService-Info.plist` for iOS
4. Set environment variables in `.env.local`:

```bash
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

### 3. Initialize in Auth Context

Update `src/store/auth-context.tsx`:

```typescript
import { pushNotificationService } from '@/services/pushNotificationService';
import { SecureStorageService } from '@/utils/security/secureStorageService';

// In AuthProvider useEffect:
useEffect(() => {
  if (state.status === 'authenticated') {
    const secureStorage = new SecureStorageService();
    pushNotificationService.initialize(secureStorage);
  }

  return () => pushNotificationService.cleanup();
}, [state.status]);
```

### 4. Add Notification Center to Navigation

```typescript
import { NotificationCenterScreen } from '@/screens/notifications';

<Stack.Screen
  name="NotificationCenter"
  component={NotificationCenterScreen}
  options={{ title: 'Notifications' }}
/>
```

### 5. Add Notification Bell to Header

```typescript
import { useUnreadNotifications } from '@/hooks/useNotifications';

// In header component:
const unreadCount = useUnreadNotifications();

<TouchableOpacity onPress={() => navigation.navigate('NotificationCenter')}>
  <MaterialCommunityIcons name="bell" size={24} />
  {unreadCount > 0 && <Badge text={unreadCount} />}
</TouchableOpacity>
```

## Features

### Notification Types
- **TRANSACTION** - Financial transaction updates
- **ALERT** - Critical alerts
- **UPDATE** - App updates
- **INFO** - General information

### Notification States
- **Foreground** - App in focus, shows in notification center
- **Background** - App in background, shows native notification
- **Terminated** - App not running, queued until app opens

### Key Capabilities
- ✅ Secure FCM token storage (encrypted)
- ✅ Automatic permission requests (iOS/Android)
- ✅ Offline message queuing with AsyncStorage
- ✅ Exponential backoff retry logic (max 3 retries)
- ✅ Deep linking to relevant screens
- ✅ Notification grouping by type
- ✅ Unread badge counting
- ✅ Mark as read/unread
- ✅ Delete notifications
- ✅ Full notification history (30 days)
- ✅ Analytics event tracking
- ✅ Sound and vibration configuration
- ✅ FCM token auto-refresh
- ✅ App state change handling

## API Reference

### useNotifications Hook

```typescript
const {
  unreadCount,              // number
  permissionStatus,         // 'granted' | 'denied' | 'undetermined'
  isInitialized,           // boolean
  fcmToken,                // string | null
  getNotificationHistory,  // (limit?: number) => Promise<NotificationPayload[]>
  markAsRead,             // (id: string) => Promise<void>
  deleteNotification,     // (id: string) => Promise<void>
  clearAll,               // () => Promise<void>
  requestPermissions,     // () => Promise<void>
  refreshToken,           // () => Promise<string | null>
  onNotification,         // (type, handler) => unsubscribe
  onPermissionChange,     // (handler) => unsubscribe
} = useNotifications();
```

### Additional Hooks

```typescript
// Listen to specific notification type
useNotificationListener(NotificationType.TRANSACTION, (notif) => {
  // Handle transaction notification
})

// Get unread count
const count = useUnreadNotifications()

// Get FCM token
const token = useFCMToken()
```

### PushNotificationService

```typescript
// Initialize (must call on app startup)
await pushNotificationService.initialize(secureStorage)

// Get FCM token
const token = pushNotificationService.getFCMToken()

// Get permission status
const status = pushNotificationService.getPermissionStatus()

// Get unread count
const count = pushNotificationService.getUnreadCount()

// Get notification history
const notifications = await pushNotificationService.getNotificationHistory(limit)

// Mark as read
await pushNotificationService.markAsRead(notificationId)

// Delete
await pushNotificationService.deleteNotification(notificationId)

// Clear all
await pushNotificationService.clearAll()

// Subscribe to notifications
const unsubscribe = pushNotificationService.onNotification(type, handler)

// Cleanup on exit
pushNotificationService.cleanup()
```

## Test Coverage

Run tests:

```bash
npm test -- pushNotificationService.test
npm test -- pushNotificationService.test --coverage
```

Test coverage includes:

- ✅ Service initialization and re-initialization
- ✅ FCM token management
- ✅ Permission requesting and persistence
- ✅ Message handling (foreground/background/terminated)
- ✅ Notification storage and history
- ✅ Unread count tracking
- ✅ Offline message queuing
- ✅ Handler subscriptions and cleanup
- ✅ Deep linking
- ✅ Error handling
- ✅ Analytics integration
- ✅ State management

## Documentation

### For Setup Instructions
See: `docs/PUSH_NOTIFICATIONS_INTEGRATION.md`

### For Complete API Reference
See: `docs/PUSH_NOTIFICATIONS.md`

### For Code Examples
See: `docs/PUSH_NOTIFICATIONS_EXAMPLES.md`

## Testing Notifications

### 1. From Firebase Console

1. Go to Firebase Console > Cloud Messaging
2. Click "Send your first message"
3. Enter notification details
4. Select target audience
5. Publish

### 2. Test Payload

```json
{
  "notification": {
    "title": "Test Transaction",
    "body": "$100.00 received"
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

## Troubleshooting

### Common Issues

**FCM Token Not Obtained**
- Check Firebase project messaging is enabled
- Verify google-services.json is valid
- Ensure notification permissions are granted
- Check device has Google Play Services (Android)

**Notifications Not Received**
- Verify app has notification permissions
- Check FCM token is registered on backend
- Ensure notification payload is valid
- Check app state (foreground/background/terminated)

**Permission Not Requested on iOS**
- Check app.json has iOS configuration
- Build with `eas build --platform ios`
- Check iOS notification settings

See `docs/PUSH_NOTIFICATIONS.md` for detailed troubleshooting.

## Performance

- **Token Storage**: Encrypted, secure storage via SecureStorageService
- **Message Queuing**: AsyncStorage with max 100 queued notifications
- **Retry Logic**: Exponential backoff with max 3 attempts
- **Cleanup**: Auto-removes notifications older than 30 days
- **Token Refresh**: Auto-refresh every 30 days
- **Memory**: Minimal footprint with listener cleanup on unmount

## Security

- FCM tokens encrypted and stored securely
- PBKDF2 key derivation for encryption
- Secure storage via expo-secure-store
- GDPR-compliant with privacy controls
- Analytics privacy respecting user preferences

## Analytics

Automatic event tracking for:

- `NOTIFICATION_RECEIVED` - Foreground notification
- `NOTIFICATION_OPENED` - Notification tapped
- `NOTIFICATION_DISMISSED` - Notification dismissed
- `FEATURE_USED` - Permission granted/denied
- `ERROR_OCCURRED` - Service errors

## Related Phases

- **Phase 22.13**: Analytics & Monitoring integration
- **Phase 22.14**: Security Hardening with SecureStorageService
- **Phase 22.15**: Mobile-First Features (this phase)

## Support

For issues or questions:

1. Review troubleshooting in `docs/PUSH_NOTIFICATIONS.md`
2. Check examples in `docs/PUSH_NOTIFICATIONS_EXAMPLES.md`
3. Run tests to verify setup
4. Check Firebase documentation: https://firebase.google.com/docs/cloud-messaging
5. Check react-native-firebase: https://rnfirebase.io/messaging

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│              App (React Native)                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │  Components using Notifications         │   │
│  │  - Header (unread badge)                │   │
│  │  - Screens (listeners)                  │   │
│  │  - NotificationCenterScreen             │   │
│  └────────────┬─────────────────────────────┘   │
│               │                                 │
│  ┌────────────▼─────────────────────────────┐   │
│  │  useNotifications Hook                   │   │
│  │  - State management                      │   │
│  │  - History retrieval                     │   │
│  │  - Mark read/delete                      │   │
│  └────────────┬─────────────────────────────┘   │
│               │                                 │
│  ┌────────────▼─────────────────────────────┐   │
│  │  PushNotificationService (Singleton)     │   │
│  │  - FCM token management                  │   │
│  │  - Message handling (all states)         │   │
│  │  - Offline queuing                       │   │
│  │  - Notification storage                  │   │
│  │  - Handler subscriptions                 │   │
│  └────────────┬────────────┬──────────────┬─┘   │
│               │            │              │     │
│  ┌────────────▼──┐  ┌──────▼─────┐  ┌──▼────┐  │
│  │SecureStorage  │  │AsyncStorage │  │FireBase│  │
│  │(FCM tokens)   │  │(Queued msg) │  │(Cloud) │  │
│  └───────────────┘  └─────────────┘  └────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
         Firebase Cloud Messaging (FCM)
```

## Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `pushNotificationService.ts` | 650+ | Core FCM service |
| `NotificationCenterScreen.tsx` | 400+ | Notification UI |
| `useNotifications.ts` | 150+ | Notification hook |
| `pushNotificationService.test.ts` | 600+ | Test suite |
| `PUSH_NOTIFICATIONS.md` | 1000+ | Complete documentation |
| `PUSH_NOTIFICATIONS_INTEGRATION.md` | 500+ | Setup guide |
| `PUSH_NOTIFICATIONS_EXAMPLES.md` | 700+ | Code examples |

**Total Implementation: 4000+ lines of production-ready code**

## Version History

- **v1.0.0** (Phase 22.15) - Initial implementation with full FCM support

## License

See project LICENSE file

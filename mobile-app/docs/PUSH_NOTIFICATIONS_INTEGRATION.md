# Push Notifications Integration Guide

**Phase 22.15: Mobile-First Features - Implementation Steps**

This guide walks you through integrating Firebase Cloud Messaging push notifications into your CRMT mobile app.

## Prerequisites

- Firebase project created and configured
- Google Cloud Console access
- Android app registered with Firebase (for google-services.json)
- iOS app registered with Firebase (for APNs certificate)
- React Native Firebase CLI installed

## Step-by-Step Integration

### Step 1: Install Firebase Cloud Messaging Package

```bash
cd mobile-app

# Install react-native-firebase
npm install @react-native-firebase/app @react-native-firebase/messaging

# Or with yarn
yarn add @react-native-firebase/app @react-native-firebase/messaging
```

### Step 2: Configure Firebase Credentials

#### For Android:

1. Get `google-services.json` from Firebase Console:
   - Go to Project Settings > Your Apps > Android
   - Download `google-services.json`

2. Place it in your project:
   ```bash
   # If using Expo (EAS), place in project root
   cp ~/Downloads/google-services.json ./mobile-app/
   ```

#### For iOS:

1. Get `GoogleService-Info.plist` from Firebase Console:
   - Go to Project Settings > Your Apps > iOS
   - Download `GoogleService-Info.plist`

2. In Xcode, add it to your project:
   ```bash
   # If using EAS, you can skip this - Firebase will be initialized via JS
   ```

### Step 3: Set Environment Variables

Create `.env.local` file in the mobile-app root:

```bash
# Firebase Configuration
FIREBASE_API_KEY=your_api_key_here
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
```

**Get these values from:**
- Firebase Console > Project Settings > Your apps > Web > firebaseConfig

### Step 4: Update app.json Configuration

The app.json has already been updated with:

```json
{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/messaging"
    ]
  }
}
```

Verify these plugins are present and the Firebase config variables are set.

### Step 5: Initialize Push Notifications in Auth Context

Update `src/store/auth-context.tsx`:

```typescript
import React, { createContext, useEffect, useReducer } from 'react';
import { pushNotificationService } from '@/services/pushNotificationService';
import { SecureStorageService } from '@/utils/security/secureStorageService';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const tokenManagerRef = React.useRef<TokenManager | null>(null);
  const secureStorageRef = React.useRef<SecureStorageService | null>(null);

  // ... existing code ...

  // Initialize Push Notifications
  useEffect(() => {
    const initializePushNotifications = async () => {
      try {
        secureStorageRef.current = new SecureStorageService();
        await pushNotificationService.initialize(secureStorageRef.current);
        console.log('[AuthContext] Push notifications initialized');
      } catch (error) {
        console.error('[AuthContext] Failed to initialize push notifications:', error);
        // Continue app even if push notifications fail to initialize
      }
    };

    // Initialize after user is authenticated
    if (state.status === 'authenticated') {
      initializePushNotifications();
    }

    return () => {
      // Cleanup on unmount
      pushNotificationService.cleanup();
    };
  }, [state.status]);

  // ... rest of component ...

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Step 6: Add Notification Center to Navigation

Update your main navigation file (e.g., `src/navigation/RootNavigator.tsx`):

```typescript
import { NotificationCenterScreen } from '@/screens/notifications';

export const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        {/* ... other screens ... */}

        {/* Notification Center */}
        <Stack.Screen
          name="NotificationCenter"
          component={NotificationCenterScreen}
          options={{
            title: 'Notifications',
            headerShown: true,
          }}
        />

        {/* ... other screens ... */}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
```

### Step 7: Add Notification Bell to Header

Update your navigation header component (e.g., `src/components/Header.tsx`):

```typescript
import { useUnreadNotifications } from '@/hooks/useNotifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const Header: React.FC = ({ navigation }) => {
  const unreadCount = useUnreadNotifications();

  return (
    <View style={styles.header}>
      {/* ... other header content ... */}

      <TouchableOpacity
        onPress={() => navigation.navigate('NotificationCenter')}
        style={styles.notificationButton}
      >
        <MaterialCommunityIcons
          name="bell"
          size={24}
          color="#1a1a2e"
        />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  notificationButton: {
    padding: 8,
    marginRight: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
```

### Step 8: Setup Deep Linking Handler

Add deep link navigation in your notification setup:

```typescript
// In auth-context.tsx or a separate module
import { NavigationContainerRef } from '@react-navigation/native';
import { pushNotificationService } from '@/services/pushNotificationService';

export const setupNotificationNavigation = (
  navigationRef: React.RefObject<NavigationContainerRef<any>>
) => {
  pushNotificationService.onNotification('all', (notification) => {
    if (notification.deepLink && navigationRef.current) {
      try {
        navigationRef.current.navigate(
          notification.deepLink,
          notification.data
        );
      } catch (error) {
        console.error('Failed to navigate from notification:', error);
      }
    }
  });
};
```

Call this in your main App component:

```typescript
const navigationRef = useRef<NavigationContainerRef<any>>(null);

useEffect(() => {
  setupNotificationNavigation(navigationRef);
}, []);

return (
  <NavigationContainer ref={navigationRef}>
    {/* ... navigation structure ... */}
  </NavigationContainer>
);
```

### Step 9: Add Permission Request (Optional)

Explicitly request permissions on app start (optional, as they're requested during initialization):

```typescript
import { useEffect } from 'react';
import { Alert } from 'react-native';
import messaging from '@react-native-firebase/messaging';

export const useNotificationPermission = () => {
  useEffect(() => {
    const requestPermission = async () => {
      try {
        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log('Notification permission granted');
        }
      } catch (error) {
        console.error('Permission request failed:', error);
      }
    };

    requestPermission();
  }, []);
};
```

Use in your main screen:

```typescript
export const MainScreen: React.FC = () => {
  useNotificationPermission();

  return (
    // Component JSX
  );
};
```

### Step 10: Handle Notifications in Screens

Listen for specific notification types in your screens:

```typescript
import { useNotificationListener } from '@/hooks/useNotifications';
import { NotificationType } from '@/services/pushNotificationService';

export const TransactionScreen: React.FC = () => {
  const navigation = useNavigation();

  // Listen for transaction notifications
  useNotificationListener(NotificationType.TRANSACTION, (notification) => {
    console.log('Transaction notification received:', notification);

    // Auto-navigate to transaction details
    if (notification.data?.transactionId) {
      navigation.navigate('TransactionDetails', {
        id: notification.data.transactionId,
      });
    }

    // Or show a toast
    Toast.show({
      type: 'success',
      text1: notification.title,
      text2: notification.body,
    });
  });

  return (
    // Component JSX
  );
};
```

## Sending Test Notifications

### From Firebase Console:

1. Go to Firebase Console > Cloud Messaging
2. Click "Send your first message"
3. Enter notification details:
   - Title: "Test Notification"
   - Body: "This is a test"
   - Additional options (optional):
     - Sound: "default"
     - Badge: "1"
     - Click action: "/transactions/test_id"
4. Select target (user segment, topic, or device)
5. Review and publish

### Using Firebase Admin SDK (Node.js):

```typescript
import admin from 'firebase-admin';

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const message = {
  notification: {
    title: 'Test Notification',
    body: 'This is a test from Admin SDK',
  },
  data: {
    notificationId: 'test_123',
    type: 'transaction',
    priority: 'high',
    deepLink: '/transactions/test_id',
    customData: JSON.stringify({ transactionId: 'test_id' }),
  },
  topic: 'all_users', // or specific device token
};

admin.messaging().send(message)
  .then((response) => {
    console.log('Successfully sent message:', response);
  })
  .catch((error) => {
    console.log('Error sending message:', error);
  });
```

## Build and Deploy

### For EAS Build:

```bash
# Ensure google-services.json is in project root
# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

### For Local Development:

```bash
# Start Expo server
npm start

# Run on Android device/emulator
npm run android

# Run on iOS simulator
npm run ios
```

## Verification Checklist

After integration, verify:

- [ ] Push Notification Service initializes without errors
- [ ] FCM token is obtained and stored securely
- [ ] Notification permissions are requested and granted
- [ ] Test notification received in foreground (shows in Notification Center)
- [ ] Test notification received in background (shows native notification)
- [ ] Tapping notification navigates to correct screen
- [ ] Unread badge displays correct count
- [ ] Marking as read updates count
- [ ] Deleting notification removes it
- [ ] Clear All button works
- [ ] Offline notifications are queued and synced
- [ ] Analytics events are tracked

## Troubleshooting

### Build Fails with Firebase Error

```bash
# Clear build cache and rebuild
npm run build:android --clear

# Or use EAS clean build
eas build --platform android --clear
```

### Google Play Services Error (Android)

```bash
# Ensure project has Google Play Services installed
# Update google-services.json if needed
```

### iOS: "APS environment" Error

```bash
# Ensure app.json has iOS entitlements configured
# Firebase should auto-configure in Expo
```

### Token Not Obtained

```bash
# Check:
1. Firebase project messaging is enabled
2. google-services.json is valid
3. Device has Google Play Services (Android)
4. Notification permission is granted
```

See [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) for detailed troubleshooting.

## Next Steps

1. Test notifications with Firebase Console
2. Integrate notification sending from backend
3. Customize notification appearance (colors, sounds, etc.)
4. Set up notification topics for targeted messaging
5. Add notification scheduling
6. Monitor notification analytics

## Support

- Firebase Cloud Messaging Docs: https://firebase.google.com/docs/cloud-messaging
- React Native Firebase: https://rnfirebase.io/messaging/usage
- See [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) for API reference and examples

# Push Notifications Usage Examples

**Phase 22.15: Mobile-First Features - Code Examples**

Real-world examples of using the Push Notification Service in your app.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Component Examples](#component-examples)
3. [Screen Integration](#screen-integration)
4. [Advanced Usage](#advanced-usage)
5. [Backend Integration](#backend-integration)

## Basic Setup

### Initialize in Auth Context (Complete Example)

```typescript
// src/store/auth-context.tsx
import React, { createContext, useCallback, useEffect, useReducer } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushNotificationService } from '@/services/pushNotificationService';
import { SecureStorageService } from '@/utils/security/secureStorageService';
import { logger } from '@/utils/logger';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const secureStorageRef = React.useRef<SecureStorageService | null>(null);
  const appStateSubscriptionRef = React.useRef<any | null>(null);

  // Initialize Push Notifications after auth
  useEffect(() => {
    const initializePushNotifications = async () => {
      try {
        logger.info('Initializing push notifications...');

        // Create SecureStorageService for FCM token storage
        secureStorageRef.current = new SecureStorageService();

        // Initialize push notification service
        await pushNotificationService.initialize(secureStorageRef.current);

        // Get FCM token for backend registration
        const fcmToken = pushNotificationService.getFCMToken();
        if (fcmToken) {
          logger.info('FCM token obtained:', fcmToken.substring(0, 20) + '...');

          // Optional: Send token to backend
          // await api.user.registerDeviceToken({ token: fcmToken });
        }

        logger.info('Push notifications initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize push notifications:', error);
        // Don't throw - app should work without push notifications
      }
    };

    // Initialize when authenticated
    if (state.status === 'authenticated' && state.user) {
      initializePushNotifications();
    }

    return () => {
      pushNotificationService.cleanup();
    };
  }, [state.status, state.user]);

  // ... rest of provider code ...

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
```

## Component Examples

### Example 1: Notification Bell with Badge

```typescript
// src/components/NotificationBell.tsx
import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useUnreadNotifications } from '@/hooks/useNotifications';

export const NotificationBell: React.FC = () => {
  const navigation = useNavigation();
  const unreadCount = useUnreadNotifications();

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => navigation.navigate('NotificationCenter')}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialCommunityIcons
        name="bell-outline"
        size={24}
        color="#1a1a2e"
      />

      {/* Unread badge */}
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    padding: 8,
    position: 'relative',
    marginRight: 8,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F44336',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    lineHeight: 20,
  },
});
```

Use in header:

```typescript
// In navigation options
options={{
  headerRight: () => <NotificationBell />,
}}
```

### Example 2: Notification Toast Component

```typescript
// src/components/NotificationToast.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotificationListener } from '@/hooks/useNotifications';
import { NotificationType, NotificationPayload } from '@/services/pushNotificationService';

export const NotificationToast: React.FC = () => {
  const [notification, setNotification] = React.useState<NotificationPayload | null>(null);
  const slideAnim = React.useRef(new Animated.Value(-100)).current;

  useNotificationListener('all', (notif) => {
    setNotification(notif);
    showToast();
  });

  const showToast = () => {
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3000),
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  if (!notification) return null;

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.TRANSACTION:
        return 'cash';
      case NotificationType.ALERT:
        return 'alert-circle';
      case NotificationType.UPDATE:
        return 'cloud-upload';
      default:
        return 'bell';
    }
  };

  const getColor = (type: NotificationType) => {
    switch (type) {
      case NotificationType.TRANSACTION:
        return '#4CAF50';
      case NotificationType.ALERT:
        return '#F44336';
      case NotificationType.UPDATE:
        return '#2196F3';
      default:
        return '#9E9E9E';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={[styles.toast, { borderLeftColor: getColor(notification.type) }]}>
        <MaterialCommunityIcons
          name={getIcon(notification.type)}
          size={24}
          color={getColor(notification.type)}
        />
        <View style={styles.content}>
          <Text style={styles.title}>{notification.title}</Text>
          <Text style={styles.body}>{notification.body}</Text>
        </View>
        <TouchableOpacity onPress={() => setNotification(null)}>
          <MaterialCommunityIcons name="close" size={20} color="#999" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    gap: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  body: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
```

Add to your main app:

```typescript
<NavigationContainer>
  {/* ... navigation ... */}
  <NotificationToast />
</NavigationContainer>
```

### Example 3: Settings Screen with Notification Preferences

```typescript
// src/screens/settings/NotificationSettingsScreen.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, Text, Switch } from 'react-native';
import { useNotifications } from '@/hooks/useNotifications';
import { useAnalytics } from '@/hooks/useAnalytics';

export const NotificationSettingsScreen: React.FC = () => {
  const { permissionStatus, fcmToken, onPermissionChange } = useNotifications();
  const analytics = useAnalytics();

  const [notificationsEnabled, setNotificationsEnabled] = React.useState(
    permissionStatus === 'granted'
  );

  useEffect(() => {
    const unsubscribe = onPermissionChange((status) => {
      setNotificationsEnabled(status === 'granted');
    });

    return unsubscribe;
  }, [onPermissionChange]);

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      // User is turning off - show confirmation
      Alert.alert(
        'Disable Notifications?',
        'You can re-enable notifications in app settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disable',
            style: 'destructive',
            onPress: () => {
              setNotificationsEnabled(false);
              analytics.trackEvent({
                type: 'FEATURE_USED',
                properties: { action: 'disable_notifications' },
              });
            },
          },
        ]
      );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Settings</Text>

        {/* Notifications enabled */}
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Notifications</Text>
            <Text style={styles.settingDescription}>
              {notificationsEnabled
                ? 'Notifications are enabled'
                : 'Notifications are disabled'}
            </Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            trackColor={{ false: '#E0E0E0', true: '#81C784' }}
          />
        </View>

        {/* FCM Token Display */}
        {fcmToken && (
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Device Token (Registered)</Text>
              <Text style={styles.tokenText}>
                {fcmToken.substring(0, 20)}...
              </Text>
            </View>
          </View>
        )}

        {/* Notification Types */}
        <Text style={styles.sectionTitle}>Notification Types</Text>

        <View style={styles.notificationTypeGrid}>
          <NotificationTypeCard
            type="transaction"
            icon="cash"
            label="Transactions"
            description="Payment updates"
          />
          <NotificationTypeCard
            type="alert"
            icon="alert-circle"
            label="Alerts"
            description="Important alerts"
          />
          <NotificationTypeCard
            type="update"
            icon="cloud-upload"
            label="Updates"
            description="App updates"
          />
          <NotificationTypeCard
            type="info"
            icon="information"
            label="Info"
            description="General info"
          />
        </View>
      </View>
    </ScrollView>
  );
};

const NotificationTypeCard: React.FC<{
  type: string;
  icon: string;
  label: string;
  description: string;
}> = ({ type, icon, label, description }) => (
  <View style={styles.typeCard}>
    <MaterialCommunityIcons name={icon} size={32} color="#2196F3" />
    <Text style={styles.typeLabel}>{label}</Text>
    <Text style={styles.typeDescription}>{description}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1a1a2e',
  },
  settingDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  tokenText: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  notificationTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    gap: 8,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  typeDescription: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
});
```

## Screen Integration

### Example 4: Transaction List with Notification Integration

```typescript
// src/screens/transactions/TransactionListScreen.tsx
import React, { useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useNotificationListener } from '@/hooks/useNotifications';
import { NotificationType } from '@/services/pushNotificationService';

export const TransactionListScreen: React.FC = () => {
  const navigation = useNavigation();
  const [transactions, setTransactions] = React.useState([]);

  // Load transactions
  useEffect(() => {
    loadTransactions();
  }, []);

  // Listen for new transaction notifications
  useNotificationListener(NotificationType.TRANSACTION, (notification) => {
    // Auto-reload transactions when new transaction arrives
    loadTransactions();

    // Show alert to user
    Alert.alert(
      notification.title,
      notification.body,
      [
        { text: 'Dismiss' },
        {
          text: 'View',
          onPress: () => {
            if (notification.data?.transactionId) {
              navigation.navigate('TransactionDetails', {
                id: notification.data.transactionId,
              });
            }
          },
        },
      ]
    );
  });

  const loadTransactions = async () => {
    try {
      // Fetch transactions from API
      // setTransactions(data);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        onRefresh={loadTransactions}
        refreshing={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
});
```

## Advanced Usage

### Example 5: Notification Analytics Dashboard

```typescript
// src/screens/analytics/NotificationAnalyticsScreen.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAnalytics } from '@/hooks/useAnalytics';
import { EventType } from '@/utils/analytics/analyticsService';

export const NotificationAnalyticsScreen: React.FC = () => {
  const analytics = useAnalytics();
  const [stats, setStats] = React.useState({
    totalReceived: 0,
    totalOpened: 0,
    totalDismissed: 0,
    openRate: 0,
  });

  useEffect(() => {
    calculateStats();
  }, []);

  const calculateStats = async () => {
    const received = await analytics.getEventCount(EventType.NOTIFICATION_RECEIVED);
    const opened = await analytics.getEventCount(EventType.NOTIFICATION_OPENED);
    const dismissed = await analytics.getEventCount(EventType.NOTIFICATION_DISMISSED);

    const openRate = received > 0 ? Math.round((opened / received) * 100) : 0;

    setStats({
      totalReceived: received,
      totalOpened: opened,
      totalDismissed: dismissed,
      openRate,
    });
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Notification Analytics</Text>

      <StatCard label="Total Received" value={stats.totalReceived} />
      <StatCard label="Total Opened" value={stats.totalOpened} />
      <StatCard label="Total Dismissed" value={stats.totalDismissed} />
      <StatCard
        label="Open Rate"
        value={`${stats.openRate}%`}
        valueColor={stats.openRate > 50 ? '#4CAF50' : '#F44336'}
      />
    </ScrollView>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string | number;
  valueColor?: string;
}> = ({ label, value, valueColor = '#2196F3' }) => (
  <View style={styles.statCard}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  value: {
    fontSize: 28,
    fontWeight: 'bold',
  },
});
```

## Backend Integration

### Example 6: Register Device Token with Backend

```typescript
// src/api/deviceTokenApi.ts
import { apiClient } from '@/api';

export interface RegisterDeviceTokenRequest {
  token: string;
  platform: 'ios' | 'android';
  appVersion: string;
}

export const registerDeviceToken = async (
  data: RegisterDeviceTokenRequest
): Promise<void> => {
  await apiClient.post('/user/device-tokens', data);
};

export const updateDeviceToken = async (
  oldToken: string,
  newToken: string
): Promise<void> => {
  await apiClient.post('/user/device-tokens/refresh', {
    oldToken,
    newToken,
  });
};
```

Use in auth context:

```typescript
// In AuthProvider initialization
useEffect(() => {
  const registerToken = async () => {
    try {
      const fcmToken = pushNotificationService.getFCMToken();
      if (fcmToken) {
        await registerDeviceToken({
          token: fcmToken,
          platform: Platform.OS as 'ios' | 'android',
          appVersion: '1.0.0',
        });
      }
    } catch (error) {
      logger.error('Failed to register device token:', error);
    }
  };

  if (state.status === 'authenticated') {
    registerToken();
  }
}, [state.status]);
```

### Example 7: Send Notification from Backend (Node.js)

```typescript
// backend/src/services/notificationService.ts
import admin from 'firebase-admin';

export interface SendNotificationOptions {
  userId: string;
  title: string;
  body: string;
  type: 'transaction' | 'alert' | 'update' | 'info';
  priority?: 'low' | 'normal' | 'high';
  deepLink?: string;
  data?: Record<string, string>;
}

export async function sendNotificationToUser(
  options: SendNotificationOptions
): Promise<string> {
  const { userId, title, body, type, priority = 'normal', deepLink, data } = options;

  // Get user's device tokens from database
  const tokens = await getUserDeviceTokens(userId);

  if (tokens.length === 0) {
    throw new Error(`No device tokens found for user ${userId}`);
  }

  // Build FCM message
  const message: admin.messaging.MulticastMessage = {
    notification: {
      title,
      body,
    },
    data: {
      notificationId: `notif_${Date.now()}`,
      type,
      priority,
      ...(deepLink && { deepLink }),
      ...(data && { customData: JSON.stringify(data) }),
      timestamp: String(Date.now()),
    },
    tokens,
  };

  // Add APNs configuration for iOS
  message.apns = {
    headers: {
      'apns-priority': priority === 'high' ? '10' : '5',
    },
    payload: {
      aps: {
        alert: {
          title,
          body,
        },
        badge: 1,
        sound: priority === 'high' ? 'default' : undefined,
      },
    },
  };

  // Add Android configuration
  message.android = {
    priority: priority === 'high' ? 'high' : 'normal',
    notification: {
      title,
      body,
      sound: priority === 'high' ? 'default' : undefined,
      defaultVibrateTimings: priority === 'high',
    },
  };

  // Send message
  const response = await admin.messaging().sendMulticast(message);

  if (response.failureCount > 0) {
    console.warn(`Failed to send notification to ${response.failureCount} devices`);

    // Remove invalid tokens
    response.responses.forEach((result, index) => {
      if (!result.success) {
        removeDeviceToken(userId, tokens[index]);
      }
    });
  }

  return `Sent to ${response.successCount} devices`;
}

// Helper functions
async function getUserDeviceTokens(userId: string): Promise<string[]> {
  // Query database
  const tokens = await db.collection('users').doc(userId).collection('deviceTokens').get();
  return tokens.docs.map((doc) => doc.id);
}

async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await db.collection('users').doc(userId).collection('deviceTokens').doc(token).delete();
}
```

## More Examples

See the [PUSH_NOTIFICATIONS.md](./PUSH_NOTIFICATIONS.md) file for:

- Complete API reference
- Configuration options
- Troubleshooting guide
- Best practices

See the [PUSH_NOTIFICATIONS_INTEGRATION.md](./PUSH_NOTIFICATIONS_INTEGRATION.md) file for:

- Step-by-step setup guide
- Build and deployment instructions
- Verification checklist

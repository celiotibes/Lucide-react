/**
 * Notification Center Screen
 * Phase 22.15: Mobile-First Features - Notification Center UI
 *
 * Features:
 * - Display list of recent notifications
 * - Mark as read/unread
 * - Delete notifications
 * - Navigate to relevant screens when notification tapped
 * - Group notifications by type
 * - Swipe actions for quick operations
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  SafeAreaView,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pushNotificationService, NotificationPayload, NotificationType } from '@/services/pushNotificationService';
import { useAnalytics } from '@/hooks/useAnalytics';
import { EventType } from '@/utils/analytics/analyticsService';
import { logger } from '@/utils/logger';

const { width } = Dimensions.get('window');
const NOTIFICATION_ITEM_HEIGHT = 80;

interface GroupedNotifications {
  [key: string]: NotificationPayload[];
}

type RootStackParamList = any;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NotificationItemProps {
  item: NotificationPayload;
  onPress: (notification: NotificationPayload) => void;
  onDelete: (notificationId: string) => void;
  onMarkAsRead: (notificationId: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  item,
  onPress,
  onDelete,
  onMarkAsRead,
}) => {
  const [swipeX] = React.useState(new Animated.Value(0));
  const [isDeleting, setIsDeleting] = React.useState(false);

  const getTypeColor = (type: NotificationType): string => {
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

  const getTypeIcon = (type: NotificationType): string => {
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

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await pushNotificationService.deleteNotification(item.id);
      onDelete(item.id);
    } catch (error) {
      logger.error('Failed to delete notification:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkAsRead = async () => {
    if (!item.read) {
      try {
        await pushNotificationService.markAsRead(item.id);
        onMarkAsRead(item.id);
      } catch (error) {
        logger.error('Failed to mark notification as read:', error);
      }
    }
  };

  const formatTime = (timestamp?: number): string => {
    if (!timestamp) return 'Now';

    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes}m ago`;
    }

    if (hours < 24) {
      return `${hours}h ago`;
    }

    return `${days}d ago`;
  };

  if (isDeleting) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[
        styles.notificationItem,
        !item.read && styles.unreadNotification,
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.typeIndicator,
          { backgroundColor: getTypeColor(item.type) },
        ]}
      />

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons
            name={getTypeIcon(item.type)}
            size={18}
            color={getTypeColor(item.type)}
            style={styles.icon}
          />
          <Text
            style={[
              styles.title,
              item.read && styles.readText,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
        </View>

        <Text
          style={[
            styles.body,
            item.read && styles.readText,
          ]}
          numberOfLines={2}
        >
          {item.body}
        </Text>
      </View>

      <View style={styles.actionButtons}>
        {!item.read && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleMarkAsRead}
          >
            <MaterialCommunityIcons
              name="check"
              size={20}
              color="#2196F3"
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleDelete}
        >
          <MaterialCommunityIcons
            name="trash-can-outline"
            size={20}
            color="#F44336"
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

export const NotificationCenterScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const analytics = useAnalytics();

  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [groupedNotifications, setGroupedNotifications] = useState<GroupedNotifications>({});
  const [loading, setLoading] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<NotificationType | 'all'>('all');

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const history = await pushNotificationService.getNotificationHistory(50);
      setNotifications(history);

      // Group by type
      const grouped: GroupedNotifications = {};
      history.forEach((notification) => {
        const type = notification.type || NotificationType.INFO;
        if (!grouped[type]) {
          grouped[type] = [];
        }
        grouped[type].push(notification);
      });
      setGroupedNotifications(grouped);

      analytics.trackEvent({
        type: EventType.SCREEN_VIEW,
        properties: {
          screen: 'NotificationCenter',
          notificationCount: history.length,
        },
      });
    } catch (error) {
      logger.error('Failed to load notifications:', error);
      analytics.trackEvent({
        type: EventType.ERROR_OCCURRED,
        properties: {
          screen: 'NotificationCenter',
          operation: 'loadNotifications',
          error: String(error),
        },
      });
    } finally {
      setLoading(false);
    }
  }, [analytics]);

  useEffect(() => {
    loadNotifications();

    // Subscribe to new notifications
    const unsubscribe = pushNotificationService.onNotification('all', () => {
      loadNotifications();
    });

    return unsubscribe;
  }, [loadNotifications]);

  const handleNotificationPress = (notification: NotificationPayload) => {
    // Update read status
    pushNotificationService.markAsRead(notification.id);

    // Track event
    analytics.trackEvent({
      type: EventType.NOTIFICATION_OPENED,
      properties: {
        notificationId: notification.id,
        type: notification.type,
      },
    });

    // Handle deep linking
    if (notification.deepLink) {
      try {
        navigation.navigate(notification.deepLink, notification.data);
      } catch (error) {
        logger.error('Failed to navigate from notification:', error);
      }
    }
  };

  const handleDeleteNotification = (notificationId: string) => {
    setNotifications((prev) =>
      prev.filter((n) => n.id !== notificationId)
    );
  };

  const handleMarkAsRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  };

  const handleClearAll = async () => {
    try {
      await pushNotificationService.clearAll();
      setNotifications([]);
      setGroupedNotifications({});
      analytics.trackEvent({
        type: EventType.FEATURE_USED,
        properties: {
          action: 'clear_all_notifications',
        },
      });
    } catch (error) {
      logger.error('Failed to clear all notifications:', error);
    }
  };

  const filteredNotifications =
    selectedFilter === 'all'
      ? notifications
      : notifications.filter((n) => n.type === selectedFilter);

  const getTypeLabel = (type: NotificationType | string): string => {
    switch (type) {
      case NotificationType.TRANSACTION:
        return 'Transactions';
      case NotificationType.ALERT:
        return 'Alerts';
      case NotificationType.UPDATE:
        return 'Updates';
      default:
        return 'Info';
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {notifications.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearAll}
          >
            <Text style={styles.clearButtonText}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        <ScrollableFilterTabs
          filters={['all', ...Object.keys(NotificationType)]}
          selectedFilter={selectedFilter}
          onSelectFilter={(filter) =>
            setSelectedFilter(filter as NotificationType | 'all')
          }
        />
      </View>

      {/* Unread badge */}
      {pushNotificationService.getUnreadCount() > 0 && (
        <View style={styles.unreadBadgeContainer}>
          <MaterialCommunityIcons
            name="bell-badge"
            size={20}
            color="#F44336"
          />
          <Text style={styles.unreadBadgeText}>
            {pushNotificationService.getUnreadCount()} unread
          </Text>
        </View>
      )}
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons
        name="bell-off"
        size={64}
        color="#BDBDBD"
      />
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptyText}>
        You're all caught up! New notifications will appear here.
      </Text>
    </View>
  );

  const renderNotificationItem: ListRenderItem<NotificationPayload> = ({
    item,
  }) => (
    <NotificationItem
      item={item}
      onPress={handleNotificationPress}
      onDelete={handleDeleteNotification}
      onMarkAsRead={handleMarkAsRead}
    />
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <FlatList
        data={filteredNotifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadNotifications}
            tintColor="#2196F3"
          />
        }
        contentContainerStyle={
          filteredNotifications.length === 0 ? styles.emptyContentContainer : {}
        }
      />
    </SafeAreaView>
  );
};

// Scrollable filter tabs component
interface FilterTabsProps {
  filters: (NotificationType | 'all')[];
  selectedFilter: NotificationType | 'all';
  onSelectFilter: (filter: NotificationType | 'all') => void;
}

const ScrollableFilterTabs: React.FC<FilterTabsProps> = ({
  filters,
  selectedFilter,
  onSelectFilter,
}) => {
  const getLabel = (type: NotificationType | 'all'): string => {
    if (type === 'all') return 'All';
    switch (type) {
      case NotificationType.TRANSACTION:
        return 'Transactions';
      case NotificationType.ALERT:
        return 'Alerts';
      case NotificationType.UPDATE:
        return 'Updates';
      default:
        return 'Info';
    }
  };

  return (
    <View style={styles.tabs}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.tab,
            selectedFilter === filter && styles.tabActive,
          ]}
          onPress={() => onSelectFilter(filter)}
        >
          <Text
            style={[
              styles.tabLabel,
              selectedFilter === filter && styles.tabLabelActive,
            ]}
          >
            {getLabel(filter)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#F5F5F5',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  filterContainer: {
    marginBottom: 8,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
  },
  tabActive: {
    backgroundColor: '#2196F3',
  },
  tabLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  unreadBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  unreadBadgeText: {
    fontSize: 12,
    color: '#F44336',
    fontWeight: '600',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 8,
    marginVertical: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#E0E0E0',
    minHeight: NOTIFICATION_ITEM_HEIGHT,
  },
  unreadNotification: {
    backgroundColor: '#F0F8FF',
    borderLeftColor: '#2196F3',
  },
  typeIndicator: {
    width: 4,
    height: 40,
    borderRadius: 2,
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  icon: {
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  time: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  body: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  readText: {
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  actionButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#F5F5F5',
  },
  emptyContentContainer: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});

/**
 * Network Status Indicator Component
 * Displays current network connectivity status
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '@/theme/colors';
import { NetworkMonitorService, NetworkStatus } from '@/services';

interface NetworkStatusIndicatorProps {
  compact?: boolean;
}

export const NetworkStatusIndicator: React.FC<NetworkStatusIndicatorProps> = ({
  compact = false,
}) => {
  const [status, setStatus] = useState<NetworkStatus | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  const monitorRef = React.useRef<NetworkMonitorService | null>(null);

  useEffect(() => {
    // Create monitor instance
    monitorRef.current = new NetworkMonitorService();

    // Subscribe to status changes
    const unsubscribe = monitorRef.current.subscribe((newStatus) => {
      setStatus(newStatus);
      setIsVisible(true);
      // Auto-hide when online
      if (newStatus.isOnline) {
        const timer = setTimeout(() => setIsVisible(false), 3000);
        return () => clearTimeout(timer);
      }
    });

    // Get initial status
    const initialStatus = monitorRef.current.getStatus();
    setStatus(initialStatus);
    setIsVisible(!initialStatus.isOnline);

    return () => {
      unsubscribe();
      monitorRef.current?.destroy();
    };
  }, []);

  if (!status || isVisible === false) {
    return null;
  }

  const isOnline = status.isOnline;
  const statusColor = isOnline ? Colors.online : Colors.offline;
  const statusIcon = isOnline ? 'cloud-done' : 'cloud-off';
  const statusText = isOnline
    ? `Online${status.connectionType ? ` • ${status.connectionType}` : ''}`
    : 'Offline';

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: statusColor }]}>
        <MaterialIcons name={statusIcon} size={16} color={Colors.white} />
        <Text
          style={[styles.compactText, { color: Colors.white }]}
          numberOfLines={1}
        >
          {statusText}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: statusColor }]}>
      <View style={styles.content}>
        <MaterialIcons name={statusIcon} size={20} color={Colors.white} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>{statusText}</Text>
          {!isOnline && (
            <Text style={styles.subtitle}>Changes will sync when connection restored</Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    gap: 6,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

/**
 * Sync Status Indicator Component
 * Displays current sync status, pending changes, and conflicts
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { Text, ProgressBar } from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '@/theme/colors';
import { useSyncManager } from '@/hooks/useSyncManager';

interface SyncStatusIndicatorProps {
  apiBaseURL: string;
  deviceId: string;
  compact?: boolean;
  onSyncPress?: () => void;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  apiBaseURL,
  deviceId,
  compact = false,
  onSyncPress,
}) => {
  const {
    syncStatus,
    isOnline,
    conflicts,
    isSyncing,
    error,
    performSync,
  } = useSyncManager({
    apiBaseURL,
    deviceId,
    autoSync: true,
    syncInterval: 300000,
  });

  const handleSyncPress = async () => {
    onSyncPress?.();
    await performSync();
  };

  const statusColor = isSyncing
    ? Colors.syncPending
    : error
      ? Colors.syncError
      : conflicts.length > 0
        ? Colors.syncWarning
        : Colors.syncSuccess;

  const statusIcon = isSyncing
    ? 'sync'
    : error
      ? 'error'
      : conflicts.length > 0
        ? 'warning'
        : 'check-circle';

  if (compact) {
    return (
      <Pressable
        style={[styles.compactContainer, { borderColor: statusColor }]}
        onPress={handleSyncPress}
        disabled={isSyncing}
      >
        <Animated.View
          style={isSyncing ? { transform: [{ rotate: '1turn' }] } : undefined}
        >
          <MaterialIcons name={statusIcon} size={16} color={statusColor} />
        </Animated.View>
        <Text style={styles.compactText} numberOfLines={1}>
          {isSyncing ? 'Syncing...' : 'Synced'}
        </Text>
        {syncStatus.pendingChanges > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{syncStatus.pendingChanges}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { borderLeftColor: statusColor }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <MaterialIcons name={statusIcon} size={20} color={statusColor} />
          <Text style={styles.title}>
            {isSyncing ? 'Syncing...' : 'Sync Status'}
          </Text>
        </View>
        {syncStatus.lastSyncTime > 0 && (
          <Text style={styles.timestamp}>
            Last sync: {new Date(syncStatus.lastSyncTime).toLocaleTimeString()}
          </Text>
        )}
      </View>

      {isSyncing && (
        <View style={styles.progressContainer}>
          <ProgressBar
            progress={syncStatus.syncProgress / 100}
            color={Colors.primary}
          />
          <Text style={styles.progressText}>
            {Math.round(syncStatus.syncProgress)}% complete
          </Text>
        </View>
      )}

      {syncStatus.pendingChanges > 0 && (
        <View style={styles.infoRow}>
          <MaterialIcons name="schedule" size={16} color={Colors.warning} />
          <Text style={styles.infoText}>
            {syncStatus.pendingChanges} pending change
            {syncStatus.pendingChanges !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {conflicts.length > 0 && (
        <View style={styles.infoRow}>
          <MaterialIcons name="priority-high" size={16} color={Colors.error} />
          <Text style={styles.infoText}>
            {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''} to
            resolve
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.infoRow}>
          <MaterialIcons name="error-outline" size={16} color={Colors.error} />
          <Text style={styles.infoText}>{error.message}</Text>
        </View>
      )}

      {!isOnline && (
        <View style={styles.infoRow}>
          <MaterialIcons name="cloud-off" size={16} color={Colors.offline} />
          <Text style={styles.infoText}>Offline - sync will resume online</Text>
        </View>
      )}

      <Pressable
        style={[styles.button, { opacity: isSyncing || !isOnline ? 0.6 : 1 }]}
        onPress={handleSyncPress}
        disabled={isSyncing || !isOnline}
      >
        <MaterialIcons name="refresh" size={16} color={Colors.primary} />
        <Text style={styles.buttonText}>
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderLeftWidth: 4,
    padding: 16,
    marginVertical: 8,
    borderRadius: 8,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  timestamp: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressText: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 12,
    borderRadius: 6,
    backgroundColor: Colors.surfaceVariant,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    backgroundColor: Colors.surface,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text,
  },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
});

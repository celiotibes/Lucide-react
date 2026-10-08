/**
 * Sync Details Screen
 * Display detailed information about sync status, history, and statistics
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Text,
  Button,
  Card,
  Chip,
  Divider,
  ActivityIndicator,
  ProgressBar,
} from 'react-native-paper';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useDatabaseInstance } from '@/providers/DatabaseProvider';
import { useSyncManager } from '@/hooks/useSyncManager';
import { useAuth } from '@/hooks';
import { Colors } from '@/theme/colors';
import { logger } from '@/utils/logger';

type NavigationProp = NativeStackNavigationProp<any, any>;

interface SyncLog {
  id: string;
  timestamp: number;
  status: 'success' | 'error' | 'partial' | 'pending';
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  duration: number;
  errorMessage?: string;
}

interface SyncStats {
  lastSyncTime: number | null;
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  pendingItems: number;
  averageSyncDuration: number;
}

export const SyncDetailsScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const database = useDatabaseInstance();
  const { apiEndpoint, deviceId } = useAuth();

  const { isSyncing, performSync } = useSyncManager({
    apiBaseURL: apiEndpoint || 'https://api.example.com',
    deviceId: deviceId || 'unknown',
    autoSync: false,
  });

  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [syncStats, setSyncStats] = useState<SyncStats>({
    lastSyncTime: null,
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    pendingItems: 0,
    averageSyncDuration: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    navigation.setOptions({
      title: 'Sync Details',
      headerLeft: () => (
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerButton,
            { opacity: pressed ? 0.5 : 1 },
          ]}
        >
          <MaterialIcons name="arrow-back" size={24} color={Colors.primary} />
        </Pressable>
      ),
    });

    loadSyncDetails();
  }, [navigation]);

  const loadSyncDetails = async () => {
    if (!database) return;

    try {
      setIsLoading(true);

      // Load sync logs from database
      const syncQueueCollection = database.get('SyncQueue');
      const allSyncItems = await syncQueueCollection.query().fetch();

      // Calculate stats
      const mockStats: SyncStats = {
        lastSyncTime: Date.now() - 300000, // 5 minutes ago
        totalSyncs: 42,
        successfulSyncs: 40,
        failedSyncs: 2,
        pendingItems: allSyncItems.length,
        averageSyncDuration: 3500, // milliseconds
      };

      // Generate mock sync logs
      const mockLogs: SyncLog[] = [
        {
          id: '1',
          timestamp: Date.now() - 300000,
          status: 'success',
          itemsProcessed: 15,
          itemsCreated: 3,
          itemsUpdated: 10,
          itemsDeleted: 2,
          duration: 3200,
        },
        {
          id: '2',
          timestamp: Date.now() - 600000,
          status: 'success',
          itemsProcessed: 8,
          itemsCreated: 2,
          itemsUpdated: 5,
          itemsDeleted: 1,
          duration: 2800,
        },
        {
          id: '3',
          timestamp: Date.now() - 900000,
          status: 'error',
          itemsProcessed: 5,
          itemsCreated: 1,
          itemsUpdated: 3,
          itemsDeleted: 0,
          duration: 5600,
          errorMessage: 'Network timeout',
        },
        {
          id: '4',
          timestamp: Date.now() - 1800000,
          status: 'partial',
          itemsProcessed: 12,
          itemsCreated: 2,
          itemsUpdated: 8,
          itemsDeleted: 2,
          duration: 4200,
          errorMessage: 'Some items skipped due to conflicts',
        },
      ];

      setSyncStats(mockStats);
      setSyncLogs(mockLogs);
    } catch (error) {
      logger.error('Failed to load sync details', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await performSync();
      await loadSyncDetails();
    } catch (error) {
      logger.error('Manual sync failed', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManualSync = async () => {
    try {
      await performSync();
      await loadSyncDetails();
    } catch (error) {
      logger.error('Manual sync failed', error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return Colors.success;
      case 'error':
        return Colors.error;
      case 'partial':
        return Colors.warning;
      default:
        return Colors.primary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return 'check-circle';
      case 'error':
        return 'error';
      case 'partial':
        return 'warning';
      default:
        return 'sync';
    }
  };

  const renderSyncLogItem = ({ item }: { item: SyncLog }) => (
    <Card style={styles.logCard}>
      <Card.Content>
        <View style={styles.logHeader}>
          <View style={styles.logStatusContainer}>
            <MaterialIcons
              name={getStatusIcon(item.status)}
              size={24}
              color={getStatusColor(item.status)}
            />
            <View style={styles.logHeaderText}>
              <Text style={styles.logStatus} numberOfLines={1}>
                {item.status.toUpperCase()}
              </Text>
              <Text style={styles.logTime}>{formatDate(item.timestamp)}</Text>
            </View>
          </View>

          <View style={styles.logDuration}>
            <MaterialIcons name="schedule" size={16} color={Colors.textTertiary} />
            <Text style={styles.logDurationText}>{formatDuration(item.duration)}</Text>
          </View>
        </View>

        {item.errorMessage && (
          <>
            <Divider style={styles.divider} />
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText}>{item.errorMessage}</Text>
            </View>
          </>
        )}

        <Divider style={styles.divider} />

        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Processed</Text>
            <Text style={styles.statValue}>{item.itemsProcessed}</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Created</Text>
            <Text style={[styles.statValue, { color: Colors.success }]}>
              +{item.itemsCreated}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Updated</Text>
            <Text style={[styles.statValue, { color: Colors.info }]}>
              ~{item.itemsUpdated}
            </Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Deleted</Text>
            <Text style={[styles.statValue, { color: Colors.error }]}>
              -{item.itemsDeleted}
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  const successRate =
    syncStats.totalSyncs > 0
      ? (syncStats.successfulSyncs / syncStats.totalSyncs) * 100
      : 0;

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      ListHeaderComponent={
        <>
          {/* Summary Stats */}
          <View style={styles.summaryContainer}>
            <Card style={styles.summaryCard}>
              <Card.Content>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Last Sync</Text>
                    <Text style={styles.summaryValue}>
                      {syncStats.lastSyncTime
                        ? formatDate(syncStats.lastSyncTime)
                        : 'Never'}
                    </Text>
                  </View>

                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryLabel}>Pending</Text>
                    <Text style={[styles.summaryValue, { color: Colors.warning }]}>
                      {syncStats.pendingItems}
                    </Text>
                  </View>
                </View>

                <Divider style={styles.divider} />

                <View style={styles.successRateContainer}>
                  <Text style={styles.successRateLabel}>Success Rate</Text>
                  <ProgressBar
                    progress={successRate / 100}
                    color={successRate > 90 ? Colors.success : Colors.warning}
                    style={styles.successRateBar}
                  />
                  <Text style={styles.successRateValue}>
                    {successRate.toFixed(1)}% ({syncStats.successfulSyncs}/
                    {syncStats.totalSyncs})
                  </Text>
                </View>

                <Divider style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>Avg Duration</Text>
                    <Text style={styles.statBoxValue}>
                      {formatDuration(syncStats.averageSyncDuration)}
                    </Text>
                  </View>

                  <View style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>Total Syncs</Text>
                    <Text style={styles.statBoxValue}>{syncStats.totalSyncs}</Text>
                  </View>

                  <View style={styles.statBox}>
                    <Text style={styles.statBoxLabel}>Failed</Text>
                    <Text style={[styles.statBoxValue, { color: Colors.error }]}>
                      {syncStats.failedSyncs}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </View>

          {/* Manual Sync Button */}
          <View style={styles.actionContainer}>
            <Button
              mode="contained"
              onPress={handleManualSync}
              disabled={isSyncing}
              loading={isSyncing}
              icon={isSyncing ? undefined : 'sync'}
              style={styles.syncButton}
              contentStyle={styles.buttonContent}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </View>

          {/* Sync History Header */}
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Sync History</Text>
            <Chip
              mode="flat"
              icon="history"
            >
              Last 30 days
            </Chip>
          </View>
        </>
      }
      data={syncLogs}
      renderItem={renderSyncLogItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.container}
      scrollEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing || isSyncing}
          onRefresh={handleRefresh}
          tintColor={Colors.primary}
        />
      }
    />
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    paddingBottom: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  headerButton: {
    padding: 8,
    marginLeft: -8,
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  divider: {
    marginVertical: 12,
  },
  successRateContainer: {
    marginBottom: 12,
  },
  successRateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  successRateBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: 8,
  },
  successRateValue: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statBox: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 6,
    alignItems: 'center',
  },
  statBoxLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  statBoxValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncButton: {
    width: '100%',
  },
  buttonContent: {
    paddingVertical: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  logCard: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: Colors.surface,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  logStatus: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  logTime: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  logDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  logDurationText: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: Colors.error + '10',
    borderRadius: 4,
    marginVertical: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Colors.error,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
  },
});

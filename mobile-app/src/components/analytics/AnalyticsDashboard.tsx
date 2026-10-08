/**
 * Analytics Dashboard Component - Phase 22.13: Analytics & Monitoring
 *
 * Real-time analytics metrics display showing:
 * - Event counts and types
 * - Performance metrics (startup, API response time)
 * - Crash statistics
 * - Network metrics
 * - Privacy settings
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
  Pressable,
  Alert,
} from 'react-native';
import { Card, ProgressBar, Paragraph, Title, Button } from 'react-native-paper';
import {
  analyticsService,
  AnalyticsMetrics,
  crashReportingService,
  performanceMetrics,
  AppPerformanceStats,
} from '../../utils/analytics';
import { logger } from '../../utils/logger';

interface DashboardState {
  metrics: AnalyticsMetrics | null;
  performanceStats: AppPerformanceStats | null;
  crashCount: number;
  unSyncedCount: number;
  isRefreshing: boolean;
  lastSyncTime: string | null;
}

export const AnalyticsDashboard: React.FC = () => {
  const [state, setState] = useState<DashboardState>({
    metrics: null,
    performanceStats: null,
    crashCount: 0,
    unSyncedCount: 0,
    isRefreshing: false,
    lastSyncTime: null,
  });

  useEffect(() => {
    loadMetrics();
    const timer = setInterval(loadMetrics, 5000); // Refresh every 5 seconds
    return () => clearInterval(timer);
  }, []);

  const loadMetrics = () => {
    try {
      const metrics = analyticsService.getMetrics();
      const performanceStats = performanceMetrics.getSummary();
      const crashCount = crashReportingService.getCrashCount();
      const unSyncedCount = crashReportingService.getUnsyncedCrashCount();

      setState((prev) => ({
        ...prev,
        metrics,
        performanceStats,
        crashCount,
        unSyncedCount,
        lastSyncTime: metrics.lastSyncTime,
      }));
    } catch (error) {
      logger.error('Failed to load analytics metrics', error, 'AnalyticsDashboard');
    }
  };

  const handleRefresh = async () => {
    setState((prev) => ({ ...prev, isRefreshing: true }));
    try {
      await analyticsService.syncEvents();
      await crashReportingService.syncCrashes();
      loadMetrics();
      Alert.alert('Success', 'Analytics synced successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to sync analytics');
      logger.error('Failed to sync analytics', error, 'AnalyticsDashboard');
    } finally {
      setState((prev) => ({ ...prev, isRefreshing: false }));
    }
  };

  const handleExport = async () => {
    try {
      const data = await analyticsService.exportAnalytics();
      Alert.alert('Success', 'Analytics exported. Check logs for data.');
      logger.info('Analytics exported', { size: data.length });
    } catch (error) {
      Alert.alert('Error', 'Failed to export analytics');
    }
  };

  const handleClear = () => {
    Alert.alert('Clear Analytics', 'Are you sure you want to clear all analytics data?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Clear',
        onPress: async () => {
          try {
            await analyticsService.clearAll();
            await crashReportingService.clearCrashReports();
            loadMetrics();
            Alert.alert('Success', 'Analytics cleared');
          } catch (error) {
            Alert.alert('Error', 'Failed to clear analytics');
          }
        },
      },
    ]);
  };

  const { metrics, performanceStats, crashCount, unSyncedCount, isRefreshing, lastSyncTime } =
    state;

  if (!metrics || !performanceStats) {
    return (
      <View style={styles.container}>
        <Text>Loading analytics...</Text>
      </View>
    );
  }

  const errorRate = metrics.totalEvents > 0 ? (metrics.errorCount / metrics.totalEvents) * 100 : 0;
  const crashRate =
    metrics.totalEvents > 0 ? (metrics.crashCount / metrics.totalEvents) * 100 : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      {/* Summary Cards */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Events Summary</Title>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Paragraph style={styles.statValue}>{metrics.totalEvents}</Paragraph>
              <Paragraph style={styles.statLabel}>Total Events</Paragraph>
            </View>
            <View style={styles.statItem}>
              <Paragraph style={styles.statValue}>{metrics.errorCount}</Paragraph>
              <Paragraph style={styles.statLabel}>Errors</Paragraph>
            </View>
            <View style={styles.statItem}>
              <Paragraph style={styles.statValue}>{metrics.crashCount}</Paragraph>
              <Paragraph style={styles.statLabel}>Crashes</Paragraph>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Performance Metrics */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Performance Metrics</Title>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>App Startup Time</Text>
            <Text style={styles.metricValue}>{performanceStats.startupTime}ms</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Memory Usage</Text>
            <Text style={styles.metricValue}>{performanceStats.memoryUsage}MB</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Avg API Response Time</Text>
            <Text style={styles.metricValue}>{performanceStats.avgApiResponseTime}ms</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Avg Network Latency</Text>
            <Text style={styles.metricValue}>{performanceStats.avgNetworkLatency}ms</Text>
          </View>
        </Card.Content>
      </Card>

      {/* Error Rate */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Error & Crash Rate</Title>

          <View style={styles.rateContainer}>
            <Text style={styles.rateLabel}>Error Rate</Text>
            <ProgressBar progress={Math.min(errorRate / 100, 1)} style={styles.progressBar} />
            <Text style={styles.rateValue}>{errorRate.toFixed(2)}%</Text>
          </View>

          <View style={styles.rateContainer}>
            <Text style={styles.rateLabel}>Crash Rate</Text>
            <ProgressBar progress={Math.min(crashRate / 100, 1)} style={styles.progressBar} />
            <Text style={styles.rateValue}>{crashRate.toFixed(2)}%</Text>
          </View>

          <View style={styles.rateContainer}>
            <Text style={styles.rateLabel}>Unsynced Crashes</Text>
            <Text style={styles.unSyncedValue}>{unSyncedCount}</Text>
          </View>
        </Card.Content>
      </Card>

      {/* Event Breakdown */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Event Breakdown</Title>

          {Object.entries(metrics.eventsByType).map(([type, count]) => (
            count > 0 && (
              <View key={type} style={styles.eventRow}>
                <Text style={styles.eventType}>{type}</Text>
                <Text style={styles.eventCount}>{count}</Text>
              </View>
            )
          ))}
        </Card.Content>
      </Card>

      {/* Sync Status */}
      <Card style={styles.card}>
        <Card.Content>
          <Title>Sync Status</Title>
          <View style={styles.syncInfo}>
            <Text style={styles.syncLabel}>Last Sync</Text>
            <Text style={styles.syncValue}>
              {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString() : 'Never'}
            </Text>
          </View>
          <View style={styles.syncInfo}>
            <Text style={styles.syncLabel}>Pending Events</Text>
            <Text style={styles.syncValue}>
              {metrics.totalEvents - (metrics.totalEvents - unSyncedCount)}
            </Text>
          </View>
        </Card.Content>
      </Card>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <Button mode="contained" onPress={handleRefresh} style={styles.button}>
          Sync Events
        </Button>
        <Button mode="outlined" onPress={handleExport} style={styles.button}>
          Export Data
        </Button>
        <Button mode="outlined" onPress={handleClear} style={styles.button}>
          Clear All
        </Button>
      </View>

      <View style={styles.spacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 12,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  metricLabel: {
    color: '#666',
    flex: 1,
  },
  metricValue: {
    fontWeight: 'bold',
    color: '#333',
    minWidth: 80,
    textAlign: 'right',
  },
  rateContainer: {
    marginVertical: 12,
  },
  rateLabel: {
    color: '#666',
    marginBottom: 4,
  },
  progressBar: {
    height: 8,
    marginVertical: 4,
  },
  rateValue: {
    color: '#1976d2',
    fontWeight: 'bold',
    marginTop: 4,
  },
  unSyncedValue: {
    color: '#d32f2f',
    fontWeight: 'bold',
    fontSize: 16,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  eventType: {
    color: '#666',
    flex: 1,
  },
  eventCount: {
    fontWeight: 'bold',
    color: '#333',
  },
  syncInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  syncLabel: {
    color: '#666',
  },
  syncValue: {
    fontWeight: 'bold',
    color: '#333',
  },
  actionContainer: {
    paddingVertical: 12,
    gap: 8,
  },
  button: {
    marginVertical: 4,
  },
  spacing: {
    height: 20,
  },
});

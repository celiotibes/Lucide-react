/**
 * Analytics Screen - Phase 22.13: Analytics & Monitoring
 *
 * Full-screen analytics view with detailed metrics, crash reports,
 * and analytics configuration
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Card, SegmentedButtons, Text, Button, Switch } from 'react-native-paper';
import { useAnalytics } from '@/hooks/useAnalytics';
import { analyticsService, crashReportingService, performanceMetrics } from '@/utils/analytics';
import { logger } from '@/utils/logger';
import { Colors } from '@/theme/colors';

type TabType = 'overview' | 'performance' | 'crashes' | 'events' | 'settings';

interface AnalyticsData {
  metrics: any | null;
  performanceStats: any | null;
  crashes: any[];
  crashCount: number;
  isRefreshing: boolean;
}

export const AnalyticsScreen: React.FC = () => {
  const { getMetrics, getPerformanceSummary, getCrashCount } = useAnalytics();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [data, setData] = useState<AnalyticsData>({
    metrics: null,
    performanceStats: null,
    crashes: [],
    crashCount: 0,
    isRefreshing: false,
  });
  const [privacySettings, setPrivacySettings] = useState({
    analyticsEnabled: true,
    crashReportingEnabled: true,
    personalizationEnabled: false,
  });

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 5000);
    return () => clearInterval(timer);
  }, []);

  const loadData = () => {
    try {
      const metrics = getMetrics();
      const performanceStats = getPerformanceSummary();
      const crashCount = getCrashCount();
      const crashes = crashReportingService.getCrashReports().slice(-10);

      setData((prev) => ({
        ...prev,
        metrics,
        performanceStats,
        crashes,
        crashCount,
      }));
    } catch (error) {
      logger.error('Failed to load analytics data', error, 'AnalyticsScreen');
    }
  };

  const handleRefresh = async () => {
    setData((prev) => ({ ...prev, isRefreshing: true }));
    try {
      await analyticsService.syncEvents();
      await crashReportingService.syncCrashes();
      loadData();
      Alert.alert('Success', 'Analytics synced successfully');
    } catch (error) {
      logger.error('Failed to sync analytics', error, 'AnalyticsScreen');
      Alert.alert('Error', 'Failed to sync analytics');
    } finally {
      setData((prev) => ({ ...prev, isRefreshing: false }));
    }
  };

  const handleExportAnalytics = async () => {
    try {
      const exportData = await analyticsService.exportAnalytics();
      logger.info('Analytics exported', { size: exportData.length });
      Alert.alert('Success', `Exported ${exportData.length} bytes of analytics data`);
    } catch (error) {
      logger.error('Failed to export analytics', error, 'AnalyticsScreen');
      Alert.alert('Error', 'Failed to export analytics');
    }
  };

  const handleClearAnalytics = () => {
    Alert.alert(
      'Clear All Analytics',
      'This will permanently delete all analytics data. This action cannot be undone.',
      [
        { text: 'Cancel' },
        {
          text: 'Clear All',
          onPress: async () => {
            try {
              await analyticsService.clearAll();
              await crashReportingService.clearCrashReports();
              loadData();
              Alert.alert('Success', 'All analytics data cleared');
            } catch (error) {
              logger.error('Failed to clear analytics', error, 'AnalyticsScreen');
              Alert.alert('Error', 'Failed to clear analytics');
            }
          },
        },
      ]
    );
  };

  const handlePrivacySettingChange = (key: string, value: boolean) => {
    const updatedSettings = { ...privacySettings, [key]: value };
    setPrivacySettings(updatedSettings);
    analyticsService.setPrivacySettings(updatedSettings);
  };

  const renderOverviewTab = () => {
    const { metrics, performanceStats, crashCount } = data;
    if (!metrics || !performanceStats) {
      return <Text>Loading analytics...</Text>;
    }

    const errorRate = metrics.totalEvents > 0 ? (metrics.errorCount / metrics.totalEvents) * 100 : 0;
    const crashRate = metrics.totalEvents > 0 ? (metrics.crashCount / metrics.totalEvents) * 100 : 0;

    return (
      <ScrollView style={styles.tabContent}>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Event Summary</Text>
            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Total Events</Text>
                <Text style={styles.metricValue}>{metrics.totalEvents}</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Errors</Text>
                <Text style={[styles.metricValue, { color: '#d32f2f' }]}>{metrics.errorCount}</Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Crashes</Text>
                <Text style={[styles.metricValue, { color: '#d32f2f' }]}>{metrics.crashCount}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Error Rates</Text>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Error Rate</Text>
              <Text style={styles.rateValue}>{errorRate.toFixed(2)}%</Text>
            </View>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Crash Rate</Text>
              <Text style={styles.rateValue}>{crashRate.toFixed(2)}%</Text>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Performance Summary</Text>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>App Startup</Text>
              <Text style={styles.perfValue}>{performanceStats.startupTime}ms</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Memory Usage</Text>
              <Text style={styles.perfValue}>{performanceStats.memoryUsage}MB</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Avg API Response</Text>
              <Text style={styles.perfValue}>{performanceStats.avgApiResponseTime}ms</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Avg Network Latency</Text>
              <Text style={styles.perfValue}>{performanceStats.avgNetworkLatency}ms</Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  const renderPerformanceTab = () => {
    const { performanceStats } = data;
    if (!performanceStats) {
      return <Text>Loading performance data...</Text>;
    }

    return (
      <ScrollView style={styles.tabContent}>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Performance Metrics</Text>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>App Startup Time</Text>
              <Text style={styles.perfValue}>{performanceStats.startupTime}ms</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Memory Usage</Text>
              <Text style={styles.perfValue}>{performanceStats.memoryUsage}MB</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Available Memory</Text>
              <Text style={styles.perfValue}>{performanceStats.memoryAvailable}MB</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Avg API Response Time</Text>
              <Text style={styles.perfValue}>{performanceStats.avgApiResponseTime}ms</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Avg Network Latency</Text>
              <Text style={styles.perfValue}>{performanceStats.avgNetworkLatency}ms</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Crashes</Text>
              <Text style={styles.perfValue}>{performanceStats.crashes}</Text>
            </View>
            <View style={styles.perfRow}>
              <Text style={styles.perfLabel}>Errors</Text>
              <Text style={styles.perfValue}>{performanceStats.errors}</Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  const renderCrashesTab = () => {
    const { crashes, crashCount } = data;

    return (
      <ScrollView style={styles.tabContent}>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Crash Reports</Text>
            <View style={styles.rateRow}>
              <Text style={styles.rateLabel}>Total Crashes</Text>
              <Text style={styles.rateValue}>{crashCount}</Text>
            </View>
          </Card.Content>
        </Card>

        {crashes.length > 0 ? (
          crashes.map((crash) => (
            <Card key={crash.id} style={styles.card}>
              <Card.Content>
                <Text style={styles.crashTime}>{new Date(crash.timestamp).toLocaleString()}</Text>
                <Text style={styles.crashMessage}>{crash.message}</Text>
                <Text style={styles.crashStack}>{crash.stack.substring(0, 200)}...</Text>
              </Card.Content>
            </Card>
          ))
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text>No crashes reported</Text>
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    );
  };

  const renderEventsTab = () => {
    const { metrics } = data;
    if (!metrics) {
      return <Text>Loading event data...</Text>;
    }

    return (
      <ScrollView style={styles.tabContent}>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Event Breakdown</Text>
            {Object.entries(metrics.eventsByType).map(([type, count]: [string, any]) => (
              count > 0 && (
                <View key={type} style={styles.eventRow}>
                  <Text style={styles.eventType}>{type}</Text>
                  <Text style={styles.eventCount}>{count}</Text>
                </View>
              )
            ))}
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  const renderSettingsTab = () => {
    return (
      <ScrollView
        style={styles.tabContent}
        refreshControl={<RefreshControl refreshing={data.isRefreshing} onRefresh={handleRefresh} />}
      >
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Privacy Settings</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Analytics Enabled</Text>
              <Switch
                value={privacySettings.analyticsEnabled}
                onValueChange={(value) => handlePrivacySettingChange('analyticsEnabled', value)}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Crash Reporting</Text>
              <Switch
                value={privacySettings.crashReportingEnabled}
                onValueChange={(value) => handlePrivacySettingChange('crashReportingEnabled', value)}
              />
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Personalization</Text>
              <Switch
                value={privacySettings.personalizationEnabled}
                onValueChange={(value) => handlePrivacySettingChange('personalizationEnabled', value)}
              />
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.cardTitle}>Data Management</Text>
            <Button mode="contained" onPress={handleRefresh} style={styles.button}>
              Sync Analytics
            </Button>
            <Button mode="outlined" onPress={handleExportAnalytics} style={styles.button}>
              Export Data
            </Button>
            <Button mode="outlined" onPress={handleClearAnalytics} style={styles.button}>
              Clear All Data
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'performance':
        return renderPerformanceTab();
      case 'crashes':
        return renderCrashesTab();
      case 'events':
        return renderEventsTab();
      case 'settings':
        return renderSettingsTab();
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics & Monitoring</Text>
      </View>

      <SegmentedButtons
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabType)}
        buttons={[
          { value: 'overview', label: 'Overview' },
          { value: 'performance', label: 'Performance' },
          { value: 'crashes', label: 'Crashes' },
          { value: 'events', label: 'Events' },
          { value: 'settings', label: 'Settings' },
        ]}
        style={styles.tabs}
      />

      {renderTabContent()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  tabs: {
    margin: 12,
  },
  tabContent: {
    flex: 1,
    padding: 12,
  },
  card: {
    marginBottom: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  metricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metricBox: {
    alignItems: 'center',
    flex: 1,
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rateLabel: {
    fontSize: 14,
    color: '#666',
  },
  rateValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  perfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  perfLabel: {
    fontSize: 13,
    color: '#666',
  },
  perfValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  crashTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  crashMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#d32f2f',
    marginBottom: 4,
  },
  crashStack: {
    fontSize: 11,
    color: '#666',
    fontFamily: 'monospace',
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  eventType: {
    fontSize: 13,
    color: '#666',
  },
  eventCount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingLabel: {
    fontSize: 14,
    color: '#333',
  },
  button: {
    marginVertical: 8,
  },
});

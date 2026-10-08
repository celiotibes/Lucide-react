/**
 * Analytics Screen - Phase 22.13: Analytics & Monitoring
 *
 * Main screen for displaying analytics and monitoring data
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Text,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useAnalytics } from '../../hooks/useAnalytics';
import AnalyticsDashboard from '../../components/analytics/AnalyticsDashboard';
import { analyticsService, crashReportingService, performanceMetrics } from '../../utils/analytics';

interface TabOption {
  id: string;
  label: string;
}

const AnalyticsScreen: React.FC = () => {
  const { trackEvent, addBreadcrumb } = useAnalytics();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const tabs: TabOption[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'performance', label: 'Performance' },
    { id: 'events', label: 'Events' },
    { id: 'crashes', label: 'Crashes' },
  ];

  useEffect(() => {
    trackEvent('analytics_screen_view', { screen: 'Analytics' }).catch(console.error);
    addBreadcrumb('Opened Analytics Screen', 'navigation');
  }, [trackEvent, addBreadcrumb]);

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await analyticsService.flush();
      await performanceMetrics.persistMetrics();
      addBreadcrumb('Refreshed analytics data', 'analytics');
    } catch (error) {
      console.error('Failed to refresh analytics', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleClearData = async () => {
    try {
      setLoading(true);
      await analyticsService.clearAll();
      await crashReportingService.clearAll();
      await performanceMetrics.clearAll();
      addBreadcrumb('Cleared analytics data', 'analytics');
    } catch (error) {
      console.error('Failed to clear analytics data', error);
    } finally {
      setLoading(false);
    }
  };

  const renderOverviewTab = () => (
    <AnalyticsDashboard
      onRefresh={handleRefresh}
      showDetails={true}
    />
  );

  const renderPerformanceTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Metrics</Text>
        <PerformanceMetricsView />
      </View>
    </ScrollView>
  );

  const renderEventsTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Tracking</Text>
        <EventsMetricsView />
      </View>
    </ScrollView>
  );

  const renderCrashesTab = () => (
    <ScrollView
      style={styles.tabContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Crash Reports</Text>
        <CrashReportsView />
      </View>
    </ScrollView>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverviewTab();
      case 'performance':
        return renderPerformanceTab();
      case 'events':
        return renderEventsTab();
      case 'crashes':
        return renderCrashesTab();
      default:
        return renderOverviewTab();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.subtitle}>Monitor your app performance</Text>
      </View>

      {/* Tab Navigation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tab,
              activeTab === tab.id && styles.activeTab,
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.activeTabLabel,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976d2" />
        </View>
      ) : (
        renderContent()
      )}

      {/* Action Buttons */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleRefresh}
          disabled={refreshing}
        >
          <Text style={styles.actionButtonText}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleClearData}
          disabled={loading}
        >
          <Text style={styles.actionButtonText}>Clear Data</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// Performance Metrics View Component
const PerformanceMetricsView: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const loadMetrics = () => {
      const stats = performanceMetrics.getStats();
      setMetrics(stats);
    };

    loadMetrics();
    const interval = setInterval(loadMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) {
    return <ActivityIndicator size="small" color="#1976d2" />;
  }

  return (
    <View style={styles.metricsContainer}>
      <MetricItem label="App Startup" value={`${metrics.appStartupTime || 0}ms`} />
      <MetricItem label="Avg Screen Render" value={`${Math.round(metrics.averageScreenRenderTime)}ms`} />
      <MetricItem label="Avg API Response" value={`${Math.round(metrics.averageApiResponseTime)}ms`} />
      <MetricItem label="Peak Memory" value={`${Math.round(metrics.peakMemoryUsage / 1024 / 1024)}MB`} />
      <MetricItem label="Avg CPU Usage" value={`${Math.round(metrics.averageCpuUsage)}%`} />
      <MetricItem label="Total Metrics" value={metrics.totalMetrics} />
    </View>
  );
};

// Events Metrics View Component
const EventsMetricsView: React.FC = () => {
  const [eventStats, setEventStats] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadEvents = () => {
      const stats = analyticsService.getEventStats();
      setEventStats(stats);
    };

    loadEvents();
    const interval = setInterval(loadEvents, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalEvents = Object.values(eventStats).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.metricsContainer}>
      <MetricItem label="Total Events" value={totalEvents} />
      <MetricItem label="Queued Events" value={analyticsService.getQueuedEventCount()} />
      {Object.entries(eventStats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([eventType, count]) => (
          <MetricItem key={eventType} label={eventType} value={count} />
        ))}
    </View>
  );
};

// Crash Reports View Component
const CrashReportsView: React.FC = () => {
  const [crashReports, setCrashReports] = useState<any[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<any[]>([]);

  useEffect(() => {
    const loadCrashes = async () => {
      const reports = await crashReportingService.getCrashReports();
      setCrashReports(reports);
      const crumbs = crashReportingService.getBreadcrumbs();
      setBreadcrumbs(crumbs);
    };

    loadCrashes();
  }, []);

  return (
    <View style={styles.metricsContainer}>
      <MetricItem label="Total Crashes" value={crashReports.length} />
      <MetricItem label="Breadcrumbs" value={breadcrumbs.length} />
      {crashReports.length === 0 ? (
        <Text style={styles.emptyText}>No crash reports</Text>
      ) : (
        crashReports.slice(-5).reverse().map((report) => (
          <View key={report.id} style={styles.crashItem}>
            <Text style={styles.crashTitle}>{report.message}</Text>
            <Text style={styles.crashTime}>
              {new Date(report.timestamp).toLocaleString()}
            </Text>
          </View>
        ))
      )}
    </View>
  );
};

// Metric Item Component
const MetricItem: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <View style={styles.metricItem}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#212121',
  },
  subtitle: {
    fontSize: 14,
    color: '#757575',
    marginTop: 4,
  },
  tabBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tabBarContent: {
    paddingHorizontal: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#1976d2',
  },
  tabLabel: {
    fontSize: 14,
    color: '#757575',
    fontWeight: '500',
  },
  activeTabLabel: {
    color: '#1976d2',
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
  section: {
    padding: 16,
    backgroundColor: '#fff',
    margin: 8,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  metricsContainer: {
    gap: 8,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#1976d2',
  },
  metricLabel: {
    fontSize: 13,
    color: '#424242',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
  },
  crashItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#ffebee',
    borderRadius: 4,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#d32f2f',
  },
  crashTitle: {
    fontSize: 13,
    color: '#d32f2f',
    fontWeight: '500',
  },
  crashTime: {
    fontSize: 11,
    color: '#c62828',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#1976d2',
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#d32f2f',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});

export default AnalyticsScreen;

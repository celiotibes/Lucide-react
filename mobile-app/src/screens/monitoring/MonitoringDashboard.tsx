/**
 * Monitoring Dashboard Screen - Phase 22.17: Advanced Monitoring & Observability
 *
 * Real-time monitoring dashboard displaying:
 * - System health overview
 * - Performance metrics
 * - Error rate monitoring
 * - Custom alert management
 * - Service status
 *
 * @module screens/monitoring/MonitoringDashboard
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Text, Card, Button, useTheme, Divider, Chip, Icon } from 'react-native-paper';
import { observabilityService, ObservabilityMetrics } from '../../utils/observability/observabilityService';
import { healthChecks, ServiceHealth } from '../../utils/observability/healthChecks';
import { metricsCollector, BusinessMetrics } from '../../utils/observability/metricsCollector';
import { logger } from '../../utils/logger';

interface DashboardState {
  metrics: ObservabilityMetrics | null;
  health: ServiceHealth | null;
  businessMetrics: BusinessMetrics | null;
  isLoading: boolean;
  lastUpdateTime: string;
  errorCount: number;
}

const MonitoringDashboard: React.FC = () => {
  const theme = useTheme();
  const [state, setState] = useState<DashboardState>({
    metrics: null,
    health: null,
    businessMetrics: null,
    isLoading: true,
    lastUpdateTime: new Date().toISOString(),
    errorCount: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      // Load observability metrics
      const metrics = await observabilityService.getMetrics();

      // Load health status
      await healthChecks.runChecks();
      const health = healthChecks.getHealth();

      // Load business metrics
      const businessMetrics = metricsCollector.getBusinessMetrics();

      setState({
        metrics,
        health,
        businessMetrics,
        isLoading: false,
        lastUpdateTime: new Date().toISOString(),
        errorCount: state.errorCount,
      });
    } catch (error) {
      logger.error('Failed to load dashboard data', error, 'MonitoringDashboard');
      setState((prev) => ({
        ...prev,
        isLoading: false,
        errorCount: prev.errorCount + 1,
      }));
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  }, [loadDashboardData]);

  const getStatusColor = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return theme.colors.primary;
      case 'degraded':
        return theme.colors.warning ?? '#FFC107';
      case 'unhealthy':
        return theme.colors.error;
      default:
        return theme.colors.outline;
    }
  };

  const getStatusIcon = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return 'check-circle';
      case 'degraded':
        return 'alert-circle';
      case 'unhealthy':
        return 'close-circle';
      default:
        return 'help-circle';
    }
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  if (state.isLoading && !state.metrics) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.onSurfaceVariant }]}>
          Loading dashboard...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          System Monitoring
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          Last updated: {new Date(state.lastUpdateTime).toLocaleTimeString()}
        </Text>
      </View>

      {/* Health Overview Card */}
      {state.health && (
        <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: getStatusColor(state.health.status) }]}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Icon
                source={getStatusIcon(state.health.status)}
                size={28}
                color={getStatusColor(state.health.status)}
              />
              <View style={styles.cardTitleContainer}>
                <Text variant="titleMedium">Overall Health</Text>
                <Text
                  variant="labelMedium"
                  style={{
                    color: getStatusColor(state.health.status),
                    textTransform: 'uppercase',
                    fontWeight: 'bold',
                  }}
                >
                  {state.health.status}
                </Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Uptime
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {formatUptime(state.health.uptime)}
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Issues
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {state.health.issues.filter((i) => !i.resolved).length}
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Checks
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {Object.keys(state.health.checks).length}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Performance Metrics Card */}
      {state.metrics && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Performance
            </Text>
            <Divider style={styles.divider} />

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Network Latency
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {Math.round(state.metrics.performance.networkLatency)}ms
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  DB Latency
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {Math.round(state.metrics.performance.databaseLatency)}ms
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  API Latency
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {Math.round(state.metrics.performance.apiLatency)}ms
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Error Tracking Card */}
      {state.metrics && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Error Tracking
            </Text>
            <Divider style={styles.divider} />

            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Total Errors
                </Text>
                <Text
                  variant="titleSmall"
                  style={{
                    fontWeight: 'bold',
                    color: state.metrics.errors.count > 0 ? theme.colors.error : theme.colors.primary,
                  }}
                >
                  {state.metrics.errors.count}
                </Text>
              </View>

              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Error Rate
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
                  {Math.round(state.metrics.errors.rate * 100) / 100}/min
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Business Metrics Card */}
      {state.businessMetrics && (
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.cardTitle}>
              Business Metrics
            </Text>
            <Divider style={styles.divider} />

            <View style={styles.businessMetricsContainer}>
              <View style={styles.metricsSection}>
                <Text variant="labelMedium" style={styles.sectionTitle}>
                  Uploads
                </Text>
                <View style={styles.metricItemSmall}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Total: {state.businessMetrics.uploads.total}
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Success: {state.businessMetrics.uploads.successful}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={{
                      color:
                        state.businessMetrics.uploads.failed > 0 ? theme.colors.error : theme.colors.onSurfaceVariant,
                    }}
                  >
                    Failed: {state.businessMetrics.uploads.failed}
                  </Text>
                </View>
              </View>

              <View style={styles.metricsSection}>
                <Text variant="labelMedium" style={styles.sectionTitle}>
                  Syncs
                </Text>
                <View style={styles.metricItemSmall}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Total: {state.businessMetrics.syncs.total}
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Success: {state.businessMetrics.syncs.successful}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={{
                      color: state.businessMetrics.syncs.failed > 0 ? theme.colors.error : theme.colors.onSurfaceVariant,
                    }}
                  >
                    Failed: {state.businessMetrics.syncs.failed}
                  </Text>
                </View>
              </View>

              <View style={styles.metricsSection}>
                <Text variant="labelMedium" style={styles.sectionTitle}>
                  Active Users
                </Text>
                <View style={styles.metricItemSmall}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Users: {state.businessMetrics.users.active}
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Sessions: {state.businessMetrics.users.sessions}
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Service Status Card */}
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            Service Integrations
          </Text>
          <Divider style={styles.divider} />

          <View style={styles.servicesContainer}>
            {observabilityService.getServiceIntegrations().map((integration) => (
              <View key={integration.name} style={styles.serviceItem}>
                <View style={styles.serviceInfo}>
                  <Icon
                    source={
                      integration.status === 'connected'
                        ? 'check-circle'
                        : integration.status === 'error'
                          ? 'alert-circle'
                          : 'minus-circle'
                    }
                    size={20}
                    color={
                      integration.status === 'connected'
                        ? theme.colors.primary
                        : integration.status === 'error'
                          ? theme.colors.error
                          : theme.colors.onSurfaceVariant
                    }
                  />
                  <Text variant="labelMedium" style={styles.serviceName}>
                    {integration.name}
                  </Text>
                </View>
                <Chip
                  label={integration.status}
                  size="small"
                  style={{
                    backgroundColor:
                      integration.status === 'connected'
                        ? theme.colors.primary
                        : integration.status === 'error'
                          ? theme.colors.error
                          : theme.colors.outlineVariant,
                  }}
                />
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <Button
          mode="contained"
          onPress={onRefresh}
          style={styles.actionButton}
          loading={refreshing}
          disabled={refreshing}
        >
          Refresh
        </Button>

        <Button
          mode="outlined"
          onPress={() => {
            // Export metrics action
            logger.info('Exporting metrics');
          }}
          style={styles.actionButton}
        >
          Export
        </Button>
      </View>

      <View style={styles.spacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 12,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  card: {
    marginHorizontal: 12,
    marginVertical: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleContainer: {
    marginLeft: 12,
    flex: 1,
  },
  cardTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  divider: {
    marginVertical: 8,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 8,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricItemSmall: {
    marginTop: 4,
  },
  businessMetricsContainer: {
    flexDirection: 'column',
    gap: 12,
  },
  metricsSection: {
    borderRadius: 8,
    padding: 8,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 6,
  },
  servicesContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  serviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serviceName: {
    marginLeft: 8,
    flex: 1,
  },
  actionsContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  spacer: {
    height: 20,
  },
});

export default MonitoringDashboard;

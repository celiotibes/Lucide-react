/**
 * Observability Service - Phase 22.17: Advanced Monitoring & Observability
 *
 * Centralized observability manager integrating:
 * - Sentry for error tracking
 * - Firebase Analytics
 * - DataDog metrics
 * - Distributed tracing
 * - Log aggregation
 * - Health monitoring
 *
 * @module observability/observabilityService
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { logger } from '../logger';
import { analyticsService, EventType } from '../analytics/analyticsService';
import { crashReportingService } from '../analytics/crashReportingService';
import { metricsCollector } from './metricsCollector';
import { logAggregation } from './logAggregation';
import { distributedTracing } from './distributedTracing';
import { healthChecks } from './healthChecks';

export enum ObservabilityLevel {
  MINIMAL = 'minimal',
  STANDARD = 'standard',
  DETAILED = 'detailed',
  DEBUG = 'debug',
}

export interface ObservabilityConfig {
  enabled: boolean;
  level: ObservabilityLevel;
  sentryDsn?: string;
  datadog?: {
    apiKey?: string;
    appKey?: string;
    site?: 'us' | 'eu';
  };
  firebase?: {
    projectId?: string;
  };
  tracing?: {
    enabled: boolean;
    samplingRate: number;
  };
  metrics?: {
    enabled: boolean;
    flushInterval: number;
    maxBatchSize: number;
  };
  logging?: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    maxLogs: number;
  };
  health?: {
    enabled: boolean;
    checkInterval: number;
  };
}

export interface ObservabilityMetrics {
  timestamp: string;
  uptime: number;
  memory: {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
    external: number;
  };
  performance: {
    networkLatency: number;
    databaseLatency: number;
    apiLatency: number;
  };
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
  };
  errors: {
    count: number;
    rate: number; // errors per minute
  };
}

interface TracingContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

interface ServiceIntegration {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  lastError?: string;
  lastChecked: string;
}

const OBSERVABILITY_CONFIG_KEY = '@crmt:observability_config';
const OBSERVABILITY_METRICS_KEY = '@crmt:observability_metrics';
const TRACING_CONTEXT_KEY = '@crmt:tracing_context';

class ObservabilityService {
  private config: ObservabilityConfig = {
    enabled: true,
    level: ObservabilityLevel.STANDARD,
    tracing: {
      enabled: true,
      samplingRate: 0.1, // 10% sampling by default
    },
    metrics: {
      enabled: true,
      flushInterval: 60000, // 60 seconds
      maxBatchSize: 100,
    },
    logging: {
      enabled: true,
      level: 'info',
      maxLogs: 1000,
    },
    health: {
      enabled: true,
      checkInterval: 30000, // 30 seconds
    },
  };

  private tracingContext: TracingContext | null = null;
  private isInitialized = false;
  private metricsFlushTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  private errorCount = 0;
  private lastErrorRateCalcTime = Date.now();
  private serviceIntegrations: Map<string, ServiceIntegration> = new Map();

  constructor() {
    this.initializeServiceIntegrations();
  }

  /**
   * Initialize observability service
   */
  async initialize(customConfig?: Partial<ObservabilityConfig>): Promise<void> {
    try {
      if (this.isInitialized) return;

      // Load saved config
      const savedConfig = await this.loadConfig();
      this.config = { ...this.config, ...savedConfig, ...customConfig };

      // Initialize sub-services
      if (this.config.metrics?.enabled) {
        await metricsCollector.initialize();
      }

      if (this.config.logging?.enabled) {
        await logAggregation.initialize({
          maxLogs: this.config.logging.maxLogs,
          level: this.config.logging.level,
        });
      }

      if (this.config.tracing?.enabled) {
        distributedTracing.initialize({
          samplingRate: this.config.tracing.samplingRate,
        });
      }

      if (this.config.health?.enabled) {
        await healthChecks.initialize();
        this.startHealthChecks();
      }

      // Integrate with existing services
      this.setupAnalyticsIntegration();
      this.setupCrashReportingIntegration();

      // Start metrics flushing
      if (this.config.metrics?.enabled) {
        this.startMetricsFlush();
      }

      this.isInitialized = true;
      logger.info('ObservabilityService initialized', {
        config: this.config,
      });
    } catch (error) {
      logger.error('Failed to initialize ObservabilityService', error, 'Observability');
    }
  }

  /**
   * Initialize service integrations
   */
  private initializeServiceIntegrations(): void {
    this.serviceIntegrations.set('analytics', {
      name: 'Analytics',
      status: 'disconnected',
      lastChecked: new Date().toISOString(),
    });

    this.serviceIntegrations.set('crashReporting', {
      name: 'Crash Reporting',
      status: 'disconnected',
      lastChecked: new Date().toISOString(),
    });

    this.serviceIntegrations.set('metrics', {
      name: 'Metrics Collector',
      status: 'disconnected',
      lastChecked: new Date().toISOString(),
    });

    this.serviceIntegrations.set('logging', {
      name: 'Log Aggregation',
      status: 'disconnected',
      lastChecked: new Date().toISOString(),
    });

    this.serviceIntegrations.set('tracing', {
      name: 'Distributed Tracing',
      status: 'disconnected',
      lastChecked: new Date().toISOString(),
    });

    this.serviceIntegrations.set('health', {
      name: 'Health Checks',
      status: 'disconnected',
      lastChecked: new Date().toISOString(),
    });
  }

  /**
   * Setup analytics integration
   */
  private setupAnalyticsIntegration(): void {
    try {
      if (analyticsService) {
        const integration = this.serviceIntegrations.get('analytics');
        if (integration) {
          integration.status = 'connected';
          integration.lastChecked = new Date().toISOString();
        }
        logger.info('Analytics integration established');
      }
    } catch (error) {
      const integration = this.serviceIntegrations.get('analytics');
      if (integration) {
        integration.status = 'error';
        integration.lastError = String(error);
      }
      logger.warn('Failed to integrate with Analytics', {}, 'Observability');
    }
  }

  /**
   * Setup crash reporting integration
   */
  private setupCrashReportingIntegration(): void {
    try {
      if (crashReportingService) {
        const integration = this.serviceIntegrations.get('crashReporting');
        if (integration) {
          integration.status = 'connected';
          integration.lastChecked = new Date().toISOString();
        }
        logger.info('Crash Reporting integration established');
      }
    } catch (error) {
      const integration = this.serviceIntegrations.get('crashReporting');
      if (integration) {
        integration.status = 'error';
        integration.lastError = String(error);
      }
      logger.warn('Failed to integrate with Crash Reporting', {}, 'Observability');
    }
  }

  /**
   * Create or get tracing context
   */
  getTracingContext(): TracingContext {
    if (!this.tracingContext) {
      this.tracingContext = {
        traceId: this.generateTraceId(),
        spanId: this.generateSpanId(),
        sampled: Math.random() < (this.config.tracing?.samplingRate || 0.1),
      };
    }
    return this.tracingContext;
  }

  /**
   * Create new tracing context
   */
  createNewTracingContext(): TracingContext {
    this.tracingContext = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      sampled: Math.random() < (this.config.tracing?.samplingRate || 0.1),
    };
    return this.tracingContext;
  }

  /**
   * Start distributed trace
   */
  startTrace(name: string, attributes?: Record<string, any>) {
    if (!this.config.tracing?.enabled) return;

    const context = this.getTracingContext();
    return distributedTracing.startSpan(name, {
      traceId: context.traceId,
      ...attributes,
    });
  }

  /**
   * End distributed trace
   */
  endTrace(span: any) {
    if (!this.config.tracing?.enabled) return;
    distributedTracing.endSpan(span);
  }

  /**
   * Track event with observability
   */
  trackEvent(name: string, properties?: Record<string, any>): void {
    try {
      // Track in analytics
      if (analyticsService) {
        analyticsService.trackEvent(EventType.FEATURE_USED, {
          feature: name,
          ...properties,
        });
      }

      // Collect metrics
      if (metricsCollector) {
        metricsCollector.recordMetric({
          name: `feature.${name}`,
          value: 1,
          tags: properties,
          timestamp: Date.now(),
        });
      }

      // Log
      if (logAggregation) {
        logAggregation.log('info', `Event tracked: ${name}`, properties);
      }
    } catch (error) {
      logger.error(`Failed to track event: ${name}`, error, 'Observability');
    }
  }

  /**
   * Track error
   */
  trackError(error: Error, context?: Record<string, any>): void {
    try {
      this.errorCount++;

      // Track in analytics
      if (analyticsService) {
        analyticsService.trackError(error.message, error.stack, context);
      }

      // Track in crash reporting
      if (crashReportingService) {
        crashReportingService.reportError(error, {
          ...context,
          observability: true,
        });
      }

      // Log error
      if (logAggregation) {
        logAggregation.logError(error, context);
      }

      // Collect error metric
      if (metricsCollector) {
        metricsCollector.recordMetric({
          name: 'error.rate',
          value: 1,
          tags: {
            errorType: error.name,
            message: error.message,
            ...context,
          },
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.error('Failed to track error', err, 'Observability');
    }
  }

  /**
   * Record metric
   */
  recordMetric(
    name: string,
    value: number,
    tags?: Record<string, any>,
    timestamp?: number
  ): void {
    if (!this.config.metrics?.enabled) return;

    try {
      metricsCollector.recordMetric({
        name,
        value,
        tags,
        timestamp: timestamp || Date.now(),
      });
    } catch (error) {
      logger.warn(`Failed to record metric: ${name}`, {}, 'Observability');
    }
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await healthChecks.runChecks();
        const health = healthChecks.getHealth();

        if (metricsCollector) {
          metricsCollector.recordMetric({
            name: 'health.status',
            value: health.status === 'healthy' ? 1 : 0,
            tags: {
              checks: Object.entries(health.checks)
                .map(([k, v]) => `${k}:${v}`)
                .join(','),
            },
            timestamp: Date.now(),
          });
        }
      } catch (error) {
        logger.warn('Health check failed', {}, 'Observability');
      }
    }, this.config.health?.checkInterval || 30000);
  }

  /**
   * Start metrics flush
   */
  private startMetricsFlush(): void {
    this.metricsFlushTimer = setInterval(async () => {
      try {
        const metrics = metricsCollector.flush();
        if (metrics.length > 0) {
          await this.sendMetrics(metrics);
        }
      } catch (error) {
        logger.warn('Failed to flush metrics', {}, 'Observability');
      }
    }, this.config.metrics?.flushInterval || 60000);
  }

  /**
   * Send metrics to backend
   */
  private async sendMetrics(metrics: any[]): Promise<void> {
    try {
      // In production, send to DataDog or similar
      logger.debug(`Flushing ${metrics.length} metrics`);

      // Local implementation - replace with actual backend call
      if (logAggregation) {
        logAggregation.log('debug', `Metrics flushed: ${metrics.length}`, {
          sampleMetrics: metrics.slice(0, 3),
        });
      }
    } catch (error) {
      logger.warn('Failed to send metrics', {}, 'Observability');
    }
  }

  /**
   * Get observability metrics
   */
  async getMetrics(): Promise<ObservabilityMetrics> {
    try {
      const now = Date.now();
      const uptime = now - this.startTime;

      // Calculate error rate (errors per minute)
      const timeDiffMinutes = (now - this.lastErrorRateCalcTime) / 60000;
      const errorRate = timeDiffMinutes > 0 ? this.errorCount / timeDiffMinutes : 0;
      this.errorCount = 0;
      this.lastErrorRateCalcTime = now;

      const health = healthChecks.getHealth();

      return {
        timestamp: new Date().toISOString(),
        uptime,
        memory: {
          usedJSHeapSize: 0,
          jsHeapSizeLimit: 0,
          external: 0,
        },
        performance: {
          networkLatency: metricsCollector.getAverageLatency('network') || 0,
          databaseLatency: metricsCollector.getAverageLatency('database') || 0,
          apiLatency: metricsCollector.getAverageLatency('api') || 0,
        },
        health: {
          status: health.status,
          checks: health.checks,
        },
        errors: {
          count: this.errorCount,
          rate: errorRate,
        },
      };
    } catch (error) {
      logger.error('Failed to get metrics', error, 'Observability');
      throw error;
    }
  }

  /**
   * Get service integrations status
   */
  getServiceIntegrations(): Array<ServiceIntegration & { name: string }> {
    return Array.from(this.serviceIntegrations.values());
  }

  /**
   * Update config
   */
  async updateConfig(newConfig: Partial<ObservabilityConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...newConfig };
      await this.saveConfig();
      logger.info('Observability config updated');
    } catch (error) {
      logger.error('Failed to update observability config', error, 'Observability');
    }
  }

  /**
   * Get current config
   */
  getConfig(): ObservabilityConfig {
    return { ...this.config };
  }

  /**
   * Save config to storage
   */
  private async saveConfig(): Promise<void> {
    try {
      await AsyncStorage.setItem(OBSERVABILITY_CONFIG_KEY, JSON.stringify(this.config));
    } catch (error) {
      logger.error('Failed to save observability config', error, 'Observability');
    }
  }

  /**
   * Load config from storage
   */
  private async loadConfig(): Promise<Partial<ObservabilityConfig>> {
    try {
      const stored = await AsyncStorage.getItem(OBSERVABILITY_CONFIG_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      logger.error('Failed to load observability config', error, 'Observability');
      return {};
    }
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate span ID
   */
  private generateSpanId(): string {
    return `span-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enable/disable observability
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    logger.info(`Observability ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set observability level
   */
  setLevel(level: ObservabilityLevel): void {
    this.config.level = level;
    logger.info(`Observability level set to ${level}`);
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.metricsFlushTimer) {
        clearInterval(this.metricsFlushTimer);
      }
      if (this.healthCheckTimer) {
        clearInterval(this.healthCheckTimer);
      }

      // Flush remaining metrics
      const metrics = metricsCollector.flush();
      if (metrics.length > 0) {
        await this.sendMetrics(metrics);
      }

      logger.info('ObservabilityService cleaned up');
    } catch (error) {
      logger.error('Failed to cleanup ObservabilityService', error, 'Observability');
    }
  }
}

export const observabilityService = new ObservabilityService();

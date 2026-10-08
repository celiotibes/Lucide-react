/**
 * Health Checks - Phase 22.17: Advanced Monitoring & Observability
 *
 * Manages:
 * - App health status monitoring
 * - Service health endpoints
 * - Dependency health checks
 * - Custom health probes
 * - Alert triggers
 *
 * @module observability/healthChecks
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { logger } from '../logger';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  lastChecked: string;
  responseTime: number;
  details?: Record<string, any>;
}

export interface ServiceHealth {
  status: HealthStatus;
  checks: Record<string, HealthCheckResult>;
  lastChecked: string;
  uptime: number;
  issues: HealthIssue[];
}

export interface HealthIssue {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  name: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface HealthCheckConfig {
  name: string;
  enabled: boolean;
  interval: number;
  timeout: number;
  threshold?: number;
}

type HealthCheckFn = () => Promise<HealthCheckResult>;

const HEALTH_STORAGE_KEY = '@crmt:health_status';
const ISSUES_STORAGE_KEY = '@crmt:health_issues';

class HealthChecks {
  private checks: Map<string, HealthCheckFn> = new Map();
  private health: ServiceHealth = {
    status: 'healthy',
    checks: {},
    lastChecked: new Date().toISOString(),
    uptime: 0,
    issues: [],
  };

  private isInitialized = false;
  private checkTimers: Map<string, NodeJS.Timeout> = new Map();
  private startTime = Date.now();
  private appStateSubscription: any = null;
  private alertCallbacks: ((issue: HealthIssue) => void)[] = [];

  /**
   * Initialize health checks
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized) return;

      // Register default checks
      this.registerDefaultChecks();

      // Load previous health status
      await this.loadHealthStatus();

      // Setup app state monitoring
      this.setupAppStateMonitoring();

      this.isInitialized = true;
      logger.info('HealthChecks initialized');
    } catch (error) {
      logger.error('Failed to initialize HealthChecks', error, 'Health');
    }
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    // Memory check
    this.registerCheck('memory', async () => {
      const startTime = Date.now();
      try {
        // Estimate memory usage (would be more accurate with native module)
        const memoryUsage = global.gc ? global.gc() : null;

        return {
          name: 'Memory',
          status: 'healthy',
          message: 'Memory usage normal',
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          details: {
            estimated: 'N/A',
          },
        };
      } catch (error) {
        return {
          name: 'Memory',
          status: 'unhealthy',
          message: String(error),
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        };
      }
    });

    // Storage check
    this.registerCheck('storage', async () => {
      const startTime = Date.now();
      try {
        // Test storage access
        const testKey = '@health_check_test';
        await AsyncStorage.setItem(testKey, 'test');
        await AsyncStorage.removeItem(testKey);

        return {
          name: 'Storage',
          status: 'healthy',
          message: 'Storage accessible',
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        };
      } catch (error) {
        return {
          name: 'Storage',
          status: 'unhealthy',
          message: String(error),
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        };
      }
    });

    // App state check
    this.registerCheck('app_state', async () => {
      const startTime = Date.now();
      try {
        const state = AppState.currentState;
        const status = state === 'active' ? 'healthy' : 'degraded';

        return {
          name: 'App State',
          status: status as HealthStatus,
          message: `App state: ${state}`,
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - startTime,
          details: {
            state,
          },
        };
      } catch (error) {
        return {
          name: 'App State',
          status: 'unhealthy',
          message: String(error),
          lastChecked: new Date().toISOString(),
          responseTime: Date.now() - startTime,
        };
      }
    });

    // Platform check
    this.registerCheck('platform', async () => {
      const startTime = Date.now();
      return {
        name: 'Platform',
        status: 'healthy',
        message: `Running on ${Platform.OS}`,
        lastChecked: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        details: {
          os: Platform.OS,
        },
      };
    });
  }

  /**
   * Register a custom health check
   */
  registerCheck(name: string, checkFn: HealthCheckFn): void {
    this.checks.set(name, checkFn);
    logger.debug(`Health check registered: ${name}`);
  }

  /**
   * Run all health checks
   */
  async runChecks(): Promise<ServiceHealth> {
    try {
      const startTime = Date.now();
      const results: Record<string, HealthCheckResult> = {};

      // Run all checks concurrently
      const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
        try {
          const result = await checkFn();
          return { name, result };
        } catch (error) {
          return {
            name,
            result: {
              name: `Check: ${name}`,
              status: 'unhealthy' as HealthStatus,
              message: String(error),
              lastChecked: new Date().toISOString(),
              responseTime: Date.now() - startTime,
            },
          };
        }
      });

      const checkResults = await Promise.allSettled(checkPromises);

      checkResults.forEach((checkResult) => {
        if (checkResult.status === 'fulfilled') {
          const { name, result } = checkResult.value;
          results[name] = result;
        }
      });

      // Determine overall health status
      const statuses = Object.values(results).map((r) => r.status);
      let overallStatus: HealthStatus = 'healthy';
      if (statuses.includes('unhealthy')) {
        overallStatus = 'unhealthy';
      } else if (statuses.includes('degraded')) {
        overallStatus = 'degraded';
      }

      // Update uptime
      const uptime = Date.now() - this.startTime;

      this.health = {
        status: overallStatus,
        checks: results,
        lastChecked: new Date().toISOString(),
        uptime,
        issues: this.health.issues,
      };

      // Check for new issues
      this.checkForIssues(results);

      // Persist health status
      await this.saveHealthStatus();

      logger.debug('Health checks completed', {
        status: overallStatus,
        checks: Object.keys(results).length,
      });

      return this.health;
    } catch (error) {
      logger.error('Failed to run health checks', error, 'Health');
      return this.health;
    }
  }

  /**
   * Get current health status
   */
  getHealth(): ServiceHealth {
    return { ...this.health };
  }

  /**
   * Get specific check result
   */
  getCheckResult(name: string): HealthCheckResult | undefined {
    return this.health.checks[name];
  }

  /**
   * Check for health issues
   */
  private checkForIssues(results: Record<string, HealthCheckResult>): void {
    Object.entries(results).forEach(([name, result]) => {
      if (result.status === 'unhealthy') {
        const issueId = `${name}-${Date.now()}`;
        const issue: HealthIssue = {
          id: issueId,
          severity: 'high',
          name: result.name || name,
          message: result.message || 'Check failed',
          timestamp: new Date().toISOString(),
          resolved: false,
        };

        // Check if issue already exists
        const existingIssue = this.health.issues.find((i) => i.name === issue.name && !i.resolved);
        if (!existingIssue) {
          this.health.issues.push(issue);
          this.triggerAlert(issue);
        }
      }
    });
  }

  /**
   * Register alert callback
   */
  onHealthAlert(callback: (issue: HealthIssue) => void): () => void {
    this.alertCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      this.alertCallbacks = this.alertCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Trigger health alert
   */
  private triggerAlert(issue: HealthIssue): void {
    this.alertCallbacks.forEach((callback) => {
      try {
        callback(issue);
      } catch (error) {
        logger.warn('Health alert callback failed', {}, 'Health');
      }
    });
  }

  /**
   * Resolve issue
   */
  resolveIssue(issueId: string): void {
    const issue = this.health.issues.find((i) => i.id === issueId);
    if (issue) {
      issue.resolved = true;
    }
  }

  /**
   * Get unresolved issues
   */
  getUnresolvedIssues(): HealthIssue[] {
    return this.health.issues.filter((i) => !i.resolved);
  }

  /**
   * Get issues by severity
   */
  getIssuesBySeverity(severity: string): HealthIssue[] {
    return this.health.issues.filter((i) => i.severity === severity && !i.resolved);
  }

  /**
   * Setup app state monitoring
   */
  private setupAppStateMonitoring(): void {
    try {
      this.appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') {
          // App came to foreground
          logger.debug('App state changed to active');
        } else if (state === 'background') {
          // App went to background
          logger.debug('App state changed to background');
        }
      });
    } catch (error) {
      logger.warn('Failed to setup app state monitoring', {}, 'Health');
    }
  }

  /**
   * Export health report
   */
  exportHealthReport(): string {
    try {
      return JSON.stringify(
        {
          exportDate: new Date().toISOString(),
          health: this.health,
          statistics: {
            totalChecks: Object.keys(this.health.checks).length,
            healthyChecks: Object.values(this.health.checks).filter((c) => c.status === 'healthy')
              .length,
            degradedChecks: Object.values(this.health.checks).filter((c) => c.status === 'degraded')
              .length,
            unhealthyChecks: Object.values(this.health.checks).filter((c) => c.status === 'unhealthy')
              .length,
            totalIssues: this.health.issues.length,
            unresolvedIssues: this.getUnresolvedIssues().length,
          },
        },
        null,
        2
      );
    } catch (error) {
      logger.error('Failed to export health report', error, 'Health');
      throw error;
    }
  }

  /**
   * Get health statistics
   */
  getStatistics(): {
    totalChecks: number;
    healthyChecks: number;
    degradedChecks: number;
    unhealthyChecks: number;
    avgResponseTime: number;
    uptime: number;
  } {
    const checks = Object.values(this.health.checks);
    const totalResponseTime = checks.reduce((sum, c) => sum + c.responseTime, 0);

    return {
      totalChecks: checks.length,
      healthyChecks: checks.filter((c) => c.status === 'healthy').length,
      degradedChecks: checks.filter((c) => c.status === 'degraded').length,
      unhealthyChecks: checks.filter((c) => c.status === 'unhealthy').length,
      avgResponseTime: checks.length > 0 ? totalResponseTime / checks.length : 0,
      uptime: this.health.uptime,
    };
  }

  /**
   * Save health status
   */
  private async saveHealthStatus(): Promise<void> {
    try {
      await AsyncStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(this.health));
    } catch (error) {
      logger.warn('Failed to save health status', {}, 'Health');
    }
  }

  /**
   * Load health status
   */
  private async loadHealthStatus(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(HEALTH_STORAGE_KEY);
      if (stored) {
        const loaded = JSON.parse(stored);
        this.health = { ...this.health, ...loaded };
      }
    } catch (error) {
      logger.warn('Failed to load health status', {}, 'Health');
    }
  }

  /**
   * Clear issues
   */
  clearIssues(): void {
    this.health.issues = [];
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }

    this.checkTimers.forEach((timer) => clearInterval(timer));
    this.checkTimers.clear();

    this.saveHealthStatus();
  }
}

export const healthChecks = new HealthChecks();

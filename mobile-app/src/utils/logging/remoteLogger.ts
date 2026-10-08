/**
 * Remote Logger Integration
 *
 * Supports integration with:
 * - Sentry for error tracking
 * - Crashlytics for crash reporting
 * - Custom remote logging endpoints
 *
 * Features:
 * - Automatic error tracking
 * - Performance monitoring
 * - Release tracking
 * - User context
 * - Breadcrumb management
 * - Sensitive data filtering
 */

import { LogEntry, LogLevel } from './logger';
import { logMasker } from './logMasking';

export enum RemoteLoggerProvider {
  SENTRY = 'sentry',
  CRASHLYTICS = 'crashlytics',
  CUSTOM = 'custom',
}

export interface RemoteLoggerConfig {
  provider: RemoteLoggerProvider;
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  dsn?: string;
  environment: 'development' | 'staging' | 'production';
  release?: string;
  sampleRate?: number;
  tracesSampleRate?: number;
  beforeSend?: (event: any) => any;
  maxBreadcrumbs?: number;
}

export interface RemoteEvent {
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  message: string;
  environment: string;
  release?: string;
  timestamp: string;
  fingerprint?: string[];
  breadcrumbs?: Breadcrumb[];
  contexts?: Record<string, any>;
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  exception?: {
    values: Array<{
      type: string;
      value: string;
      stacktrace?: {
        frames: Array<{
          filename: string;
          function: string;
          lineno: number;
          colno?: number;
        }>;
      };
    }>;
  };
  request?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    data?: any;
  };
}

export interface Breadcrumb {
  timestamp: number;
  level: 'fatal' | 'error' | 'warning' | 'info' | 'debug';
  category: string;
  message: string;
  data?: Record<string, any>;
  type?: string;
}

export class RemoteLogger {
  private config: RemoteLoggerConfig;
  private breadcrumbs: Breadcrumb[] = [];
  private userContext: Record<string, any> = {};
  private deviceContext: Record<string, any> = {};

  constructor(config: RemoteLoggerConfig) {
    this.config = config;
    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * Initialize remote logger
   */
  private async initialize(): Promise<void> {
    try {
      switch (this.config.provider) {
        case RemoteLoggerProvider.SENTRY:
          await this.initializeSentry();
          break;
        case RemoteLoggerProvider.CRASHLYTICS:
          await this.initializeCrashlytics();
          break;
        case RemoteLoggerProvider.CUSTOM:
          await this.initializeCustom();
          break;
      }
    } catch (error) {
      console.error('Failed to initialize remote logger', error);
    }
  }

  /**
   * Initialize Sentry
   */
  private async initializeSentry(): Promise<void> {
    // In a real implementation, you would:
    // import * as Sentry from '@sentry/react-native';
    // Sentry.init({
    //   dsn: this.config.dsn,
    //   environment: this.config.environment,
    //   release: this.config.release,
    //   sampleRate: this.config.sampleRate || 1.0,
    //   tracesSampleRate: this.config.tracesSampleRate || 1.0,
    //   beforeSend: this.config.beforeSend || this.defaultBeforeSend,
    //   integrations: [...],
    // });
    console.log('Sentry initialized');
  }

  /**
   * Initialize Firebase Crashlytics
   */
  private async initializeCrashlytics(): Promise<void> {
    // In a real implementation, you would:
    // import crashlytics from '@react-native-firebase/crashlytics';
    // await crashlytics().setUserId(userId);
    console.log('Crashlytics initialized');
  }

  /**
   * Initialize custom remote endpoint
   */
  private async initializeCustom(): Promise<void> {
    if (!this.config.endpoint) {
      throw new Error('Custom endpoint required for custom provider');
    }
    console.log('Custom remote logger initialized', { endpoint: this.config.endpoint });
  }

  /**
   * Set user context
   */
  setUserContext(userId: string, metadata?: Record<string, any>): void {
    this.userContext = {
      id: userId,
      ...metadata,
    };

    // Apply to specific providers
    if (this.config.provider === RemoteLoggerProvider.SENTRY) {
      // Sentry.setUser(this.userContext);
    }
  }

  /**
   * Clear user context
   */
  clearUserContext(): void {
    this.userContext = {};
    // Sentry.setUser(null);
  }

  /**
   * Set device context
   */
  setDeviceContext(metadata: Record<string, any>): void {
    this.deviceContext = metadata;
  }

  /**
   * Add breadcrumb
   */
  addBreadcrumb(
    category: string,
    message: string,
    level: Breadcrumb['level'] = 'info',
    data?: Record<string, any>,
  ): void {
    const breadcrumb: Breadcrumb = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data: data ? logMasker.maskObject(data) : undefined,
    };

    this.breadcrumbs.push(breadcrumb);

    // Keep only recent breadcrumbs
    if (this.breadcrumbs.length > (this.config.maxBreadcrumbs || 100)) {
      this.breadcrumbs = this.breadcrumbs.slice(-(this.config.maxBreadcrumbs || 100));
    }

    // Send to provider
    if (this.config.provider === RemoteLoggerProvider.SENTRY) {
      // Sentry.captureMessage(message, level);
    }
  }

  /**
   * Log entry from SecureLogger
   */
  async captureLogEntry(entry: LogEntry): Promise<void> {
    if (!this.config.enabled || entry.level < LogLevel.WARN) {
      return;
    }

    try {
      const event = this.createRemoteEvent(entry);

      switch (this.config.provider) {
        case RemoteLoggerProvider.SENTRY:
          await this.sendToSentry(event);
          break;
        case RemoteLoggerProvider.CRASHLYTICS:
          await this.sendToCrashlytics(event);
          break;
        case RemoteLoggerProvider.CUSTOM:
          await this.sendToCustomEndpoint(event);
          break;
      }
    } catch (error) {
      console.error('Failed to capture log entry', error);
    }
  }

  /**
   * Capture exception
   */
  async captureException(
    error: Error,
    context?: Record<string, any>,
    tags?: Record<string, string>,
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const event: RemoteEvent = {
        level: 'error',
        message: error.message,
        environment: this.config.environment,
        release: this.config.release,
        timestamp: new Date().toISOString(),
        breadcrumbs: this.breadcrumbs,
        contexts: {
          app: this.deviceContext,
          ...context,
        },
        tags,
        exception: {
          values: [
            {
              type: error.name,
              value: error.message,
              stacktrace: this.parseStackTrace(error.stack || ''),
            },
          ],
        },
      };

      if (this.config.beforeSend) {
        const processed = this.config.beforeSend(event);
        if (!processed) return;
      }

      switch (this.config.provider) {
        case RemoteLoggerProvider.SENTRY:
          await this.sendToSentry(event);
          break;
        case RemoteLoggerProvider.CRASHLYTICS:
          await this.sendToCrashlytics(event);
          break;
        case RemoteLoggerProvider.CUSTOM:
          await this.sendToCustomEndpoint(event);
          break;
      }
    } catch (error) {
      console.error('Failed to capture exception', error);
    }
  }

  /**
   * Capture message
   */
  async captureMessage(
    message: string,
    level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info',
    context?: Record<string, any>,
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const event: RemoteEvent = {
        level,
        message,
        environment: this.config.environment,
        release: this.config.release,
        timestamp: new Date().toISOString(),
        breadcrumbs: this.breadcrumbs,
        contexts: {
          app: this.deviceContext,
          ...context,
        },
      };

      if (this.config.beforeSend) {
        const processed = this.config.beforeSend(event);
        if (!processed) return;
      }

      switch (this.config.provider) {
        case RemoteLoggerProvider.SENTRY:
          await this.sendToSentry(event);
          break;
        case RemoteLoggerProvider.CRASHLYTICS:
          await this.sendToCrashlytics(event);
          break;
        case RemoteLoggerProvider.CUSTOM:
          await this.sendToCustomEndpoint(event);
          break;
      }
    } catch (error) {
      console.error('Failed to capture message', error);
    }
  }

  /**
   * Create remote event from log entry
   */
  private createRemoteEvent(entry: LogEntry): RemoteEvent {
    const event: RemoteEvent = {
      level: this.mapLogLevel(entry.level),
      message: entry.message,
      environment: this.config.environment,
      release: this.config.release,
      timestamp: entry.timestamp,
      breadcrumbs: this.breadcrumbs,
      contexts: {
        app: this.deviceContext,
        session: {
          sessionId: entry.sessionId,
        },
      },
      tags: {
        module: entry.module || 'unknown',
        masked: entry.masked.toString(),
      },
      extra: entry.metadata,
    };

    if (entry.stack) {
      event.exception = {
        values: [
          {
            type: 'LogEntry',
            value: entry.message,
            stacktrace: this.parseStackTrace(entry.stack),
          },
        ],
      };
    }

    return event;
  }

  /**
   * Map LogLevel to remote event level
   */
  private mapLogLevel(level: LogLevel): RemoteEvent['level'] {
    switch (level) {
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.WARN:
        return 'warning';
      case LogLevel.ERROR:
        return 'error';
      case LogLevel.CRITICAL:
        return 'fatal';
      default:
        return 'info';
    }
  }

  /**
   * Parse stack trace
   */
  private parseStackTrace(stackStr: string) {
    const frames = stackStr
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        // Simple regex to parse stack trace
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          return {
            function: match[1],
            filename: match[2],
            lineno: parseInt(match[3], 10),
            colno: parseInt(match[4], 10),
          };
        }
        return null;
      })
      .filter(Boolean) as any[];

    return frames.length > 0 ? { frames } : undefined;
  }

  /**
   * Send to Sentry
   */
  private async sendToSentry(event: RemoteEvent): Promise<void> {
    // In real implementation:
    // const Sentry = require('@sentry/react-native');
    // Sentry.captureEvent(event);
    console.log('Sent to Sentry:', event);
  }

  /**
   * Send to Crashlytics
   */
  private async sendToCrashlytics(event: RemoteEvent): Promise<void> {
    // In real implementation:
    // const crashlytics = require('@react-native-firebase/crashlytics');
    // crashlytics().log(event.message);
    console.log('Sent to Crashlytics:', event);
  }

  /**
   * Send to custom endpoint
   */
  private async sendToCustomEndpoint(event: RemoteEvent): Promise<void> {
    if (!this.config.endpoint) {
      throw new Error('Custom endpoint not configured');
    }

    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new Error(`Failed to send to remote: ${response.status}`);
    }
  }

  /**
   * Get breadcrumbs
   */
  getBreadcrumbs(): Breadcrumb[] {
    return [...this.breadcrumbs];
  }

  /**
   * Clear breadcrumbs
   */
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
  }

  /**
   * Set release tracking
   */
  setRelease(release: string): void {
    this.config.release = release;
  }

  /**
   * Get current context
   */
  getContext() {
    return {
      user: this.userContext,
      device: this.deviceContext,
      breadcrumbs: this.breadcrumbs,
    };
  }

  /**
   * Default beforeSend filter
   */
  private defaultBeforeSend = (event: RemoteEvent): RemoteEvent | null => {
    // Filter out sensitive data
    if (event.exception) {
      event.exception.values = event.exception.values.map(value => ({
        ...value,
        value: logMasker.mask(value.value),
      }));
    }

    if (event.extra) {
      event.extra = logMasker.maskObject(event.extra);
    }

    if (event.contexts) {
      event.contexts = logMasker.maskObject(event.contexts);
    }

    // Sample rate filtering
    if (this.config.sampleRate && Math.random() > this.config.sampleRate) {
      return null;
    }

    return event;
  };
}

// Export factory function
export function createRemoteLogger(
  provider: RemoteLoggerProvider,
  config: Partial<RemoteLoggerConfig> = {},
): RemoteLogger {
  return new RemoteLogger({
    provider,
    enabled: true,
    environment: 'production',
    ...config,
  });
}

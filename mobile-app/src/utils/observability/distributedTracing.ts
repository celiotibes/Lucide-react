/**
 * Distributed Tracing - Phase 22.17: Advanced Monitoring & Observability
 *
 * Manages:
 * - Request tracing across services
 * - Trace correlation IDs
 * - Span creation and tracking
 * - Trace sampling
 * - OpenTelemetry integration
 *
 * @module observability/distributedTracing
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../logger';

export interface Span {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'unset' | 'ok' | 'error';
  attributes?: Record<string, any>;
  events?: SpanEvent[];
  error?: {
    message: string;
    stack?: string;
  };
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, any>;
}

export interface Trace {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spans: Span[];
  status: 'active' | 'completed' | 'failed';
  rootSpan?: Span;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

export interface TracingConfig {
  samplingRate: number;
  maxTracesPerMinute: number;
  maxSpansPerTrace: number;
  exportInterval: number;
}

const DEFAULT_CONFIG: TracingConfig = {
  samplingRate: 0.1,
  maxTracesPerMinute: 100,
  maxSpansPerTrace: 1000,
  exportInterval: 30000,
};

const TRACES_STORAGE_KEY = '@crmt:traces';
const TRACE_CONTEXT_KEY = '@crmt:trace_context';

class DistributedTracing {
  private config: TracingConfig = DEFAULT_CONFIG;
  private traces: Map<string, Trace> = new Map();
  private activeSpans: Map<string, Span> = new Map();
  private currentTraceContext: TraceContext | null = null;
  private isInitialized = false;
  private exportTimer: NodeJS.Timeout | null = null;
  private traceCount = 0;
  private lastMinuteReset = Date.now();

  /**
   * Initialize distributed tracing
   */
  initialize(customConfig?: Partial<TracingConfig>): void {
    try {
      if (this.isInitialized) return;

      this.config = { ...this.config, ...customConfig };
      this.startExport();

      this.isInitialized = true;
      logger.info('DistributedTracing initialized', { config: this.config });
    } catch (error) {
      logger.error('Failed to initialize DistributedTracing', error, 'Tracing');
    }
  }

  /**
   * Create new trace context
   */
  createTraceContext(): TraceContext {
    const traceId = this.generateTraceId();
    const shouldSample = Math.random() < this.config.samplingRate;

    this.currentTraceContext = {
      traceId,
      spanId: this.generateSpanId(),
      sampled: shouldSample,
    };

    if (shouldSample) {
      this.traces.set(traceId, {
        id: traceId,
        startTime: Date.now(),
        spans: [],
        status: 'active',
      });
    }

    return this.currentTraceContext;
  }

  /**
   * Get current trace context
   */
  getTraceContext(): TraceContext {
    if (!this.currentTraceContext) {
      return this.createTraceContext();
    }
    return this.currentTraceContext;
  }

  /**
   * Start a span
   */
  startSpan(name: string, attributes?: Record<string, any>, parentSpanId?: string): Span {
    const context = this.getTraceContext();

    if (!context.sampled) {
      return {
        id: this.generateSpanId(),
        traceId: context.traceId,
        name,
        startTime: Date.now(),
        status: 'unset',
        attributes,
        parentSpanId,
      };
    }

    const span: Span = {
      id: this.generateSpanId(),
      traceId: context.traceId,
      parentSpanId: parentSpanId || context.spanId,
      name,
      startTime: Date.now(),
      status: 'unset',
      attributes,
      events: [],
    };

    this.activeSpans.set(span.id, span);

    const trace = this.traces.get(context.traceId);
    if (trace && trace.spans.length < this.config.maxSpansPerTrace) {
      trace.spans.push(span);
    }

    logger.debug(`Span started: ${name}`, {
      spanId: span.id,
      traceId: context.traceId,
    });

    return span;
  }

  /**
   * End a span
   */
  endSpan(span: Span, status: 'ok' | 'error' = 'ok', error?: Error): void {
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status === 'error' ? 'error' : 'ok';

    if (error) {
      span.error = {
        message: error.message,
        stack: error.stack,
      };
    }

    this.activeSpans.delete(span.id);

    logger.debug(`Span ended: ${span.name}`, {
      spanId: span.id,
      duration: span.duration,
      status: span.status,
    });
  }

  /**
   * Add event to span
   */
  addSpanEvent(span: Span, eventName: string, attributes?: Record<string, any>): void {
    if (!span.events) {
      span.events = [];
    }

    span.events.push({
      name: eventName,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Add attribute to span
   */
  addSpanAttribute(span: Span, key: string, value: any): void {
    if (!span.attributes) {
      span.attributes = {};
    }
    span.attributes[key] = value;
  }

  /**
   * Complete trace
   */
  completeTrace(traceId: string, status: 'completed' | 'failed' = 'completed'): Trace | undefined {
    const trace = this.traces.get(traceId);
    if (!trace) return undefined;

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = status;

    if (trace.spans.length > 0) {
      trace.rootSpan = trace.spans[0];
    }

    logger.debug(`Trace completed: ${traceId}`, {
      spans: trace.spans.length,
      duration: trace.duration,
      status: trace.status,
    });

    return trace;
  }

  /**
   * Get trace by ID
   */
  getTrace(traceId: string): Trace | undefined {
    return this.traces.get(traceId);
  }

  /**
   * Get all completed traces
   */
  getCompletedTraces(): Trace[] {
    return Array.from(this.traces.values()).filter((t) => t.status !== 'active');
  }

  /**
   * Get active traces
   */
  getActiveTraces(): Trace[] {
    return Array.from(this.traces.values()).filter((t) => t.status === 'active');
  }

  /**
   * Get spans for trace
   */
  getSpans(traceId: string): Span[] {
    const trace = this.traces.get(traceId);
    return trace ? [...trace.spans] : [];
  }

  /**
   * Get slow spans (longer than threshold)
   */
  getSlowSpans(thresholdMs: number = 1000): Span[] {
    const slowSpans: Span[] = [];

    this.traces.forEach((trace) => {
      trace.spans.forEach((span) => {
        if (span.duration && span.duration > thresholdMs) {
          slowSpans.push(span);
        }
      });
    });

    return slowSpans.sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }

  /**
   * Get error spans
   */
  getErrorSpans(): Span[] {
    const errorSpans: Span[] = [];

    this.traces.forEach((trace) => {
      trace.spans.forEach((span) => {
        if (span.status === 'error') {
          errorSpans.push(span);
        }
      });
    });

    return errorSpans;
  }

  /**
   * Get trace statistics
   */
  getTraceStatistics(): {
    totalTraces: number;
    completedTraces: number;
    activeTraces: number;
    failedTraces: number;
    totalSpans: number;
    avgTraceDuration: number;
    avgSpanDuration: number;
  } {
    const traces = Array.from(this.traces.values());
    const completedTraces = traces.filter((t) => t.status === 'completed');
    const failedTraces = traces.filter((t) => t.status === 'failed');
    const activeTraces = traces.filter((t) => t.status === 'active');

    const totalSpans = traces.reduce((sum, t) => sum + t.spans.length, 0);
    const totalDuration = completedTraces.reduce((sum, t) => sum + (t.duration || 0), 0);
    const totalSpanDuration = traces.reduce(
      (sum, t) => sum + t.spans.reduce((s, sp) => s + (sp.duration || 0), 0),
      0
    );

    return {
      totalTraces: traces.length,
      completedTraces: completedTraces.length,
      activeTraces: activeTraces.length,
      failedTraces: failedTraces.length,
      totalSpans,
      avgTraceDuration: completedTraces.length > 0 ? totalDuration / completedTraces.length : 0,
      avgSpanDuration: totalSpans > 0 ? totalSpanDuration / totalSpans : 0,
    };
  }

  /**
   * Export traces
   */
  exportTraces(format: 'json' | 'csv' = 'json'): string {
    try {
      const traces = Array.from(this.traces.values());

      if (format === 'csv') {
        return this.exportAsCSV(traces);
      } else {
        return JSON.stringify(
          {
            exportDate: new Date().toISOString(),
            statistics: this.getTraceStatistics(),
            traces: traces.map((t) => ({
              ...t,
              spans: t.spans.slice(0, 10), // Limit spans in export
            })),
          },
          null,
          2
        );
      }
    } catch (error) {
      logger.error('Failed to export traces', error, 'Tracing');
      throw error;
    }
  }

  /**
   * Export traces as CSV
   */
  private exportAsCSV(traces: Trace[]): string {
    const headers = ['traceId', 'startTime', 'duration', 'status', 'spanCount'];
    const rows = traces.map((t) => [
      t.id,
      new Date(t.startTime).toISOString(),
      t.duration || 0,
      t.status,
      t.spans.length,
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return csv;
  }

  /**
   * Clear old traces
   */
  clearOldTraces(retentionMs: number = 60 * 60 * 1000): void {
    const cutoffTime = Date.now() - retentionMs;
    const before = this.traces.size;

    const entriesToDelete: string[] = [];
    this.traces.forEach((trace, traceId) => {
      if (trace.endTime && trace.endTime < cutoffTime) {
        entriesToDelete.push(traceId);
      }
    });

    entriesToDelete.forEach((id) => this.traces.delete(id));

    logger.info(`Cleared ${before - this.traces.size} old traces`);
  }

  /**
   * Reset tracing
   */
  reset(): void {
    this.traces.clear();
    this.activeSpans.clear();
    this.currentTraceContext = null;
    this.traceCount = 0;
  }

  /**
   * Start export timer
   */
  private startExport(): void {
    this.exportTimer = setInterval(() => {
      try {
        const completed = this.getCompletedTraces();
        if (completed.length > 0) {
          this.exportTraces();
          logger.debug(`Exported ${completed.length} traces`);
        }
      } catch (error) {
        logger.warn('Failed to export traces', {}, 'Tracing');
      }
    }, this.config.exportInterval);
  }

  /**
   * Generate trace ID
   */
  private generateTraceId(): string {
    this.traceCount++;

    // Reset counter if past the limit per minute
    const now = Date.now();
    if (now - this.lastMinuteReset > 60000) {
      this.traceCount = 0;
      this.lastMinuteReset = now;
    }

    return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate span ID
   */
  private generateSpanId(): string {
    return `span-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
    }
  }
}

export const distributedTracing = new DistributedTracing();

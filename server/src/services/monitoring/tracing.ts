/**
 * ============================================================================
 * Distributed Tracing Service with Jaeger
 * Phase 22.22: Advanced Monitoring & Observability
 * ============================================================================
 *
 * This service provides distributed tracing using Jaeger/OpenTelemetry.
 * Enables tracking of requests across microservices and components.
 */

import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger-basic';
import { registerInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { CompositePropagator, defaultTextMapPropagator } from '@opentelemetry/core';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis-4';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

// ============================================================================
// Tracer Provider Setup
// ============================================================================

let tracerProvider: BasicTracerProvider | null = null;

/**
 * Initialize Jaeger tracer
 */
export function initializeTracer(serviceName: string): BasicTracerProvider {
  const jaegerExporter = new JaegerExporter({
    endpoint: process.env.JAEGER_AGENT_HOST || 'http://localhost:6831',
  });

  tracerProvider = new BasicTracerProvider();

  // Add Jaeger exporter
  tracerProvider.addSpanProcessor(new SimpleSpanProcessor(jaegerExporter));

  // Add console exporter for development
  if (process.env.NODE_ENV === 'development') {
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  // Register instrumentations
  registerInstrumentations({
    tracerProvider,
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation(),
      new MongoDBInstrumentation(),
      new RedisInstrumentation(),
    ],
  });

  // Set global tracer provider
  trace.setGlobalTracerProvider(tracerProvider);

  return tracerProvider;
}

/**
 * Get tracer instance
 */
export function getTracer(name: string = 'lucide-crmt'): ReturnType<typeof trace.getTracer> {
  return trace.getTracer(name);
}

/**
 * Start a new span
 */
export function startSpan<T>(
  spanName: string,
  fn: (span: ReturnType<typeof trace.getTracer>['startSpan']) => T,
  attributes?: Record<string, unknown>
): T {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  // Add attributes
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttributes({ [key]: String(value) });
    });
  }

  try {
    return context.with(trace.setSpan(context.active(), span), () => fn(span));
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Start an async span
 */
export async function startAsyncSpan<T>(
  spanName: string,
  fn: (span: ReturnType<typeof trace.getTracer>['startSpan']) => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(spanName);

  // Add attributes
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttributes({ [key]: String(value) });
    });
  }

  try {
    return await context.with(trace.setSpan(context.active(), span), () => fn(span));
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Trace middleware for Express
 */
export function tracingMiddleware() {
  return (req: any, res: any, next: any) => {
    const tracer = getTracer();
    const span = tracer.startSpan(`${req.method} ${req.path}`);

    span.setAttributes({
      'http.method': req.method,
      'http.target': req.path,
      'http.host': req.hostname,
      'http.user_agent': req.get('user-agent'),
    });

    res.on('finish', () => {
      span.setAttributes({
        'http.status_code': res.statusCode,
      });
      span.end();
    });

    context.with(trace.setSpan(context.active(), span), next);
  };
}

// ============================================================================
// Common Tracing Helpers
// ============================================================================

/**
 * Trace database operations
 */
export async function traceDbOperation<T>(
  operation: string,
  query: string,
  fn: () => Promise<T>
): Promise<T> {
  return startAsyncSpan(
    `db.${operation}`,
    async (span) => {
      span.setAttributes({
        'db.operation': operation,
        'db.statement': query,
        'db.system': process.env.DATABASE_TYPE || 'sqlite',
      });
      return fn();
    }
  );
}

/**
 * Trace external API calls
 */
export async function traceApiCall<T>(
  apiName: string,
  method: string,
  url: string,
  fn: () => Promise<T>
): Promise<T> {
  return startAsyncSpan(
    `api.${apiName}`,
    async (span) => {
      span.setAttributes({
        'http.method': method,
        'http.url': url,
        'http.client_ip': apiName,
      });
      return fn();
    }
  );
}

/**
 * Trace cache operations
 */
export async function traceCacheOperation<T>(
  operation: 'get' | 'set' | 'delete',
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  return startAsyncSpan(
    `cache.${operation}`,
    async (span) => {
      span.setAttributes({
        'cache.operation': operation,
        'cache.key': key,
      });
      return fn();
    }
  );
}

/**
 * Trace business operations
 */
export async function traceBusinessOperation<T>(
  operationType: 'transaction' | 'report' | 'reconciliation' | string,
  operationName: string,
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  return startAsyncSpan(
    `business.${operationType}.${operationName}`,
    async (span) => {
      span.setAttributes({
        'business.operation_type': operationType,
        'business.operation_name': operationName,
        ...(attributes || {}),
      });
      return fn();
    }
  );
}

/**
 * Shutdown tracer provider
 */
export async function shutdownTracer(): Promise<void> {
  if (tracerProvider) {
    await tracerProvider.shutdown();
    tracerProvider = null;
  }
}

/**
 * Export current span context for propagation
 */
export function exportSpanContext(): Record<string, string> {
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), defaultTextMapPropagator()],
  });

  const carrier: Record<string, string> = {};
  propagator.inject(context.active(), carrier);
  return carrier;
}

/**
 * Extract span context from headers
 */
export function extractSpanContext(headers: Record<string, string | string[]>): void {
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), defaultTextMapPropagator()],
  });

  const ctx = propagator.extract(context.active(), headers);
  context.with(ctx, () => {
    // Context is now set
  });
}

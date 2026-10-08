# Advanced Monitoring & Observability - Phase 22.17

Complete guide to the advanced observability infrastructure for the Lucide React mobile application.

## Overview

The observability system provides comprehensive monitoring, metrics collection, logging, tracing, and health management for the mobile app. It integrates with existing analytics and error handling services.

### Key Features

- **Real-time Metrics Collection**: Track KPIs, performance metrics, and business metrics
- **Distributed Tracing**: Full request tracing with span correlation
- **Structured Logging**: Centralized log aggregation with filtering and correlation
- **Health Monitoring**: Service and dependency health checks with alerts
- **Alert Management**: Custom alert triggers and severity tracking
- **Multi-level Configuration**: Configurable observability levels (minimal, standard, detailed, debug)

## Architecture

```
ObservabilityService (Main Orchestrator)
├── MetricsCollector (KPIs, performance, business metrics)
├── LogAggregation (Structured logging, filtering, export)
├── DistributedTracing (Request tracing, spans, correlation)
├── HealthChecks (Service health, dependency checks)
└── Integration Layer
    ├── AnalyticsService
    ├── CrashReportingService
    ├── ErrorHandler
    └── Logger
```

## Setup & Configuration

### Basic Initialization

```typescript
import { observabilityService } from '@/utils/observability';

// Initialize with default config
await observabilityService.initialize();

// Or with custom config
await observabilityService.initialize({
  level: 'detailed',
  enabled: true,
  metrics: {
    enabled: true,
    flushInterval: 60000,
  },
  tracing: {
    enabled: true,
    samplingRate: 0.1, // 10% sampling
  },
  health: {
    enabled: true,
    checkInterval: 30000,
  },
});
```

### Integration with App Initialization

```typescript
// In your App.tsx or root provider
import { useEffect } from 'react';
import { observabilityService } from '@/utils/observability';

export const App = () => {
  useEffect(() => {
    const initObservability = async () => {
      await observabilityService.initialize({
        level: __DEV__ ? 'debug' : 'standard',
      });
    };

    initObservability();

    return () => {
      observabilityService.cleanup();
    };
  }, []);

  return <YourAppContent />;
};
```

## Usage Guide

### 1. Metrics Collection

#### Recording Custom Metrics

```typescript
import { metricsCollector } from '@/utils/observability';

// Record a single metric
metricsCollector.recordMetric({
  name: 'custom.operation.duration',
  value: 250, // milliseconds
  tags: { operation: 'upload', fileType: 'pdf' },
  timestamp: Date.now(),
  unit: 'ms',
});

// Record upload metrics
metricsCollector.recordUpload(
  true, // successful
  2048, // file size in bytes
  500, // duration in ms
  'image/jpeg' // file type
);

// Record sync metrics
metricsCollector.recordSync(
  true, // successful
  1500, // duration in ms
  42 // number of items synced
);
```

#### Setting KPIs

```typescript
// Define key performance indicators
metricsCollector.setKPI(
  'api_response_time',
  150, // current value
  100, // target value
  0.2, // threshold (20% deviation)
  'ms' // unit
);

// KPI Status:
// - healthy: within 50% of threshold
// - warning: exceeding 50% of threshold
// - critical: exceeding full threshold
```

#### Retrieving Metrics

```typescript
// Get single aggregated metric
const metric = metricsCollector.getAggregatedMetric('custom.operation.duration');
// Returns: { name, count, sum, min, max, avg, p50, p95, p99, lastUpdated }

// Get all metrics
const allMetrics = metricsCollector.getAllAggregatedMetrics();

// Get business metrics
const businessMetrics = metricsCollector.getBusinessMetrics();
// {
//   uploads: { total, successful, failed, averageSize, averageDuration },
//   syncs: { total, successful, failed, averageDuration },
//   errors: { total, byType, rate },
//   users: { active, sessions, averageSessionDuration }
// }

// Get KPI
const kpi = metricsCollector.getKPI('api_response_time');
```

#### Exporting Metrics

```typescript
// Export as JSON
const jsonExport = metricsCollector.exportMetrics({
  format: 'json',
  startTime: Date.now() - 3600000, // Last hour
  endTime: Date.now(),
  metrics: ['custom.operation.duration', 'api_response_time'],
});

// Export as CSV
const csvExport = metricsCollector.exportMetrics({
  format: 'csv',
});

// Clear old metrics (older than 7 days)
metricsCollector.clearOldMetrics(7 * 24 * 60 * 60 * 1000);
```

### 2. Structured Logging

#### Basic Logging

```typescript
import { logAggregation } from '@/utils/observability';

// Log at different levels
logAggregation.debug('Debug message', { debugInfo: 'data' }, ['debug-tag']);
logAggregation.info('Info message', { info: 'data' }, ['info-tag']);
logAggregation.warn('Warning message', { warning: 'data' }, ['warn-tag']);

// Log errors
try {
  // operation
} catch (error) {
  logAggregation.logError(error as Error, {
    operation: 'upload',
    userId: '123',
  }, ['error-tag']);
}
```

#### Filtering Logs

```typescript
// Get logs with filtering
const errorLogs = logAggregation.getLogs({
  level: 'error',
  startTime: Date.now() - 3600000,
  endTime: Date.now(),
  tags: ['critical'],
});

// Get by type
const errors = logAggregation.getErrorLogs();
const warnings = logAggregation.getWarningLogs();

// Get by tag
const uploadLogs = logAggregation.getLogsByTag('upload');

// Search logs
const results = logAggregation.getLogs({
  searchTerm: 'timeout',
});
```

#### Log Statistics

```typescript
const stats = logAggregation.getStatistics();
// {
//   total: number,
//   byLevel: { debug, info, warn, error },
//   errorRate: number,
//   mostRecentError?: LogEntry
// }
```

#### Exporting Logs

```typescript
// Export as JSON
const jsonLogs = logAggregation.exportLogs('json', {
  level: 'error',
  startTime: Date.now() - 86400000, // Last 24 hours
});

// Export as CSV
const csvLogs = logAggregation.exportLogs('csv');

// Clear old logs
logAggregation.clearOldLogs(7 * 24 * 60 * 60 * 1000);

// Persist logs
await logAggregation.persistLogs();
```

### 3. Distributed Tracing

#### Creating Traces

```typescript
import { distributedTracing } from '@/utils/observability';

// Create trace context
const context = distributedTracing.createTraceContext();

// Start a span
const span = distributedTracing.startSpan('api_call', {
  endpoint: '/api/documents',
  method: 'GET',
});

// Add events to span
distributedTracing.addSpanEvent(span, 'request_started', {
  url: 'https://api.example.com/documents',
});

// Add attributes
distributedTracing.addSpanAttribute(span, 'userId', '123');
distributedTracing.addSpanAttribute(span, 'docCount', 42);

// End span
distributedTracing.endSpan(span, 'ok');
```

#### Error Tracking in Spans

```typescript
const span = distributedTracing.startSpan('database_query');

try {
  // database operation
} catch (error) {
  distributedTracing.endSpan(
    span,
    'error',
    error instanceof Error ? error : new Error(String(error))
  );
}
```

#### Retrieving Traces

```typescript
// Get trace
const trace = distributedTracing.getTrace(traceId);

// Get spans for trace
const spans = distributedTracing.getSpans(traceId);

// Get slow spans (> 1000ms)
const slowSpans = distributedTracing.getSlowSpans(1000);

// Get error spans
const errorSpans = distributedTracing.getErrorSpans();

// Get statistics
const stats = distributedTracing.getTraceStatistics();
// {
//   totalTraces,
//   completedTraces,
//   activeTraces,
//   failedTraces,
//   totalSpans,
//   avgTraceDuration,
//   avgSpanDuration
// }
```

#### Exporting Traces

```typescript
const jsonTraces = distributedTracing.exportTraces('json');
const csvTraces = distributedTracing.exportTraces('csv');

// Clear old traces (older than 1 hour)
distributedTracing.clearOldTraces(60 * 60 * 1000);
```

### 4. Health Checks

#### Built-in Health Checks

The service automatically includes checks for:
- Memory usage
- Storage accessibility
- App state
- Platform information

#### Custom Health Checks

```typescript
import { healthChecks } from '@/utils/observability';

// Register custom check
healthChecks.registerCheck('database', async () => {
  const start = Date.now();
  try {
    // Attempt database connection
    await database.query('SELECT 1');
    return {
      name: 'Database',
      status: 'healthy',
      message: 'Database responsive',
      lastChecked: new Date().toISOString(),
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'unhealthy',
      message: String(error),
      lastChecked: new Date().toISOString(),
      responseTime: Date.now() - start,
    };
  }
});

// Register network check
healthChecks.registerCheck('network', async () => {
  const start = Date.now();
  try {
    const response = await fetch('https://api.example.com/health', {
      method: 'HEAD',
      timeout: 5000,
    });
    const status = response.ok ? 'healthy' : 'degraded';
    return {
      name: 'Network',
      status,
      message: `HTTP ${response.status}`,
      lastChecked: new Date().toISOString(),
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'Network',
      status: 'unhealthy',
      message: String(error),
      lastChecked: new Date().toISOString(),
      responseTime: Date.now() - start,
    };
  }
});
```

#### Running Health Checks

```typescript
// Run all checks
const health = await healthChecks.runChecks();

// Get current health
const currentHealth = healthChecks.getHealth();

// Get specific check
const dbCheck = healthChecks.getCheckResult('database');

// Get statistics
const stats = healthChecks.getStatistics();
```

#### Alert Handling

```typescript
// Subscribe to health alerts
const unsubscribe = healthChecks.onHealthAlert((issue) => {
  console.error(`Health Issue: ${issue.name} (${issue.severity})`);
  console.error(`Message: ${issue.message}`);

  // Handle based on severity
  if (issue.severity === 'critical') {
    // Take immediate action
    showCriticalAlert(issue);
  }
});

// Later: unsubscribe
unsubscribe();

// Resolve issue
healthChecks.resolveIssue(issueId);

// Get unresolved issues
const unresolvedIssues = healthChecks.getUnresolvedIssues();
```

### 5. Main Observability Service

#### Event Tracking

```typescript
import { observabilityService } from '@/utils/observability';

// Track custom events
observabilityService.trackEvent('document_uploaded', {
  documentType: 'invoice',
  fileSize: 2048,
});

// Track errors
try {
  // operation
} catch (error) {
  observabilityService.trackError(
    error as Error,
    { operation: 'upload', retryCount: 3 }
  );
}

// Record metrics
observabilityService.recordMetric('api.request.duration', 150, {
  endpoint: '/api/documents',
});
```

#### Getting Observability Metrics

```typescript
// Get overall observability metrics
const metrics = await observabilityService.getMetrics();
// {
//   timestamp,
//   uptime,
//   memory,
//   performance: { networkLatency, databaseLatency, apiLatency },
//   health: { status, checks },
//   errors: { count, rate }
// }

// Get service integration status
const integrations = observabilityService.getServiceIntegrations();
// Returns array of { name, status, lastChecked, lastError? }
```

#### Configuration Management

```typescript
// Get current config
const config = observabilityService.getConfig();

// Update config
await observabilityService.updateConfig({
  level: 'detailed',
  metrics: {
    enabled: true,
    flushInterval: 120000,
  },
});

// Enable/disable observability
observabilityService.setEnabled(true);

// Set level
observabilityService.setLevel('debug');
```

#### Tracing

```typescript
// Create/get tracing context
const context = observabilityService.getTracingContext();

// Start distributed trace
const span = observabilityService.startTrace('document_processing', {
  documentId: '123',
});

// End trace
observabilityService.endTrace(span);

// Create new trace context
const newContext = observabilityService.createNewTracingContext();
```

## Monitoring Dashboard

The application includes a real-time monitoring dashboard at `/screens/monitoring/MonitoringDashboard`:

### Features

- Overall health status with uptime
- Performance metrics (latency)
- Error tracking
- Business metrics (uploads, syncs, users)
- Service integration status
- Real-time updates (30-second refresh)
- Pull-to-refresh functionality

### Screen Hierarchy

```
MonitoringDashboard
├── Health Overview Card
├── Performance Metrics Card
├── Error Tracking Card
├── Business Metrics Card
└── Service Status Card
```

## Metrics View

Detailed metrics visualization at `/screens/monitoring/MetricsView`:

### Features

- Time range selector (1H, 24H, 7D, 30D)
- KPI tracking with status
- Aggregated metric display
- Metric details dialog
- Export functionality (JSON/CSV)
- Detailed statistics (min, max, avg, p95, p99)

## Best Practices

### 1. Metric Naming

Use consistent naming conventions:

```typescript
// Good
metricsCollector.recordMetric({
  name: 'api.request.duration',
  value: 150,
  tags: { endpoint: '/documents', method: 'GET' }
});

// Good
metricsCollector.recordMetric({
  name: 'database.query.duration',
  value: 50,
  tags: { query: 'select_documents' }
});

// Avoid
metricsCollector.recordMetric({
  name: 'time', // Too generic
  value: 150
});
```

### 2. Log Levels

Use appropriate log levels:

```typescript
// DEBUG: Detailed information for troubleshooting
logAggregation.debug('Processing batch', { size: 100 });

// INFO: General informational messages
logAggregation.info('Upload started', { fileSize: 1024 });

// WARN: Warning conditions that should be reviewed
logAggregation.warn('Slow response detected', { duration: 5000 });

// ERROR: Error conditions that need immediate attention
logAggregation.logError(error, { operation: 'sync' });
```

### 3. Span Naming

Use clear, hierarchical span names:

```typescript
// Good hierarchy
distributedTracing.startSpan('document.upload');
distributedTracing.startSpan('document.upload.validation');
distributedTracing.startSpan('document.upload.upload');
distributedTracing.startSpan('document.upload.indexing');

// Avoid
distributedTracing.startSpan('operation');
distributedTracing.startSpan('process');
```

### 4. Error Handling

Always track errors in observability:

```typescript
try {
  await riskyOperation();
} catch (error) {
  // Track in observability
  observabilityService.trackError(error as Error, {
    operation: 'riskyOperation',
    context: 'specific_context',
  });

  // Log for debugging
  logAggregation.logError(error as Error, {
    operation: 'riskyOperation',
  });

  // Re-throw or handle
  throw error;
}
```

### 5. Performance Optimization

Configure sampling for high-volume scenarios:

```typescript
// Sample 5% of traces in production
await observabilityService.initialize({
  tracing: {
    enabled: true,
    samplingRate: 0.05, // 5% sampling
  },
  metrics: {
    enabled: true,
    flushInterval: 120000, // Flush every 2 minutes
    maxBatchSize: 200,
  },
});
```

## Troubleshooting

### High Memory Usage

```typescript
// Clear old metrics/logs regularly
metricsCollector.clearOldMetrics(24 * 60 * 60 * 1000); // 24 hours
logAggregation.clearOldLogs(24 * 60 * 60 * 1000);
distributedTracing.clearOldTraces(60 * 60 * 1000); // 1 hour

// Reduce sampling rate
await observabilityService.updateConfig({
  tracing: {
    samplingRate: 0.01, // 1% instead of 10%
  },
});
```

### Missing Metrics

```typescript
// Ensure initialization is complete
await observabilityService.initialize();

// Verify observability is enabled
if (!observabilityService.getConfig().enabled) {
  observabilityService.setEnabled(true);
}

// Check log level
const config = observabilityService.getConfig();
if (config.logging?.level === 'error') {
  // May miss info/debug logs
}
```

### Trace Not Appearing

```typescript
// Check sampling rate
const context = observabilityService.getTracingContext();
if (!context.sampled) {
  console.log('Trace not sampled - check samplingRate config');
}

// Ensure proper span completion
distributedTracing.endSpan(span, 'ok'); // Must explicitly end
```

## Performance Considerations

- **Metrics Flushing**: Default 60 seconds, increase for lower volume
- **Log Sampling**: Adjust based on log volume in production
- **Trace Sampling**: Default 10%, reduce for high-throughput scenarios
- **Health Check Interval**: Default 30 seconds, adjust as needed
- **Storage Retention**: Implement cleanup routines to manage storage

## Integration with CI/CD

Export metrics and logs for analysis:

```typescript
// In test/build pipeline
const metrics = metricsCollector.exportMetrics({ format: 'json' });
const logs = logAggregation.exportLogs('json');

// Upload to analytics service
await uploadMetricsToService(metrics);
await uploadLogsToService(logs);
```

## API Reference

See `/mobile-app/src/utils/observability/` for complete TypeScript interfaces and type definitions.

## References

- OpenTelemetry: https://opentelemetry.io/
- Distributed Tracing: https://www.jaegertracing.io/
- Prometheus Metrics: https://prometheus.io/

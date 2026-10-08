# Monitoring Dashboard Usage Guide - Phase 22.17

Complete guide to using the monitoring dashboards and interpreting metrics.

## Dashboard Overview

The monitoring system provides two main dashboards:

1. **MonitoringDashboard** - Real-time system overview
2. **MetricsView** - Detailed metrics analysis

## MonitoringDashboard

### Accessing the Dashboard

```typescript
import MonitoringDashboard from '@/screens/monitoring/MonitoringDashboard';

// In your navigation stack
<MonitoringDashboard />
```

### Dashboard Sections

#### 1. Overall Health Card

**Display**: Prominent health status with color coding

- **Healthy** (Green): All systems operating normally
- **Degraded** (Yellow): Some services experiencing minor issues
- **Unhealthy** (Red): Critical services offline or failing

**Metrics Shown**:
- Uptime: Total time since app started
- Issues: Number of unresolved health issues
- Checks: Total number of health checks performed

**Actions**:
- Tap to view detailed health report

#### 2. Performance Metrics Card

**Network Latency**: Average time for network requests
- Target: < 200ms
- Warning: 200-500ms
- Critical: > 500ms

**Database Latency**: Average database query time
- Target: < 50ms
- Warning: 50-200ms
- Critical: > 200ms

**API Latency**: Average API response time
- Target: < 250ms
- Warning: 250-750ms
- Critical: > 750ms

#### 3. Error Tracking Card

**Total Errors**: Cumulative error count
- Shows all errors since app launch

**Error Rate**: Errors per minute
- Used to identify degradation trends
- Alert if rate > 0.1 errors/min

#### 4. Business Metrics Card

**Uploads**:
- Total: All uploads attempted
- Success: Successful uploads
- Failed: Failed uploads
- Success Rate = Success / Total

**Syncs**:
- Total: All sync operations
- Success: Successful syncs
- Failed: Failed syncs
- Efficiency = Success / Total

**Active Users**:
- Users: Concurrent active users
- Sessions: Total active sessions

#### 5. Service Integrations Card

Status indicators for:
- Analytics Service
- Crash Reporting Service
- Metrics Collector
- Log Aggregation
- Distributed Tracing
- Health Checks

**Status Indicators**:
- ✓ Connected (Green)
- ! Alert (Yellow)
- ✗ Disconnected (Red)

### Dashboard Controls

**Refresh Button**: Manually refresh all metrics
- Triggered automatically every 30 seconds
- Manual refresh updates all cards immediately

**Export Button**: Export current metrics
- Exports in JSON format
- Includes all visible metrics and aggregations
- Useful for sharing reports

**Pull to Refresh**: Drag down to refresh
- Native pull-to-refresh gesture
- Updates dashboard data

### Interpreting Health Status

**Green (Healthy)**
- All checks passed
- No critical issues
- System operating optimally

**Yellow (Degraded)**
- Some checks failed or slow
- Non-critical issues present
- System functional but degraded
- Action: Monitor and investigate

**Red (Unhealthy)**
- Multiple failed checks
- Critical issues present
- System may not function properly
- Action: Immediate investigation required

## MetricsView

### Accessing the Metrics View

```typescript
import MetricsView from '@/screens/monitoring/MetricsView';

// In your navigation stack
<MetricsView />
```

### Time Range Selection

**Available Ranges**:
- 1H: Last hour
- 24H: Last 24 hours
- 7D: Last 7 days
- 30D: Last 30 days

**Usage**:
- Select to filter metrics data
- Updates all displayed metrics
- Refreshes automatically when changed

### KPI Section

Displays Key Performance Indicators with:

**KPI Display**:
- Current value
- Target value
- Variance percentage
- Status (Healthy/Warning/Critical)

**Status Calculation**:
```
Deviation = |Current - Target| / Target

Status:
- Healthy: Deviation ≤ 50% of threshold
- Warning: Deviation > 50% of threshold
- Critical: Deviation > threshold
```

**Examples**:
```
KPI: Response Time
- Target: 100ms
- Threshold: 20%
- Current: 150ms
- Deviation: (150-100)/100 = 50%
- Status: Warning (exceeds 50% threshold)

Current: 125ms
- Deviation: (125-100)/100 = 25%
- Status: Healthy (within 50% of threshold)
```

### Metric Cards

Each metric card displays:

**Header**:
- Metric name
- Percentage change indicator

**Statistics**:
- **Current**: Latest aggregated value
- **Min**: Minimum recorded value
- **Max**: Maximum recorded value
- **P95**: 95th percentile (high performers)

**Bottom**:
- Sample count: Number of data points collected

### Metric Sections

**Performance Metrics**
- Request latencies
- Operation durations
- Response times

**Business Metrics**
- Upload success rates
- Sync statistics
- User engagement

**Error Metrics**
- Error frequency
- Error types
- Error rates

**Other Metrics**
- Custom metrics
- Miscellaneous measurements

### Metric Detail Dialog

**Tap any metric card** to view detailed statistics:

- **Current**: Average value
- **Min**: Minimum value
- **Max**: Maximum value
- **P50**: Median value
- **P95**: 95th percentile
- **P99**: 99th percentile
- **Samples**: Total data points

### Export Functionality

**Export Button Actions**:

```typescript
// JSON Export
{
  "exportDate": "2024-01-15T10:30:00Z",
  "metrics": [
    {
      "name": "api.latency",
      "value": 150,
      "timestamp": 1705318200000,
      "tags": {"endpoint": "/documents"}
    }
  ],
  "aggregated": {
    "api.latency": {
      "count": 42,
      "avg": 145,
      "min": 50,
      "max": 500,
      "p95": 280
    }
  },
  "business": {
    "uploads": {...},
    "syncs": {...},
    "errors": {...},
    "users": {...}
  }
}

// CSV Export
timestamp,name,value,unit,tags
2024-01-15T10:30:00Z,api.latency,150,ms,endpoint:/documents
2024-01-15T10:31:00Z,api.latency,145,ms,endpoint:/documents
```

### Clear Old Data

**Clear Old Button**:
- Removes metrics older than retention period (default 7 days)
- Useful for managing storage
- Be cautious: deletion is permanent
- Recommended after exporting important data

## Performance Tuning

### Optimizing Metric Collection

```typescript
// Reduce metrics volume
await observabilityService.updateConfig({
  metrics: {
    enabled: true,
    flushInterval: 120000, // Increase from 60s to 2min
    maxBatchSize: 50, // Reduce from 100 to 50
  },
});

// Reduce trace sampling
await observabilityService.updateConfig({
  tracing: {
    enabled: true,
    samplingRate: 0.05, // Reduce from 10% to 5%
  },
});

// Limit log collection
logAggregation.setLevel('warn'); // Only warn and error
logAggregation.setSamplingRate(0.5); // Sample 50% of logs
```

### Dashboard Performance

**If dashboard is slow**:

1. Check device storage
   ```typescript
   const health = healthChecks.getHealth();
   const storageCheck = health.checks['storage'];
   ```

2. Clear old data
   ```typescript
   metricsCollector.clearOldMetrics(24 * 60 * 60 * 1000);
   logAggregation.clearOldLogs(24 * 60 * 60 * 1000);
   distributedTracing.clearOldTraces(60 * 60 * 1000);
   ```

3. Reduce observability level
   ```typescript
   observabilityService.setLevel('standard');
   ```

## Troubleshooting

### Dashboard Not Showing Data

**Check**: Observability service initialization
```typescript
const config = observabilityService.getConfig();
console.log('Enabled:', config.enabled);
console.log('Level:', config.level);
```

**Check**: Service integrations
```typescript
const integrations = observabilityService.getServiceIntegrations();
integrations.forEach(i => {
  if (i.status !== 'connected') {
    console.warn(`${i.name} not connected`);
  }
});
```

**Check**: Recent errors
```typescript
const errors = logAggregation.getErrorLogs();
console.log('Recent errors:', errors.slice(-5));
```

### Metrics Not Updating

**Possible causes**:
1. Observability disabled: Check `config.enabled`
2. Wrong time range: Check selected time range matches data
3. Sampling excluded data: Check `samplingRate`
4. Metrics not recorded: Verify calls to `recordMetric()`

**Verify**:
```typescript
// Check if metrics are being collected
const metrics = metricsCollector.getAllAggregatedMetrics();
console.log(`${metrics.length} metrics collected`);

// Check business metrics
const business = metricsCollector.getBusinessMetrics();
console.log('Uploads:', business.uploads.total);
console.log('Syncs:', business.syncs.total);
```

### Health Checks Failing

**Check**: Individual check status
```typescript
const health = healthChecks.getHealth();
Object.entries(health.checks).forEach(([name, result]) => {
  if (result.status === 'unhealthy') {
    console.error(`${name}: ${result.message}`);
  }
});
```

**Resolve**: Check specific issues
```typescript
// Memory check
const memory = healthChecks.getCheckResult('memory');

// Storage check
const storage = healthChecks.getCheckResult('storage');

// App state check
const appState = healthChecks.getCheckResult('app_state');
```

### High Memory Usage

**Identify**: Check device memory via health checks
```typescript
const stats = healthChecks.getStatistics();
console.log('Uptime:', stats.uptime, 'ms');
```

**Reduce**: Clear stored data
```typescript
// Clear with shorter retention
metricsCollector.clearOldMetrics(6 * 60 * 60 * 1000); // 6 hours
logAggregation.clearOldLogs(6 * 60 * 60 * 1000);
distributedTracing.clearOldTraces(30 * 60 * 1000); // 30 min

// Reduce collection
await observabilityService.updateConfig({
  metrics: {
    enabled: true,
    maxBatchSize: 50,
  },
  logging: {
    enabled: true,
    maxLogs: 500, // Reduce from 1000
  },
});
```

## Monitoring Checklist

### Daily Checks

- [ ] Review overall health status
- [ ] Check error rate trends
- [ ] Monitor active user count
- [ ] Verify sync success rate > 95%
- [ ] Check upload success rate > 99%

### Weekly Checks

- [ ] Review performance trends (latency)
- [ ] Check KPI achievement
- [ ] Export and archive metrics
- [ ] Review critical health issues
- [ ] Verify service integrations

### Monthly Checks

- [ ] Performance baseline update
- [ ] Capacity planning review
- [ ] Archive and cleanup old data
- [ ] Update alert thresholds
- [ ] Optimize sampling rates

## Alert Response Guide

### Error Rate Alerts

**Alert Threshold**: > 0.1 errors/minute

**Response**:
1. Check error logs for patterns
2. Identify most common error types
3. Review traces for errors
4. Investigate root cause
5. Implement fix or workaround

### Performance Degradation

**Alert Threshold**: Latency > 500ms (network), > 200ms (database)

**Response**:
1. Check recent deployments
2. Monitor system resources
3. Check network connectivity
4. Review slow spans in traces
5. Optimize queries or API calls

### Service Down

**Alert Threshold**: Service health = "unhealthy"

**Response**:
1. Verify service status
2. Check logs for errors
3. Restart service if applicable
4. Escalate if not recoverable
5. Implement failover

## Advanced Features

### Custom Alert Creation

```typescript
// Monitor specific metric
const interval = setInterval(async () => {
  const metrics = metricsCollector.getAllAggregatedMetrics();
  const apiLatency = metrics.find(m => m.name === 'api.latency');

  if (apiLatency && apiLatency.avg > 500) {
    // Create alert
    console.warn('High API latency detected:', apiLatency.avg);
    
    // Could send notification, log, etc.
  }
}, 60000); // Check every minute
```

### Metrics Export Pipeline

```typescript
// Automated export to backend
const exportInterval = setInterval(async () => {
  try {
    const metrics = metricsCollector.exportMetrics({ format: 'json' });
    const logs = logAggregation.exportLogs('json');

    // Upload to backend
    await fetch('/api/observability/export', {
      method: 'POST',
      body: JSON.stringify({ metrics, logs }),
    });

    // Clear old data after successful export
    metricsCollector.clearOldMetrics();
  } catch (error) {
    console.error('Export failed:', error);
  }
}, 24 * 60 * 60 * 1000); // Daily
```

## References

- [Observability.md](./OBSERVABILITY.md) - Complete API reference
- [Health Checks Configuration](./OBSERVABILITY.md#4-health-checks)
- [Metrics Reference](./OBSERVABILITY.md#1-metrics-collection)
- [Logging Guide](./OBSERVABILITY.md#2-structured-logging)

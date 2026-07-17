# 📊 Performance Testing Suite

Load testing configurations and utilities for the BI module and core services.

## Prerequisites

```bash
# Install Artillery globally
npm install -g artillery

# Or use locally
npm install --save-dev artillery
```

## Test Configurations

### 1. Load Test (`load-test.yml`)

Standard load testing scenario with three phases:
- **Warm up** (60s at 10 RPS): Baseline performance
- **Sustained load** (120s at 20 RPS): Normal operations
- **Stress test** (60s at 50 RPS): Peak load

**Run**:
```bash
artillery run load-test.yml
```

**Generate HTML Report**:
```bash
artillery run load-test.yml --output results.json
artillery report results.json
```

### 2. Stress Test (`stress-test.yml`)

Aggressive load test to find breaking point:
- **Baseline** (30s at 5 RPS): Control measurement
- **Ramp up** (120s from 50 to 200 RPS): Gradual increase
- **Maximum load** (60s at 200 RPS): Breaking point

**Run**:
```bash
artillery run stress-test.yml
```

### 3. Endurance Test (create as needed)

24+ hour sustained load test to identify memory leaks and performance degradation.

## Running Tests

### Quick Start

```bash
# Install dependencies
npm install -g artillery

# Run basic load test
cd performance-tests
artillery run load-test.yml

# Generate report
artillery report results.json
```

### Advanced Usage

```bash
# Run with custom target URL
artillery run load-test.yml --target http://staging.example.com:3000

# Run with higher verbosity
artillery run load-test.yml --verbose

# Run multiple iterations
for i in {1..5}; do
  artillery run load-test.yml --output results-run-$i.json
  artillery report results-run-$i.json
done

# Combine results
artillery merge results-run-*.json combined-results.json
artillery report combined-results.json
```

## Expected Results

### Successful Load Test

```
Summary Report
--------------
  Scenarios launched:  600
  Scenarios completed: 598
  Requests launched:   2990
  Requests completed:  2989
  Mean response/sec:   24.91
  Response time (msec):
    min: 45
    max: 1250
    median: 250
    p95: 520
    p99: 980
  Scenario counts:
    BI API Comprehensive Load Test: 600
  Codes:
    200: 2989
    502: 1

Ramp-up phase: OK - Load increased smoothly
Sustained phase: OK - Consistent response times
Stress phase: OK - System handled increased load
```

### Performance Issues

If you see:
- p95 response time > 1000ms: Database optimization needed
- > 5% error rate: System overload or backend issue
- Memory usage > 80%: Memory leak suspected
- CPU usage > 90%: Need to scale horizontally

## Monitoring During Tests

### Terminal 1: Run load test
```bash
artillery run load-test.yml
```

### Terminal 2: Monitor backend
```bash
# Watch backend logs
sudo journalctl -u lucide-backend -f

# Or with filtering
sudo journalctl -u lucide-backend -f | grep ERROR
```

### Terminal 3: Monitor database
```bash
# Connect to database
psql -h localhost -U postgres -d lucide_bi

# Monitor active queries
SELECT pid, query, query_start FROM pg_stat_activity 
  WHERE query NOT LIKE '%pg_stat_activity%' 
  ORDER BY query_start;
```

### Terminal 4: Monitor system
```bash
# Watch system metrics
htop

# Or
watch -n 1 'ps aux | grep node'
```

## Performance Analysis

### Interpreting Results

**Response Time Percentiles**:
- p50 (median): 50% of requests faster than this
- p95: 95% of requests faster than this (SLA target)
- p99: 99% of requests faster than this (rare cases)

**Key Metrics**:
- **Throughput (RPS)**: Requests per second the system can handle
- **Success Rate**: Percentage of requests that completed successfully
- **Error Rate**: Percentage of failed requests

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| High response times | Database slow queries | Add indexes, optimize queries |
| Memory leak | Unbounded cache growth | Implement TTL, add GC |
| High error rate | Resource exhaustion | Scale horizontally, optimize code |
| CPU spikes | Expensive calculations | Batch operations, use workers |

## Integration with CI/CD

### Add to GitHub Actions

```yaml
- name: Run performance tests
  run: |
    npm install -g artillery
    artillery run performance-tests/load-test.yml --output results.json
    artillery report results.json
    
- name: Check performance
  run: |
    # Fail if p95 response time > 1000ms
    if artillery report results.json | grep -q "p95.*[0-9]\{4\}"; then
      echo "❌ Performance regression detected"
      exit 1
    fi
```

## Database Performance Profiling

Monitor slow queries during test:

```sql
-- Enable slow query log (PostgreSQL)
SET log_min_duration_statement = 100; -- Log queries > 100ms

-- View slow queries
SELECT query, mean_time, max_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

## Cache Analysis

Monitor cache during test:

```bash
# Connect to Redis
redis-cli -h localhost

# Monitor commands in real-time
> MONITOR

# Check memory
> INFO memory

# Check keys
> KEYS bi:*
> DBSIZE
```

## Next Steps

1. **Baseline**: Run load test to establish baseline
2. **Monitor**: Identify bottlenecks and issues
3. **Optimize**: Apply fixes and improvements
4. **Retest**: Run test again to verify improvements
5. **Document**: Record results and SLAs

## Resources

- [Artillery Docs](https://artillery.io/docs)
- [Performance Best Practices](https://nodejs.org/en/docs/guides/nodejs-performance/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Performance Tuning](https://redis.io/topics/optimization)

---

**Last Updated**: 2026-07-17  
**Maintained by**: Performance Team

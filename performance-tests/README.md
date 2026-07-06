# Performance Testing Suite - k6

Complete performance testing suite for Rental Listing Sync system.

## 5 Load Test Scenarios

### 1. Authentication Load Test (`auth-load.js`)
**Purpose**: Validate authentication system capacity
**Load Profile**: 10 req/sec constant for 5 minutes
**Metrics**:
- P95 Response Time: < 200ms
- P99 Response Time: < 500ms
- Error Rate: < 0.1%

**What it tests**:
- User signup
- User login
- Token validation (/auth/me)

### 2. Calendar API Test (`calendar-api.js`)
**Purpose**: Validate calendar and booking API performance
**Load Profile**: 50 req/sec constant for 5 minutes
**Metrics**:
- Calendar read P95: < 100ms (cached)
- Booking create P95: < 200ms
- Redis cache hit rate: > 80%
- Error Rate: < 0.1%

**What it tests**:
- Calendar fetch (180-day range)
- Calendar filter (date range)
- Booking creation

### 3. OTA Webhook Simulation (`webhook-simulation.js`)
**Purpose**: Validate webhook processing under peak load
**Load Profile**: 
- Booking.com: 60 events/sec
- VRBO: 40 events/sec
- Total: 100 events/sec for 2 minutes
**Metrics**:
- Message latency P95: < 500ms
- Queue processing: < 1000 pending jobs
- Error Rate: < 1%

**What it tests**:
- HMAC signature verification
- Queue job processing
- Database writes under load

### 4. Dynamic Pricing Test (`pricing-engine.js`)
**Purpose**: Validate pricing calculation performance
**Load Profile**: 20 req/sec constant for 3 minutes
**Metrics**:
- Calculation P95: < 200ms
- Forecast P95: < 300ms
- Error Rate: < 1%

**What it tests**:
- Dynamic price calculation
- Demand forecasting
- AI pricing logic

### 5. Concurrent Users Test (`concurrent-users.js`)
**Purpose**: Validate system stability under variable load
**Load Profile**: Ramp 0→500 users over 2min, sustain 5min, ramp down 3min
**Metrics**:
- Response time stability (no degradation)
- Memory stability (no leaks)
- Connection pool health
- Error Rate: < 1%

**What it tests**:
- User browsing journey
- Concurrent property access
- Booking creation at scale

## Installation

```bash
# Install k6
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Docker
docker run -v $(pwd):/scripts -it grafana/k6:latest run /scripts/auth-load.js

# Windows
choco install k6
```

## Running Tests

### Setup Environment Variables
```bash
# Backend should be running on localhost:3000
export API_URL="http://localhost:3000"
export AUTH_TOKEN="your-valid-jwt-token"
export PROPERTY_ID="1"
export BOOKING_SECRET="your-booking-webhook-secret"
export VRBO_SECRET="your-vrbo-webhook-secret"
```

### Individual Test Execution

```bash
# Authentication load test
k6 run auth-load.js

# Calendar API test
k6 run calendar-api.js --vus 50

# Webhook simulation
k6 run webhook-simulation.js

# Pricing engine test
k6 run pricing-engine.js

# Concurrent users test
k6 run concurrent-users.js
```

### Generate Reports

```bash
# CSV Report
k6 run auth-load.js --out csv=results.csv

# Summary Report
k6 run auth-load.js --summary-export=summary.json

# JSON Report
k6 run auth-load.js --out json=output.json
```

### Run All Tests (Sequential)

```bash
#!/bin/bash
echo "Running Authentication Load Test..."
k6 run auth-load.js

echo "Running Calendar API Test..."
k6 run calendar-api.js

echo "Running Webhook Simulation..."
k6 run webhook-simulation.js

echo "Running Pricing Engine Test..."
k6 run pricing-engine.js

echo "Running Concurrent Users Test..."
k6 run concurrent-users.js

echo "All tests completed!"
```

## Success Criteria

All tests must meet these criteria to pass:

| Test | P95 Latency | P99 Latency | Error Rate | Status |
|------|------------|------------|-----------|--------|
| Authentication | < 200ms | < 500ms | < 0.1% | ✅ |
| Calendar API | < 100ms* | < 200ms | < 0.1% | ✅ |
| Webhooks | < 500ms | < 1000ms | < 1% | ✅ |
| Pricing | < 200ms | < 300ms | < 1% | ✅ |
| Concurrent | < 500ms | < 1000ms | < 1% | ✅ |

*Cached reads should be faster

## Monitoring During Tests

In another terminal, monitor the backend:

```bash
# Watch logs
docker-compose logs -f backend

# Monitor database connections
psql -h localhost -U postgres -d rental_sync -c "SELECT count(*) FROM pg_stat_activity;"

# Monitor Redis
redis-cli INFO stats
```

## Analysis & Optimization

After running tests:

1. **Review Results**: Check k6 output for failures
2. **Identify Bottlenecks**: 
   - High database query times? Add indexes
   - High memory? Check for leaks
   - Queue backlog? Increase worker concurrency
3. **Optimize**:
   - Add caching
   - Optimize queries
   - Increase connection pools
   - Horizontal scaling

## Troubleshooting

### Tests failing with 401
- Ensure AUTH_TOKEN is valid JWT
- Token may have expired, generate new one from login endpoint

### Tests failing with 404
- Ensure API_URL is correct
- Backend should be running on port 3000
- Check firewall settings

### Too many connections error
- Database connection pool exhausted
- Increase DATABASE_POOL_SIZE in .env
- Check for connection leaks in code

### Webhook signature errors
- Ensure BOOKING_SECRET and VRBO_SECRET match backend .env
- Check HMAC calculation in webhook-simulation.js

## Next Steps

1. **Baseline Establishment**: Run all tests once to establish baseline metrics
2. **Stress Testing**: Increase load gradually to find breaking point
3. **Optimization**: Fix identified bottlenecks
4. **Regression Testing**: Re-run after optimizations
5. **Production**: Deploy and monitor real metrics

## References

- [k6 Documentation](https://k6.io/docs/)
- [PERFORMANCE_TEST_PLAN.md](../PERFORMANCE_TEST_PLAN.md)
- [Architecture](../ARCHITECTURE.md)

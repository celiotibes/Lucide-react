# Performance Testing Plan - Rental Listing Sync

**Status**: 📋 Plano Definido  
**Data**: 2026-07-06  
**Target**: Validar sistema sob carga antes de produção

---

## 1. Objetivos de Performance

### Métricas Críticas
| Métrica | Target | Limite Máximo |
|---------|--------|---------------|
| Response Time (P50) | <100ms | <500ms |
| Response Time (P95) | <200ms | <1000ms |
| Response Time (P99) | <500ms | <2000ms |
| Error Rate | <0.1% | <1% |
| Throughput | 100 req/sec | 50 req/sec min |
| Database Query Time | <50ms | <200ms |
| Memory Usage | <500MB | <1000MB |
| CPU Usage | <70% | <90% |

---

## 2. Cenários de Teste

### 2.1 Authentication (10 req/sec, 5 min)
```
Objetivo: Validar capacidade de login/signup

Endpoints:
- POST /auth/signup (create new user)
- POST /auth/login (authenticate)
- GET /auth/me (validate token)

Load Profile:
- Ramp-up: 10 sec (0→10 req/sec)
- Steady: 5 min (10 req/sec constant)
- Ramp-down: 10 sec (10→0 req/sec)

Success Criteria:
- Response time P95 < 200ms
- Error rate < 0.1%
- All tokens valid
```

### 2.2 Calendar API (50 req/sec, 5 min)
```
Objetivo: Validar performance da API de calendário

Endpoints:
- GET /api/properties/:id/calendar (fetch 180 days)
- GET /api/properties/:id/calendar?date=YYYY-MM-DD (filter)
- POST /api/properties/:id/bookings (create booking)

Load Profile:
- 30% read queries (calendar fetch)
- 20% filter queries (date range)
- 50% booking creation

Success Criteria:
- Calendar queries P95 < 100ms (cached)
- Booking creation P95 < 200ms
- Database connection pool stable
- Redis cache hit rate > 80%
```

### 2.3 OTA Webhook Simulation (100 events/sec, 2 min)
```
Objetivo: Validar processamento de webhooks sob pico

Endpoints:
- POST /webhooks/booking-com (Booking.com events)
- POST /webhooks/vrbo (VRBO events)

Load Profile:
- Booking.com: 60 events/sec
- VRBO: 40 events/sec
- Random event types (booking, cancellation, modification)

Success Criteria:
- Webhook processing queue < 1000 pending
- Message latency P95 < 500ms
- No lost webhooks
- Database transactions consistent
```

### 2.4 Dynamic Pricing (20 req/sec, 3 min)
```
Objetivo: Validar cálculos de preços dinâmicos

Endpoints:
- POST /api/properties/:id/pricing/calculate
- GET /api/properties/:id/pricing/forecast

Load Profile:
- 70% price calculations
- 30% forecasting queries
- Concurrent users: 100

Success Criteria:
- Calculation time P95 < 200ms
- Forecast queries P95 < 300ms
- AI API quota not exceeded
- Accurate pricing multipliers
```

### 2.5 Concurrent Users (100→500 users, 10 min)
```
Objetivo: Validar comportamento sob múltiplos usuários simultâneos

Simula:
- User login
- Property browsing
- Calendar viewing
- Booking creation
- Pricing checks

Load Profile:
- Ramp: 0→500 users over 2 min
- Steady: 500 users for 5 min
- Ramp down: 500→0 over 3 min

Success Criteria:
- Response time stable (not degrading)
- Memory not leaking
- Database connection pool healthy
- No cascading failures
```

---

## 3. Infrastructure Requirements

### Ambiente de Teste
```
Database:
- PostgreSQL 16 (test instance)
- 10GB storage
- Connection pooling enabled
- Monitoring enabled

Cache:
- Redis 7 (test instance)
- Monitoring enabled
- Memory limit: 2GB

Backend:
- 2 instances (load balanced)
- 2 CPU cores each
- 2GB RAM each
- Network: 1Gbps

Load Generator:
- k6 or Apache JMeter
- 1 dedicated machine
- 16GB RAM minimum
```

### Monitoring During Tests
```
Metrics to Track:
- Response times (P50, P95, P99)
- Error rates and types
- Database query times
- Redis hit/miss rates
- Memory usage
- CPU usage
- Network throughput
- Queue depths (Bull)
```

---

## 4. Load Testing Tools

### Option 1: k6 (Recommended)
```javascript
// Example k6 script
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '5m', target: 10 },
    { duration: '1m', target: 0 }
  ],
  thresholds: {
    'http_req_duration': ['p(95)<200'],
    'http_req_failed': ['rate<0.1']
  }
};

export default function () {
  let res = http.get('http://api:3000/api/properties');
  check(res, {
    'status is 200': (r) => r.status === 200
  });
  sleep(1);
}
```

### Option 2: Apache JMeter
```
Thread Groups:
- Auth Test (10 threads, 5 min)
- Calendar API (50 threads, 5 min)
- Webhook Simulation (100 events/sec, 2 min)
- Pricing (20 threads, 3 min)
- Concurrent Users (500 threads, 10 min)

Listeners:
- Summary Report
- Graph Results
- Table Results
```

---

## 5. Expected Bottlenecks & Solutions

### Potential Issues
1. **Database Query Performance**
   - Problem: Slow calendar queries with large date ranges
   - Solution: Implement pagination, add GIST indexes, caching

2. **Redis Memory**
   - Problem: Exceeding memory limit with large cache
   - Solution: Implement TTL, eviction policy (LRU)

3. **API Rate Limiting**
   - Problem: Legitimate users hitting rate limits
   - Solution: Implement token bucket instead of sliding window

4. **OTA API Limits**
   - Problem: Exceeding Booking.com (2 req/sec) or VRBO (10 req/sec)
   - Solution: Implement request queuing, backoff strategy

5. **Worker Queue Buildup**
   - Problem: Bull queue jobs piling up
   - Solution: Increase worker concurrency, add more workers

---

## 6. Success Criteria

### All Tests Must Pass:
- ✅ No response time > 2000ms (P99)
- ✅ Error rate < 1% on all tests
- ✅ No memory leaks detected
- ✅ Database connections stable
- ✅ Redis cache working (hit rate > 70%)
- ✅ All webhooks processed (0 lost)
- ✅ Pricing calculations accurate
- ✅ System recovers from spikes

### Red Flags (Fail Criteria):
- ❌ Response time P95 > 500ms consistently
- ❌ Error rate > 5%
- ❌ Memory growth > 100MB/min (leak indicator)
- ❌ Database connection pool exhaustion
- ❌ OTA API errors (rate limiting)
- ❌ Data inconsistencies after test

---

## 7. Execution Timeline

### Phase 1: Preparation (Day 1)
- [ ] Setup test environment
- [ ] Configure monitoring
- [ ] Prepare load test scripts
- [ ] Establish baseline metrics

### Phase 2: Individual Tests (Day 2-3)
- [ ] Run Authentication test
- [ ] Run Calendar API test
- [ ] Run Webhook Simulation test
- [ ] Run Dynamic Pricing test

### Phase 3: Stress Testing (Day 4)
- [ ] Run Concurrent Users test
- [ ] Identify bottlenecks
- [ ] Document findings

### Phase 4: Analysis & Optimization (Day 5)
- [ ] Analyze results
- [ ] Implement fixes
- [ ] Re-test critical paths
- [ ] Generate performance report

---

## 8. Performance Report Template

```
# Performance Test Results

Date: YYYY-MM-DD
Environment: Staging
Test Duration: 30 min

## Summary
- Total Requests: X
- Successful: X (%)
- Failed: X (%)
- Average Response Time: Xms
- P95 Response Time: Xms
- P99 Response Time: Xms

## By Endpoint
[Table with response times for each endpoint]

## Bottlenecks Found
1. [Issue 1]
2. [Issue 2]

## Recommendations
1. [Action 1]
2. [Action 2]

## Sign-off
- Performance: [PASS/FAIL]
- Ready for Production: [YES/NO]
```

---

## 9. Commands to Run Tests

```bash
# Using k6
k6 run tests/auth-load.js
k6 run tests/calendar-api.js
k6 run tests/webhook-simulation.js
k6 run tests/pricing-engine.js
k6 run tests/concurrent-users.js

# Using JMeter
jmeter -n -t tests/AuthTest.jmx -l results.jtl

# Generate reports
k6 run tests/auth-load.js --out csv=results.csv
```

---

## 10. Success Checklist

- [ ] All response times within targets
- [ ] Error rate < 1%
- [ ] No memory leaks
- [ ] Database stable
- [ ] OTA API limits respected
- [ ] Webhook processing reliable
- [ ] Pricing calculations accurate
- [ ] System recovers from load spike
- [ ] All monitoring data collected
- [ ] Performance report generated
- [ ] Optimization recommendations made
- [ ] Ready for production deployment

---

**Next Step**: Execute Phase 1 (Setup) on Day 1  
**Estimated Total Time**: 5 days  
**Owner**: DevOps/QA Team

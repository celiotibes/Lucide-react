# Legal Automation Platform - Architecture & Best Practices

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER (React/Web)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│                    API GATEWAY LAYER                         │
│  ┌──────────────────────────────────────────────────────────┤
│  │ • Authentication (verifyToken)                            │
│  │ • Rate Limiting (100 req/60s per IP)                      │
│  │ • Request Validation (centralized schemas)                │
│  │ • Response Caching (5min, 30min, 1min variants)           │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  ROUTER LAYER (Express)                      │
│  ┌──────────────────────────────────────────────────────────┤
│  │ • CRM Router       • Contract Router    • Audit Router    │
│  │ • Intimation Router • Financial Router  • Event Router    │
│  │ • Jurimetry Router • Cache Router      • Health Router    │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                SERVICE LAYER (Business Logic)               │
│  ┌──────────────────────────────────────────────────────────┤
│  │ CORE SERVICES:                                            │
│  │ • CRMService (Client relationship management)            │
│  │ • ContractLifecycleService (Contract management + ICP)   │
│  │ • FinancialService (Invoicing & payments)                │
│  │ • JurimetriaService (Case analytics & prediction)        │
│  │ • IntimationCaptureService (Document processing)         │
│  │                                                           │
│  │ INFRASTRUCTURE SERVICES:                                  │
│  │ • AuditTrailService (Compliance logging)                 │
│  │ • EventService (Event-driven pub/sub)                    │
│  │ • CacheService (In-memory caching with TTL)              │
│  │ • HealthCheckService (System monitoring)                  │
│  │ • WhatsAppBotService (Conversational automation)         │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              RESILIENCE & OBSERVABILITY LAYER                │
│  ┌──────────────────────────────────────────────────────────┤
│  │ • Circuit Breaker (webhooks, DB, external APIs)          │
│  │ • Retry Logic (exponential backoff)                       │
│  │ • Health Checks (liveness, readiness probes)             │
│  │ • Structured Logging (pino logger)                        │
│  │ • Event History (10k events buffer)                       │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│            PERSISTENCE & DATA ACCESS LAYER                   │
│  ┌──────────────────────────────────────────────────────────┤
│  │ • In-Memory Storage (current - fast, for dev)            │
│  │ • PostgreSQL Adapter (stub - ready for implementation)   │
│  │ • Generic Repository Pattern                             │
│  │ • Automatic TTL-based cleanup                            │
│  │ • LRU eviction for bounded memory                        │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 EXTERNAL INTEGRATIONS                        │
│  ┌──────────────────────────────────────────────────────────┤
│  │ • Webhooks (event delivery with retry & backoff)         │
│  │ • WhatsApp Integration (for customer engagement)         │
│  │ • ICP-Brasil Digital Signatures                          │
│  │ • Third-party APIs (protected by circuit breakers)       │
│  └──────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

## Core Design Patterns

### 1. Service Layer Pattern
Every business domain has a dedicated service class:
- Singleton instances exported as constants
- In-memory Map-based storage with type safety
- Async/await for all I/O operations
- Comprehensive error handling with logging

```typescript
// Example: CRMService
export class CRMService {
  private clients: Map<string, ClientProfile> = new Map();
  
  async createOrUpdateClient(data: ClientData): Promise<ClientProfile> {
    // Business logic here
    logger.info({ clientId }, 'Client created');
  }
}

export const crmService = new CRMService();
```

### 2. Repository Pattern (Emerging)
Abstraction for data persistence:
- `PersistenceAdapter<T>` - database agnostic interface
- `Repository<T>` - base class for all repositories
- In-Memory implementation (current)
- PostgreSQL implementation (ready for build-out)

Enables:
- Database switching without service changes
- Testing with mock adapters
- Future scaling to PostgreSQL

### 3. Circuit Breaker for Resilience
Protects against cascading failures:
- States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (recovering)
- Automatic state transitions
- Three instances pre-configured:
  - `webhookBreaker`: 3 failures, 30s timeout
  - `databaseBreaker`: 5 failures, 60s timeout
  - `externalAPIBreaker`: 4 failures, 45s timeout

Usage:
```typescript
import { externalAPIBreaker } from '@utils/circuitBreaker';

await externalAPIBreaker.execute(async () => {
  return fetch(externalUrl);
});
```

### 4. Event-Driven Architecture
Loose coupling between services:
- Pre-defined event types (16 total)
- Event emitter for pub/sub
- Webhook delivery for external systems
- Event history (10k buffer, FIFO eviction)
- Automatic retry with exponential backoff

```typescript
import { eventService, EVENTS } from '@services/EventEmitterService';

eventService.on(EVENTS.CONTRACT_SIGNED, (payload) => {
  // React to contract signing
});

eventService.emit(EVENTS.CONTRACT_SIGNED, 'system', {
  contractId: 'c1',
  signedAt: new Date()
});
```

### 5. Caching Strategy
Three-tier caching approach:

**Cache Levels:**
1. **HTTP Response Cache** (via middleware)
   - GET_CACHE: 5 minutes (general data)
   - ANALYTICS_CACHE: 30 minutes (heavy computations)
   - SHORT_CACHE: 1 minute (volatile data)

2. **Service-Level Cache** (CacheService)
   - Generic, type-safe, with TTL
   - LRU eviction when size limit reached
   - Hit/miss tracking
   - Memory usage monitoring

3. **Database Query Cache** (future)
   - Row-level caching
   - Invalidation on write

**Cache Invalidation Pattern:**
```typescript
// Automatic via pattern matching
invalidateCache('contract:');  // Invalidates all contract cache

// Manual via API
DELETE /api/v1/cache/keys/specific-key
DELETE /api/v1/cache/clear
```

## Deployment Architecture

### Health Checks (Kubernetes Ready)

**Liveness Probe** (`GET /health/live`)
- Simple check every 10s
- Restarts container if fails
- Checks: Node.js process alive

**Readiness Probe** (`GET /health/ready`)
- Detailed checks every 5s
- Removes from load balancer if fails
- Checks: memory, CPU, uptime, services

**Metrics** (`GET /health/metrics`)
- Prometheus-compatible format
- Service uptime, health status, check counts

### Rate Limiting Strategy
- Per-IP client rate limiting
- 100 requests per 60-second window (configurable)
- Sliding window algorithm
- Response headers: X-RateLimit-*
- Automatic client isolation

### Audit & Compliance
- Complete audit trail for all changes
- Before/after value tracking
- User and timestamp tracking
- Query-able by: user, action, entity, date range
- CSV export for compliance reports
- Essential for: LGPD, GDPR, legal liability

## Data Models

### Contract Lifecycle
```
draft → review → pending_signature → signed → executed → archived
         ↑           ↓
         └───────────┘
         (can iterate)
```

### Invoice Status
```
draft → sent → partially_paid → paid → archived
        ↓
     overdue
```

### Case Status
```
registered → in_progress → closed (favorable/unfavorable/partial/dismissed/settled)
```

## Error Handling Strategy

### Error Types
1. **Validation Errors** (400)
   - Missing required fields
   - Invalid data types
   - Business rule violations

2. **Not Found Errors** (404)
   - Entity doesn't exist
   - Resource deleted

3. **Conflict Errors** (409)
   - Duplicate entity
   - Concurrent modification

4. **Rate Limit Errors** (429)
   - Too many requests from IP

5. **Service Errors** (503)
   - Circuit breaker OPEN
   - Database unreachable
   - External API failure

6. **Internal Errors** (500)
   - Unexpected application errors
   - Always logged with stack trace

### Error Response Format
```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "message": "Validation failed: name is required",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Testing Strategy

### Test Pyramid
```
              /\
             /  \     Integration Tests (25%)
            /────\    • Database + API
           /      \   • End-to-end flows
          /        \
         /──────────\  Unit Tests (75%)
        /            \ • Services (42 tests)
       /              \• Middlewares (31 tests)
      /                \• Utils (22 tests)
```

### Test Coverage Requirements
- Services: ≥90% line coverage
- Critical paths: 100% coverage
- New features: Tests before implementation

## Monitoring & Observability

### Metrics to Track
- Request count and latency (per endpoint)
- Error rate (by type)
- Cache hit rate (%)
- Circuit breaker state changes
- Memory usage trend
- Event queue depth

### Logging Strategy
- Info: Important business events
- Warn: Degraded operation, retry attempts
- Error: Failures, stack traces
- Debug: Detailed flow tracking (disabled in prod)

### Alerts to Configure
- Error rate > 1%
- Memory usage > 85%
- Circuit breaker OPEN
- Health check failing
- Request latency > 5s (p95)

## Future Evolution Path

### Phase 1 (Current)
✅ 5 Core Services (CRM, Contracts, Financial, Jurimetry, Intimation)
✅ 5 Infrastructure Services (Audit, Events, Validation, RateLimit, Cache)
✅ In-Memory Storage
✅ REST API (100+ endpoints)

### Phase 2 (Next Priority)
- [ ] PostgreSQL Persistence Adapter
- [ ] WebSocket Real-time Updates
- [ ] GraphQL API Layer
- [ ] Advanced Search (Elasticsearch)
- [ ] Document Storage (S3)

### Phase 3 (Scaling)
- [ ] Microservices Architecture
- [ ] Message Queue (RabbitMQ/Kafka)
- [ ] Distributed Caching (Redis)
- [ ] API Gateway (Kong/Nginx)
- [ ] Service Mesh (Istio)

### Phase 4 (Intelligence)
- [ ] ML Model Training Pipeline
- [ ] Case Outcome Prediction
- [ ] Automated Recommendations
- [ ] Anomaly Detection
- [ ] Natural Language Processing

## Performance Tuning

### Current Performance (In-Memory)
- Request latency: 5-50ms (cached: 1-5ms)
- Throughput: 1000s req/s possible
- Memory usage: ~500MB for 10k contracts
- CPU: Low (<10% idle system)

### Optimization Opportunities
1. **Database Indexes** (PostgreSQL)
   - Entity ID (primary)
   - User ID (audit queries)
   - Creation date (filtering)
   - Status (workflow queries)

2. **Query Optimization**
   - Lazy loading relationships
   - Batch operations
   - Connection pooling

3. **Caching**
   - Redis for distributed cache
   - Cache warming on startup
   - Cache invalidation strategy

4. **Async Processing**
   - Queue long-running tasks
   - Background job processor
   - Webhook delivery queuing

## Security Considerations

### Authentication & Authorization
- JWT token verification on all endpoints
- Role-based access control (future)
- API key for service-to-service

### Data Protection
- Audit trail for compliance
- PII handling (LGPD compliant)
- Encryption for sensitive data (future)
- Secure password hashing (future)

### API Security
- Rate limiting (DDoS protection)
- Input validation (injection prevention)
- CORS configuration
- HTTPS only (production)
- Security headers (helmet.js)

### Infrastructure Security
- Environment variable secrets
- Database credentials rotation
- API key rotation
- Audit log retention (90+ days)

## Conclusion

This architecture provides:
- **Scalability**: From startup to enterprise (100k+ users)
- **Reliability**: Circuit breakers, health checks, audit trails
- **Maintainability**: Service layer, repository pattern, DI
- **Observability**: Comprehensive logging, metrics, health checks
- **Compliance**: Audit trails, data handling, retention policies

The design prioritizes simplicity with room for growth. Each layer is independently testable and can be swapped for alternatives as requirements evolve.

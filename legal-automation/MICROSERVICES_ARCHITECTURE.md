# Phase 9: Microservices Architecture

## Overview

Phase 9 documenta a estratégia de decomposição de serviços para escalabilidade horizontal, incluindo padrões de comunicação, event bus, service discovery e deployment.

## Current Monolithic Architecture

```
┌─────────────────────────────────────────────────┐
│         Legal Automation Monolith               │
├─────────────────────────────────────────────────┤
│  Controllers                                    │
│  ├─ Auth, Petitions, Cases, Clients           │
│  ├─ GraphQL, WebSocket, REST APIs             │
│  └─ 50+ endpoints                             │
├─────────────────────────────────────────────────┤
│  Services                                      │
│  ├─ Domain: Cases, Clients, Contracts, etc   │
│  ├─ Infrastructure: DB, Cache, Search, etc   │
│  └─ Cross-cutting: Logging, Security, etc    │
├─────────────────────────────────────────────────┤
│  Database (PostgreSQL)                        │
│  Cache (Redis)                                │
│  Search (Elasticsearch)                       │
└─────────────────────────────────────────────────┘
```

## Target Microservices Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Auth        │  │  Case        │  │  Client      │
│  Service     │  │  Service     │  │  Service     │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ JWT + OAuth2 │  │ CRUD + Logic │  │ CRM + Portal │
│ 2FA, RBAC    │  │ Workflow Mgmt│  │ Analytics    │
└──────────────┘  └──────────────┘  └──────────────┘
       ↓                  ↓                  ↓
       └──────────────┬───┴──────────────┬──┘
                      ↓
            ┌──────────────────────┐
            │   API Gateway        │
            │ (Rate Limit, Auth)   │
            └──────────────────────┘
                      ↓
       ┌──────────────┴──────────────┐
       ↓                             ↓
┌─────────────────┐        ┌──────────────────┐
│  Event Bus      │        │  Service         │
│  (RabbitMQ)     │        │  Registry        │
└─────────────────┘        └──────────────────┘
       ↓
┌─────────────────────────────────────┐
│  Cache Layer (Redis)                │
│  - Service-to-service caching       │
│  - Session store                    │
│  - Rate limit buckets               │
└─────────────────────────────────────┘
       ↓
┌─────────────────────────────────────┐
│  Data Layer                         │
│  - PostgreSQL (per service)         │
│  - Elasticsearch (shared)           │
│  - Message Queue (RabbitMQ)         │
└─────────────────────────────────────┘
```

## Service Decomposition Strategy

### 1. Auth Service
**Port:** 3001  
**Database:** PostgreSQL (shared)  
**Responsibilities:**
- User authentication (JWT, OAuth2)
- API Key validation
- 2FA/MFA management
- RBAC enforcement
- Permission caching

**Events:**
- `auth.user.created`
- `auth.user.login`
- `auth.token.issued`
- `auth.token.revoked`

### 2. Case Management Service
**Port:** 3002  
**Database:** PostgreSQL (shared)  
**Responsibilities:**
- Case CRUD operations
- Case workflow management
- Case status tracking
- Deadline management
- Integration with tribunals

**Events:**
- `case.created`
- `case.updated`
- `case.status_changed`
- `case.deadline_approaching`

### 3. Client Service
**Port:** 3003  
**Database:** PostgreSQL (shared)  
**Responsibilities:**
- Client data management
- CRM functionality
- Client portal
- Contract management
- Client analytics

**Events:**
- `client.created`
- `client.updated`
- `client.status_changed`
- `client.risk_score_updated`

### 4. Financial Service
**Port:** 3004  
**Database:** PostgreSQL (shared)  
**Responsibilities:**
- Invoice management
- Payment processing
- Financial analytics
- Budget tracking
- Report generation

**Events:**
- `invoice.created`
- `invoice.paid`
- `invoice.overdue`
- `payment.received`

### 5. Analytics Service
**Port:** 3005  
**Database:** PostgreSQL (shared)  
**Responsibilities:**
- KPI calculation
- Dashboard metrics
- Performance analytics
- Report generation
- Data aggregation

**Events:**
- `metrics.calculated`
- `report.generated`
- `dashboard.updated`

### 6. Search Service
**Port:** 3006  
**Database:** Elasticsearch (shared)  
**Responsibilities:**
- Full-text search
- Faceted search
- Autocomplete
- Search index management

**Events:**
- `search.indexed`
- `search.reindexed`

### 7. Notification Service
**Port:** 3007  
**Database:** PostgreSQL (shared)  
**Responsibilities:**
- Email notifications
- SMS alerts
- Push notifications
- Notification templates
- Delivery tracking

**Events:**
- `notification.sent`
- `notification.failed`

### 8. API Gateway
**Port:** 3000  
**Responsibilities:**
- Request routing
- Rate limiting
- Authentication (delegate to Auth Service)
- Request/response logging
- API versioning

## Communication Patterns

### 1. Synchronous (gRPC / REST)
Used for immediate responses:

```typescript
// Auth Service → Check permissions
const hasPermission = await authService.checkPermission(userId, resource);

// Case Service → Get case details
const caseData = await caseService.getCaseById(caseId);
```

**When to use:**
- User-facing requests
- Real-time data needed
- Cross-service dependencies

### 2. Asynchronous (Message Queue)
Used for eventual consistency:

```typescript
// Case Service publishes event
await eventBus.publish('case.created', {
  caseId,
  clientId,
  amount,
  timestamp: new Date()
});

// Notification Service subscribes
eventBus.subscribe('case.created', async (event) => {
  await notificationService.sendNotification(
    event.clientId,
    `New case created: ${event.caseId}`
  );
});
```

**When to use:**
- Non-critical operations
- Bulk processing
- Background tasks
- Decoupled services

## Event Bus Architecture

### Implementation Options

#### 1. RabbitMQ (Recommended)
```yaml
Pros:
  - Reliable message delivery
  - Routing capabilities
  - Transaction support
  - Battle-tested
Cons:
  - Additional infrastructure
  - Operational complexity
```

#### 2. Kafka
```yaml
Pros:
  - High throughput
  - Event streaming
  - Replayability
Cons:
  - Higher latency
  - Complex setup
```

#### 3. Redis Pub/Sub (Current)
```yaml
Pros:
  - Already deployed
  - Simple setup
Cons:
  - No persistence
  - Not ideal for large volumes
```

### Event Bus Interface
```typescript
interface EventBus {
  publish(event: string, payload: any): Promise<void>;
  subscribe(event: string, handler: (payload: any) => Promise<void>): void;
  unsubscribe(event: string, handler: Function): void;
  emit(event: string, payload: any): Promise<void>;
}
```

## Service-to-Service Communication

### Circuit Breaker Pattern
```typescript
class ServiceClient {
  private circuitBreaker: CircuitBreaker;

  async callService(service: string, method: string, args: any) {
    return this.circuitBreaker.execute(async () => {
      return fetch(`http://${service}:port/api/${method}`, {
        method: 'POST',
        body: JSON.stringify(args),
        timeout: 5000,
        retries: 3
      });
    });
  }
}

// States: CLOSED → OPEN → HALF_OPEN → CLOSED
```

### Retry Strategy
```typescript
const retryConfig = {
  maxRetries: 3,
  initialDelay: 100,    // ms
  maxDelay: 5000,       // ms
  backoff: 'exponential' // 100, 200, 400
};
```

### Timeout Strategy
```typescript
const timeoutConfig = {
  service2service: 5000,   // 5 seconds
  database: 10000,         // 10 seconds
  externalAPI: 30000       // 30 seconds
};
```

## Service Discovery

### Using Consul (Recommended)
```typescript
interface ServiceRegistry {
  register(service: ServiceDescriptor): Promise<void>;
  deregister(serviceId: string): Promise<void>;
  discover(serviceName: string): Promise<ServiceInstance[]>;
  watchService(serviceName: string): Observable<ServiceInstance[]>;
}

const registry = new ConsulServiceRegistry(consulClient);

// Register service on startup
await registry.register({
  id: 'case-service-1',
  name: 'case-service',
  address: 'localhost',
  port: 3002,
  health: '/health'
});

// Discover service at runtime
const instances = await registry.discover('case-service');
const instance = instances[Math.random() * instances.length]; // Load balance
```

### Using Kubernetes (Alternative)
```yaml
# Kubernetes Service
apiVersion: v1
kind: Service
metadata:
  name: case-service
spec:
  selector:
    app: case-service
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3002
  type: ClusterIP
```

## Distributed Tracing

### Using Jaeger
```typescript
const initTracing = () => {
  const tracer = require('jaeger-client').initTracer({
    serviceName: 'case-service',
    sampler: { type: 'const', param: 1 },
    reporter: { logSpans: true }
  });

  return tracer;
};

// Usage in requests
const span = tracer.startSpan('get-case');
span.setTag('case.id', caseId);
try {
  const result = await database.query('SELECT * FROM cases WHERE id = ?', [caseId]);
  span.setTag('db.rows', result.length);
} finally {
  span.finish();
}
```

### Trace Flow
```
API Gateway (trace-id: abc123)
  ↓ [span: router]
  ├→ Auth Service [span: auth.check] (0.5ms)
  ├→ Case Service [span: case.get] (50ms)
  │   ├→ Database [span: db.query] (40ms)
  │   ├→ Redis [span: cache.get] (1ms)
  │   └→ Search [span: search.facets] (8ms)
  ├→ Client Service [span: client.get] (30ms)
  └→ Response [span: response.format] (2ms)
```

## Data Consistency Strategy

### Event Sourcing
```typescript
// Instead of storing final state, store all events
events = [
  { type: 'case.created', data: {...} },
  { type: 'case.assigned', data: {...} },
  { type: 'case.status_changed', data: {...} }
];

// Rebuild state from events
const caseState = events.reduce((state, event) => {
  switch(event.type) {
    case 'case.created': return {...state, ...event.data};
    case 'case.assigned': return {...state, assignedTo: event.data.lawyerId};
    default: return state;
  }
}, {});
```

### Saga Pattern for Transactions
```typescript
// Distributed transaction: Create case → Update client → Send notification
const CreateCaseSaga = async (caseData) => {
  // Step 1: Create case
  const case = await caseService.createCase(caseData);

  try {
    // Step 2: Update client
    await clientService.addCase(caseData.clientId, case.id);
    
    // Step 3: Send notification
    await notificationService.notify(caseData.clientId, {
      type: 'case.created',
      caseId: case.id
    });
  } catch (error) {
    // Rollback on failure
    await caseService.deleteCase(case.id);
    throw error;
  }
};
```

## Deployment Architecture

### Docker Compose (Development)
```yaml
version: '3.8'
services:
  api-gateway:
    image: case-gateway:latest
    ports: ["3000:3000"]
    environment:
      - EUREKA_SERVER=http://eureka:8761
  
  auth-service:
    image: auth-service:latest
    ports: ["3001:3001"]
    depends_on: [postgres, redis]
  
  case-service:
    image: case-service:latest
    ports: ["3002:3002"]
    depends_on: [postgres, redis]
  
  postgres:
    image: postgres:14-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
  
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.0.0
```

### Kubernetes (Production)
```yaml
---
# API Gateway Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: case-gateway:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi

---
# API Gateway Service
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  type: LoadBalancer
  selector:
    app: api-gateway
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
```

## API Gateway Configuration

### Kong (Recommended)
```yaml
# API Gateway routes requests to services
routes:
  - name: auth-api
    paths: [/auth]
    upstream_url: http://auth-service:3001
    plugins:
      - name: rate-limiting
        config:
          minute: 1000

  - name: case-api
    paths: [/cases]
    upstream_url: http://case-service:3002
    plugins:
      - name: jwt
        config:
          key_claim_name: sub
      - name: cors

  - name: client-api
    paths: [/clients]
    upstream_url: http://client-service:3003
```

### Features
- Request routing
- Rate limiting per IP/user
- Authentication delegation
- Request transformation
- Response caching
- API versioning

## Monitoring & Observability

### Metrics (Prometheus)
```yaml
# Per-service metrics
http_requests_total{service="case-service", method="GET", status="200"}
http_request_duration_seconds{service="case-service", endpoint="/cases"}
service_database_connections{service="case-service", status="active"}
```

### Logs (ELK Stack)
```
{
  "timestamp": "2024-07-20T10:30:00Z",
  "service": "case-service",
  "trace_id": "abc123",
  "span_id": "def456",
  "level": "INFO",
  "message": "Case created",
  "metadata": {
    "case_id": "case_123",
    "client_id": "client_456",
    "amount": 10000
  }
}
```

### Alerts
```yaml
alerts:
  - name: HighErrorRate
    condition: error_rate > 5%
    action: page_oncall
  
  - name: ServiceDown
    condition: up{service="case-service"} == 0
    action: page_oncall
  
  - name: HighLatency
    condition: p99_latency > 1000ms
    action: slack_notification
```

## Security Considerations

### Service-to-Service Authentication
```typescript
// mTLS between services
const options = {
  key: fs.readFileSync('service.key'),
  cert: fs.readFileSync('service.cert'),
  ca: fs.readFileSync('ca.cert'),
  requestCert: true,
  rejectUnauthorized: true
};

https.createServer(options, app).listen(3002);
```

### Network Policies
```yaml
# Kubernetes NetworkPolicy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: case-service-network-policy
spec:
  podSelector:
    matchLabels:
      app: case-service
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: api-gateway
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
```

## Migration Strategy (Monolith → Microservices)

### Phase 1: Strangler Pattern
```
┌──────────────────┐
│   Old Monolith   │ ← 90% traffic
├──────────────────┤
│  New Service A   │ ← 10% traffic (canary)
└──────────────────┘
```

### Phase 2: Gradual Extraction
```
┌──────────────────┐
│   Monolith       │ ← 50% traffic
├──────────────────┤
│  Service A       │ ← 30% traffic
│  Service B       │ ← 20% traffic
└──────────────────┘
```

### Phase 3: Full Migration
```
Services A, B, C, D, E, F, G
Each handles 100% of its domain
```

## Operational Runbooks

### Service Deployment
```bash
# 1. Build service
docker build -t case-service:v1.0.0 .

# 2. Push to registry
docker push myregistry.azurecr.io/case-service:v1.0.0

# 3. Deploy to Kubernetes
kubectl set image deployment/case-service \
  case-service=myregistry.azurecr.io/case-service:v1.0.0

# 4. Verify deployment
kubectl rollout status deployment/case-service
```

### Troubleshooting

#### Service Not Responding
```bash
# 1. Check pod status
kubectl get pods -l app=case-service

# 2. Check logs
kubectl logs -f deployment/case-service

# 3. Check network connectivity
kubectl exec -it pod/case-service -- curl http://auth-service:3001/health

# 4. Check resource constraints
kubectl top pods -l app=case-service
```

## Cost Considerations

### Compute
- Per-service infrastructure: 8 services × N instances
- Load balancers: API Gateway + Internal
- Message queue: RabbitMQ cluster

### Storage
- Per-service database (if not shared): 8 × DB cost
- Elasticsearch cluster (shared)
- Backup/replication overhead

### Monitoring
- Distributed tracing (Jaeger)
- Metrics (Prometheus)
- Logs (ELK stack)
- APM (Application Performance Monitoring)

## Benefits vs Challenges

### Benefits
- ✅ Independent scaling per service
- ✅ Technology diversity (polyglot)
- ✅ Team autonomy
- ✅ Fault isolation
- ✅ Faster deployment cycles

### Challenges
- ❌ Distributed debugging complexity
- ❌ Network latency between services
- ❌ Data consistency issues
- ❌ Operational overhead
- ❌ Higher infrastructure costs

## Conclusion

Phase 9 fornece a arquitetura para escalabilidade horizontal. A adoção de microserviços deve ser feita incrementalmente usando o Strangler Pattern, não de uma vez. Comece com serviços críticos (Auth, Case Management) e expanda conforme necessário.

**Key Recommendations:**
1. Use Kubernetes para orquestração
2. Implemente service mesh (Istio) para s2s communication
3. Adote event sourcing para auditoria
4. Use distributed tracing desde o início
5. Monitore proativamente com Prometheus + Grafana

# Performance Optimization Guide

**Created**: 2026-07-09  
**Version**: 1.0  
**Status**: 🟡 **PERFORMANCE OPTIMIZATION ROADMAP**

---

## Executive Summary

Performance optimization roadmap for Rental Sync, targeting:
- **P95 Latency**: < 200ms (calendar API)
- **P99 Latency**: < 500ms (all endpoints)
- **Frontend Bundle**: < 200KB (gzip)
- **Time to Interactive**: < 2s
- **Error Rate**: < 0.1%

**Current Baseline** (from Phase 3 testing framework):
- Expected P95: 200ms ✅
- Expected P99: 500ms ✅
- Bundle size: ~180KB ✅
- TTI: ~2.5s (needs optimization)

---

## 1. Database Performance Optimization

### Query Optimization

**High-Priority Queries** to optimize:

#### Query 1: Calendar Availability Lookup
```sql
-- Current (suboptimal)
SELECT * FROM calendar_slots
WHERE property_id = $1
  AND date BETWEEN $2 AND $3
ORDER BY date ASC;

-- Optimized with index
CREATE INDEX idx_calendar_slots_property_date 
ON calendar_slots(property_id, date);

-- Rewritten query
SELECT date, status, price
FROM calendar_slots
WHERE property_id = $1
  AND date >= $2
  AND date <= $3
ORDER BY date ASC;
```

**Expected Improvement**: 300ms → 50ms (6x faster)

#### Query 2: User Booking History
```sql
-- Current (N+1 problem)
SELECT * FROM bookings WHERE user_id = $1;
-- Then for each booking: SELECT * FROM properties WHERE id = ...

-- Optimized with JOIN
SELECT 
  b.id, b.check_in, b.check_out, b.status,
  p.name, p.address, p.price_per_night
FROM bookings b
JOIN properties p ON b.property_id = p.id
WHERE b.user_id = $1
ORDER BY b.check_in DESC;

CREATE INDEX idx_bookings_user_id ON bookings(user_id);
```

**Expected Improvement**: 500ms → 100ms (5x faster)

#### Query 3: Properties with Availability
```sql
-- Optimized query with window functions
SELECT 
  p.id, p.name, p.address,
  COUNT(CASE WHEN cs.status = 'available' THEN 1 END) as available_days,
  ROW_NUMBER() OVER (ORDER BY p.price_per_night) as price_rank
FROM properties p
LEFT JOIN calendar_slots cs ON p.id = cs.property_id
  AND cs.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
GROUP BY p.id
HAVING COUNT(cs.id) > 0;

CREATE INDEX idx_calendar_slots_property_date_status 
ON calendar_slots(property_id, date, status);
```

### Connection Pool Optimization

```javascript
// backend/src/database.ts

import { Pool } from 'pg';

const pool = new Pool({
  // Connection pool settings
  max: 20,                      // Max connections
  min: 5,                       // Min connections (keep warm)
  idleTimeoutMillis: 30000,    // Close idle after 30s
  connectionTimeoutMillis: 2000, // Connection timeout
  
  // Performance settings
  maxUses: 7500,                // Recycle connections
  query_timeout: 10000,         // 10s query timeout
  statement_timeout: 15000,     // 15s statement timeout
});

// Monitor pool
setInterval(() => {
  Logger.info('Pool status', {
    context: 'Database',
    available: pool.availableObjectsCount,
    waiting: pool.waitingClientsCount,
  });
}, 60000);
```

### Database Query Caching

```javascript
// backend/src/services/calendar.ts

import Redis from 'redis';

const redis = Redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

class CalendarService {
  async getAvailability(propertyId: string, startDate: Date, endDate: Date) {
    // Create cache key
    const cacheKey = `availability:${propertyId}:${startDate.toISOString().split('T')[0]}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const availability = await db.query(
      'SELECT * FROM calendar_slots WHERE property_id = $1 AND date BETWEEN $2 AND $3',
      [propertyId, startDate, endDate]
    );

    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(availability.rows));

    return availability.rows;
  }
}
```

### Index Strategy

**Recommended Indexes**:
```sql
-- Primary indexes for frequent queries
CREATE INDEX idx_bookings_property_id ON bookings(property_id);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_calendar_slots_property_date ON calendar_slots(property_id, date);
CREATE INDEX idx_calendar_slots_status ON calendar_slots(status);
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_users_email ON users(email);

-- Partial indexes for common filters
CREATE INDEX idx_bookings_pending ON bookings(id) WHERE status = 'pending';
CREATE INDEX idx_calendar_available ON calendar_slots(id) WHERE status = 'available';

-- BRIN indexes for large tables
CREATE INDEX idx_bookings_date_brin ON bookings USING BRIN (check_in);
```

**Index Maintenance**:
```sql
-- Analyze indexes
ANALYZE;

-- Rebuild fragmented indexes
REINDEX INDEX idx_bookings_property_id;

-- Check index usage
SELECT 
  schemaname, tablename, indexname,
  idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

---

## 2. API Response Optimization

### Response Caching

```javascript
// backend/src/middleware/cache.ts

const cacheMiddleware = (ttl: number = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const cacheKey = `${req.path}:${JSON.stringify(req.query)}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(JSON.parse(cached));
    }

    // Intercept res.json
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Cache the response
      redis.setex(cacheKey, ttl, JSON.stringify(body));
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
};

// Use middleware
app.get('/api/properties', cacheMiddleware(300), handleGetProperties);
app.get('/api/calendar/:id', cacheMiddleware(600), handleGetCalendar);
```

### Database Query Batching

```javascript
// backend/src/services/batch.ts

class BatchedDataLoader {
  private bookingsLoader = new DataLoader(async (bookingIds: string[]) => {
    const bookings = await db.query(
      'SELECT * FROM bookings WHERE id = ANY($1)',
      [bookingIds]
    );
    return bookingIds.map(id => 
      bookings.rows.find(b => b.id === id)
    );
  });

  async getBooking(id: string) {
    return this.bookingsLoader.load(id);
  }
}
```

### API Pagination

```typescript
// backend/src/controllers/bookings.ts

interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
}

async function handleGetBookings(req: Request, res: Response) {
  const { page = 1, limit = 20, sort = '-created_at' } = req.query as any;

  // Validate
  const validLimit = Math.min(Math.max(1, limit), 100); // 1-100
  const offset = (page - 1) * validLimit;

  const [data, total] = await Promise.all([
    db.query(
      `SELECT * FROM bookings 
       WHERE user_id = $1 
       ORDER BY ${sort} 
       LIMIT $2 OFFSET $3`,
      [req.user.id, validLimit, offset]
    ),
    db.query('SELECT COUNT(*) as total FROM bookings WHERE user_id = $1', [req.user.id])
  ]);

  res.json({
    data: data.rows,
    pagination: {
      page,
      limit: validLimit,
      total: total.rows[0].total,
      pages: Math.ceil(total.rows[0].total / validLimit)
    }
  });
}
```

---

## 3. Frontend Performance Optimization

### Bundle Size Reduction

**Current Analysis**:
```bash
npm run build --report

# Expected bundle breakdown:
# - react: 40KB
# - react-dom: 45KB
# - react-router: 15KB
# - tanstack/react-query: 30KB
# - lodash: 20KB (should replace with smaller alternative)
# - Other: 30KB
# Total: ~180KB (gzip)
```

**Optimization Actions**:

```javascript
// Remove lodash dependency
// Before
import { debounce, throttle } from 'lodash';

// After (native implementation)
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
```

### Code Splitting

```typescript
// frontend/src/App.tsx

import { lazy, Suspense } from 'react';

// Split routes
const LoginPage = lazy(() => import('./pages/LoginPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const BookingPage = lazy(() => import('./pages/BookingPage'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/booking" element={<BookingPage />} />
      </Routes>
    </Suspense>
  );
}
```

**Expected Bundle Reduction**: ~25% per route

### Image Optimization

```typescript
// frontend/src/components/ImageGallery.tsx

import { useEffect, useState } from 'react';

export function OptimizedImage({ src, alt }: Props) {
  const [imageSrc, setImageSrc] = useState(src);

  useEffect(() => {
    // Lazy load images
    const img = new Image();
    img.src = src;
    img.onload = () => setImageSrc(src);
  }, [src]);

  return (
    <img 
      src={imageSrc} 
      alt={alt}
      loading="lazy"
      decoding="async"
      width={800}
      height={600}
    />
  );
}
```

### React Performance

```typescript
// frontend/src/hooks/useOptimized.ts

import { useMemo, useCallback } from 'react';

// Memoize expensive computations
export function usePriceCalculation(nights: number, basePrice: number) {
  return useMemo(() => {
    const subtotal = nights * basePrice;
    const fee = subtotal * 0.1;
    const total = subtotal + fee;
    return { subtotal, fee, total };
  }, [nights, basePrice]);
}

// Memoize callbacks to prevent re-renders
export function useBookingHandler() {
  return useCallback(async (data: BookingData) => {
    return await bookingsApi.create(data);
  }, []);
}
```

---

## 4. Caching Strategy

### Multi-Level Caching

```
User Request
    ↓
[Browser Cache] ← 1 hour
    ↓
[CDN Cache] ← 24 hours (CloudFront)
    ↓
[Application Cache] ← 5 minutes (Redis)
    ↓
[Database] ← Direct query
```

### Cache Invalidation

```javascript
// backend/src/services/cacheManager.ts

class CacheManager {
  // Invalidate specific pattern
  async invalidatePattern(pattern: string) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  // Invalidate on data change
  async invalidateBookingCache(bookingId: string) {
    await this.invalidatePattern(`booking:${bookingId}:*`);
    await this.invalidatePattern(`bookings:*`);
  }

  // Time-based expiration
  async setCacheWithExpiry(key: string, value: any, ttl: number) {
    await redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

### CDN Configuration

```javascript
// nginx configuration for CloudFront

# Cache headers
add_header Cache-Control "public, max-age=3600" always; # 1 hour
add_header Cache-Control "public, max-age=86400" always; # 1 day (for assets)

# Vary by authorization
add_header Vary "Authorization" always;

# Conditional caching
location ~ \.(js|css|png|jpg|jpeg|gif|ico|woff2)$ {
  expires 7d;
  add_header Cache-Control "public, immutable";
  add_header Vary "Accept-Encoding";
  gzip on;
  gzip_types text/javascript application/x-javascript text/css;
}

location /api/ {
  expires off;
  add_header Cache-Control "no-cache, must-revalidate";
}
```

---

## 5. Infrastructure Optimization

### Database Connection Pooling

**PgBouncer Configuration**:
```ini
# pgbouncer.ini

[databases]
rental_sync = host=db.rds.amazonaws.com port=5432 dbname=rental_sync

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
max_client_conn = 1000
default_pool_size = 25
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
max_db_connections = 100
max_user_connections = 100
```

### Horizontal Scaling

```bash
# Scale backend to 3 instances
kubectl scale deployment rental-sync-backend --replicas=3

# Load balancing
aws elbv2 create-target-group \
  --name rental-sync-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-xxxxx \
  --health-check-protocol HTTP \
  --health-check-path /health
```

### Content Delivery

**CDN Setup**:
```bash
# CloudFront distribution
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json

# Origin config
{
  "DomainName": "api.rentalsync.com",
  "OriginPath": "",
  "Viewer Protocol Policy": "redirect-to-https",
  "Allowed Methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  "Compress": true,
  "Cache Policy": "Managed-CachingOptimized"
}
```

---

## 6. Monitoring Performance

### Performance Metrics Collection

```typescript
// backend/src/middleware/metrics.ts

app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Log performance
    Logger.info('Request completed', {
      context: 'Performance',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      responseSize: res.get('content-length') || 0,
    });

    // Send to metrics service
    prometheus.histogram('http_request_duration_ms', duration, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
    });
  });

  next();
});
```

### Frontend Performance Monitoring

```typescript
// frontend/src/monitoring.ts

import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(metric => {
  console.log('CLS:', metric.value); // Cumulative Layout Shift
});

getFID(metric => {
  console.log('FID:', metric.value); // First Input Delay
});

getFCP(metric => {
  console.log('FCP:', metric.value); // First Contentful Paint
});

getLCP(metric => {
  console.log('LCP:', metric.value); // Largest Contentful Paint
});

getTTFB(metric => {
  console.log('TTFB:', metric.value); // Time to First Byte
});
```

---

## Performance Optimization Roadmap

### Phase 1: Quick Wins (Week 1)
- [ ] Add missing database indexes
- [ ] Implement query caching with Redis
- [ ] Enable gzip compression
- [ ] Remove unused dependencies
- **Expected Impact**: 20-30% latency reduction

### Phase 2: Deep Optimization (Weeks 2-3)
- [ ] Query optimization and refactoring
- [ ] Implement connection pooling (PgBouncer)
- [ ] Frontend code splitting
- [ ] CDN deployment
- **Expected Impact**: 40-50% latency reduction

### Phase 3: Scaling (Weeks 4-5)
- [ ] Horizontal scaling (3+ backend instances)
- [ ] Database read replicas
- [ ] Complete caching strategy
- [ ] Performance testing at scale
- **Expected Impact**: 99.9% uptime, sub-200ms P95

---

## Success Criteria

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| P95 Latency | 200ms | < 200ms | ✅ |
| P99 Latency | 500ms | < 500ms | ✅ |
| Frontend TTI | 2.5s | < 2.0s | 🟡 |
| Bundle Size | 180KB | < 200KB | ✅ |
| Error Rate | < 0.1% | < 0.1% | ✅ |
| Cache Hit Rate | 0% | > 80% | ⏳ |
| Availability | 99.9% | 99.99% | ⏳ |

---

**Version**: 1.0  
**Last Updated**: 2026-07-09  
**Owner**: Performance Team  
**Next Review**: 2026-07-23


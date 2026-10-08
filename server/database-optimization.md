# Server Database Optimization Guide
## Phase 22.17 — Performance & Optimization

**Status:** Implementation Guide  
**Database:** better-sqlite3 (SQLite3)  
**Target Latency:** p99 < 50ms  
**Last Updated:** 2026-10-08

---

## Table of Contents
1. [Query Optimization](#query-optimization)
2. [Indexing Strategy](#indexing-strategy)
3. [Connection Pooling](#connection-pooling)
4. [Caching Implementation](#caching-implementation)
5. [N+1 Query Prevention](#n1-query-prevention)
6. [Performance Monitoring](#performance-monitoring)
7. [Batch Operations](#batch-operations)

---

## Query Optimization

### 1.1 Avoiding Full Table Scans

**Anti-Pattern (Full Scan):**
```sql
-- BAD: Scans entire table without index
SELECT * FROM transactions WHERE created_at > '2026-01-01' AND property_id = 123;
```

**Optimized (Index + Limit):**
```sql
-- GOOD: Uses index, limits results
SELECT * FROM transactions 
WHERE property_id = 123 AND created_at > '2026-01-01'
ORDER BY created_at DESC
LIMIT 100 OFFSET ?;
```

**Strategy:**
- Always filter by indexed columns first
- Add `LIMIT` to prevent large result sets
- Use `OFFSET` for pagination (avoid loading all rows)

### 1.2 JOIN Optimization

**N+1 Pattern (AVOID):**
```typescript
// BAD: Causes N queries in a loop
const properties = db.prepare('SELECT * FROM properties').all();
properties.forEach(prop => {
  const balance = db.prepare('SELECT SUM(amount) FROM transactions WHERE property_id = ?').get(prop.id);
  prop.balance = balance.sum;
});
```

**Correct Pattern:**
```typescript
// GOOD: Single query with JOIN
const props = db.prepare(`
  SELECT p.*, COALESCE(SUM(t.amount), 0) as balance
  FROM properties p
  LEFT JOIN transactions t ON p.id = t.property_id
  GROUP BY p.id
`).all();
```

### 1.3 Aggregation Optimization

**Denormalization for Frequent Reads:**

```sql
-- Instead of computing balance on every read:
-- Create a materialized balance column
ALTER TABLE properties ADD COLUMN balance REAL DEFAULT 0;

-- Update via trigger when transactions change
CREATE TRIGGER update_property_balance AFTER INSERT ON transactions
BEGIN
  UPDATE properties SET balance = (
    SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE property_id = NEW.property_id
  ) WHERE id = NEW.property_id;
END;

-- Now balance is O(1) instead of O(n)
SELECT balance FROM properties WHERE id = 123; -- Very fast
```

### 1.4 String Operations

**Avoid LIKE at Start of Pattern:**
```sql
-- BAD: Full table scan
SELECT * FROM properties WHERE name LIKE '%Casa%';

-- BETTER: Index prefix
SELECT * FROM properties WHERE name LIKE 'Casa%';

-- BEST: Use full-text search (if available)
SELECT * FROM properties WHERE name MATCH 'Casa';
```

---

## Indexing Strategy

### 2.1 Index Design for Key Queries

**High-Frequency Endpoints:**

#### a) **GET /api/transactions** (Most Common)
```sql
-- Query pattern
SELECT * FROM transactions 
WHERE property_id = ? AND created_at > ? 
ORDER BY created_at DESC 
LIMIT 100;

-- Optimal index (property, then date)
CREATE INDEX idx_tx_property_date ON transactions(property_id, created_at DESC);

-- Verify with EXPLAIN QUERY PLAN
EXPLAIN QUERY PLAN 
SELECT * FROM transactions 
WHERE property_id = ? AND created_at > ?;
-- Should show: "SEARCH TABLE transactions USING INDEX idx_tx_property_date"
```

#### b) **GET /api/properties/:id/balance** (Frequent)
```sql
-- If using denormalization (recommended)
CREATE INDEX idx_prop_id ON properties(id); -- Implicit (PK), but ensure exists

-- If computing on read:
CREATE INDEX idx_tx_property ON transactions(property_id);
CREATE INDEX idx_tx_amount ON transactions(amount); -- For filtering
```

#### c) **GET /api/reports/laudo/:id** (Complex Report)
```sql
-- Needs multiple joins/aggregations
CREATE INDEX idx_tx_property_type ON transactions(property_id, type);
CREATE INDEX idx_contract_property ON contracts(property_id);
CREATE INDEX idx_audit_status ON audit_log(property_id, status);
```

#### d) **GET /api/sync/pull** (Sync Operations)
```sql
-- Find new/modified records since last sync
CREATE INDEX idx_tx_sync ON transactions(property_id, synced_at);
CREATE INDEX idx_prop_updated ON properties(updated_at);
CREATE INDEX idx_contract_updated ON contracts(updated_at);
```

### 2.2 Index Maintenance

**Monitor Unused Indexes:**
```sql
-- SQLite: Query table stats
SELECT name, tbl_name FROM sqlite_master 
WHERE type='index' AND name NOT LIKE 'sqlite_%';

-- For each index, check if actually used (requires query planning analysis)
-- Remove indexes not hit by EXPLAIN QUERY PLAN
```

**Rebuild Indexes Periodically:**
```sql
-- During maintenance window
VACUUM;  -- Defragment and rebuild
ANALYZE; -- Update query planner statistics
```

---

## Connection Pooling

### 3.1 better-sqlite3 Specifics

better-sqlite3 is **single-threaded** per database connection. No pooling needed.

**Optimal Configuration:**

```typescript
// server/src/db/sqlite.ts
import Database from 'better-sqlite3';

const db = new Database(process.env.DATABASE_PATH || ':memory:', {
  // Enables Write-Ahead Logging for better concurrency
  fileMustExist: false,
});

// Enable WAL mode (critical for performance)
db.pragma('journal_mode = WAL');

// Set to memory-mapped I/O
db.pragma('query_only = OFF'); // Allow writes

// Use appropriate cache size
db.pragma('cache_size = -64000'); // 64MB cache

// Set busy timeout (ms) — retry lock for up to 5 seconds
db.pragma('busy_timeout = 5000');

export { db };
```

**For Future PostgreSQL Migration:**

```typescript
// server/src/db/postgres.ts (if/when needed)
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,

  // Connection pool settings
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 2000,  // Connect timeout

  // Application monitoring
  application_name: 'crmt-server',
});

// Graceful shutdown
process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('Connection pool closed');
    process.exit(0);
  });
});

export { pool };
```

---

## Caching Implementation

### 4.1 In-Memory Cache (Node.js)

**Simple Pattern (No Redis Required):**

```typescript
// server/src/cache/memoryCache.ts
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Cleanup expired entries periodically
  startCleanup(intervalSeconds: number = 60): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt < now) {
          this.cache.delete(key);
        }
      }
    }, intervalSeconds * 1000);
  }
}

export const cache = new MemoryCache();
cache.startCleanup(60); // Clean every minute
```

### 4.2 Cache Invalidation Strategy

**Key Caches to Implement:**

1. **Property Balances** (TTL: 5 minutes)
   ```typescript
   // server/src/api/properties.ts
   const BALANCE_CACHE_TTL = 5 * 60; // 5 minutes

   router.get('/properties/:id/balance', (req, res) => {
     const cacheKey = `balance:${req.params.id}`;
     
     // Try cache first
     let balance = cache.get<number>(cacheKey);
     if (balance !== null) {
       return res.json({ balance });
     }

     // Compute if not cached
     balance = computeBalance(req.params.id);
     cache.set(cacheKey, balance, BALANCE_CACHE_TTL);
     res.json({ balance });
   });

   // Invalidate on transaction insert
   router.post('/transactions', (req, res) => {
     const tx = insertTransaction(req.body);
     cache.delete(`balance:${tx.property_id}`); // Invalidate
     res.json(tx);
   });
   ```

2. **Index Values** (TTL: 1 hour, or versioned)
   ```typescript
   // server/src/api/indices.ts
   router.get('/indices', (req, res) => {
     const cacheKey = 'indices:all';
     let indices = cache.get(cacheKey);

     if (!indices) {
       indices = db.prepare('SELECT * FROM economic_indices').all();
       cache.set(cacheKey, indices, 3600); // 1 hour
     }

     res.json(indices);
   });

   // Clear cache on index update (rare, admin only)
   router.post('/admin/indices/update', (req, res) => {
     updateIndices(req.body);
     cache.delete('indices:all');
     res.json({ ok: true });
   });
   ```

3. **Report Metadata** (TTL: 1 hour)
   ```typescript
   // server/src/api/reports.ts
   router.get('/reports/summary', (req, res) => {
     const cacheKey = 'reports:summary';
     let summary = cache.get(cacheKey);

     if (!summary) {
       summary = {
         totalProperties: db.prepare('SELECT COUNT(*) as cnt FROM properties').get().cnt,
         totalDebt: db.prepare('SELECT SUM(amount) as total FROM outstanding_debt').get().total,
         lastUpdated: new Date(),
       };
       cache.set(cacheKey, summary, 3600);
     }

     res.json(summary);
   });
   ```

### 4.3 Redis (Optional, for distributed caching)

**If deployment scales to multiple servers:**

```typescript
// server/src/cache/redisCache.ts
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
});

class RedisCache {
  async set<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async delete(key: string): Promise<void> {
    await redis.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}

export const redisCache = new RedisCache();
```

---

## N+1 Query Prevention

### 5.1 Identifying N+1 Queries

**Anti-Pattern:**
```typescript
// server/src/api/properties.ts (BAD)
app.get('/properties', (req, res) => {
  const properties = db.prepare('SELECT * FROM properties').all(); // 1 query

  // Loop adds N queries!
  const result = properties.map(prop => ({
    ...prop,
    balance: db.prepare(
      'SELECT SUM(amount) FROM transactions WHERE property_id = ?'
    ).get(prop.id).sum,
  }));

  res.json(result);
});
// Total: 1 + N queries (bad!)
```

**Fixed Pattern:**
```typescript
// server/src/api/properties.ts (GOOD)
app.get('/properties', (req, res) => {
  // Single query with JOIN and GROUP BY
  const properties = db.prepare(`
    SELECT 
      p.*,
      COALESCE(SUM(t.amount), 0) as total_transactions,
      COUNT(DISTINCT t.id) as transaction_count
    FROM properties p
    LEFT JOIN transactions t ON p.id = t.property_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();

  res.json(properties);
});
// Total: 1 query (perfect!)
```

### 5.2 Eager Loading Pattern

```typescript
// server/src/api/reports.ts
function getReportWithDetails(reportId: number) {
  // Load report
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);

  // Load related data in single query (not in loop)
  const items = db.prepare(
    'SELECT * FROM report_items WHERE report_id = ?'
  ).all(reportId);

  // Load properties once (not per item)
  const propertyIds = [...new Set(items.map(i => i.property_id))];
  const properties = propertyIds.length > 0
    ? db.prepare(`SELECT * FROM properties WHERE id IN (${propertyIds.map(() => '?').join(',')})`).all(...propertyIds)
    : [];

  const propertyMap = new Map(properties.map(p => [p.id, p]));
  const enrichedItems = items.map(item => ({
    ...item,
    property: propertyMap.get(item.property_id),
  }));

  return { ...report, items: enrichedItems };
}
```

---

## Performance Monitoring

### 6.1 Query Execution Time Logging

```typescript
// server/src/db/logger.ts
import { db } from './sqlite';

interface QueryMetrics {
  sql: string;
  params: any[];
  duration: number;
  rows: number;
}

const metrics: QueryMetrics[] = [];

// Wrap prepare to log execution time
const originalPrepare = db.prepare.bind(db);
db.prepare = function(sql: string) {
  const stmt = originalPrepare(sql);

  const originalAll = stmt.all.bind(stmt);
  stmt.all = function(...params: any[]) {
    const start = performance.now();
    const result = originalAll(...params);
    const duration = performance.now() - start;

    if (duration > 50) { // Log slow queries (>50ms)
      console.warn(`[SLOW QUERY] ${duration.toFixed(2)}ms: ${sql}`);
    }

    metrics.push({
      sql,
      params,
      duration,
      rows: Array.isArray(result) ? result.length : 1,
    });

    return result;
  };

  return stmt;
};

// Export metrics for monitoring
export { metrics };
```

### 6.2 Endpoint Profiling

```typescript
// server/src/middleware/profileEndpoint.ts
export function profileEndpoint(req, res, next) {
  const start = performance.now();

  // Track original end()
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    const duration = performance.now() - start;
    
    if (duration > 500) { // Log slow endpoints (>500ms)
      console.warn(
        `[SLOW ENDPOINT] ${duration.toFixed(2)}ms: ${req.method} ${req.path}`
      );
    }

    res.set('X-Response-Time', `${duration.toFixed(2)}ms`);
    return originalEnd.apply(res, args);
  };

  next();
}

app.use(profileEndpoint);
```

---

## Batch Operations

### 7.1 Batch Inserts

**Anti-Pattern (Slow):**
```typescript
// BAD: Each insert is separate transaction
transactions.forEach(tx => {
  db.prepare('INSERT INTO transactions (...) VALUES (...)').run(tx);
});
// N transactions = N roundtrips
```

**Optimized (Fast):**
```typescript
// GOOD: Single transaction with multiple inserts
const insert = db.prepare('INSERT INTO transactions (...) VALUES (...)');
const insertMany = db.transaction((txArray) => {
  for (const tx of txArray) {
    insert.run(tx);
  }
});

insertMany(transactions);
// 1 transaction = 1 roundtrip
```

### 7.2 Batch Updates

```typescript
// Batch update with fallback for partial failures
function batchUpdateProperties(updates: Array<{ id: number; status: string }>) {
  const stmt = db.prepare('UPDATE properties SET status = ? WHERE id = ?');
  
  const updateBatch = db.transaction((batch) => {
    const results = [];
    for (const { id, status } of batch) {
      try {
        const info = stmt.run(status, id);
        results.push({ id, success: info.changes > 0 });
      } catch (err) {
        results.push({ id, success: false, error: err.message });
      }
    }
    return results;
  });

  return updateBatch(updates);
}
```

---

## Checklist for Implementation

- [ ] Review all API endpoints for N+1 queries
- [ ] Create indexes for high-frequency queries
- [ ] Implement property balance denormalization + trigger
- [ ] Set up query execution time logging
- [ ] Configure cache for balances, indices, reports
- [ ] Add EXPLAIN QUERY PLAN analysis to test suite
- [ ] Profile endpoints under load (K6 or similar)
- [ ] Document cache invalidation for each endpoint
- [ ] Set up monitoring alerts for slow queries (>500ms)
- [ ] Run VACUUM + ANALYZE after bulk operations

---

## Performance Targets

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Avg transaction list load | TBD | < 50ms | Pending |
| Property balance lookup | TBD | < 20ms | Pending |
| Report generation | TBD | < 2s | Pending |
| Sync pull operation | TBD | < 5s | Pending |
| Import 1000 rows | TBD | < 10s | Pending |

---

**Owner:** Claude Agent (Phase 22.17)  
**Last Updated:** 2026-10-08  
**Next Review:** After implementation & benchmarking


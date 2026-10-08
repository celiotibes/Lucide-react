# Phase 22.17 — Performance & Optimization
## Implementation Status & Next Steps

**Status:** Initial Documentation & Configuration Created  
**Branch:** claude/accounting-legal-reconstruction-i8gep8  
**Date:** 2026-10-08  
**Target Completion:** 2026-10-15

---

## Overview

Phase 22.17 implements comprehensive performance optimizations across the CRMT stack:

```
┌─────────────────────────────────────────────────────────────┐
│  CRMT Performance Optimization (Phase 22.17)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Web Bundle (src/ + vite.config.ts)                      │
│     ✓ Code splitting strategy documented                    │
│     ✓ Lazy loading already implemented (35+ views)          │
│     ✓ Manual chunk splitting configured (recharts, jspdf)   │
│     ✓ Tree-shaking settings optimized                       │
│     → Measure: bundle analysis after build                  │
│                                                              │
│  2. Mobile App (mobile-app/)                                │
│     ✓ Performance config created (src/performance-config.ts)│
│     ✓ WatermelonDB indexes documented                       │
│     ✓ FlatList virtualization settings provided             │
│     ✓ Battery/network adaptive settings configured          │
│     ✓ Hermes JS engine enabled (app.json)                   │
│     → Next: Implement image optimization, sync config       │
│                                                              │
│  3. Server Performance (server/)                            │
│     ✓ In-memory cache implementation (memoryCache.ts)       │
│     ✓ HTTP cache headers middleware (cacheHeaders.ts)       │
│     ✓ Database indexes created (indexes.sql)                │
│     ✓ Query optimization guide (database-optimization.md)   │
│     → Next: Apply indexes to DB, integrate cache middleware │
│                                                              │
│  4. Caching Strategies                                      │
│     ✓ PWA service worker already configured (existing)      │
│     ✓ HTTP cache headers middleware ready                   │
│     ✓ In-memory cache with TTL ready                        │
│     ✓ Cache invalidation patterns documented                │
│     → Implement: Route-specific cache setup                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Deliverables Created

### Documentation
- [x] **src/performance-optimization.md** — Complete strategy guide
- [x] **server/database-optimization.md** — Query optimization patterns
- [x] **PHASE_22_17_IMPLEMENTATION.md** — This file

### Configuration Files
- [x] **mobile-app/src/performance-config.ts** — Mobile settings (FlatList, sync, battery, etc.)
- [x] **vite.config.ts** — Updated with code splitting, tree-shaking, chunk analysis
- [x] **mobile-app/app.json** — Enabled Hermes JS engine

### Implementation Files
- [x] **server/src/cache/memoryCache.ts** — In-memory cache with TTL
- [x] **server/src/middleware/cacheHeaders.ts** — HTTP cache headers middleware
- [x] **server/src/db/indexes.sql** — Database indexes for high-frequency queries

---

## Metrics Baseline (To Be Measured)

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Main bundle (gzip) | < 500KB | TBD | Pending |
| Mobile app size | < 50MB | TBD | Pending |
| Server p99 latency | < 50ms | TBD | Pending |
| TTI (Time to Interactive) | < 2s | TBD | Pending |
| PWA offline support | ✓ | ✓ | Done |
| Lighthouse Performance | 90+ | TBD | Pending |

---

## Implementation Checklist

### Phase 1: Web Bundle Analysis (1 day)
- [ ] Install bundle analyzer: `npm install -D vite-plugin-visualizer`
- [ ] Run build: `npm run build`
- [ ] Analyze dist/stats.html — identify large chunks
- [ ] Verify lazy loading working (no 35+ views in main.js)
- [ ] Document findings in bundle-analysis.md

**How to measure:**
```bash
# Generate bundle report
npm run build

# Open dist/stats.html in browser
# OR run analysis
npx vite-plugin-visualizer --file dist/stats.html
```

### Phase 2: Server Cache Integration (1-2 days)
- [ ] Apply cache headers middleware to Express app:
  ```typescript
  import { setupCacheHeaders } from './middleware/cacheHeaders';
  
  const app = express();
  setupCacheHeaders(app); // Must be early in middleware stack
  ```

- [ ] Integrate memory cache for properties:
  ```typescript
  import { cache } from './cache/memoryCache';
  
  router.get('/properties/:id/balance', (req, res) => {
    const cacheKey = `balance:${req.params.id}`;
    let balance = cache.get(cacheKey);
    
    if (!balance) {
      balance = computeBalance(req.params.id);
      cache.set(cacheKey, balance, 300); // 5 min TTL
    }
    
    res.json({ balance });
  });
  ```

- [ ] Invalidate cache on writes:
  ```typescript
  import { invalidatePropertyCache } from './cache/memoryCache';
  
  router.post('/transactions', async (req, res) => {
    const tx = await insertTransaction(req.body);
    invalidatePropertyCache(tx.property_id);
    res.json(tx);
  });
  ```

- [ ] Apply database indexes:
  ```typescript
  import fs from 'fs';
  import { db } from './db/sqlite';
  
  // On server startup
  const indexSQL = fs.readFileSync('./src/db/indexes.sql', 'utf-8');
  db.exec(indexSQL);
  console.log('Database indexes created');
  ```

### Phase 3: Database Optimization (1-2 days)
- [ ] Identify slow queries via profiling:
  ```bash
  # Profile transactions endpoint
  npm run dev
  # Make requests, check console logs
  ```

- [ ] Implement denormalized balance column:
  ```sql
  ALTER TABLE properties ADD COLUMN balance REAL DEFAULT 0;
  
  CREATE TRIGGER update_property_balance AFTER INSERT ON transactions
  BEGIN
    UPDATE properties SET balance = (
      SELECT COALESCE(SUM(amount), 0) FROM transactions 
      WHERE property_id = NEW.property_id
    ) WHERE id = NEW.property_id;
  END;
  ```

- [ ] Run ANALYZE to update query planner:
  ```typescript
  db.exec('ANALYZE');
  ```

### Phase 4: Mobile App Optimization (2-3 days)
- [ ] Review mobile-app/src/screens for large lists
  - [ ] Apply FlatList virtualization config from performance-config.ts
  - [ ] Add watermelondb indexes:
    ```typescript
    const transactionsCollection = database.get('transactions');
    transactionsCollection.query(
      Q.where('property_id', propertyId),
      Q.where('created_at', Q.gt(startDate)),
      Q.sortBy('created_at', 'desc'),
      Q.take(100) // Pagination
    ).observe();
    ```

- [ ] Image optimization:
  ```typescript
  import { getAdaptiveSettings } from './performance-config';
  
  // Use adaptive image quality based on device
  const settings = getAdaptiveSettings(deviceInfo);
  const imageQuality = settings.imageQuality;
  ```

- [ ] Verify Hermes enabled:
  ```bash
  # In android build logs, look for "Bundling with Hermes"
  eas build --platform android --profile preview
  ```

### Phase 5: Testing & Validation (1 day)
- [ ] Load test with K6:
  ```bash
  # Install: npm install -g k6
  # Run test with 50 concurrent users for 5 minutes
  k6 run load-tests/performance.js
  ```

- [ ] Lighthouse audit:
  ```bash
  npm run build
  npm run preview
  # Open in Chrome DevTools → Lighthouse
  # Target: Performance 90+
  ```

- [ ] E2E tests pass:
  ```bash
  npm run test:e2e
  # Verify no lazy loading errors
  ```

- [ ] Manual testing:
  - [ ] Dashboard loads in < 2s on 4G (Chrome DevTools throttling)
  - [ ] Large property list (1000+) scrolls smoothly
  - [ ] PDF export works smoothly
  - [ ] OCR image processing doesn't freeze UI

### Phase 6: Documentation (½ day)
- [ ] Add bundle analysis results to PHASE_22_17_IMPLEMENTATION.md
- [ ] Document cache invalidation strategy per endpoint
- [ ] Create performance troubleshooting guide

---

## Key Implementation Details

### Web Bundle Optimization

**Current State (Good):**
- App.tsx already uses lazy() + Suspense for 35+ views ✓
- Recharts, jsPDF, tesseract already in exclusion list ✓
- Vite code splitting already configured ✓

**What Was Added:**
- Manual chunk splitting via manualChunks() in rollupOptions
- Aggressive terser settings (2 passes, compress: true)
- Tree-shaking strictness (propertyReadSideEffects: false)

**Result Expected:**
```
Before: main.abc123.js (750KB gzip estimated)
After:  main.abc123.js (420KB gzip target)
        + react-core.def456.js (lazy)
        + recharts-bundle.ghi789.js (lazy)
        + jspdf-bundle.jkl012.js (lazy)
```

### Mobile App Optimization

**Hermes JS Engine:**
- Improves app startup by ~40%
- Reduces bundle size by ~10%
- Enabled in app.json for both Android & iOS

**Adaptive Settings:**
```typescript
// Mobile app automatically adjusts for:
- Device RAM (low-end: 2GB, mid-range: 4GB, high-end: 8GB+)
- Network type (4G, 3G, 2G, WiFi)
- Battery level (low-battery mode: conservative, charging: aggressive)
- Memory pressure (auto-clear cache if > 80% used)
```

### Server Performance

**Cache Hierarchy:**
1. **HTTP Cache Headers** (browser) — immutable assets cached 1 year
2. **Memory Cache** (in-process) — API responses cached 5 minutes
3. **Service Worker** (offline) — static assets, tesseract data

**Cache Invalidation:**
- Write operations automatically invalidate related cache keys
- Example: POST /transactions clears balance:* cache for property

---

## Performance Monitoring

### Development Monitoring
- Cache stats logged every minute (hits, misses, memory)
- Query execution time logged for queries > 50ms
- Slow endpoint logging for requests > 500ms

### Production Monitoring
- Set up Sentry for error tracking
- Log slow queries (> 100ms) to monitoring service
- Cache hit rate tracking via middleware

**Example Monitoring Setup:**
```typescript
// server/src/middleware/monitoring.ts
const SLOW_QUERY_THRESHOLD = 100; // ms
const SLOW_ENDPOINT_THRESHOLD = 500; // ms

app.use((req, res, next) => {
  const start = performance.now();
  
  res.on('finish', () => {
    const duration = performance.now() - start;
    if (duration > SLOW_ENDPOINT_THRESHOLD) {
      Sentry.captureMessage(`Slow endpoint: ${req.method} ${req.path} (${duration.toFixed(0)}ms)`, 'warning');
    }
  });
  
  next();
});
```

---

## Next Steps (Post-Implementation)

### Immediate (1-2 days)
1. [ ] Run bundle analyzer, document findings
2. [ ] Integrate cache middleware into server/src/index.ts
3. [ ] Apply database indexes
4. [ ] Test cache invalidation with POST requests

### Short-term (1-2 weeks)
1. [ ] Load testing with K6 (100 concurrent, 5 min)
2. [ ] Lighthouse audit (target 90+ Performance)
3. [ ] Mobile app performance testing on real devices
4. [ ] Implement query profiling for slow endpoints

### Long-term (Phase 22.18+)
1. [ ] Advanced code splitting (route-based dynamic chunks)
2. [ ] Service Worker caching policies refinement
3. [ ] Database query batching optimization
4. [ ] Redis caching for multi-server deployments

---

## Rollback Plan

If performance doesn't improve as expected:

1. **Web Bundle:** Revert vite.config.ts changes
   ```bash
   git checkout HEAD -- vite.config.ts
   npm run build
   ```

2. **Server Cache:** Disable middleware
   ```typescript
   // Comment out in server/src/index.ts
   // app.use(setupCacheHeaders);
   ```

3. **Database Indexes:** Drop problematic indexes
   ```sql
   DROP INDEX IF EXISTS idx_name;
   ```

---

## References

- Vite Bundle Analysis: https://vitejs.dev/guide/troubleshooting.html#slow-initial-server-start
- React Code Splitting: https://react.dev/reference/react/lazy
- Service Worker Caching: https://developers.google.com/web/tools/workbox/modules/workbox-strategies
- WatermelonDB Performance: https://watermelondb.com/docs/advanced/performance
- Express Performance Best Practices: https://expressjs.com/en/advanced/best-practice-performance.html

---

## Support & Questions

For questions on implementation:
1. Review corresponding documentation file
2. Check example code patterns in implementation files
3. Refer to test files for usage examples
4. Contact: Phase 22.17 Implementation Owner

---

**Owner:** Claude Agent (Phase 22.17)  
**Created:** 2026-10-08  
**Status:** In Progress  
**Next Review:** 2026-10-15 (after Phase 1 completion)

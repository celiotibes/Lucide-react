# Performance & Optimization Strategy — Phase 22.17

**Status:** Implementação Phase 22.17  
**Branch:** claude/accounting-legal-reconstruction-i8gep8  
**Target Date:** Q4 2026

## Executive Summary

This document outlines the performance optimization strategy for CRMT (Lucide React CRMT), a complex accounting & financial reconstruction platform spanning Electron (desktop), React (web), React Native (mobile), and Express (backend).

**Key Metrics:**
- Web main bundle: Target < 500KB gzip (currently ~750KB estimated)
- Mobile app bundle: Target < 50MB (Expo build)
- Server database queries: p99 latency < 50ms
- PWA offline-first: Service worker pre-caching strategy
- Time to Interactive (TTI): Target < 2s on 4G

---

## 1. Web Bundle Optimization (src/ & build pipeline)

### 1.1 Code Splitting by Route

**Current State:**
- App.tsx already uses React.lazy() + Suspense for 35+ views
- All lazy imports properly formatted with named exports
- No unused dependencies in bundle analysis yet

**Optimization Strategy:**

```typescript
// Already implemented pattern (DO NOT CHANGE)
const AuditoriaView = lazy(() =>
  import("./components/AuditoriaView").then(m => ({ default: m.AuditoriaView }))
);
```

**Heavy Libraries - Dynamic Import Candidates:**
1. **recharts** (~180KB) — Dashboard, Budget Variance, Analytics views
2. **jspdf** (~200KB) — Laudo, ECD Export, Reports
3. **tesseract.js** (~6.6MB external) — Document capture/OCR
4. **pdfjs-dist** (~8MB bundled) — PDF viewer for Documentos view

**Implementation:**
- ✓ Recharts: Move to Dashboard.tsx lazy boundary
- ✓ jsPDF: Lazy import only in Laudo/ECD views
- ✓ Tesseract: Already externalized in PWA (see vite.config.ts)
- ✓ PDFjs: Already externalized in public/tesseract/

### 1.2 Tree-Shaking & Unused Export Elimination

**Validation Tools:**
- `vite-plugin-visualizer` — bundle analysis
- `rollup-plugin-visualizer` equivalent in Vite 7.3

**Current Package Analysis:**
- lucide-react: Importing all icons individually via { Icon1, Icon2 } ✓
- date-fns: 170KB total → use date-fns/locale only as needed
- lodash: Not in main package.json (good)
- react-dom: Evaluated for hydration vs. createRoot (using createRoot ✓)

**Action Items:**
1. Replace `import * as DateFns from 'date-fns'` with targeted imports
2. Verify no unused utils are bundled from domain/* and services/*
3. Enable terser tree-shaking aggressive mode in vite.config.ts

### 1.3 Dynamic Imports for Heavy Libraries

**Implementation Pattern:**

```typescript
// Chart lazy loading (recharts)
const ChartComponent = lazy(() => 
  import('recharts').then(() => import('./components/ChartWrapper'))
);

// PDF export (jspdf) — lazy only on demand
async function exportPDF() {
  const { jsPDF } = await import('jspdf');
  // use jsPDF
}

// OCR (tesseract.js) — already externalized
// Already in PWA runtimeCaching with CacheFirst
```

**Library Load Strategy:**
- **On-demand code path:** jsPDF, tesseract (user action triggered)
- **Bundled but lazy:** recharts (route-based, Suspense fallback)
- **Externalized/runtime:** SQL.js wasm, tesseract data files

### 1.4 Build Output Analysis

**Process:**
1. Install vite-plugin-visualizer: `npm install -D vite-plugin-visualizer`
2. Configure in vite.config.ts: `visualizer({ open: true })`
3. Run `npm run build` → generates dist/stats.html
4. Analyze:
   - Duplicate dependencies
   - Unexpectedly large packages
   - Unused code (tree-shaking failures)

**Current vite.config.ts Settings:**
```typescript
build: {
  minify: 'terser',
  sourcemap: 'hidden',  // ✓ No source maps in prod
  rollupOptions: {
    output: {
      entryFileNames: '[name].[hash].js',
      chunkFileNames: '[name].[hash].js',
      assetFileNames: '[name].[hash][extname]',
    },
  },
}
```

**Target Output:**
- main.*.js: < 500KB gzip
- vendor chunks: lazy-loaded on route change
- Assets: hash-based for HTTP caching

### 1.5 Gzip Compression Targets

**Current Setup:**
- Vite minifies with terser (aggressive settings ✓)
- Express server should compress responses

**Verification Checklist:**
- [ ] Nginx/reverse proxy: gzip on; gzip_min_length 500;
- [ ] Express middleware: `compression()` before routes
- [ ] vite.config.ts terser settings optimized
- [ ] sourcemap: 'hidden' prevents source map bloat

---

## 2. Mobile App Performance (mobile-app/)

### 2.1 WatermelonDB Indexing Strategy

**Current Setup:**
- WatermelonDB v0.29.0 configured
- Database tables: Properties, Transactions, etc.

**High-Frequency Queries:**
1. **Transactions by property + date range** (most used)
2. **Properties by owner/status**
3. **Account balance lookups**
4. **Sync status queries**

**Indexing Plan:**
```typescript
// src/db/models/Transaction.ts
class Transaction extends Model {
  static table = 'transactions';
  static associations = {
    property: { type: 'belongs_to', key: 'property_id' },
  };
}

// Index schema (in migration):
// CREATE INDEX idx_tx_property_date ON transactions(property_id, date DESC)
// CREATE INDEX idx_tx_status ON transactions(status)
```

**Implementation File:**
- Create: `mobile-app/src/db/indexes.ts`
- Configure collection indexes in schema

### 2.2 FlatList + Virtualization

**Current Pattern:**
- React Native FlatList already supports virtualization
- keyExtractor ensures item identity

**Optimization Points:**
```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={item => item.id}
  maxToRenderPerBatch={10}  // Render in batches
  initialNumToRender={10}   // Start with 10
  removeClippedSubviews={true}  // Remove off-screen items
  windowSize={21}  // How many items to keep rendered
  onEndReachedThreshold={0.5}
  onEndReached={loadMore}
/>
```

**Implementation:**
- Review mobile-app/src/screens for FlatList usage
- Add virtualization config to large lists (Transactions, Properties)

### 2.3 Image Optimization

**Current Tool:** sharp v0.35.5 in main package.json  
**For Mobile:** sharp can generate thumbnails

**Strategy:**
```typescript
// mobile-app/src/utils/imageOptimization.ts
import sharp from 'sharp';

export async function optimizeImageForDisplay(
  sourceBuffer: Buffer,
  maxWidth: number = 600
): Promise<Buffer> {
  return sharp(sourceBuffer)
    .resize(maxWidth, maxWidth, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
}
```

**Implementation:**
- Image cache directory: app-specific cache folder
- Thumbnail size: 120px for lists, 600px for detail views
- Format: WebP for Android, JPEG for fallback

### 2.4 Memory Leak Prevention

**Critical Points:**
- useEffect cleanup in async operations
- Remove event listeners on unmount
- Cancel promises on component unmount

**Pattern:**
```typescript
useEffect(() => {
  let isMounted = true;

  const fetchData = async () => {
    try {
      const result = await apiCall();
      if (isMounted) setState(result);
    } catch (err) {
      if (isMounted) setError(err);
    }
  };

  fetchData();
  return () => { isMounted = false; };
}, []);
```

**Audit List:**
- [ ] Review mobile-app/src/screens/*.tsx for async useEffect
- [ ] Verify all subscriptions are unsubscribed
- [ ] Check for unmounted component state updates

### 2.5 Battery Optimization

**Sync Strategy:**
- Background sync intervals: 15min (not 5min)
- Disable sync when battery < 20%
- Use adaptive refresh rates

**Implementation:**
```typescript
// mobile-app/src/services/syncService.ts
const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
const LOW_BATTERY_THRESHOLD = 0.2;

export function configureSyncStrategy(battery: number) {
  if (battery < LOW_BATTERY_THRESHOLD) {
    return { disabled: true };
  }
  return { interval: SYNC_INTERVAL };
}
```

---

## 3. Server Performance (server/)

### 3.1 Database Query Optimization

**Problem:** N+1 query pattern in API endpoints

**Pattern Detection:**
```sql
-- BAD: Fetches properties, then loops to fetch balance for each
SELECT * FROM properties;  -- 1 query
-- Loop: SELECT balance FROM balances WHERE property_id = X;  -- N queries

-- GOOD: Join to fetch in single query
SELECT p.*, b.balance
FROM properties p
LEFT JOIN balances b ON p.id = b.property_id;
```

**Specific Optimizations:**

1. **Transaction List Endpoint (/api/transactions)**
   - Add indexes: `(property_id, date DESC)`
   - Use pagination: `LIMIT 100 OFFSET ?`
   - Pre-join property metadata

2. **Property Balance (/api/properties/:id/balance)**
   - Cache balance in properties table (denormalized)
   - Update on transaction insert via trigger
   - TTL: 5 minutes

3. **Report Generation (/api/reports/laudo)**
   - Batch-fetch all transactions upfront
   - Use IN(...) for multiple properties instead of loops
   - Materialize computed columns

### 3.2 Connection Pooling

**Current Setup:** better-sqlite3 (single-threaded, no pooling needed for sqlite)

**For Future PostgreSQL Migration:**

```typescript
// server/src/db/postgres.ts (if needed)
import pg from 'pg';

const pool = new pg.Pool({
  max: 20,  // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export function getConnection() {
  return pool.connect();
}
```

**Current better-sqlite3 Config:**
- Single writer, multiple readers
- Memory-mapped I/O enabled
- WAL mode enabled (Write-Ahead Logging)

### 3.3 Caching Layer

**Strategy:**

```typescript
// server/src/cache/redisCache.ts (if Redis available)
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },
  async set<T>(key: string, value: T, ttl: number = 300) {
    await redis.setex(key, ttl, JSON.stringify(value));
  },
};
```

**Candidates for Caching:**
1. Property balances (TTL: 5min)
2. Index values (historical, never changes)
3. Report metadata (TTL: 1hr)
4. User preferences (TTL: 24hr)

### 3.4 Endpoint Profiling

**Tool:** Node.js built-in `--prof` or `clinic.js`

```bash
# Profile a request
node --prof server/src/index.ts

# Analyze results
node --prof-process isolate-*.log > processed.txt
```

**Key Endpoints to Profile:**
- `POST /api/transactions/import`
- `GET /api/reports/laudo/:id`
- `GET /api/properties/:id/balance`
- `GET /api/sync/pull`

### 3.5 Rate Limiting Strategy

**Current:** express-rate-limit v7.4.0 (already in package.json)

```typescript
// server/src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
  standardHeaders: true,  // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
});

export const syncLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 5,  // Sync max 5 times per minute
});
```

**Apply to Routes:**
```typescript
app.post('/api/transactions/import', limiter, handleImport);
app.get('/api/sync/pull', syncLimiter, handleSync);
```

---

## 4. Caching Strategies

### 4.1 PWA Service Worker

**Current Config:** vite-plugin-pwa with Workbox (see vite.config.ts)

**Cache Strategy:**
```
┌─────────────────────────────────────────────┐
│ HTTP Request                                │
└────────────────┬────────────────────────────┘
                 │
        ┌────────▼────────┐
        │ Service Worker  │
        └────────┬────────┘
                 │
    ┌────────────┼────────────┐
    │ URL Pattern?             │
    └────────────┬────────────┘
                 │
    ┌────────────┴────────────────────┐
    │                                  │
    ▼                                  ▼
 /assets/*                         /tesseract/*
 CacheFirst                        CacheFirst
 (static assets)                   (runtime cache)
    │                                  │
    └──────────────────┬───────────────┘
                       │
                       ▼
                   Browser Cache
                   (HTTP headers)
```

**Current Implementation (GOOD):**
- `globPatterns`: Precache JS, CSS, HTML, icons, manifest, WASM
- `globIgnores`: Exclude tesseract (6.6MB)
- `runtimeCaching`: CacheFirst for tesseract

### 4.2 IndexedDB Caching

**Use Case:** Immutable data that rarely changes (indices, historical data)

```typescript
// src/db/idb.ts
import { set, get } from 'idb-keyval';

export const idbCache = {
  async setIndices(indices: IndicesList) {
    await set('indices-2026-q4', indices);
  },
  async getIndices(): Promise<IndicesList | undefined> {
    return await get('indices-2026-q4');
  },
};
```

**Candidates:**
1. Economic indices (IPCA, IGP, etc.) — update monthly
2. Historical exchange rates — cache by date range
3. User preferences — cache indefinitely

### 4.3 HTTP Cache Headers

**Vite Build Output:**
```
dist/main.a1b2c3d4.js        → Cache-Control: max-age=31536000
dist/index.html              → Cache-Control: max-age=3600
api/transactions             → Cache-Control: max-age=300, private
```

**Implementation (Express):**
```typescript
// server/src/middleware/cacheHeaders.ts
export function setCacheHeaders(req, res, next) {
  // Static assets (versioned by hash)
  if (req.path.match(/\.(js|css|png|svg)$/)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  // HTML (index.html)
  else if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'public, max-age=3600');
  }
  // API responses
  else if (req.path.startsWith('/api')) {
    res.set('Cache-Control', 'private, max-age=300');
  }
  next();
}

app.use(setCacheHeaders);
```

### 4.4 Cache Invalidation Strategy

**Automatic:**
- Vite hashes: `main.a1b2c3d4.js` — old hash immediately stale
- Service Worker: Check manifest.json for updates

**Manual:**
- New deploy → Service Worker prompts user to reload
- User closes/reopens tab → loads latest

**Validation:**
```typescript
// src/pwa/AvisoAtualizacao.tsx (already exists)
// Shows update prompt when SW detects new version
const { needRefresh, offlineReady } = useRegisterSW({
  onRegistered(r) {
    // Check for updates periodically
    setInterval(() => r.update(), 3600000); // 1 hour
  },
});
```

---

## 5. Deliverables & Timeline

| Deliverable | File | Status | ETA |
|-------------|------|--------|-----|
| This doc | src/performance-optimization.md | ✓ Created | Oct 8 |
| Bundle analyzer config | vite.config.ts (updated) | In progress | Oct 8 |
| Mobile performance config | mobile-app/performance-config.ts | Pending | Oct 8 |
| Server optimization guide | server/database-optimization.md | Pending | Oct 8 |
| PWA service worker (existing) | src/pwa/AvisoAtualizacao.tsx | ✓ Exists | — |
| Query optimization patterns | server/src/queries/ | TBD | Oct 9 |

---

## 6. Success Criteria

### Metrics
- [ ] Main bundle: < 500KB gzip (goal: 420KB)
- [ ] Mobile app: < 50MB Expo build (goal: 45MB)
- [ ] Server p99 latency: < 50ms (baseline measurement)
- [ ] PWA offline support: ✓ Verified
- [ ] Time to Interactive: < 2s on 4G

### Testing
- [ ] Load test with K6: 100 concurrent users, 5min duration
- [ ] Lighthouse audit: Target 90+ Performance score
- [ ] E2E tests pass with bundle split (no import errors)
- [ ] Offline mode works: Service worker caches/serves correctly

### Code Review
- [ ] No import * statements (only specific imports)
- [ ] All lazy() boundaries documented
- [ ] Cache invalidation strategy implemented
- [ ] No memory leaks in mobile app

---

## 7. Post-Implementation

**Phase 22.18 (if needed):**
- Advanced code splitting (route-based chunk loading)
- Service Worker caching policies refinement
- Database query batching optimization
- Image compression optimization for mobile

**References:**
- Vite Rollup Options: https://vitejs.dev/config/build-options.html
- React Code Splitting: https://react.dev/reference/react/lazy
- Workbox Caching: https://developers.google.com/web/tools/workbox
- WatermelonDB Queries: https://watermelondb.com/docs/API/observations

---

**Owner:** Claude Agent (Phase 22.17 Implementation)  
**Last Updated:** 2026-10-08  
**Next Review:** After bundle analysis & metrics collection

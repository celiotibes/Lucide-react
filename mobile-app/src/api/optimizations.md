# API Client Performance Optimizations

## Network Optimization Strategies

### 1. Request Batching
Combine multiple document sync requests into a single batch request.

```typescript
interface BatchedRequest {
  ids: string[];
  operation: 'sync' | 'upload' | 'delete';
}

class BatchedAPIClient {
  private queue: BatchedRequest[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private batchSize = 50;
  private batchDelay = 500; // ms

  async addToBatch(request: BatchedRequest): Promise<void> {
    this.queue.push(request);

    if (this.queue.length >= this.batchSize) {
      await this.flush();
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this.flush(), this.batchDelay);
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const requests = this.queue.splice(0, this.batchSize);
    
    try {
      await this.sendBatch(requests);
    } catch (error) {
      // Re-queue failed requests
      this.queue.unshift(...requests);
    }

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  private async sendBatch(requests: BatchedRequest[]): Promise<void> {
    const response = await fetch('/api/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify({ operations: requests }),
    });

    if (!response.ok) {
      throw new Error(`Batch request failed: ${response.status}`);
    }
  }
}
```

### 2. Response Caching with HTTP Headers

```typescript
// Implement HTTP cache control
class CacheAwareClient {
  private cache = new Map<string, CacheEntry>();

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const cacheKey = this.getCacheKey(url, options);
    const cached = this.getFromCache(cacheKey);

    if (cached && !this.isCacheExpired(cached)) {
      return new Response(cached.body, {
        status: 200,
        headers: { 'X-Cache': 'HIT' },
      });
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Accept-Encoding': 'gzip', // Enable compression
        'Cache-Control': 'max-age=300', // 5 minute default
      },
    });

    if (response.ok && this.isCacheable(response)) {
      const body = await response.text();
      this.setCache(cacheKey, body, response.headers);
      return new Response(body, response);
    }

    return response;
  }

  private isCacheable(response: Response): boolean {
    const cacheControl = response.headers.get('cache-control');
    return response.status === 200 && (!cacheControl?.includes('no-cache'));
  }

  private getFromCache(key: string): CacheEntry | null {
    return this.cache.get(key) ?? null;
  }

  private setCache(key: string, body: string, headers: Headers): void {
    const maxAge = this.parseMaxAge(headers.get('cache-control'));
    this.cache.set(key, {
      body,
      expires: Date.now() + maxAge,
    });
  }

  private isCacheExpired(entry: CacheEntry): boolean {
    return entry.expires < Date.now();
  }

  private parseMaxAge(cacheControl: string | null): number {
    if (!cacheControl) return 300000; // 5 minutes default
    const match = cacheControl.match(/max-age=(\d+)/);
    return match ? parseInt(match[1]) * 1000 : 300000;
  }

  private getCacheKey(url: string, options: RequestInit): string {
    const method = options.method || 'GET';
    return `${method}:${url}`;
  }
}

interface CacheEntry {
  body: string;
  expires: number;
}
```

### 3. Request Deduplication

```typescript
class DeduplicatingClient {
  private inFlightRequests = new Map<string, Promise<Response>>();

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    const cacheKey = this.getCacheKey(url, options);

    // Return existing request if already in flight
    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey)!;
    }

    // Store promise for in-flight request
    const promise = fetch(url, options)
      .then((response) => {
        this.inFlightRequests.delete(cacheKey);
        return response;
      })
      .catch((error) => {
        this.inFlightRequests.delete(cacheKey);
        throw error;
      });

    this.inFlightRequests.set(cacheKey, promise);
    return promise;
  }

  private getCacheKey(url: string, options: RequestInit): string {
    return `${options.method || 'GET'}:${url}`;
  }
}
```

### 4. Timeout Optimization

```typescript
// Standard timeout settings (in milliseconds)
const TIMEOUT_CONFIG = {
  // Fast endpoints (< 3s)
  FAST: 3000,
  
  // Standard endpoints (< 10s)
  STANDARD: 10000,
  
  // Slow endpoints like batch operations (< 30s)
  SLOW: 30000,
  
  // File uploads/downloads (< 5 minutes)
  FILE: 300000,
};

// Usage
async function fetchDocumentsSync(ids: string[]): Promise<DocumentSyncResult[]> {
  return fetchWithTimeout(
    '/api/documents/sync',
    { method: 'POST', body: JSON.stringify({ ids }) },
    TIMEOUT_CONFIG.SLOW // 30 second timeout
  );
}
```

### 5. Progressive Enhancement

```typescript
// Prioritize critical data
type RequestPriority = 'critical' | 'high' | 'normal' | 'low';

class PrioritizedQueue {
  private queues = {
    critical: [] as Request[],
    high: [] as Request[],
    normal: [] as Request[],
    low: [] as Request[],
  };

  private isProcessing = false;
  private concurrency = 3;
  private activeCount = 0;

  async enqueue(url: string, options: RequestInit, priority: RequestPriority = 'normal'): Promise<Response> {
    const request = { url, options, priority };
    this.queues[priority].push(request);

    if (!this.isProcessing) {
      this.isProcessing = true;
      this.processQueue();
    }

    return new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });
  }

  private async processQueue(): Promise<void> {
    while (this.activeCount < this.concurrency) {
      const request = this.getNextRequest();
      if (!request) break;

      this.activeCount++;

      fetch(request.url, request.options)
        .then((response) => request.resolve(response))
        .catch((error) => request.reject(error))
        .finally(() => {
          this.activeCount--;
          this.processQueue();
        });
    }

    if (this.activeCount === 0) {
      this.isProcessing = false;
    }
  }

  private getNextRequest(): Request | null {
    for (const priority of ['critical', 'high', 'normal', 'low']) {
      const queue = this.queues[priority as RequestPriority];
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }
}
```

## Implementation Guidelines

### Do's
- ✅ Use gzip compression for all requests
- ✅ Batch multiple small requests
- ✅ Cache responses with appropriate TTL
- ✅ Deduplicate in-flight requests
- ✅ Set reasonable timeouts per endpoint type
- ✅ Prioritize critical data loading

### Don'ts
- ❌ Don't cache user-specific data
- ❌ Don't ignore cache-control headers
- ❌ Don't set extremely long timeouts
- ❌ Don't make redundant requests
- ❌ Don't block on non-critical data

## Performance Gains

| Strategy | Expected Improvement |
|----------|-------------------|
| Request Batching | 40-60% fewer requests |
| Response Caching | 70-90% faster repeat requests |
| Request Deduplication | 30-50% fewer duplicate requests |
| Timeout Optimization | Faster failure detection (3-10s vs 30s) |
| Progressive Enhancement | Better perceived performance |

## Testing

```typescript
// Test batching
test('should batch multiple requests', async () => {
  const client = new BatchedAPIClient();
  
  // Add requests
  await client.addToBatch({ ids: ['1'], operation: 'sync' });
  await client.addToBatch({ ids: ['2'], operation: 'sync' });
  
  // Should be combined into one
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

// Test caching
test('should return cached response', async () => {
  const client = new CacheAwareClient();
  
  const resp1 = await client.fetch('/api/documents');
  const resp2 = await client.fetch('/api/documents');
  
  expect(fetchSpy).toHaveBeenCalledTimes(1); // Only called once
  expect(resp2.headers.get('X-Cache')).toBe('HIT');
});
```

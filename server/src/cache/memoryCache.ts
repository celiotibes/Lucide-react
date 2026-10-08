/**
 * In-Memory Cache Implementation
 * Phase 22.17 — Performance & Optimization
 *
 * Provides a simple, thread-safe in-memory cache for frequently accessed data.
 * No external dependencies (Redis) required for single-server deployments.
 *
 * Use cases:
 * - Property balances (TTL: 5 minutes)
 * - Economic indices (TTL: 1 hour)
 * - Report metadata (TTL: 1 hour)
 * - User preferences (TTL: 24 hours)
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number; // For monitoring
  createdAt: number;
}

interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsageEstimate: number; // bytes
}

/**
 * Simple but effective in-memory cache with TTL support
 */
export class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private stats = {
    hits: 0,
    misses: 0,
  };
  private cleanupInterval: NodeJS.Timer | null = null;

  /**
   * Get a value from cache
   * Returns null if not found or expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Cache hit
    entry.hits++;
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set a value in cache with optional TTL
   * @param key Cache key
   * @param value Value to cache
   * @param ttlSeconds Time to live in seconds (default: 300 = 5 min)
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      hits: 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete multiple keys matching a pattern
   * Useful for invalidating related cache entries
   * @example cache.deletePattern('balance:*') // Delete all balance entries
   */
  deletePattern(pattern: string): number {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    let deleted = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): CacheStats {
    let memoryEstimate = 0;

    for (const [key, entry] of this.cache) {
      // Rough estimate: key + value size
      memoryEstimate += key.length * 2; // UTF-16 string
      memoryEstimate += JSON.stringify(entry.value).length;
    }

    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      totalEntries: this.cache.size,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      hitRate,
      memoryUsageEstimate: memoryEstimate,
    };
  }

  /**
   * Start automatic cleanup of expired entries
   * Runs periodically to prevent memory leaks
   * @param intervalSeconds How often to run cleanup (default: 60)
   */
  startCleanup(intervalSeconds: number = 60): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.cache) {
        if (entry.expiresAt < now) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (process.env.NODE_ENV === 'development' && cleaned > 0) {
        console.debug(`[Cache Cleanup] Removed ${cleaned} expired entries`);
      }
    }, intervalSeconds * 1000);
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get all keys in cache (useful for debugging)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all entries in cache (useful for debugging)
   */
  entries(): Array<[string, any]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }
}

/**
 * Global cache instance
 * Use for application-wide caching
 */
export const cache = new MemoryCache();

// Start automatic cleanup on app startup
cache.startCleanup(60); // Clean every minute

/**
 * Cache decorator for functions (higher-order function pattern)
 * @example
 * const getCachedBalance = withCache(
 *   (propertyId) => computeBalance(propertyId),
 *   'balance',
 *   300 // 5 minutes
 * );
 */
export function withCache<T extends (...args: any[]) => any>(
  fn: T,
  keyPrefix: string,
  ttlSeconds: number = 300
): T {
  return ((...args: any[]) => {
    const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;

    const cached = cache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const result = fn(...args);

    // Handle promises
    if (result instanceof Promise) {
      return result.then((resolved) => {
        cache.set(cacheKey, resolved, ttlSeconds);
        return resolved;
      });
    }

    cache.set(cacheKey, result, ttlSeconds);
    return result;
  }) as T;
}

/**
 * Async cache wrapper for Promise-returning functions
 * @example
 * const getCachedData = withAsyncCache(
 *   async (id) => await fetchFromDB(id),
 *   'data',
 *   300
 * );
 */
export function withAsyncCache<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyPrefix: string,
  ttlSeconds: number = 300
): T {
  return (async (...args: any[]) => {
    const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;

    const cached = cache.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const result = await fn(...args);
    cache.set(cacheKey, result, ttlSeconds);
    return result;
  }) as T;
}

/**
 * Cache invalidation helper for write operations
 * Automatically clears cache after data changes
 * @example
 * app.post('/api/transactions', async (req, res) => {
 *   const result = await insertTransaction(req.body);
 *   invalidatePropertyCache(result.property_id);
 *   res.json(result);
 * });
 */
export function invalidatePropertyCache(propertyId: string | number): void {
  cache.delete(`balance:${propertyId}`);
  cache.deletePattern(`property:${propertyId}:*`);
  cache.deletePattern(`transactions:${propertyId}:*`);
}

/**
 * Monitoring: Log cache stats periodically (development only)
 */
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    const stats = cache.getStats();
    if (stats.totalEntries > 0) {
      console.debug('[Cache Stats]', {
        entries: stats.totalEntries,
        hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
        memory: `${(stats.memoryUsageEstimate / 1024).toFixed(1)}KB`,
      });
    }
  }, 60000); // Every minute
}

export default cache;

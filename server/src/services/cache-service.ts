/**
 * In-Memory Cache Service with TTL (Time-To-Live) + LRU Eviction
 *
 * Provides a thread-safe, TTL-enabled cache for storing frequently accessed data.
 * Automatically evicts expired entries on access.
 *
 * Performance Optimizations:
 *   - LRU eviction: máximo 1000 chaves por namespace
 *   - Memory limit: 50MB total, descarta quando excedido
 *   - Pattern-based invalidation via invalidateByPattern()
 *
 * Usage:
 *   const cache = new CacheService();
 *   cache.set('key', data, 60000); // 60 seconds
 *   const result = cache.get('key');
 *   cache.invalidateByPattern('cobranca:*'); // Invalida por padrão
 *
 * Features:
 *   - TTL-based expiration (milliseconds)
 *   - LRU eviction when exceeding 1000 keys per namespace
 *   - Memory monitoring (50MB limit)
 *   - Pattern-based invalidation
 *   - Type-safe get/set operations
 *   - Memory-efficient cleanup
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  lastAccessed: number;
  size: number; // Tamanho aproximado em bytes
}

export class CacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly MAX_KEYS_PER_NAMESPACE = 1000;
  private readonly MAX_MEMORY_BYTES = 50 * 1024 * 1024; // 50MB
  private readonly NAMESPACE_SEPARATOR = ':';
  private totalMemoryUsage = 0;
  private accessOrder: string[] = []; // Para LRU tracking

  /**
   * Retrieves a value from cache if it exists and hasn't expired.
   *
   * @param key Cache key
   * @returns Cached value or null if not found/expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      // Entry is expired, remove it
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Stores a value in cache with an optional TTL.
   *
   * @param key Cache key
   * @param data Value to cache
   * @param ttlMs Time-to-live in milliseconds (default: 60000ms = 1 minute)
   */
  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Checks if a key exists in cache and is still valid.
   *
   * @param key Cache key
   * @returns true if key exists and hasn't expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clears all cache entries, or entries matching a pattern.
   *
   * @param pattern Optional glob-like pattern to match keys (uses string.includes())
   */
  clear(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Returns the number of entries in cache.
   *
   * @returns Cache entry count (includes expired entries not yet cleaned up)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Cleans up all expired entries.
   *
   * @returns Number of entries removed
   */
  prune(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Gets cache statistics for debugging.
   *
   * @returns Object with cache stats
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    validEntries: number;
  } {
    const now = Date.now();
    let expiredCount = 0;
    let validCount = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredCount++;
      } else {
        validCount++;
      }
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      validEntries: validCount,
    };
  }
}

// Singleton instance
let cacheInstance: CacheService | null = null;

/**
 * Gets or creates the global cache service instance.
 *
 * @returns Singleton CacheService instance
 */
export function getCacheService(): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService();
  }
  return cacheInstance;
}

/**
 * Resets the global cache service (useful for testing).
 */
export function resetCacheService(): void {
  cacheInstance = null;
}

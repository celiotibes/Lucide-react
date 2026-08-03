import { logger } from '@utils/logger';

// ============================================================================
// CACHE SERVICE - In-Memory Caching with TTL
// ============================================================================

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: Date;
  hits: number;
  lastAccessed: Date;
}

export interface CacheStats {
  totalKeys: number;
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
}

export class CacheService<K = string, V = any> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private maxSize: number = 10000;
  private defaultTTL: number = 3600000; // 1 hour

  constructor(maxSize: number = 10000, defaultTTL: number = 3600000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.startCleanupInterval();
  }

  /**
   * Set cache value with TTL
   */
  set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const expiresAt = Date.now() + (ttlMs || this.defaultTTL);

    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: new Date(),
      hits: 0,
      lastAccessed: new Date(),
    });

    logger.debug({ key }, 'Cache set');
  }

  /**
   * Get cache value
   */
  get(key: K): V | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    entry.hits++;
    entry.lastAccessed = new Date();
    this.hits++;

    return entry.value;
  }

  /**
   * Check if key exists and is valid
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete cache entry
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    logger.info('Cache cleared');
  }

  /**
   * Get or compute value
   */
  async getOrCompute(key: K, fn: () => Promise<V>, ttlMs?: number): Promise<V> {
    const cached = this.get(key);

    if (cached !== null) {
      return cached;
    }

    try {
      const value = await fn();
      this.set(key, value, ttlMs);
      return value;
    } catch (error) {
      logger.error({ key, error }, 'Error computing cache value');
      throw error;
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: K | null = null;
    let oldestTime = Date.now();

    this.cache.forEach((entry, key) => {
      if (entry.lastAccessed.getTime() < oldestTime) {
        oldestTime = entry.lastAccessed.getTime();
        lruKey = key;
      }
    });

    if (lruKey !== null) {
      this.cache.delete(lruKey);
      logger.debug({ key: lruKey }, 'Evicted LRU cache entry');
    }
  }

  /**
   * Cleanup expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const expired: K[] = [];

      this.cache.forEach((entry, key) => {
        if (now >= entry.expiresAt) {
          expired.push(key);
        }
      });

      expired.forEach((key) => this.cache.delete(key));

      if (expired.length > 0) {
        logger.debug({ count: expired.length }, 'Cleaned up expired cache entries');
      }
    }, 60000);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;

    return {
      totalKeys: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      memoryUsage: this.estimateMemoryUsage(),
    };
  }

  /**
   * Estimate memory usage (rough estimate)
   */
  private estimateMemoryUsage(): number {
    let size = 0;

    this.cache.forEach((entry, key) => {
      size += JSON.stringify(key).length;
      size += JSON.stringify(entry.value).length;
    });

    return size;
  }

  /**
   * Get keys
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get size
   */
  size(): number {
    return this.cache.size;
  }

  reset(): void {
    this.clear();
  }
}

// Pre-configured singleton instances
export const cacheService = new CacheService<string, any>();
export const contractCache = new CacheService<string, any>(1000, 300000);
export const clientCache = new CacheService<string, any>(5000, 600000);
export const analyticsCache = new CacheService<string, any>(500, 1800000);

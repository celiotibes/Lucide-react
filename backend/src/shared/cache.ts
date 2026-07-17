/**
 * Distributed Cache Layer for Performance Optimization
 * Supports Redis-backed caching with TTL and invalidation
 */

import { redis } from '../cache/redis';
import { Logger } from './logger';

interface CacheOptions {
  ttl: number; // seconds
  keyPrefix?: string;
}

export class CacheService {
  private logger = Logger.getLogger('CacheService');
  private defaultOptions: CacheOptions = {
    ttl: 3600, // 1 hour default
    keyPrefix: 'cache:',
  };

  /**
   * Get value from cache
   * Returns null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const cached = await redis.get(cacheKey);

      if (cached) {
        this.logger.debug('Cache hit', { key, size: cached.length });
        try {
          return JSON.parse(cached) as T;
        } catch {
          this.logger.warn('Failed to parse cached value', undefined, { key });
          return null;
        }
      }

      this.logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      this.logger.error('Cache get failed', error as Error, { key });
      return null; // Fail gracefully, continue without cache
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, options?: Partial<CacheOptions>): Promise<boolean> {
    try {
      const opts = { ...this.defaultOptions, ...options };
      const cacheKey = this.getCacheKey(key);
      const serialized = JSON.stringify(value);

      await redis.setex(cacheKey, opts.ttl, serialized);

      this.logger.debug('Cache set', { key, ttl: opts.ttl, size: serialized.length });
      return true;
    } catch (error) {
      this.logger.error('Cache set failed', error as Error, { key });
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(key);
      const deleted = await redis.del(cacheKey);

      this.logger.debug('Cache deleted', { key, deleted: deleted > 0 });
      return deleted > 0;
    } catch (error) {
      this.logger.error('Cache delete failed', error as Error, { key });
      return false;
    }
  }

  /**
   * Get or compute value
   * If cache hit, returns cached value
   * If miss, calls compute function and caches result
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    options?: Partial<CacheOptions>
  ): Promise<T> {
    try {
      // Try cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        this.logger.debug('Cache hit (getOrCompute)', { key });
        return cached;
      }

      // Compute and cache
      this.logger.debug('Computing uncached value', { key });
      const computed = await compute();
      await this.set(key, computed, options);

      return computed;
    } catch (error) {
      this.logger.error('getOrCompute failed', error as Error, { key });
      throw error;
    }
  }

  /**
   * Clear all cache entries matching pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    try {
      const fullPattern = this.getCacheKey(pattern);
      const keys = await redis.keys(fullPattern);

      if (keys.length === 0) {
        return 0;
      }

      const deleted = await redis.del(...keys);
      this.logger.info('Cache pattern cleared', { pattern, count: deleted });
      return deleted;
    } catch (error) {
      this.logger.error('Cache clearPattern failed', error as Error, { pattern });
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<Record<string, unknown>> {
    try {
      const info = await redis.info('stats');
      const keys = await redis.dbsize();

      return {
        totalKeys: keys,
        info: info?.split('\r\n').slice(0, 5).join('; '),
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats', error as Error);
      return {};
    }
  }

  private getCacheKey(key: string): string {
    return `${this.defaultOptions.keyPrefix}${key}`;
  }
}

/**
 * Specialized cache instances for different use cases
 */

export class RatingCache extends CacheService {
  private logger = Logger.getLogger('RatingCache');

  async getRating(propertyId: string): Promise<Record<string, unknown> | null> {
    return this.get(`rating:${propertyId}`);
  }

  async setRating(propertyId: string, rating: Record<string, unknown>, platform: string): Promise<boolean> {
    const success = await this.set(`rating:${propertyId}:${platform}`, rating, {
      ttl: 86400, // 24 hours
    });

    if (success) {
      this.logger.info('Rating cached', { propertyId, platform });
    }

    return success;
  }

  async invalidateRating(propertyId: string, platform?: string): Promise<void> {
    if (platform) {
      await this.delete(`rating:${propertyId}:${platform}`);
      this.logger.debug('Rating invalidated', { propertyId, platform });
    } else {
      await this.clearPattern(`rating:${propertyId}:*`);
      this.logger.debug('All ratings invalidated for property', { propertyId });
    }
  }

  async getRatingOrFetch(
    propertyId: string,
    platform: string,
    fetch: () => Promise<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const cached = await this.get(`rating:${propertyId}:${platform}`);
    if (cached) {
      return cached;
    }

    const rating = await fetch();
    await this.setRating(propertyId, rating, platform);
    return rating;
  }
}

export class OccupancyCache extends CacheService {
  private logger = Logger.getLogger('OccupancyCache');

  async getOccupancy(propertyId: string, days: number = 90): Promise<Map<string, number> | null> {
    const cached = await this.get<Record<string, number>>(`occupancy:${propertyId}:${days}`);
    if (!cached) {
      return null;
    }

    return new Map(Object.entries(cached));
  }

  async setOccupancy(propertyId: string, occupancy: Map<string, number>, days: number = 90): Promise<boolean> {
    const obj = Object.fromEntries(occupancy);
    const success = await this.set(`occupancy:${propertyId}:${days}`, obj, {
      ttl: 21600, // 6 hours
    });

    if (success) {
      this.logger.info('Occupancy cached', { propertyId, days });
    }

    return success;
  }

  async invalidateOccupancy(propertyId: string): Promise<void> {
    await this.clearPattern(`occupancy:${propertyId}:*`);
    this.logger.debug('Occupancy invalidated', { propertyId });
  }

  async getOrFetch(
    propertyId: string,
    days: number = 90,
    fetch: () => Promise<Map<string, number>>
  ): Promise<Map<string, number>> {
    const cached = await this.getOccupancy(propertyId, days);
    if (cached) {
      return cached;
    }

    const occupancy = await fetch();
    await this.setOccupancy(propertyId, occupancy, days);
    return occupancy;
  }
}

export class BatchRequestCache extends CacheService {
  private logger = Logger.getLogger('BatchRequestCache');
  private pendingBatches: Map<string, { items: string[]; timer: NodeJS.Timeout }> = new Map();
  private batchSize = 5;
  private batchDelayMs = 100;

  async addToBatch(
    batchKey: string,
    item: string,
    processor: (items: string[]) => Promise<Record<string, unknown>[]>
  ): Promise<Record<string, unknown> | null> {
    const cacheKey = `batch:${batchKey}:${item}`;
    const cached = await this.get(cacheKey);
    if (cached) {
      this.logger.debug('Batch item cached', { batchKey, item });
      return cached as Record<string, unknown>;
    }

    const batch = this.pendingBatches.get(batchKey) || { items: [], timer: null };

    if (!batch.items.includes(item)) {
      batch.items.push(item);
    }

    // If batch is full, process immediately
    if (batch.items.length >= this.batchSize) {
      return this.processBatch(batchKey, batch.items, processor);
    }

    // Schedule batch processing
    if (!batch.timer) {
      batch.timer = setTimeout(() => {
        this.processBatch(batchKey, batch.items, processor);
        this.pendingBatches.delete(batchKey);
      }, this.batchDelayMs);
    }

    this.pendingBatches.set(batchKey, batch);
    return null; // Will be filled by batch processor
  }

  private async processBatch(
    batchKey: string,
    items: string[],
    processor: (items: string[]) => Promise<Record<string, unknown>[]>
  ): Promise<Record<string, unknown> | null> {
    try {
      this.logger.info('Processing batch', { batchKey, size: items.length });

      const results = await processor(items);

      // Cache each result
      results.forEach((result, index) => {
        const item = items[index];
        const cacheKey = `batch:${batchKey}:${item}`;
        this.set(cacheKey, result, { ttl: 3600 });
      });

      this.logger.info('Batch processed and cached', { batchKey, count: results.length });
      return results[results.length - 1] || null;
    } catch (error) {
      this.logger.error('Batch processing failed', error as Error, { batchKey });
      return null;
    }
  }
}

// Export singleton instances
export const ratingCache = new RatingCache();
export const occupancyCache = new OccupancyCache();
export const batchRequestCache = new BatchRequestCache();

import { logger } from '@utils/logger';

export interface CachedPetition {
  processNumber: string;
  petitionType: 'initial' | 'intermediate' | 'final' | 'other';
  plainText: string;
  rtfContent: string;
  confidence: number;
  warnings: string[];
  suggestedEdits: string[];
  createdAt: Date;
  expiresAt: Date;
}

interface CacheEntry {
  data: CachedPetition;
  hits: number;
  lastAccessed: Date;
}

export class PetitionCacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number = 7 * 24 * 60 * 60 * 1000; // 7 days
  private readonly maxCacheSize: number = 500;
  private readonly minConfidence: number = 0.85; // Only cache high-confidence results

  /**
   * Generate cache key from process number and petition type
   */
  private generateKey(processNumber: string, petitionType: string): string {
    return `petition:${processNumber}:${petitionType}`;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.data.expiresAt.getTime();
  }

  /**
   * Get cached petition if available and not expired
   */
  get(processNumber: string, petitionType: string): CachedPetition | null {
    const key = this.generateKey(processNumber, petitionType);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      logger.debug(`Cache expired for key: ${key}`);
      this.cache.delete(key);
      return null;
    }

    // Update access tracking
    entry.hits++;
    entry.lastAccessed = new Date();

    logger.info(`Cache hit for ${key} (hits: ${entry.hits})`);
    return entry.data;
  }

  /**
   * Store petition in cache if confidence is high enough
   */
  set(
    processNumber: string,
    petitionType: string,
    petition: Omit<CachedPetition, 'createdAt' | 'expiresAt'>
  ): boolean {
    // Only cache high-confidence results
    if (petition.confidence < this.minConfidence) {
      logger.debug(
        `Cache skipped: confidence too low (${petition.confidence} < ${this.minConfidence})`
      );
      return false;
    }

    // Check cache size
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastUsed();
    }

    const key = this.generateKey(processNumber, petitionType);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    const entry: CacheEntry = {
      data: {
        ...petition,
        createdAt: now,
        expiresAt,
      },
      hits: 0,
      lastAccessed: now,
    };

    this.cache.set(key, entry);

    logger.info(
      `Cached petition: ${key} (confidence: ${petition.confidence}, expires: ${expiresAt.toISOString()})`
    );
    return true;
  }

  /**
   * Invalidate cache for a specific petition
   */
  invalidate(processNumber: string, petitionType?: string): boolean {
    if (petitionType) {
      const key = this.generateKey(processNumber, petitionType);
      const deleted = this.cache.delete(key);
      if (deleted) {
        logger.info(`Cache invalidated: ${key}`);
      }
      return deleted;
    }

    // Invalidate all petitions for this process
    let count = 0;
    for (const [key] of this.cache.entries()) {
      if (key.includes(`petition:${processNumber}:`)) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`Invalidated ${count} cache entries for process: ${processNumber}`);
    }
    return count > 0;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared (${size} entries removed)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    totalHits: number;
    avgHitsPerEntry: number;
    cacheSize: string;
  } {
    let totalHits = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }

    const avgHits = this.cache.size > 0 ? totalHits / this.cache.size : 0;

    // Estimate cache size (rough)
    let cacheBytes = 0;
    for (const entry of this.cache.values()) {
      cacheBytes += JSON.stringify(entry.data).length;
    }

    const cacheSizeMB = (cacheBytes / 1024 / 1024).toFixed(2);

    return {
      totalEntries: this.cache.size,
      totalHits,
      avgHitsPerEntry: parseFloat(avgHits.toFixed(2)),
      cacheSize: `${cacheSizeMB} MB`,
    };
  }

  /**
   * Evict least used entries when cache is full
   */
  private evictLeastUsed(): void {
    // Sort by hits and last accessed, evict bottom 10%
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        score: entry.hits * 0.7 + (Date.now() - entry.lastAccessed.getTime()) / 1000 * 0.3,
      }))
      .sort((a, b) => a.score - b.score);

    const toEvict = Math.ceil(this.cache.size * 0.1);
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i].key);
      logger.debug(`Evicted cache entry: ${entries[i].key}`);
    }

    logger.info(`Evicted ${toEvict} cache entries (cache full: ${this.cache.size})`);
  }
}

export const petitionCacheService = new PetitionCacheService();

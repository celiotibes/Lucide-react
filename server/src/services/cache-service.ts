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
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly MAX_KEYS_PER_NAMESPACE = 1000;
  private readonly MAX_MEMORY_BYTES = 50 * 1024 * 1024; // 50MB
  private readonly NAMESPACE_SEPARATOR = ':';
  private totalMemoryUsage = 0;
  private accessOrder: string[] = []; // Para LRU tracking

  /**
   * Retrieves a value from cache if it exists and hasn't expired.
   * Updates LRU access order.
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
      this.deleteEntry(key);
      return null;
    }

    // Update LRU access order
    entry.lastAccessed = now;
    this.updateAccessOrder(key);

    return entry.data as T;
  }

  /**
   * Estima o tamanho em bytes de um objeto
   * @param obj Objeto a ser medido
   * @returns Tamanho aproximado em bytes
   */
  private estimateSize(obj: any): number {
    const jsonStr = JSON.stringify(obj);
    return Buffer.byteLength(jsonStr, 'utf-8');
  }

  /**
   * Atualiza a ordem de acesso para LRU tracking
   * @param key Chave acessada
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Deleta uma entrada e atualiza contadores
   * @param key Chave a deletar
   */
  private deleteEntry(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalMemoryUsage -= entry.size;
      this.cache.delete(key);
    }
    // Sempre limpa a ordem de acesso: uma chave órfã aqui travava o laço de eviction por memória.
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  /**
   * Executa LRU eviction se necessário
   * @param namespace Namespace para verificar limite de chaves
   */
  private evictIfNeeded(namespace: string): void {
    // Conta chaves do namespace
    const namespaceKeys = Array.from(this.cache.keys()).filter(k =>
      k.startsWith(namespace + this.NAMESPACE_SEPARATOR)
    );

    // Se excedeu limite de chaves do namespace, remove a chave menos recentemente usada
    if (namespaceKeys.length > this.MAX_KEYS_PER_NAMESPACE) {
      const lruKey = this.findLRUKeyInNamespace(namespace);
      if (lruKey) {
        this.deleteEntry(lruKey);
      }
    }

    // Se excedeu limite de memória, remove chaves menos usadas até ficar abaixo do limite
    if (this.totalMemoryUsage > this.MAX_MEMORY_BYTES) {
      while (this.totalMemoryUsage > this.MAX_MEMORY_BYTES && this.accessOrder.length > 0) {
        const lruKey = this.accessOrder[0];
        if (lruKey) {
          this.deleteEntry(lruKey);
        }
      }
    }
  }

  /**
   * Encontra a chave menos recentemente usada em um namespace
   * @param namespace Namespace a verificar
   * @returns Chave LRU ou null
   */
  private findLRUKeyInNamespace(namespace: string): string | null {
    const prefix = namespace + this.NAMESPACE_SEPARATOR;
    for (const key of this.accessOrder) {
      if (key.startsWith(prefix)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Stores a value in cache with an optional TTL.
   * Automatically evicts entries if memory or key limits are exceeded.
   *
   * @param key Cache key
   * @param data Value to cache
   * @param ttlMs Time-to-live in milliseconds (default: 60000ms = 1 minute)
   */
  set<T>(key: string, data: T, ttlMs: number = 60000): void {
    const now = Date.now();
    const size = this.estimateSize(data);

    // Remove entrada anterior se existir para recalcular memória
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.totalMemoryUsage -= oldEntry.size;
      }
    }

    this.cache.set(key, {
      data,
      timestamp: now,
      ttl: ttlMs,
      lastAccessed: now,
      size,
    });

    this.totalMemoryUsage += size;
    this.updateAccessOrder(key);

    // Extrai namespace da chave (parte antes do primeiro ':')
    const namespace = key.split(this.NAMESPACE_SEPARATOR)[0];
    this.evictIfNeeded(namespace);
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
      this.totalMemoryUsage = 0;
      this.accessOrder = [];
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.deleteEntry(key);
      }
    }
  }

  /**
   * Invalida entradas que correspondem a um padrão (ex: 'cobranca:*').
   * Útil para UPDATE/DELETE hooks em operações de banco de dados.
   *
   * @param pattern Padrão com wildcard (ex: 'cobranca:*', 'cobranca:list:*')
   * @returns Número de entradas invalidadas
   */
  invalidateByPattern(pattern: string): number {
    let invalidated = 0;
    const regex = this.patternToRegex(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.deleteEntry(key);
        invalidated++;
      }
    }

    return invalidated;
  }

  /**
   * Converte padrão com wildcard para regex
   * Ex: 'cobranca:*' -> regex que matches ^cobranca:.*
   * Ex: 'cobranca:list:*' -> regex que matches ^cobranca:list:.*
   *
   * @param pattern Padrão com wildcard
   * @returns Regex compilada
   */
  private patternToRegex(pattern: string): RegExp {
    const partes = pattern.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^${partes.join('.*')}$`);
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
   * Gets cache statistics for debugging and monitoring.
   *
   * @returns Object with cache stats including LRU and memory info
   */
  getStats(): {
    totalEntries: number;
    expiredEntries: number;
    validEntries: number;
    memoryUsageMB: number;
    memoryLimitMB: number;
    memoryPercentage: number;
    maxKeysPerNamespace: number;
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

    const memoryUsageMB = this.totalMemoryUsage / (1024 * 1024);
    const memoryLimitMB = this.MAX_MEMORY_BYTES / (1024 * 1024);
    const memoryPercentage = (this.totalMemoryUsage / this.MAX_MEMORY_BYTES) * 100;

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount,
      validEntries: validCount,
      memoryUsageMB: Math.round(memoryUsageMB * 10000) / 10000,
      memoryLimitMB: Math.round(memoryLimitMB * 100) / 100,
      memoryPercentage: Math.round(memoryPercentage * 100) / 100,
      maxKeysPerNamespace: this.MAX_KEYS_PER_NAMESPACE,
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

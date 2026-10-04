/**
 * Query caching service for frequently accessed static or slowly-changing data.
 * Improves performance by reducing repeated database queries.
 *
 * Cached data:
 * - Chart of accounts (contas plano)
 * - User data (TTL-based)
 * - Role/permission mappings
 */

import type Database from "better-sqlite3";

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // milliseconds; 0 = forever
}

export class QueryCacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();

  constructor(private db: Database.Database) {}

  /**
   * Get cached data or fetch from database if cache miss or expired.
   * @param key Cache key
   * @param fetcher Function to fetch data from database
   * @param ttl TTL in milliseconds (0 = forever)
   */
  async get<T>(key: string, fetcher: () => T, ttl: number = 0): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    // Return cached data if valid and not expired
    if (entry && (entry.ttl === 0 || now - entry.timestamp < entry.ttl)) {
      return entry.data;
    }

    // Fetch new data
    const data = fetcher();
    this.cache.set(key, { data, timestamp: now, ttl });
    return data;
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
        key,
        size: JSON.stringify(entry.data).length,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl,
      })),
    };
  }

  /**
   * Cache all chart of accounts (plano de contas)
   */
  async cacheChartOfAccounts(): Promise<unknown[]> {
    return this.get(
      "chart_of_accounts",
      () => {
        const stmt = this.db.prepare(
          "SELECT id, codigo, descricao, tipo, ativo FROM contas_plano ORDER BY codigo"
        );
        return stmt.all();
      },
      24 * 60 * 60 * 1000 // 24 hours
    );
  }

  /**
   * Get user data with TTL cache
   */
  async cacheUserData(userId: number): Promise<any | null> {
    return this.get(
      `user_${userId}`,
      () => {
        const stmt = this.db.prepare("SELECT * FROM usuarios WHERE id = ?");
        return stmt.get(userId);
      },
      60 * 60 * 1000 // 1 hour
    );
  }

  /**
   * Cache role/permission mappings
   */
  async cacheRolePermissions(): Promise<unknown[]> {
    return this.get(
      "role_permissions",
      () => {
        const stmt = this.db.prepare(
          "SELECT role_id, permission_id FROM role_permissions ORDER BY role_id, permission_id"
        );
        return stmt.all();
      },
      24 * 60 * 60 * 1000 // 24 hours
    );
  }
}

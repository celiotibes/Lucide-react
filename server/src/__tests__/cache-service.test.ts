import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService, getCacheService, resetCacheService } from '../services/cache-service.js';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
    resetCacheService();
  });

  afterEach(() => {
    resetCacheService();
  });

  describe('set and get', () => {
    it('should store and retrieve a value', () => {
      const data = { id: 1, name: 'Test' };
      cache.set('key1', data);

      const retrieved = cache.get<typeof data>('key1');
      expect(retrieved).toEqual(data);
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle default TTL of 60 seconds', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should support custom TTL', () => {
      cache.set('key1', 'value1', 5000); // 5 seconds
      expect(cache.has('key1')).toBe(true);
    });

    it('should return null for expired entries', (done) => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      expect(cache.get('key1')).toEqual('value1');

      // Wait for expiration
      setTimeout(() => {
        expect(cache.get('key1')).toBeNull();
        done();
      }, 150);
    });
  });

  describe('has', () => {
    it('should return true for valid cache entries', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for expired entries', (done) => {
      cache.set('key1', 'value1', 100);
      expect(cache.has('key1')).toBe(true);

      setTimeout(() => {
        expect(cache.has('key1')).toBe(false);
        done();
      }, 150);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all entries without pattern', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      expect(cache.size()).toBe(3);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    it('should clear entries matching a pattern', () => {
      cache.set('user:1', 'user1');
      cache.set('user:2', 'user2');
      cache.set('product:1', 'product1');
      cache.set('product:2', 'product2');

      cache.clear('user');
      expect(cache.has('user:1')).toBe(false);
      expect(cache.has('user:2')).toBe(false);
      expect(cache.has('product:1')).toBe(true);
      expect(cache.has('product:2')).toBe(true);
    });

    it('should handle pattern matching with no matches', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const sizeBefore = cache.size();
      cache.clear('nonexistent');
      expect(cache.size()).toBe(sizeBefore);
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(cache.size()).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('prune', () => {
    it('should remove expired entries', (done) => {
      cache.set('key1', 'value1', 100); // Will expire
      cache.set('key2', 'value2', 60000); // Will not expire

      setTimeout(() => {
        const removed = cache.prune();
        expect(removed).toBe(1);
        expect(cache.size()).toBe(1);
        expect(cache.has('key2')).toBe(true);
        done();
      }, 150);
    });

    it('should return 0 if no entries are expired', () => {
      cache.set('key1', 'value1', 60000);
      cache.set('key2', 'value2', 60000);

      const removed = cache.prune();
      expect(removed).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1', 60000);
      cache.set('key2', 'value2', 60000);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.validEntries).toBe(2);
      expect(stats.expiredEntries).toBe(0);
    });

    it('should count expired entries in stats', (done) => {
      cache.set('key1', 'value1', 100); // Will expire
      cache.set('key2', 'value2', 60000); // Will not expire

      setTimeout(() => {
        const stats = cache.getStats();
        expect(stats.totalEntries).toBe(2);
        expect(stats.expiredEntries).toBe(1);
        expect(stats.validEntries).toBe(1);
        done();
      }, 150);
    });
  });

  describe('singleton instance', () => {
    it('should create and return singleton instance', () => {
      resetCacheService();
      const instance1 = getCacheService();
      const instance2 = getCacheService();

      expect(instance1).toBe(instance2);
    });

    it('should share data across singleton calls', () => {
      resetCacheService();
      const cache1 = getCacheService();
      cache1.set('key1', 'value1');

      const cache2 = getCacheService();
      expect(cache2.get('key1')).toBe('value1');
    });
  });

  describe('type safety', () => {
    it('should preserve type information for complex objects', () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const user: User = { id: 1, name: 'John', email: 'john@example.com' };
      cache.set('user:1', user);

      const retrieved = cache.get<User>('user:1');
      expect(retrieved?.id).toBe(1);
      expect(retrieved?.email).toBe('john@example.com');
    });

    it('should work with primitive types', () => {
      cache.set('string', 'hello');
      cache.set('number', 42);
      cache.set('boolean', true);

      expect(cache.get<string>('string')).toBe('hello');
      expect(cache.get<number>('number')).toBe(42);
      expect(cache.get<boolean>('boolean')).toBe(true);
    });

    it('should work with arrays', () => {
      const items = [1, 2, 3, 4, 5];
      cache.set('items', items);

      const retrieved = cache.get<number[]>('items');
      expect(retrieved).toEqual(items);
      expect(Array.isArray(retrieved)).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple rapid sets and gets', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, `value${i}`);
      }

      expect(cache.size()).toBe(100);

      for (let i = 0; i < 100; i++) {
        expect(cache.get(`key${i}`)).toBe(`value${i}`);
      }
    });

    it('should handle mixed operations', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.get('key1')).toBe('value1');

      cache.set('key1', 'updated');
      expect(cache.get('key1')).toBe('updated');

      cache.clear('key1');
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });
  });
});

import { CacheService } from '@services/CacheService';

describe('CacheService', () => {
  let cache: CacheService<string, any>;

  beforeEach(() => {
    cache = new CacheService(1000, 60000);
  });

  test('should set and get value', () => {
    cache.set('key1', { data: 'value1' });
    const value = cache.get('key1');

    expect(value).toEqual({ data: 'value1' });
  });

  test('should return null for non-existent key', () => {
    const value = cache.get('non-existent');
    expect(value).toBeNull();
  });

  test('should expire values based on TTL', async () => {
    cache.set('key1', 'value1', 100);

    const value1 = cache.get('key1');
    expect(value1).toBe('value1');

    await new Promise((resolve) => setTimeout(resolve, 150));

    const value2 = cache.get('key1');
    expect(value2).toBeNull();
  });

  test('should check if key exists', () => {
    cache.set('key1', 'value1');

    expect(cache.has('key1')).toBe(true);
    expect(cache.has('non-existent')).toBe(false);
  });

  test('should delete key', () => {
    cache.set('key1', 'value1');

    const deleted = cache.delete('key1');
    expect(deleted).toBe(true);

    const value = cache.get('key1');
    expect(value).toBeNull();
  });

  test('should clear all cache', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.get('key1')).toBeNull();
  });

  test('should track cache hits and misses', () => {
    cache.set('key1', 'value1');

    cache.get('key1');
    cache.get('key1');
    cache.get('non-existent');
    cache.get('non-existent');

    const stats = cache.getStats();

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  test('should evict LRU when max size reached', () => {
    const smallCache = new CacheService<string, any>(3);

    smallCache.set('key1', 'value1');
    smallCache.set('key2', 'value2');
    smallCache.set('key3', 'value3');

    smallCache.get('key1');

    smallCache.set('key4', 'value4');

    expect(smallCache.has('key2')).toBe(false);
    expect(smallCache.has('key1')).toBe(true);
  });

  test('should get or compute value', async () => {
    let computeCount = 0;

    const result1 = await cache.getOrCompute('key1', async () => {
      computeCount++;
      return { data: 'computed' };
    });

    const result2 = await cache.getOrCompute('key1', async () => {
      computeCount++;
      return { data: 'computed-again' };
    });

    expect(computeCount).toBe(1);
    expect(result1).toEqual({ data: 'computed' });
    expect(result2).toEqual({ data: 'computed' });
  });

  test('should get cache size', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    expect(cache.size()).toBe(2);
  });

  test('should get all keys', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    const keys = cache.keys();

    expect(keys).toContain('key1');
    expect(keys).toContain('key2');
    expect(keys).toContain('key3');
    expect(keys.length).toBe(3);
  });

  test('should track statistics', () => {
    cache.set('key1', 'value1');
    cache.get('key1');

    const stats = cache.getStats();

    expect(stats.totalKeys).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(0);
  });

  test('should reset cache', () => {
    cache.set('key1', 'value1');
    cache.get('key1');

    cache.reset();

    expect(cache.size()).toBe(0);
    const stats = cache.getStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

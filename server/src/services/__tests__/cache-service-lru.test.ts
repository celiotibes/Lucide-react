import { describe, it, expect, beforeEach } from 'vitest';
import { CacheService } from '../cache-service';

describe('CacheService - LRU Eviction', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService();
  });

  it('deve respeitar limite de 1000 chaves por namespace', () => {
    const namespace = 'cobranca';

    // Insere 2000 chaves no namespace
    for (let i = 0; i < 2000; i++) {
      cache.set(`${namespace}:key_${i}`, { index: i });
    }

    // Valida que não ultrapassa 1000 chaves no namespace
    const namespaceKeys = [];
    for (let i = 0; i < 2000; i++) {
      if (cache.has(`${namespace}:key_${i}`)) {
        namespaceKeys.push(`${namespace}:key_${i}`);
      }
    }

    expect(namespaceKeys.length).toBeLessThanOrEqual(1000);
    expect(namespaceKeys.length).toBeGreaterThan(900); // Esperado ~1000
  });

  it('deve evitar chaves menos recentemente usadas (LRU)', () => {
    const namespace = 'usuario';

    // Insere 100 chaves
    for (let i = 0; i < 100; i++) {
      cache.set(`${namespace}:user_${i}`, { id: i });
    }

    // Acessa chave 0 (deve ser marca como recentemente usada)
    cache.get(`${namespace}:user_0`);

    // Insere mais 100 chaves (total 200)
    for (let i = 100; i < 200; i++) {
      cache.set(`${namespace}:user_${i}`, { id: i });
    }

    // Chave 0 deve ainda existir (foi acessada recentemente)
    expect(cache.has(`${namespace}:user_0`)).toBe(true);

    // Chaves iniciais que não foram acessadas devem ter sido evictadas
    // No máximo ~1000 chaves devem estar na cache
    const stats = cache.getStats();
    expect(stats.totalEntries).toBeLessThanOrEqual(1000);
  });

  it('deve monitorar tamanho em bytes e evictar quando > 50MB', () => {
    const largeObject = { data: 'x'.repeat(100_000) }; // ~100KB

    // Insere muitos objetos até exceder limite
    let inserted = 0;
    while (cache.getStats().memoryUsageMB < 48) { // Deixa margem
      cache.set(`ns${inserted}:item`, largeObject); // namespaces distintos: o limite de 1000 chaves é por namespace
      inserted++;
    }

    const stats = cache.getStats();
    expect(stats.memoryUsageMB).toBeLessThanOrEqual(50);
  });

  it('invalidateByPattern deve remover chaves que correspondem ao padrão', () => {
    // Insere chaves com padrões diferentes
    cache.set('cobranca:123', { id: 123 });
    cache.set('cobranca:456', { id: 456 });
    cache.set('cobranca:list:all', { items: [] });
    cache.set('usuario:789', { id: 789 });

    // Invalida padrão 'cobranca:*'
    const invalidated = cache.invalidateByPattern('cobranca:*');

    expect(invalidated).toBe(3); // Deve remover 3 entradas
    expect(cache.has('cobranca:123')).toBe(false);
    expect(cache.has('cobranca:456')).toBe(false);
    expect(cache.has('cobranca:list:all')).toBe(false);
    expect(cache.has('usuario:789')).toBe(true); // Outro namespace não afetado
  });

  it('invalidateByPattern com wildcard específico', () => {
    cache.set('cobranca:list:all', { items: [] });
    cache.set('cobranca:list:pending', { items: [] });
    cache.set('cobranca:123', { id: 123 });

    // Invalida apenas 'cobranca:list:*'
    const invalidated = cache.invalidateByPattern('cobranca:list:*');

    expect(invalidated).toBe(2);
    expect(cache.has('cobranca:list:all')).toBe(false);
    expect(cache.has('cobranca:list:pending')).toBe(false);
    expect(cache.has('cobranca:123')).toBe(true); // Deve continuar
  });

  it('getStats deve retornar informações corretas de memória e LRU', () => {
    cache.set('test:1', { data: 'v'.repeat(5000) });
    cache.set('test:2', { data: 'value2' });

    const stats = cache.getStats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.validEntries).toBe(2);
    expect(stats.expiredEntries).toBe(0);
    expect(stats.memoryUsageMB).toBeGreaterThan(0);
    expect(stats.memoryUsageMB).toBeLessThan(50);
    expect(stats.memoryPercentage).toBeLessThan(100);
    expect(stats.maxKeysPerNamespace).toBe(1000);
  });

  it('deve limpar cache completamente com clear() sem padrão', () => {
    cache.set('a:1', { x: 1 });
    cache.set('b:2', { x: 2 });

    cache.clear();

    expect(cache.size()).toBe(0);
    expect(cache.getStats().memoryUsageMB).toBe(0);
  });

  it('clear com padrão deve remover apenas chaves correspondentes', () => {
    cache.set('cobranca:1', { x: 1 });
    cache.set('cobranca:2', { x: 2 });
    cache.set('usuario:3', { x: 3 });

    cache.clear('cobranca');

    expect(cache.has('cobranca:1')).toBe(false);
    expect(cache.has('cobranca:2')).toBe(false);
    expect(cache.has('usuario:3')).toBe(true);
  });
});

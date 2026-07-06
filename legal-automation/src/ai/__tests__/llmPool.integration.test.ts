import { llmPool } from '../llmPool';

describe('LLMPool Integration Tests', () => {
  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for same prompt', () => {
      const prompt = 'Test prompt for cache consistency';

      // Generate key twice - should be identical
      const key1 = (llmPool as any).generateCacheKey(prompt);
      const key2 = (llmPool as any).generateCacheKey(prompt);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // Should be SHA256 hex
    });

    it('should generate different keys for different prompts', () => {
      const prompt1 = 'Test prompt 1';
      const prompt2 = 'Test prompt 2';

      const key1 = (llmPool as any).generateCacheKey(prompt1);
      const key2 = (llmPool as any).generateCacheKey(prompt2);

      expect(key1).not.toBe(key2);
    });

    it('should be deterministic (same hash algorithm)', () => {
      const prompt = 'Deterministic test';
      const keys = [];

      for (let i = 0; i < 5; i++) {
        keys.push((llmPool as any).generateCacheKey(prompt));
      }

      // All should be identical
      expect(new Set(keys).size).toBe(1);
    });
  });

  describe('Status Methods', () => {
    it('should return pool status', () => {
      const status = llmPool.getStatus();

      expect(status).toHaveProperty('primaryProvider');
      expect(status).toHaveProperty('fallbacks');
      expect(status).toHaveProperty('cacheSize');
      expect(status).toHaveProperty('cacheTTL');
      expect(status).toHaveProperty('offlineEnabled');
    });

    it('should return cost statistics', () => {
      const stats = llmPool.getStats();

      expect(stats).toHaveProperty('totalCost');
      expect(stats).toHaveProperty('byProvider');
      expect(stats).toHaveProperty('byTask');
      expect(typeof stats.totalCost).toBe('number');
      expect(typeof stats.byProvider).toBe('object');
      expect(typeof stats.byTask).toBe('object');
    });

    it('should return budget status', () => {
      const budgetStatus = llmPool.getCostBudgetStatus();

      expect(budgetStatus).toHaveProperty('used');
      expect(budgetStatus).toHaveProperty('budget');
      expect(budgetStatus).toHaveProperty('percentageUsed');
      expect(budgetStatus).toHaveProperty('status');

      expect(typeof budgetStatus.used).toBe('number');
      expect(typeof budgetStatus.budget).toBe('number');
      expect(typeof budgetStatus.percentageUsed).toBe('number');
      expect(['ok', 'warning', 'critical']).toContain(budgetStatus.status);
    });

    it('should show correct status based on budget usage', () => {
      const budgetStatus = llmPool.getCostBudgetStatus();

      if (budgetStatus.percentageUsed < 70) {
        expect(budgetStatus.status).toBe('ok');
      } else if (budgetStatus.percentageUsed < 90) {
        expect(budgetStatus.status).toBe('warning');
      } else {
        expect(budgetStatus.status).toBe('critical');
      }
    });
  });

  describe('Cache Operations', () => {
    it('should have cache functionality', async () => {
      // Cache operations are tested implicitly through call() method
      const status = llmPool.getStatus() as any;
      expect(status).toHaveProperty('cacheSize');
      expect(typeof status.cacheSize).toBe('number');
    });
  });

  describe('Client Initialization', () => {
    it('should have Claude as primary provider', () => {
      const status = llmPool.getStatus() as any;

      expect(status.primaryProvider).toBe('claude');
    });

    it('should have fallback providers configured', () => {
      const status = llmPool.getStatus() as any;

      expect(Array.isArray(status.fallbacks)).toBe(true);
      expect(status.fallbacks.length).toBeGreaterThan(0);
    });

    it('should have ollama configured', () => {
      const status = llmPool.getStatus() as any;

      expect(status.ollamaUrl).toBeDefined();
      expect(typeof status.ollamaUrl).toBe('string');
    });
  });

  describe('Fallback Chain Configuration', () => {
    it('should have configured fallback providers', () => {
      const status = llmPool.getStatus() as any;

      expect(Array.isArray(status.fallbacks)).toBe(true);
      expect(status.fallbacks.length).toBeGreaterThan(0);

      // Should include at least gemini and ollama
      expect(status.fallbacks).toContain('gemini');
      expect(status.fallbacks).toContain('ollama');
    });

    it('should have offline mode enabled', () => {
      const status = llmPool.getStatus() as any;

      expect(status.offlineEnabled).toBe(true);
    });
  });

  describe('Configuration Validation', () => {
    it('should have cache TTL greater than 0', () => {
      const status = llmPool.getStatus() as any;

      expect(status.cacheTTL).toBeGreaterThan(0);
    });

    it('should have reasonable cache TTL', () => {
      const status = llmPool.getStatus() as any;

      // Cache TTL should be between 1 hour and 30 days
      expect(status.cacheTTL).toBeGreaterThan(3600); // 1 hour
      expect(status.cacheTTL).toBeLessThan(2592000); // 30 days
    });

    it('should have default budget of $500', () => {
      const budgetStatus = llmPool.getCostBudgetStatus();

      expect(budgetStatus.budget).toBe(500);
    });
  });

  describe('Error Handling', () => {
    it('should handle status requests gracefully', () => {
      const status = llmPool.getStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
    });

    it('should handle clear cache command', () => {
      // Should not throw
      expect(() => llmPool.clearCache()).not.toThrow();
    });
  });
});

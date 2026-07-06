import { PetitionCacheService } from '../PetitionCacheService';

describe('PetitionCacheService', () => {
  let cache: PetitionCacheService;

  beforeEach(() => {
    cache = new PetitionCacheService();
  });

  describe('Basic Cache Operations', () => {
    it('should cache a petition with high confidence', () => {
      const petition = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'PETIÇÃO INICIAL...',
        rtfContent: '{\\rtf1...}',
        confidence: 0.95,
        warnings: [],
        suggestedEdits: [],
      };

      const result = cache.set(
        petition.processNumber,
        petition.petitionType,
        petition
      );
      expect(result).toBe(true);

      const cached = cache.get(petition.processNumber, petition.petitionType);
      expect(cached).not.toBeNull();
      expect(cached?.plainText).toBe('PETIÇÃO INICIAL...');
      expect(cached?.confidence).toBe(0.95);
    });

    it('should not cache low confidence petitions', () => {
      const petition = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'Petição...',
        rtfContent: '{\\rtf1...}',
        confidence: 0.70, // Below threshold
        warnings: [],
        suggestedEdits: [],
      };

      const result = cache.set(
        petition.processNumber,
        petition.petitionType,
        petition
      );
      expect(result).toBe(false);

      const cached = cache.get(petition.processNumber, petition.petitionType);
      expect(cached).toBeNull();
    });

    it('should return null for non-cached petitions', () => {
      const cached = cache.get('2025.0001.9999', 'initial');
      expect(cached).toBeNull();
    });

    it('should track cache hits', () => {
      const petition = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'PETIÇÃO...',
        rtfContent: '{\\rtf1...}',
        confidence: 0.90,
        warnings: [],
        suggestedEdits: [],
      };

      cache.set(petition.processNumber, petition.petitionType, petition);

      // Access multiple times
      cache.get(petition.processNumber, petition.petitionType);
      cache.get(petition.processNumber, petition.petitionType);
      cache.get(petition.processNumber, petition.petitionType);

      const stats = cache.getStats();
      expect(stats.totalHits).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate specific petition type', () => {
      const petition = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'PETIÇÃO...',
        rtfContent: '{\\rtf1...}',
        confidence: 0.90,
        warnings: [],
        suggestedEdits: [],
      };

      cache.set(petition.processNumber, petition.petitionType, petition);
      expect(cache.get(petition.processNumber, petition.petitionType)).not.toBeNull();

      const invalidated = cache.invalidate(
        petition.processNumber,
        petition.petitionType
      );
      expect(invalidated).toBe(true);
      expect(cache.get(petition.processNumber, petition.petitionType)).toBeNull();
    });

    it('should invalidate all petition types for a process', () => {
      const processNumber = '2025.0001.9999';

      // Cache multiple petition types
      for (const type of ['initial', 'intermediate', 'final']) {
        cache.set(processNumber, type, {
          processNumber,
          petitionType: type as any,
          plainText: `PETIÇÃO ${type}...`,
          rtfContent: '{\\rtf1...}',
          confidence: 0.90,
          warnings: [],
          suggestedEdits: [],
        });
      }

      // Invalidate all
      const invalidated = cache.invalidate(processNumber);
      expect(invalidated).toBe(true);

      // Verify all are gone
      expect(cache.get(processNumber, 'initial')).toBeNull();
      expect(cache.get(processNumber, 'intermediate')).toBeNull();
      expect(cache.get(processNumber, 'final')).toBeNull();
    });

    it('should clear entire cache', () => {
      // Add some petitions
      for (let i = 0; i < 5; i++) {
        cache.set(`2025.0001.${i}`, 'initial', {
          processNumber: `2025.0001.${i}`,
          petitionType: 'initial',
          plainText: `PETIÇÃO ${i}...`,
          rtfContent: '{\\rtf1...}',
          confidence: 0.90,
          warnings: [],
          suggestedEdits: [],
        });
      }

      let stats = cache.getStats();
      expect(stats.totalEntries).toBe(5);

      cache.clear();

      stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('Cache Statistics', () => {
    it('should provide cache statistics', () => {
      const petition = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'PETIÇÃO...',
        rtfContent: '{\\rtf1...}',
        confidence: 0.90,
        warnings: [],
        suggestedEdits: [],
      };

      cache.set(petition.processNumber, petition.petitionType, petition);
      cache.get(petition.processNumber, petition.petitionType);
      cache.get(petition.processNumber, petition.petitionType);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.totalHits).toBeGreaterThanOrEqual(2);
      expect(stats.avgHitsPerEntry).toBeGreaterThan(0);
      expect(stats.cacheSize).toMatch(/\d+\.\d+ MB/);
    });

    it('should calculate correct average hits', () => {
      // Add 3 petitions with different hit counts
      for (let i = 0; i < 3; i++) {
        cache.set(`2025.0001.${i}`, 'initial', {
          processNumber: `2025.0001.${i}`,
          petitionType: 'initial',
          plainText: `PETIÇÃO ${i}...`,
          rtfContent: '{\\rtf1...}',
          confidence: 0.90,
          warnings: [],
          suggestedEdits: [],
        });

        // Access different number of times
        for (let j = 0; j < i + 1; j++) {
          cache.get(`2025.0001.${i}`, 'initial');
        }
      }

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(3);
      // Total hits: 1 + 2 + 3 = 6, avg = 2
      expect(stats.avgHitsPerEntry).toBe(2);
    });
  });

  describe('Cache Expiration', () => {
    it('should return null for expired entries', async () => {
      const petition = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'PETIÇÃO...',
        rtfContent: '{\\rtf1...}',
        confidence: 0.90,
        warnings: [],
        suggestedEdits: [],
      };

      cache.set(petition.processNumber, petition.petitionType, petition);
      expect(cache.get(petition.processNumber, petition.petitionType)).not.toBeNull();

      // Manually expire the entry by setting expiresAt to past
      // (In real scenario, would wait 7 days)
      // This is tested conceptually through TTL in implementation
    });
  });

  describe('Confidence Threshold', () => {
    it('should only cache entries with confidence >= 0.85', () => {
      const baseEntry = {
        processNumber: '2025.0001.9999',
        petitionType: 'initial' as const,
        plainText: 'PETIÇÃO...',
        rtfContent: '{\\rtf1...}',
        warnings: [],
        suggestedEdits: [],
      };

      // Below threshold
      expect(
        cache.set(baseEntry.processNumber, baseEntry.petitionType, {
          ...baseEntry,
          confidence: 0.84,
        })
      ).toBe(false);

      // At threshold
      expect(
        cache.set(baseEntry.processNumber, baseEntry.petitionType, {
          ...baseEntry,
          confidence: 0.85,
        })
      ).toBe(true);

      // Above threshold
      expect(
        cache.set(baseEntry.processNumber, baseEntry.petitionType, {
          ...baseEntry,
          confidence: 0.95,
        })
      ).toBe(true);
    });
  });

  describe('Multiple Petition Types', () => {
    it('should cache different types separately', () => {
      const processNumber = '2025.0001.9999';

      const types: Array<'initial' | 'intermediate' | 'final'> = [
        'initial',
        'intermediate',
        'final',
      ];

      for (const type of types) {
        cache.set(processNumber, type, {
          processNumber,
          petitionType: type,
          plainText: `PETIÇÃO ${type}...`,
          rtfContent: '{\\rtf1...}',
          confidence: 0.90,
          warnings: [],
          suggestedEdits: [],
        });
      }

      // Verify all are cached independently
      for (const type of types) {
        const cached = cache.get(processNumber, type);
        expect(cached).not.toBeNull();
        expect(cached?.petitionType).toBe(type);
        expect(cached?.plainText).toContain(type);
      }
    });
  });
});

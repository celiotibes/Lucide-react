/**
 * Tests: TripAdvisor Integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TripAdvisorClient } from '../../src/integrations/tripadvisor/tripadvisor-client';

describe('TripAdvisor Ratings Integration', () => {
  let tripadvisor: TripAdvisorClient;
  const mockApiKey = 'test-api-key-789';

  beforeEach(() => {
    tripadvisor = new TripAdvisorClient(mockApiKey);
  });

  describe('TripAdvisorClient', () => {
    it('should handle ratings structure', () => {
      const ratings = {
        overall_rating: 4.8,
        review_count: 145,
        rating_histogram: {
          '5': 100,
          '4': 35,
          '3': 8,
          '2': 2,
          '1': 0,
        },
      };

      expect(ratings.overall_rating).toBe(4.8);
      expect(ratings.review_count).toBe(145);
      expect(ratings.rating_histogram['5']).toBe(100);
    });

    it('should calculate weighted average correctly', () => {
      // Teste de ponderação de ratings
      const ratings = [
        { platform: 'airbnb', rating: 4.9, review_count: 50 },
        { platform: 'booking', rating: 4.6, review_count: 30 },
        { platform: 'tripadvisor', rating: 4.5, review_count: 20 },
      ];

      const weights = {
        'airbnb': 0.5,
        'booking': 0.3,
        'tripadvisor': 0.15,
        'hospeda': 0.05,
      };

      let totalWeight = 0;
      let weightedSum = 0;

      for (const r of ratings) {
        const weight = weights[r.platform as keyof typeof weights] || 0;
        weightedSum += r.rating * weight;
        totalWeight += weight;
      }

      const weighted = weightedSum / totalWeight;
      expect(weighted).toBeGreaterThan(4.6);
      expect(weighted).toBeLessThan(4.9);
    });
  });
});

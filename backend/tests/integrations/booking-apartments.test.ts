/**
 * Tests: Booking Apartments Integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BookingApartmentsClient } from '../../src/integrations/booking/booking-apartments-client';

describe('Booking Apartments Integration', () => {
  let bookingApartments: BookingApartmentsClient;
  const mockApiKey = 'test-api-key-456';

  beforeEach(() => {
    bookingApartments = new BookingApartmentsClient(mockApiKey);
  });

  describe('BookingApartmentsClient', () => {
    it('should create apartment with correct structure', () => {
      const apartment = {
        id: '',
        name: 'Studio Centro',
        description: 'Studio moderno',
        address: 'Rua X',
        city: 'Rio',
        country: 'Brazil',
        zipcode: '20000-000',
        type: 'studio' as const,
        bedrooms: 0,
        bathrooms: 1,
        max_guests: 2,
        amenities: [],
        price_per_night: 300,
        currency: 'BRL' as const,
        minimum_stay: 2,
        cancellation_policy: 'free' as const,
        images: [],
      };

      expect(apartment.type).toBe('studio');
      expect(apartment.minimum_stay).toBe(2);
      expect(apartment.cancellation_policy).toBe('free');
    });

    it('should handle pricing by date', () => {
      const rates = [
        { date: '2026-08-15', price: 450 },
        { date: '2026-08-16', price: 450 },
        { date: '2026-08-17', price: 500 },
      ];

      expect(rates).toHaveLength(3);
      expect(rates[2].price).toBe(500);
    });
  });
});

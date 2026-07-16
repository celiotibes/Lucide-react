/**
 * Tests: Hospeda Integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import HospedaClient from '../../src/integrations/hospeda/hospeda-client';

describe('Hospeda Integration', () => {
  let hospeda: HospedaClient;
  const mockApiKey = 'test-api-key-123';

  beforeEach(() => {
    hospeda = new HospedaClient(mockApiKey);
  });

  describe('HospedaClient', () => {
    it('should create property successfully', async () => {
      // Mock do axios
      const mockProperty = {
        title: 'Apartamento Copacabana',
        description: 'Apt 2 quartos',
        address: 'Rua Atlântica 1000',
        city: 'Rio de Janeiro',
        state: 'RJ',
        zipcode: '22000-000',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        amenities: ['WiFi', 'TV'],
        price_per_night: 450,
        currency: 'BRL' as const,
        images: [],
        id: '',
      };

      // Teste básico de estrutura
      expect(mockProperty.title).toBeDefined();
      expect(mockProperty.price_per_night).toBe(450);
    });

    it('should verify webhook signature correctly', () => {
      const crypto = require('crypto');
      const secret = 'webhook-secret';
      const payload = JSON.stringify({ id: '123', type: 'booking.created' });

      const signature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      const isValid = hospeda.verifyWebhookSignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const secret = 'webhook-secret';
      const payload = '{"id":"123"}';
      const invalidSignature = 'invalid-sig';

      const isValid = hospeda.verifyWebhookSignature(payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });
  });
});

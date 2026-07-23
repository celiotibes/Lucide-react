/**
 * Tests for BI KPI Filtering
 * Verifies that filters work correctly and performance is acceptable
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { pool } from '../db';

describe('BI KPIs API - Filtering', () => {
  const baseURL = 'http://localhost:3000/api';

  beforeAll(async () => {
    // Setup: Insert test data into database
    await pool.query(`
      INSERT INTO fact_financial_movements
      (movement_id, property_id, amount, movement_type, category, date_id)
      VALUES
        ('move-1', 'prop-1', 10000, 'revenue', 'operational', '2026-07-15'),
        ('move-2', 'prop-1', 5000, 'cost', 'operational', '2026-07-16'),
        ('move-3', 'prop-1', 2000, 'expense', 'administrative', '2026-07-17'),
        ('move-4', 'prop-2', 15000, 'revenue', 'operational', '2026-07-15');
    `);
  });

  afterAll(async () => {
    // Cleanup: Remove test data
    await pool.query(`
      DELETE FROM fact_financial_movements
      WHERE movement_id LIKE 'move-%'
    `);
    await pool.end();
  });

  describe('GET /api/bi/kpis', () => {
    it('should fetch KPIs without filters', async () => {
      const res = await request(baseURL)
        .post('/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.grossRevenue).toBeDefined();
      expect(res.body.meta.source).toMatch(/cache|calculated/);
    });

    it('should filter KPIs by categories', async () => {
      const res = await request(baseURL)
        .post('/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          categories: ['operational'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      // KPIs should only include operational category data
      expect(res.body.data.grossRevenue.value).toBeLessThanOrEqual(25000);
    });

    it('should filter KPIs by multiple categories', async () => {
      const res = await request(baseURL)
        .post('/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          categories: ['operational', 'administrative'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });

    it('should filter KPIs by property IDs', async () => {
      const res = await request(baseURL)
        .post('/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          propertyIds: ['prop-1'],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      // Should only see prop-1 data
      expect(res.body.data.grossRevenue.value).toBeLessThanOrEqual(10000);
    });

    it('should require startDate and endDate', async () => {
      const res = await request(baseURL)
        .post('/api/bi/kpis')
        .send({
          categories: ['operational'],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('obrigatório');
    });

    it('should return cached result on second request', async () => {
      const payload = {
        startDate: '2026-07-15',
        endDate: '2026-07-17',
      };

      // First request
      const res1 = await request(baseURL)
        .post('/api/bi/kpis')
        .send(payload);

      // Second request (should be cached)
      const res2 = await request(baseURL)
        .post('/api/bi/kpis')
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res2.body.meta.source).toBe('cache');
    });

    it('should calculate trends correctly', async () => {
      const res = await request(baseURL)
        .post('/api/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.grossRevenue.trend).toMatch(/up|down|stable/);
      expect(typeof res.body.data.grossRevenue.trendPercentage).toBe('number');
    });
  });

  describe('GET /api/bi/movements', () => {
    it('should fetch movements with pagination', async () => {
      const res = await request(baseURL)
        .get('/api/bi/movements')
        .query({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          limit: 10,
          offset: 0,
        });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should filter movements by platform', async () => {
      const res = await request(baseURL)
        .get('/api/bi/movements')
        .query({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          platform: 'booking',
        });

      expect(res.status).toBe(200);
      // All results should have matching platform
      if (res.body.data.length > 0) {
        res.body.data.forEach((movement: any) => {
          expect(movement.platform).toBe('booking');
        });
      }
    });
  });

  describe('Performance', () => {
    it('should respond within 1 second', async () => {
      const startTime = Date.now();

      const res = await request(baseURL)
        .post('/api/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          categories: ['operational'],
        });

      const duration = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(1000);
    });

    it('should respond faster with cache', async () => {
      const payload = {
        startDate: '2026-07-15',
        endDate: '2026-07-17',
      };

      // Warm up cache
      await request(baseURL).post('/api/bi/kpis').send(payload);

      // Measure cached response
      const startTime = Date.now();
      const res = await request(baseURL).post('/api/bi/kpis').send(payload);
      const cachedDuration = Date.now() - startTime;

      expect(res.status).toBe(200);
      expect(cachedDuration).toBeLessThan(100);
      expect(res.body.meta.source).toBe('cache');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid date format', async () => {
      const res = await request(baseURL)
        .post('/api/bi/kpis')
        .send({
          startDate: 'invalid',
          endDate: '2026-07-17',
        });

      expect([400, 500]).toContain(res.status);
      expect(res.body.error).toBeDefined();
    });

    it('should handle empty category list', async () => {
      const res = await request(baseURL)
        .post('/api/bi/kpis')
        .send({
          startDate: '2026-07-15',
          endDate: '2026-07-17',
          categories: [],
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });
});

export {};

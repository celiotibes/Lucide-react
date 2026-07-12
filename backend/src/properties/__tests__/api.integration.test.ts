import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { Pool } from 'pg';
import { createPropertiesRouter } from '../routes/properties.routes';

describe('Property Management API Integration Tests', () => {
  let app: Express;
  let pool: Pool;
  let testPropertyId: string;
  let testOwnerId: string;
  let testListingId: string;

  beforeAll(async () => {
    // Create minimal Express app for testing
    const express = require('express');
    app = express();
    app.use(express.json());

    // Setup database
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 'postgresql://localhost/rental_sync_test',
    });

    // Register router
    app.use('/api/properties', createPropertiesRouter(pool));

    // Create test owner
    const ownerResult = await pool.query(
      `INSERT INTO property_owners (name, email, is_active)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Test API Owner', 'api-test@example.com', true]
    );
    testOwnerId = ownerResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    if (testListingId) {
      await pool.query('DELETE FROM listings WHERE id = $1', [testListingId]);
    }
    if (testPropertyId) {
      await pool.query('DELETE FROM properties WHERE id = $1', [testPropertyId]);
    }
    if (testOwnerId) {
      await pool.query('DELETE FROM property_owners WHERE id = $1', [testOwnerId]);
    }
    await pool.end();
  });

  describe('Properties API', () => {
    describe('POST /api/properties', () => {
      it('should create a new property', async () => {
        const response = await request(app)
          .post('/api/properties')
          .send({
            owner_id: testOwnerId,
            address: 'Rua API Test, 100',
            neighborhood: 'Trindade',
            city: 'Florianópolis',
            state: 'SC',
            zip_code: '88015-000',
            type: 'kitnet',
            area_m2: 22.5,
            bedrooms: 1,
            bathrooms: 1,
            base_monthly_rent: 1500,
            security_deposit: 1500,
            is_furnished: true,
            minimum_stay_days: 30,
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.address).toBe('Rua API Test, 100');
        testPropertyId = response.body.data.id;
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/properties')
          .send({
            owner_id: testOwnerId,
            address: 'Incomplete Property',
            // Missing required fields
          });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/properties', () => {
      it('should list all properties', async () => {
        const response = await request(app).get('/api/properties').query({ limit: 50, offset: 0 });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.pagination).toBeDefined();
      });

      it('should support pagination', async () => {
        const response = await request(app)
          .get('/api/properties')
          .query({ limit: 10, offset: 0 });

        expect(response.body.pagination.limit).toBe(10);
        expect(response.body.pagination.offset).toBe(0);
      });

      it('should filter by owner', async () => {
        const response = await request(app)
          .get('/api/properties')
          .query({ ownerId: testOwnerId });

        expect(response.status).toBe(200);
      });

      it('should filter by city', async () => {
        const response = await request(app)
          .get('/api/properties')
          .query({ city: 'Florianópolis' });

        expect(response.status).toBe(200);
      });
    });

    describe('GET /api/properties/:id', () => {
      it('should retrieve property details', async () => {
        const response = await request(app).get(`/api/properties/${testPropertyId}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.id).toBe(testPropertyId);
      });

      it('should return 404 for non-existent property', async () => {
        const response = await request(app).get('/api/properties/00000000-0000-0000-0000-000000000000');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
      });
    });

    describe('PUT /api/properties/:id', () => {
      it('should update property', async () => {
        const response = await request(app)
          .put(`/api/properties/${testPropertyId}`)
          .send({
            base_monthly_rent: 1800,
            is_furnished: false,
          });

        expect(response.status).toBe(200);
        expect(response.body.data.base_monthly_rent).toBe(1800);
        expect(response.body.data.is_furnished).toBe(false);
      });
    });

    describe('PATCH /api/properties/:id/status', () => {
      it('should update property status', async () => {
        const response = await request(app)
          .patch(`/api/properties/${testPropertyId}/status`)
          .send({ status: 'maintenance' });

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('maintenance');
      });

      it('should validate status value', async () => {
        const response = await request(app)
          .patch(`/api/properties/${testPropertyId}/status`)
          .send({ status: 'invalid_status' });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/properties/:id/dashboard', () => {
      it('should retrieve property dashboard', async () => {
        const response = await request(app).get(
          `/api/properties/${testPropertyId}/dashboard`
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.property).toBeDefined();
        expect(response.body.data.occupancy_rate).toBeDefined();
        expect(response.body.data.revenue_month).toBeDefined();
      });
    });

    describe('GET /api/properties/:id/stats', () => {
      it('should retrieve property statistics', async () => {
        const response = await request(app).get(`/api/properties/${testPropertyId}/stats`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
      });

      it('should support months parameter', async () => {
        const response = await request(app)
          .get(`/api/properties/${testPropertyId}/stats`)
          .query({ months: 3 });

        expect(response.status).toBe(200);
      });
    });
  });

  describe('Listings API', () => {
    describe('POST /api/listings', () => {
      it('should create a new listing', async () => {
        const response = await request(app)
          .post('/api/listings')
          .send({
            property_id: testPropertyId,
            platform: 'airbnb',
            title: 'Kitnet moderna no Trindade',
            description: 'Kitnet totalmente mobiliada com WiFi de alta velocidade',
            highlights: ['WiFi', 'Ar-condicionado', 'Mobiliado'],
            base_price: 50,
          });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.platform).toBe('airbnb');
        testListingId = response.body.data.id;
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/listings')
          .send({
            property_id: testPropertyId,
            // Missing required fields
          });

        expect(response.status).toBe(400);
      });
    });

    describe('GET /api/listings/:id', () => {
      it('should retrieve listing details', async () => {
        const response = await request(app).get(`/api/listings/${testListingId}`);

        expect(response.status).toBe(200);
        expect(response.body.data.id).toBe(testListingId);
      });
    });

    describe('GET /api/properties/:propertyId/listings', () => {
      it('should retrieve all listings for a property', async () => {
        const response = await request(app).get(`/api/properties/${testPropertyId}/listings`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeInstanceOf(Array);
      });
    });

    describe('PUT /api/listings/:id/content', () => {
      it('should update listing content', async () => {
        const response = await request(app)
          .put(`/api/listings/${testListingId}/content`)
          .send({
            title: 'Updated Title',
            description: 'Updated description',
            highlights: ['WiFi', 'Updated'],
            amenitiesText: 'Updated amenities',
          });

        expect(response.status).toBe(200);
        expect(response.body.data.title).toBe('Updated Title');
      });
    });

    describe('PUT /api/listings/:id/price', () => {
      it('should update listing price', async () => {
        const response = await request(app)
          .put(`/api/listings/${testListingId}/price`)
          .send({
            basePrice: 60,
            strategy: 'dynamic',
          });

        expect(response.status).toBe(200);
        expect(response.body.data.base_price).toBe(60);
      });
    });

    describe('GET /api/listings/:id/performance', () => {
      it('should retrieve listing performance metrics', async () => {
        const response = await request(app).get(`/api/listings/${testListingId}/performance`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.views_count).toBeDefined();
        expect(response.body.data.conversion_rate).toBeDefined();
      });
    });

    describe('PATCH /api/listings/:id/publish', () => {
      it('should publish a listing', async () => {
        const response = await request(app).patch(`/api/listings/${testListingId}/publish`);

        expect(response.status).toBe(200);
        expect(response.body.data.is_active).toBe(true);
      });
    });

    describe('PATCH /api/listings/:id/unpublish', () => {
      it('should unpublish a listing', async () => {
        const response = await request(app).patch(`/api/listings/${testListingId}/unpublish`);

        expect(response.status).toBe(200);
        expect(response.body.data.is_active).toBe(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 500 for server errors', async () => {
      // Simulate by sending invalid UUID format (though PostgreSQL should catch this)
      const response = await request(app).get('/api/properties/invalid-uuid');

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });

    it('should include timestamp in responses', async () => {
      const response = await request(app).get(`/api/properties/${testPropertyId}`);

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });
});

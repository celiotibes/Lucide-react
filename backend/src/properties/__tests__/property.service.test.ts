import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import { PropertyService } from '../services/property.service';

describe('PropertyService', () => {
  let pool: Pool;
  let service: PropertyService;
  let testOwnerId: string;
  let testPropertyId: string;

  beforeAll(async () => {
    // Setup test database connection
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || 'postgresql://localhost/rental_sync_test',
    });
    service = new PropertyService(pool);

    // Create test owner
    const ownerResult = await pool.query(
      `INSERT INTO property_owners (name, email, is_active)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Test Owner', 'test@example.com', true]
    );
    testOwnerId = ownerResult.rows[0].id;
  });

  afterAll(async () => {
    // Cleanup
    if (testOwnerId) {
      await pool.query('DELETE FROM properties WHERE owner_id = $1', [testOwnerId]);
      await pool.query('DELETE FROM property_owners WHERE id = $1', [testOwnerId]);
    }
    await pool.end();
  });

  beforeEach(async () => {
    // Clear properties before each test
    if (testOwnerId) {
      await pool.query('DELETE FROM properties WHERE owner_id = $1', [testOwnerId]);
    }
  });

  describe('createProperty', () => {
    it('should create a property with valid data', async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Rua Exemplo, 123',
        neighborhood: 'Trindade',
        city: 'Florianópolis',
        state: 'SC',
        zip_code: '88015-000',
        type: 'kitnet',
        area_m2: 22.5,
        bedrooms: 1,
        bathrooms: 1,
        max_occupancy: 1,
        target_occupancy: '1 pessoa',
        base_monthly_rent: 1500,
        security_deposit: 1500,
        is_furnished: true,
        minimum_stay_days: 30,
      };

      const property = await service.createProperty(data);

      expect(property).toBeDefined();
      expect(property.id).toBeDefined();
      expect(property.address).toBe(data.address);
      expect(property.area_m2).toBe(data.area_m2);
      expect(property.status).toBe('active');
      testPropertyId = property.id;
    });

    it('should set default status to active', async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Rua Teste, 456',
        city: 'Florianópolis',
        state: 'SC',
        type: 'apartment',
        area_m2: 45,
        bedrooms: 2,
        bathrooms: 1,
        base_monthly_rent: 2500,
        security_deposit: 2500,
        is_furnished: true,
      };

      const property = await service.createProperty(data);
      expect(property.status).toBe('active');
    });
  });

  describe('getPropertyById', () => {
    beforeEach(async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Test Property',
        city: 'Florianópolis',
        state: 'SC',
        type: 'kitnet',
        area_m2: 25,
        bedrooms: 1,
        bathrooms: 1,
        base_monthly_rent: 1500,
        is_furnished: true,
      };
      const result = await service.createProperty(data);
      testPropertyId = result.id;
    });

    it('should retrieve a property by ID', async () => {
      const property = await service.getPropertyById(testPropertyId);

      expect(property).toBeDefined();
      expect(property?.id).toBe(testPropertyId);
      expect(property?.owner_id).toBe(testOwnerId);
    });

    it('should return null for non-existent property', async () => {
      const property = await service.getPropertyById('00000000-0000-0000-0000-000000000000');
      expect(property).toBeNull();
    });
  });

  describe('updateProperty', () => {
    beforeEach(async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Original Address',
        city: 'Florianópolis',
        state: 'SC',
        type: 'kitnet',
        area_m2: 22,
        bedrooms: 1,
        bathrooms: 1,
        base_monthly_rent: 1500,
        is_furnished: true,
      };
      const result = await service.createProperty(data);
      testPropertyId = result.id;
    });

    it('should update property data', async () => {
      const updates = {
        address: 'Updated Address',
        base_monthly_rent: 1800,
      };

      const updated = await service.updateProperty(testPropertyId, updates);

      expect(updated.address).toBe('Updated Address');
      expect(updated.base_monthly_rent).toBe(1800);
    });

    it('should throw error for non-existent property', async () => {
      const updates = { address: 'New Address' };

      await expect(
        service.updateProperty('00000000-0000-0000-0000-000000000000', updates)
      ).rejects.toThrow('not found');
    });
  });

  describe('updatePropertyStatus', () => {
    beforeEach(async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Status Test',
        city: 'Florianópolis',
        state: 'SC',
        type: 'kitnet',
        area_m2: 22,
        bedrooms: 1,
        bathrooms: 1,
        base_monthly_rent: 1500,
        is_furnished: true,
      };
      const result = await service.createProperty(data);
      testPropertyId = result.id;
    });

    it('should update property status', async () => {
      const updated = await service.updatePropertyStatus(testPropertyId, 'maintenance');
      expect(updated.status).toBe('maintenance');
    });

    it('should support all valid statuses', async () => {
      const statuses: Array<'active' | 'maintenance' | 'off_season' | 'archived'> = [
        'active',
        'maintenance',
        'off_season',
        'archived',
      ];

      for (const status of statuses) {
        const updated = await service.updatePropertyStatus(testPropertyId, status);
        expect(updated.status).toBe(status);
      }
    });
  });

  describe('getPropertiesByOwnerId', () => {
    beforeEach(async () => {
      // Create multiple properties
      for (let i = 1; i <= 3; i++) {
        await service.createProperty({
          owner_id: testOwnerId,
          address: `Address ${i}`,
          city: 'Florianópolis',
          state: 'SC',
          type: 'kitnet',
          area_m2: 22,
          bedrooms: 1,
          bathrooms: 1,
          base_monthly_rent: 1500,
          is_furnished: true,
        });
      }
    });

    it('should retrieve all properties for an owner', async () => {
      const properties = await service.getPropertiesByOwnerId(testOwnerId);
      expect(properties.length).toBe(3);
    });

    it('should support pagination', async () => {
      const page1 = await service.getPropertiesByOwnerId(testOwnerId, 2, 0);
      expect(page1.length).toBe(2);

      const page2 = await service.getPropertiesByOwnerId(testOwnerId, 2, 2);
      expect(page2.length).toBe(1);
    });
  });

  describe('deleteProperty', () => {
    beforeEach(async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Delete Test',
        city: 'Florianópolis',
        state: 'SC',
        type: 'kitnet',
        area_m2: 22,
        bedrooms: 1,
        bathrooms: 1,
        base_monthly_rent: 1500,
        is_furnished: true,
      };
      const result = await service.createProperty(data);
      testPropertyId = result.id;
    });

    it('should delete a property', async () => {
      await service.deleteProperty(testPropertyId);

      const property = await service.getPropertyById(testPropertyId);
      expect(property).toBeNull();
    });

    it('should throw error for non-existent property', async () => {
      await expect(
        service.deleteProperty('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('not found');
    });
  });

  describe('getPropertyStats', () => {
    beforeEach(async () => {
      const data = {
        owner_id: testOwnerId,
        address: 'Stats Test',
        city: 'Florianópolis',
        state: 'SC',
        type: 'kitnet',
        area_m2: 22,
        bedrooms: 1,
        bathrooms: 1,
        base_monthly_rent: 1500,
        is_furnished: true,
      };
      const result = await service.createProperty(data);
      testPropertyId = result.id;

      // Insert sample stats
      await pool.query(
        `INSERT INTO property_monthly_stats
         (property_id, year_month, days_occupied, days_available, occupancy_rate, total_revenue)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [testPropertyId, '2024-01', 24, 30, 0.8, 3600]
      );
    });

    it('should retrieve property statistics', async () => {
      const stats = await service.getPropertyStats(testPropertyId, 1);

      expect(stats).toBeDefined();
      expect(stats.stats).toBeInstanceOf(Array);
      expect(stats.total_months).toBeGreaterThan(0);
    });
  });
});

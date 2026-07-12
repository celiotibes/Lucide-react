import { Pool } from 'pg';
import { Property, PropertyWithListings, PropertyDashboard } from '../types';
import { Logger } from '../../shared/logger';

export class PropertyService {
  constructor(private pool: Pool) {}

  async getPropertyById(id: string): Promise<Property | null> {
    const result = await this.pool.query(
      'SELECT * FROM properties WHERE id = $1',
      [id]
    );
    Logger.info('property-service', 'Retrieved property', { id, found: result.rows.length > 0 });
    return result.rows[0] || null;
  }

  async getPropertiesByOwnerId(ownerId: string, limit = 50, offset = 0): Promise<Property[]> {
    const result = await this.pool.query(
      'SELECT * FROM properties WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [ownerId, limit, offset]
    );
    Logger.info('property-service', 'Retrieved properties by owner', { ownerId, count: result.rows.length });
    return result.rows;
  }

  async getPropertiesByCity(city: string, limit = 50, offset = 0): Promise<Property[]> {
    const result = await this.pool.query(
      'SELECT * FROM properties WHERE city = $1 AND status = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
      [city, 'active', limit, offset]
    );
    return result.rows;
  }

  async getAllProperties(limit = 100, offset = 0): Promise<Property[]> {
    const result = await this.pool.query(
      'SELECT * FROM properties WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      ['active', limit, offset]
    );
    return result.rows;
  }

  async createProperty(data: Partial<Property>): Promise<Property> {
    const {
      owner_id,
      unit_type_id,
      internal_code,
      address,
      neighborhood,
      city,
      state,
      zip_code,
      type,
      area_m2,
      bedrooms,
      bathrooms,
      max_occupancy,
      target_occupancy,
      amenities,
      base_monthly_rent,
      security_deposit,
      is_furnished,
      minimum_stay_days,
    } = data;

    const result = await this.pool.query(
      `INSERT INTO properties (
        owner_id, unit_type_id, internal_code, address, neighborhood, city, state, zip_code,
        type, area_m2, bedrooms, bathrooms, max_occupancy, target_occupancy, amenities,
        base_monthly_rent, security_deposit, is_furnished, minimum_stay_days
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *`,
      [
        owner_id,
        unit_type_id,
        internal_code,
        address,
        neighborhood,
        city,
        state,
        zip_code,
        type,
        area_m2,
        bedrooms,
        bathrooms,
        max_occupancy,
        target_occupancy,
        JSON.stringify(amenities),
        base_monthly_rent,
        security_deposit,
        is_furnished,
        minimum_stay_days,
      ]
    );

    Logger.info('property-service', 'Created property', { id: result.rows[0].id, code: internal_code });
    return result.rows[0];
  }

  async updateProperty(id: string, data: Partial<Property>): Promise<Property> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);
    const query = `UPDATE properties SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) {
      throw new Error(`Property ${id} not found`);
    }

    Logger.info('property-service', 'Updated property', { id });
    return result.rows[0];
  }

  async updatePropertyStatus(id: string, status: 'active' | 'maintenance' | 'off_season' | 'archived'): Promise<Property> {
    const result = await this.pool.query(
      'UPDATE properties SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Property ${id} not found`);
    }

    Logger.info('property-service', 'Updated property status', { id, status });
    return result.rows[0];
  }

  async getPropertyWithListings(id: string): Promise<PropertyWithListings | null> {
    const propertyResult = await this.pool.query(
      'SELECT * FROM properties WHERE id = $1',
      [id]
    );

    if (propertyResult.rows.length === 0) {
      return null;
    }

    const listingsResult = await this.pool.query(
      'SELECT * FROM listings WHERE property_id = $1 ORDER BY platform ASC',
      [id]
    );

    const statsResult = await this.pool.query(
      'SELECT * FROM property_monthly_stats WHERE property_id = $1 ORDER BY year_month DESC LIMIT 12',
      [id]
    );

    const occupancyResult = await this.pool.query(
      'SELECT COUNT(CASE WHEN status = $1 THEN 1 END)::numeric / COUNT(*) as rate FROM occupancy_history WHERE property_id = $2 AND date >= NOW() - INTERVAL $3',
      ['occupied', id, '30 days']
    );

    const ratingResult = await this.pool.query(
      'SELECT COALESCE(AVG(average_rating), 0) as avg_rating FROM property_monthly_stats WHERE property_id = $1',
      [id]
    );

    const property = propertyResult.rows[0];
    return {
      ...property,
      listings: listingsResult.rows,
      monthly_stats: statsResult.rows,
      current_occupancy_rate: occupancyResult.rows[0]?.rate || 0,
      average_rating: ratingResult.rows[0]?.avg_rating || 0,
    };
  }

  async getPropertyDashboard(id: string): Promise<PropertyDashboard | null> {
    const property = await this.getPropertyById(id);
    if (!property) return null;

    const listingsResult = await this.pool.query(
      'SELECT COUNT(*) as count FROM listings WHERE property_id = $1',
      [id]
    );

    const thisMonthStats = await this.pool.query(
      'SELECT * FROM property_monthly_stats WHERE property_id = $1 AND year_month = $2',
      [id, new Date().toISOString().slice(0, 7)]
    );

    const currentStats = thisMonthStats.rows[0] || {
      occupancy_rate: 0,
      total_revenue: 0,
      leads_generated: 0,
      conversion_rate: 0,
      average_rating: 0,
      reviews_count: 0,
    };

    const revenueResult = await this.pool.query(
      `SELECT (area_m2 * base_monthly_rent * 0.8 / 30) * 30 as potential FROM properties WHERE id = $1`,
      [id]
    );

    const listingsSyncResult = await this.pool.query(
      'SELECT platform, sync_status FROM listings WHERE property_id = $1',
      [id]
    );

    const syncStatus: Record<string, 'synced' | 'pending' | 'error'> = {};
    listingsSyncResult.rows.forEach((row) => {
      syncStatus[row.platform] = row.sync_status;
    });

    return {
      property,
      occupancy_rate: currentStats.occupancy_rate || 0,
      revenue_month: currentStats.total_revenue || 0,
      revenue_potential: revenueResult.rows[0]?.potential || 0,
      leads_month: currentStats.leads_generated || 0,
      conversion_rate: currentStats.conversion_rate || 0,
      average_rating: currentStats.average_rating || 0,
      reviews_count: currentStats.reviews_count || 0,
      listings_sync_status: syncStatus,
    };
  }

  async deleteProperty(id: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM properties WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Property ${id} not found`);
    }

    Logger.info('property-service', 'Deleted property', { id });
  }

  async getPropertyStats(id: string, months = 12): Promise<Record<string, unknown>> {
    const result = await this.pool.query(
      `SELECT
        year_month,
        occupancy_rate,
        total_revenue,
        average_nightly_rate,
        leads_generated,
        tours_completed,
        bookings_closed,
        conversion_rate,
        average_rating
      FROM property_monthly_stats
      WHERE property_id = $1 AND year_month >= (DATE_TRUNC('month', NOW()) - INTERVAL $2)::text
      ORDER BY year_month DESC`,
      [id, `${months} months`]
    );

    return {
      stats: result.rows,
      total_months: result.rows.length,
      average_occupancy: result.rows.reduce((sum, row) => sum + (row.occupancy_rate || 0), 0) / result.rows.length,
      total_revenue: result.rows.reduce((sum, row) => sum + (row.total_revenue || 0), 0),
    };
  }
}

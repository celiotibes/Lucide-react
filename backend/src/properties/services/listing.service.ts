import { Pool } from 'pg';
import { Listing, ListingCreateInput } from '../types';
import { Logger } from '../../shared/logger';

export class ListingService {
  constructor(private pool: Pool) {}

  async getListingById(id: string): Promise<Listing | null> {
    const result = await this.pool.query(
      'SELECT * FROM listings WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getListingsByPropertyId(propertyId: string): Promise<Listing[]> {
    const result = await this.pool.query(
      'SELECT * FROM listings WHERE property_id = $1 ORDER BY platform ASC',
      [propertyId]
    );
    return result.rows;
  }

  async getListingsByPlatform(platform: string, limit = 50, offset = 0): Promise<Listing[]> {
    const result = await this.pool.query(
      'SELECT * FROM listings WHERE platform = $1 AND is_active = true ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [platform, limit, offset]
    );
    return result.rows;
  }

  async getPendingSyncListings(): Promise<Listing[]> {
    const result = await this.pool.query(
      `SELECT * FROM listings
       WHERE sync_status IN ('pending', 'error') AND is_active = true
       ORDER BY updated_at ASC`
    );
    Logger.info('listing-service', 'Retrieved pending listings for sync', { count: result.rows.length });
    return result.rows;
  }

  async createListing(data: ListingCreateInput): Promise<Listing> {
    const {
      property_id,
      platform,
      title,
      description,
      highlights,
      base_price,
      price_strategy,
    } = data;

    const result = await this.pool.query(
      `INSERT INTO listings (
        property_id, platform, title, description, highlights, base_price, price_strategy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (property_id, platform) DO UPDATE SET
        title = $3, description = $4, highlights = $5, updated_at = NOW()
      RETURNING *`,
      [
        property_id,
        platform,
        title,
        description,
        JSON.stringify(highlights),
        base_price,
        price_strategy || 'static',
      ]
    );

    Logger.info('listing-service', 'Created/updated listing', {
      id: result.rows[0].id,
      platform,
      property_id,
    });
    return result.rows[0];
  }

  async updateListing(id: string, data: Partial<Listing>): Promise<Listing> {
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

    updates.push(`updated_at = NOW()`);
    values.push(id);
    const query = `UPDATE listings SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) {
      throw new Error(`Listing ${id} not found`);
    }

    return result.rows[0];
  }

  async updateListingContent(
    id: string,
    title: string,
    description: string,
    highlights: string[],
    amenitiesText: string
  ): Promise<Listing> {
    const startTime = Date.now();
    Logger.debug('listing-service', 'Updating listing content', { id, titleLength: title.length });

    const result = await this.pool.query(
      `UPDATE listings SET
        title = $1, description = $2, highlights = $3, amenities_text = $4,
        updated_at = NOW(), sync_status = 'pending'
      WHERE id = $5 RETURNING *`,
      [title, description, JSON.stringify(highlights), amenitiesText, id]
    );

    if (result.rows.length === 0) {
      Logger.error('listing-service', 'Listing not found for content update', new Error(`Listing ${id} not found`));
      throw new Error(`Listing ${id} not found`);
    }

    const duration = Date.now() - startTime;
    Logger.time('listing-service', 'Listing content updated', duration, { id });
    return result.rows[0];
  }

  async updateListingPricing(id: string, basePrice: number, strategy: 'static' | 'dynamic' | 'seasonal'): Promise<Listing> {
    const startTime = Date.now();
    Logger.debug('listing-service', 'Updating listing pricing', { id, basePrice, strategy });

    const result = await this.pool.query(
      `UPDATE listings SET
        base_price = $1, price_strategy = $2, updated_at = NOW(), sync_status = 'pending'
      WHERE id = $3 RETURNING *`,
      [basePrice, strategy, id]
    );

    if (result.rows.length === 0) {
      Logger.error('listing-service', 'Listing not found for pricing update', new Error(`Listing ${id} not found`));
      throw new Error(`Listing ${id} not found`);
    }

    const duration = Date.now() - startTime;
    Logger.time('listing-service', 'Listing pricing updated', duration, { id, basePrice, strategy });
    return result.rows[0];
  }

  async updateSyncStatus(
    id: string,
    status: 'synced' | 'pending' | 'error',
    errorMessage?: string
  ): Promise<Listing> {
    const result = await this.pool.query(
      `UPDATE listings SET
        sync_status = $1, sync_error_message = $2, synced_at = NOW(), updated_at = NOW()
      WHERE id = $3 RETURNING *`,
      [status, errorMessage || null, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Listing ${id} not found`);
    }

    if (status === 'synced') {
      Logger.info('listing-service', 'Listing synced successfully', { id });
    } else if (status === 'error') {
      Logger.warn('listing-service', 'Listing sync error', { id, error: errorMessage });
    }

    return result.rows[0];
  }

  async publishListing(id: string): Promise<Listing> {
    const result = await this.pool.query(
      `UPDATE listings SET
        is_active = true, published_at = NOW(), updated_at = NOW(), sync_status = 'pending'
      WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Listing ${id} not found`);
    }

    Logger.info('listing-service', 'Published listing', { id });
    return result.rows[0];
  }

  async unpublishListing(id: string): Promise<Listing> {
    const result = await this.pool.query(
      `UPDATE listings SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Listing ${id} not found`);
    }

    Logger.info('listing-service', 'Unpublished listing', { id });
    return result.rows[0];
  }

  async incrementViewsCount(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE listings SET views_count = views_count + 1 WHERE id = $1',
      [id]
    );
  }

  async incrementClicksCount(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE listings SET clicks_count = clicks_count + 1 WHERE id = $1',
      [id]
    );
  }

  async recordBooking(id: string): Promise<void> {
    const listingResult = await this.pool.query(
      `UPDATE listings SET
        bookings_count = bookings_count + 1,
        conversion_rate = bookings_count::numeric / NULLIF(views_count, 0)
      WHERE id = $1 RETURNING views_count, bookings_count`,
      [id]
    );

    if (listingResult.rows.length > 0) {
      const { views_count, bookings_count } = listingResult.rows[0];
      Logger.info('listing-service', 'Recorded booking', {
        id,
        bookings: bookings_count,
        views: views_count,
      });
    }
  }

  async getListingPerformance(id: string): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    Logger.debug('listing-service', 'Getting listing performance metrics', { id });

    const result = await this.pool.query(
      `SELECT
        views_count,
        clicks_count,
        bookings_count,
        CASE WHEN views_count > 0 THEN (clicks_count::numeric / views_count) ELSE 0 END as ctr,
        CASE WHEN views_count > 0 THEN (bookings_count::numeric / views_count) ELSE 0 END as conversion_rate,
        CASE WHEN clicks_count > 0 THEN (bookings_count::numeric / clicks_count) ELSE 0 END as booking_rate
      FROM listings WHERE id = $1`,
      [id]
    );

    const performance = result.rows[0] || {
      views_count: 0,
      clicks_count: 0,
      bookings_count: 0,
      ctr: 0,
      conversion_rate: 0,
      booking_rate: 0,
    };

    const duration = Date.now() - startTime;
    Logger.time('listing-service', 'Performance metrics retrieved', duration, { id });

    return performance;
  }

  async deleteListing(id: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM listings WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Listing ${id} not found`);
    }

    Logger.info('listing-service', 'Deleted listing', { id });
  }

  async getListingsForSync(limit = 50): Promise<Listing[]> {
    const result = await this.pool.query(
      `SELECT * FROM listings
       WHERE sync_status = 'pending' OR (
         sync_status = 'error' AND updated_at < NOW() - INTERVAL '1 hour'
       )
       ORDER BY updated_at ASC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

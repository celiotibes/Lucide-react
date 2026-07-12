import { Pool } from 'pg';
import { Listing } from '../types';
import { Logger } from '../../shared/logger';

interface PricingInput {
  occupancyRate: number;
  basePrice: number;
  minPrice?: number;
  maxPrice?: number;
  seasonalPeriod: 'high' | 'medium' | 'low';
  marketSegment: 'student' | 'professional' | 'tourist' | 'family';
  currentPrice?: number;
}

export class PricingService {
  constructor(private pool: Pool) {}

  async calculateOptimalPrice(input: PricingInput): Promise<number> {
    const {
      occupancyRate,
      basePrice,
      minPrice = basePrice * 0.7,
      maxPrice = basePrice * 1.5,
      seasonalPeriod,
      marketSegment,
    } = input;

    let multiplier = 1.0;

    // Occupancy-based multiplier
    if (occupancyRate > 0.85) {
      multiplier *= 1.35; // High occupancy = premium pricing
    } else if (occupancyRate > 0.7) {
      multiplier *= 1.15;
    } else if (occupancyRate < 0.4) {
      multiplier *= 0.85; // Low occupancy = discount
    } else if (occupancyRate < 0.55) {
      multiplier *= 0.95;
    }

    // Seasonal multiplier
    const seasonalMultipliers: Record<string, number> = {
      high: 1.25,
      medium: 1.0,
      low: 0.85,
    };
    multiplier *= seasonalMultipliers[seasonalPeriod] || 1.0;

    // Market segment multiplier (tourist properties can command premium)
    const segmentMultipliers: Record<string, number> = {
      tourist: 1.2,
      professional: 1.0,
      student: 0.9,
      family: 0.95,
    };
    multiplier *= segmentMultipliers[marketSegment] || 1.0;

    let optimizedPrice = basePrice * multiplier;

    // Clamp to min/max bounds
    optimizedPrice = Math.max(minPrice, Math.min(maxPrice, optimizedPrice));

    // Round to nearest 5
    optimizedPrice = Math.round(optimizedPrice / 5) * 5;

    return Math.max(minPrice, optimizedPrice);
  }

  async updateListingDynamicPrice(listingId: string, newPrice: number, changePercentage: number): Promise<Listing> {
    const result = await this.pool.query(
      `UPDATE listings SET
        base_price = $1, price_strategy = 'dynamic', updated_at = NOW(), sync_status = 'pending'
      WHERE id = $2 RETURNING *`,
      [newPrice, listingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Listing ${listingId} not found`);
    }

    Logger.info('pricing-service', 'Updated dynamic price', {
      id: listingId,
      newPrice,
      changePercentage,
    });

    return result.rows[0];
  }

  async analyzePricing(propertyId: string): Promise<Record<string, unknown>> {
    // Get property data
    const propertyResult = await this.pool.query(
      'SELECT base_monthly_rent FROM properties WHERE id = $1',
      [propertyId]
    );

    if (propertyResult.rows.length === 0) {
      throw new Error(`Property ${propertyId} not found`);
    }

    const baseMonthlyRent = propertyResult.rows[0].base_monthly_rent;
    const nightlyBase = baseMonthlyRent / 30;

    // Get occupancy stats for last 30 days
    const occupancyResult = await this.pool.query(
      `SELECT
        COUNT(CASE WHEN status = 'occupied' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) as occupancy_rate
      FROM occupancy_history
      WHERE property_id = $1 AND date >= NOW() - INTERVAL '30 days'`,
      [propertyId]
    );

    const occupancyRate = occupancyResult.rows[0]?.occupancy_rate || 0;

    // Get current listings
    const listingsResult = await this.pool.query(
      `SELECT * FROM listings WHERE property_id = $1`,
      [propertyId]
    );

    const listings = listingsResult.rows;

    // Calculate recommendations per platform
    const recommendations = listings.map((listing: Listing) => {
      const currentPrice = listing.base_price;
      const priceChange = ((currentPrice - nightlyBase) / nightlyBase) * 100;

      return {
        platform: listing.platform,
        currentPrice,
        recommendedPrice: this.recommendPrice(nightlyBase, occupancyRate),
        priceChange: parseFloat(priceChange.toFixed(2)),
        occupancyRate: parseFloat((occupancyRate * 100).toFixed(1)),
        viewsToBookingsRate: listing.bookings_count && listing.views_count
          ? parseFloat(((listing.bookings_count / listing.views_count) * 100).toFixed(2))
          : 0,
      };
    });

    return {
      propertyId,
      baseNightlyRate: parseFloat(nightlyBase.toFixed(2)),
      currentOccupancy: parseFloat((occupancyRate * 100).toFixed(1)),
      recommendations,
      lastUpdated: new Date().toISOString(),
    };
  }

  private recommendPrice(nightlyBase: number, occupancyRate: number): number {
    let multiplier = 1.0;

    if (occupancyRate > 0.85) {
      multiplier = 1.35;
    } else if (occupancyRate > 0.7) {
      multiplier = 1.15;
    } else if (occupancyRate < 0.4) {
      multiplier = 0.85;
    } else if (occupancyRate < 0.55) {
      multiplier = 0.95;
    }

    const recommended = nightlyBase * multiplier;
    return Math.round(recommended / 5) * 5;
  }

  async applySeasonalPricing(
    propertyId: string,
    seasonalPeriod: 'high' | 'medium' | 'low',
    multiplier: number
  ): Promise<void> {
    const propertyResult = await this.pool.query(
      'SELECT base_monthly_rent FROM properties WHERE id = $1',
      [propertyId]
    );

    if (propertyResult.rows.length === 0) {
      throw new Error(`Property ${propertyId} not found`);
    }

    const baseMonthlyRent = propertyResult.rows[0].base_monthly_rent;
    const nightlyBase = baseMonthlyRent / 30;
    const seasonalPrice = Math.round((nightlyBase * multiplier) / 5) * 5;

    // Update all active listings for this property
    await this.pool.query(
      `UPDATE listings SET
        base_price = $1, price_strategy = 'seasonal', updated_at = NOW(), sync_status = 'pending'
      WHERE property_id = $2 AND is_active = true`,
      [seasonalPrice, propertyId]
    );

    Logger.info('pricing-service', 'Applied seasonal pricing', {
      propertyId,
      seasonalPeriod,
      multiplier,
      newPrice: seasonalPrice,
    });
  }

  async getBulkPricingRecommendations(properties: string[]): Promise<Record<string, unknown>[]> {
    const recommendations = await Promise.all(
      properties.map((propertyId) => this.analyzePricing(propertyId))
    );
    return recommendations;
  }

  async getCompetitiveAnalysis(propertyId: string, city: string): Promise<Record<string, unknown>> {
    // Get properties in same city
    const competitorResult = await this.pool.query(
      `SELECT
        AVG(l.base_price) as avg_price,
        MIN(l.base_price) as min_price,
        MAX(l.base_price) as max_price,
        COUNT(DISTINCT l.property_id) as competitor_count
      FROM listings l
      JOIN properties p ON l.property_id = p.id
      WHERE p.city = $1 AND l.property_id != $2 AND l.is_active = true`,
      [city, propertyId]
    );

    const propertyResult = await this.pool.query(
      `SELECT l.base_price FROM listings l WHERE l.property_id = $1 LIMIT 1`,
      [propertyId]
    );

    const ourPrice = propertyResult.rows[0]?.base_price || 0;
    const competitorData = competitorResult.rows[0];

    return {
      propertyId,
      city,
      ourPrice: parseFloat(ourPrice.toFixed(2)),
      competitorAvg: parseFloat((competitorData.avg_price || 0).toFixed(2)),
      competitorMin: parseFloat((competitorData.min_price || 0).toFixed(2)),
      competitorMax: parseFloat((competitorData.max_price || 0).toFixed(2)),
      competitorCount: competitorData.competitor_count || 0,
      pricePosition: ourPrice > competitorData.avg_price ? 'premium' : 'competitive',
      recommendedAdjustment: this.calculatePriceAdjustment(ourPrice, competitorData.avg_price),
    };
  }

  private calculatePriceAdjustment(ourPrice: number, competitorAvg: number): string {
    if (!competitorAvg) return 'insufficient data';

    const difference = ((ourPrice - competitorAvg) / competitorAvg) * 100;

    if (difference > 10) {
      return `reduce by ${Math.round(Math.abs(difference))}%`;
    } else if (difference < -10) {
      return `increase by ${Math.round(Math.abs(difference))}%`;
    }
    return 'maintain current price';
  }
}

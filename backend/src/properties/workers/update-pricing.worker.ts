import { Queue, Worker } from 'bullmq';
import { Pool } from 'pg';
import { PropertyService } from '../services/property.service';
import { ListingService } from '../services/listing.service';
import { PricingService } from '../services/pricing.service';
import { Logger } from '../../shared/logger';

interface PricingUpdateJob {
  propertyId: string;
  listingId?: string;
}

export function createUpdatePricingWorker(pool: Pool, redisConnection: unknown): Worker {
  const propertyService = new PropertyService(pool);
  const listingService = new ListingService(pool);
  const pricingService = new PricingService(pool);

  const worker = new Worker(
    'update-pricing',
    async (job) => {
      Logger.info('update-pricing-worker', 'Processing pricing update', {
        jobId: job.id,
        propertyId: job.data.propertyId,
      });

      try {
        const { propertyId, listingId } = job.data as PricingUpdateJob;

        // Get property data
        const property = await propertyService.getPropertyById(propertyId);
        if (!property) {
          throw new Error(`Property ${propertyId} not found`);
        }

        // Get occupancy data for dynamic pricing
        const occupancyResult = await pool.query(
          `SELECT
            COUNT(CASE WHEN status = 'occupied' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) as occupancy_rate
          FROM occupancy_history
          WHERE property_id = $1 AND date >= NOW() - INTERVAL '30 days'`,
          [propertyId]
        );

        const occupancyRate = occupancyResult.rows[0]?.occupancy_rate || 0;

        // Get strategy for market segment
        const strategyResult = await pool.query(
          `SELECT market_segment, seasonal_period FROM listing_strategies
           WHERE listing_id IN (SELECT id FROM listings WHERE property_id = $1)
           LIMIT 1`,
          [propertyId]
        );

        const strategy = strategyResult.rows[0];
        const marketSegment = strategy?.market_segment || 'tourist';
        const seasonalPeriod = strategy?.seasonal_period || 'medium';

        // Calculate optimal price
        const optimalPrice = await pricingService.calculateOptimalPrice({
          occupancyRate,
          basePrice: property.base_monthly_rent / 30,
          minPrice: (property.base_monthly_rent / 30) * 0.7,
          maxPrice: (property.base_monthly_rent / 30) * 1.5,
          seasonalPeriod: seasonalPeriod as 'high' | 'medium' | 'low',
          marketSegment: marketSegment as 'student' | 'professional' | 'tourist' | 'family',
        });

        // Get current listings
        const listings = await listingService.getListingsByPropertyId(propertyId);

        // Update pricing for relevant listings
        for (const listing of listings) {
          if (listingId && listing.id !== listingId) {
            continue; // Skip if specific listing was requested
          }

          if (listing.price_strategy === 'dynamic') {
            const changePercentage = ((optimalPrice - listing.base_price) / listing.base_price) * 100;

            if (Math.abs(changePercentage) > 2) {
              // Only update if change > 2%
              await pricingService.updateListingDynamicPrice(
                listing.id,
                optimalPrice,
                parseFloat(changePercentage.toFixed(2))
              );

              Logger.info('update-pricing-worker', 'Updated listing price', {
                listingId: listing.id,
                oldPrice: listing.base_price,
                newPrice: optimalPrice,
                changePercentage,
                occupancyRate: parseFloat((occupancyRate * 100).toFixed(1)),
              });
            }
          }
        }

        return {
          success: true,
          propertyId,
          updatedListings: listings.length,
          occupancyRate: parseFloat((occupancyRate * 100).toFixed(1)),
        };
      } catch (error) {
        Logger.error('update-pricing-worker', 'Failed to update pricing', error);
        throw error;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 3,
    }
  );

  worker.on('failed', (job, err) => {
    if (job) {
      Logger.error('update-pricing-worker', 'Job failed', {
        jobId: job.id,
        error: err.message,
      });
    }
  });

  worker.on('completed', (job) => {
    Logger.info('update-pricing-worker', 'Job completed', { jobId: job.id });
  });

  return worker;
}

export async function enqueueUpdatePricing(
  queue: Queue,
  propertyId: string,
  listingId?: string
): Promise<void> {
  await queue.add(
    'update-price',
    {
      propertyId,
      listingId,
    } as PricingUpdateJob,
    {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
    }
  );

  Logger.info('update-pricing-worker', 'Enqueued pricing update', { propertyId });
}

export async function schedulePricingUpdates(
  queue: Queue,
  pool: Pool
): Promise<void> {
  // Get all active properties
  const result = await pool.query(
    'SELECT id FROM properties WHERE status = $1',
    ['active']
  );

  for (const row of result.rows) {
    await enqueueUpdatePricing(queue, row.id);
  }

  Logger.info('update-pricing-worker', 'Scheduled pricing updates', {
    count: result.rows.length,
  });
}

/**
 * Worker: Sincronizar ratings do TripAdvisor
 * Afeta dynamic pricing (fator rating aumenta 8% para 4.8+)
 */

import { Worker, Job } from 'bullmq';
import { pool } from '../db/pool';
import { redis } from '../cache/redis';
import { Logger } from '../shared/logger';
import { TripAdvisorClient } from '../integrations/tripadvisor/tripadvisor-client';
import { ratingCache } from '../shared/cache';

const logger = Logger.getLogger('SyncTripAdvisorRatingsWorker');

interface SyncTripAdvisorJob {
  propertyId: string;
  userId: string;
}

const worker = new Worker(
  'sync-tripadvisor-ratings',
  async (job: Job<SyncTripAdvisorJob>) => {
    const { propertyId, userId } = job.data;
    const startTime = Date.now();

    try {
      logger.info('Starting TripAdvisor ratings sync', { propertyId });

      const tripadvisor = new TripAdvisorClient(
        process.env.TRIPADVISOR_API_KEY || ''
      );

      // Buscar listing TripAdvisor
      const listing = await getPropertyListing(propertyId, 'tripadvisor');
      if (!listing) {
        logger.warn('No TripAdvisor listing found', { propertyId });
        return { status: 'skipped' };
      }

      // Buscar ratings (com cache)
      logger.debug('Fetching TripAdvisor ratings', { propertyId, externalId: listing.external_id });
      const ratings = await ratingCache.getRatingOrFetch(
        propertyId,
        'tripadvisor',
        async () => {
          const freshRatings = await tripadvisor.getPropertyRatings(listing.external_id);
          return {
            overall_rating: freshRatings.overall_rating,
            review_count: freshRatings.review_count,
            rating_histogram: freshRatings.rating_histogram,
          };
        }
      );

      logger.info('TripAdvisor ratings fetched', {
        propertyId,
        rating: ratings.overall_rating,
        reviewCount: ratings.review_count,
        source: 'cache_or_api',
      });

      // Salvar ratings
      await saveRatings(propertyId, 'tripadvisor', ratings);

      // Atualizar listing com novo rating
      logger.debug('Updating property listing rating', { propertyId });
      await updatePropertyListingRating(listing.id, ratings.overall_rating, ratings.review_count);

      // Enfileirar recálculo de dynamic pricing
      logger.info('Enqueueing dynamic pricing update', { propertyId });
      await enqueuePricingUpdate(userId, propertyId);

      const duration = Date.now() - startTime;
      logger.info('TripAdvisor ratings sync completed', { 
        propertyId, 
        duration_ms: duration,
        rating: ratings.overall_rating 
      });

      return { 
        status: 'completed', 
        duration_ms: duration,
        rating: ratings.overall_rating 
      };
    } catch (error) {
      logger.error('TripAdvisor ratings sync failed', { 
        propertyId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 10, // Ratings sync é leve, concorrência maior
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    },
  }
);

async function saveRatings(
  propertyId: string,
  platform: string,
  ratings: any
) {
  // Inserir/atualizar rating agregado
  await pool.query(
    `INSERT INTO platform_ratings (property_id, platform, rating, review_count, synced_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (platform, property_id) 
     DO UPDATE SET rating = $3, review_count = $4, synced_at = NOW()`,
    [propertyId, platform, ratings.overall_rating, ratings.review_count]
  );

  logger.info('Ratings saved', { 
    propertyId, 
    platform,
    rating: ratings.overall_rating,
    reviews: ratings.review_count 
  });
}

async function getPropertyListing(propertyId: string, platform: string) {
  const result = await pool.query(
    'SELECT id, external_id FROM property_listings WHERE property_id = $1 AND platform = $2',
    [propertyId, platform]
  );
  return result.rows[0];
}

async function updatePropertyListingRating(
  listingId: string,
  rating: number,
  reviewCount: number
) {
  await pool.query(
    'UPDATE property_listings SET rating = $1, review_count = $2, updated_at = NOW() WHERE id = $3',
    [rating, reviewCount, listingId]
  );
}

async function enqueuePricingUpdate(userId: string, propertyId: string) {
  // Enfileirar job de recálculo de pricing dinâmico
  // Assumindo que existe uma queue 'update-pricing'
  const queue = await redis.getQueue('update-pricing');
  if (queue) {
    await queue.add('recalculate', {
      userId,
      propertyId,
      trigger: 'tripadvisor_rating_update',
    });
    logger.info('Pricing update enqueued', { propertyId });
  }
}

worker.on('completed', (job) => {
  logger.info('TripAdvisor ratings sync job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('TripAdvisor ratings sync job failed', { jobId: job?.id, error: err.message });
});

export default worker;

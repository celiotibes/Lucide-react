/**
 * Worker: Sincronizar imóveis com Hospeda.com
 * Enfileirado por: sync queue ou scheduler a cada 6h
 */

import { Worker, Job } from 'bullmq';
import { pool } from '../db/pool';
import { redis } from '../cache/redis';
import { Logger } from '../shared/logger';
import HospedaClient from '../integrations/hospeda/hospeda-client';

const logger = Logger.getLogger('SyncHospedaWorker');

interface SyncHospedaJob {
  userId: string;
  propertyId?: string;
}

const worker = new Worker(
  'sync-hospeda-listings',
  async (job: Job<SyncHospedaJob>) => {
    const { userId, propertyId } = job.data;
    const startTime = Date.now();

    try {
      logger.info('Starting Hospeda sync', { userId, propertyId });

      // Buscar integração
      const integration = await getHospedaIntegration(userId);
      if (!integration) {
        throw new Error('Hospeda integration not found');
      }

      const apiKey = integration.api_key_encrypted; // TODO: descriptografar
      const hospeda = new HospedaClient(apiKey);

      if (propertyId) {
        await syncSingleProperty(userId, propertyId, hospeda);
      } else {
        await syncAllProperties(userId, hospeda);
      }

      await updateIntegrationStatus(userId, 'hospeda', 'success');

      const duration = Date.now() - startTime;
      logger.info('Hospeda sync completed', { userId, duration_ms: duration });

      return { status: 'completed', duration_ms: duration };
    } catch (error) {
      logger.error('Hospeda sync failed', { 
        userId, 
        error: error instanceof Error ? error.message : String(error) 
      });

      await recordSyncFailure(userId, 'hospeda', error);
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 5,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
    },
  }
);

async function syncSingleProperty(userId: string, propertyId: string, hospeda: HospedaClient) {
  const property = await getProperty(userId, propertyId);
  if (!property) throw new Error('Property not found');

  let listing = await getPropertyListing(propertyId, 'hospeda');

  if (!listing) {
    // Criar novo
    const result = await hospeda.createProperty({
      id: '',
      title: property.title,
      description: property.description,
      address: property.address,
      city: property.city,
      state: property.state,
      zipcode: property.zipcode,
      bedrooms: property.bedrooms || 0,
      bathrooms: property.bathrooms || 0,
      capacity: property.capacity || 2,
      amenities: property.amenities || [],
      price_per_night: property.price_per_night,
      currency: 'BRL',
      images: [],
    });

    listing = await createPropertyListing({
      property_id: propertyId,
      platform: 'hospeda',
      external_id: result.id,
      url: result.url,
      status: 'draft',
    });

    // Upload imagens
    if (property.images && property.images.length > 0) {
      await hospeda.uploadImages(result.id, property.images);
    }

    // Publicar
    await hospeda.publishProperty(result.id);
    await updatePropertyListingStatus(listing.id, 'published');
  } else {
    // Atualizar
    await hospeda.updateProperty(listing.external_id, {
      title: property.title,
      description: property.description,
      price_per_night: property.price_per_night,
      amenities: property.amenities,
    });

    if (property.images && property.images.length > 0) {
      await hospeda.uploadImages(listing.external_id, property.images);
    }
  }

  // Buscar stats
  const stats = await hospeda.getPropertyStats(listing.external_id);
  await updatePropertyListingStats(listing.id, {
    rating: stats.avg_rating,
    review_count: stats.reviews_count,
  });
}

async function syncAllProperties(userId: string, hospeda: HospedaClient) {
  const properties = await getUserProperties(userId);
  for (const property of properties) {
    try {
      await syncSingleProperty(userId, property.id, hospeda);
    } catch (error) {
      logger.warn('Failed to sync property', { 
        propertyId: property.id, 
        error 
      });
    }
  }
}

// Helpers
async function getHospedaIntegration(userId: string) {
  const result = await pool.query(
    'SELECT * FROM user_integrations WHERE user_id = $1 AND platform = $2',
    [userId, 'hospeda']
  );
  return result.rows[0];
}

async function getProperty(userId: string, propertyId: string) {
  const result = await pool.query(
    'SELECT * FROM properties WHERE id = $1 AND user_id = $2',
    [propertyId, userId]
  );
  return result.rows[0];
}

async function getPropertyListing(propertyId: string, platform: string) {
  const result = await pool.query(
    'SELECT * FROM property_listings WHERE property_id = $1 AND platform = $2',
    [propertyId, platform]
  );
  return result.rows[0];
}

async function getUserProperties(userId: string) {
  const result = await pool.query(
    'SELECT id FROM properties WHERE user_id = $1 AND status = $2',
    [userId, 'active']
  );
  return result.rows;
}

async function createPropertyListing(data: any) {
  const result = await pool.query(
    `INSERT INTO property_listings 
     (property_id, platform, external_id, url, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.property_id, data.platform, data.external_id, data.url, data.status]
  );
  return result.rows[0];
}

async function updatePropertyListingStatus(listingId: string, status: string) {
  await pool.query(
    'UPDATE property_listings SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, listingId]
  );
}

async function updatePropertyListingStats(listingId: string, stats: any) {
  await pool.query(
    'UPDATE property_listings SET rating = COALESCE($1, rating), review_count = COALESCE($2, review_count), updated_at = NOW() WHERE id = $3',
    [stats.rating, stats.review_count, listingId]
  );
}

async function updateIntegrationStatus(userId: string, platform: string, status: string) {
  await pool.query(
    'UPDATE user_integrations SET last_sync_status = $1, last_sync_at = NOW() WHERE user_id = $2 AND platform = $3',
    [status, userId, platform]
  );
}

async function recordSyncFailure(userId: string, platform: string, error: any) {
  await pool.query(
    'INSERT INTO sync_history (user_id, platform, status, error_message) VALUES ($1, $2, $3, $4)',
    [userId, platform, 'failed', error instanceof Error ? error.message : String(error)]
  );

  await pool.query(
    'UPDATE user_integrations SET error_count = error_count + 1 WHERE user_id = $1 AND platform = $2',
    [userId, platform]
  );
}

worker.on('completed', (job) => {
  logger.info('Hospeda sync job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Hospeda sync job failed', { jobId: job?.id, error: err.message });
});

export default worker;

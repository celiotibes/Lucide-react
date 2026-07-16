/**
 * Worker: Sincronizar apartamentos com Booking.com
 */

import { Worker, Job } from 'bullmq';
import { pool } from '../db/pool';
import { redis } from '../cache/redis';
import { Logger } from '../shared/logger';
import { BookingApartmentsClient } from '../integrations/booking/booking-apartments-client';

const logger = Logger.getLogger('SyncBookingApartmentsWorker');

interface SyncBookingApartmentsJob {
  userId: string;
  propertyId?: string;
}

const worker = new Worker(
  'sync-booking-apartments',
  async (job: Job<SyncBookingApartmentsJob>) => {
    const { userId, propertyId } = job.data;
    const startTime = Date.now();

    try {
      logger.info('Starting Booking Apartments sync', { userId, propertyId });

      const integration = await getBookingIntegration(userId);
      if (!integration) {
        throw new Error('Booking integration not found');
      }

      const apiKey = integration.api_key_encrypted;
      const bookingApartments = new BookingApartmentsClient(apiKey);

      if (propertyId) {
        await syncSingleApartment(userId, propertyId, bookingApartments);
      } else {
        await syncAllApartments(userId, bookingApartments);
      }

      await updateIntegrationStatus(userId, 'booking-apartments', 'success');

      const duration = Date.now() - startTime;
      logger.info('Booking Apartments sync completed', { userId, duration_ms: duration });

      return { status: 'completed', duration_ms: duration };
    } catch (error) {
      logger.error('Booking Apartments sync failed', { 
        userId, 
        error: error instanceof Error ? error.message : String(error) 
      });

      await recordSyncFailure(userId, 'booking-apartments', error);
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

async function syncSingleApartment(
  userId: string,
  propertyId: string,
  bookingApartments: BookingApartmentsClient
) {
  const property = await getProperty(userId, propertyId);
  if (!property) throw new Error('Property not found');

  let listing = await getPropertyListing(propertyId, 'booking-apartments');

  if (!listing) {
    // Criar novo
    const result = await bookingApartments.createApartment({
      id: '',
      name: property.title,
      description: property.description,
      address: property.address,
      city: property.city,
      country: 'Brazil',
      zipcode: property.zipcode,
      type: property.property_type || 'apartment',
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      max_guests: property.capacity,
      amenities: property.amenities,
      price_per_night: property.price_per_night,
      currency: 'BRL',
      minimum_stay: property.minimum_stay || 1,
      cancellation_policy: 'moderate',
      images: [],
    });

    listing = await createPropertyListing({
      property_id: propertyId,
      platform: 'booking-apartments',
      external_id: result.id,
      url: result.url,
      property_type: property.property_type,
      minimum_stay: property.minimum_stay,
      status: 'published',
    });
  }

  // Sincronizar calendário
  await syncCalendarWithBooking(propertyId, listing.external_id);
}

async function syncAllApartments(userId: string, bookingApartments: BookingApartmentsClient) {
  const properties = await getUserProperties(userId);
  for (const property of properties) {
    try {
      await syncSingleApartment(userId, property.id, bookingApartments);
    } catch (error) {
      logger.warn('Failed to sync apartment', { propertyId: property.id, error });
    }
  }
}

async function syncCalendarWithBooking(
  propertyId: string,
  bookingApartmentId: string
) {
  const bookingApartments = new BookingApartmentsClient('');
  const blocks = await getCalendarBlocks(propertyId);
  const blockedDates = blocks
    .flatMap(b => getDateRange(b.start_date, b.end_date));

  if (blockedDates.length > 0) {
    await bookingApartments.syncCalendar(bookingApartmentId, blockedDates);
  }
}

function getDateRange(startDate: string, endDate: string): string[] {
  const dates = [];
  let current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

async function getCalendarBlocks(propertyId: string) {
  const result = await pool.query(
    `SELECT start_date, end_date FROM calendar_blocks 
     WHERE property_id = $1 AND end_date >= NOW()`,
    [propertyId]
  );
  return result.rows;
}

// Helpers (mesmo padrão de sync-hospeda-listings)
async function getBookingIntegration(userId: string) {
  const result = await pool.query(
    'SELECT * FROM user_integrations WHERE user_id = $1 AND platform = $2',
    [userId, 'booking']
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
     (property_id, platform, external_id, url, status, property_type, minimum_stay)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [data.property_id, data.platform, data.external_id, data.url, data.status, data.property_type, data.minimum_stay]
  );
  return result.rows[0];
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
  logger.info('Booking Apartments sync job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Booking Apartments sync job failed', { jobId: job?.id, error: err.message });
});

export default worker;

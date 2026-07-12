import { Express } from 'express';
import { Pool } from 'pg';
import { Queue } from 'bullmq';
import { createPropertiesRouter } from './routes/properties.routes';
import {
  createSyncListingsWorker,
  createUpdatePricingWorker,
  createLeadManagementWorker,
} from './index';
import { Logger } from '../shared/logger';

export interface PropertiesModuleConfig {
  app: Express;
  pool: Pool;
  redisConnection: any;
  queues: {
    syncListings: Queue;
    updatePricing: Queue;
    leadManagement: Queue;
  };
}

export async function initializePropertiesModule(config: PropertiesModuleConfig): Promise<void> {
  const { app, pool, redisConnection, queues } = config;

  Logger.info('properties-init', 'Initializing Properties Management Module', {});

  try {
    // 1. Create and register router
    const router = createPropertiesRouter(pool);
    app.use('/api/properties', router);
    Logger.info('properties-init', 'Routes registered', { prefix: '/api/properties' });

    // 2. Initialize workers
    const syncListingsWorker = createSyncListingsWorker(pool, redisConnection);
    const pricingWorker = createUpdatePricingWorker(pool, redisConnection);
    const leadWorker = createLeadManagementWorker(pool, redisConnection);

    Logger.info('properties-init', 'Workers initialized', {
      workers: ['sync-listings', 'update-pricing', 'lead-management'],
    });

    // 3. Set up queue event listeners
    setupQueueListeners(queues);

    // 4. Initialize database schema if needed
    await initializeDatabaseSchema(pool);

    Logger.info('properties-init', 'Properties Management Module initialized successfully', {
      routes: 25,
      workers: 3,
      services: 4,
    });
  } catch (error) {
    Logger.error('properties-init', 'Failed to initialize Properties Management Module', error);
    throw error;
  }
}

function setupQueueListeners(queues: { syncListings: Queue; updatePricing: Queue; leadManagement: Queue }): void {
  // Sync Listings Queue
  queues.syncListings.on('error', (err) => {
    Logger.error('sync-listings-queue', 'Queue error', err);
  });

  queues.syncListings.on('failed', (job, err) => {
    Logger.warn('sync-listings-queue', 'Job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  // Update Pricing Queue
  queues.updatePricing.on('error', (err) => {
    Logger.error('update-pricing-queue', 'Queue error', err);
  });

  // Lead Management Queue
  queues.leadManagement.on('error', (err) => {
    Logger.error('lead-management-queue', 'Queue error', err);
  });

  Logger.info('queue-init', 'Queue listeners registered', {
    queues: ['syncListings', 'updatePricing', 'leadManagement'],
  });
}

async function initializeDatabaseSchema(pool: Pool): Promise<void> {
  try {
    // Check if tables exist
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('properties', 'listings', 'leads')
    `);

    if (result.rows.length === 3) {
      Logger.info('db-init', 'Database schema already exists', {
        tables: result.rows.map((r) => r.table_name),
      });
      return;
    }

    // If schema doesn't exist, log warning (actual initialization should be done separately)
    Logger.warn('db-init', 'Database schema incomplete', {
      existingTables: result.rows.length,
      expectedTables: 3,
      recommendation: 'Run migrations: psql -U user -d database -f migrations/001-init-properties.sql',
    });
  } catch (error) {
    Logger.error('db-init', 'Failed to check database schema', error);
    throw error;
  }
}

export function getPropertiesModuleStatus(
  pool: Pool,
  redisConnection: any
): Promise<Record<string, unknown>> {
  return Promise.resolve({
    module: 'properties',
    status: 'initialized',
    services: 4,
    controllers: 2,
    routes: 25,
    workers: 3,
    database: 'postgresql',
    cache: 'redis',
    timestamp: new Date(),
  });
}

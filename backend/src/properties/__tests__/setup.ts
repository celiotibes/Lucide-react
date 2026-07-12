import { Pool } from 'pg';

// Set test database URL if not provided
if (!process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL = 'postgresql://localhost/rental_sync_test';
}

// Global test timeout
jest.setTimeout(30000);

// Setup global test database
export let testPool: Pool;

export async function setupTestDatabase() {
  testPool = new Pool({
    connectionString: process.env.TEST_DATABASE_URL,
  });

  // Initialize schema if needed
  try {
    const result = await testPool.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'properties'
      );
    `);

    if (!result.rows[0].exists) {
      console.log('Test schema not found, creating...');
      // Schema initialization would happen here
      // For now, we assume migrations are run separately
    }
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

export async function teardownTestDatabase() {
  if (testPool) {
    await testPool.end();
  }
}

// Jest hooks
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});

// Suppress console logs during tests
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
});

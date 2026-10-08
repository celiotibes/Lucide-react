/**
 * Setup file for Security Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 *
 * Initializes test environment, mocks, and utilities
 */

// Mock crypto module
jest.mock('crypto', () => {
  const actualCrypto = jest.requireActual('crypto');
  return {
    ...actualCrypto,
    randomBytes: jest.fn((size: number) => {
      // Return deterministic bytes for testing
      return Buffer.alloc(size).fill(0x01);
    }),
    createHash: actualCrypto.createHash,
    pbkdf2Sync: actualCrypto.pbkdf2Sync,
  };
});

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiRemove: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

// Mock AppState for listening to app lifecycle
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
  }
}));

// Suppress console output during tests unless explicitly checking
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Store original functions for restoration
global.originalConsoleLog = originalConsoleLog;
global.originalConsoleWarn = originalConsoleWarn;
global.originalConsoleError = originalConsoleError;

// Setup test-specific global variables
global.testTimeout = 10000;

/**
 * Helper: Create mock secure storage response
 */
export function createMockSecureStoreResponse(value: any) {
  return Promise.resolve(value ? JSON.stringify(value) : null);
}

/**
 * Helper: Create mock async storage response
 */
export function createMockAsyncStorageResponse(value: any) {
  return Promise.resolve(value ? JSON.stringify(value) : null);
}

/**
 * Helper: Setup integration test environment
 */
export function setupIntegrationTestEnvironment() {
  // Reset all mocks
  jest.clearAllMocks();

  // Set test-friendly environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Suppress logs in tests

  // Mock localStorage
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn(),
  };
  global.localStorage = localStorageMock as any;

  // Mock fetch for API tests
  global.fetch = jest.fn();
}

/**
 * Helper: Cleanup after integration test
 */
export function cleanupIntegrationTest() {
  jest.clearAllMocks();
  jest.restoreAllMocks();

  // Clear localStorage
  if (global.localStorage) {
    (global.localStorage as any).clear();
  }
}

/**
 * Helper: Wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper: Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('waitFor timeout exceeded');
    }
    await wait(interval);
  }
}

/**
 * Helper: Create random token for testing
 */
export function createMockToken(overrides: Partial<any> = {}) {
  return {
    accessToken: `mock_token_${Date.now()}_${Math.random()}`,
    refreshToken: `refresh_${Date.now()}_${Math.random()}`,
    expiresIn: 3600,
    tokenType: 'Bearer',
    issuedAt: Date.now(),
    ...overrides,
  };
}

/**
 * Helper: Create JWT token with payload
 */
export function createJWT(payload: any = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(
    JSON.stringify({
      sub: '1234567890',
      name: 'Test User',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...payload,
    })
  ).toString('base64');
  const signature = 'test_signature';

  return `${header}.${body}.${signature}`;
}

/**
 * Helper: Assert security properties
 */
export function assertSecurityProperties(result: any, expectations: any) {
  for (const [key, expectedValue] of Object.entries(expectations)) {
    if (typeof expectedValue === 'function') {
      expect(expectedValue(result[key])).toBe(true);
    } else {
      expect(result[key]).toEqual(expectedValue);
    }
  }
}

/**
 * Helper: Test attack vector
 */
export function testAttackVector(
  validator: (input: string) => boolean,
  vector: string,
  shouldBlock: boolean = true
) {
  const result = validator(vector);
  if (shouldBlock) {
    expect(result).toBe(false);
  } else {
    expect(result).toBe(true);
  }
}

// Export test utilities
export default {
  createMockSecureStoreResponse,
  createMockAsyncStorageResponse,
  setupIntegrationTestEnvironment,
  cleanupIntegrationTest,
  wait,
  waitFor,
  createMockToken,
  createJWT,
  assertSecurityProperties,
  testAttackVector,
};

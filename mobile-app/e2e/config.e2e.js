/**
 * E2E Test Configuration
 * Global configuration for Detox E2E testing including timeouts, artifacts, and helpers
 */

const detox = require('detox');
const config = require('../detox.config.js');
const adapter = require('detox/runners/jest/adapter');

jest.setTimeout(120000);

beforeAll(async () => {
  await adapter.beforeAll();
});

beforeEach(async () => {
  await adapter.beforeEach();
});

afterAll(async () => {
  await adapter.afterAll();
});

afterEach(async () => {
  await adapter.afterEach();
});

/**
 * E2E Test Configuration Constants
 */
module.exports = {
  // Timeout settings for various operations
  timeouts: {
    // Standard action timeout (tap, type, scroll)
    action: 5000,
    // Wait for element to appear
    element: 10000,
    // Network request timeout
    network: 15000,
    // Animation/navigation timeout
    navigation: 8000,
    // Full test timeout
    test: 120000,
  },

  // Retry configuration
  retries: {
    // Number of times to retry a failed action
    action: 3,
    // Delay between retries (ms)
    delay: 500,
  },

  // Element visibility and interaction thresholds
  interaction: {
    // Minimum percentage of element visible to interact (0-100)
    minVisible: 75,
    // Allow multi-touch gestures
    multiTouch: true,
    // Use native interactions when possible
    useNative: true,
  },

  // Screenshot and artifact settings
  artifacts: {
    // Directory for test artifacts
    directory: './artifacts/e2e',
    // Take screenshots on failure
    screenshots: {
      enabled: true,
      onFailure: true,
      onError: true,
    },
    // Record video on failure
    videos: {
      enabled: false,
      onFailure: true,
      onError: true,
    },
    // Collect logs
    logs: {
      enabled: true,
      onFailure: true,
      level: 'info',
    },
  },

  // Device settings
  device: {
    // Orientation
    orientation: 'portrait',
    // Allow status bar manipulation
    allowStatusBar: true,
    // Enable dark mode testing
    darkMode: false,
  },

  // Testing environment
  environment: {
    // API endpoint for testing (override in CI)
    apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3000',
    // Test user credentials (use environment variables in CI)
    testUser: {
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || 'testPassword123',
      cpf: process.env.TEST_USER_CPF || '12345678901',
    },
    // Mock mode (use mock data instead of real API)
    mockMode: process.env.MOCK_MODE === 'true' || true,
  },

  // Performance thresholds
  performance: {
    // Maximum time for screen to render (ms)
    maxRenderTime: 3000,
    // Maximum time for action to complete (ms)
    maxActionTime: 2000,
    // Maximum network latency (ms)
    maxNetworkLatency: 5000,
  },
};

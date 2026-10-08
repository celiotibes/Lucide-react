/**
 * Jest Configuration for Security Integration Tests
 * Phase 22.16: API Integration & Security Service Tests
 */

module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  displayName: 'integration',

  // Integration tests configuration
  testMatch: [
    '**/__tests__/integration/**/*.integration.test.(ts|tsx|js)',
  ],

  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/e2e/',
  ],

  moduleFileExtensions: [
    'ts',
    'tsx',
    'js',
    'jsx',
    'json',
  ],

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },

  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/integration/setup.ts',
  ],

  // Coverage configuration for integration tests
  collectCoverageFrom: [
    'src/utils/security/**/*.{ts,tsx}',
    'src/services/**/*.{ts,tsx}',
    'src/api/**/*.{ts,tsx}',
    'src/store/auth-context.tsx',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.integration.test.{ts,tsx}',
  ],

  coverageThreshold: {
    'src/utils/security/tokenManager.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'src/utils/security/secureStorageService.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    'src/utils/security/certificatePinning.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    'src/utils/security/dataValidationService.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    'src/services/APIClient.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'src/api/client.ts': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    'src/store/auth-context.tsx': {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },

  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'json-summary',
  ],

  coverageDirectory: '<rootDir>/coverage/integration',

  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-navigation|react-native-paper|react-native-vector-icons|expo)/)',
  ],

  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        // Integration tests need higher strictness
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true,
        strictFunctionTypes: true,
      },
    },
  },

  // Timeouts for integration tests
  testTimeout: 10000,

  // Verbose output
  verbose: true,

  // Continue on first failure but report all failures
  bail: 0,

  // Use 50% of available CPU cores
  maxWorkers: '50%',

  // Additional options for security testing
  detectOpenHandles: true,
  forceExit: false,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Test ordering
  testSequencer: '<rootDir>/jest.integration.sequencer.js',

  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results/integration',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathAsClassName: 'true',
      },
    ],
  ],
};

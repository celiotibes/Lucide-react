/**
 * Jest Configuration for E2E Tests
 * Separate configuration for end-to-end testing with Detox
 */

module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  testTimeout: 120000,
  reporters: [
    'default',
  ],
  setupFilesAfterEnv: [
    '<rootDir>/e2e/config.e2e.js',
  ],
  testMatch: [
    '<rootDir>/e2e/**/*.e2e.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: '<rootDir>/artifacts/e2e/coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json',
    'json-summary',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-navigation|react-native-paper|react-native-vector-icons|expo)/)',
  ],
  globals: {
    'ts-jest': {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
  verbose: true,
  bail: false,
  maxWorkers: '50%',
};

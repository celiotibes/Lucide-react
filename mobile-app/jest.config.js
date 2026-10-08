/**
 * Jest Configuration for React Native
 * Configures testing environment, module resolution, and coverage
 */

module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  setupFilesAfterEnv: [
    '<rootDir>/src/__tests__/setup.ts',
    '<rootDir>/jest.setup.js',
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
  testMatch: [
    '**/__tests__/**/*.test.(ts|tsx|js)',
    '**/__tests__/**/*.spec.(ts|tsx|js)',
    '**/?(*.)(spec|test).(ts|tsx|js)',
    '!**/__tests__/**/*.integration.test.(ts|tsx|js)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/e2e/',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/App.tsx',
    '!src/index.tsx',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/services/**': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/database/**': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/components/**': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
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
  coverageDirectory: '<rootDir>/coverage',
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
  testTimeout: 15000,
  verbose: true,
  bail: false,
  maxWorkers: '50%',
};

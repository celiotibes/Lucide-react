module.exports = {
  displayName: 'properties',
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/properties'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/properties/**/*.ts',
    '!src/properties/**/*.test.ts',
    '!src/properties/**/__tests__/**',
    '!src/properties/types.ts',
  ],
  coverageDirectory: '<rootDir>/coverage/properties',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/properties/__tests__/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
  testTimeout: 30000,
  verbose: true,
};

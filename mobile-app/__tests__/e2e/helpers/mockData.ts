/**
 * Mock Data for E2E Tests
 * Test data fixtures and factory functions
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Mock user credentials for testing
 */
export const mockCredentials = {
  valid: {
    email: 'test@example.com',
    password: 'TestPassword123!',
  },
  invalid: {
    email: 'invalid@example.com',
    password: 'WrongPassword123!',
  },
  weakPassword: {
    email: 'test@example.com',
    password: '123', // Too short
  },
  invalidEmail: {
    email: 'notanemail',
    password: 'TestPassword123!',
  },
};

/**
 * Mock user data
 */
export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  name: 'Test User',
  avatar: 'https://example.com/avatar.jpg',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Mock authentication tokens
 */
export const mockTokens = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
  refreshToken: 'refresh-token-123',
  expiresIn: 3600,
  tokenType: 'Bearer',
};

/**
 * Mock transactions for testing
 */
export const mockTransactions = {
  basic: {
    id: uuidv4(),
    description: 'Test Transaction',
    amount: 100.00,
    category: 'Food',
    date: new Date().toISOString(),
    type: 'expense',
  },
  large: {
    id: uuidv4(),
    description: 'Large Transaction',
    amount: 5000.00,
    category: 'Rent',
    date: new Date().toISOString(),
    type: 'expense',
  },
  income: {
    id: uuidv4(),
    description: 'Salary',
    amount: 3000.00,
    category: 'Salary',
    date: new Date().toISOString(),
    type: 'income',
  },
  small: {
    id: uuidv4(),
    description: 'Coffee',
    amount: 3.50,
    category: 'Food',
    date: new Date().toISOString(),
    type: 'expense',
  },
};

/**
 * Create a mock transaction with custom values
 */
export function createMockTransaction(overrides: Partial<typeof mockTransactions.basic> = {}) {
  return {
    ...mockTransactions.basic,
    id: uuidv4(),
    ...overrides,
  };
}

/**
 * Mock notifications for testing
 */
export const mockNotifications = {
  syncCompleted: {
    id: uuidv4(),
    type: 'sync',
    title: 'Sync Completed',
    message: 'Data synchronized successfully',
    read: false,
    timestamp: new Date().toISOString(),
  },
  lowBattery: {
    id: uuidv4(),
    type: 'system',
    title: 'Low Battery',
    message: 'Battery level is below 20%',
    read: false,
    timestamp: new Date().toISOString(),
  },
  largeTransaction: {
    id: uuidv4(),
    type: 'transaction',
    title: 'Large Transaction',
    message: 'You recorded a transaction of $5000',
    read: false,
    timestamp: new Date().toISOString(),
  },
  networkError: {
    id: uuidv4(),
    type: 'error',
    title: 'Network Error',
    message: 'Failed to sync data',
    read: false,
    timestamp: new Date().toISOString(),
  },
};

/**
 * Create a mock notification with custom values
 */
export function createMockNotification(overrides: Partial<typeof mockNotifications.syncCompleted> = {}) {
  return {
    ...mockNotifications.syncCompleted,
    id: uuidv4(),
    ...overrides,
  };
}

/**
 * Mock API responses
 */
export const mockApiResponses = {
  loginSuccess: {
    accessToken: mockTokens.accessToken,
    refreshToken: mockTokens.refreshToken,
    user: mockUser,
    expiresIn: 3600,
  },
  loginFailure: {
    error: 'Invalid credentials',
    message: 'Email or password is incorrect',
    statusCode: 401,
  },
  transactionListSuccess: {
    data: [mockTransactions.basic, mockTransactions.large],
    pagination: {
      total: 2,
      page: 1,
      pageSize: 20,
    },
  },
  syncSuccess: {
    status: 'success',
    message: 'Sync completed',
    itemsSynced: 10,
    timestamp: new Date().toISOString(),
  },
  refreshTokenSuccess: {
    accessToken: 'new-access-token',
    expiresIn: 3600,
  },
};

/**
 * Mock battery levels
 */
export const mockBatteryLevels = {
  full: 100,
  high: 85,
  medium: 50,
  low: 20,
  critical: 5,
  veryLow: 2,
};

/**
 * Mock sync intervals (in seconds)
 */
export const mockSyncIntervals = {
  highBattery: 300, // 5 minutes
  mediumBattery: 900, // 15 minutes
  lowBattery: 3600, // 60 minutes
  criticalBattery: null, // Disabled
};

/**
 * Mock sync queue items
 */
export const mockSyncQueueItems = {
  basic: {
    id: uuidv4(),
    type: 'transaction',
    action: 'create',
    data: mockTransactions.basic,
    timestamp: new Date().toISOString(),
    retries: 0,
  },
  failed: {
    id: uuidv4(),
    type: 'transaction',
    action: 'create',
    data: mockTransactions.basic,
    timestamp: new Date().toISOString(),
    retries: 3,
    error: 'Network error',
  },
};

/**
 * Mock crash report data
 */
export const mockCrashReport = {
  id: uuidv4(),
  timestamp: new Date().toISOString(),
  error: 'TypeError: Cannot read property "user" of undefined',
  stack: 'at SyncService.ts:45',
  breadcrumbs: [
    { message: 'App started', timestamp: new Date().toISOString() },
    { message: 'User logged in', timestamp: new Date().toISOString() },
    { message: 'Sync started', timestamp: new Date().toISOString() },
  ],
  device: {
    os: 'android',
    osVersion: '13',
    manufacturer: 'Samsung',
    model: 'SM-G991B',
    batteryLevel: 45,
  },
};

/**
 * Create bulk transactions for testing
 */
export function createBulkTransactions(count: number = 10) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockTransactions.basic,
    id: uuidv4(),
    description: `Transaction ${i + 1}`,
    amount: Math.random() * 500,
    date: new Date(Date.now() - i * 86400000).toISOString(), // Each day before
  }));
}

/**
 * Create bulk notifications for testing
 */
export function createBulkNotifications(count: number = 10) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockNotifications.syncCompleted,
    id: uuidv4(),
    message: `Notification ${i + 1}`,
    timestamp: new Date(Date.now() - i * 3600000).toISOString(), // Each hour before
  }));
}

/**
 * Mock error responses
 */
export const mockErrorResponses = {
  unauthorized: {
    status: 401,
    data: {
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    },
  },
  forbidden: {
    status: 403,
    data: {
      error: 'Forbidden',
      message: 'You do not have permission',
    },
  },
  notFound: {
    status: 404,
    data: {
      error: 'Not Found',
      message: 'Resource not found',
    },
  },
  serverError: {
    status: 500,
    data: {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    },
  },
  networkError: {
    code: 'ECONNABORTED',
    message: 'Connection failed',
  },
};

/**
 * Mock device info
 */
export const mockDeviceInfo = {
  id: uuidv4(),
  os: 'android',
  osVersion: '13',
  appVersion: '0.1.0',
  manufacturer: 'Samsung',
  model: 'SM-G991B',
  locale: 'en_US',
};

/**
 * Test data for biometric authentication
 */
export const mockBiometricData = {
  fingerprint: {
    available: true,
    enrolled: true,
    authenticated: true,
  },
  faceRecognition: {
    available: true,
    enrolled: true,
    authenticated: true,
  },
  failed: {
    available: true,
    enrolled: true,
    authenticated: false,
    error: 'Biometric authentication failed',
  },
};

/**
 * Test data for session timeout
 */
export const mockSessionTimeouts = {
  standard: 1800000, // 30 minutes
  short: 300000, // 5 minutes
  long: 3600000, // 1 hour
};

/**
 * Mock feature flags
 */
export const mockFeatureFlags = {
  enableBiometric: true,
  enableOfflineMode: true,
  enableNotifications: true,
  enableBatteryOptimization: true,
  enableCrashReporting: true,
};

export const mockData = {
  credentials: mockCredentials,
  user: mockUser,
  tokens: mockTokens,
  transactions: mockTransactions,
  notifications: mockNotifications,
  apiResponses: mockApiResponses,
  batteryLevels: mockBatteryLevels,
  syncIntervals: mockSyncIntervals,
  syncQueueItems: mockSyncQueueItems,
  crashReport: mockCrashReport,
  errorResponses: mockErrorResponses,
  deviceInfo: mockDeviceInfo,
  biometricData: mockBiometricData,
  sessionTimeouts: mockSessionTimeouts,
  featureFlags: mockFeatureFlags,
  createMockTransaction,
  createMockNotification,
  createBulkTransactions,
  createBulkNotifications,
};

/**
 * Mock Services for Testing
 */

export const mockNetworkMonitorService = {
  subscribe: jest.fn((callback) => {
    // Call with initial online status
    callback({ isOnline: true, connectionType: 'wifi' });
    return () => {}; // Unsubscribe function
  }),
  getStatus: jest.fn(() => ({
    isOnline: true,
    connectionType: 'wifi',
  })),
  destroy: jest.fn(),
};

export const mockSyncManagerHook = {
  syncStatus: {
    pendingChanges: 0,
    syncProgress: 0,
    lastSyncTime: Date.now(),
    totalItems: 0,
    syncedItems: 0,
  },
  isOnline: true,
  conflicts: [],
  isSyncing: false,
  error: null,
  performSync: jest.fn(async () => ({ success: true })),
  resolveConflict: jest.fn(async () => ({ success: true })),
  cancelSync: jest.fn(),
};

export const mockDatabaseInstance = {
  get: jest.fn((collection) => ({
    query: jest.fn(() => ({
      fetch: jest.fn(async () => []),
    })),
    find: jest.fn(async () => ({})),
    create: jest.fn(async () => ({})),
  })),
  batch: jest.fn(async () => ({})),
};

export const mockAuthHook = {
  user: {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  },
  apiEndpoint: 'https://api.example.com',
  deviceId: 'device-123',
  isAuthenticated: true,
  login: jest.fn(async () => ({ success: true })),
  logout: jest.fn(async () => ({ success: true })),
};

export const mockNavigationProp = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
  pop: jest.fn(),
  setOptions: jest.fn(),
  dispatch: jest.fn(),
};

export const mockRouteParams = {
  documentId: 'doc-123',
};

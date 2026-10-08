import '@testing-library/jest-native/extend-expect';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({}),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(),
  useRoute: jest.fn(),
}));

jest.useFakeTimers();

global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
};

const crypto = require('crypto');
Object.defineProperty(global.self, 'crypto', {
  value: {
    getRandomValues: (arr) => crypto.randomBytes(arr.length),
  },
});

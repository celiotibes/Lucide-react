/**
 * Jest Setup Configuration
 * Configure testing environment before running tests
 */

import '@testing-library/jest-native/extend-expect';

// Mock React Native modules
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Platform: {
    OS: 'android',
    select: (obj: any) => obj.android,
  },
  NativeEventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeListener: jest.fn(),
  })),
}));

// Mock react-native-paper
jest.mock('react-native-paper', () => ({
  ...jest.requireActual('react-native-paper'),
  ProgressBar: jest.fn(({ progress, color }) => null),
  ActivityIndicator: jest.fn(() => null),
  FAB: jest.fn(({ icon, onPress, label }) => null),
  Searchbar: jest.fn(({ placeholder, onChangeText, value }) => null),
  SegmentedButtons: jest.fn(({ value, onValueChange, buttons }) => null),
  Button: jest.fn(({ children, onPress }) => null),
  Card: jest.fn(({ children }) => null),
  Divider: jest.fn(() => null),
}));

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

// Mock Navigation
jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    push: jest.fn(),
    setOptions: jest.fn(),
  })),
  useRoute: jest.fn(() => ({
    params: {},
  })),
}));

// Mock Navigation Stack
jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: jest.fn(() => ({
    Screen: jest.fn(),
    Navigator: jest.fn(),
  })),
}));

// Mock Firebase (if used)
jest.mock('@react-native-firebase/app', () => ({
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

// Suppress console warnings during tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = jest.fn((...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  });

  console.warn = jest.fn((...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('ViewPropTypes')
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  });
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Mock timers
jest.useFakeTimers();

// Mock fetch
global.fetch = jest.fn();

export {};

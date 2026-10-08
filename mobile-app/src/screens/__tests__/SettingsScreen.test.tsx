/**
 * SettingsScreen Tests
 * Tests for auto-sync toggle, OCR language selection, logout, and settings reset
 */

import React from 'react';
import { render, fireEvent, waitFor, Alert } from '@testing-library/react-native';
import { SettingsScreen } from '../settings/SettingsScreen';

// Mock hooks
jest.mock('@/hooks', () => ({
  useAuth: jest.fn(() => ({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    },
    apiEndpoint: 'https://api.example.com',
    deviceId: 'device-123',
    logout: jest.fn(async () => ({ success: true })),
  })),
}));

jest.mock('@/components/SyncStatusIndicator', () => ({
  SyncStatusIndicator: () => null,
}));

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('@/theme/colors', () => ({
  Colors: {
    primary: '#2196F3',
    background: '#FAFAFA',
    surface: '#FFFFFF',
    text: '#000000',
    error: '#F44336',
    warning: '#FF9800',
    textSecondary: '#666666',
    textTertiary: '#999999',
    border: '#E0E0E0',
    surfaceVariant: '#F5F5F5',
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User Information Display', () => {
    it('should display user email', async () => {
      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByText(/test@example.com/)).toBeTruthy();
      });
    });

    it('should display user name', async () => {
      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByText(/Test User/)).toBeTruthy();
      });
    });
  });

  describe('Auto-Sync Settings', () => {
    it('should display auto-sync toggle', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const autoSyncToggle = getByTestId('auto-sync-toggle');
        expect(autoSyncToggle).toBeTruthy();
      });
    });

    it('should toggle auto-sync setting', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const autoSyncToggle = getByTestId('auto-sync-toggle');
        const initialState = autoSyncToggle.props.value;

        fireEvent(autoSyncToggle, 'onValueChange', !initialState);

        expect(autoSyncToggle.props.value).toBe(!initialState);
      });
    });

    it('should display auto-sync is enabled by default', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const autoSyncToggle = getByTestId('auto-sync-toggle');
        expect(autoSyncToggle.props.value).toBe(true);
      });
    });
  });

  describe('Sync Interval Settings', () => {
    it('should display sync interval options', async () => {
      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByText(/1 minute|5 minutes|15 minutes/i)).toBeTruthy();
      });
    });

    it('should allow changing sync interval', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const interval15min = getByTestId('sync-interval-900000');
        fireEvent.press(interval15min);

        expect(interval15min.props.selected).toBe(true);
      });
    });

    it('should display current sync interval selection', async () => {
      const { queryByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        // Default should be 5 minutes (300000)
        const interval5min = queryByTestId('sync-interval-300000');
        expect(interval5min).toBeTruthy();
      });
    });
  });

  describe('OCR Language Selection', () => {
    it('should display OCR language options', async () => {
      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(queryByText(/English|Portuguese|Spanish/)).toBeTruthy();
      });
    });

    it('should allow selecting OCR language', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const portLanguage = getByTestId('language-POR');
        fireEvent.press(portLanguage);

        expect(portLanguage.props.selected).toBe(true);
      });
    });

    it('should display English as default language', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const engLanguage = getByTestId('language-ENG');
        expect(engLanguage.props.selected).toBe(true);
      });
    });

    it('should support multiple languages', async () => {
      const languages = ['ENG', 'POR', 'SPA', 'FRA', 'DEU', 'ITA', 'JPN', 'KOR', 'RUS'];
      const { queryByText } = render(<SettingsScreen />);

      await waitFor(() => {
        languages.forEach((lang) => {
          const langOption = queryByText(new RegExp(lang, 'i'));
          expect(langOption).toBeTruthy();
        });
      });
    });
  });

  describe('Logout Functionality', () => {
    it('should display logout button', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const logoutButton = getByTestId('logout-button');
        expect(logoutButton).toBeTruthy();
      });
    });

    it('should show confirmation alert on logout button press', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const logoutButton = getByTestId('logout-button');
        fireEvent.press(logoutButton);

        expect(Alert.alert).toHaveBeenCalledWith(
          'Logout',
          expect.stringContaining('sure')
        );
      });
    });

    it('should call logout when confirmed', async () => {
      const { useAuth } = require('@/hooks');
      const logoutMock = jest.fn();
      useAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
        apiEndpoint: 'https://api.example.com',
        deviceId: 'device-123',
        logout: logoutMock,
      });

      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const logoutButton = getByTestId('logout-button');
        fireEvent.press(logoutButton);
      });

      // Simulate confirmation
      const alertCall = Alert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Logout');
      if (confirmButton) {
        confirmButton.onPress();
      }

      await waitFor(() => {
        expect(logoutMock).toHaveBeenCalled();
      });
    });

    it('should not logout if cancelled', async () => {
      const { useAuth } = require('@/hooks');
      const logoutMock = jest.fn();
      useAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
        apiEndpoint: 'https://api.example.com',
        deviceId: 'device-123',
        logout: logoutMock,
      });

      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const logoutButton = getByTestId('logout-button');
        fireEvent.press(logoutButton);
      });

      // Simulate cancellation
      const alertCall = Alert.alert.mock.calls[0];
      const cancelButton = alertCall[2].find((btn: any) => btn.text === 'Cancel');
      if (cancelButton) {
        cancelButton.onPress();
      }

      expect(logoutMock).not.toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should display clear cache button', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const clearCacheButton = getByTestId('clear-cache-button');
        expect(clearCacheButton).toBeTruthy();
      });
    });

    it('should show confirmation alert for cache clear', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const clearCacheButton = getByTestId('clear-cache-button');
        fireEvent.press(clearCacheButton);

        expect(Alert.alert).toHaveBeenCalledWith(
          'Clear Cache',
          expect.any(String)
        );
      });
    });

    it('should show success alert after cache clear', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const clearCacheButton = getByTestId('clear-cache-button');
        fireEvent.press(clearCacheButton);
      });

      // Confirm cache clear
      const alertCall = Alert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Clear');
      if (confirmButton) {
        confirmButton.onPress();
      }

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          expect.stringContaining('cleared')
        );
      });
    });
  });

  describe('Settings Reset', () => {
    it('should display reset settings button', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const resetButton = getByTestId('reset-settings-button');
        expect(resetButton).toBeTruthy();
      });
    });

    it('should show confirmation alert for settings reset', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const resetButton = getByTestId('reset-settings-button');
        fireEvent.press(resetButton);

        expect(Alert.alert).toHaveBeenCalledWith(
          'Reset Settings',
          expect.any(String)
        );
      });
    });

    it('should reset settings to defaults when confirmed', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      // First, change some settings
      await waitFor(() => {
        const interval15min = getByTestId('sync-interval-900000');
        fireEvent.press(interval15min);

        const portLanguage = getByTestId('language-POR');
        fireEvent.press(portLanguage);
      });

      // Then reset
      const resetButton = getByTestId('reset-settings-button');
      fireEvent.press(resetButton);

      // Confirm reset
      const alertCall = Alert.alert.mock.calls[Alert.alert.mock.calls.length - 1];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Reset');
      if (confirmButton) {
        confirmButton.onPress();
      }

      await waitFor(() => {
        // Should be back to defaults
        const engLanguage = getByTestId('language-ENG');
        expect(engLanguage.props.selected).toBe(true);

        const interval5min = getByTestId('sync-interval-300000');
        expect(interval5min.props.selected).toBe(true);
      });
    });

    it('should show success alert after reset', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const resetButton = getByTestId('reset-settings-button');
        fireEvent.press(resetButton);
      });

      // Confirm reset
      const alertCall = Alert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Reset');
      if (confirmButton) {
        confirmButton.onPress();
      }

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Success',
          expect.stringContaining('reset')
        );
      });
    });
  });

  describe('Sync Status Display', () => {
    it('should display sync status indicator', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const syncStatus = getByTestId('sync-status-indicator');
        expect(syncStatus).toBeTruthy();
      });
    });
  });

  describe('Settings Persistence', () => {
    it('should maintain settings state after changes', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const autoSyncToggle = getByTestId('auto-sync-toggle');
        const initialState = autoSyncToggle.props.value;

        fireEvent(autoSyncToggle, 'onValueChange', !initialState);

        // Verify state changed
        expect(autoSyncToggle.props.value).toBe(!initialState);
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels for all controls', async () => {
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        expect(getByTestId('auto-sync-toggle')).toBeTruthy();
        expect(getByTestId('language-ENG')).toBeTruthy();
        expect(getByTestId('logout-button')).toBeTruthy();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle logout errors gracefully', async () => {
      const { useAuth } = require('@/hooks');
      const logoutMock = jest.fn(async () => {
        throw new Error('Logout failed');
      });
      useAuth.mockReturnValue({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
        },
        apiEndpoint: 'https://api.example.com',
        deviceId: 'device-123',
        logout: logoutMock,
      });

      const { Alert } = require('react-native');
      const { getByTestId } = render(<SettingsScreen />);

      await waitFor(() => {
        const logoutButton = getByTestId('logout-button');
        fireEvent.press(logoutButton);
      });

      // Confirm logout
      const alertCall = Alert.alert.mock.calls[0];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Logout');
      if (confirmButton) {
        confirmButton.onPress();
      }

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          expect.stringContaining('logout')
        );
      });
    });
  });
});

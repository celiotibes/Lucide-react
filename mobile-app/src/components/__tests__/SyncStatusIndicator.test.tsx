/**
 * SyncStatusIndicator Component Tests
 * Tests for sync progress, conflicts, and manual sync functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SyncStatusIndicator } from '../SyncStatusIndicator';

// Mock the useSyncManager hook
jest.mock('@/hooks/useSyncManager', () => ({
  useSyncManager: jest.fn(() => ({
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
  })),
}));

// Mock theme colors
jest.mock('@/theme/colors', () => ({
  Colors: {
    syncPending: '#FF9800',
    syncError: '#F44336',
    syncSuccess: '#4CAF50',
    syncWarning: '#FFC107',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    primary: '#2196F3',
    text: '#000000',
    textSecondary: '#666666',
    textTertiary: '#999999',
    error: '#F44336',
    warning: '#FFC107',
    white: '#FFFFFF',
  },
}));

describe('SyncStatusIndicator Component', () => {
  const defaultProps = {
    apiBaseURL: 'https://api.example.com',
    deviceId: 'device-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Sync Status Display', () => {
    it('should display sync success status', async () => {
      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/synced/i)).toBeTruthy();
      });
    });

    it('should display syncing status with progress', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 50,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: true,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/syncing/i)).toBeTruthy();
        expect(queryByText(/50.*complete/i)).toBeTruthy();
      });
    });

    it('should display error status', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: { message: 'Network error' },
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/network error/i)).toBeTruthy();
      });
    });

    it('should display conflict status', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [
          { id: 'conflict-1', type: 'version' },
          { id: 'conflict-2', type: 'value' },
        ],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/2 conflicts/i)).toBeTruthy();
      });
    });
  });

  describe('Pending Changes Badge', () => {
    it('should display pending changes count', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 5,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/5 pending change/i)).toBeTruthy();
      });
    });

    it('should display pending changes badge in compact mode', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 3,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} compact={true} />
      );

      await waitFor(() => {
        expect(queryByText('3')).toBeTruthy();
      });
    });

    it('should handle singular pending change', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 1,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/1 pending change(?!s)/i)).toBeTruthy();
      });
    });
  });

  describe('Manual Sync Button', () => {
    it('should trigger sync when button pressed', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const performSyncMock = jest.fn(async () => ({ success: true }));
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: performSyncMock,
      });

      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} testID="sync-button" />
      );

      // Find and press sync button
      const button = getByTestId('sync-button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(performSyncMock).toHaveBeenCalled();
      });
    });

    it('should call onSyncPress callback when provided', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const onSyncPressMock = jest.fn();

      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { getByTestId } = render(
        <SyncStatusIndicator
          {...defaultProps}
          onSyncPress={onSyncPressMock}
          testID="sync-button"
        />
      );

      const button = getByTestId('sync-button');
      fireEvent.press(button);

      await waitFor(() => {
        expect(onSyncPressMock).toHaveBeenCalled();
      });
    });

    it('should disable sync button when syncing', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 50,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: true,
        error: null,
        performSync: jest.fn(),
      });

      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} testID="sync-button" />
      );

      const button = getByTestId('sync-button');
      expect(button.props.disabled).toBe(true);
    });

    it('should disable sync button when offline', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: false,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} testID="sync-button" />
      );

      const button = getByTestId('sync-button');
      expect(button.props.disabled).toBe(true);
    });
  });

  describe('Offline Status', () => {
    it('should display offline message when not online', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: false,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/offline.*sync will resume/i)).toBeTruthy();
      });
    });
  });

  describe('Compact Mode', () => {
    it('should render compact version when compact prop is true', async () => {
      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} compact={true} testID="compact-sync" />
      );

      await waitFor(() => {
        const element = getByTestId('compact-sync');
        expect(element).toBeTruthy();
      });
    });

    it('should display status text in compact mode', async () => {
      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} compact={true} />
      );

      await waitFor(() => {
        expect(queryByText(/synced|syncing/i)).toBeTruthy();
      });
    });
  });

  describe('Last Sync Time Display', () => {
    it('should display last sync time when available', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const lastSyncTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago

      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/last sync/i)).toBeTruthy();
      });
    });
  });

  describe('Progress Bar', () => {
    it('should show progress bar when syncing', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 75,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: true,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/75.*complete/i)).toBeTruthy();
      });
    });

    it('should hide progress bar when not syncing', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: jest.fn(),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/complete/i)).toBeFalsy();
      });
    });
  });
});

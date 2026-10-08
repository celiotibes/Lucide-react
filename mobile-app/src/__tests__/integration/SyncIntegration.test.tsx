/**
 * Sync Status Integration Tests
 * Tests the integration between SyncStatusIndicator and useSyncManager hook
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';

// Mock hook
const mockSyncManager = {
  syncStatus: {
    pendingChanges: 0,
    syncProgress: 0,
    lastSyncTime: Date.now(),
  },
  isOnline: true,
  conflicts: [],
  isSyncing: false,
  error: null,
  performSync: jest.fn(),
};

jest.mock('@/hooks/useSyncManager', () => ({
  useSyncManager: jest.fn(() => mockSyncManager),
}));

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

const defaultProps = {
  apiBaseURL: 'https://api.example.com',
  deviceId: 'device-123',
};

describe('Sync Status Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSyncManager.syncStatus = {
      pendingChanges: 0,
      syncProgress: 0,
      lastSyncTime: Date.now(),
    };
    mockSyncManager.isOnline = true;
    mockSyncManager.conflicts = [];
    mockSyncManager.isSyncing = false;
    mockSyncManager.error = null;
  });

  describe('Sync Progress Flow', () => {
    it('should transition from syncing to synced state', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');

      // Initial syncing state
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isSyncing: true,
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 50,
          lastSyncTime: 0,
        },
      });

      const { queryByText, rerender } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/syncing/i)).toBeTruthy();
        expect(queryByText(/50/)).toBeTruthy();
      });

      // Transition to synced
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isSyncing: false,
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 100,
          lastSyncTime: Date.now(),
        },
      });

      rerender(<SyncStatusIndicator {...defaultProps} />);

      await waitFor(() => {
        expect(queryByText(/synced/i)).toBeTruthy();
      });
    });
  });

  describe('Pending Changes Handling', () => {
    it('should display pending changes count', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        syncStatus: {
          pendingChanges: 3,
          syncProgress: 0,
          lastSyncTime: Date.now(),
        },
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/3 pending change/i)).toBeTruthy();
      });
    });

    it('should sync pending changes when sync button pressed', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        syncStatus: {
          pendingChanges: 2,
          syncProgress: 0,
          lastSyncTime: Date.now(),
        },
        performSync: jest.fn(async () => {
          // Simulate clearing pending changes after sync
          mockSyncManager.syncStatus.pendingChanges = 0;
          return { success: true };
        }),
      });

      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} testID="sync-button" />
      );

      await waitFor(() => {
        const button = getByTestId('sync-button');
        fireEvent.press(button);
      });

      await waitFor(() => {
        expect(useSyncManager().performSync).toHaveBeenCalled();
      });
    });
  });

  describe('Conflict Resolution', () => {
    it('should display conflict indicator', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        conflicts: [
          { id: 'conflict-1', type: 'version' },
          { id: 'conflict-2', type: 'value' },
        ],
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/2 conflicts/i)).toBeTruthy();
      });
    });

    it('should handle offline conflicts gracefully', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isOnline: false,
        conflicts: [{ id: 'conflict-1', type: 'version' }],
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeTruthy();
        expect(queryByText(/conflict/i)).toBeTruthy();
      });
    });
  });

  describe('Online/Offline Transitions', () => {
    it('should handle transition from online to offline', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');

      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isOnline: true,
      });

      const { queryByText, rerender } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/synced/i)).toBeTruthy();
      });

      // Go offline
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isOnline: false,
      });

      rerender(<SyncStatusIndicator {...defaultProps} />);

      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeTruthy();
      });
    });

    it('should disable sync button when offline', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isOnline: false,
      });

      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} testID="sync-button" />
      );

      await waitFor(() => {
        const button = getByTestId('sync-button');
        expect(button.props.disabled).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should display sync error when present', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        error: new Error('Network error'),
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      await waitFor(() => {
        expect(queryByText(/network error/i)).toBeTruthy();
      });
    });

    it('should allow retry after error', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const performSyncMock = jest.fn();

      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        error: new Error('Sync failed'),
        performSync: performSyncMock,
      });

      const { getByTestId } = render(
        <SyncStatusIndicator {...defaultProps} testID="sync-button" />
      );

      await waitFor(() => {
        const button = getByTestId('sync-button');
        fireEvent.press(button);
      });

      await waitFor(() => {
        expect(performSyncMock).toHaveBeenCalled();
      });
    });
  });

  describe('Callback Integration', () => {
    it('should invoke callback when sync starts', async () => {
      const onSyncPressMock = jest.fn();
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        performSync: jest.fn(),
      });

      const { getByTestId } = render(
        <SyncStatusIndicator
          {...defaultProps}
          onSyncPress={onSyncPressMock}
          testID="sync-button"
        />
      );

      await waitFor(() => {
        const button = getByTestId('sync-button');
        fireEvent.press(button);
      });

      await waitFor(() => {
        expect(onSyncPressMock).toHaveBeenCalled();
      });
    });
  });

  describe('Compact Mode Integration', () => {
    it('should show pending count in compact mode', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        syncStatus: {
          pendingChanges: 5,
          syncProgress: 0,
          lastSyncTime: Date.now(),
        },
      });

      const { queryByText } = render(
        <SyncStatusIndicator {...defaultProps} compact={true} />
      );

      await waitFor(() => {
        expect(queryByText('5')).toBeTruthy();
      });
    });
  });

  describe('Multiple Rapid State Changes', () => {
    it('should handle rapid sync state transitions', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');

      // Start syncing
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isSyncing: true,
        syncStatus: {
          pendingChanges: 5,
          syncProgress: 25,
          lastSyncTime: 0,
        },
      });

      const { rerender } = render(
        <SyncStatusIndicator {...defaultProps} />
      );

      // Progress
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isSyncing: true,
        syncStatus: {
          pendingChanges: 5,
          syncProgress: 75,
          lastSyncTime: 0,
        },
      });

      rerender(<SyncStatusIndicator {...defaultProps} />);

      // Complete
      useSyncManager.mockReturnValue({
        ...mockSyncManager,
        isSyncing: false,
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 100,
          lastSyncTime: Date.now(),
        },
      });

      rerender(<SyncStatusIndicator {...defaultProps} />);

      // Component should handle all transitions without crashing
      expect(() => rerender(<SyncStatusIndicator {...defaultProps} />)).not.toThrow();
    });
  });
});

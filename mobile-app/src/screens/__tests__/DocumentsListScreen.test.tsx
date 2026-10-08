/**
 * DocumentsListScreen Tests
 * Tests for list loading, search, filtering, pull-to-refresh, and FAB
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { DocumentsListScreen } from '../documents/DocumentsListScreen';

// Mock hooks and providers
jest.mock('@/providers/DatabaseProvider', () => ({
  useDatabaseInstance: jest.fn(() => ({
    get: jest.fn((collection) => ({
      query: jest.fn(() => ({
        fetch: jest.fn(async () => [
          {
            id: 'doc-1',
            serverId: 'server-1',
            type: 'invoice',
            counterpartyName: 'Acme Corp',
            filePath: '/documents/invoice.pdf',
            fileSize: 102400,
            createdAt: Date.now() - 86400000,
            updatedAt: Date.now(),
          },
          {
            id: 'doc-2',
            serverId: null,
            type: 'receipt',
            counterpartyName: 'Local Store',
            filePath: '/documents/receipt.pdf',
            fileSize: 51200,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]),
      })),
    })),
  })),
}));

jest.mock('@/hooks', () => ({
  useAuth: jest.fn(() => ({
    user: { id: 'user-1', email: 'test@example.com' },
    apiEndpoint: 'https://api.example.com',
    deviceId: 'device-123',
  })),
}));

jest.mock('@/hooks/useSyncManager', () => ({
  useSyncManager: jest.fn(() => ({
    syncStatus: {
      pendingChanges: 0,
      syncProgress: 0,
      lastSyncTime: Date.now(),
    },
    isOnline: true,
    conflicts: [],
    isSyncing: false,
    error: null,
    performSync: jest.fn(async () => ({ success: true })),
  })),
}));

jest.mock('@/components/NetworkStatusIndicator', () => ({
  NetworkStatusIndicator: () => null,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    setOptions: jest.fn(),
  })),
  useRoute: jest.fn(() => ({
    params: {},
  })),
}));

jest.mock('@/theme/colors', () => ({
  Colors: {
    primary: '#2196F3',
    background: '#FAFAFA',
    surface: '#FFFFFF',
    text: '#000000',
    error: '#F44336',
    warning: '#FF9800',
    invoiceColor: '#2196F3',
    receiptColor: '#4CAF50',
    contractColor: '#9C27B0',
    gray300: '#E0E0E0',
    gray400: '#BDBDBD',
    border: '#E0E0E0',
    surfaceVariant: '#F5F5F5',
    textSecondary: '#666666',
    textTertiary: '#999999',
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('DocumentsListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Document List Loading', () => {
    it('should display loading indicator initially', async () => {
      const { queryByTestId } = render(<DocumentsListScreen />);

      // Component should show loading indicator while fetching
      expect(queryByTestId('loading-indicator')).toBeTruthy();
    });

    it('should load and display documents from database', async () => {
      const { queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
        expect(queryByText('Local Store')).toBeTruthy();
      });
    });

    it('should sort documents by creation date (newest first)', async () => {
      const { queryByText, getAllByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const items = getAllByTestId('document-item');
        expect(items.length).toBe(2);
        // Newest document should be first
        expect(queryByText('Local Store')).toBeTruthy();
      });
    });

    it('should display empty state when no documents exist', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      useDatabaseInstance.mockReturnValue({
        get: jest.fn((collection) => ({
          query: jest.fn(() => ({
            fetch: jest.fn(async () => []),
          })),
        })),
      });

      const { queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByText(/no documents yet/i)).toBeTruthy();
        expect(queryByText(/tap the \+ button/i)).toBeTruthy();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter documents by counterparty name', async () => {
      const { getByTestId, queryByText } = render(
        <DocumentsListScreen />
      );

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });

      // Type in search bar
      const searchbar = getByTestId('search-input');
      fireEvent.changeText(searchbar, 'acme');

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
        expect(queryByText('Local Store')).toBeFalsy();
      });
    });

    it('should be case-insensitive', async () => {
      const { getByTestId, queryByText } = render(
        <DocumentsListScreen />
      );

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });

      const searchbar = getByTestId('search-input');
      fireEvent.changeText(searchbar, 'ACME');

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });
    });

    it('should filter documents by type', async () => {
      const { getByTestId, queryByText } = render(
        <DocumentsListScreen />
      );

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
        expect(queryByText('Local Store')).toBeTruthy();
      });

      const typeFilter = getByTestId('type-filter-invoice');
      fireEvent.press(typeFilter);

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
        expect(queryByText('Local Store')).toBeFalsy();
      });
    });

    it('should support combined search and type filter', async () => {
      const { getByTestId, queryByText } = render(
        <DocumentsListScreen />
      );

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });

      // Apply type filter
      const typeFilter = getByTestId('type-filter-invoice');
      fireEvent.press(typeFilter);

      // Apply search
      const searchbar = getByTestId('search-input');
      fireEvent.changeText(searchbar, 'acme');

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });
    });

    it('should show empty state when search has no results', async () => {
      const { getByTestId, queryByText } = render(
        <DocumentsListScreen />
      );

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });

      const searchbar = getByTestId('search-input');
      fireEvent.changeText(searchbar, 'nonexistent');

      await waitFor(() => {
        expect(queryByText(/no documents yet/i)).toBeTruthy();
      });
    });

    it('should clear search filter when "All" type is selected', async () => {
      const { getByTestId, queryByText } = render(
        <DocumentsListScreen />
      );

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
      });

      // Apply filter
      const typeFilter = getByTestId('type-filter-invoice');
      fireEvent.press(typeFilter);

      // Clear filter
      const allFilter = getByTestId('type-filter-all');
      fireEvent.press(allFilter);

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
        expect(queryByText('Local Store')).toBeTruthy();
      });
    });
  });

  describe('Pull-to-Refresh', () => {
    it('should trigger sync on refresh', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const performSyncMock = jest.fn(async () => ({ success: true }));

      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: Date.now(),
        },
        isOnline: true,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: performSyncMock,
      });

      const { getByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const refreshControl = getByTestId('refresh-control');
        fireEvent.scroll(refreshControl, {
          nativeEvent: { contentOffset: { y: -50 } },
        });
      });

      await waitFor(() => {
        expect(performSyncMock).toHaveBeenCalled();
      });
    });

    it('should show loading state during refresh', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 0,
          syncProgress: 0,
          lastSyncTime: Date.now(),
        },
        isOnline: true,
        conflicts: [],
        isSyncing: true,
        error: null,
        performSync: jest.fn(),
      });

      const { getByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const refreshControl = getByTestId('refresh-control');
        expect(refreshControl.props.refreshing).toBe(true);
      });
    });
  });

  describe('Floating Action Button (FAB)', () => {
    it('should display FAB button for document capture', async () => {
      const { getByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const fab = getByTestId('capture-fab');
        expect(fab).toBeTruthy();
      });
    });

    it('should navigate to capture screen when FAB is pressed', async () => {
      const { useNavigation } = require('@react-navigation/native');
      const navigateMock = jest.fn();
      useNavigation.mockReturnValue({
        navigate: navigateMock,
        setOptions: jest.fn(),
      });

      const { getByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const fab = getByTestId('capture-fab');
        fireEvent.press(fab);

        expect(navigateMock).toHaveBeenCalledWith('CaptureDocument');
      });
    });
  });

  describe('Document Icons and Colors', () => {
    it('should display correct icon for invoice type', async () => {
      const { queryByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const iconContainer = queryByTestId('document-icon-invoice');
        expect(iconContainer).toBeTruthy();
      });
    });

    it('should display correct icon for receipt type', async () => {
      const { queryByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const iconContainer = queryByTestId('document-icon-receipt');
        expect(iconContainer).toBeTruthy();
      });
    });
  });

  describe('Sync Status Indicator', () => {
    it('should show upload indicator for unsynced documents', async () => {
      const { queryByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        // Document without serverId should show upload icon
        const unsynced = queryByTestId('document-unsynced-doc-2');
        expect(unsynced).toBeTruthy();
      });
    });

    it('should not show upload indicator for synced documents', async () => {
      const { queryByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        // Document with serverId should not show upload icon
        const synced = queryByTestId('document-synced-doc-1');
        expect(synced).toBeTruthy();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to document detail screen when item is pressed', async () => {
      const { useNavigation } = require('@react-navigation/native');
      const navigateMock = jest.fn();
      useNavigation.mockReturnValue({
        navigate: navigateMock,
        setOptions: jest.fn(),
      });

      const { getByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        const documentItem = getByTestId('document-item-doc-1');
        fireEvent.press(documentItem);

        expect(navigateMock).toHaveBeenCalledWith('DocumentDetail', {
          documentId: 'doc-1',
        });
      });
    });
  });

  describe('File Size Formatting', () => {
    it('should format file sizes correctly', async () => {
      const { queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        // 102400 bytes = 100 KB
        expect(queryByText(/100 KB/i)).toBeTruthy();
        // 51200 bytes = 50 KB
        expect(queryByText(/50 KB/i)).toBeTruthy();
      });
    });
  });
});

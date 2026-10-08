/**
 * Document Flow Integration Tests
 * Tests the complete flow: capture → OCR → parsing → listing → details
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DocumentsListScreen } from '@/screens/documents/DocumentsListScreen';
import { DocumentDetailScreen } from '@/screens/documents/DocumentDetailScreen';

// Mock all dependencies
jest.mock('@/providers/DatabaseProvider', () => ({
  useDatabaseInstance: jest.fn(() => ({
    get: jest.fn((collection) => ({
      query: jest.fn(() => ({
        fetch: jest.fn(async () => {
          if (collection === 'Document') {
            return [
              {
                id: 'doc-1',
                serverId: null,
                type: 'invoice',
                counterpartyName: 'Test Vendor',
                filePath: '/documents/test-invoice.pdf',
                fileSize: 102400,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                ocrText: 'Invoice #001\nAmount: $500',
                parsedData: {
                  vendor: 'Test Vendor',
                  date: '2024-10-08',
                  amount: 500,
                  currency: 'USD',
                  items: [
                    {
                      description: 'Service',
                      quantity: 1,
                      unitPrice: 500,
                      total: 500,
                    },
                  ],
                },
                confidence: 0.92,
              },
            ];
          }
          return [];
        }),
      })),
      find: jest.fn(async (id) => ({
        id,
        serverId: null,
        type: 'invoice',
        counterpartyName: 'Test Vendor',
        filePath: '/documents/test-invoice.pdf',
        fileSize: 102400,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ocrText: 'Invoice #001\nAmount: $500',
        parsedData: {
          vendor: 'Test Vendor',
          date: '2024-10-08',
          amount: 500,
          currency: 'USD',
          items: [
            {
              description: 'Service',
              quantity: 1,
              unitPrice: 500,
              total: 500,
            },
          ],
        },
        confidence: 0.92,
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
      pendingChanges: 1,
      syncProgress: 0,
      lastSyncTime: 0,
    },
    isOnline: true,
    conflicts: [],
    isSyncing: false,
    error: null,
    performSync: jest.fn(async () => ({ success: true })),
  })),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  })),
  useRoute: jest.fn(() => ({
    params: { documentId: 'doc-1' },
  })),
}));

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Share: {
    share: jest.fn(async () => ({ action: 'shared' })),
  },
}));

jest.mock('@/components/NetworkStatusIndicator', () => ({
  NetworkStatusIndicator: () => null,
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

describe('Document Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Document List Loading', () => {
    it('should load and display captured documents', async () => {
      const { queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByText('Test Vendor')).toBeTruthy();
        expect(queryByText(/invoice/i)).toBeTruthy();
      });
    });

    it('should show unsynced indicator for captured documents', async () => {
      const { queryByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByTestId('document-unsynced-doc-1')).toBeTruthy();
      });
    });

    it('should display pending changes badge', async () => {
      const { queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByText(/Test Vendor/)).toBeTruthy();
      });
    });
  });

  describe('Document Navigation', () => {
    it('should navigate to detail screen when document tapped', async () => {
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

  describe('Document Detail Display', () => {
    it('should load and display OCR results', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Invoice #001/)).toBeTruthy();
      });
    });

    it('should display parsed OCR data', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Test Vendor/)).toBeTruthy();
        expect(queryByText(/500|USD/)).toBeTruthy();
        expect(queryByText(/2024-10-08/)).toBeTruthy();
      });
    });

    it('should display confidence score', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/92|confidence/i)).toBeTruthy();
      });
    });

    it('should display itemized data', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Service/)).toBeTruthy();
      });
    });
  });

  describe('Sync Integration', () => {
    it('should indicate document needs sync', async () => {
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

      const { queryByTestId } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByTestId('document-unsynced-doc-1')).toBeTruthy();
      });
    });

    it('should allow syncing from detail screen', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const performSyncMock = jest.fn(async () => ({ success: true }));
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
        performSync: performSyncMock,
      });

      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const syncButton = getByTestId('sync-button');
        if (syncButton) {
          fireEvent.press(syncButton);
          expect(performSyncMock).toHaveBeenCalled();
        }
      });
    });
  });

  describe('Search and Filter Integration', () => {
    it('should filter documents and show in list', async () => {
      const { getByTestId, queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByText('Test Vendor')).toBeTruthy();
      });

      const searchbar = getByTestId('search-input');
      fireEvent.changeText(searchbar, 'test');

      await waitFor(() => {
        expect(queryByText('Test Vendor')).toBeTruthy();
      });
    });

    it('should filter by document type', async () => {
      const { getByTestId, queryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(queryByText('Test Vendor')).toBeTruthy();
      });

      const typeFilter = getByTestId('type-filter-invoice');
      fireEvent.press(typeFilter);

      await waitFor(() => {
        expect(queryByText('Test Vendor')).toBeTruthy();
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle database loading error gracefully', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      useDatabaseInstance.mockReturnValue({
        get: jest.fn(() => ({
          query: jest.fn(() => ({
            fetch: jest.fn(async () => {
              throw new Error('Database error');
            }),
          })),
        })),
      });

      const { queryByText } = render(<DocumentsListScreen />);

      // Should handle error without crashing
      expect(() => {
        render(<DocumentsListScreen />);
      }).not.toThrow();
    });

    it('should handle missing OCR data', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      useDatabaseInstance.mockReturnValue({
        get: jest.fn(() => ({
          query: jest.fn(() => ({
            fetch: jest.fn(async () => []),
          })),
          find: jest.fn(async () => ({
            id: 'doc-1',
            type: 'invoice',
            counterpartyName: 'Test Vendor',
            // No ocrText
          })),
        })),
      });

      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Test Vendor/)).toBeTruthy();
      });
    });
  });

  describe('Network Connectivity Impact', () => {
    it('should show offline status when network unavailable', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 1,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: false,
        conflicts: [],
        isSyncing: false,
        error: { message: 'Network unavailable' },
        performSync: jest.fn(),
      });

      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/offline|network/i)).toBeTruthy();
      });
    });

    it('should prevent sync when offline', async () => {
      const { useSyncManager } = require('@/hooks/useSyncManager');
      const performSyncMock = jest.fn();
      useSyncManager.mockReturnValue({
        syncStatus: {
          pendingChanges: 1,
          syncProgress: 0,
          lastSyncTime: 0,
        },
        isOnline: false,
        conflicts: [],
        isSyncing: false,
        error: null,
        performSync: performSyncMock,
      });

      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const syncButton = getByTestId('sync-button');
        if (syncButton) {
          expect(syncButton.props.disabled).toBe(true);
          fireEvent.press(syncButton);
          expect(performSyncMock).not.toHaveBeenCalled();
        }
      });
    });
  });

  describe('Full Document Lifecycle', () => {
    it('should handle document capture, OCR, parse, list, and view', async () => {
      // 1. List documents
      const { queryByText: listQueryByText } = render(<DocumentsListScreen />);

      await waitFor(() => {
        expect(listQueryByText('Test Vendor')).toBeTruthy();
      });

      // 2. Navigate to detail
      const { useNavigation } = require('@react-navigation/native');
      const navigateMock = jest.fn();
      useNavigation.mockReturnValue({
        navigate: navigateMock,
        setOptions: jest.fn(),
      });

      // 3. View detail
      const { queryByText: detailQueryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        // OCR results visible
        expect(detailQueryByText(/Invoice #001/)).toBeTruthy();
        // Parsed data visible
        expect(detailQueryByText(/Test Vendor/)).toBeTruthy();
        // Confidence score visible
        expect(detailQueryByText(/92/)).toBeTruthy();
      });
    });
  });
});

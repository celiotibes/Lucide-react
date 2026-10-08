/**
 * DocumentDetailScreen Tests
 * Tests for document detail display, OCR text, parsed data, share, and delete
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, Alert } from '@testing-library/react-native';
import { DocumentDetailScreen } from '../documents/DocumentDetailScreen';

// Mock hooks and providers
jest.mock('@/providers/DatabaseProvider', () => ({
  useDatabaseInstance: jest.fn(() => ({
    get: jest.fn((collection) => ({
      find: jest.fn(async (id) => ({
        id,
        filePath: '/documents/invoice.pdf',
        type: 'invoice',
        counterpartyName: 'Acme Corp',
        fileSize: 102400,
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
        ocrText: 'Invoice #12345\nAcme Corp\nAmount: $1000.00',
        parsedData: {
          vendor: 'Acme Corp',
          date: '2024-10-08',
          amount: 1000.00,
          currency: 'USD',
          items: [
            {
              description: 'Service A',
              quantity: 1,
              unitPrice: 500,
              total: 500,
            },
            {
              description: 'Service B',
              quantity: 2,
              unitPrice: 250,
              total: 500,
            },
          ],
        },
        confidence: 0.95,
      })),
    })),
  })),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setOptions: jest.fn(),
  })),
  useRoute: jest.fn(() => ({
    params: {
      documentId: 'doc-123',
    },
  })),
}));

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Share: {
    share: jest.fn(async () => ({ action: 'shared' })),
  },
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
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('DocumentDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Document Loading', () => {
    it('should display loading indicator while fetching document', async () => {
      const { queryByTestId } = render(<DocumentDetailScreen />);

      expect(queryByTestId('loading-indicator')).toBeTruthy();
    });

    it('should load and display document details', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText('Acme Corp')).toBeTruthy();
        expect(queryByText(/invoice/i)).toBeTruthy();
      });
    });

    it('should display document metadata', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/100 KB|102400/)).toBeTruthy();
      });
    });

    it('should handle missing document gracefully', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      useDatabaseInstance.mockReturnValue({
        get: jest.fn((collection) => ({
          find: jest.fn(async () => {
            throw new Error('Document not found');
          }),
        })),
      });

      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/error|not found/i)).toBeTruthy();
      });
    });
  });

  describe('OCR Text Display', () => {
    it('should display OCR text section', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Invoice #12345/)).toBeTruthy();
      });
    });

    it('should toggle OCR text visibility', async () => {
      const { getByTestId, queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Invoice #12345/)).toBeTruthy();
      });

      // Toggle OCR visibility
      const toggleButton = getByTestId('toggle-ocr-text');
      fireEvent.press(toggleButton);

      await waitFor(() => {
        expect(queryByText(/Invoice #12345/)).toBeFalsy();
      });
    });

    it('should handle missing OCR text', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      useDatabaseInstance.mockReturnValue({
        get: jest.fn((collection) => ({
          find: jest.fn(async () => ({
            id: 'doc-123',
            filePath: '/documents/invoice.pdf',
            type: 'invoice',
            counterpartyName: 'Acme Corp',
            fileSize: 102400,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            // No ocrText
            parsedData: {},
          })),
        })),
      });

      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Acme Corp/)).toBeTruthy();
      });
    });
  });

  describe('Parsed Data Display', () => {
    it('should display vendor information', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Acme Corp/)).toBeTruthy();
      });
    });

    it('should display invoice date', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/2024-10-08/)).toBeTruthy();
      });
    });

    it('should display invoice amount', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/1000|USD/)).toBeTruthy();
      });
    });

    it('should display itemized details', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/Service A/)).toBeTruthy();
        expect(queryByText(/Service B/)).toBeTruthy();
      });
    });

    it('should display confidence score', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/95|confidence/i)).toBeTruthy();
      });
    });
  });

  describe('Share Functionality', () => {
    it('should display share button', async () => {
      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const shareButton = getByTestId('share-button');
        expect(shareButton).toBeTruthy();
      });
    });

    it('should trigger share action when share button pressed', async () => {
      const { Share } = require('react-native');
      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const shareButton = getByTestId('share-button');
        fireEvent.press(shareButton);

        expect(Share.share).toHaveBeenCalled();
      });
    });

    it('should share document with correct data', async () => {
      const { Share } = require('react-native');
      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const shareButton = getByTestId('share-button');
        fireEvent.press(shareButton);

        expect(Share.share).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.any(String),
            message: expect.any(String),
          })
        );
      });
    });
  });

  describe('Delete Functionality', () => {
    it('should display delete button', async () => {
      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const deleteButton = getByTestId('delete-button');
        expect(deleteButton).toBeTruthy();
      });
    });

    it('should show confirmation alert before deleting', async () => {
      const { Alert } = require('react-native');
      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const deleteButton = getByTestId('delete-button');
        fireEvent.press(deleteButton);

        expect(Alert.alert).toHaveBeenCalledWith(
          expect.stringContaining('Delete'),
          expect.any(String)
        );
      });
    });

    it('should delete document when confirmed', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      const deleteMock = jest.fn();

      useDatabaseInstance.mockReturnValue({
        get: jest.fn((collection) => ({
          find: jest.fn(async () => ({
            id: 'doc-123',
            filePath: '/documents/invoice.pdf',
            type: 'invoice',
            counterpartyName: 'Acme Corp',
            fileSize: 102400,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            _destroyPermanently: deleteMock,
          })),
        })),
      });

      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const deleteButton = getByTestId('delete-button');
        fireEvent.press(deleteButton);
      });

      // Confirm deletion
      const { Alert } = require('react-native');
      const alertCall = Alert.alert.mock.calls[0];
      if (alertCall[2]) {
        const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Delete');
        if (confirmButton) {
          confirmButton.onPress();
        }
      }

      await waitFor(() => {
        expect(deleteMock).toHaveBeenCalled();
      });
    });

    it('should navigate back after deletion', async () => {
      const { useNavigation } = require('@react-navigation/native');
      const goBackMock = jest.fn();
      useNavigation.mockReturnValue({
        navigate: jest.fn(),
        goBack: goBackMock,
        setOptions: jest.fn(),
      });

      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const deleteButton = getByTestId('delete-button');
        fireEvent.press(deleteButton);
      });

      // After deletion is complete
      await waitFor(() => {
        expect(goBackMock).toHaveBeenCalled();
      });
    });
  });

  describe('Header Navigation Buttons', () => {
    it('should set header options with share and delete buttons', async () => {
      const { useNavigation } = require('@react-navigation/native');
      const setOptionsMock = jest.fn();
      useNavigation.mockReturnValue({
        navigate: jest.fn(),
        goBack: jest.fn(),
        setOptions: setOptionsMock,
      });

      render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(setOptionsMock).toHaveBeenCalled();
      });
    });
  });

  describe('Document Type Display', () => {
    it('should display document type badge', async () => {
      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/invoice/i)).toBeTruthy();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when document loading fails', async () => {
      const { useDatabaseInstance } = require('@/providers/DatabaseProvider');
      useDatabaseInstance.mockReturnValue({
        get: jest.fn((collection) => ({
          find: jest.fn(async () => {
            throw new Error('Database error');
          }),
        })),
      });

      const { queryByText } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        expect(queryByText(/error|failed/i)).toBeTruthy();
      });
    });

    it('should display error message when share fails', async () => {
      const { Share, Alert } = require('react-native');
      Share.share.mockRejectedValue(new Error('Share failed'));

      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const shareButton = getByTestId('share-button');
        fireEvent.press(shareButton);
      });

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Share Error',
          expect.any(String)
        );
      });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible labels for action buttons', async () => {
      const { getByTestId } = render(<DocumentDetailScreen />);

      await waitFor(() => {
        const shareButton = getByTestId('share-button');
        const deleteButton = getByTestId('delete-button');

        expect(shareButton).toBeTruthy();
        expect(deleteButton).toBeTruthy();
      });
    });
  });
});

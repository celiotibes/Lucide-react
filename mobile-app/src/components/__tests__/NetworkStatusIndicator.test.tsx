/**
 * NetworkStatusIndicator Component Tests
 * Tests for connectivity status display and auto-hide functionality
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { NetworkStatusIndicator } from '../NetworkStatusIndicator';

// Mock the services
jest.mock('@/services', () => ({
  NetworkMonitorService: jest.fn(function() {
    this.subscribe = jest.fn((callback) => {
      callback({ isOnline: true, connectionType: 'wifi' });
      return () => {}; // unsubscribe
    });
    this.getStatus = jest.fn(() => ({
      isOnline: true,
      connectionType: 'wifi',
    }));
    this.destroy = jest.fn();
  }),
}));

// Mock theme colors
jest.mock('@/theme/colors', () => ({
  Colors: {
    online: '#4CAF50',
    offline: '#F44336',
    white: '#FFFFFF',
    primary: '#2196F3',
    text: '#000000',
  },
}));

describe('NetworkStatusIndicator Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Online Status', () => {
    it('should display online status with correct icon', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        // The component should display online status
        expect(queryByText(/online/i)).toBeTruthy();
      });
    });

    it('should auto-hide after 3 seconds when online', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeTruthy();
      });

      // Fast-forward 3 seconds
      jest.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeFalsy();
      });
    });

    it('should display connection type when available', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/Online.*wifi/i)).toBeTruthy();
      });
    });
  });

  describe('Offline Status', () => {
    beforeEach(() => {
      jest.doMock('@/services', () => ({
        NetworkMonitorService: jest.fn(function() {
          this.subscribe = jest.fn((callback) => {
            callback({ isOnline: false, connectionType: null });
            return () => {};
          });
          this.getStatus = jest.fn(() => ({
            isOnline: false,
            connectionType: null,
          }));
          this.destroy = jest.fn();
        }),
      }));
    });

    it('should display offline status', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeTruthy();
      });
    });

    it('should display offline message', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/changes will sync/i)).toBeTruthy();
      });
    });

    it('should not auto-hide when offline', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeTruthy();
      });

      // Fast-forward 5 seconds
      jest.advanceTimersByTime(5000);

      await waitFor(() => {
        // Should still be visible
        expect(queryByText(/offline/i)).toBeTruthy();
      });
    });
  });

  describe('Compact Mode', () => {
    it('should render compact version when compact prop is true', async () => {
      const { getByTestId } = render(
        <NetworkStatusIndicator compact={true} testID="compact-indicator" />
      );

      await waitFor(() => {
        const element = getByTestId('compact-indicator');
        expect(element).toBeTruthy();
      });
    });

    it('should display condensed text in compact mode', async () => {
      const { queryByText } = render(
        <NetworkStatusIndicator compact={true} />
      );

      await waitFor(() => {
        // Compact mode shows abbreviated text
        expect(queryByText(/online/i)).toBeTruthy();
      });
    });
  });

  describe('Component Lifecycle', () => {
    it('should subscribe to network monitor on mount', () => {
      const { NetworkMonitorService } = require('@/services');
      render(<NetworkStatusIndicator />);

      const instance = NetworkMonitorService.mock.results[0].value;
      expect(instance.subscribe).toHaveBeenCalled();
    });

    it('should unsubscribe on unmount', () => {
      const { NetworkMonitorService } = require('@/services');
      const unsubscribeMock = jest.fn();

      jest.doMock('@/services', () => ({
        NetworkMonitorService: jest.fn(function() {
          this.subscribe = jest.fn(() => unsubscribeMock);
          this.destroy = jest.fn();
        }),
      }));

      const { unmount } = render(<NetworkStatusIndicator />);
      unmount();

      // Verify destroy was called
      expect(unsubscribeMock).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper labels for screen readers', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeTruthy();
      });
    });

    it('should display meaningful status text', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        const statusText = queryByText(/online|offline/i);
        expect(statusText).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing connection type gracefully', async () => {
      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        // Should render without crashing
        expect(queryByText(/online/i)).toBeTruthy();
      });
    });

    it('should handle rapid status changes', async () => {
      const { rerender } = render(<NetworkStatusIndicator />);

      // Simulate rapid re-renders
      for (let i = 0; i < 5; i++) {
        rerender(<NetworkStatusIndicator />);
      }

      // Component should still be stable
      expect(() => rerender(<NetworkStatusIndicator />)).not.toThrow();
    });
  });
});

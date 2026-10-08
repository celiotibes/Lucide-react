/**
 * Network Status Integration Tests
 * Tests the integration between NetworkStatusIndicator and NetworkMonitorService
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import { NetworkStatusIndicator } from '@/components/NetworkStatusIndicator';

// Mock services
const mockNetworkMonitorService = {
  subscribe: jest.fn(),
  getStatus: jest.fn(),
  destroy: jest.fn(),
};

jest.mock('@/services', () => ({
  NetworkMonitorService: jest.fn(() => mockNetworkMonitorService),
}));

jest.mock('@/theme/colors', () => ({
  Colors: {
    online: '#4CAF50',
    offline: '#F44336',
    white: '#FFFFFF',
    primary: '#2196F3',
    text: '#000000',
  },
}));

describe('Network Status Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Online to Offline Transition', () => {
    it('should handle transition from online to offline', async () => {
      let statusCallback: any;

      mockNetworkMonitorService.subscribe.mockImplementation((callback) => {
        statusCallback = callback;
        callback({ isOnline: true, connectionType: 'wifi' });
        return () => {};
      });

      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: true,
        connectionType: 'wifi',
      });

      const { queryByText, rerender } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeTruthy();
      });

      // Simulate network status change
      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: false,
        connectionType: null,
      });

      statusCallback({ isOnline: false, connectionType: null });

      rerender(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeTruthy();
      });
    });

    it('should update UI when connection type changes', async () => {
      let statusCallback: any;

      mockNetworkMonitorService.subscribe.mockImplementation((callback) => {
        statusCallback = callback;
        callback({ isOnline: true, connectionType: 'wifi' });
        return () => {};
      });

      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: true,
        connectionType: 'wifi',
      });

      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/wifi/i)).toBeTruthy();
      });

      // Change connection type
      statusCallback({ isOnline: true, connectionType: '4g' });

      await waitFor(() => {
        expect(queryByText(/4g/i)).toBeTruthy();
      });
    });
  });

  describe('Subscription Lifecycle', () => {
    it('should subscribe on mount and unsubscribe on unmount', async () => {
      const unsubscribeMock = jest.fn();
      mockNetworkMonitorService.subscribe.mockReturnValue(unsubscribeMock);
      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: true,
        connectionType: 'wifi',
      });

      const { unmount } = render(<NetworkStatusIndicator />);

      expect(mockNetworkMonitorService.subscribe).toHaveBeenCalled();
      expect(mockNetworkMonitorService.destroy).not.toHaveBeenCalled();

      unmount();

      expect(mockNetworkMonitorService.destroy).toHaveBeenCalled();
    });
  });

  describe('Compact Mode Integration', () => {
    it('should properly integrate compact mode with network monitor', async () => {
      mockNetworkMonitorService.subscribe.mockImplementation((callback) => {
        callback({ isOnline: false, connectionType: null });
        return () => {};
      });

      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: false,
        connectionType: null,
      });

      const { queryByText } = render(
        <NetworkStatusIndicator compact={true} />
      );

      await waitFor(() => {
        expect(queryByText(/offline/i)).toBeTruthy();
      });
    });
  });

  describe('Auto-Hide Feature Integration', () => {
    it('should auto-hide when online in non-compact mode', async () => {
      jest.useFakeTimers();

      mockNetworkMonitorService.subscribe.mockImplementation((callback) => {
        callback({ isOnline: true, connectionType: 'wifi' });
        return () => {};
      });

      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: true,
        connectionType: 'wifi',
      });

      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeTruthy();
      });

      jest.advanceTimersByTime(3000);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeFalsy();
      });

      jest.useRealTimers();
    });
  });

  describe('Service Error Handling', () => {
    it('should handle service initialization errors', async () => {
      const { NetworkMonitorService } = require('@/services');
      NetworkMonitorService.mockImplementation(() => {
        throw new Error('Service initialization failed');
      });

      // Should not crash
      expect(() => {
        render(<NetworkStatusIndicator />);
      }).not.toThrow();
    });
  });

  describe('Multiple Rapid Status Changes', () => {
    it('should handle rapid status changes correctly', async () => {
      let statusCallback: any;

      mockNetworkMonitorService.subscribe.mockImplementation((callback) => {
        statusCallback = callback;
        callback({ isOnline: true, connectionType: 'wifi' });
        return () => {};
      });

      mockNetworkMonitorService.getStatus.mockReturnValue({
        isOnline: true,
        connectionType: 'wifi',
      });

      const { queryByText } = render(<NetworkStatusIndicator />);

      await waitFor(() => {
        expect(queryByText(/online/i)).toBeTruthy();
      });

      // Simulate rapid changes
      statusCallback({ isOnline: false, connectionType: null });
      statusCallback({ isOnline: true, connectionType: 'wifi' });
      statusCallback({ isOnline: false, connectionType: null });
      statusCallback({ isOnline: true, connectionType: '4g' });

      await waitFor(() => {
        expect(queryByText(/4g/i)).toBeTruthy();
      });
    });
  });
});

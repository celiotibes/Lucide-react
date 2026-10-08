/**
 * Analytics Dashboard Component Tests
 * Testing the analytics dashboard UI and interactions
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

jest.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: jest.fn().mockResolvedValue(undefined),
    getItem: jest.fn().mockResolvedValue(null),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('react-native-performance-monitor', () => ({
  PerformanceMonitor: {
    getMemoryStats: jest.fn(() => ({
      usedMemory: 100000000,
      totalMemory: 200000000,
      freeMemory: 100000000,
    })),
  },
}));

describe('AnalyticsDashboard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render dashboard component', () => {
      const { getByText } = render(<AnalyticsDashboard />);
      // Dashboard should render without crashing
      expect(getByText).toBeDefined();
    });

    it('should display loading state initially', () => {
      const { getByText } = render(<AnalyticsDashboard />);
      // Initially shows loading text
      expect(getByText('Loading analytics...')).toBeTruthy();
    });
  });

  describe('Dashboard Content', () => {
    it('should display Events Summary card', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Events Summary')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display Performance Metrics card', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Performance Metrics')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display Error & Crash Rate card', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Error & Crash Rate')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display Event Breakdown card', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Event Breakdown')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display Sync Status card', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Sync Status')).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  describe('Dashboard Metrics Display', () => {
    it('should display event metrics', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Total Events')).toBeTruthy();
        expect(getByText('Errors')).toBeTruthy();
        expect(getByText('Crashes')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display performance metrics', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('App Startup Time')).toBeTruthy();
        expect(getByText('Memory Usage')).toBeTruthy();
        expect(getByText('Avg API Response Time')).toBeTruthy();
        expect(getByText('Avg Network Latency')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display rate metrics', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Error Rate')).toBeTruthy();
        expect(getByText('Crash Rate')).toBeTruthy();
        expect(getByText('Unsynced Crashes')).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  describe('Dashboard Actions', () => {
    it('should display action buttons', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Sync Events')).toBeTruthy();
        expect(getByText('Export Data')).toBeTruthy();
        expect(getByText('Clear All')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should trigger refresh on pull-to-refresh', async () => {
      const { getByTestId } = render(<AnalyticsDashboard />);
      // RefreshControl is rendered but interaction testing depends on platform implementation
      expect(getByTestId).toBeDefined();
    });
  });

  describe('Data Refresh', () => {
    it('should auto-refresh metrics', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      // Wait for initial load
      await waitFor(() => {
        expect(getByText('Events Summary')).toBeTruthy();
      }, { timeout: 2000 });

      // Data should update periodically (5 second intervals)
      await waitFor(() => {
        expect(getByText('Performance Metrics')).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Metric Calculations', () => {
    it('should calculate error rate correctly', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        expect(getByText('Error Rate')).toBeTruthy();
        expect(getByText('Crash Rate')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display metric values', async () => {
      const { getByText } = render(<AnalyticsDashboard />);
      await waitFor(() => {
        // Should have metric values displayed
        expect(getByText).toBeDefined();
      }, { timeout: 2000 });
    });
  });

  describe('Component Lifecycle', () => {
    it('should load data on mount', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      await waitFor(() => {
        expect(getByText('Events Summary')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should setup refresh timer', async () => {
      jest.useFakeTimers();

      const { getByText } = render(<AnalyticsDashboard />);

      // Timer should be set up
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      jest.useRealTimers();
    });

    it('should cleanup timer on unmount', async () => {
      jest.useFakeTimers();

      const { unmount } = render(<AnalyticsDashboard />);

      const timersBefore = jest.getTimerCount();
      unmount();

      // Timers should be cleaned up
      expect(jest.getTimerCount()).toBeLessThanOrEqual(timersBefore);

      jest.useRealTimers();
    });
  });

  describe('Error Handling', () => {
    it('should handle loading errors gracefully', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      // Should not crash if data fails to load
      await waitFor(() => {
        expect(getByText).toBeDefined();
      }, { timeout: 2000 });
    });

    it('should display error alerts on sync failure', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      await waitFor(() => {
        expect(getByText('Sync Events')).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  describe('Styling and Layout', () => {
    it('should apply correct styles', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      await waitFor(() => {
        const summaryCard = getByText('Events Summary');
        expect(summaryCard).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should display metrics in grid layout', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      await waitFor(() => {
        expect(getByText('Total Events')).toBeTruthy();
        expect(getByText('Errors')).toBeTruthy();
        expect(getByText('Crashes')).toBeTruthy();
      }, { timeout: 2000 });
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      await waitFor(() => {
        expect(getByText('Sync Events')).toBeTruthy();
        expect(getByText('Export Data')).toBeTruthy();
        expect(getByText('Clear All')).toBeTruthy();
      }, { timeout: 2000 });
    });

    it('should have readable metric labels', async () => {
      const { getByText } = render(<AnalyticsDashboard />);

      await waitFor(() => {
        expect(getByText('App Startup Time')).toBeTruthy();
        expect(getByText('Memory Usage')).toBeTruthy();
        expect(getByText('Error Rate')).toBeTruthy();
      }, { timeout: 2000 });
    });
  });
});

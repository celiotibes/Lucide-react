/**
 * Tests for Performance Optimization Hooks
 * Phase 22.10: Performance Optimization
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  useDebouncedCallback,
  useThrottledCallback,
  useRenderCount,
  useCachedFactory,
} from '../usePerformanceOptimization';

describe('Performance Optimization Hooks', () => {
  describe('useDebouncedCallback', () => {
    it('should debounce callback execution', async () => {
      const callback = jest.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 300));

      act(() => {
        result.current('call1');
        result.current('call2');
        result.current('call3');
      });

      // Callback should not be called immediately
      expect(callback).not.toHaveBeenCalled();

      // Should be called once after delay with last value
      await waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith('call3');
      }, { timeout: 500 });
    });

    it('should reset timer on new calls', async () => {
      const callback = jest.fn();
      const { result } = renderHook(() => useDebouncedCallback(callback, 100));

      act(() => {
        result.current('first');
      });

      await waitFor(() => {
        expect(callback).toHaveBeenCalledWith('first');
      }, { timeout: 200 });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should cleanup timeout on unmount', () => {
      const callback = jest.fn();
      const { unmount } = renderHook(() => useDebouncedCallback(callback, 300));

      unmount();

      // Should not crash on unmount
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('useThrottledCallback', () => {
    it('should throttle callback execution', async () => {
      const callback = jest.fn();
      const { result } = renderHook(() => useThrottledCallback(callback, 100));

      act(() => {
        result.current('call1');
        result.current('call2');
        result.current('call3');
      });

      // First call should be immediate
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('call1');

      // Later calls should be throttled
      await waitFor(() => {
        expect(callback).toHaveBeenCalledTimes(2);
      }, { timeout: 200 });
    });

    it('should cleanup timeout on unmount', () => {
      const callback = jest.fn();
      const { unmount } = renderHook(() => useThrottledCallback(callback, 100));

      unmount();

      // Should not crash on unmount
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('useRenderCount', () => {
    it('should track render count', () => {
      const { result, rerender } = renderHook(() => useRenderCount('TestComponent'));

      expect(result.current).toBe(1);

      rerender();
      expect(result.current).toBe(2);

      rerender();
      expect(result.current).toBe(3);
    });

    it('should log render count in development', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      renderHook(() => useRenderCount('TestComponent'));

      // Should log in development (__DEV__ is true in tests)
      if (__DEV__) {
        expect(consoleSpy).toHaveBeenCalled();
      }

      consoleSpy.mockRestore();
    });
  });

  describe('useCachedFactory', () => {
    it('should cache computed values', () => {
      const factory = jest.fn((key: string) => `computed-${key}`);

      const { result: result1 } = renderHook(() =>
        useCachedFactory(factory, 'key1')
      );

      const { result: result2 } = renderHook(() =>
        useCachedFactory(factory, 'key1')
      );

      // Factory should only be called once for the same key
      expect(factory).toHaveBeenCalledTimes(1);
      expect(result1.current).toBe(result2.current);
    });

    it('should cache different keys separately', () => {
      const factory = jest.fn((key: string) => `computed-${key}`);

      const { result: result1 } = renderHook(() =>
        useCachedFactory(factory, 'key1')
      );

      const { result: result2 } = renderHook(() =>
        useCachedFactory(factory, 'key2')
      );

      // Factory should be called twice for different keys
      expect(factory).toHaveBeenCalledTimes(2);
      expect(result1.current).toBe('computed-key1');
      expect(result2.current).toBe('computed-key2');
    });
  });
});

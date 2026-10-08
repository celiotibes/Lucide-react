/**
 * Performance Optimization Hooks
 * Utilities for memoization, debouncing, and optimizing renders
 */

import React, { useCallback, useMemo, useRef, useEffect, DependencyList } from 'react';
import { performanceMonitor } from './performanceMonitor';

/**
 * Debounced callback hook
 * Delays function execution until a specified time has passed without new calls
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  deps?: DependencyList
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastRunRef = useRef<number>(0);

  const debouncedCallback = useCallback(
    (...args: any[]) => {
      const now = Date.now();

      const clearTimer = () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };

      clearTimer();

      timeoutRef.current = setTimeout(() => {
        lastRunRef.current = now;
        callback(...args);
      }, delay);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps ? [...deps, callback, delay] : [callback, delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback as T;
}

/**
 * Throttled callback hook
 * Ensures function is not called more than once per specified time interval
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number,
  deps?: DependencyList
): T {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const throttledCallback = useCallback(
    (...args: any[]) => {
      const now = Date.now();

      if (now >= lastRunRef.current + interval) {
        lastRunRef.current = now;
        callback(...args);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(
          () => {
            lastRunRef.current = Date.now();
            callback(...args);
          },
          interval - (now - lastRunRef.current)
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps ? [...deps, callback, interval] : [callback, interval]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback as T;
}

/**
 * Memoized expensive computation
 * Caches result and only recalculates when dependencies change
 */
export function useMemoizedComputation<T>(
  factory: () => T,
  deps: DependencyList,
  options?: { measureName?: string }
): T {
  return useMemo(() => {
    if (options?.measureName) {
      return performanceMonitor.measure(options.measureName, factory);
    }
    return factory();
  }, deps);
}

/**
 * Async memoization hook for async operations
 * Caches the result of async operations to avoid redundant calls
 */
export function useMemoizedAsync<T>(
  asyncFactory: () => Promise<T>,
  deps: DependencyList,
  options?: { measureName?: string }
): T | null {
  const [result, setResult] = React.useState<T | null>(null);
  const cacheRef = useRef<T | null>(null);

  const memoFactory = useMemo(
    () => asyncFactory,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );

  useEffect(() => {
    const execute = async () => {
      if (options?.measureName) {
        const cached = await performanceMonitor.measureAsync(
          options.measureName,
          memoFactory
        );
        cacheRef.current = cached;
        setResult(cached);
      } else {
        const value = await memoFactory();
        cacheRef.current = value;
        setResult(value);
      }
    };

    execute();
  }, [memoFactory, options?.measureName]);

  return result ?? cacheRef.current;
}

/**
 * Track render count for debugging
 */
export function useRenderCount(componentName?: string): number {
  const countRef = useRef(0);

  useEffect(() => {
    countRef.current++;
    if (__DEV__ && componentName) {
      console.log(`${componentName} rendered ${countRef.current} times`);
    }
  });

  return countRef.current;
}

/**
 * Cleanup effect that prevents memory leaks
 */
export function useCleanup(cleanupFn: () => void, deps?: DependencyList): void {
  useEffect(() => {
    return cleanupFn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Memoize a factory function with cache key
 */
export function useCachedFactory<T>(
  factory: (key: string) => T,
  key: string,
  deps?: DependencyList
): T {
  const cacheRef = useRef<Map<string, T>>(new Map());

  return useMemo(() => {
    if (!cacheRef.current.has(key)) {
      cacheRef.current.set(key, factory(key));
    }
    return cacheRef.current.get(key)!;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factory, key, ...(deps ?? [])]);
}

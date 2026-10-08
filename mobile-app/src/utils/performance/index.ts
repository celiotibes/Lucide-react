/**
 * Performance Optimization Module
 * Central export point for all performance utilities
 */

export { performanceMonitor, withPerformanceMonitoring } from './performanceMonitor';
export {
  useDebouncedCallback,
  useThrottledCallback,
  useMemoizedComputation,
  useMemoizedAsync,
  useRenderCount,
  useCleanup,
  useCachedFactory,
} from './usePerformanceOptimization';
export { useOptimizedDocuments, type DocumentListItem } from './useOptimizedDocuments';

/**
 * Performance Optimization Module
 * Central export point for all performance utilities
 *
 * Includes:
 * - Performance monitoring and profiling
 * - Battery optimization and adaptive sync
 * - Background task scheduling
 * - Power state management
 */

// Performance monitoring
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

// Battery optimization (Phase 22.15)
export {
  batteryOptimizationService,
  BatteryStatus,
  ChargingState,
  type BatteryState,
  type BatteryImpactMetric,
  type SyncIntervalConfig,
} from './batteryOptimizationService';

// Background task scheduling (Phase 22.15)
export {
  backgroundTaskScheduler,
  TaskPriority,
  TaskStatus,
  TaskTrigger,
  type BackgroundTask,
  type TaskCondition,
  type TaskMetrics,
} from './backgroundTaskScheduler';

// Power state context (Phase 22.15)
export {
  PowerStateProvider,
  usePowerState,
  useFeatureAvailability,
  useOptimizedSyncInterval,
  useFeatureBatteryTracking,
  useBatteryStatusString,
  useLowBatteryWarning,
  useMemoryOptimization,
  type PowerStateContextType,
  type PowerStateProviderProps,
} from './powerStateContext';

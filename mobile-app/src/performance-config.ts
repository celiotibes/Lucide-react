/**
 * Mobile App Performance Configuration
 * Phase 22.17 — Performance & Optimization
 *
 * Centralizes all performance-related settings for React Native/Expo mobile app:
 * - FlatList virtualization parameters
 * - Image optimization strategies
 * - Sync interval tuning
 * - Memory management
 * - Battery-aware features
 */

import { Platform } from 'react-native';

/**
 * FlatList Virtualization Settings
 * Optimizes rendering of large lists by only keeping visible + buffer items in memory
 */
export const FLATLIST_CONFIG = {
  /** Number of items to render in each batch during scroll */
  maxToRenderPerBatch: 10,

  /** Initial number of items rendered when list first loads */
  initialNumToRender: 10,

  /** Number of items to keep rendered when scrolling stops */
  updateCellsBatchingPeriod: 50,

  /** Size of the render window (items before/after visible area) */
  windowSize: 21,

  /** Threshold for onEndReached callback (0.5 = trigger at 50% from bottom) */
  onEndReachedThreshold: 0.5,

  /** Remove items that are not visible from React Native views */
  removeClippedSubviews: Platform.OS === 'android', // More aggressive on Android

  /** Enable VirtualizedList optimization for pure data lists */
  viewabilityConfig: {
    minimumViewTime: 300,
    viewAreaCoveragePercentThreshold: 95,
  },
} as const;

/**
 * Image Optimization Settings
 * Defines caching, resizing, and format strategies
 */
export const IMAGE_CONFIG = {
  /** Cache directory for processed images */
  cacheDir: `${Platform.OS === 'ios' ? 'Documents' : 'Cache'}/images`,

  /** Thumbnail dimensions for list views */
  thumbnailSize: {
    width: 120,
    height: 120,
  },

  /** Detail view image dimensions */
  detailSize: {
    width: 600,
    height: 600,
  },

  /** WebP quality for compressed images (0-100) */
  quality: 80,

  /** Fallback to JPEG for older devices */
  fallbackFormat: 'jpeg',

  /** Cache expiry (ms) — 30 days */
  cacheTTL: 30 * 24 * 60 * 60 * 1000,

  /** Maximum cache size (MB) */
  maxCacheSize: 100,
} as const;

/**
 * Synchronization Configuration
 * Controls background sync intervals and battery-aware behavior
 */
export const SYNC_CONFIG = {
  /** Default sync interval when battery is healthy (ms) */
  defaultInterval: 15 * 60 * 1000, // 15 minutes

  /** Aggressive sync interval when on charger (ms) */
  onChargerInterval: 5 * 60 * 1000, // 5 minutes

  /** Conservative sync interval in low battery mode (ms) */
  lowBatteryInterval: 60 * 60 * 1000, // 1 hour

  /** Battery threshold for low battery mode (0-1) */
  lowBatteryThreshold: 0.2, // 20%

  /** Disable sync entirely below this threshold (0-1) */
  criticalBatteryThreshold: 0.05, // 5%

  /** WiFi-only sync to save mobile data */
  wifiOnlyMode: false,

  /** Batch size for sync operations */
  batchSize: 100,

  /** Request timeout (ms) */
  timeout: 30000,

  /** Retry attempts before giving up */
  maxRetries: 3,

  /** Exponential backoff for retries (base multiplier) */
  backoffMultiplier: 2,
} as const;

/**
 * Memory Management Settings
 * Helps prevent memory leaks and OOM crashes
 */
export const MEMORY_CONFIG = {
  /** Enable aggressive garbage collection monitoring */
  enableGCMonitoring: Platform.OS === 'android',

  /** Warn if memory usage exceeds this percentage of available (0-1) */
  memoryWarningThreshold: 0.8,

  /** Memory thresholds for different app states */
  thresholds: {
    idle: 50 * 1024 * 1024, // 50MB
    moderate: 100 * 1024 * 1024, // 100MB
    critical: 150 * 1024 * 1024, // 150MB
  },

  /** Clear cache/temp files when memory pressure detected */
  autoClearCacheOnPressure: true,

  /** Maximum image cache entries in memory */
  maxImageCacheEntries: 50,

  /** Enable dev memory profiling (only in dev builds) */
  profiling: __DEV__,
} as const;

/**
 * WatermelonDB Performance Tuning
 * Optimizes database queries and indexing
 */
export const DATABASE_CONFIG = {
  /** Enable aggressive query optimization */
  optimizeQueries: true,

  /** Batch inserts/updates in chunks of N items */
  batchSize: 500,

  /** High-frequency query indexes (must align with actual usage) */
  indexes: {
    // Transactions: most queries are by property + date range
    transactions: ['property_id', 'date'],

    // Properties: often filtered by status or owner
    properties: ['status', 'owner_id'],

    // Accounts: balance lookups are frequent
    accounts: ['property_id', 'account_type'],

    // Sync status: need to find incomplete syncs
    syncQueue: ['status', 'created_at'],
  },

  /** Enable WAL mode for better concurrency (if SQLite) */
  walMode: true,

  /** Query timeout (ms) */
  queryTimeout: 10000,
} as const;

/**
 * Adaptive Performance Mode
 * Automatically adjusts settings based on device capabilities and system state
 */
export const ADAPTIVE_CONFIG = {
  /** Detect device performance tier and adjust accordingly */
  enableAdaptiveMode: true,

  /** Device performance thresholds (RAM in MB) */
  performanceTiers: {
    lowEnd: 2048, // < 2GB RAM
    midRange: 4096, // 2-4GB RAM
    highEnd: Infinity, // 4GB+ RAM
  },

  /** Adaptive settings per tier */
  tierSettings: {
    lowEnd: {
      maxToRenderPerBatch: 5,
      initialNumToRender: 5,
      imageQuality: 60,
      syncInterval: 30 * 60 * 1000, // 30 min
    },
    midRange: {
      maxToRenderPerBatch: 10,
      initialNumToRender: 10,
      imageQuality: 80,
      syncInterval: 15 * 60 * 1000, // 15 min
    },
    highEnd: {
      maxToRenderPerBatch: 20,
      initialNumToRender: 20,
      imageQuality: 85,
      syncInterval: 5 * 60 * 1000, // 5 min
    },
  },

  /** Detect network conditions and adjust */
  enableNetworkAwareness: true,

  /** Network condition settings */
  networkSettings: {
    '4g': { batchSize: 100, timeout: 30000 },
    '3g': { batchSize: 50, timeout: 45000 },
    '2g': { batchSize: 25, timeout: 60000 },
    wifi: { batchSize: 200, timeout: 30000 },
  },
} as const;

/**
 * Battery Optimization
 * Monitors and adjusts behavior to minimize battery drain
 */
export const BATTERY_CONFIG = {
  /** Enable battery monitoring */
  enableBatteryMonitoring: true,

  /** Polling interval for battery check (ms) */
  batteryCheckInterval: 60000, // 1 minute

  /** Disable location services when battery low */
  disableLocationOnLowBattery: true,

  /** Disable animations when battery critical */
  disableAnimationsOnCritical: true,

  /** Disable background image processing on low battery */
  disableBackgroundProcessing: true,

  /** Dim screen after 30s of inactivity on low battery */
  screenDimDelayOnLowBattery: 30000,

  /** Aggressive sync pause at critical battery */
  pauseSyncOnCritical: true,
} as const;

/**
 * Network Optimization
 * Reduces data usage and improves reliability
 */
export const NETWORK_CONFIG = {
  /** Compress request/response bodies */
  enableCompression: true,

  /** Use HTTP/2 multiplexing if available */
  enableMultiplexing: true,

  /** Cache responses with Cache-Control headers */
  enableHTTPCaching: true,

  /** Retry transient network errors */
  enableAutoRetry: true,

  /** Max retries before giving up */
  maxRetries: 3,

  /** Enable request coalescing (deduplicate identical requests) */
  enableRequestCoalescing: true,

  /** Batch API requests to reduce roundtrips */
  enableRequestBatching: true,

  /** Max requests per batch */
  maxBatchSize: 10,

  /** Offline queue enabled for non-GET requests */
  enableOfflineQueue: true,

  /** Max offline queue size */
  maxQueueSize: 100,
} as const;

/**
 * Logging & Monitoring Configuration
 * Development-only performance profiling
 */
export const MONITORING_CONFIG = {
  /** Enable render performance logging */
  enableRenderLogging: __DEV__,

  /** Log component render times (ms threshold) */
  renderThreshold: 100,

  /** Enable API request profiling */
  enableNetworkLogging: __DEV__,

  /** Log requests slower than (ms) */
  networkThreshold: 500,

  /** Enable database query profiling */
  enableQueryLogging: __DEV__,

  /** Log queries slower than (ms) */
  queryThreshold: 100,

  /** Enable memory usage monitoring */
  enableMemoryLogging: __DEV__,

  /** Check memory every N seconds */
  memoryCheckInterval: 5,

  /** Sentry error tracking enabled in production */
  enableErrorTracking: !__DEV__,

  /** Sentry DSN (loaded from env) */
  sentryDSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
} as const;

/**
 * Get optimal settings based on current device state
 */
export function getAdaptiveSettings(deviceInfo: {
  ramMB: number;
  networkType: '4g' | '3g' | '2g' | 'wifi';
  batteryLevel: number;
  isCharging: boolean;
  isLowPowerMode: boolean;
}) {
  const settings = {
    ...SYNC_CONFIG,
    ...IMAGE_CONFIG,
    ...FLATLIST_CONFIG,
  };

  // Adjust based on device tier
  if (ADAPTIVE_CONFIG.enableAdaptiveMode) {
    const tier =
      deviceInfo.ramMB < ADAPTIVE_CONFIG.performanceTiers.lowEnd
        ? 'lowEnd'
        : deviceInfo.ramMB < ADAPTIVE_CONFIG.performanceTiers.midRange
          ? 'midRange'
          : 'highEnd';

    const tierSettings = ADAPTIVE_CONFIG.tierSettings[tier];
    Object.assign(settings, tierSettings);
  }

  // Adjust sync interval based on battery
  if (deviceInfo.batteryLevel < SYNC_CONFIG.lowBatteryThreshold) {
    settings.syncInterval = SYNC_CONFIG.lowBatteryInterval;
  } else if (deviceInfo.isCharging) {
    settings.syncInterval = SYNC_CONFIG.onChargerInterval;
  }

  // Adjust based on network conditions
  if (ADAPTIVE_CONFIG.enableNetworkAwareness) {
    const networkSettings =
      ADAPTIVE_CONFIG.networkSettings[deviceInfo.networkType];
    if (networkSettings) {
      Object.assign(settings, networkSettings);
    }
  }

  // Critical optimizations
  if (deviceInfo.batteryLevel < SYNC_CONFIG.criticalBatteryThreshold) {
    settings.syncInterval = Infinity; // Disable sync
  }

  if (deviceInfo.isLowPowerMode) {
    settings.maxToRenderPerBatch = Math.floor(settings.maxToRenderPerBatch / 2);
    settings.imageQuality = Math.max(60, settings.imageQuality - 20);
  }

  return settings;
}

/**
 * Export all configurations as namespace
 */
export const PerformanceConfig = {
  FLATLIST: FLATLIST_CONFIG,
  IMAGE: IMAGE_CONFIG,
  SYNC: SYNC_CONFIG,
  MEMORY: MEMORY_CONFIG,
  DATABASE: DATABASE_CONFIG,
  ADAPTIVE: ADAPTIVE_CONFIG,
  BATTERY: BATTERY_CONFIG,
  NETWORK: NETWORK_CONFIG,
  MONITORING: MONITORING_CONFIG,
  getAdaptiveSettings,
} as const;

export default PerformanceConfig;

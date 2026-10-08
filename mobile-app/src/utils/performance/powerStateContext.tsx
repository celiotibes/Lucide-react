/**
 * Power State Context - Phase 22.15: Battery-Aware UI
 *
 * Features:
 * - Provides device power state to all screens
 * - Real-time subscriptions for power state changes
 * - Adapts UI based on battery status
 * - Low power mode detection
 * - Charging state detection
 * - Context hook for easy consumption
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  BatteryStatus,
  ChargingState,
  BatteryState,
  SyncIntervalConfig,
} from './batteryOptimizationService';
import { batteryOptimizationService } from './batteryOptimizationService';
import { logger } from '../logger';

export interface PowerStateContextType {
  batteryState: BatteryState;
  syncIntervals: SyncIntervalConfig;
  isCriticalBattery: boolean;
  isLowBattery: boolean;
  isChargingFast: boolean;
  shouldOptimize: boolean;
  estimatedTimeRemaining: number; // milliseconds
  batteryPercentage: number;
  batteryStatus: string;
  startFeatureDrainTracking: (feature: string) => void;
  stopFeatureDrainTracking: (feature: string) => Promise<void>;
}

const PowerStateContext = createContext<PowerStateContextType | undefined>(undefined);

export interface PowerStateProviderProps {
  children: ReactNode;
}

/**
 * Power State Provider Component
 */
export function PowerStateProvider({ children }: PowerStateProviderProps): JSX.Element {
  const [batteryState, setBatteryState] = useState<BatteryState>(
    batteryOptimizationService.getBatteryState(),
  );

  const [syncIntervals, setSyncIntervals] = useState<SyncIntervalConfig>(
    batteryOptimizationService.getSyncIntervals(),
  );

  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number>(
    batteryOptimizationService.estimateTimeUntilCritical(),
  );

  // Subscribe to battery state changes
  useEffect(() => {
    batteryOptimizationService.startMonitoring();

    const unsubscribe = batteryOptimizationService.onBatteryStateChange((state) => {
      setBatteryState(state);
      setSyncIntervals(batteryOptimizationService.getSyncIntervals());
      setEstimatedTimeRemaining(batteryOptimizationService.estimateTimeUntilCritical());

      logger.info('Power state updated', {
        batteryLevel: state.level,
        status: state.status,
        isCharging: state.isCharging,
      });
    });

    return () => {
      unsubscribe();
      batteryOptimizationService.stopMonitoring();
    };
  }, []);

  const isCriticalBattery = batteryState.status === BatteryStatus.CRITICAL;
  const isLowBattery =
    batteryState.status === BatteryStatus.LOW || batteryState.status === BatteryStatus.CRITICAL;
  const isChargingFast =
    batteryState.isCharging && batteryState.level < 80; // Actively charging before full
  const shouldOptimize = isLowBattery || batteryState.isLowPowerMode;

  const startFeatureDrainTracking = useCallback((feature: string) => {
    try {
      batteryOptimizationService.startFeatureDrainTracking(feature);
    } catch (error) {
      logger.error('Failed to start feature drain tracking', error, 'PowerState');
    }
  }, []);

  const stopFeatureDrainTracking = useCallback(async (feature: string) => {
    try {
      await batteryOptimizationService.stopFeatureDrainTracking(feature);
    } catch (error) {
      logger.error('Failed to stop feature drain tracking', error, 'PowerState');
    }
  }, []);

  const value: PowerStateContextType = {
    batteryState,
    syncIntervals,
    isCriticalBattery,
    isLowBattery,
    isChargingFast,
    shouldOptimize,
    estimatedTimeRemaining: Math.max(0, estimatedTimeRemaining),
    batteryPercentage: batteryState.level,
    batteryStatus: batteryState.status,
    startFeatureDrainTracking,
    stopFeatureDrainTracking,
  };

  return (
    <PowerStateContext.Provider value={value}>
      {children}
    </PowerStateContext.Provider>
  );
}

/**
 * Hook to use power state context
 */
export function usePowerState(): PowerStateContextType {
  const context = useContext(PowerStateContext);
  if (context === undefined) {
    throw new Error('usePowerState must be used within a PowerStateProvider');
  }
  return context;
}

/**
 * Hook to check if feature should run based on power state
 */
export function useFeatureAvailability(
  requiresCharging: boolean = false,
  minBatteryLevel: number = 0,
  requiresWiFi: boolean = false,
): boolean {
  const { batteryState, shouldOptimize } = usePowerState();

  const isCriticalAndCharging = batteryState.status === BatteryStatus.CRITICAL;
  if (isCriticalAndCharging && !batteryState.isCharging) {
    // Critical battery and not charging - disable non-critical features
    return false;
  }

  if (requiresCharging && !batteryState.isCharging) {
    return false;
  }

  if (batteryState.level < minBatteryLevel) {
    return false;
  }

  if (requiresWiFi && batteryState.status === BatteryStatus.LOW) {
    // Restrict WiFi-only tasks in low battery
    return false;
  }

  return true;
}

/**
 * Hook to get optimized sync interval
 */
export function useOptimizedSyncInterval(taskName: string): number {
  const { syncIntervals, batteryState } = usePowerState();

  let interval: number;

  switch (taskName) {
    case 'analytics':
      interval = syncIntervals.analyticsInterval;
      break;
    case 'metrics':
      interval = syncIntervals.metricsInterval;
      break;
    case 'location':
      interval = syncIntervals.locationInterval;
      break;
    case 'authRefresh':
      interval = syncIntervals.authRefreshInterval;
      break;
    default:
      interval = 30000; // Default 30 seconds
  }

  // If in critical battery and not charging, reduce interval further
  if (batteryState.status === BatteryStatus.CRITICAL && !batteryState.isCharging) {
    interval = Math.min(interval * 2, 1800000); // Cap at 30 minutes
  }

  return interval;
}

/**
 * Hook to track battery drain for a feature
 */
export function useFeatureBatteryTracking(featureName: string): {
  start: () => void;
  stop: () => Promise<void>;
  isTracking: boolean;
} {
  const { startFeatureDrainTracking, stopFeatureDrainTracking } = usePowerState();
  const [isTracking, setIsTracking] = useState(false);

  const start = useCallback(() => {
    startFeatureDrainTracking(featureName);
    setIsTracking(true);
  }, [featureName, startFeatureDrainTracking]);

  const stop = useCallback(async () => {
    await stopFeatureDrainTracking(featureName);
    setIsTracking(false);
  }, [featureName, stopFeatureDrainTracking]);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTracking) {
        stop();
      }
    };
  }, [isTracking, stop]);

  return { start, stop, isTracking };
}

/**
 * Hook to get battery status string for UI
 */
export function useBatteryStatusString(): string {
  const { batteryPercentage, batteryStatus, isChargingFast } = usePowerState();

  if (isChargingFast) {
    return `Charging (${batteryPercentage}%)`;
  }

  switch (batteryStatus) {
    case BatteryStatus.CRITICAL:
      return `Critical Battery (${batteryPercentage}%)`;
    case BatteryStatus.LOW:
      return `Low Battery (${batteryPercentage}%)`;
    case BatteryStatus.MEDIUM:
      return `${batteryPercentage}%`;
    case BatteryStatus.HIGH:
      return `Good Battery (${batteryPercentage}%)`;
    default:
      return `${batteryPercentage}%`;
  }
}

/**
 * Hook to check if app should show low battery warning
 */
export function useLowBatteryWarning(): {
  shouldShow: boolean;
  message: string;
  severity: 'low' | 'critical';
} {
  const { isCriticalBattery, isLowBattery, batteryPercentage } = usePowerState();

  if (isCriticalBattery) {
    return {
      shouldShow: true,
      message: `Critical battery level (${batteryPercentage}%). Please charge your device.`,
      severity: 'critical',
    };
  }

  if (isLowBattery) {
    return {
      shouldShow: true,
      message: `Low battery (${batteryPercentage}%). Some features may be disabled.`,
      severity: 'low',
    };
  }

  return {
    shouldShow: false,
    message: '',
    severity: 'low',
  };
}

/**
 * Hook to get memory optimization recommendations
 */
export function useMemoryOptimization(): {
  shouldOptimizeMemory: boolean;
  recommendedBatchSize: number;
  recommendedCacheSize: number;
} {
  const { isLowBattery, batteryPercentage } = usePowerState();

  if (isLowBattery) {
    return {
      shouldOptimizeMemory: true,
      recommendedBatchSize: 10, // Smaller batches
      recommendedCacheSize: 5 * 1024 * 1024, // 5 MB
    };
  }

  return {
    shouldOptimizeMemory: false,
    recommendedBatchSize: 50,
    recommendedCacheSize: 50 * 1024 * 1024, // 50 MB
  };
}

export default PowerStateContext;

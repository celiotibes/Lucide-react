# Battery Optimization Quick Start Guide

## 5-Minute Setup

### Step 1: Wrap Your App with PowerStateProvider

**File**: `App.tsx` or `App.js`

```typescript
import React, { useEffect } from 'react';
import { SafeAreaView } from 'react-native';
import { PowerStateProvider, batteryOptimizationService } from './src/utils/performance';
import MainScreen from './screens/MainScreen';

export default function App() {
  useEffect(() => {
    // Start battery monitoring when app loads
    batteryOptimizationService.startMonitoring();

    return () => {
      batteryOptimizationService.stopMonitoring();
    };
  }, []);

  return (
    <PowerStateProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <MainScreen />
      </SafeAreaView>
    </PowerStateProvider>
  );
}
```

### Step 2: Display Low Battery Warning

**File**: `components/LowBatteryWarning.tsx`

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLowBatteryWarning } from '../src/utils/performance';

export function LowBatteryWarning() {
  const { shouldShow, message, severity } = useLowBatteryWarning();

  if (!shouldShow) return null;

  const backgroundColor = severity === 'critical' ? '#ff0000' : '#ffaa00';

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontWeight: 'bold',
  },
});
```

### Step 3: Add to Your Main App

```typescript
import { LowBatteryWarning } from './components/LowBatteryWarning';

export default function App() {
  // ... previous setup ...

  return (
    <PowerStateProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <LowBatteryWarning />
        <MainScreen />
      </SafeAreaView>
    </PowerStateProvider>
  );
}
```

## Integration with Analytics (Phase 22.13)

The analytics service automatically integrates with battery optimization. No changes needed! It will:
- Automatically reduce batch size in low battery (25 vs. 50 events)
- Adapt sync intervals based on battery state
- Reduce memory usage in critical battery

### Verify Integration

```typescript
import { analyticsService } from './src/utils/analytics';
import { usePowerState } from './src/utils/performance';

export function AnalyticsDebugScreen() {
  const { batteryStatus, syncIntervals } = usePowerState();

  const metrics = analyticsService.getMetrics();

  return (
    <View>
      <Text>Battery: {batteryStatus}</Text>
      <Text>Analytics Sync Interval: {syncIntervals.analyticsInterval}ms</Text>
      <Text>Pending Events: {metrics.totalEvents}</Text>
    </View>
  );
}
```

## Schedule Background Tasks

### Setup Critical Tasks (e.g., Auth Refresh)

**File**: `services/backgroundTasks.ts`

```typescript
import { backgroundTaskScheduler, TaskPriority, TaskTrigger } from '../src/utils/performance';
import { authService } from './authService';
import { analyticsService } from '../src/utils/analytics';

export function setupBackgroundTasks() {
  // Critical: Always execute (even on critical battery)
  backgroundTaskScheduler.registerTask(
    'auth-token-refresh',
    async () => {
      await authService.refreshToken();
    },
    TaskPriority.CRITICAL,
    TaskTrigger.IDLE
  );

  // High: Execute frequently unless critical battery
  backgroundTaskScheduler.registerTask(
    'analytics-sync',
    async () => {
      await analyticsService.syncEvents();
    },
    TaskPriority.HIGH,
    TaskTrigger.IDLE,
    { minBatteryLevel: 5 } // Even works in critical battery
  );

  // Low: Only when charging or WiFi available
  backgroundTaskScheduler.registerTask(
    'media-cache-update',
    async () => {
      // Expensive operation
    },
    TaskPriority.LOW,
    TaskTrigger.IDLE,
    { 
      requiresCharging: true,
      requiresWiFi: true,
      minBatteryLevel: 20
    }
  );
}
```

**File**: `App.tsx`

```typescript
import { setupBackgroundTasks } from './services/backgroundTasks';

useEffect(() => {
  setupBackgroundTasks();
}, []);
```

## Monitor Feature Battery Impact

### Track Specific Feature

```typescript
import { useFeatureBatteryTracking } from '../src/utils/performance';

export function LocationTrackingScreen() {
  const { start, stop, isTracking } = useFeatureBatteryTracking('location-tracking');

  const startTracking = async () => {
    start(); // Start measuring battery drain
    // ... start location tracking ...
  };

  const stopTracking = async () => {
    // ... stop location tracking ...
    await stop(); // Stop measuring and save metrics
  };

  return (
    <View>
      <Button
        title={isTracking ? 'Stop Tracking' : 'Start Tracking'}
        onPress={isTracking ? stopTracking : startTracking}
      />
    </View>
  );
}
```

### View Battery Metrics

```typescript
import { batteryOptimizationService } from '../src/utils/performance';

export function BatteryMetricsScreen() {
  const [metrics, setMetrics] = React.useState([]);

  useEffect(() => {
    // Update metrics every 30 seconds
    const interval = setInterval(() => {
      setMetrics(batteryOptimizationService.getBatteryMetrics());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <View>
      <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Battery Impact by Feature</Text>
      {metrics.map((metric) => (
        <View key={metric.feature}>
          <Text>{metric.feature}: {metric.estimatedDrainPercentage.toFixed(2)}%/hour</Text>
        </View>
      ))}
    </View>
  );
}
```

## Conditional Feature Availability

### Disable Heavy Features in Low Battery

```typescript
import { useFeatureAvailability } from '../src/utils/performance';

export function MediaLibraryScreen() {
  // Feature requires: charging, WiFi, and 30% battery
  const canLoadMedia = useFeatureAvailability(
    true,   // requiresCharging
    30,     // minBatteryLevel
    true    // requiresWiFi
  );

  if (!canLoadMedia) {
    return (
      <View>
        <Text>Media library is disabled to save battery.</Text>
        <Text>Plug in your device and connect to WiFi to enable.</Text>
      </View>
    );
  }

  return <MediaLibrary />;
}
```

## Optimize Sync Intervals Dynamically

```typescript
import { useOptimizedSyncInterval, usePowerState } from '../src/utils/performance';

export function AdaptiveSyncScreen() {
  const analyticsInterval = useOptimizedSyncInterval('analytics');
  const metricsInterval = useOptimizedSyncInterval('metrics');
  const { batteryPercentage, shouldOptimize } = usePowerState();

  useEffect(() => {
    const analyticsTimer = setInterval(() => {
      // Sync analytics
    }, analyticsInterval);

    const metricsTimer = setInterval(() => {
      // Sync metrics
    }, metricsInterval);

    return () => {
      clearInterval(analyticsTimer);
      clearInterval(metricsTimer);
    };
  }, [analyticsInterval, metricsInterval]);

  return (
    <View>
      <Text>Battery: {batteryPercentage}%</Text>
      <Text>Optimized: {shouldOptimize ? 'Yes' : 'No'}</Text>
      <Text>Analytics Sync: {(analyticsInterval / 1000).toFixed(0)}s</Text>
      <Text>Metrics Sync: {(metricsInterval / 1000).toFixed(0)}s</Text>
    </View>
  );
}
```

## Memory Optimization in Low Battery

```typescript
import { useMemoryOptimization } from '../src/utils/performance';

export function DataProcessingScreen() {
  const { shouldOptimizeMemory, recommendedBatchSize, recommendedCacheSize } = 
    useMemoryOptimization();

  const processingBatchSize = shouldOptimizeMemory ? 10 : 50;
  const cacheSize = shouldOptimizeMemory ? 5 * 1024 * 1024 : 50 * 1024 * 1024;

  useEffect(() => {
    console.log(`Using batch size: ${processingBatchSize}`);
    console.log(`Cache size: ${(cacheSize / 1024 / 1024).toFixed(0)}MB`);
  }, [processingBatchSize, cacheSize]);

  return <DataList batchSize={processingBatchSize} />;
}
```

## Common Patterns

### Pattern 1: Task that Runs Only When Charging

```typescript
backgroundTaskScheduler.registerTask(
  'expensive-sync',
  async () => {
    await expensiveOperation();
  },
  TaskPriority.LOW,
  TaskTrigger.CHARGING,
  { requiresCharging: true }
);
```

### Pattern 2: WiFi-Only Downloads

```typescript
backgroundTaskScheduler.registerTask(
  'bulk-download',
  async () => {
    await downloadLargeFiles();
  },
  TaskPriority.LOW,
  TaskTrigger.IDLE,
  { 
    requiresWiFi: true,
    minBatteryLevel: 50
  }
);
```

### Pattern 3: Battery-Aware Caching

```typescript
const { shouldOptimizeMemory, recommendedCacheSize } = useMemoryOptimization();

const cache = new LRUCache({
  maxSize: recommendedCacheSize,
  onEvict: (item) => {
    // Clean up resources
  }
});
```

### Pattern 4: Progressive Enhancement

```typescript
export function FeatureComponent() {
  const batteryState = usePowerState();

  // Full feature when battery good
  if (batteryState.batteryPercentage > 80) {
    return <FullFeature />;
  }

  // Reduced feature when battery medium
  if (batteryState.batteryPercentage > 20) {
    return <ReducedFeature />;
  }

  // Minimal feature when battery low
  return <MinimalFeature />;
}
```

## Testing Your Implementation

### Test Low Battery Mode

```typescript
// In development, you can simulate battery states:
import { batteryOptimizationService } from '../src/utils/performance';

// Manually trigger state change for testing
const testLowBattery = () => {
  const unsubscribe = batteryOptimizationService.onBatteryStateChange((state) => {
    console.log('Battery changed:', state);
  });
};
```

### Verify Analytics Integration

```typescript
import { analyticsService } from '../src/utils/analytics';

const debugAnalytics = () => {
  const metrics = analyticsService.getMetrics();
  console.log('Total events:', metrics.totalEvents);
  console.log('Synced:', metrics.eventsByType);
};
```

## Troubleshooting

### Problem: Battery monitoring not working
- **Solution**: Restart the app after installation
- Check: `batteryOptimizationService.startMonitoring()` is called

### Problem: Tasks not executing
- **Solution**: Check battery conditions are met
- Check: `backgroundTaskScheduler.getPendingTasks()` to see pending tasks
- Check: `backgroundTaskScheduler.getFailedTasks()` for errors

### Problem: High battery drain still occurring
- **Solution**: Monitor feature-level drain with `useFeatureBatteryTracking`
- Identify which features drain the most battery
- Adjust scheduling for those features

## Next Steps

1. ✅ Wrap app with `PowerStateProvider`
2. ✅ Add `LowBatteryWarning` component
3. ✅ Setup background tasks
4. ✅ Monitor battery metrics
5. ✅ Test with varying battery levels
6. ✅ Optimize based on metrics

## Resources

- Full API: See [BATTERY_OPTIMIZATION.md](./BATTERY_OPTIMIZATION.md)
- Test Examples: See `__tests__/` directory
- Phase 22.13 Integration: See analytics service updates
- Phase 22.14 Integration: See security service updates

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the full documentation in `BATTERY_OPTIMIZATION.md`
3. Check test cases for example usage
4. Review analytics integration in `analyticsService.ts`

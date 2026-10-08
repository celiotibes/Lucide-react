# Battery Optimization Testing Guide

## Test Coverage Overview

### Battery Optimization Service Tests (25+ cases)
- ✅ Battery state detection and categorization
- ✅ Sync interval adaptation based on battery status
- ✅ WiFi-only task determination
- ✅ Background task condition checking
- ✅ Analytics batch size optimization
- ✅ Feature-level battery drain tracking
- ✅ Battery state change notifications
- ✅ Battery history management
- ✅ Monitoring lifecycle
- ✅ Edge cases and error handling

### Background Task Scheduler Tests (30+ cases)
- ✅ Task registration and retrieval
- ✅ Task scheduling with different priorities
- ✅ Task cancellation and retry logic
- ✅ Task status transitions
- ✅ Condition-based execution (charging, WiFi, battery level)
- ✅ Automatic retry with exponential backoff
- ✅ Task metrics tracking
- ✅ Task history management
- ✅ Multiple independent tasks
- ✅ Edge cases and state management

### Power State Context Tests
- ✅ Hook functionality
- ✅ Battery state subscriptions
- ✅ Feature availability checks
- ✅ Memory optimization recommendations
- ✅ Battery warning display logic

## Running Unit Tests

### Run All Tests

```bash
npm test
```

### Run Battery Optimization Tests Only

```bash
npm test -- batteryOptimizationService.test.ts
```

### Run Background Task Scheduler Tests Only

```bash
npm test -- backgroundTaskScheduler.test.ts
```

### Run Tests with Coverage

```bash
npm test -- --coverage batteryOptimizationService.test.ts
npm test -- --coverage backgroundTaskScheduler.test.ts
```

### Watch Mode

```bash
npm test -- --watch batteryOptimizationService.test.ts
```

## Manual Testing on Device

### Setup

1. Install the app on a physical device (iOS or Android)
2. Connect to development server: `npm start`
3. Open the app in debug mode

### Test 1: Battery State Detection

**Objective**: Verify battery state is correctly detected

**Steps**:
1. Open app and check initial battery level
2. Create a debug screen showing battery state:

```typescript
import { usePowerState } from '../src/utils/performance';

export function BatteryDebugScreen() {
  const { batteryState, batteryStatus, batteryPercentage } = usePowerState();

  return (
    <View>
      <Text>Battery Level: {batteryPercentage}%</Text>
      <Text>Status: {batteryStatus}</Text>
      <Text>Charging: {batteryState.isCharging ? 'Yes' : 'No'}</Text>
      <Text>Low Power Mode: {batteryState.isLowPowerMode ? 'Yes' : 'No'}</Text>
      <Text>Temp: {batteryState.temperature}°</Text>
    </View>
  );
}
```

3. Plug device into charger - check state updates
4. Unplug device - check state updates
5. Enable low power mode - check detection

**Expected Results**:
- Battery level updates correctly
- Status changes: HIGH → MEDIUM → LOW → CRITICAL
- Charging state updates
- Low power mode detected

### Test 2: Sync Interval Adaptation

**Objective**: Verify sync intervals adapt to battery state

**Steps**:
1. Create a debug screen:

```typescript
import { useOptimizedSyncInterval, usePowerState } from '../src/utils/performance';

export function SyncIntervalDebugScreen() {
  const { syncIntervals, batteryPercentage } = usePowerState();
  const analyticsInterval = useOptimizedSyncInterval('analytics');

  return (
    <View>
      <Text>Battery: {batteryPercentage}%</Text>
      <Text>Analytics Interval: {(analyticsInterval / 1000).toFixed(0)}s</Text>
      <Text>Metrics Interval: {(syncIntervals.metricsInterval / 1000).toFixed(0)}s</Text>
      <Text>Location Interval: {(syncIntervals.locationInterval / 1000).toFixed(0)}s</Text>
    </View>
  );
}
```

2. Vary battery levels using simulator
3. Note sync interval changes

**Expected Results**:
- High battery (>80%): 30s analytics, 60s metrics
- Medium battery: 60s analytics, 120s metrics
- Low battery: 300s analytics, 600s metrics
- Critical battery: 900s analytics, 1800s metrics

### Test 3: Battery Drain Tracking

**Objective**: Verify feature-level battery tracking works

**Steps**:
1. Implement tracking in a feature:

```typescript
import { useFeatureBatteryTracking } from '../src/utils/performance';

export function VideoPlaybackScreen() {
  const { start, stop } = useFeatureBatteryTracking('video-playback');

  useEffect(() => {
    start(); // Start tracking battery usage
    
    return async () => {
      await stop(); // Stop and record battery impact
    };
  }, []);

  return <VideoPlayer />;
}
```

2. Play video for 30 seconds
3. Check battery metrics:

```typescript
import { batteryOptimizationService } from '../src/utils/performance';

const metrics = batteryOptimizationService.getBatteryMetrics();
console.log(metrics); // Should show video-playback drain rate
```

**Expected Results**:
- Feature drain metrics recorded
- Estimated drain percentage calculated
- Sample size incremented

### Test 4: Low Battery Warning

**Objective**: Verify warning displays correctly

**Steps**:
1. Simulate low battery (< 20%)
2. Check app displays low battery warning
3. Simulate critical battery (< 5%)
4. Check warning style changes

**Expected Results**:
- Warning appears when battery < 20%
- Message: "Low Battery (X%). Some features may be disabled."
- Critical warning appears when battery < 5%
- Message: "Critical battery level (X%). Please charge your device."
- Correct styling (yellow for low, red for critical)

### Test 5: Background Task Execution

**Objective**: Verify tasks execute based on conditions

**Steps**:
1. Setup test tasks:

```typescript
import { backgroundTaskScheduler, TaskPriority, TaskTrigger } from '../src/utils/performance';

// Setup in app init
backgroundTaskScheduler.registerTask(
  'test-task-critical',
  async () => { console.log('CRITICAL TASK EXECUTED'); },
  TaskPriority.CRITICAL,
  TaskTrigger.IDLE
);

backgroundTaskScheduler.registerTask(
  'test-task-charging-only',
  async () => { console.log('CHARGING TASK EXECUTED'); },
  TaskPriority.LOW,
  TaskTrigger.CHARGING,
  { requiresCharging: true }
);

backgroundTaskScheduler.registerTask(
  'test-task-min-battery',
  async () => { console.log('BATTERY TASK EXECUTED'); },
  TaskPriority.NORMAL,
  TaskTrigger.IDLE,
  { minBatteryLevel: 30 }
);
```

2. Check console for task execution
3. Plug in charger - charging task should execute
4. Unplug - charging task should not execute
5. Reduce battery below 30% - battery task should not execute

**Expected Results**:
- Critical tasks execute regardless of conditions
- Charging-only tasks execute when charging
- Battery-dependent tasks respect thresholds

### Test 6: Memory Optimization

**Objective**: Verify batch sizes reduce in low battery

**Steps**:
1. Check batch size at high battery:

```typescript
import { batteryOptimizationService } from '../src/utils/performance';

const highBatteryBatchSize = batteryOptimizationService.getAnalyticsBatchSize();
console.log('High Battery Batch Size:', highBatteryBatchSize); // Should be 50
```

2. Simulate low battery
3. Check batch size again:

```typescript
const lowBatteryBatchSize = batteryOptimizationService.getAnalyticsBatchSize();
console.log('Low Battery Batch Size:', lowBatteryBatchSize); // Should be 25
```

**Expected Results**:
- High battery: batch size 50
- Medium battery: batch size 40
- Low battery: batch size 25
- Critical battery: batch size 25

### Test 7: Analytics Integration

**Objective**: Verify analytics service uses battery-aware settings

**Steps**:
1. Create debug screen:

```typescript
import { analyticsService } from '../src/utils/analytics';
import { batteryOptimizationService } from '../src/utils/performance';

export function AnalyticsDebugScreen() {
  const batteryState = batteryOptimizationService.getBatteryState();
  const metrics = analyticsService.getMetrics();
  const batchSize = batteryOptimizationService.getAnalyticsBatchSize();

  return (
    <View>
      <Text>Battery: {batteryState.level}%</Text>
      <Text>Pending Events: {metrics.totalEvents}</Text>
      <Text>Batch Size: {batchSize}</Text>
      <Button 
        title="Trigger Sync" 
        onPress={() => analyticsService.syncEvents()}
      />
    </View>
  );
}
```

2. Generate events (e.g., navigate screens, perform actions)
3. Monitor pending events count
4. Trigger sync
5. Check sync completes with correct batch size

**Expected Results**:
- Events queue up correctly
- Batch size adapts to battery
- Sync completes successfully
- Events marked as synced

## Integration Tests

### Test Scenario 1: Full App Lifecycle

**Steps**:
1. Start app with good battery (>80%)
2. Create several analytics events
3. Trigger analytics sync - should use 50-event batches
4. Plug device in - sync interval should decrease
5. Unplug device - sync interval should increase
6. Simulate battery drop to low (<20%)
7. Check warning appears
8. Simulate critical battery (<5%)
9. Check severe restriction of non-critical tasks

**Acceptance Criteria**:
- All state transitions smooth
- No crashes or hangs
- Battery metrics recorded correctly
- Tasks execute appropriately

### Test Scenario 2: Long-Running Session

**Steps**:
1. Start app
2. Leave running for 1 hour with normal activity
3. Monitor battery drain
4. Check battery metrics show drain per feature
5. Identify high-drain features
6. Disable those features
7. Monitor battery improvement

**Acceptance Criteria**:
- Accurate battery drain tracking
- Feature isolation in metrics
- Can identify optimization opportunities

### Test Scenario 3: Task Scheduling Under Stress

**Steps**:
1. Register 20+ background tasks
2. Vary battery states
3. Monitor task execution
4. Check retry logic works
5. Verify metrics accuracy

**Acceptance Criteria**:
- All tasks eventually execute
- Retries work correctly
- No memory leaks
- Accurate metrics

## Performance Testing

### CPU Impact

```typescript
import { performanceMetrics } from '../src/utils/analytics/performanceMetrics';

// Measure battery monitoring CPU impact
const before = performanceMetrics.mark('cpu-test-start');
batteryOptimizationService.startMonitoring();
await new Promise(r => setTimeout(r, 5000));
const duration = performanceMetrics.measure('cpu-test', 'cpu-test-start');

console.log('Battery monitoring CPU impact:', duration, 'ms');
// Expected: < 50ms overhead
```

### Memory Impact

```typescript
// Check memory before
const beforeMemory = require('react-native').Platform.select({
  ios: () => navigator.deviceMemory * 1024,
  android: () => java.lang.Runtime.getRuntime().totalMemory(),
})();

// Use battery optimization
batteryOptimizationService.startMonitoring();
backgroundTaskScheduler.registerTask('test', async () => {});

// Check memory after
const afterMemory = require('react-native').Platform.select({
  ios: () => navigator.deviceMemory * 1024,
  android: () => java.lang.Runtime.getRuntime().totalMemory(),
})();

const memoryIncrease = afterMemory - beforeMemory;
console.log('Memory increase:', memoryIncrease, 'bytes');
// Expected: < 5MB increase
```

### Network Impact

```typescript
// Monitor analytics sync network usage
import { analyticsService } from '../src/utils/analytics';

// Generate 100 events
for (let i = 0; i < 100; i++) {
  analyticsService.trackEvent(EventType.SCREEN_VIEW, { screen: 'test' });
}

// Measure sync network usage
// (In production, use device network monitoring tools)
const before = Date.now();
await analyticsService.syncEvents();
const duration = Date.now() - before;

console.log('Sync completed in:', duration, 'ms');
// Expected: < 5000ms for 100 events
```

## Automated Testing Framework

### Create Test Suite

```typescript
// tests/batteryOptimization.integration.test.ts

describe('Battery Optimization Integration', () => {
  describe('Full App Lifecycle', () => {
    test('should handle battery state transitions', async () => {
      // Setup
      batteryOptimizationService.startMonitoring();
      
      // Test
      const initialState = batteryOptimizationService.getBatteryState();
      expect(initialState.level).toBeLessThanOrEqual(100);
      
      // Monitor changes
      const changes: BatteryState[] = [];
      const unsubscribe = batteryOptimizationService.onBatteryStateChange((state) => {
        changes.push(state);
      });
      
      // Wait for changes
      await new Promise(r => setTimeout(r, 5000));
      
      // Verify
      expect(changes.length).toBeGreaterThan(0);
      
      unsubscribe();
    });

    test('should maintain task queue during battery changes', async () => {
      // Setup
      const handler = jest.fn().mockResolvedValue(undefined);
      const taskId = backgroundTaskScheduler.registerTask('test', handler);
      
      // Simulate battery change
      batteryOptimizationService.startMonitoring();
      
      // Verify task still exists
      const task = backgroundTaskScheduler.getTask(taskId);
      expect(task).toBeDefined();
    });
  });

  describe('Analytics Sync During Low Battery', () => {
    test('should use reduced batch size in low battery', async () => {
      // Setup low battery condition
      const initialBatchSize = batteryOptimizationService.getAnalyticsBatchSize();
      
      // Generate many events
      for (let i = 0; i < 100; i++) {
        analyticsService.trackEvent(EventType.SCREEN_VIEW, {});
      }
      
      // Verify batch size is appropriate
      const batchSize = batteryOptimizationService.getAnalyticsBatchSize();
      expect(batchSize).toBeLessThanOrEqual(50);
    });
  });
});
```

## Continuous Integration Testing

### Add to CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      
      - name: Install dependencies
        run: npm install
      
      - name: Run unit tests
        run: npm test -- --coverage
      
      - name: Run battery optimization tests
        run: npm test -- batteryOptimizationService.test.ts --coverage
      
      - name: Run background task tests
        run: npm test -- backgroundTaskScheduler.test.ts --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## Testing Checklist

- [ ] Battery state detection works
- [ ] Sync intervals adapt correctly
- [ ] Low battery warning displays
- [ ] Tasks execute with correct conditions
- [ ] Analytics uses adaptive batch sizes
- [ ] Background tasks schedule properly
- [ ] Retry logic works
- [ ] Memory usage stays reasonable
- [ ] No crashes or hangs
- [ ] Feature tracking works
- [ ] Battery history maintained
- [ ] Integration with analytics confirmed
- [ ] Performance metrics acceptable
- [ ] Edge cases handled

## Known Test Limitations

1. **Simulator Battery**: Limited battery simulation on simulators
   - **Solution**: Test on real devices for accurate battery behavior
   
2. **Low Power Mode**: Cannot always trigger on simulator
   - **Solution**: Use device settings to enable low power mode
   
3. **Network Conditions**: Hard to simulate exact network conditions
   - **Solution**: Use network throttling tools

## Debugging Tips

### Enable Debug Logging

```typescript
import { logger } from '../src/utils/logger';

// Enable debug logging
logger.setLevel('debug');

// Watch for battery changes
batteryOptimizationService.onBatteryStateChange((state) => {
  console.log('[BATTERY]', {
    level: state.level,
    status: state.status,
    isCharging: state.isCharging,
    timestamp: new Date().toISOString(),
  });
});
```

### Monitor Task Execution

```typescript
// Setup monitoring
const interval = setInterval(() => {
  const pending = backgroundTaskScheduler.getPendingTasks();
  const failed = backgroundTaskScheduler.getFailedTasks();
  const metrics = backgroundTaskScheduler.getTaskMetrics();
  
  console.log('[TASKS]', {
    pending: pending.length,
    failed: failed.length,
    metrics: metrics.length,
  });
}, 30000);
```

### Check Analytics Sync

```typescript
// Monitor analytics sync
analyticsService.onBatteryStateChange?.(() => {
  const metrics = analyticsService.getMetrics();
  console.log('[ANALYTICS]', {
    total: metrics.totalEvents,
    syncInterval: batteryOptimizationService.getSyncIntervals().analyticsInterval,
    batchSize: batteryOptimizationService.getAnalyticsBatchSize(),
  });
});
```

## Performance Benchmarks

| Operation | Expected Time | Tolerance |
|-----------|---------------|-----------|
| Battery state query | < 10ms | ±2ms |
| Sync interval calculation | < 1ms | ±0.5ms |
| Task registration | < 5ms | ±1ms |
| Task execution | < 100ms | ±25ms |
| Analytics sync (50 events) | < 500ms | ±100ms |
| Feature drain calculation | < 10ms | ±2ms |

## Report Issues

When reporting test failures:
1. Device type and OS version
2. Battery level at time of failure
3. Steps to reproduce
4. Console logs from debug mode
5. Expected vs. actual behavior

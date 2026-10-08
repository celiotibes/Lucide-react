# E2E Test Execution Guide

## Quick Start

### Prerequisites
- Node.js >= 18.0.0
- Detox CLI installed: `npm install -g detox-cli`
- Simulators/emulators running (or specified in config)

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Specific Test Suite
```bash
# Authentication tests only
npm run test:e2e -- authenticationFlow.e2e.js

# Sync tests only
npm run test:e2e -- syncFlow.e2e.js

# Crash handling tests only
npm run test:e2e -- crashHandlingFlow.e2e.js

# Notification tests only
npm run test:e2e -- notificationsFlow.e2e.js

# Battery optimization tests only
npm run test:e2e -- batteryOptimizationFlow.e2e.js
```

### Run Single Test
```bash
# Extract test name and run only that
npm run test:e2e -- authenticationFlow.e2e.js --testNamePattern "should login with valid credentials"
```

---

## Test Execution Order

### Recommended Execution Sequence (for fastest CI)
1. **Authentication Flow** (15 min) - Establishes login mechanism
2. **Sync Flow** (15 min) - Depends on successful login
3. **Crash Handling** (10 min) - Tests recovery mechanisms
4. **Notifications** (10 min) - Independent feature tests
5. **Battery Optimization** (10 min) - Independent feature tests

**Total Expected Time:** ~60 minutes

---

## Environment Setup

### Android Emulator

#### Using Pixel 4 API 30 (from detox.config.js)
```bash
# Create emulator if not exists
android create avd -n Pixel_4_API_30 -t android-30 -k default

# Launch emulator
emulator -avd Pixel_4_API_30

# Or use gradle directly
./android/gradlew emulator -Pavd=Pixel_4_API_30
```

#### Alternative emulators:
```bash
# Pixel 6 API 33
emulator -avd Pixel_6_API_33

# Samsung Galaxy (larger screen)
emulator -avd Galaxy_Tab_API_30
```

### iOS Simulator

#### Using iPhone 15 Pro (from detox.config.js)
```bash
# List available simulators
xcrun simctl list devices available

# Launch simulator (if not in Xcode)
xcrun simctl boot "iPhone 15 Pro"

# Close simulator
xcrun simctl shutdown all
```

#### Alternative simulators:
```bash
# iPhone 15
xcrun simctl boot "iPhone 15"

# iPhone 14 Pro Max
xcrun simctl boot "iPhone 14 Pro Max"

# iPad Air
xcrun simctl boot "iPad Air (5th generation)"
```

### Clean Build

```bash
# Full clean rebuild
npm run test:e2e:build

# For iOS
npm run test:e2e:build:ios

# For specific device
detox build-framework-cache && detox build-app --configuration android.emu.release
```

---

## Test Configuration

### Current Configurations (from detox.config.js)

#### Android
- **Name:** `android.emu.release`
- **Device:** Pixel 4 API 30
- **App:** `artifacts/android/app-release.apk`
- **Build:** Gradle assembleRelease

#### iOS
- **Name:** `ios.sim.release`
- **Device:** iPhone 15 Pro
- **App:** `artifacts/ios/LucideReact.app`
- **Build:** Xcode Release scheme

### Custom Configuration

To create custom configuration, edit `detox.config.js`:

```javascript
configurations: {
  'custom.emu': {
    device: {
      type: 'android.emu',
      device: { avdName: 'Custom_AVD_Name' },
    },
    app: 'android',
  },
}
```

Then run:
```bash
detox test --configuration custom.emu
```

---

## Test Debugging

### Enable Detailed Logging
```bash
npm run test:e2e:local -- --record-logs all
```

Logs will be saved to: `artifacts/logs/`

### Capture Screenshots on Failure
```bash
detox test --screenshot-on-failure all
```

### Slow Motion (slow down gestures)
```bash
detox test --slow-motion 500  # 500ms between actions
```

### Record Test Session Video
```bash
# Requires additional setup
detox test --record-video all
```

### Debug Specific Test
```bash
# Add .only to make Detox run only this test
it.only('should test this specific case', async () => {
  // test code
});

npm run test:e2e
```

---

## Continuous Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm run test:e2e:build
      - run: npm run test:e2e
```

### Jenkins Pipeline

```groovy
pipeline {
  agent any
  
  stages {
    stage('Build') {
      steps {
        sh 'npm install'
        sh 'npm run test:e2e:build'
      }
    }
    
    stage('E2E Tests') {
      parallel {
        stage('iOS') {
          steps {
            sh 'npm run test:e2e:ios'
          }
        }
        stage('Android') {
          steps {
            sh 'npm run test:e2e'
          }
        }
      }
    }
  }
  
  post {
    always {
      junit 'artifacts/test-results/*.xml'
      archiveArtifacts artifacts: 'artifacts/**/*'
    }
  }
}
```

### GitLab CI

```yaml
e2e_tests:
  stage: test
  script:
    - npm ci
    - npm run test:e2e:build
    - npm run test:e2e
  artifacts:
    paths:
      - artifacts/
    reports:
      junit: artifacts/test-results/*.xml
```

---

## Performance Optimization

### Run Tests in Parallel (Multi-device)

```bash
# Run on multiple emulators in parallel
# First, start multiple emulators
emulator -avd Pixel_4_API_30 &
emulator -avd Pixel_6_API_33 &

# Run tests in parallel
detox test --configuration android.emu.release --cleanup --cleanup-device
```

### Skip Network Timeouts for Local Testing

```javascript
// In test file
beforeAll(async () => {
  // Set longer timeouts for local testing
  jest.setTimeout(60000);
  await device.launchApp();
});
```

### Run Subset of Tests Faster

```bash
# Run only authentication tests (fastest feedback)
npm run test:e2e -- authenticationFlow.e2e.js --maxWorkers 1

# Run with worker pool
npm run test:e2e -- --maxWorkers 2
```

---

## Troubleshooting

### Issue: "Device is in use"

**Solution:**
```bash
# Kill all emulator processes
killall qemu-system-x86_64
# or
adb devices -l
adb kill-server
adb start-server
```

### Issue: "Build failed"

**Solution:**
```bash
# Clean and rebuild
npm run test:e2e:build -- --rebuild

# Or manually
rm -rf artifacts/
npm run test:e2e:build
```

### Issue: "Element not found"

**Solution:**
1. Add `--record-logs all` to capture logs
2. Check that testIDs are present in component
3. Verify waitFor timeout is sufficient
4. Use `by.text()` if testID missing

### Issue: "Timeout waiting for element"

**Solution:**
```javascript
// Increase timeout
await waitFor(element(by.text('Element')))
  .toBeVisible()
  .withTimeout(60000);  // 60 seconds

// Or add retry logic
async function waitWithRetry(matcher, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await waitFor(element(matcher))
        .toBeVisible()
        .withTimeout(10000);
    } catch (e) {
      if (i === retries - 1) throw e;
      await device.sleep(1000);
    }
  }
}
```

### Issue: "Tests pass locally but fail in CI"

**Causes & Solutions:**
- Network connectivity: Mock network responses
- Device state: Ensure clean state in beforeEach
- Timing differences: Increase timeouts for CI
- Missing permissions: Grant in beforeEach
- Environment variables: Pass to device.launchApp()

```javascript
beforeEach(async () => {
  await device.reloadReactNative();
  await device.launchApp({
    newInstance: true,
    permissions: { notifications: 'YES' },
    launchArgs: { detoxPrintBusyIdleResources: 'YES' }
  });
});
```

---

## Test Reports

### Generate Coverage Report
```bash
npm run test:report
```

Generates: `artifacts/coverage-report/index.html`

### JUnit XML Report
```bash
# Tests automatically generate JUnit XML
# Location: `artifacts/test-results/junit.xml`

# View in CI system (Jenkins, GitLab, etc.)
```

### Custom Reporting

```javascript
// Use jest reporters
// In jest.config.js
module.exports = {
  testRunner: 'jest',
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'artifacts/test-results',
      outputName: 'junit.xml'
    }]
  ],
};
```

---

## Best Practices for Test Execution

### 1. Sequential Execution
```bash
# For deterministic results, especially in CI
npm run test:e2e -- --maxWorkers 1
```

### 2. Monitor Resource Usage
```bash
# Watch device memory/CPU during tests
# Android
adb shell dumpsys meminfo

# iOS
instruments -l -t "Memory Monitor" -D artifacts/
```

### 3. Isolate Test Failures
```bash
# Run only failing tests
npm run test:e2e -- authenticationFlow.e2e.js --testNamePattern "should logout"

# Re-run failed tests only
npm run test:e2e -- --onlyFailures
```

### 4. Verify Test Quality
```bash
# Run tests multiple times to catch flakiness
for i in {1..3}; do
  echo "Run $i"
  npm run test:e2e -- authenticationFlow.e2e.js
done
```

### 5. Archive Test Artifacts
```bash
# Save logs, screenshots, videos for post-mortem
tar -czf e2e-artifacts-$(date +%s).tar.gz artifacts/
```

---

## Advanced Topics

### Custom Test Reporters

Add to jest.config.js:

```javascript
module.exports = {
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'artifacts/reports',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathAsClassName: true,
      },
    ],
  ],
};
```

### Mocking API Responses

In test helpers:

```typescript
export async function mockApiResponse(
  method: string,
  endpoint: string,
  response: any
): Promise<void> {
  // Requires API mocking setup (e.g., MSW, nock)
  // Placeholder for implementation
}
```

### Device Event Simulation

```javascript
// Simulate incoming call
await device.simulateCall('1234567890');

// Simulate SMS
await device.simulateSMS('+1234567890', 'Test message');

// Simulate app state changes
await device.appLaunchParam({ url: 'deeplink://path' });
```

---

## Performance Benchmarks

Expected execution times (on modern hardware):

| Suite | Tests | Time | Time/Test |
|-------|-------|------|-----------|
| Authentication | 16 | 12 min | 45s |
| Sync | 13 | 15 min | 70s |
| Crash Handling | 12 | 8 min | 40s |
| Notifications | 18 | 10 min | 33s |
| Battery | 20 | 8 min | 24s |
| **Total** | **79** | **53 min** | **40s** |

---

## Support & Resources

- **Detox Documentation:** https://detoxe2e.com/docs/intro/welcome
- **Jest Documentation:** https://jestjs.io/
- **React Native Testing:** https://reactnative.dev/docs/testing-overview
- **Project Issues:** See PHASE_22_16_E2E_TESTS.md

---

**Version:** 1.0.0  
**Last Updated:** October 8, 2026  
**Status:** Ready for Use

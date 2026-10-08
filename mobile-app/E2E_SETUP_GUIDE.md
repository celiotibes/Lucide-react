# E2E Testing Setup Guide

**Version**: 1.0.0  
**Last Updated**: 2024  
**Target Audience**: QA Engineers, Developers, CI/CD Engineers

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Writing Tests](#writing-tests)
6. [Running Tests](#running-tests)
7. [Debugging Tests](#debugging-tests)
8. [CI/CD Integration](#cicd-integration)
9. [Troubleshooting](#troubleshooting)
10. [Best Practices](#best-practices)

## Overview

This guide provides comprehensive instructions for setting up and running end-to-end (E2E) tests using Detox with Jest for the CRMT Mobile application.

### What is E2E Testing?

End-to-end testing verifies the entire application flow from user perspective, testing real user scenarios and interactions. Unlike unit tests, E2E tests:

- Test complete user workflows
- Interact with real UI elements
- Verify navigation between screens
- Test data persistence
- Validate business logic workflows
- Run on real simulators/emulators or devices

### Testing Stack

- **Framework**: [Detox](https://wix.github.io/Detox/) - Gray-box testing framework for React Native
- **Test Runner**: Jest 29.7.0
- **Language**: TypeScript
- **Coverage Tool**: nyc (Istanbul)
- **CI/CD**: GitHub Actions

## Prerequisites

### System Requirements

- **macOS** (for iOS testing):
  - macOS 12+
  - Xcode 14+
  - iOS Simulator
  - 8GB RAM minimum

- **Linux** (for Android testing):
  - Ubuntu 18.04 or later
  - Android SDK API 30+
  - Android Emulator or connected device
  - 8GB RAM minimum

- **Windows**: Use WSL2 with Ubuntu environment

### Software Requirements

- Node.js 18+
- npm 9+
- Java JDK 11+
- Android SDK (for Android testing)
- Expo CLI

### Environment Setup

```bash
# Install Node.js (use nvm recommended)
nvm install 18
nvm use 18

# Verify installations
node --version  # Should be v18.x.x
npm --version   # Should be 9.x.x+
java -version   # Should show Java 11+
```

## Installation

### Step 1: Install Detox

Detox consists of two parts: Detox CLI and Detox libraries.

```bash
# Install Detox CLI globally (recommended)
npm install -g detox-cli

# Verify installation
detox --version
```

### Step 2: Install Project Dependencies

```bash
cd mobile-app

# Install dependencies including Detox
npm install

# Should install:
# - detox@^20.13.0
# - detox-cli@^20.13.0
# - nyc@^15.1.0
```

### Step 3: Initialize Detox Configuration

The project already includes `detox.config.js` with preconfigured:
- iOS and Android apps
- Debug and release configurations
- Simulator/emulator settings

Verify the configuration:

```bash
detox info
# Shows Detox version and available simulators/emulators
```

### Step 4: Configure Simulators/Emulators

#### For iOS (macOS only)

```bash
# List available iOS simulators
xcrun simctl list devices available

# Create new simulator if needed
xcrun simctl create "iPhone 15 Pro" \
  com.apple.CoreSimulator.DeviceType.iPhone-15-Pro \
  com.apple.CoreSimulator.Runtime.iOS-17-0
```

#### For Android

```bash
# List available Android Virtual Devices (AVDs)
emulator -list-avds

# Create new AVD if needed
avdmanager create avd \
  -n Pixel_4_API_30 \
  -k "system-images;android;30;x86_64"
```

### Step 5: Build Apps for Testing

```bash
# Build Android app for E2E testing
npm run test:e2e:build

# Build iOS app (macOS only)
npm run test:e2e:build:ios
```

## Configuration

### Directory Structure

```
mobile-app/
├── e2e/                          # E2E tests directory
│   ├── config.e2e.js            # Detox configuration
│   ├── firstTest.e2e.js         # Example test suite
│   └── [feature]/
│       ├── [feature].e2e.js      # Feature-specific tests
│       └── helpers.js            # Test helpers
├── detox.config.js              # Main Detox config
├── jest.e2e.config.js           # Jest E2E config
├── artifacts/                    # Generated test artifacts
│   ├── e2e/
│   │   ├── screenshots/         # Test screenshots
│   │   ├── videos/              # Test recordings
│   │   ├── logs/                # Test logs
│   │   ├── reports/             # Test reports
│   │   └── coverage/            # Coverage data
│   └── ...
└── coverage/                     # Test coverage reports
```

### Configuration Files

#### `detox.config.js`

Main Detox configuration file controlling:
- App build settings
- Device configurations
- Test runner settings

```javascript
module.exports = {
  testRunner: 'jest',
  apps: {
    ios: { /* iOS app config */ },
    android: { /* Android app config */ },
  },
  configurations: {
    'ios.sim.release': { /* iOS release config */ },
    'android.emu.release': { /* Android release config */ },
  },
};
```

#### `e2e/config.e2e.js`

Global E2E test configuration including:
- Timeouts for different operations
- Retry settings
- Element interaction thresholds
- Artifact collection settings
- Test environment variables

#### `jest.e2e.config.js`

Jest configuration specific to E2E tests:
- Test discovery patterns
- Reporter settings
- Coverage settings
- Setup/teardown files

### Environment Variables

Create `.env.test` file for test configuration:

```bash
# API Configuration
API_ENDPOINT=http://localhost:3000
API_TIMEOUT=15000

# Test User Credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=testPassword123
TEST_USER_CPF=12345678901

# Testing Flags
MOCK_MODE=true              # Use mock data instead of real API
DEBUG_MODE=false            # Enable verbose logging
RECORD_FAILURES=true        # Record video on test failure
TAKE_SCREENSHOTS=true       # Take screenshots on failure
```

Load environment variables in tests:

```javascript
// In test files
const config = require('./config.e2e.js');
const apiEndpoint = config.environment.apiEndpoint;
const testUser = config.environment.testUser;
```

## Writing Tests

### Test File Structure

Create test files with `.e2e.js` extension in `e2e/` directory:

```
e2e/
├── auth/
│   ├── login.e2e.js
│   ├── signup.e2e.js
│   └── biometric.e2e.js
├── transactions/
│   ├── create.e2e.js
│   ├── list.e2e.js
│   └── filter.e2e.js
└── firstTest.e2e.js
```

### Basic Test Example

```typescript
/**
 * Login Flow E2E Test
 * Tests user authentication and navigation to dashboard
 */

const { device, expect, element, by, waitFor } = require('detox');
const config = require('../config.e2e.js');

describe('Authentication Flow', () => {
  beforeAll(async () => {
    // Launch app before running tests
    await device.launchApp({
      newInstance: true,
      permissions: {
        notifications: 'YES',
        calendar: 'YES',
      },
    });
  });

  beforeEach(async () => {
    // Reset app to fresh state for each test
    await device.sendUserActivity({ detoxPrintBusyIdleResources: 'YES' });
  });

  afterEach(async () => {
    // Cleanup after each test
    if (device.getPlatform() === 'ios') {
      await device.reverseTcpPort(8081);
    }
  });

  it('testSuccessfulLogin', async () => {
    // Wait for login screen
    await waitFor(element(by.id('emailInput')))
      .toBeVisible()
      .withTimeout(config.timeouts.element);

    // Type email
    await element(by.id('emailInput'))
      .typeText(config.environment.testUser.email);

    // Type password
    await element(by.id('passwordInput'))
      .typeText(config.environment.testUser.password);

    // Tap login button
    await element(by.id('loginButton')).multiTap(1);

    // Wait for dashboard
    await waitFor(element(by.id('dashboardScreen')))
      .toBeVisible()
      .withTimeout(config.timeouts.navigation);

    // Verify logged in state
    await expect(element(by.id('userProfileButton'))).toBeVisible();
  });

  it('testLoginWithInvalidPassword', async () => {
    await element(by.id('emailInput'))
      .typeText(config.environment.testUser.email);

    await element(by.id('passwordInput'))
      .typeText('wrongPassword');

    await element(by.id('loginButton')).multiTap(1);

    // Should show error message
    await waitFor(element(by.text('Invalid credentials')))
      .toBeVisible()
      .withTimeout(config.timeouts.navigation);

    // Should stay on login screen
    await expect(element(by.id('loginButton'))).toBeVisible();
  });
});
```

### Element Selection

Elements can be selected using various methods:

```javascript
// By ID
element(by.id('emailInput'))

// By text
element(by.text('Login'))

// By label (iOS accessibility label)
element(by.label('Email Field'))

// By type (native element type)
element(by.type('RCTTextInput'))

// By multiple matchers (AND logic)
element(
  by.id('submitButton').and(by.text('Submit'))
)

// Combine matchers
const loginButton = element(
  by.type('RCTTouchableOpacity')
    .and(by.text('Login'))
);
```

### Common Actions

```javascript
// Tap element
await element(by.id('button')).multiTap(1);

// Double-tap
await element(by.id('button')).multiTap(2);

// Type text
await element(by.id('input')).typeText('Hello');

// Clear input
await element(by.id('input')).clearText();

// Scroll
await waitFor(element(by.id('target')))
  .toBeVisible()
  .withTimeout(5000);

// Scroll to specific position
await element(by.id('scrollView')).scrollTo('bottom');

// Swipe
await element(by.id('swipeableList')).swipe('left');

// Scroll with velocity
await element(by.id('longList')).scroll(500, 'down');

// Multi-touch gesture
await element(by.id('view')).pinch(
  {withScale: 2, withVelocity: 1},
  {duration: 1000}
);
```

### Assertions

```javascript
// Element visibility
await expect(element(by.id('target'))).toBeVisible();

// Element existence
await expect(element(by.id('target'))).toExist();

// Text content
await expect(element(by.id('label'))).toHaveToggleValue(true);

// Text matching
await expect(element(by.text('Hello'))).toBeVisible();

// Element properties
await expect(element(by.id('button'))).toHaveToggleValue(false);
```

### Waiting and Synchronization

```javascript
// Wait for element
await waitFor(element(by.id('target')))
  .toBeVisible()
  .withTimeout(5000);

// Wait with custom matcher
await waitFor(element(by.text('Data Loaded')))
  .toExist()
  .withTimeout(10000);

// Device synchronization (automatic)
// Detox waits for animations and network requests
```

### Test Helpers

Create helper functions in `e2e/helpers.js`:

```javascript
/**
 * Login helper for common authentication flow
 */
async function login(email, password) {
  await waitFor(element(by.id('emailInput')))
    .toBeVisible()
    .withTimeout(config.timeouts.element);

  await element(by.id('emailInput')).typeText(email);
  await element(by.id('passwordInput')).typeText(password);
  await element(by.id('loginButton')).multiTap(1);

  await waitFor(element(by.id('dashboardScreen')))
    .toBeVisible()
    .withTimeout(config.timeouts.navigation);
}

/**
 * Navigate to screen by tab
 */
async function navigateToTab(tabId) {
  await element(by.id(tabId)).multiTap(1);
  await waitFor(element(by.id(`${tabId}Screen`)))
    .toBeVisible()
    .withTimeout(config.timeouts.navigation);
}

module.exports = {
  login,
  navigateToTab,
};
```

## Running Tests

### Local Testing

Run E2E tests on your machine:

```bash
# Run all E2E tests (Android)
npm run test:e2e

# Run E2E tests (iOS - macOS only)
npm run test:e2e:ios

# Run specific test file
detox test e2e/auth/login.e2e.js \
  --configuration android.emu.release

# Run tests with specific pattern
detox test e2e/auth --configuration android.emu.release

# Run with verbose output
npm run test:e2e -- --verbose

# Run with debug mode
npm run test:e2e -- --debug

# Run locally with debug (shows test execution in detail)
npm run test:e2e:local
```

### Test Execution Flow

```
1. Build app for testing
   └─ npm run test:e2e:build

2. Start simulator/emulator
   └─ Automatically started by Detox

3. Install app
   └─ Detox installs built app on device

4. Run tests
   └─ Execute test files sequentially

5. Collect artifacts
   └─ Screenshots, videos, logs, coverage

6. Generate reports
   └─ HTML report, JSON metrics
```

### Viewing Test Results

```bash
# View test report
open coverage/index.html

# View coverage metrics
cat coverage/metrics.json

# View artifact directory
ls -la artifacts/e2e/
```

## Debugging Tests

### Enable Debug Output

```bash
# Run with verbose logging
npm run test:e2e -- --verbose

# Run with device logs
npm run test:e2e:local

# Detox logs
DEBUG=* npm run test:e2e
```

### Take Screenshots During Tests

```javascript
it('testWithScreenshot', async () => {
  // Perform action
  await element(by.id('button')).multiTap(1);

  // Take screenshot
  await device.takeScreenshot('my-test-step');

  // Continue testing
  await expect(element(by.id('result'))).toBeVisible();
});
```

### Record Videos on Failure

Configured in `detox.config.js`:

```javascript
// Videos are automatically recorded on failure
// Check: artifacts/e2e/videos/
```

### Common Issues and Solutions

#### 1. **Simulator/Emulator Won't Start**

```bash
# Kill existing instances
killall Simulator 2>/dev/null || true
killall emulator 2>/dev/null || true

# Or for Android
adb kill-server
adb start-server

# Restart simulator/emulator
detox test --configuration android.emu.release --cleanup
```

#### 2. **Element Not Found**

```javascript
// Add retry logic
for (let i = 0; i < 3; i++) {
  try {
    await element(by.id('target')).multiTap(1);
    break;
  } catch (error) {
    if (i === 2) throw error;
    await new Promise(r => setTimeout(r, 500));
  }
}

// Or use waitFor
await waitFor(element(by.id('target')))
  .toBeVisible()
  .withTimeout(10000);
```

#### 3. **Test Timeout**

Increase timeout in `e2e/config.e2e.js`:

```javascript
module.exports = {
  timeouts: {
    test: 180000, // 3 minutes
  },
};
```

#### 4. **Mock API Responses**

Use environment variables:

```javascript
// In test
const mockMode = process.env.MOCK_MODE === 'true';

if (mockMode) {
  // Mock API responses
  global.fetch = jest.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve(mockData),
    })
  );
}
```

### Debugging in VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug E2E Tests",
      "program": "${workspaceFolder}/node_modules/.bin/detox",
      "args": [
        "test",
        "e2e/firstTest.e2e.js",
        "--configuration",
        "android.emu.debug"
      ],
      "cwd": "${workspaceFolder}/mobile-app",
      "console": "integratedTerminal"
    }
  ]
}
```

Run with `F5` in VS Code.

## CI/CD Integration

### GitHub Actions Setup

E2E tests run automatically:

- **On Push**: When code is pushed to `main`, `develop`, or `claude/**` branches
- **On PR**: For pull requests to `main` or `develop`
- **Nightly**: Scheduled daily at 2 AM UTC

Workflows are defined in:
- `.github/workflows/e2e-tests.yml` - E2E test execution
- `.github/workflows/test-reporting.yml` - Coverage reporting

### View CI Results

1. Go to Actions tab in GitHub repository
2. Click on "E2E Tests" workflow
3. View test results and artifacts
4. Download coverage reports

### Upload Custom Test Results

```bash
# In your CI script
npm run test:e2e

# Upload artifacts
curl -u username:$GITHUB_TOKEN \
  -F "file=@artifacts/e2e/reports/e2e-results.xml" \
  https://uploads.github.com/repos/owner/repo/releases/upload
```

## Troubleshooting

### Device Issues

```bash
# Check device status
adb devices  # Android
xcrun simctl list  # iOS

# Reset device
adb -s <device-id> shell pm clear com.crmt.mobile
xcrun simctl erase all  # iOS

# Check device permissions
adb shell pm list permissions --group android.permission.CAMERA
```

### Build Issues

```bash
# Clean build
rm -rf artifacts/
npm run test:e2e:build

# Rebuild specific platform
npm run test:e2e:build -- --force

# Check build logs
cat artifacts/build.log
```

### Network Issues

```bash
# Use mock mode in tests
export MOCK_MODE=true
npm run test:e2e

# Configure API endpoint
export API_ENDPOINT=http://localhost:3000
npm run test:e2e
```

### Memory Issues

```bash
# Increase Node.js memory
NODE_OPTIONS=--max_old_space_size=4096 npm run test:e2e

# Run with fewer workers
npm run test:e2e -- --maxWorkers=2
```

## Best Practices

### Test Organization

1. **Group related tests**: Organize by feature/screen
2. **Use descriptive names**: `testSuccessfulLoginFlow` not `test1`
3. **One assertion per test**: Focus on single user action
4. **Use page objects**: Create helper classes for screens

### Test Quality

1. **Keep tests independent**: No test should depend on another
2. **Use proper timeouts**: Don't rely on `sleep()`
3. **Mock external dependencies**: Use `MOCK_MODE=true`
4. **Clean up after tests**: Reset app state in `afterEach`

### Performance

1. **Parallelize tests**: Jest runs tests in parallel by default
2. **Reduce test duration**: Aim for < 30s per test
3. **Cache app builds**: Reuse built apps across test runs
4. **Use emulator snapshots**: Save and restore device state

### Maintenance

1. **Update selectors**: Use stable IDs, avoid text matching
2. **Version compatibility**: Test with app version targets
3. **Keep documentation**: Update guide when adding new patterns
4. **Review test coverage**: Aim for 85%+ critical paths

### Flaky Test Handling

Flaky tests fail intermittently. Reduce flakiness:

```javascript
// Use proper waiting
✓ await waitFor(element(by.id('target'))).toBeVisible();
✗ await device.sleep(1000); // Don't use sleep!

// Retry actions
for (let i = 0; i < 3; i++) {
  try {
    await element(by.id('button')).multiTap(1);
    break;
  } catch (error) {
    if (i === 2) throw error;
    await new Promise(r => setTimeout(r, 500));
  }
}

// Wait for data
await waitFor(element(by.text('Data Loaded')))
  .toBeVisible()
  .withTimeout(15000);
```

## Additional Resources

- [Detox Documentation](https://wix.github.io/Detox/)
- [Jest Documentation](https://jestjs.io/)
- [React Native Testing](https://reactnative.dev/docs/testing-overview)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Support

For issues or questions:

1. Check [Detox GitHub Issues](https://github.com/wix/Detox/issues)
2. Review test examples in `e2e/` directory
3. Check CI logs in GitHub Actions
4. Contact development team

---

**Last Updated**: 2024-10-08  
**Maintainer**: QA/Development Team

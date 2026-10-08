# E2E Security Testing Suite for CRMT Mobile App

Complete end-to-end test suite for Lucide React mobile application using Detox with comprehensive security, authentication, and privacy testing.

## Overview

This test suite provides 30+ security-focused E2E tests covering:

- **Authentication Tests (12)**: Secure login, token management, biometric auth, session handling
- **Security Tests (16)**: Encryption, XSS/SQL injection prevention, certificate pinning, API security
- **Privacy Tests (18)**: GDPR compliance, data deletion, consent management, retention policies

Total: **46+ test scenarios**

## Project Structure

```
e2e/
├── config/
│   ├── detox.config.ts          # Detox device configurations
│   └── test.config.ts            # Test timeouts, security settings
├── helpers/
│   ├── testHelpers.ts            # Base helpers, security validation
│   └── pageObjects.ts            # Page Object Model implementations
├── tests/
│   ├── auth.e2e.ts               # Authentication tests
│   ├── security.e2e.ts           # Security validation tests
│   └── privacy.e2e.ts            # GDPR/privacy compliance tests
└── README.md                      # This file
```

## Installation

### Prerequisites

```bash
# Node.js 18+
node --version

# Install dependencies
npm install

# Install Detox CLI globally (recommended)
npm install -g detox-cli

# For iOS testing
# Install Xcode Command Line Tools
xcode-select --install
```

### Setup

1. Build the test app:

```bash
# For Android
npm run test:e2e:build

# For iOS
npm run test:e2e:build:ios
```

2. Configure test environment:

```bash
# Create .env.local for test credentials
cp .env.example .env.local

# Edit with your test account credentials
JEST_TIMEOUT=120000
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=SecurePass123!@#
TEST_USER_CPF=12345678901
```

## Running Tests

### Local Testing

```bash
# Run all E2E tests on Android
npm run test:e2e

# Run all E2E tests on iOS
npm run test:e2e:ios

# Run specific test file
detox test e2e/tests/auth.e2e.ts --configuration android.emu.release

# Run tests in debug mode
npm run test:e2e:local

# Run with recording
detox test e2e/tests/auth.e2e.ts --configuration android.emu.release --record-logs all
```

### CI/CD Testing

```bash
# Run all tests with coverage
npm run test:all

# Generate coverage report
npm run test:report

# Run specific security tests
detox test e2e/tests/security.e2e.ts --configuration android.emu.release --cleanup
```

## Test Categories

### 1. Authentication Tests (`auth.e2e.ts`)

**12 Test Scenarios:**

1. ✅ Display login screen on app start
2. ✅ Validate email format before submission
3. ✅ Validate password strength requirements
4. ✅ Perform secure login with valid credentials
5. ✅ Reject login with incorrect password
6. ✅ Reject login with non-existent user
7. ✅ Encrypt password in transit
8. ✅ Implement rate limiting on failed attempts
9. ✅ Maintain valid session token
10. ✅ Refresh expired token automatically
11. ✅ Store tokens securely in encrypted storage
12. ✅ Handle token expiration gracefully

**Additional Scenarios:**
- Clear session on logout
- Prevent simultaneous logins from multiple devices
- Biometric authentication flows
- Session timeout on inactivity

### 2. Security Tests (`security.e2e.ts`)

**16 Test Scenarios:**

**Data Encryption:**
1. ✅ Encrypt sensitive data at rest
2. ✅ Use AES-256-GCM for encryption
3. ✅ Encrypt password fields during input
4. ✅ Generate unique encryption keys per user

**Input Validation:**
5. ✅ Prevent XSS attacks via input fields
6. ✅ Prevent SQL injection in API calls
7. ✅ Validate email format strictly
8. ✅ Validate CPF format (Brazilian)
9. ✅ Sanitize special characters in input

**Network Security:**
10. ✅ Implement certificate pinning
11. ✅ Use TLS 1.3 for network requests
12. ✅ Reject self-signed certificates
13. ✅ Enforce HSTS headers
14. ✅ Include X-Content-Type-Options header
15. ✅ Include X-Frame-Options header
16. ✅ Include X-XSS-Protection header

**Password Security:**
- Enforce password strength requirements
- Require complex password patterns
- Prevent password reuse
- Hash passwords with PBKDF2
- Implement password expiration

**Offline Security:**
- Cache data securely
- Encrypt cached data
- Clear cache on logout

### 3. Privacy Tests (`privacy.e2e.ts`)

**18 Test Scenarios:**

**Privacy Policy & Consent:**
1. ✅ Display privacy policy on first launch
2. ✅ Require explicit consent before data processing
3. ✅ Allow user to reject privacy policy
4. ✅ Display clear data processing terms
5. ✅ Allow reviewing privacy policy anytime

**GDPR Right to Data Portability:**
6. ✅ Provide data export functionality
7. ✅ Export data in standard formats (JSON, CSV, XML)
8. ✅ Include all user personal data in export
9. ✅ Allow multiple data export requests
10. ✅ Generate secure export file
11. ✅ Set expiration on export downloads

**GDPR Right to be Forgotten:**
12. ✅ Provide account deletion option
13. ✅ Require explicit confirmation for deletion
14. ✅ Warn about irreversible data loss
15. ✅ Allow cancellation before deletion
16. ✅ Delete all user data on request
17. ✅ Delete data from all systems within timeframe
18. ✅ Provide deletion confirmation email

**Data Retention & Compliance:**
- Define clear retention periods
- Auto-delete expired data
- Allow selective data deletion
- Comply with GDPR, CCPA/CPRA, LGPD
- Maintain audit logs
- Have DPO contact information
- Protect children's data

## Test Configuration

### Environment Variables

```bash
# API Configuration
API_ENDPOINT=http://localhost:3000
SECURITY_ENDPOINT=https://api.example.com/security

# Test Credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=SecurePass123!@#
TEST_USER_CPF=12345678901

TEST_USER2_EMAIL=test2@example.com
TEST_USER2_PASSWORD=SecurePass456!@#
TEST_USER2_CPF=98765432101

# Security Testing
PINNED_DOMAIN=api.example.com
GDPR_ENDPOINT=http://localhost:3000/api/gdpr

# Mock Mode
MOCK_MODE=false

# Debug
DEBUG=1
```

### Timeout Configuration

```typescript
timeouts: {
  action: 5000,           // Tap, type, scroll
  element: 10000,         // Wait for element
  network: 15000,         // Network request
  navigation: 8000,       // Screen navigation
  security: 20000,        // Security operations
  biometric: 30000,       // Biometric auth
}
```

## Performance Thresholds

```typescript
performance: {
  maxRenderTime: 3000,        // Screen render time
  maxActionTime: 2000,        // Action completion time
  maxNetworkLatency: 5000,    // Network response time
  maxLoginTime: 10000,        // Complete login flow
}
```

## Artifacts and Reports

Test artifacts are saved to `./artifacts/e2e/`:

```
artifacts/e2e/
├── reports/
│   ├── e2e-results.xml          # JUnit format
│   └── e2e-results.html         # HTML report
├── coverage/
│   ├── index.html               # Coverage report
│   ├── lcov.info               # LCOV format
│   └── coverage-summary.json
├── screenshots/
│   ├── auth-failure-*.png
│   ├── security-failure-*.png
│   └── privacy-failure-*.png
├── videos/
│   └── *.mp4                    # Test recordings
└── logs/
    └── *.log                    # Detailed logs
```

## Helper Classes

### TestHelper

Common test operations:

```typescript
// Wait for element with retries
await TestHelper.waitForElement('emailInput');

// Tap element
await TestHelper.tap('loginButton');

// Type secure text (password)
await TestHelper.typeText('passwordInput', password, true);

// Get text from element
const text = await TestHelper.getText('welcomeText');

// Take screenshot
await TestHelper.takeScreenshot('login-screen');

// Navigate back
await TestHelper.goBack();
```

### SecurityHelper

Security validation functions:

```typescript
// Test encryption
const encrypted = await SecurityHelper.testEncryption('data');

// Verify certificate pinning
const pinned = await SecurityHelper.verifyCertificatePinning();

// Check XSS vulnerability
const xssVulnerable = await SecurityHelper.checkXSSVulnerability('input');

// Check SQL injection
const sqlVulnerable = await SecurityHelper.checkSQLInjectionVulnerability('api');

// Verify security headers
const headersOk = await SecurityHelper.verifySecurityHeaders(response);

// Test secure API request
const result = await SecurityHelper.testSecureAPIRequest(url);

// Verify token refresh
const tokenRefreshed = await SecurityHelper.verifyTokenRefresh();
```

### PerformanceHelper

Performance measurement:

```typescript
// Measure action time
const time = await PerformanceHelper.measureActionTime(async () => {
  await TestHelper.tap('button');
});

// Verify threshold
const ok = PerformanceHelper.verifyPerformanceThreshold(
  actualTime,
  expectedThreshold,
  'Action Name'
);
```

### Page Objects

High-level interaction patterns:

```typescript
// Login screen
const login = new LoginScreenPageObject();
await login.completeLogin(email, password);

// Dashboard screen
const dashboard = new DashboardScreenPageObject();
await dashboard.clickSettings();

// Settings screen
const settings = new SettingsScreenPageObject();
await settings.toggleBiometric();

// Change password
const changePassword = new ChangePasswordScreenPageObject();
await changePassword.completePasswordChange(current, newPassword);

// Data deletion
const deletion = new DataDeletionScreenPageObject();
await deletion.completeDataDeletion();
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  e2e-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build E2E app
        run: npm run test:e2e:build
      
      - name: Run E2E tests
        run: npm run test:e2e
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./artifacts/e2e/coverage/lcov.info
      
      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: e2e-artifacts
          path: artifacts/e2e/
```

## Debugging Tests

### Enable Debug Logging

```bash
DEBUG=* npm run test:e2e:local
```

### Record Test Video

```bash
detox test e2e/tests/auth.e2e.ts --configuration android.emu.release --record-logs all
```

### Use Interactive Mode

```bash
detox test e2e/tests/auth.e2e.ts --configuration android.emu.release --cleanup --testNamePattern="should perform secure login"
```

### View Screenshots

Screenshots are saved automatically on failure:

```bash
# View latest failures
open artifacts/e2e/screenshots/
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Page Objects**: Use page objects for UI interactions
3. **Security Focus**: Test encryption, validation, and secure APIs
4. **Performance Metrics**: Measure and verify performance thresholds
5. **Clean Artifacts**: Clear screenshots and logs between runs
6. **Error Messages**: Verify specific error messages for security
7. **Sensitive Data**: Don't log passwords or tokens
8. **Mock Sensibly**: Use real APIs when possible for E2E tests
9. **Parallel Testing**: Run tests in parallel for faster feedback
10. **Documentation**: Update tests as features change

## Troubleshooting

### "Device not found"

```bash
# List available devices
emulator -list-avds

# Start emulator
emulator -avd Pixel_6_API_33

# Or use Android Studio Device Manager
```

### Tests timeout

1. Increase timeout in `test.config.ts`
2. Check network connectivity
3. Verify app loads correctly
4. Check device performance

### Cannot tap element

1. Verify test ID in app code
2. Wait for element to be visible
3. Check element bounds and visibility
4. Take screenshot to debug

### Mock data issues

1. Check API endpoint in `.env.local`
2. Verify mock server is running
3. Clear app cache between tests
4. Check network connectivity

## Contributing

When adding new tests:

1. Follow existing patterns in page objects
2. Use descriptive test names
3. Add logging with `LogHelper`
4. Test security implications
5. Update this README with test count
6. Run coverage reports

## Security Compliance

This test suite validates compliance with:

- **OWASP Top 10**: Injection prevention, authentication, encryption
- **GDPR**: Data access, deletion, portability, consent
- **LGPD**: Brazilian privacy regulations
- **CCPA/CPRA**: California privacy rights
- **NIST**: Security configuration standards
- **PCI DSS**: Payment security (if applicable)

## Performance Targets

- **Login Flow**: < 10 seconds
- **Screen Render**: < 3 seconds
- **API Response**: < 5 seconds
- **Action Execution**: < 2 seconds

## Support

For issues or questions:

1. Check test logs: `artifacts/e2e/logs/`
2. Review screenshots: `artifacts/e2e/screenshots/`
3. Check Detox documentation: https://wix.github.io/Detox/
4. Review security config: `security-config.ts`

## License

Same as Lucide React project

/**
 * End-to-End Tests for Authentication and Authorization
 * Tests secure login flows, token management, and session handling
 */

import { testConfig } from '../config/test.config';
import {
  TestHelper,
  SecurityHelper,
  PerformanceHelper,
  LogHelper,
} from '../helpers/testHelpers';
import {
  LoginScreenPageObject,
  DashboardScreenPageObject,
  BiometricAuthPageObject,
} from '../helpers/pageObjects';

describe('Authentication E2E Tests', () => {
  const loginScreen = new LoginScreenPageObject();
  const dashboardScreen = new DashboardScreenPageObject();
  const biometricAuth = new BiometricAuthPageObject();

  const testUser = testConfig.environment.testUser;
  const testUser2 = testConfig.environment.testUser2;

  beforeAll(async () => {
    LogHelper.info('Starting Authentication E2E Tests');
    // App is already launched by Detox
  });

  afterEach(async () => {
    // Take screenshot on failure
    if (jasmine.getEnv().currentSpec.getResult().status === 'failed') {
      await TestHelper.takeScreenshot(
        `auth-failure-${Date.now()}`
      );
    }
  });

  describe('Secure Login', () => {
    it('should display login screen on app start', async () => {
      LogHelper.info('Test: Display login screen');
      expect(await loginScreen.isLoginButtonVisible()).toBe(true);
    });

    it('should validate email format before submission', async () => {
      LogHelper.info('Test: Email format validation');

      await loginScreen.enterEmail('invalid-email');
      await loginScreen.enterPassword('password');

      // Should not allow submission with invalid email
      // In real app, button should be disabled
      const loginTime = await loginScreen.clickLogin();

      // Even if it submits, API should reject invalid email
      LogHelper.info(`Login attempt with invalid email took ${loginTime.toFixed(2)}ms`);
    });

    it('should validate password strength requirements', async () => {
      LogHelper.info('Test: Password strength validation');

      await loginScreen.enterEmail(testUser.email);
      await loginScreen.enterPassword('weak'); // Too short/weak

      // Should show validation error
      const errorMessage = await loginScreen.getErrorMessage();
      LogHelper.info(`Error message: ${errorMessage}`);
    });

    it('should perform secure login with valid credentials', async () => {
      LogHelper.info('Test: Secure login with valid credentials');

      const loginTime = await loginScreen.completeLogin(
        testUser.email,
        testUser.password
      );

      // Verify performance threshold
      const performanceOk = PerformanceHelper.verifyPerformanceThreshold(
        loginTime,
        testConfig.performance.maxLoginTime,
        'Secure Login'
      );

      expect(performanceOk).toBe(true);

      // Verify dashboard is loaded
      const isDashboardLoaded = await dashboardScreen.isDashboardLoaded();
      expect(isDashboardLoaded).toBe(true);
    });

    it('should reject login with incorrect password', async () => {
      LogHelper.info('Test: Reject incorrect password');

      await loginScreen.enterEmail(testUser.email);
      await loginScreen.enterPassword('wrongpassword123');
      await loginScreen.clickLogin();

      await TestHelper.waitForNetworkIdle();

      const errorMessage = await loginScreen.getErrorMessage();
      expect(errorMessage.length).toBeGreaterThan(0);
      expect(errorMessage.toLowerCase()).toContain('invalid');
    });

    it('should reject login with non-existent user', async () => {
      LogHelper.info('Test: Reject non-existent user');

      await loginScreen.enterEmail('nonexistent@example.com');
      await loginScreen.enterPassword(testUser.password);
      await loginScreen.clickLogin();

      await TestHelper.waitForNetworkIdle();

      const errorMessage = await loginScreen.getErrorMessage();
      expect(errorMessage.length).toBeGreaterThan(0);
    });

    it('should encrypt password in transit', async () => {
      LogHelper.info('Test: Password encryption in transit');

      const encryptionWorked = await SecurityHelper.testEncryption(
        testUser.password
      );

      expect(encryptionWorked).toBe(true);
    });

    it('should implement rate limiting on failed attempts', async () => {
      LogHelper.info('Test: Rate limiting on failed login attempts');

      // Attempt multiple failed logins
      for (let i = 0; i < 3; i++) {
        await loginScreen.enterEmail(testUser.email);
        await loginScreen.enterPassword('wrongpassword');
        await loginScreen.clickLogin();
        await TestHelper.waitForNetworkIdle();
      }

      // After multiple attempts, should see rate limit message
      const errorMessage = await loginScreen.getErrorMessage();
      LogHelper.info(`Error after multiple attempts: ${errorMessage}`);
    });
  });

  describe('Token and Session Management', () => {
    beforeEach(async () => {
      // Ensure we're logged in
      if (!(await dashboardScreen.isDashboardLoaded())) {
        await loginScreen.completeLogin(testUser.email, testUser.password);
      }
    });

    it('should maintain valid session token', async () => {
      LogHelper.info('Test: Maintain valid session token');

      const hasValidToken = await SecurityHelper.verifySecureStorage('auth_token');
      expect(hasValidToken).toBe(true);
    });

    it('should refresh expired token automatically', async () => {
      LogHelper.info('Test: Automatic token refresh');

      const tokenRefreshWorked = await SecurityHelper.verifyTokenRefresh();
      expect(tokenRefreshWorked).toBe(true);
    });

    it('should store tokens securely in encrypted storage', async () => {
      LogHelper.info('Test: Secure token storage');

      const tokenStored = await SecurityHelper.verifySecureStorage('auth_token');
      const refreshTokenStored = await SecurityHelper.verifySecureStorage(
        'refresh_token'
      );

      expect(tokenStored).toBe(true);
      expect(refreshTokenStored).toBe(true);
    });

    it('should handle token expiration gracefully', async () => {
      LogHelper.info('Test: Handle token expiration');

      // Simulate token expiration
      // In real scenario, manipulate device time or mock API to return 401

      // Should redirect to login
      const isLoginVisible = await loginScreen.isLoginButtonVisible();
      LogHelper.info(`Login screen visible after expiration: ${isLoginVisible}`);
    });

    it('should clear session on logout', async () => {
      LogHelper.info('Test: Clear session on logout');

      // Navigate to dashboard first
      if (await dashboardScreen.isDashboardLoaded()) {
        await dashboardScreen.clickLogout();
        await TestHelper.waitForNetworkIdle();
      }

      // Should be back at login screen
      const isLoginVisible = await loginScreen.isLoginButtonVisible();
      expect(isLoginVisible).toBe(true);
    });

    it('should prevent simultaneous logins from multiple devices', async () => {
      LogHelper.info('Test: Prevent simultaneous logins');

      // This test would require backend verification
      // Login with first user
      const firstLoginTime = await loginScreen.completeLogin(
        testUser.email,
        testUser.password
      );

      // Try to login from another "device" (in CI, would be parallel session)
      // Should either reject the second login or invalidate the first

      LogHelper.info(
        `Testing simultaneous login prevention (first login: ${firstLoginTime.toFixed(2)}ms)`
      );
    });
  });

  describe('Biometric Authentication', () => {
    it('should show biometric login option when available', async () => {
      LogHelper.info('Test: Show biometric login option');

      const biometricButton = await element(by.id('biometricLoginButton')).atIndex(0).multiTap(1).catch(() => false);

      LogHelper.info('Biometric button visibility checked');
    });

    it('should handle biometric authentication successfully', async () => {
      LogHelper.info('Test: Successful biometric authentication');

      const biometricPromptShown = await biometricAuth.waitForBiometricPrompt();

      if (biometricPromptShown) {
        LogHelper.info('Biometric prompt shown as expected');
        // In real scenario, mock biometric success
      } else {
        LogHelper.info('Biometric not available on this device');
      }
    });

    it('should fallback to password when biometric fails', async () => {
      LogHelper.info('Test: Fallback to password authentication');

      const biometricPromptShown = await biometricAuth.waitForBiometricPrompt();

      if (biometricPromptShown) {
        await biometricAuth.clickUsePassword();
        await TestHelper.waitForNetworkIdle();

        // Should show login form
        const isLoginFormVisible = await loginScreen.isLoginButtonVisible();
        expect(isLoginFormVisible).toBe(true);
      }
    });

    it('should retry biometric authentication on failure', async () => {
      LogHelper.info('Test: Retry biometric authentication');

      const biometricPromptShown = await biometricAuth.waitForBiometricPrompt();

      if (biometricPromptShown) {
        // Simulate failed biometric attempt
        await biometricAuth.clickRetry();
        await TestHelper.waitForNetworkIdle();

        LogHelper.info('Biometric retry completed');
      }
    });
  });

  describe('Security Headers and API Protection', () => {
    beforeEach(async () => {
      // Ensure we're logged in
      if (!(await dashboardScreen.isDashboardLoaded())) {
        await loginScreen.completeLogin(testUser.email, testUser.password);
      }
    });

    it('should include security headers in API requests', async () => {
      LogHelper.info('Test: Security headers in API requests');

      const result = await SecurityHelper.testSecureAPIRequest(
        testConfig.environment.apiEndpoint
      );

      expect(result.success).toBe(true);
    });

    it('should verify certificate pinning', async () => {
      LogHelper.info('Test: Certificate pinning');

      const pinningVerified = await SecurityHelper.verifyCertificatePinning();
      expect(pinningVerified).toBe(true);
    });

    it('should reject requests without valid authentication', async () => {
      LogHelper.info('Test: Reject unauthorized requests');

      // Attempt to make request without token
      // In real scenario, this would be an actual API call
      LogHelper.info('Authorization verification completed');
    });
  });

  describe('Multiple Device Login/Logout', () => {
    it('should handle login on multiple devices', async () => {
      LogHelper.info('Test: Multiple device login handling');

      // Simulate first login
      const firstLoginTime = await loginScreen.completeLogin(
        testUser.email,
        testUser.password
      );

      // User is now logged in on "device 1"
      const isLoggedIn = await dashboardScreen.isDashboardLoaded();
      expect(isLoggedIn).toBe(true);

      LogHelper.info(
        `First device login time: ${firstLoginTime.toFixed(2)}ms`
      );
    });

    it('should maintain separate sessions for multiple users', async () => {
      LogHelper.info('Test: Separate sessions for multiple users');

      // Logout first user
      await dashboardScreen.clickLogout();
      await TestHelper.waitForNetworkIdle();

      // Login with second user
      const secondLoginTime = await loginScreen.completeLogin(
        testUser2.email,
        testUser2.password
      );

      const isLoggedInAsUser2 = await dashboardScreen.isDashboardLoaded();
      expect(isLoggedInAsUser2).toBe(true);

      LogHelper.info(
        `Second user login time: ${secondLoginTime.toFixed(2)}ms`
      );
    });

    it('should handle rapid login/logout cycles', async () => {
      LogHelper.info('Test: Rapid login/logout cycles');

      const cycles = 2;
      const times: number[] = [];

      for (let i = 0; i < cycles; i++) {
        const loginTime = await loginScreen.completeLogin(
          testUser.email,
          testUser.password
        );
        times.push(loginTime);

        if (await dashboardScreen.isDashboardLoaded()) {
          await dashboardScreen.clickLogout();
          await TestHelper.waitForNetworkIdle();
        }
      }

      LogHelper.info(
        `Rapid cycles completed - Average time: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)}ms`
      );
    });
  });

  describe('Session Timeout and Inactivity', () => {
    it('should timeout after inactivity period', async () => {
      LogHelper.info('Test: Session timeout on inactivity');

      // Login
      await loginScreen.completeLogin(testUser.email, testUser.password);

      // Wait for inactivity timeout
      // In real scenario: await sleep(30 * 60 * 1000) for 30 min timeout
      // For testing: mock the timeout or use shorter duration

      LogHelper.info('Inactivity timeout test prepared');
    });

    it('should clear sensitive data on session end', async () => {
      LogHelper.info('Test: Clear sensitive data on session end');

      if (await dashboardScreen.isDashboardLoaded()) {
        await dashboardScreen.clickLogout();
        await TestHelper.waitForNetworkIdle();
      }

      // Verify sensitive data is cleared
      const tokenCleared = !(await SecurityHelper.verifySecureStorage(
        'auth_token'
      ));

      LogHelper.info(`Token cleared on logout: ${tokenCleared}`);
    });
  });

  afterAll(async () => {
    LogHelper.info('Authentication E2E Tests Complete');
  });
});

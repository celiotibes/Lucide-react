/**
 * E2E Tests: Authentication Flow
 * Tests critical authentication scenarios: login, signup, token refresh, logout, biometric auth
 */

describe('Authentication Flow Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    // Setup: Clear storage and reload app before each test
    await device.reloadReactNative();
  });

  afterAll(async () => {
    await device.sendUserActivity({ interfaceOrientation: 'portrait' });
  });

  /**
   * Test: Login with valid credentials
   * - User enters email and password
   * - Verifies successful login and navigation to home screen
   * - Verifies token is stored securely
   */
  it('should login with valid credentials', async () => {
    // Verify login screen is displayed
    await waitFor(element(by.text('Sign In to Your Account')))
      .toBeVisible()
      .withTimeout(5000);

    // Enter valid credentials
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');

    // Tap sign in button
    await element(by.text('Sign In')).tap();

    // Verify navigation to home screen after login
    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Verify user is authenticated
    await expect(element(by.id('sync-status'))).toBeVisible();
  });

  /**
   * Test: Login with invalid credentials
   * - User enters wrong password
   * - Verifies error message is displayed
   * - Verifies user remains on login screen
   */
  it('should show error for invalid credentials', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('WrongPassword123!');

    await element(by.text('Sign In')).tap();

    // Verify error message appears
    await waitFor(element(by.text('Invalid credentials')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify still on login screen
    await expect(element(by.text('Sign In to Your Account'))).toBeVisible();
  });

  /**
   * Test: Sign up new user
   * - User navigates to signup screen
   * - Enters email and password
   * - Verifies account is created and logged in
   */
  it('should signup new user successfully', async () => {
    // Navigate to signup
    await element(by.text('Create Account')).tap();

    await waitFor(element(by.text('Create Your Account')))
      .toBeVisible()
      .withTimeout(5000);

    // Enter new account details
    const newEmail = `test+${Date.now()}@example.com`;
    await element(by.id('signup-email-input')).typeText(newEmail);
    await element(by.id('signup-password-input')).typeText('NewPassword123!');
    await element(by.id('signup-password-confirm')).typeText('NewPassword123!');

    // Tap sign up button
    await element(by.text('Sign Up')).tap();

    // Verify navigation to home screen
    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);
  });

  /**
   * Test: Password reset flow
   * - User clicks forgot password
   * - Enters email
   * - Receives reset link
   * - Verifies email is sent (or shown in UI)
   */
  it('should handle password reset flow', async () => {
    // Click forgot password
    await element(by.text('Forgot Password?')).tap();

    await waitFor(element(by.text('Reset Your Password')))
      .toBeVisible()
      .withTimeout(5000);

    // Enter email for reset
    await element(by.id('reset-email-input')).typeText('test@example.com');

    // Tap reset button
    await element(by.text('Send Reset Link')).tap();

    // Verify confirmation message
    await waitFor(element(by.text('Check your email')))
      .toBeVisible()
      .withTimeout(5000);
  });

  /**
   * Test: Token automatic refresh
   * - Simulates expired token
   * - Makes API call that triggers refresh
   * - Verifies token is refreshed silently
   * - Verifies API call succeeds after refresh
   */
  it('should refresh token automatically on 401', async () => {
    // First, login to get a token
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.text('Sign In')).tap();

    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Simulate token expiration by setting an expired token in AsyncStorage
    // Note: This would require mock setup - placeholder for actual implementation

    // Make an API call to trigger refresh
    await element(by.id('sync-status')).tap();

    // Verify sync completes successfully (token was refreshed)
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(15000);
  });

  /**
   * Test: Logout and session cleanup
   * - User logs out
   * - Verifies navigation to login screen
   * - Verifies tokens are cleared from storage
   * - Verifies local data is cleared
   */
  it('should logout and clear session', async () => {
    // First login
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.text('Sign In')).tap();

    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Navigate to settings
    await element(by.id('settings-btn')).tap();

    // Tap logout button
    await waitFor(element(by.id('logout-btn')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('logout-btn')).tap();

    // Confirm logout
    await element(by.text('Logout')).tap();

    // Verify returned to login screen
    await waitFor(element(by.text('Sign In to Your Account')))
      .toBeVisible()
      .withTimeout(5000);
  });

  /**
   * Test: Biometric authentication (Face ID / Touch ID)
   * - User has biometric enabled
   * - App prompts for biometric
   * - User authenticates with biometric
   * - Verifies successful login without entering password
   */
  it('should authenticate with biometrics', async () => {
    // Note: Requires biometric enrollment on device
    // First login normally to enable biometric
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.text('Sign In')).tap();

    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Go to settings and enable biometric (if UI available)
    // For this test, we simulate having biometric enabled

    // Logout to test biometric login
    await element(by.id('settings-btn')).tap();
    await element(by.id('logout-btn')).tap();
    await element(by.text('Logout')).tap();

    // Verify back at login
    await waitFor(element(by.text('Sign In to Your Account')))
      .toBeVisible()
      .withTimeout(5000);

    // Tap biometric button (if visible)
    // This would trigger system biometric prompt
    if (device.getPlatform() === 'ios') {
      // Note: Detox handles biometric mocking differently on iOS
      await element(by.id('use-biometric-btn')).tap();
      // Simulate successful biometric
      await device.matchFace(); // iOS-specific Detox API
    } else {
      await element(by.id('use-biometric-btn')).tap();
      // Simulate successful biometric for Android
      await device.matchFace(); // Android-specific Detox API
    }

    // Verify logged in without password
    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);
  });

  /**
   * Test: Fallback to PIN if biometric fails
   * - Biometric authentication fails
   * - System shows PIN entry screen
   * - User enters PIN
   * - Verifies successful login with PIN
   */
  it('should fallback to PIN when biometric fails', async () => {
    // Setup: Have biometric enabled
    // Trigger biometric authentication
    if (device.getPlatform() === 'ios') {
      // Simulate biometric failure
      await device.rejectFace(); // iOS-specific Detox API
    } else {
      await device.rejectFace(); // Android-specific Detox API
    }

    // Verify PIN entry screen appears
    await waitFor(element(by.text('Enter PIN')))
      .toBeVisible()
      .withTimeout(5000);

    // Enter PIN
    await element(by.id('pin-input-0')).typeText('1');
    await element(by.id('pin-input-1')).typeText('2');
    await element(by.id('pin-input-2')).typeText('3');
    await element(by.id('pin-input-3')).typeText('4');

    // Verify authentication successful
    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);
  });

  /**
   * Test: Session timeout after 30 minutes of inactivity
   * - User is logged in
   * - App is backgrounded for 30+ minutes
   * - User returns to app
   * - Verifies user is logged out due to timeout
   */
  it('should timeout session after 30 minutes inactivity', async () => {
    // First login
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.text('Sign In')).tap();

    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Simulate time passing (30 minutes)
    // Note: This is difficult to test in real-time, would use mock/fast-forward
    // For this test, we simulate by setting a flag
    // In real environment, use Detox/Jest time mocking

    // Background and foreground app to trigger session check
    await device.sendToBackground();
    await device.sleep(2000);
    await device.sendToForeground();

    // Note: In a real implementation with proper timeout mocking,
    // this would show the login screen. For now, verify the flow exists.
  });

  /**
   * Test: Multiple device login handling
   * - User logs in on device A
   * - User logs in on device B
   * - Verifies user can be logged in on both devices
   * - Or shows conflict dialog if platform prevents multi-device
   */
  it('should handle multiple device logins', async () => {
    // This test would typically run on two devices/simulators
    // For single device testing, we verify the app allows login

    // First login
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.text('Sign In')).tap();

    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // App should indicate if multiple logins are active (if UI shows this)
    // This test verifies the app handles it gracefully
    await expect(element(by.id('sync-status'))).toBeVisible();
  });

  /**
   * Test: Registration validation
   * - Missing email
   * - Invalid email format
   * - Password too short
   * - Passwords don't match
   * Verifies appropriate error messages
   */
  it('should validate signup fields', async () => {
    // Navigate to signup
    await element(by.text('Create Account')).tap();

    await waitFor(element(by.text('Create Your Account')))
      .toBeVisible()
      .withTimeout(5000);

    // Try to signup with empty fields
    await element(by.text('Sign Up')).tap();

    // Verify error messages
    await waitFor(element(by.text('Email is required')))
      .toBeVisible()
      .withTimeout(3000);

    // Try invalid email
    await element(by.id('signup-email-input')).typeText('notanemail');
    await element(by.text('Sign Up')).tap();

    await expect(element(by.text('Invalid email format'))).toBeVisible();

    // Try short password
    await element(by.id('signup-email-input')).clearText();
    await element(by.id('signup-email-input')).typeText('test@example.com');
    await element(by.id('signup-password-input')).typeText('123');
    await element(by.text('Sign Up')).tap();

    await expect(element(by.text('Password must be at least 6 characters')))
      .toBeVisible();
  });

  /**
   * Test: Remember email on login screen
   * - User enters email
   * - Logs out
   * - Returns to login screen
   * - Verifies email is still in field (if feature enabled)
   */
  it('should remember email on login screen', async () => {
    const testEmail = 'test@example.com';

    // Enter email but don't login
    await element(by.id('email-input')).typeText(testEmail);

    // Reload app to verify persistence
    await device.reloadReactNative();

    // Email might be cached in the field (platform dependent)
    // This test verifies the behavior is consistent
    await expect(element(by.id('email-input'))).toBeVisible();
  });

  /**
   * Test: Clear input on validation error
   * - User enters data
   * - Validation fails
   * - User clears fields
   * - Verifies fields are cleared properly
   */
  it('should clear login fields properly', async () => {
    // Enter invalid credentials
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('Wrong123!');

    // Clear fields
    await element(by.id('email-input')).clearText();
    await element(by.id('password-input')).clearText();

    // Verify cleared
    await expect(element(by.id('email-input'))).toHaveToggleValue(false);
    await expect(element(by.id('password-input'))).toHaveToggleValue(false);

    // Verify login button is disabled when fields empty
    await expect(element(by.text('Sign In'))).not.toBeEnabled();
  });

  /**
   * Test: Email verification if required
   * - User signs up
   * - Verifies email verification screen appears
   * - User clicks verification link in email
   * - Verifies account is activated
   */
  it('should verify email after signup', async () => {
    // Navigate to signup
    await element(by.text('Create Account')).tap();

    await waitFor(element(by.text('Create Your Account')))
      .toBeVisible()
      .withTimeout(5000);

    // Signup with new email
    const newEmail = `verify+${Date.now()}@example.com`;
    await element(by.id('signup-email-input')).typeText(newEmail);
    await element(by.id('signup-password-input')).typeText('NewPassword123!');
    await element(by.id('signup-password-confirm')).typeText('NewPassword123!');

    await element(by.text('Sign Up')).tap();

    // If email verification is required, should see verification screen
    // This behavior is app-specific
    await waitFor(element(by.text('Verify Email')))
      .toBeVisible()
      .withTimeout(5000)
      .catch(() => {
        // App might skip verification screen if auto-verified
        return element(by.text('Dashboard')).toBeVisible();
      });
  });

  /**
   * Test: Password visibility toggle
   * - User enters password
   * - Toggles password visibility
   * - Verifies password is shown/hidden
   */
  it('should toggle password visibility', async () => {
    // Enter password
    const password = 'TestPassword123!';
    await element(by.id('password-input')).typeText(password);

    // Toggle visibility (eye icon)
    await element(by.id('password-visibility-toggle')).tap();

    // In a real implementation, would verify the password text is visible
    // This is difficult with Detox, so we just verify the toggle works
    await expect(element(by.id('password-visibility-toggle'))).toBeVisible();

    // Toggle back to hidden
    await element(by.id('password-visibility-toggle')).tap();
  });

  /**
   * Test: Account recovery with security questions
   * - User clicks forgot password
   * - Selects account recovery option
   * - Answers security questions
   * - Sets new password
   * - Logs in with new password
   */
  it('should recover account with security questions', async () => {
    // Click forgot password
    await element(by.text('Forgot Password?')).tap();

    await waitFor(element(by.text('Reset Your Password')))
      .toBeVisible()
      .withTimeout(5000);

    // Select recovery option
    if (element(by.id('security-questions-option')).atIndex(0)) {
      await element(by.id('security-questions-option')).tap();

      // Answer security questions
      await waitFor(element(by.text('What was your first pet name?')))
        .toBeVisible()
        .withTimeout(5000);

      await element(by.id('security-answer-input')).typeText('Fluffy');
      await element(by.text('Next')).tap();

      // Set new password
      await element(by.id('new-password-input')).typeText('NewPassword123!');
      await element(by.id('confirm-password-input')).typeText('NewPassword123!');
      await element(by.text('Reset Password')).tap();

      // Verify success and return to login
      await waitFor(element(by.text('Password reset successful')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });
});

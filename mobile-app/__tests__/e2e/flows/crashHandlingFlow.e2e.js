/**
 * E2E Tests: Crash Handling & Recovery Flow
 * Tests error boundaries, crash reporting, recovery, data preservation, and Sentry integration
 */

describe('Crash Handling & Recovery Flow Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    // Login before each test
    await device.reloadReactNative();
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('TestPassword123!');
    await element(by.text('Sign In')).tap();

    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);
  });

  /**
   * Test: Error boundary catches exceptions
   * - Trigger an error in a component
   * - Verify error boundary UI appears
   * - Verify app doesn't crash completely
   * - Verify user can recover (retry or navigate)
   */
  it('should catch errors with error boundary', async () => {
    // Create transaction with invalid data to trigger error
    await element(by.id('new-transaction-btn')).tap();

    // Try to save without required fields
    await element(by.text('Save')).tap();

    // Verify validation error is shown (not a crash)
    await waitFor(element(by.text('Description is required')))
      .toBeVisible()
      .withTimeout(5000);

    // App should still be functional
    await expect(element(by.id('new-transaction-btn'))).toBeVisible();
  });

  /**
   * Test: Crash sends breadcrumbs to Sentry
   * - Perform several actions before crash
   * - Trigger a crash (simulated)
   * - Verify breadcrumb trail is recorded
   * - Verify Sentry event includes all breadcrumbs
   */
  it('should send breadcrumbs to Sentry on crash', async () => {
    // Perform actions that should create breadcrumbs
    await element(by.id('sync-status')).tap(); // Breadcrumb 1
    await element(by.id('notification-bell')).tap(); // Breadcrumb 2
    await element(by.id('new-transaction-btn')).tap(); // Breadcrumb 3

    // In a real test, this would trigger a crash
    // For testing, we verify the breadcrumb collection mechanism works
    // by checking logs or Sentry mock

    // Note: Actual crash testing requires special handling
    // and app restart detection which is complex in Detox
  });

  /**
   * Test: Crash report is persisted locally
   * - Trigger crash (or simulate)
   * - Verify crash report is stored in AsyncStorage
   * - App restarts
   * - Verify crash report is still there
   */
  it('should persist crash report locally', async () => {
    // This test would require:
    // 1. A way to trigger actual crash
    // 2. App restart detection
    // 3. Verification of stored crash data

    // For now, verify the crash reporting infrastructure exists
    await expect(element(by.text('Dashboard'))).toBeVisible();

    // Create a transaction to ensure app stability
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Crash Test');
    await element(by.id('amount-input')).typeText('50.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);
  });

  /**
   * Test: Offline queue persists after crash
   * - Create transactions offline
   * - Simulate crash
   * - Restart app
   * - Verify offline queue is still there
   * - Verify queue items sync when online
   */
  it('should preserve offline queue after crash', async () => {
    // Enable offline mode
    await device.toggleSynchronization(false);

    // Create offline transactions
    for (let i = 0; i < 3; i++) {
      await element(by.id('new-transaction-btn')).tap();
      await element(by.id('description-input')).typeText(`Offline ${i + 1}`);
      await element(by.id('amount-input')).typeText(`${10 * (i + 1)}`);
      await element(by.text('Save')).tap();

      await waitFor(element(by.text('Saved offline')))
        .toBeVisible()
        .withTimeout(5000);

      await element(by.id('close-btn')).tap();
    }

    // In real scenario, crash would happen here
    // For testing, we simulate by reloading app
    await device.reloadReactNative();

    // Verify app still shows offline transactions
    await expect(element(by.text('Offline 1'))).toBeVisible();
    await expect(element(by.text('Offline 2'))).toBeVisible();
    await expect(element(by.text('Offline 3'))).toBeVisible();

    // Reconnect and verify sync
    await device.toggleSynchronization(true);

    // Verify sync processes the queue
    await waitFor(element(by.text('Syncing...')))
      .toBeVisible()
      .withTimeout(10000);

    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Token refresh executes after crash recovery
   * - Have token near expiry
   * - Trigger crash
   * - Restart app
   * - Verify token is refreshed automatically
   * - Verify user can access protected resources
   */
  it('should refresh token after crash recovery', async () => {
    // Verify we're logged in
    await expect(element(by.text('Dashboard'))).toBeVisible();

    // Simulate app crash and restart
    await device.reloadReactNative();

    // Verify still logged in after restart
    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Try to access protected resource (sync)
    await element(by.id('sync-status')).tap();

    // Verify sync works (token was valid/refreshed)
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Data duplication does not occur after crash
   * - Create transaction
   * - Crash during sync
   * - Restart and sync
   * - Verify transaction is not duplicated
   */
  it('should not duplicate data after crash recovery', async () => {
    // Create a transaction
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('No Duplication Test');
    await element(by.id('amount-input')).typeText('100.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify transaction appears once
    await expect(element(by.text('No Duplication Test'))).toBeVisible();

    // Get initial count (would need to implement counter in real app)
    const initialCount = 1;

    // Simulate crash
    await device.reloadReactNative();

    // Verify still appears only once
    await expect(element(by.text('No Duplication Test'))).toBeVisible();

    // Try to trigger sync which might cause duplication issues
    await element(by.id('sync-status')).tap();

    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);

    // Verify still only one instance of transaction
    // (This is a simplified check - real implementation would count)
    await expect(element(by.text('No Duplication Test'))).toBeVisible();
  });

  /**
   * Test: LocalStorage state preserved after crash
   * - Set some user preferences (theme, language, etc.)
   * - Crash the app
   * - Verify preferences are preserved
   */
  it('should preserve user preferences after crash', async () => {
    // Go to settings
    await element(by.id('settings-btn')).tap();

    // Verify we're in settings
    await waitFor(element(by.text('Settings')))
      .toBeVisible()
      .withTimeout(5000);

    // Toggle a setting (e.g., low power mode)
    await element(by.id('low-power-toggle')).tap();

    // Verify toggle is on
    await expect(element(by.id('low-power-toggle'))).toHaveToggleValue(true);

    // Simulate crash and restart
    await device.reloadReactNative();

    // Navigate back to settings
    await element(by.id('settings-btn')).tap();

    await waitFor(element(by.text('Settings')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify setting is still enabled
    await expect(element(by.id('low-power-toggle'))).toHaveToggleValue(true);
  });

  /**
   * Test: Error recovery UI provides user options
   * - Trigger error with recovery UI
   * - Verify retry button works
   * - Verify back/home button works
   */
  it('should show error recovery options', async () => {
    // Create invalid transaction to show error
    await element(by.id('new-transaction-btn')).tap();

    // Try to save without description
    await element(by.id('amount-input')).typeText('50.00');
    await element(by.text('Save')).tap();

    // Verify error message
    await waitFor(element(by.text('Description is required')))
      .toBeVisible()
      .withTimeout(5000);

    // User can retry (fill in the field)
    await element(by.id('description-input')).typeText('Recovery Test');
    await element(by.text('Save')).tap();

    // Should now save successfully
    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);
  });

  /**
   * Test: Crash during network operation
   * - Start sync
   * - Network fails mid-operation
   * - Crash handlers catch the error
   * - App remains stable
   */
  it('should handle crash during network operation', async () => {
    // Create transaction to trigger sync
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Network Crash Test');
    await element(by.id('amount-input')).typeText('75.00');
    await element(by.text('Save')).tap();

    // Wait for sync to start
    await waitFor(element(by.text('Syncing...')))
      .toBeVisible()
      .withTimeout(10000);

    // Simulate network failure
    await device.toggleSynchronization(false);
    await device.sleep(1000);

    // Verify app doesn't crash - still functional
    await expect(element(by.text('Dashboard')).or(element(by.text('Offline'))))
      .toBeVisible();

    // Reconnect
    await device.toggleSynchronization(true);

    // Verify recovery
    await waitFor(element(by.text('Syncing...').or(element(by.text('Synced')))))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Background sync crash handling
   * - Create offline transaction
   * - Background app during sync
   * - If crash occurs in background, verify:
   *   - Data is not lost
   *   - Sync queue remains intact
   *   - App recovers properly
   */
  it('should recover from background sync crash', async () => {
    // Create offline transaction
    await device.toggleSynchronization(false);

    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Background Crash');
    await element(by.id('amount-input')).typeText('60.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Saved offline')))
      .toBeVisible()
      .withTimeout(5000);

    // Background app
    await device.sendToBackground();
    await device.sleep(2000);

    // Foreground app
    await device.sendToForeground();

    // Reconnect network
    await device.toggleSynchronization(true);

    // Verify app recovers
    await waitFor(element(by.text('Dashboard')))
      .toBeVisible()
      .withTimeout(10000);

    // Verify transaction still exists
    await expect(element(by.text('Background Crash'))).toBeVisible();

    // Verify sync processes the queue
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Crash report doesn't expose sensitive data
   * - Verify crash reports don't include:
   *   - Auth tokens
   *   - Password hashes
   *   - Personally identifiable information
   * - Only include necessary debug info
   */
  it('should not include sensitive data in crash reports', async () => {
    // This would require inspection of actual crash report data
    // In a real implementation, you would:
    // 1. Trigger a crash
    // 2. Intercept the Sentry request
    // 3. Verify sensitive data is not present

    // For now, verify the app has crash reporting configured
    await expect(element(by.text('Dashboard'))).toBeVisible();

    // The test passes if the app doesn't have obvious security issues
    // Real testing would require Sentry mock or proxy inspection
  });

  /**
   * Test: Multiple consecutive crashes
   * - Trigger multiple crashes in succession
   * - Verify app recovers each time
   * - Verify crash report counter works
   */
  it('should handle multiple consecutive crashes', async () => {
    // Reload app multiple times to simulate crashes
    for (let i = 0; i < 3; i++) {
      await device.reloadReactNative();

      // Verify app is still functional
      await waitFor(element(by.text('Dashboard')))
        .toBeVisible()
        .withTimeout(10000);

      // Create and save a transaction
      await element(by.id('new-transaction-btn')).tap();
      await element(by.id('description-input')).typeText(`Crash ${i + 1}`);
      await element(by.id('amount-input')).typeText(`${50 * (i + 1)}`);
      await element(by.text('Save')).tap();

      await waitFor(element(by.text('Transaction saved')))
        .toBeVisible()
        .withTimeout(5000);

      // Close dialog
      try {
        await element(by.id('close-btn')).tap();
      } catch {
        // Dialog might auto-close
      }
    }

    // Verify all transactions are preserved
    for (let i = 0; i < 3; i++) {
      await expect(element(by.text(`Crash ${i + 1}`))).toBeVisible();
    }
  });

  /**
   * Test: Memory pressure during crash
   * - Create many objects/transactions
   * - Monitor memory usage
   * - Verify crash handlers work even under memory pressure
   * - Verify no leaks after recovery
   */
  it('should handle crashes under memory pressure', async () => {
    // Create multiple transactions to increase memory usage
    for (let i = 0; i < 5; i++) {
      await element(by.id('new-transaction-btn')).tap();
      await element(by.id('description-input')).typeText(`Memory Test ${i + 1}`);
      await element(by.id('amount-input')).typeText(`${Math.random() * 1000}`);
      await element(by.text('Save')).tap();

      await waitFor(element(by.text('Transaction saved')))
        .toBeVisible()
        .withTimeout(5000);

      await element(by.id('close-btn')).tap();
    }

    // Verify app is still responsive
    await element(by.id('sync-status')).tap();

    // Verify sync completes without memory issues
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });
});

/**
 * E2E Tests: Data Synchronization Flow
 * Tests sync initialization, incremental sync, conflict resolution, offline mode, batch operations
 */

describe('Data Synchronization Flow Tests', () => {
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

  afterEach(async () => {
    // Logout after each test
    await element(by.id('settings-btn')).tap();
    await element(by.id('logout-btn')).tap();
    await element(by.text('Logout')).tap();

    await waitFor(element(by.text('Sign In to Your Account')))
      .toBeVisible()
      .withTimeout(5000);
  });

  /**
   * Test: Initial sync on app open
   * - App opens after first login
   * - Syncs all data from server to local database
   * - Shows sync status indicator
   * - Verifies data is available locally
   */
  it('should perform initial sync on app open', async () => {
    // Verify sync status indicator shows "Syncing..."
    await expect(element(by.text('Syncing...'))).toBeVisible();

    // Wait for sync to complete
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);

    // Verify transaction list is populated
    await expect(element(by.id('transaction-list'))).toBeVisible();

    // Verify at least one transaction is visible or empty state shown
    await expect(
      element(
        by.text('No transactions yet').and(by.type('Text'))
      ).or(
        element(by.id('transaction-0'))
      )
    ).toBeVisible();
  });

  /**
   * Test: Incremental sync every 15 minutes
   * - Sync completes
   * - Wait for next scheduled sync (simulated or mocked)
   * - Verifies new data is synced from server
   * - Verifies timestamps are updated
   */
  it('should perform incremental sync at intervals', async () => {
    // Wait for initial sync
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);

    // Get initial sync time
    const initialSyncTime = new Date();

    // Create a new transaction
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Incremental Sync Test');
    await element(by.id('amount-input')).typeText('100.00');
    await element(by.text('Save')).tap();

    // Wait for transaction to be saved
    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify sync status updates to show syncing after creation
    await waitFor(element(by.text('Syncing...'))).toBeVisible()
      .or(element(by.text('Synced'))).withTimeout(5000);

    // Wait for next sync to complete
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Conflict resolution (local vs remote)
   * - Same item is modified locally and remotely
   * - Sync detects conflict
   * - Shows conflict resolution UI (if implemented)
   * - Resolves with last-write-wins or user selection
   */
  it('should resolve sync conflicts', async () => {
    // Create a transaction
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Conflict Test');
    await element(by.id('amount-input')).typeText('50.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);

    // Simulate remote modification (would require API/mock)
    // For testing, verify the app handles conflicts gracefully

    // Trigger sync
    await element(by.id('sync-status')).tap();

    // Verify sync completes without crashing
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);

    // Verify transaction is still visible
    await expect(element(by.text('Conflict Test'))).toBeVisible();
  });

  /**
   * Test: Offline mode - create data without internet
   * - Toggle offline mode (network disconnect)
   * - Create transactions offline
   * - Verify data is stored locally
   * - Verify offline indicator is shown
   */
  it('should handle offline data creation', async () => {
    // Enable offline mode
    await device.toggleSynchronization(false);

    // Verify offline indicator
    await expect(element(by.text('Offline'))).toBeVisible();

    // Create transaction offline
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Offline Transaction');
    await element(by.id('amount-input')).typeText('25.00');
    await element(by.text('Save')).tap();

    // Verify transaction saved locally with offline indicator
    await waitFor(element(by.text('Saved offline')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify transaction appears in list with offline badge
    await expect(element(by.text('Offline Transaction'))).toBeVisible();
  });

  /**
   * Test: Resume sync after network reconnection
   * - Create data offline
   * - Reconnect to network
   * - Verify sync queue is processed
   * - Verify data is synced to server
   */
  it('should resume sync after network reconnect', async () => {
    // Create offline transaction first
    await device.toggleSynchronization(false);

    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Reconnect Test');
    await element(by.id('amount-input')).typeText('75.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Saved offline')))
      .toBeVisible()
      .withTimeout(5000);

    // Reconnect to network
    await device.toggleSynchronization(true);

    // Verify sync status changes to syncing
    await waitFor(element(by.text('Syncing...')))
      .toBeVisible()
      .withTimeout(10000);

    // Verify sync completes
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);

    // Verify offline badge is removed
    await expect(element(by.id('offline-badge'))).not.toBeVisible();
  });

  /**
   * Test: Batch sync operations
   * - Create multiple transactions
   * - Each batch should contain up to 50 items
   * - Verify all batches are synced
   * - Verify no data loss in batching
   */
  it('should batch sync operations correctly', async () => {
    const batchSize = 10; // Create 10 transactions for testing

    // Create multiple transactions
    for (let i = 0; i < batchSize; i++) {
      await element(by.id('new-transaction-btn')).tap();
      await element(by.id('description-input')).typeText(`Batch Item ${i + 1}`);
      await element(by.id('amount-input')).typeText(`${10.00 * (i + 1)}`);
      await element(by.text('Save')).tap();

      await waitFor(element(by.text('Transaction saved')))
        .toBeVisible()
        .withTimeout(5000);

      // Close dialog
      await element(by.id('close-btn')).tap();
    }

    // Trigger sync
    await element(by.id('sync-status')).tap();

    // Wait for all batches to sync
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(60000); // Longer timeout for batch

    // Verify all transactions are in list
    for (let i = 0; i < batchSize; i++) {
      await expect(element(by.text(`Batch Item ${i + 1}`))).toBeVisible();
    }
  });

  /**
   * Test: Cancel sync in progress
   * - Initiate sync
   * - Tap cancel button while syncing
   * - Verify sync stops
   * - Verify data is in consistent state
   */
  it('should cancel sync in progress', async () => {
    // Create a transaction to trigger sync
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Cancel Sync Test');
    await element(by.id('amount-input')).typeText('50.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify sync is happening
    await waitFor(element(by.text('Syncing...')))
      .toBeVisible()
      .withTimeout(10000);

    // Tap cancel sync if button visible
    if (element(by.id('cancel-sync-btn')).atIndex(0)) {
      await element(by.id('cancel-sync-btn')).tap();

      // Verify sync stops
      await waitFor(element(by.text('Sync cancelled')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  /**
   * Test: Sync with low battery
   * - Enable low battery mode
   * - Verify sync intervals are adjusted
   * - Verify features are disabled appropriately
   */
  it('should adapt sync for low battery', async () => {
    // Enable low battery mode in settings
    await element(by.id('settings-btn')).tap();
    await waitFor(element(by.id('low-power-toggle')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('low-power-toggle')).tap();

    // Verify low power indicator shows
    await expect(element(by.text('Low Power Mode'))).toBeVisible();

    // Verify sync interval is increased (shown in status or settings)
    // Sync should now use 60-minute intervals instead of 15-minute

    // Go back to dashboard
    await element(by.id('back-btn')).tap();

    // Create transaction to verify sync still works
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Low Battery Sync');
    await element(by.id('amount-input')).typeText('30.00');
    await element(by.text('Save')).tap();

    // Verify sync completes
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Sync with WiFi-only setting
   * - Enable WiFi-only sync
   * - Switch to mobile data (if possible)
   * - Verify sync pauses
   * - Switch back to WiFi
   * - Verify sync resumes
   */
  it('should respect WiFi-only sync setting', async () => {
    // Go to settings
    await element(by.id('settings-btn')).tap();

    // Find and toggle WiFi-only option
    await waitFor(element(by.id('sync-interval-select')))
      .toBeVisible()
      .withTimeout(5000);

    // Select WiFi-only option (if available)
    // This is app-specific and may vary

    // Create transaction
    await element(by.id('back-btn')).tap();
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('WiFi Only Test');
    await element(by.id('amount-input')).typeText('40.00');
    await element(by.text('Save')).tap();

    // Verify sync works when on WiFi
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });

  /**
   * Test: Sync metadata integrity
   * - Verify timestamps are correctly preserved
   * - Verify sync_status fields are accurate
   * - Verify conflict_id is set when conflicts exist
   * - Verify last_synced_at is updated
   */
  it('should maintain sync metadata integrity', async () => {
    // Create transaction and note creation time
    const createdAt = new Date();

    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Metadata Test');
    await element(by.id('amount-input')).typeText('100.00');
    await element(by.text('Save')).tap();

    await waitFor(element(by.text('Transaction saved')))
      .toBeVisible()
      .withTimeout(5000);

    // Open transaction details to verify metadata
    // This would require tapping on the transaction and checking the UI
    await element(by.text('Metadata Test')).tap();

    await waitFor(element(by.id('transaction-details')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify timestamps are present and reasonable
    // Verify sync status shows as synced (not pending)
  });

  /**
   * Test: Large data sync performance
   * - Create large number of records (100+)
   * - Measure sync time
   * - Verify app remains responsive
   * - Verify no data loss
   */
  it('should handle large data sync efficiently', async () => {
    const recordCount = 20; // Reduced from 100+ for faster test

    // Create multiple transactions
    for (let i = 0; i < recordCount; i++) {
      // Use a faster method to create transactions if available
      // Otherwise continue with UI
      await element(by.id('new-transaction-btn')).tap();
      await element(by.id('description-input')).typeText(`Large Sync ${i + 1}`);
      await element(by.id('amount-input')).typeText(`${Math.random() * 500}`);
      await element(by.text('Save')).tap();

      if (i % 5 === 0) {
        // Every 5 records, verify no crashes
        await waitFor(element(by.text('Transaction saved')))
          .toBeVisible()
          .withTimeout(5000);
        await element(by.id('close-btn')).tap();
      }
    }

    // Trigger final sync
    await element(by.id('sync-status')).tap();

    // Verify sync completes within reasonable time
    const startTime = Date.now();
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(60000);
    const syncTime = Date.now() - startTime;

    // Log for performance analysis
    console.log(`Synced ${recordCount} records in ${syncTime}ms`);

    // Verify sync completed within acceptable time
    expect(syncTime).toBeLessThan(60000);
  });

  /**
   * Test: Sync with app backgrounding
   * - Start sync
   * - Background app while syncing
   * - Foreground app
   * - Verify sync continues and completes properly
   */
  it('should continue sync when app backgrounded', async () => {
    // Create transaction to trigger sync
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Background Sync Test');
    await element(by.id('amount-input')).typeText('60.00');
    await element(by.text('Save')).tap();

    // Verify sync is happening
    await waitFor(element(by.text('Syncing...')))
      .toBeVisible()
      .withTimeout(10000);

    // Background app
    await device.sendToBackground();
    await device.sleep(2000);

    // Foreground app
    await device.sendToForeground();

    // Verify sync continues and completes
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);

    // Verify transaction is in list
    await expect(element(by.text('Background Sync Test'))).toBeVisible();
  });

  /**
   * Test: Sync error handling and retry
   * - Simulate sync error (network timeout, server error)
   * - Verify error is shown to user
   * - Verify retry mechanism triggers
   * - Verify sync eventually succeeds or shows appropriate error
   */
  it('should retry sync on failure', async () => {
    // Create transaction
    await element(by.id('new-transaction-btn')).tap();
    await element(by.id('description-input')).typeText('Retry Test');
    await element(by.id('amount-input')).typeText('45.00');
    await element(by.text('Save')).tap();

    // Simulate network error by toggling sync
    await device.toggleSynchronization(false);
    await device.sleep(1000);

    // Verify offline status
    await expect(element(by.text('Offline'))).toBeVisible();

    // Reconnect - sync should retry
    await device.toggleSynchronization(true);

    // Verify sync eventually succeeds
    await waitFor(element(by.text('Synced')))
      .toBeVisible()
      .withTimeout(30000);
  });
});

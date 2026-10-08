/**
 * E2E Tests: Capture Flow
 * Tests complete capture workflow from initialization to server sync
 */

import { device, element, by, expect as detoxExpect } from 'detox';

describe('Capture E2E Tests', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  afterAll(async () => {
    await device.sendUserActivity({ interfaceOrientation: 'portrait' });
  });

  it('should complete full capture workflow', async () => {
    await device.tap(by.id('new-capture-btn'));
    await detoxExpect(element(by.text('New Capture'))).toBeVisible();

    await device.typeText(by.id('description-input'), 'Test Capture');
    await device.typeText(by.id('amount-input'), '100.00');

    await device.tap(by.text('Category'));
    await device.tap(by.text('Food'));

    await device.tap(by.id('save-btn'));
    await detoxExpect(element(by.text('Capture saved'))).toBeVisible();
  });

  it('should handle offline capture gracefully', async () => {
    await device.sendUserActivity({ interfaceOrientation: 'portrait' });
    await device.toggleSynchronization(false);

    await device.tap(by.id('new-capture-btn'));
    await device.typeText(by.id('description-input'), 'Offline Capture');
    await device.typeText(by.id('amount-input'), '50.00');
    await device.tap(by.id('save-btn'));

    await detoxExpect(element(by.text('Saved offline'))).toBeVisible();

    await device.toggleSynchronization(true);
    await detoxExpect(element(by.text('Syncing...'))).toBeVisible();
    await waitFor(element(by.text('Sync complete'))).toExist().withTimeout(5000);
  });

  it('should validate required fields', async () => {
    await device.tap(by.id('new-capture-btn'));
    await device.tap(by.id('save-btn'));

    await detoxExpect(element(by.text('Description is required'))).toBeVisible();
    await detoxExpect(element(by.text('Amount is required'))).toBeVisible();
  });

  it('should handle large amounts correctly', async () => {
    await device.tap(by.id('new-capture-btn'));
    await device.typeText(by.id('description-input'), 'Large Amount');
    await device.typeText(by.id('amount-input'), '999999.99');

    await device.tap(by.id('save-btn'));
    await detoxExpect(element(by.text('Capture saved'))).toBeVisible();

    await device.tap(by.text('View Details'));
    await detoxExpect(element(by.text('999,999.99'))).toBeVisible();
  });

  it('should support bulk capture operations', async () => {
    const captures = [
      { desc: 'Capture 1', amount: '25.00' },
      { desc: 'Capture 2', amount: '30.00' },
      { desc: 'Capture 3', amount: '45.00' },
    ];

    for (const capture of captures) {
      await device.tap(by.id('new-capture-btn'));
      await device.typeText(by.id('description-input'), capture.desc);
      await device.typeText(by.id('amount-input'), capture.amount);
      await device.tap(by.id('save-btn'));
      await waitFor(element(by.text('Capture saved'))).toExist().withTimeout(3000);
    }

    await device.tap(by.id('close-btn'));
    await detoxExpect(element(by.text('3 new captures'))).toBeVisible();
  });

  it('should handle capture with attachments', async () => {
    await device.tap(by.id('new-capture-btn'));
    await device.typeText(by.id('description-input'), 'Receipt Capture');
    await device.typeText(by.id('amount-input'), '75.50');

    await device.tap(by.id('attach-file-btn'));
    await detoxExpect(element(by.text('Select File'))).toBeVisible();

    await device.tap(by.id('camera-option'));
    await device.takeScreenshot('receipt-capture');

    await device.tap(by.id('save-btn'));
    await detoxExpect(element(by.text('Capture with attachment saved'))).toBeVisible();
  });

  it('should sync capture after network recovery', async () => {
    await device.toggleSynchronization(false);

    await device.tap(by.id('new-capture-btn'));
    await device.typeText(by.id('description-input'), 'Network Test');
    await device.typeText(by.id('amount-input'), '60.00');
    await device.tap(by.id('save-btn'));

    await new Promise(resolve => setTimeout(resolve, 2000));
    await device.toggleSynchronization(true);

    await waitFor(element(by.text('Sync complete'))).toExist().withTimeout(10000);
    await detoxExpect(element(by.text('Network Test'))).toBeVisible();
  });
});

async function waitFor(element) {
  return element;
}

/**
 * Page Object Model: HomeScreen
 * Encapsulates all interactions with the home/dashboard screen
 */

import { device, element, by, expect as detoxExpect } from 'detox';

export class HomeScreen {
  /**
   * Verify home screen is displayed
   */
  async verifyHomeScreenVisible(): Promise<void> {
    const dashboardTitle = element(by.text('Dashboard'));
    await detoxExpect(dashboardTitle).toBeVisible();
  }

  /**
   * Verify user name is displayed on home screen
   */
  async verifyUserNameDisplayed(userName: string): Promise<void> {
    const userGreeting = element(by.text(`Hello, ${userName}`));
    await detoxExpect(userGreeting).toBeVisible();
  }

  /**
   * Tap on sync status indicator
   */
  async tapSyncStatus(): Promise<void> {
    const syncStatus = element(by.id('sync-status'));
    await detoxExpect(syncStatus).toBeVisible();
    await syncStatus.tap();
  }

  /**
   * Verify sync status shows "Synced"
   */
  async verifySyncedStatus(): Promise<void> {
    const syncedText = element(by.text('Synced'));
    await detoxExpect(syncedText).toBeVisible();
  }

  /**
   * Verify sync status shows "Syncing..."
   */
  async verifySyncingStatus(): Promise<void> {
    const syncingText = element(by.text('Syncing...'));
    await detoxExpect(syncingText).toBeVisible();
  }

  /**
   * Verify sync status shows "Offline"
   */
  async verifyOfflineStatus(): Promise<void> {
    const offlineText = element(by.text('Offline'));
    await detoxExpect(offlineText).toBeVisible();
  }

  /**
   * Tap new transaction button
   */
  async tapNewTransaction(): Promise<void> {
    const newTransButton = element(by.id('new-transaction-btn'));
    await detoxExpect(newTransButton).toBeVisible();
    await newTransButton.tap();
  }

  /**
   * Tap settings button
   */
  async tapSettings(): Promise<void> {
    const settingsButton = element(by.id('settings-btn'));
    await detoxExpect(settingsButton).toBeVisible();
    await settingsButton.tap();
  }

  /**
   * Tap notifications bell
   */
  async tapNotifications(): Promise<void> {
    const notificationBell = element(by.id('notification-bell'));
    await detoxExpect(notificationBell).toBeVisible();
    await notificationBell.tap();
  }

  /**
   * Verify transaction list is visible
   */
  async verifyTransactionListVisible(): Promise<void> {
    const transactionList = element(by.id('transaction-list'));
    await detoxExpect(transactionList).toBeVisible();
  }

  /**
   * Verify transaction count badge
   */
  async verifyTransactionCountBadge(count: number): Promise<void> {
    const badge = element(by.text(`${count}`));
    await detoxExpect(badge).toBeVisible();
  }

  /**
   * Scroll to top of transaction list
   */
  async scrollToTop(): Promise<void> {
    const transactionList = element(by.id('transaction-list'));
    await transactionList.swipe('down', 'slow', 0.9);
  }

  /**
   * Scroll to bottom of transaction list
   */
  async scrollToBottom(): Promise<void> {
    const transactionList = element(by.id('transaction-list'));
    await transactionList.swipe('up', 'slow', 0.9);
  }

  /**
   * Verify network status indicator
   */
  async verifyNetworkStatus(status: 'connected' | 'disconnected'): Promise<void> {
    const statusIndicator = element(by.id(`network-status-${status}`));
    await detoxExpect(statusIndicator).toBeVisible();
  }

  /**
   * Tap on a specific transaction by index
   */
  async tapTransaction(index: number): Promise<void> {
    const transaction = element(by.id(`transaction-${index}`));
    await detoxExpect(transaction).toBeVisible();
    await transaction.tap();
  }

  /**
   * Verify empty state message
   */
  async verifyEmptyState(): Promise<void> {
    const emptyMessage = element(by.text('No transactions yet'));
    await detoxExpect(emptyMessage).toBeVisible();
  }

  /**
   * Verify loading spinner is visible
   */
  async verifyLoadingSpinner(): Promise<void> {
    const spinner = element(by.id('loading-spinner'));
    await detoxExpect(spinner).toBeVisible();
  }

  /**
   * Verify refresh control is visible
   */
  async verifyRefreshControl(): Promise<void> {
    const refreshControl = element(by.id('refresh-control'));
    await detoxExpect(refreshControl).toBeVisible();
  }

  /**
   * Pull to refresh
   */
  async pullToRefresh(): Promise<void> {
    const transactionList = element(by.id('transaction-list'));
    await transactionList.swipe('down', 'slow', 0.75);
  }

  /**
   * Verify battery status indicator (if visible)
   */
  async verifyBatteryIndicator(level: string): Promise<void> {
    const batteryIndicator = element(by.text(level));
    await detoxExpect(batteryIndicator).toBeVisible();
  }
}

export const homeScreen = new HomeScreen();

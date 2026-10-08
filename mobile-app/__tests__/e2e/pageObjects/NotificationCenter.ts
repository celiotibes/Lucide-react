/**
 * Page Object Model: NotificationCenter
 * Encapsulates all interactions with the notification center screen
 */

import { device, element, by, expect as detoxExpect } from 'detox';

export class NotificationCenter {
  /**
   * Verify notification center is visible
   */
  async verifyNotificationCenterVisible(): Promise<void> {
    const centerTitle = element(by.text('Notifications'));
    await detoxExpect(centerTitle).toBeVisible();
  }

  /**
   * Verify notification badge count
   */
  async verifyNotificationBadgeCount(count: number): Promise<void> {
    const badge = element(by.id('notification-badge'));
    await detoxExpect(badge).toHaveText(String(count));
  }

  /**
   * Tap a notification by index
   */
  async tapNotification(index: number): Promise<void> {
    const notification = element(by.id(`notification-${index}`));
    await detoxExpect(notification).toBeVisible();
    await notification.tap();
  }

  /**
   * Mark notification as read
   */
  async markAsRead(index: number): Promise<void> {
    const notification = element(by.id(`notification-${index}`));
    await notification.multiTap();
  }

  /**
   * Delete notification
   */
  async deleteNotification(index: number): Promise<void> {
    const notification = element(by.id(`notification-${index}`));
    await notification.swipe('left', 'fast', 0.9);
    const deleteButton = element(by.text('Delete'));
    await deleteButton.tap();
  }

  /**
   * Verify notification text
   */
  async verifyNotificationText(text: string): Promise<void> {
    const notificationText = element(by.text(text));
    await detoxExpect(notificationText).toBeVisible();
  }

  /**
   * Filter notifications by type
   */
  async filterNotificationsByType(type: string): Promise<void> {
    const filterButton = element(by.id('filter-btn'));
    await filterButton.tap();

    const typeFilter = element(by.text(type));
    await detoxExpect(typeFilter).toBeVisible();
    await typeFilter.tap();
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    const clearAllButton = element(by.id('clear-all-btn'));
    await detoxExpect(clearAllButton).toBeVisible();
    await clearAllButton.tap();

    const confirmButton = element(by.text('Confirm'));
    await confirmButton.tap();
  }

  /**
   * Verify empty notification state
   */
  async verifyEmptyNotificationState(): Promise<void> {
    const emptyMessage = element(by.text('No notifications'));
    await detoxExpect(emptyMessage).toBeVisible();
  }

  /**
   * Verify notification list is visible
   */
  async verifyNotificationListVisible(): Promise<void> {
    const notificationList = element(by.id('notification-list'));
    await detoxExpect(notificationList).toBeVisible();
  }

  /**
   * Scroll to bottom to load more
   */
  async scrollToLoadMore(): Promise<void> {
    const notificationList = element(by.id('notification-list'));
    await notificationList.swipe('up', 'slow', 0.9);
  }

  /**
   * Verify read/unread status
   */
  async verifyNotificationReadStatus(index: number, isRead: boolean): Promise<void> {
    const notification = element(by.id(`notification-${index}`));
    const status = isRead ? 'read' : 'unread';
    await detoxExpect(notification).toHaveAttr('data-read', status);
  }

  /**
   * Tap on notification type tab
   */
  async tapNotificationTypeTab(type: string): Promise<void> {
    const tab = element(by.id(`notification-type-${type}`));
    await detoxExpect(tab).toBeVisible();
    await tab.tap();
  }

  /**
   * Verify notification timestamp
   */
  async verifyNotificationTimestamp(index: number): Promise<void> {
    const timestamp = element(by.id(`notification-timestamp-${index}`));
    await detoxExpect(timestamp).toBeVisible();
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(): Promise<void> {
    const markAllButton = element(by.id('mark-all-read-btn'));
    await detoxExpect(markAllButton).toBeVisible();
    await markAllButton.tap();
  }

  /**
   * Verify pagination controls
   */
  async verifyPaginationControls(): Promise<void> {
    const nextButton = element(by.id('pagination-next'));
    await detoxExpect(nextButton).toBeVisible();
  }

  /**
   * Go to next page
   */
  async goToNextPage(): Promise<void> {
    const nextButton = element(by.id('pagination-next'));
    await nextButton.tap();
  }

  /**
   * Go to previous page
   */
  async goToPreviousPage(): Promise<void> {
    const prevButton = element(by.id('pagination-prev'));
    await prevButton.tap();
  }
}

export const notificationCenter = new NotificationCenter();

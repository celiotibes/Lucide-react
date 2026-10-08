/**
 * Page Object Model: SettingsScreen
 * Encapsulates all interactions with the settings screen
 */

import { device, element, by, expect as detoxExpect } from 'detox';

export class SettingsScreen {
  /**
   * Verify settings screen is visible
   */
  async verifySettingsScreenVisible(): Promise<void> {
    const settingsTitle = element(by.text('Settings'));
    await detoxExpect(settingsTitle).toBeVisible();
  }

  /**
   * Tap logout button
   */
  async tapLogout(): Promise<void> {
    const logoutButton = element(by.id('logout-btn'));
    await detoxExpect(logoutButton).toBeVisible();
    await logoutButton.tap();
  }

  /**
   * Confirm logout
   */
  async confirmLogout(): Promise<void> {
    const confirmButton = element(by.text('Logout'));
    await detoxExpect(confirmButton).toBeVisible();
    await confirmButton.tap();
  }

  /**
   * Toggle biometric authentication
   */
  async toggleBiometricAuth(): Promise<void> {
    const biometricToggle = element(by.id('biometric-toggle'));
    await detoxExpect(biometricToggle).toBeVisible();
    await biometricToggle.multiTap();
  }

  /**
   * Verify biometric setting is enabled
   */
  async verifyBiometricEnabled(): Promise<void> {
    const biometricToggle = element(by.id('biometric-toggle'));
    await detoxExpect(biometricToggle).toHaveToggleValue(true);
  }

  /**
   * Verify biometric setting is disabled
   */
  async verifyBiometricDisabled(): Promise<void> {
    const biometricToggle = element(by.id('biometric-toggle'));
    await detoxExpect(biometricToggle).toHaveToggleValue(false);
  }

  /**
   * Toggle low power mode
   */
  async toggleLowPowerMode(): Promise<void> {
    const lowPowerToggle = element(by.id('low-power-toggle'));
    await detoxExpect(lowPowerToggle).toBeVisible();
    await lowPowerToggle.multiTap();
  }

  /**
   * Verify low power mode is enabled
   */
  async verifyLowPowerModeEnabled(): Promise<void> {
    const lowPowerToggle = element(by.id('low-power-toggle'));
    await detoxExpect(lowPowerToggle).toHaveToggleValue(true);
  }

  /**
   * Toggle offline mode
   */
  async toggleOfflineMode(): Promise<void> {
    const offlineModeToggle = element(by.id('offline-mode-toggle'));
    await detoxExpect(offlineModeToggle).toBeVisible();
    await offlineModeToggle.multiTap();
  }

  /**
   * Verify offline mode is enabled
   */
  async verifyOfflineModeEnabled(): Promise<void> {
    const offlineModeToggle = element(by.id('offline-mode-toggle'));
    await detoxExpect(offlineModeToggle).toHaveToggleValue(true);
  }

  /**
   * Change sync interval
   */
  async changeSyncInterval(interval: string): Promise<void> {
    const syncIntervalSelect = element(by.id('sync-interval-select'));
    await detoxExpect(syncIntervalSelect).toBeVisible();
    await syncIntervalSelect.tap();

    const intervalOption = element(by.text(interval));
    await intervalOption.tap();
  }

  /**
   * Scroll to bottom of settings
   */
  async scrollToBottom(): Promise<void> {
    const settingsList = element(by.id('settings-list'));
    await settingsList.swipe('up', 'slow', 0.9);
  }

  /**
   * Verify app version
   */
  async verifyAppVersion(version: string): Promise<void> {
    const versionText = element(by.text(`Version ${version}`));
    await detoxExpect(versionText).toBeVisible();
  }

  /**
   * Tap clear cache button
   */
  async tapClearCache(): Promise<void> {
    const clearCacheButton = element(by.id('clear-cache-btn'));
    await detoxExpect(clearCacheButton).toBeVisible();
    await clearCacheButton.tap();
  }

  /**
   * Confirm clear cache
   */
  async confirmClearCache(): Promise<void> {
    const confirmButton = element(by.text('Clear'));
    await detoxExpect(confirmButton).toBeVisible();
    await confirmButton.tap();
  }

  /**
   * Verify cache cleared message
   */
  async verifyCacheClearedMessage(): Promise<void> {
    const message = element(by.text('Cache cleared'));
    await detoxExpect(message).toBeVisible();
  }

  /**
   * Toggle notification permissions
   */
  async toggleNotificationPermissions(): Promise<void> {
    const notificationsToggle = element(by.id('notifications-toggle'));
    await detoxExpect(notificationsToggle).toBeVisible();
    await notificationsToggle.multiTap();
  }

  /**
   * Verify notification permissions enabled
   */
  async verifyNotificationPermissionsEnabled(): Promise<void> {
    const notificationsToggle = element(by.id('notifications-toggle'));
    await detoxExpect(notificationsToggle).toHaveToggleValue(true);
  }

  /**
   * Go back to previous screen
   */
  async goBack(): Promise<void> {
    const backButton = element(by.id('back-btn'));
    await detoxExpect(backButton).toBeVisible();
    await backButton.tap();
  }

  /**
   * Verify user email is displayed
   */
  async verifyUserEmail(email: string): Promise<void> {
    const emailText = element(by.text(email));
    await detoxExpect(emailText).toBeVisible();
  }

  /**
   * Tap about section
   */
  async tapAbout(): Promise<void> {
    const aboutButton = element(by.id('about-btn'));
    await detoxExpect(aboutButton).toBeVisible();
    await aboutButton.tap();
  }
}

export const settingsScreen = new SettingsScreen();

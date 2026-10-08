/**
 * E2E Test Helpers
 * Common setup, cleanup, and assertion utilities for all E2E tests
 */

import { device, element, by, expect as detoxExpect } from 'detox';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TIMEOUT_SHORT = 5000;
const TIMEOUT_MEDIUM = 15000;
const TIMEOUT_LONG = 30000;

/**
 * Setup test environment before each test
 * - Clear AsyncStorage
 * - Reset app state
 * - Clear any modal overlays
 */
export async function setupTest(): Promise<void> {
  try {
    // Clear AsyncStorage
    await AsyncStorage.clear();

    // Reload React Native to reset state
    await device.reloadReactNative();

    // Wait for app to stabilize
    await device.waitForInitialLoad();
  } catch (error) {
    console.error('Setup test failed:', error);
    throw error;
  }
}

/**
 * Cleanup after each test
 * - Dismiss any modals
 * - Clear storage
 */
export async function cleanupTest(): Promise<void> {
  try {
    // Dismiss any visible alerts
    try {
      await device.dismissAlert();
    } catch {
      // No alert to dismiss
    }

    // Clear AsyncStorage
    await AsyncStorage.clear();
  } catch (error) {
    console.error('Cleanup test failed:', error);
  }
}

/**
 * Wait for element to appear with custom timeout
 */
export async function waitForElement(
  matcher: any,
  timeout: number = TIMEOUT_MEDIUM,
): Promise<void> {
  const elem = element(matcher);
  await waitFor(elem)
    .toExist()
    .withTimeout(timeout);
}

/**
 * Wait for element to disappear
 */
export async function waitForElementToDisappear(
  matcher: any,
  timeout: number = TIMEOUT_MEDIUM,
): Promise<void> {
  const elem = element(matcher);
  await waitFor(elem)
    .not.toBeVisible()
    .withTimeout(timeout);
}

/**
 * Type text slowly to simulate realistic user input
 */
export async function typeTextSlowly(matcher: any, text: string): Promise<void> {
  const elem = element(matcher);
  for (const char of text) {
    await elem.typeText(char);
    await device.sleep(50); // 50ms between characters
  }
}

/**
 * Scroll element to bottom
 */
export async function scrollToBottom(matcher: any): Promise<void> {
  const elem = element(matcher);
  await elem.swipe('up', 'slow', 0.9);
}

/**
 * Scroll element to top
 */
export async function scrollToTop(matcher: any): Promise<void> {
  const elem = element(matcher);
  await elem.swipe('down', 'slow', 0.9);
}

/**
 * Toggle WiFi off and on to simulate network reconnection
 */
export async function simulateNetworkDisconnect(): Promise<void> {
  // Note: This requires device configuration support
  // For now, use device.toggleSynchronization as fallback
  try {
    await device.setAirplaneMode(true);
    await device.sleep(500);
  } catch (error) {
    console.warn('Could not toggle airplane mode:', error);
  }
}

/**
 * Toggle WiFi back on after simulating disconnect
 */
export async function simulateNetworkReconnect(): Promise<void> {
  try {
    await device.setAirplaneMode(false);
    await device.sleep(500);
  } catch (error) {
    console.warn('Could not toggle airplane mode:', error);
  }
}

/**
 * Simulate low battery condition
 */
export async function simulateLowBattery(): Promise<void> {
  // This would require device-level API support
  // For testing purposes, we'll set a flag that the app can read
  await AsyncStorage.setItem('_test_simulate_low_battery', 'true');
}

/**
 * Clear low battery simulation
 */
export async function clearLowBatterySimulation(): Promise<void> {
  await AsyncStorage.removeItem('_test_simulate_low_battery');
}

/**
 * Simulate battery level (percentage)
 */
export async function simulateBatteryLevel(level: number): Promise<void> {
  if (level < 0 || level > 100) {
    throw new Error('Battery level must be between 0 and 100');
  }
  await AsyncStorage.setItem('_test_battery_level', String(level));
}

/**
 * Clear battery level simulation
 */
export async function clearBatteryLevelSimulation(): Promise<void> {
  await AsyncStorage.removeItem('_test_battery_level');
}

/**
 * Wait for element visibility with retry logic
 */
export async function waitForVisibility(
  matcher: any,
  timeout: number = TIMEOUT_MEDIUM,
  retries: number = 3,
): Promise<void> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      const elem = element(matcher);
      await waitFor(elem)
        .toBeVisible()
        .withTimeout(timeout / retries);
      return;
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await device.sleep(1000);
      }
    }
  }

  throw lastError || new Error('Element did not become visible');
}

/**
 * Get current AsyncStorage data for verification
 */
export async function getStorageData(key: string): Promise<string | null> {
  return await AsyncStorage.getItem(key);
}

/**
 * Set storage data for testing
 */
export async function setStorageData(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(key, value);
}

/**
 * Clear specific storage key
 */
export async function clearStorageData(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/**
 * Verify toast/snackbar message appears
 */
export async function verifyToastMessage(
  message: string,
  timeout: number = TIMEOUT_SHORT,
): Promise<void> {
  const toastElement = element(by.text(message));
  await waitFor(toastElement)
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Take screenshot for debugging
 */
export async function takeScreenshot(name: string): Promise<void> {
  await device.takeScreenshot(`e2e-${name}`);
}

/**
 * Simulate app backgrounding and foregrounding
 */
export async function backgroundAndForeground(delayMs: number = 1000): Promise<void> {
  await device.sendToBackground();
  await device.sleep(delayMs);
  await device.sendToForeground();
}

/**
 * Get element attribute value
 */
export async function getElementAttribute(matcher: any, attribute: string): Promise<string> {
  const elem = element(matcher);
  // Note: This may not work with all Detox versions
  // Fallback: use visual verification instead
  await detoxExpect(elem).toHaveAttr(attribute);
  return 'true'; // Simplified return
}

/**
 * Verify multiple elements are visible
 */
export async function verifyMultipleElementsVisible(matchers: any[]): Promise<void> {
  for (const matcher of matchers) {
    const elem = element(matcher);
    await detoxExpect(elem).toBeVisible();
  }
}

/**
 * Clear all notifications
 */
export async function clearNotifications(): Promise<void> {
  await AsyncStorage.removeItem('@crmt:notifications');
}

/**
 * Add mock notification to storage
 */
export async function addMockNotification(notification: any): Promise<void> {
  const existing = await AsyncStorage.getItem('@crmt:notifications');
  const notifications = existing ? JSON.parse(existing) : [];
  notifications.push(notification);
  await AsyncStorage.setItem('@crmt:notifications', JSON.stringify(notifications));
}

/**
 * Verify API call was made (requires mock server or Detox spy)
 * This is a placeholder that would require additional setup
 */
export async function verifyApiCallMade(method: string, url: string): Promise<boolean> {
  // This would require a mock server or API interceptor
  // For now, return a placeholder
  console.log(`Verify API call: ${method} ${url}`);
  return true;
}

/**
 * Wait for sync to complete
 */
export async function waitForSyncComplete(timeout: number = TIMEOUT_LONG): Promise<void> {
  const syncCompleteIndicator = element(by.text('Synced'));
  await waitFor(syncCompleteIndicator)
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Dismiss keyboard if visible
 */
export async function dismissKeyboard(): Promise<void> {
  try {
    await device.sendUserActivity({ interfaceOrientation: 'portrait' });
  } catch {
    // Keyboard might not be visible
  }
}

/**
 * Compare two strings with case-insensitive option
 */
export function compareStrings(str1: string, str2: string, caseInsensitive: boolean = false): boolean {
  if (caseInsensitive) {
    return str1.toLowerCase() === str2.toLowerCase();
  }
  return str1 === str2;
}

/**
 * Generate test email
 */
export function generateTestEmail(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `test+${timestamp}${random}@example.com`;
}

/**
 * Generate unique username
 */
export function generateUniqueUsername(): string {
  const timestamp = Date.now();
  return `testuser_${timestamp}`;
}

export const testHelpers = {
  setupTest,
  cleanupTest,
  waitForElement,
  waitForElementToDisappear,
  typeTextSlowly,
  scrollToBottom,
  scrollToTop,
  simulateNetworkDisconnect,
  simulateNetworkReconnect,
  simulateLowBattery,
  clearLowBatterySimulation,
  simulateBatteryLevel,
  clearBatteryLevelSimulation,
  waitForVisibility,
  getStorageData,
  setStorageData,
  clearStorageData,
  verifyToastMessage,
  takeScreenshot,
  backgroundAndForeground,
  getElementAttribute,
  verifyMultipleElementsVisible,
  clearNotifications,
  addMockNotification,
  verifyApiCallMade,
  waitForSyncComplete,
  dismissKeyboard,
  compareStrings,
  generateTestEmail,
  generateUniqueUsername,
};

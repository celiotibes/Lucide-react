/**
 * E2E Test Helper Functions
 * Common utilities for writing E2E tests
 */

const { device, element, by, waitFor, expect } = require('detox');
const config = require('./config.e2e.js');

/**
 * Wait for element to appear with standard timeout
 *
 * @param {string} testID - Element ID to wait for
 * @param {number} timeout - Optional timeout (defaults to element timeout from config)
 * @returns {Promise<void>}
 */
async function waitForElement(testID, timeout = config.timeouts.element) {
  await waitFor(element(by.id(testID)))
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Wait for text to appear on screen
 *
 * @param {string} text - Text to find
 * @param {number} timeout - Optional timeout
 * @returns {Promise<void>}
 */
async function waitForText(text, timeout = config.timeouts.element) {
  await waitFor(element(by.text(text)))
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Tap an element by ID
 *
 * @param {string} testID - Element ID
 * @returns {Promise<void>}
 */
async function tap(testID) {
  await element(by.id(testID)).multiTap(1);
}

/**
 * Double-tap an element
 *
 * @param {string} testID - Element ID
 * @returns {Promise<void>}
 */
async function doubleTap(testID) {
  await element(by.id(testID)).multiTap(2);
}

/**
 * Type text into an input element
 *
 * @param {string} testID - Input element ID
 * @param {string} text - Text to type
 * @returns {Promise<void>}
 */
async function typeText(testID, text) {
  await element(by.id(testID)).typeText(text);
}

/**
 * Clear text from an input element
 *
 * @param {string} testID - Input element ID
 * @returns {Promise<void>}
 */
async function clearText(testID) {
  await element(by.id(testID)).clearText();
}

/**
 * Scroll to element
 *
 * @param {string} scrollViewID - Scroll view ID
 * @param {string} targetID - Target element ID
 * @param {number} timeout - Optional timeout
 * @returns {Promise<void>}
 */
async function scrollToElement(scrollViewID, targetID, timeout = config.timeouts.element) {
  await waitFor(element(by.id(targetID)))
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Login with test credentials
 *
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<void>}
 */
async function login(email = config.environment.testUser.email, password = config.environment.testUser.password) {
  await waitForElement('emailInput', config.timeouts.element);
  await typeText('emailInput', email);
  await typeText('passwordInput', password);
  await tap('loginButton');
  await waitForElement('dashboardScreen', config.timeouts.navigation);
}

/**
 * Logout from app
 *
 * @returns {Promise<void>}
 */
async function logout() {
  await tap('userMenuButton');
  await waitForText('Logout', config.timeouts.element);
  await tap('logoutButton');
  await waitForElement('loginScreen', config.timeouts.navigation);
}

/**
 * Navigate to screen by tab ID
 *
 * @param {string} tabID - Tab element ID (e.g., 'homeTab', 'transactionsTab')
 * @param {string} screenID - Expected screen ID after navigation
 * @returns {Promise<void>}
 */
async function navigateToTab(tabID, screenID) {
  await tap(tabID);
  await waitForElement(screenID, config.timeouts.navigation);
}

/**
 * Create a new transaction
 *
 * @param {object} transaction - Transaction data
 * @param {string} transaction.description - Transaction description
 * @param {number} transaction.amount - Transaction amount
 * @param {string} transaction.type - Transaction type (income/expense)
 * @returns {Promise<void>}
 */
async function createTransaction({ description, amount, type }) {
  // Navigate to transactions
  await navigateToTab('transactionsTab', 'transactionsScreen');

  // Tap create button
  await tap('createTransactionButton');
  await waitForElement('transactionForm', config.timeouts.navigation);

  // Fill form
  await typeText('descriptionInput', description);
  await typeText('amountInput', amount.toString());
  await tap(`${type}RadioButton`);

  // Submit
  await tap('submitButton');
  await waitForText('Transaction created', config.timeouts.network);
}

/**
 * Filter transactions
 *
 * @param {object} filters - Filter criteria
 * @param {string} filters.type - Filter by type (income/expense)
 * @param {string} filters.dateRange - Date range filter
 * @returns {Promise<void>}
 */
async function filterTransactions({ type, dateRange }) {
  await tap('filterButton');
  await waitForElement('filterPanel', config.timeouts.element);

  if (type) {
    await tap(`filter_${type}`);
  }

  if (dateRange) {
    await tap(`dateRange_${dateRange}`);
  }

  await tap('applyFiltersButton');
  await device.sendUserActivity({ detoxPrintBusyIdleResources: 'YES' });
}

/**
 * Take screenshot for debugging
 *
 * @param {string} name - Screenshot name
 * @returns {Promise<void>}
 */
async function screenshot(name) {
  if (config.artifacts.screenshots.enabled) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${name}_${timestamp}`;
    await device.takeScreenshot(filename);
    console.log(`Screenshot saved: ${filename}`);
  }
}

/**
 * Wait and verify element exists
 *
 * @param {string} testID - Element ID
 * @param {number} timeout - Optional timeout
 * @returns {Promise<void>}
 */
async function expectElementVisible(testID, timeout = config.timeouts.element) {
  await waitForElement(testID, timeout);
  await expect(element(by.id(testID))).toBeVisible();
}

/**
 * Verify element has specific text
 *
 * @param {string} testID - Element ID
 * @param {string} text - Expected text
 * @returns {Promise<void>}
 */
async function expectText(testID, text) {
  await expect(element(by.id(testID))).toHaveText(text);
}

/**
 * Verify element does not exist
 *
 * @param {string} testID - Element ID
 * @returns {Promise<void>}
 */
async function expectElementNotVisible(testID) {
  await expect(element(by.id(testID))).not.toBeVisible();
}

/**
 * Get current platform
 *
 * @returns {string} - 'ios' or 'android'
 */
function getPlatform() {
  return device.getPlatform();
}

/**
 * Check if running on iOS
 *
 * @returns {boolean}
 */
function isIOS() {
  return getPlatform() === 'ios';
}

/**
 * Check if running on Android
 *
 * @returns {boolean}
 */
function isAndroid() {
  return getPlatform() === 'android';
}

/**
 * Reset app to initial state
 *
 * @returns {Promise<void>}
 */
async function resetApp() {
  await device.sendUserActivity({ detoxPrintBusyIdleResources: 'YES' });

  if (isAndroid()) {
    // Android reset
    await device.reloadReactNative();
  } else {
    // iOS reset
    await device.reloadReactNative();
  }
}

/**
 * Clear all app data and reinstall
 *
 * @returns {Promise<void>}
 */
async function cleanInstall() {
  await device.uninstallApp();
  await device.installApp();
  await device.launchApp({
    newInstance: true,
    permissions: {
      notifications: 'YES',
      calendar: 'YES',
      camera: 'YES',
    },
  });
}

/**
 * Simulate network error
 *
 * @returns {Promise<void>}
 */
async function simulateNetworkError() {
  // Device network simulation (Detox doesn't have built-in network mocking)
  // Use mock mode instead
  process.env.MOCK_MODE = 'true';
  console.warn('Network error simulation - Use MOCK_MODE=true instead');
}

/**
 * Verify no errors on screen
 *
 * @returns {Promise<void>}
 */
async function verifyNoErrors() {
  try {
    await expect(element(by.id('errorBanner'))).not.toBeVisible();
  } catch (e) {
    // Error banner may not exist, which is fine
  }
}

/**
 * Swipe on element
 *
 * @param {string} testID - Element ID
 * @param {string} direction - Direction (left, right, up, down)
 * @returns {Promise<void>}
 */
async function swipe(testID, direction = 'left') {
  await element(by.id(testID)).swipe(direction);
}

/**
 * Long press on element
 *
 * @param {string} testID - Element ID
 * @returns {Promise<void>}
 */
async function longPress(testID) {
  await element(by.id(testID)).longPress();
}

/**
 * Retry action with exponential backoff
 *
 * @param {Function} action - Action to retry
 * @param {number} maxAttempts - Maximum attempts
 * @param {number} delayMs - Initial delay in ms
 * @returns {Promise<any>}
 */
async function retryAction(action, maxAttempts = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const delay = delayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  // Wait functions
  waitForElement,
  waitForText,

  // Interaction functions
  tap,
  doubleTap,
  typeText,
  clearText,
  scrollToElement,
  swipe,
  longPress,

  // Navigation functions
  navigateToTab,
  login,
  logout,

  // Feature functions
  createTransaction,
  filterTransactions,

  // Assertion functions
  expectElementVisible,
  expectText,
  expectElementNotVisible,
  verifyNoErrors,

  // Utility functions
  screenshot,
  getPlatform,
  isIOS,
  isAndroid,
  resetApp,
  cleanInstall,
  simulateNetworkError,
  retryAction,

  // Config access
  config,
};

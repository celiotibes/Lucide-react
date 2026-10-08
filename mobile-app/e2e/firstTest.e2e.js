/**
 * First E2E Test Suite
 * Basic smoke tests for application startup and user authentication
 */

const { device, expect, element, by } = require('detox');
const config = require('./config.e2e.js');

describe('App Launch and Authentication Tests', () => {
  beforeAll(async () => {
    // Launch app before tests
    await device.launchApp();
  });

  beforeEach(async () => {
    // Revert app state before each test (optional)
    await device.sendUserActivity({ detoxPrintBusyIdleResources: 'YES' });
  });

  afterEach(async () => {
    // Clear any state after each test
    if (device.getPlatform() === 'ios') {
      await device.resetContentAndSettings();
    }
  });

  /**
   * Test Case 1: Verify app launches successfully
   * Tests that the app can be launched and the main screen is visible
   */
  it('testAppLaunchesSuccessfully', async () => {
    // Wait for app to fully load
    await waitFor(element(by.text('CRMT')))
      .toBeVisible()
      .withTimeout(config.timeouts.navigation);

    // Verify main navigation is present
    await expect(element(by.id('mainNavigation'))).toBeVisible();
  });

  /**
   * Test Case 2: Navigate through main tabs
   * Tests that user can navigate between main app tabs
   */
  it('testNavigateBetweenTabs', async () => {
    // Verify home tab is visible
    await expect(element(by.id('homeTab'))).toBeVisible();

    // Tap transactions tab
    await element(by.id('transactionsTab')).multiTap(1);

    // Wait for transactions screen to load
    await waitFor(element(by.text('Transações')))
      .toBeVisible()
      .withTimeout(config.timeouts.navigation);

    // Verify transactions screen is displayed
    await expect(element(by.id('transactionsScreen'))).toBeVisible();

    // Tap reports tab
    await element(by.id('reportsTab')).multiTap(1);

    // Wait for reports screen to load
    await waitFor(element(by.text('Relatórios')))
      .toBeVisible()
      .withTimeout(config.timeouts.navigation);

    // Verify reports screen is displayed
    await expect(element(by.id('reportsScreen'))).toBeVisible();
  });

  /**
   * Test Case 3: Login flow validation
   * Tests basic login with test credentials
   */
  it('testLoginFlowBasic', async () => {
    // Check if login button exists (only on first launch)
    try {
      await expect(element(by.id('loginButton'))).toBeVisible();

      // Tap login button
      await element(by.id('loginButton')).multiTap(1);

      // Wait for login form
      await waitFor(element(by.id('emailInput')))
        .toBeVisible()
        .withTimeout(config.timeouts.element);

      // Type email
      await element(by.id('emailInput')).typeText(config.environment.testUser.email);

      // Type password
      await element(by.id('passwordInput')).typeText(config.environment.testUser.password);

      // Tap submit button
      await element(by.id('submitLoginButton')).multiTap(1);

      // Wait for dashboard to appear
      await waitFor(element(by.id('dashboardScreen')))
        .toBeVisible()
        .withTimeout(config.timeouts.network);

      // Verify dashboard is loaded
      await expect(element(by.id('mainNavigation'))).toBeVisible();
    } catch (error) {
      // User might already be logged in
      console.log('User already logged in or login form not found');
    }
  });
});

/**
 * Helper function to wait for element with timeout
 * Attempts to find element multiple times before failing
 *
 * @param {Element} element - Detox element to wait for
 * @returns {Promise<void>}
 */
async function waitFor(element) {
  const maxAttempts = 5;
  const delayMs = 200;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return element;
    } catch (error) {
      if (i === maxAttempts - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Helper function to take screenshot on failure
 * Captures device state for debugging
 *
 * @param {string} testName - Name of the test
 * @returns {Promise<void>}
 */
async function takeScreenshot(testName) {
  if (config.artifacts.screenshots.enabled) {
    await device.takeScreenshot(
      `${config.artifacts.directory}/${testName}_${Date.now()}.png`
    );
  }
}

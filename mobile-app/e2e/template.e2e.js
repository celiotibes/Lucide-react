/**
 * E2E Test Template
 * Copy this file and customize for your feature tests
 *
 * Usage:
 * 1. Copy this file: cp template.e2e.js feature/myFeature.e2e.js
 * 2. Update describe() name and test cases
 * 3. Use helpers.js functions for common operations
 * 4. Run: npm run test:e2e
 */

const { device, element, by, waitFor, expect } = require('detox');
const {
  waitForElement,
  waitForText,
  tap,
  typeText,
  expectElementVisible,
  login,
  screenshot,
  navigateToTab,
  isAndroid,
} = require('../helpers');
const config = require('../config.e2e.js');

/**
 * Feature Name: [YOUR_FEATURE_NAME]
 * Description: [DESCRIBE_WHAT_THIS_TESTS]
 *
 * Test Cases:
 * 1. [TEST_CASE_1]
 * 2. [TEST_CASE_2]
 * 3. [TEST_CASE_3]
 */
describe('Feature Name E2E Tests', () => {
  /**
   * Setup phase: Run before all tests
   * - Launch the app
   * - Set initial state
   */
  beforeAll(async () => {
    // Launch app with clean state
    await device.launchApp({
      newInstance: true,
      permissions: {
        notifications: 'YES',
        calendar: 'YES',
        camera: isAndroid() ? undefined : 'YES',
      },
      launchArgs: { detoxPrintBusyIdleResources: 'YES' },
    });
  });

  /**
   * Setup phase: Run before each test
   * - Clear test data
   * - Reset to known state
   */
  beforeEach(async () => {
    // Wait for app to stabilize
    await device.sendUserActivity({ detoxPrintBusyIdleResources: 'YES' });
  });

  /**
   * Teardown phase: Run after each test
   * - Cleanup
   * - Take failure screenshots if needed
   */
  afterEach(async () => {
    // Optional: Reset navigation to home
    try {
      await tap('homeTab');
    } catch (error) {
      // Home tab might not exist in current state
    }
  });

  /**
   * TEST CASE 1: Basic Feature Test
   *
   * Scenario: [DESCRIBE_USER_SCENARIO]
   * Expected Result: [DESCRIBE_EXPECTED_OUTCOME]
   *
   * Steps:
   * 1. [STEP_1]
   * 2. [STEP_2]
   * 3. [STEP_3]
   */
  it('testBasicFeature', async () => {
    try {
      // Login first if feature requires authentication
      await login(
        config.environment.testUser.email,
        config.environment.testUser.password
      );

      // Navigate to feature screen
      await navigateToTab('featureTab', 'featureScreen');

      // Verify initial state
      await expectElementVisible('featureTitle');
      await expectElementVisible('featureButton');

      // Perform action
      await tap('featureButton');

      // Wait for result
      await waitForElement('featureResult', config.timeouts.navigation);

      // Verify result
      await expect(element(by.text('Success'))).toBeVisible();
    } catch (error) {
      // Take screenshot for debugging
      await screenshot('testBasicFeature_failure');
      throw error;
    }
  });

  /**
   * TEST CASE 2: Error Handling Test
   *
   * Scenario: [DESCRIBE_ERROR_SCENARIO]
   * Expected Result: [DESCRIBE_ERROR_HANDLING]
   */
  it('testErrorHandling', async () => {
    try {
      // Setup error condition (if possible)
      // For example: invalid input

      // Navigate to feature
      await navigateToTab('featureTab', 'featureScreen');

      // Input invalid data
      await typeText('featureInput', 'invalid');

      // Try to submit
      await tap('featureButton');

      // Verify error message
      await waitForText('Error message', config.timeouts.navigation);

      // Verify feature still usable (not crashed)
      await expectElementVisible('featureButton');
    } catch (error) {
      await screenshot('testErrorHandling_failure');
      throw error;
    }
  });

  /**
   * TEST CASE 3: Complex Workflow Test
   *
   * Scenario: [DESCRIBE_COMPLEX_SCENARIO]
   * Expected Result: [DESCRIBE_FINAL_STATE]
   */
  it('testComplexWorkflow', async () => {
    try {
      // Login
      await login();

      // Navigate to feature
      await navigateToTab('featureTab', 'featureScreen');

      // First action
      await tap('actionButton1');
      await waitForElement('step2', config.timeouts.navigation);

      // Second action
      await typeText('dataInput', 'test data');
      await tap('actionButton2');
      await waitForElement('step3', config.timeouts.navigation);

      // Final action
      await tap('submitButton');

      // Wait for confirmation
      await waitForText('Completed', config.timeouts.network);

      // Verify final state
      await expectElementVisible('successMessage');

      // Navigate back to verify persistence
      await tap('homeTab');
      await waitForElement('homeScreen', config.timeouts.navigation);

      // Return to feature to verify data persisted
      await tap('featureTab');
      await waitForElement('featureScreen', config.timeouts.navigation);
      await expectElementVisible('persistedData');
    } catch (error) {
      await screenshot('testComplexWorkflow_failure');
      throw error;
    }
  });

  /**
   * TEST CASE 4: Edge Case Test
   *
   * Scenario: [DESCRIBE_EDGE_CASE]
   * Expected Result: [DESCRIBE_HANDLING]
   */
  it('testEdgeCase', async () => {
    try {
      // Test edge condition
      // Examples:
      // - Empty input
      // - Very large input
      // - Special characters
      // - Rapid actions

      await login();
      await navigateToTab('featureTab', 'featureScreen');

      // Test with empty input
      await tap('featureButton');
      await waitForElement('validation', config.timeouts.element);

      // Verify validation message
      await expect(element(by.text('Field required'))).toBeVisible();

      // Test with valid input
      await typeText('featureInput', 'valid input');
      await tap('featureButton');

      // Verify success
      await waitForElement('featureResult', config.timeouts.navigation);
    } catch (error) {
      await screenshot('testEdgeCase_failure');
      throw error;
    }
  });

  /**
   * TEST CASE 5: Performance Test
   *
   * Scenario: [DESCRIBE_PERFORMANCE_SCENARIO]
   * Expected Result: [DESCRIBE_PERFORMANCE_REQUIREMENT]
   */
  it('testPerformance', async () => {
    try {
      const startTime = Date.now();

      await login();
      await navigateToTab('featureTab', 'featureScreen');

      // Perform action
      await tap('featureButton');
      await waitForElement('featureResult', config.timeouts.action);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify performance (should complete within timeout)
      expect(duration).toBeLessThan(config.timeouts.action);

      console.log(`Feature completed in ${duration}ms`);
    } catch (error) {
      await screenshot('testPerformance_failure');
      throw error;
    }
  });
});

/**
 * HELPER FUNCTIONS (Feature-Specific)
 * Define any custom helpers needed for this feature
 */

/**
 * Example helper: Fill feature form with test data
 *
 * @param {object} data - Form data
 * @returns {Promise<void>}
 */
async function fillFeatureForm(data) {
  if (data.field1) {
    await typeText('field1Input', data.field1);
  }

  if (data.field2) {
    await typeText('field2Input', data.field2);
  }

  if (data.field3) {
    await tap(`field3_${data.field3}`);
  }
}

/**
 * Example helper: Verify feature result
 *
 * @param {object} expected - Expected result data
 * @returns {Promise<void>}
 */
async function verifyFeatureResult(expected) {
  for (const [key, value] of Object.entries(expected)) {
    await expect(element(by.id(`result_${key}`))).toHaveText(value);
  }
}

/**
 * DEBUGGING TIPS
 *
 * 1. Run single test:
 *    npm run test:e2e -- myFeature.e2e.js
 *
 * 2. Run with debug output:
 *    npm run test:e2e:local
 *
 * 3. Check element visibility:
 *    const elementAtIndex = element(by.id('myElement')).atIndex(0);
 *
 * 4. Wait with logging:
 *    await waitFor(element(by.id('target')))
 *      .toBeVisible()
 *      .withTimeout(5000);
 *    console.log('Element found');
 *
 * 5. Take screenshot:
 *    await screenshot('debug-step-1');
 *
 * 6. Check app logs:
 *    Run: npm run test:e2e -- --record-logs all
 *    Check: artifacts/e2e/logs/
 */

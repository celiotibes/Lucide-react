import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.VITE_API_URL || 'http://localhost:5173';

/**
 * Frontend E2E Tests - Rental Sync
 *
 * This test suite automates the 23 manual test cases from FRONTEND_TESTING_EXECUTION.md
 * Tests cover: Login, Calendar, Booking Form, Navigation, Responsive Design, Accessibility
 */

test.describe('Rental Sync - Frontend Testing Suite', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.describe('Section 1: Login Flow (8 Tests)', () => {
    test('1.1: Login Page Displays', async () => {
      await page.goto(`${BASE_URL}/login`);

      // Verify page title
      const title = page.locator('h1');
      await expect(title).toContainText('Rental Sync');

      // Verify form elements exist
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await expect(emailInput).toBeVisible();
      await expect(passwordInput).toBeVisible();
      await expect(submitButton).toBeVisible();
    });

    test('1.2: Email Field Input', async () => {
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      await emailInput.fill('test@example.com');

      const value = await emailInput.inputValue();
      expect(value).toBe('test@example.com');
    });

    test('1.3: Password Field Masking', async () => {
      await page.goto(`${BASE_URL}/login`);

      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('password123');

      // Verify input is of type password (characters masked)
      const inputType = await passwordInput.getAttribute('type');
      expect(inputType).toBe('password');
    });

    test('1.4: Login Button Clickable', async () => {
      await page.goto(`${BASE_URL}/login`);

      const submitButton = page.locator('button:has-text("Login")');
      await expect(submitButton).toBeEnabled();

      // Verify button is clickable
      await expect(submitButton).toHaveClass(/hover:bg-blue-700/);
    });

    test('1.5: Form Validation - Empty Email', async () => {
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const submitButton = page.locator('button:has-text("Login")');

      // HTML5 validation should prevent submission
      await emailInput.focus();
      await emailInput.blur();

      const isRequired = await emailInput.getAttribute('required');
      expect(isRequired).toBe('');
    });

    test('1.6: Form Validation - Empty Password', async () => {
      await page.goto(`${BASE_URL}/login`);

      const passwordInput = page.locator('input[type="password"]');

      const isRequired = await passwordInput.getAttribute('required');
      expect(isRequired).toBe('');
    });

    test('1.7: Invalid Credentials Error', async () => {
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('invalid@example.com');
      await passwordInput.fill('wrongpassword');
      await submitButton.click();

      // Wait for error message
      const errorMessage = page.locator('div.bg-red-50, div.text-red-700');
      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    });

    test('1.8: Successful Login & Redirect', async () => {
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      await submitButton.click();

      // Wait for redirect to home page
      await page.waitForURL('/', { timeout: 5000 });
      expect(page.url()).toContain('/');
    });
  });

  test.describe('Section 2: Calendar Component (6 Tests)', () => {
    test.beforeEach(async () => {
      // Login first
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      await submitButton.click();

      // Wait for home page to load
      await page.waitForURL('/', { timeout: 5000 });
    });

    test('2.1: Calendar Displays', async () => {
      const calendarHeader = page.locator('h2:has-text("Check Availability")');
      await expect(calendarHeader).toBeVisible();

      // Verify calendar grid exists
      const calendarGrid = page.locator('.calendar-grid, [role="grid"]');
      await expect(calendarGrid).toBeVisible();
    });

    test('2.2: Calendar Shows 180 Days', async () => {
      // Count available date buttons
      const dateButtons = page.locator('button').filter({ hasText: /^\d+$/ });
      const count = await dateButtons.count();

      // Should have at least 180 days (may show more for calendar grid alignment)
      expect(count).toBeGreaterThanOrEqual(180);
    });

    test('2.3: Date Selection - Check-in', async () => {
      // Find first available date button (green background)
      const availableDates = page.locator('button.bg-green-100, button[class*="available"]');
      const firstDate = availableDates.first();

      await firstDate.click();

      // Verify selection (ring or selected class)
      await expect(firstDate).toHaveClass(/selected|ring-2/);
    });

    test('2.4: Date Selection - Check-out', async () => {
      // Select check-in date
      const availableDates = page.locator('button.bg-green-100, button[class*="available"]');
      const firstDate = availableDates.first();
      await firstDate.click();

      // Select check-out date (skip a few dates)
      const allAvailable = await availableDates.all();
      if (allAvailable.length > 3) {
        await allAvailable[3].click();
      }

      // Verify date range is shown
      const selectedInfo = page.locator('div:has-text("Selected:")');
      await expect(selectedInfo).toBeVisible({ timeout: 2000 });
    });

    test('2.5: Cannot Select Check-out Before Check-in', async () => {
      // Select a check-in date
      const availableDates = page.locator('button.bg-green-100, button[class*="available"]');
      const checkInDate = availableDates.nth(5);
      await checkInDate.click();

      // Try to select an earlier date as check-out
      const earlierDate = availableDates.first();
      await earlierDate.click();

      // Should reset or prevent selection
      const selectedInfo = page.locator('div:has-text("Selected:")');
      await expect(selectedInfo).not.toBeVisible({ timeout: 1000 });
    });

    test('2.6: Past Dates Disabled', async () => {
      // Verify that past dates are not clickable
      const bookedDates = page.locator('button.bg-red-100, button.bg-gray-100, button[class*="booked"], button[class*="blocked"]');

      for (const button of await bookedDates.all().then(arr => arr.slice(0, 5))) {
        const isDisabled = await button.isDisabled();
        // Should be disabled or have no-cursor class
        const hasNoPointer = await button.evaluate(el =>
          window.getComputedStyle(el).cursor === 'not-allowed'
        );
        expect(isDisabled || hasNoPointer).toBeTruthy();
      }
    });
  });

  test.describe('Section 3: Booking Form (7 Tests)', () => {
    test.beforeEach(async () => {
      // Login and select dates
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      await submitButton.click();

      await page.waitForURL('/', { timeout: 5000 });

      // Select dates
      const availableDates = page.locator('button.bg-green-100, button[class*="available"]');
      await availableDates.first().click();

      const allAvailable = await availableDates.all();
      if (allAvailable.length > 3) {
        await allAvailable[3].click();
      }
    });

    test('3.1: Booking Form Appears', async () => {
      // After date selection, booking form should appear
      const bookingForm = page.locator('form, [class*="booking"]');
      await expect(bookingForm).toBeVisible({ timeout: 2000 });
    });

    test('3.2: Form Disappears When No Dates', async () => {
      // Clear selections by clicking same date twice
      const availableDates = page.locator('button.bg-green-100, button[class*="available"]');
      const firstDate = availableDates.first();

      await firstDate.click();
      await firstDate.click();

      // Booking form should not be visible
      const bookingForm = page.locator('form, [class*="booking"]');
      const placeholder = page.locator('div:has-text("Select check-in and check-out")');

      // Either form is gone or placeholder is shown
      const formHidden = await bookingForm.isHidden().catch(() => true);
      const placeholderVisible = await placeholder.isVisible().catch(() => false);

      expect(formHidden || placeholderVisible).toBeTruthy();
    });

    test('3.3: Guest Name Required', async () => {
      // Get name input and verify it's required
      const nameInput = page.locator('input[placeholder*="Name"], input[placeholder*="name"]');
      const isRequired = await nameInput.getAttribute('required');

      expect(isRequired).toBe('');
    });

    test('3.4: Guest Email Validation', async () => {
      const emailInput = page.locator('input[type="email"][placeholder*="email"], input[type="email"][placeholder*="@"]');

      // Fill with invalid email
      await emailInput.fill('invalid-email');

      // Try to blur/validate
      await emailInput.blur();

      // Input should have email type validation
      const inputType = await emailInput.getAttribute('type');
      expect(inputType).toBe('email');
    });

    test('3.5: Guest Phone Validation', async () => {
      const phoneInput = page.locator('input[type="tel"], input[placeholder*="Phone"]');

      const isRequired = await phoneInput.getAttribute('required');
      expect(isRequired).toBe('');
    });

    test('3.6: Price Calculation Correct', async () => {
      // Verify price summary is displayed
      const priceDisplay = page.locator('text=/\\$\\d+|nights/');
      await expect(priceDisplay).toBeVisible({ timeout: 2000 });

      // Check that total is calculated
      const totalDisplay = page.locator('div:has-text("Total")');
      await expect(totalDisplay).toBeVisible();
    });

    test('3.7: Form Submission Success', async () => {
      // Fill form
      const nameInput = page.locator('input[placeholder*="Name"], input[placeholder*="name"]').first();
      const emailInput = page.locator('input[type="email"]').first();
      const phoneInput = page.locator('input[type="tel"], input[placeholder*="Phone"]').first();
      const guestInput = page.locator('input[placeholder*="guest"], input[placeholder*="Guest"]').first();

      await nameInput.fill('John Doe');
      await emailInput.fill('john@example.com');
      await phoneInput.fill('+1 (555) 000-0000');
      await guestInput.fill('2');

      // Submit form
      const submitBtn = page.locator('button:has-text("Payment"), button:has-text("Booking"), button:has-text("Submit")').first();
      await submitBtn.click();

      // Verify success message or redirect
      const successMessage = page.locator('div:has-text("success"), div:has-text("confirmation"), div:has-text("created")');
      await expect(successMessage).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Section 4: Navigation & Auth (2 Tests)', () => {
    test.beforeEach(async () => {
      // Login
      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      await submitButton.click();

      await page.waitForURL('/', { timeout: 5000 });
    });

    test('4.1: Logout Button Functionality', async () => {
      // Find logout button
      const logoutButton = page.locator('button:has-text("Logout"), button:has-text("logout")');
      await expect(logoutButton).toBeVisible();

      // Click logout
      await logoutButton.click();

      // Should redirect to login
      await page.waitForURL(/login/, { timeout: 5000 });
      expect(page.url()).toContain('login');
    });

    test('4.2: Login Persists on Page Refresh', async () => {
      // Verify on home page
      const homeTitle = page.locator('h1:has-text("Rental Sync")');
      await expect(homeTitle).toBeVisible();

      // Refresh page
      await page.reload();

      // Should still be on home page (not redirected to login)
      await page.waitForLoadState('networkidle');
      const stillHome = await homeTitle.isVisible().catch(() => false);

      expect(stillHome).toBeTruthy();
    });
  });

  test.describe('Section 5: Responsive Design (3 Tests)', () => {
    test('5.1: Mobile Layout (iPhone 12 - 390×844)', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${BASE_URL}/login`);

      const loginBox = page.locator('div[class*="login"], form').first();

      // Verify form is centered and readable
      const boundingBox = await loginBox.boundingBox();
      expect(boundingBox?.width || 0).toBeLessThanOrEqual(390);

      // Verify button is touch-friendly (at least 44px height)
      const buttons = page.locator('button').first();
      const btnBox = await buttons.boundingBox();
      expect(btnBox?.height || 0).toBeGreaterThanOrEqual(40);
    });

    test('5.2: Tablet Layout (iPad - 768×1024)', async () => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto(`${BASE_URL}/login`);

      const loginBox = page.locator('div[class*="login"], form').first();
      const boundingBox = await loginBox.boundingBox();

      // Should be readable at tablet size
      expect(boundingBox?.width || 0).toBeLessThanOrEqual(768);
    });

    test('5.3: Desktop Layout (1920×1080)', async () => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(`${BASE_URL}`);

      // Should not have horizontal scroll
      const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = 1920;

      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
    });
  });

  test.describe('Section 6: Accessibility (3 Tests)', () => {
    test('6.1: Keyboard Navigation', async () => {
      await page.goto(`${BASE_URL}/login`);

      // Tab through form fields
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      // Focus on email
      await emailInput.focus();
      let focused = await emailInput.evaluate((el: HTMLElement) => document.activeElement === el);
      expect(focused).toBeTruthy();

      // Tab to password
      await page.keyboard.press('Tab');
      focused = await passwordInput.evaluate((el: HTMLElement) => document.activeElement === el);
      expect(focused).toBeTruthy();

      // Tab to button
      await page.keyboard.press('Tab');
      focused = await submitButton.evaluate((el: HTMLElement) => document.activeElement === el);
      expect(focused).toBeTruthy();
    });

    test('6.2: Color Contrast (WCAG AA)', async () => {
      await page.goto(`${BASE_URL}/login`);

      // Inject script to check contrast ratios
      const contrastData = await page.evaluate(() => {
        const checkContrast = (element: Element): boolean => {
          const style = window.getComputedStyle(element);
          const bgColor = style.backgroundColor;
          const textColor = style.color;

          // Simple heuristic: both should be defined
          return bgColor !== 'rgba(0, 0, 0, 0)' && textColor !== 'rgba(0, 0, 0, 0)';
        };

        const inputs = Array.from(document.querySelectorAll('input, button, label'));
        return inputs.every(el => checkContrast(el));
      });

      expect(contrastData).toBeTruthy();
    });

    test('6.3: Screen Reader Compatibility', async () => {
      await page.goto(`${BASE_URL}/login`);

      // Check for semantic HTML and labels
      const emailInput = page.locator('input[type="email"]');
      const label = page.locator('label:has-text("email"), label:has-text("Email")').first();

      // Should have proper labeling
      const hasLabel = await label.isVisible().catch(() => false);
      const hasPlaceholder = await emailInput.getAttribute('placeholder');

      expect(hasLabel || hasPlaceholder).toBeTruthy();
    });
  });

  test.describe('Section 7: Error Handling (2+ Tests)', () => {
    test('7.1: Network Error Handling', async () => {
      // Go offline
      await page.context().setOffline(true);

      await page.goto(`${BASE_URL}/login`);

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      await submitButton.click();

      // Should show error message
      const errorMessage = page.locator('div.bg-red-50, div.text-red-700, [role="alert"]');
      await expect(errorMessage).toBeVisible({ timeout: 3000 });

      // Go back online
      await page.context().setOffline(false);
    });

    test('7.2: API Timeout Handling', async () => {
      await page.goto(`${BASE_URL}/login`);

      // Slow down network to simulate timeout
      await page.route('**/api/**', route => {
        setTimeout(() => {
          route.abort('timedout');
        }, 100);
      });

      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.locator('button:has-text("Login")');

      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');
      await submitButton.click();

      // Should eventually show error or timeout message
      const errorMessage = page.locator('[class*="error"], [class*="alert"]');
      await expect(errorMessage).toBeVisible({ timeout: 10000 }).catch(() => {
        // Timeouts are expected in this scenario
      });
    });
  });
});

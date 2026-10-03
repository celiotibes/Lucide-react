import { test, expect } from '@playwright/test';
import { loginUser, checkAuthToken, logout } from '../fixtures/auth';

const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';

test.describe('Authentication', () => {
  test('should login with valid credentials', async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);

    // Verify we're on the dashboard
    expect(page.url()).toContain('/dashboard');

    // Verify token is stored
    const token = await checkAuthToken(page);
    expect(token).toBeTruthy();
    expect(token).toMatch(/^Bearer /);
  });

  test('should store auth token in localStorage', async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);

    const token = await checkAuthToken(page);
    expect(token).toBeTruthy();

    // Verify token format
    const tokenData = token?.replace('Bearer ', '');
    expect(tokenData).toBeDefined();
    expect(tokenData?.length).toBeGreaterThan(20);
  });

  test('should persist token after page reload', async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);

    const tokenBefore = await checkAuthToken(page);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    const tokenAfter = await checkAuthToken(page);
    expect(tokenAfter).toBe(tokenBefore);
  });

  test('should redirect to login on invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', TEST_USER_EMAIL);
    await page.fill('input[type="password"]', 'wrongPassword');
    await page.click('button:has-text("Entrar")');

    // Should stay on login page or show error
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const errorMessage = await page.locator('[role="alert"]').first().textContent();
    expect(errorMessage).toContain('inválido');
  });

  test('should logout successfully', async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);

    // Verify we're logged in
    const token = await checkAuthToken(page);
    expect(token).toBeTruthy();

    // Logout
    await logout(page);

    // Verify token is cleared
    const tokenAfter = await checkAuthToken(page);
    expect(tokenAfter).toBeNull();
  });

  test('should require email field', async ({ page }) => {
    await page.goto('/');

    // Try to submit without email
    await page.fill('input[type="password"]', 'testPassword123!');
    await page.click('button:has-text("Entrar")');

    // Should show validation error
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const errorMessage = await page.locator('[role="alert"]').first().textContent();
    expect(errorMessage?.toLowerCase()).toContain('email');
  });

  test('should require password field', async ({ page }) => {
    await page.goto('/');

    // Try to submit without password
    await page.fill('input[type="email"]', TEST_USER_EMAIL);
    await page.click('button:has-text("Entrar")');

    // Should show validation error
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const errorMessage = await page.locator('[role="alert"]').first().textContent();
    expect(errorMessage?.toLowerCase()).toContain('senha');
  });
});

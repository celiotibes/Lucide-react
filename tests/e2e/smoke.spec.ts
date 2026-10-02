import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');

    // Check if page loaded
    const title = await page.title();
    expect(title).toBeTruthy();

    // Check if we can see login form or dashboard
    const hasLoginForm = await page.locator('input[type="email"]').isVisible().catch(() => false);
    const hasDashboard = await page.locator('[data-testid="dashboard"]').isVisible().catch(() => false);

    expect(hasLoginForm || hasDashboard).toBeTruthy();
  });

  test('should navigate without errors', async ({ page }) => {
    // Intercept errors
    let hasError = false;

    page.on('console', msg => {
      if (msg.type() === 'error') {
        hasError = true;
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should not have console errors
    expect(hasError).toBeFalsy();
  });

  test('should handle navigation to missing page gracefully', async ({ page }) => {
    await page.goto('/non-existent-page');

    // Should either show 404 or redirect
    const url = page.url();
    const isNotFound = await page.locator('text=/404|não encontrado/i').isVisible().catch(() => false);
    const isRedirected = !url.includes('non-existent-page');

    expect(isNotFound || isRedirected).toBeTruthy();
  });
});

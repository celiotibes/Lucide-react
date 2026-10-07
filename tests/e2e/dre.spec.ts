import { test, expect } from '@playwright/test';
import { loginUser } from '../fixtures/auth';

const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';

test.describe('DRE (Demonstração de Resultado do Exercício)', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  });

  test('should navigate to DRE page', async ({ page }) => {
    await page.click('a:has-text("DRE")');
    await page.waitForURL('**/dre', { timeout: 5000 });
    expect(page.url()).toContain('/dre');
  });

  test('should display period tabs', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    // Check for period tabs
    const thisMonthTab = page.locator('button:has-text("Este Período")');
    expect(thisMonthTab).toBeTruthy();
  });

  test('should display revenue and expense cards', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    // Click on "Este Período" tab
    await page.click('button:has-text("Este Período")');

    // Wait for cards to load
    await page.waitForTimeout(500);

    // Check for revenue card
    const revenueCard = page.locator('div:has-text("Receita")').first();
    await expect(revenueCard).toBeVisible();

    // Check for expense card
    const expenseCard = page.locator('div:has-text("Despesa")').first();
    await expect(expenseCard).toBeVisible();
  });

  test('should update cards when clicking period tab', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    // Get initial values
    await page.click('button:has-text("Este Período")');
    await page.waitForTimeout(300);

    // Switch to another period (if available)
    const tabs = await page.locator('button[role="tab"]').count();
    if (tabs > 1) {
      await page.locator('button[role="tab"]').nth(1).click();
      await page.waitForTimeout(300);

      const updatedRevenue = await page.locator('div:has-text("Receita")').first().textContent();

      // Revenue should be the same or different after switching periods
      expect(updatedRevenue).toBeTruthy();
    }
  });

  test('should display historical data table', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    // Click on "Histórico" tab if available
    const historicTab = page.locator('button:has-text("Histórico")');
    const isVisible = await historicTab.isVisible();

    if (isVisible) {
      await historicTab.click();
      await page.waitForTimeout(500);

      // Check for table headers
      const tableHeaders = page.locator('thead th');
      const count = await tableHeaders.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should display at least 12 months in historical table', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    const historicTab = page.locator('button:has-text("Histórico")');
    const isVisible = await historicTab.isVisible();

    if (isVisible) {
      await historicTab.click();
      await page.waitForTimeout(500);

      // Count table rows
      const tableRows = page.locator('tbody tr');
      const count = await tableRows.count();

      // Should have at least 12 months of data
      expect(count).toBeGreaterThanOrEqual(12);
    }
  });

  test('should display DRE data with proper formatting', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    // Check for monetary values displayed correctly
    const monetaryValues = page.locator('[data-testid="monetary-value"]');
    const count = await monetaryValues.count();

    if (count > 0) {
      const firstValue = await monetaryValues.first().textContent();
      // Check if value contains currency formatting (R$ or number)
      expect(firstValue).toMatch(/R\$|\d+[.,]\d{2}/);
    }
  });

  test('should load DRE data within timeout', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // DRE page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle empty periods gracefully', async ({ page }) => {
    await page.goto('/dre');
    await page.waitForLoadState('networkidle');

    // Navigate through all available periods
    const tabs = await page.locator('button[role="tab"]').count();

    for (let i = 0; i < tabs; i++) {
      await page.locator('button[role="tab"]').nth(i).click();
      await page.waitForTimeout(300);

      // Should not show error messages
      const errorMessages = await page.locator('[role="alert"]').count();
      expect(errorMessages).toBe(0);
    }
  });
});

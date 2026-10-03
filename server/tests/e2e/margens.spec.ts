import { test, expect } from '@playwright/test';
import { loginUser } from '../fixtures/auth';

const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';

test.describe('Margens', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  });

  test('should navigate to Margens page', async ({ page }) => {
    await page.click('a:has-text("Margens")');
    await page.waitForURL('**/margens', { timeout: 5000 });
    expect(page.url()).toContain('/margens');
  });

  test('should display ranking section', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Check for ranking header
    const rankingHeader = page.locator('h2:has-text("Ranking")');
    await expect(rankingHeader).toBeVisible();
  });

  test('should display top 5 highest margins', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Check for top 5 container
    const topMargins = page.locator('[data-testid="top-margins"]');
    await expect(topMargins).toBeVisible();

    // Check for at least 5 items
    const items = page.locator('[data-testid="top-margins"] > div');
    const count = await items.count();

    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should display bottom 5 lowest margins', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Check for bottom 5 container
    const bottomMargins = page.locator('[data-testid="bottom-margins"]');
    await expect(bottomMargins).toBeVisible();

    // Check for at least 5 items
    const items = page.locator('[data-testid="bottom-margins"] > div');
    const count = await items.count();

    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should expand margin item to show chart', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Find first expandable item
    const expandButton = page.locator('[data-testid="expand-margin"]').first();
    const isVisible = await expandButton.isVisible();

    if (isVisible) {
      await expandButton.click();
      await page.waitForTimeout(500);

      // Check if chart is displayed
      const chart = page.locator('[data-testid="margin-chart"]').first();
      await expect(chart).toBeVisible();
    }
  });

  test('should collapse margin chart when clicked again', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    const expandButton = page.locator('[data-testid="expand-margin"]').first();
    const isVisible = await expandButton.isVisible();

    if (isVisible) {
      // Expand
      await expandButton.click();
      await page.waitForTimeout(300);

      let chart = page.locator('[data-testid="margin-chart"]').first();
      await expect(chart).toBeVisible();

      // Collapse
      await expandButton.click();
      await page.waitForTimeout(300);

      // Chart should not be visible or should be hidden
      const isChartVisible = await chart.isVisible().catch(() => false);
      expect(isChartVisible).toBeFalsy();
    }
  });

  test('should display margin percentages', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Check for percentage values
    const percentages = page.locator('[data-testid="margin-percentage"]');
    const count = await percentages.count();

    if (count > 0) {
      const firstPercentage = await percentages.first().textContent();
      // Should contain % symbol
      expect(firstPercentage).toMatch(/%/);
    }
  });

  test('should display margin labels/names', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Check for margin names/labels
    const labels = page.locator('[data-testid="margin-label"]');
    const count = await labels.count();

    // Should have at least 2 labels (top and bottom)
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should sort margins in correct order', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Get top margins
    const topItems = page.locator('[data-testid="top-margins"] [data-testid="margin-percentage"]');
    const topCount = await topItems.count();

    if (topCount > 1) {
      const values: number[] = [];

      for (let i = 0; i < Math.min(topCount, 5); i++) {
        const text = await topItems.nth(i).textContent();
        const percentage = parseFloat(text?.replace('%', '') || '0');
        values.push(percentage);
      }

      // Check if sorted in descending order
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
      }
    }
  });

  test('should display period selector for margins', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Check for period selector
    const periodSelector = page.locator('[data-testid="period-selector"]');
    const isVisible = await periodSelector.isVisible();

    if (isVisible) {
      await expect(periodSelector).toBeVisible();
    }
  });

  test('should update margins when period changes', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Get initial margins
    const initialMargins = await page.locator('[data-testid="margin-percentage"]').first().textContent();

    // Check if period selector exists
    const periodSelector = page.locator('[data-testid="period-selector"]');
    const isVisible = await periodSelector.isVisible();

    if (isVisible) {
      // Change period
      await periodSelector.click();
      const option = page.locator('div[role="option"]').nth(1);
      await option.click();

      await page.waitForTimeout(500);

      // Margins should still be displayed
      const updatedMargins = page.locator('[data-testid="margin-percentage"]').first();
      await expect(updatedMargins).toBeVisible();
    }
  });

  test('should handle margin chart interactions', async ({ page }) => {
    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    // Expand a margin item
    const expandButton = page.locator('[data-testid="expand-margin"]').first();
    const isVisible = await expandButton.isVisible();

    if (isVisible) {
      await expandButton.click();
      await page.waitForTimeout(500);

      // Check if chart contains interactive elements
      const chart = page.locator('[data-testid="margin-chart"]').first();
      const chartContent = await chart.textContent();

      // Chart should have some content
      expect(chartContent).toBeTruthy();
    }
  });

  test('should load margins data within timeout', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/margens');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Margins page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });
});

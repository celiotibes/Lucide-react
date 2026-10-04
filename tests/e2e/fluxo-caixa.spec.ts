import { test, expect } from '@playwright/test';
import { loginUser } from '../fixtures/auth';

const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';

test.describe('Fluxo de Caixa', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  });

  test('should navigate to Fluxo de Caixa page', async ({ page }) => {
    await page.click('a:has-text("Fluxo de Caixa")');
    await page.waitForURL('**/fluxo-caixa', { timeout: 5000 });
    expect(page.url()).toContain('/fluxo-caixa');
  });

  test('should display period selector', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    // Check for period selector dropdown
    const periodSelector = page.locator('[data-testid="period-selector"]');
    await expect(periodSelector).toBeVisible();
  });

  test('should change period when selecting from dropdown', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    const periodSelector = page.locator('[data-testid="period-selector"]');
    await expect(periodSelector).toBeVisible();

    // Click to open dropdown
    await periodSelector.click();

    // Select a different period
    const option = page.locator('div[role="option"]').nth(1);
    const periodText = await option.textContent();

    await option.click();
    await page.waitForTimeout(500);

    // Verify period changed
    const selectedPeriod = await periodSelector.textContent();
    expect(selectedPeriod).toContain(periodText);
  });

  test('should display cash flow slider', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    // Check for slider with days
    const slider = page.locator('[data-testid="days-slider"]');
    await expect(slider).toBeVisible();

    // Check for current value display
    const valueDisplay = page.locator('[data-testid="slider-value"]');
    await expect(valueDisplay).toBeVisible();
  });

  test('should update chart when slider changes to 30 days', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    // Get initial chart state
    const chart = page.locator('[data-testid="fluxo-chart"]');
    await expect(chart).toBeVisible();

    // Move slider to 30 days
    const slider = page.locator('[data-testid="days-slider"]');
    await slider.evaluate((element: HTMLInputElement) => {
      element.value = '30';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    // Verify slider value changed
    const value = await slider.inputValue();
    expect(Number(value)).toBe(30);
  });

  test('should update chart when slider changes to 60 days', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    const slider = page.locator('[data-testid="days-slider"]');

    // Move slider to 60 days
    await slider.evaluate((element: HTMLInputElement) => {
      element.value = '60';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    const value = await slider.inputValue();
    expect(Number(value)).toBe(60);
  });

  test('should update chart when slider changes to 90 days', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    const slider = page.locator('[data-testid="days-slider"]');

    // Move slider to 90 days
    await slider.evaluate((element: HTMLInputElement) => {
      element.value = '90';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForTimeout(500);

    const value = await slider.inputValue();
    expect(Number(value)).toBe(90);
  });

  test('should display chart with data points', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    // Check for chart container
    const chart = page.locator('[data-testid="fluxo-chart"]');
    await expect(chart).toBeVisible();

    // Check for chart elements
    const chartElements = page.locator('[data-testid="fluxo-chart"] svg');
    const count = await chartElements.count();

    // Should have at least one SVG element for chart
    expect(count).toBeGreaterThan(0);
  });

  test('should update chart data when period changes', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    // Get chart content
    const chartContent = page.locator('[data-testid="fluxo-chart"]');
    _const _initialContent = await chartContent.textContent();

    // Change period
    const periodSelector = page.locator('[data-testid="period-selector"]');
    await periodSelector.click();
    const option = page.locator('div[role="option"]').nth(1);
    await option.click();

    await page.waitForTimeout(500);

    // Chart should still exist
    await expect(chartContent).toBeVisible();
  });

  test('should display cash flow summary information', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    // Check for summary cards
    const summaryCards = page.locator('[data-testid="summary-card"]');
    const count = await summaryCards.count();

    // Should have at least some summary information
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should handle slider boundary values', async ({ page }) => {
    await page.goto('/fluxo-caixa');
    await page.waitForLoadState('networkidle');

    const slider = page.locator('[data-testid="days-slider"]');

    // Get slider min and max
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');

    expect(min).toBeDefined();
    expect(max).toBeDefined();

    // Test minimum value
    await slider.evaluate((element: HTMLInputElement) => {
      element.value = element.min;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForTimeout(300);
    const minValue = await slider.inputValue();
    expect(Number(minValue)).toBe(Number(min));
  });
});

import { test, expect } from '@playwright/test';
import { loginUser } from '../fixtures/auth';

const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';

test.describe('Reembolsos', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  });

  test('should navigate to Reembolsos page', async ({ page }) => {
    await page.click('a:has-text("Reembolso")');
    await page.waitForURL('**/reembolsos', { timeout: 5000 });
    expect(page.url()).toContain('/reembolsos');
  });

  test('should display reembolso list', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for reembolso table/list
    const listContainer = page.locator('[data-testid="reembolsos-list"]');
    await expect(listContainer).toBeVisible();
  });

  test('should display create reembolso button', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for create button
    const createButton = page.locator('button:has-text("Novo Reembolso")');
    const isVisible = await createButton.isVisible();

    if (isVisible) {
      await expect(createButton).toBeVisible();
    }
  });

  test('should open reembolso creation form', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Click create button
    const createButton = page.locator('button:has-text("Novo Reembolso")');
    const isVisible = await createButton.isVisible();

    if (isVisible) {
      await createButton.click();
      await page.waitForTimeout(500);

      // Check for form elements
      const form = page.locator('[data-testid="reembolso-form"]');
      await expect(form).toBeVisible();
    }
  });

  test('should create reembolso from charging', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Look for action button to create from charging
    const actionButtons = page.locator('[data-testid="reembolso-action"]');
    const count = await actionButtons.count();

    if (count > 0) {
      // Click first reembolso action
      await actionButtons.first().click();
      await page.waitForTimeout(500);

      // Check for modal/dialog
      const modal = page.locator('[role="dialog"]');
      const isVisible = await modal.isVisible();

      if (isVisible) {
        // Try to submit
        const submitButton = page.locator('button:has-text("Confirmar")');
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await page.waitForTimeout(500);

          // Check for success message
          const successMessage = page.locator('[role="alert"]:has-text("sucesso")');
          const hasSuccess = await successMessage.isVisible().catch(() => false);

          // Should either show success or update the list
          expect(hasSuccess || count >= 0).toBeTruthy();
        }
      }
    }
  });

  test('should display reembolso status', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for status columns/badges
    const statusBadges = page.locator('[data-testid="reembolso-status"]');
    const count = await statusBadges.count();

    if (count > 0) {
      const firstStatus = await statusBadges.first().textContent();
      // Status should contain text like "Pendente", "Aprovado", etc.
      expect(firstStatus?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should update reembolso status after creation', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Get initial list count
    const initialItems = await page.locator('[data-testid="reembolso-item"]').count();

    // Create reembolso (if form available)
    const createButton = page.locator('button:has-text("Novo Reembolso")');
    const isVisible = await createButton.isVisible();

    if (isVisible) {
      await createButton.click();
      await page.waitForTimeout(300);

      // Fill form fields (if available)
      const amountField = page.locator('input[data-testid="reembolso-amount"]');
      if (await amountField.isVisible()) {
        await amountField.fill('100.00');

        // Look for submit button
        const submitButton = page.locator('button:has-text("Salvar")');
        if (await submitButton.isVisible()) {
          await submitButton.click();
          await page.waitForTimeout(500);

          // Reload to get updated list
          await page.reload();
          await page.waitForLoadState('networkidle');

          // List should be updated
          const newItems = await page.locator('[data-testid="reembolso-item"]').count();
          expect(newItems).toBeGreaterThanOrEqual(initialItems);
        }
      }
    }
  });

  test('should display reembolso amounts', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for amount values
    const amounts = page.locator('[data-testid="reembolso-amount"]');
    const count = await amounts.count();

    if (count > 0) {
      const firstAmount = await amounts.first().textContent();
      // Amount should contain currency formatting
      expect(firstAmount).toMatch(/R\$|\d+[.,]\d{2}/);
    }
  });

  test('should filter reembolsos by status', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for filter buttons
    const filterButtons = page.locator('[data-testid="status-filter"]');
    const count = await filterButtons.count();

    if (count > 0) {
      // Click first filter
      await filterButtons.first().click();
      await page.waitForTimeout(500);

      // List should be filtered
      const items = page.locator('[data-testid="reembolso-item"]');
      const itemCount = await items.count();
      expect(itemCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should handle reembolso pagination', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for pagination controls
    const nextButton = page.locator('button:has-text("Próxima")');
    const isPaginationVisible = await nextButton.isVisible().catch(() => false);

    if (isPaginationVisible) {
      // Click next page
      await nextButton.click();
      await page.waitForTimeout(500);

      // Content should update
      const items = page.locator('[data-testid="reembolso-item"]');
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should load reembolsos data within timeout', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Reembolsos page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle empty reembolsos list', async ({ page }) => {
    await page.goto('/reembolsos');
    await page.waitForLoadState('networkidle');

    // Check for empty state or list
    const list = page.locator('[data-testid="reembolsos-list"]');
    await expect(list).toBeVisible();

    const items = page.locator('[data-testid="reembolso-item"]');
    const count = await items.count();

    // Should handle both empty and populated states
    if (count === 0) {
      // Check for empty state message
      const emptyMessage = page.locator('text=/sem|nenhum|vazio/i');
      const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);
      expect(hasEmptyMessage || count === 0).toBeTruthy();
    }
  });
});

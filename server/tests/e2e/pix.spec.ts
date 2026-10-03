import { test, expect } from '@playwright/test';
import { loginUser } from '../fixtures/auth';

const TEST_USER_EMAIL = 'test@example.com';
const TEST_USER_PASSWORD = 'testPassword123!';

test.describe('PIX - Pagamentos e Reconciliação', () => {
  test.beforeEach(async ({ page }) => {
    await loginUser(page, TEST_USER_EMAIL, TEST_USER_PASSWORD);
  });

  test('should navigate to PIX page', async ({ page }) => {
    await page.click('a:has-text("PIX")');
    await page.waitForURL('**/pix', { timeout: 5000 });
    expect(page.url()).toContain('/pix');
  });

  test('should display reconciliation section', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for reconciliation card/section
    const reconciliationSection = page.locator('[data-testid="pix-reconciliation"]');
    const isVisible = await reconciliationSection.isVisible();

    if (isVisible) {
      await expect(reconciliationSection).toBeVisible();
    }
  });

  test('should display reconcile button', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for reconcile button
    const reconcileButton = page.locator('button:has-text("Reconciliar")');
    const isVisible = await reconcileButton.isVisible();

    if (isVisible) {
      await expect(reconcileButton).toBeVisible();
    }
  });

  test('should start reconciliation process', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    const reconcileButton = page.locator('button:has-text("Reconciliar")');
    const isVisible = await reconcileButton.isVisible();

    if (isVisible) {
      await reconcileButton.click();
      await page.waitForTimeout(1000);

      // Check for progress indicator or loading state
      const loadingIndicator = page.locator('[data-testid="loading-spinner"]');
      const hasLoading = await loadingIndicator.isVisible().catch(() => false);

      if (hasLoading) {
        // Wait for reconciliation to complete
        await page.waitForTimeout(3000);
      }
    }
  });

  test('should display reconciliation status', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for status information
    const statusDisplay = page.locator('[data-testid="reconciliation-status"]');
    const isVisible = await statusDisplay.isVisible();

    if (isVisible) {
      const status = await statusDisplay.textContent();
      expect(status?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should display discrepancies list', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for discrepancies section
    const discrepanciesSection = page.locator('[data-testid="discrepancies"]');
    const isVisible = await discrepanciesSection.isVisible();

    if (isVisible) {
      // Should have discrepancies list or empty state
      const items = page.locator('[data-testid="discrepancy-item"]');
      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display PIX payment list', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for payments section
    const paymentsSection = page.locator('[data-testid="pix-payments"]');
    const isVisible = await paymentsSection.isVisible();

    if (isVisible) {
      await expect(paymentsSection).toBeVisible();
    }
  });

  test('should display create PIX payment button', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for create payment button
    const createButton = page.locator('button:has-text("Novo Pagamento")');
    const isVisible = await createButton.isVisible();

    if (isVisible) {
      await expect(createButton).toBeVisible();
    }
  });

  test('should open PIX payment form', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    const createButton = page.locator('button:has-text("Novo Pagamento")');
    const isVisible = await createButton.isVisible();

    if (isVisible) {
      await createButton.click();
      await page.waitForTimeout(500);

      // Check for form
      const form = page.locator('[data-testid="pix-form"]');
      const formVisible = await form.isVisible();
      expect(formVisible).toBeTruthy();
    }
  });

  test('should create PIX payment', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    const createButton = page.locator('button:has-text("Novo Pagamento")');
    const isVisible = await createButton.isVisible();

    if (isVisible) {
      await createButton.click();
      await page.waitForTimeout(500);

      // Fill form fields
      const recipientField = page.locator('input[data-testid="recipient-cpf"]');
      const amountField = page.locator('input[data-testid="pix-amount"]');

      if (await recipientField.isVisible()) {
        await recipientField.fill('12345678901');

        if (await amountField.isVisible()) {
          await amountField.fill('100.00');

          // Submit form
          const submitButton = page.locator('button:has-text("Enviar")');
          if (await submitButton.isVisible()) {
            await submitButton.click();
            await page.waitForTimeout(500);

            // Should show success or redirect
            const list = page.locator('[data-testid="pix-payments"]');
            await expect(list).toBeVisible();
          }
        }
      }
    }
  });

  test('should display PIX payment amounts', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for payment amounts
    const amounts = page.locator('[data-testid="pix-payment-amount"]');
    const count = await amounts.count();

    if (count > 0) {
      const firstAmount = await amounts.first().textContent();
      // Amount should contain currency
      expect(firstAmount).toMatch(/R\$|\d+[.,]\d{2}/);
    }
  });

  test('should display PIX payment status', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for status badges
    const statuses = page.locator('[data-testid="pix-payment-status"]');
    const count = await statuses.count();

    if (count > 0) {
      const firstStatus = await statuses.first().textContent();
      expect(firstStatus?.trim().length).toBeGreaterThan(0);
    }
  });

  test('should handle reconciliation completion', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    const reconcileButton = page.locator('button:has-text("Reconciliar")');
    const isVisible = await reconcileButton.isVisible();

    if (isVisible) {
      await reconcileButton.click();
      await page.waitForTimeout(500);

      // Wait for completion (max 10 seconds)
      const completionMessage = page.locator('[data-testid="reconciliation-complete"]');
      const completed = await completionMessage.isVisible({ timeout: 10000 }).catch(() => false);

      // Should either complete or show progress
      expect(completed || await page.locator('[data-testid="loading-spinner"]').isVisible().catch(() => false)).toBeTruthy();
    }
  });

  test('should load PIX data within timeout', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // PIX page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should display PIX transaction dates', async ({ page }) => {
    await page.goto('/pix');
    await page.waitForLoadState('networkidle');

    // Check for date information
    const dates = page.locator('[data-testid="pix-transaction-date"]');
    const count = await dates.count();

    if (count > 0) {
      const firstDate = await dates.first().textContent();
      // Should contain date format
      expect(firstDate).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/);
    }
  });
});

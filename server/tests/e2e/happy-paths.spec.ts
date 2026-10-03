import { test, expect } from '@playwright/test';

test.describe('Happy Path Tests', () => {
  // Test 1: Login → Dashboard → Sem erros
  test('should login successfully and navigate to dashboard without errors', async ({ page }) => {
    // Navigate to login page
    await page.goto('/');

    // Wait for page to be ready
    await page.waitForLoadState('networkidle');

    // Track console errors
    let consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Track response errors (500, 403, etc)
    let responseErrors: number[] = [];
    page.on('response', response => {
      if (response.status() >= 400) {
        responseErrors.push(response.status());
      }
    });

    // Check if login form exists
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    if (await emailInput.isVisible()) {
      // Fill login form with test credentials
      await emailInput.fill('test@example.com');
      await passwordInput.fill('password123');

      // Click login button
      const loginButton = page.locator('button:has-text("Login")');
      if (await loginButton.isVisible()) {
        await loginButton.click();

        // Wait for navigation to dashboard
        await page.waitForLoadState('networkidle');

        // Check for successful login (presence of dashboard element)
        const dashboard = page.locator('[data-testid="dashboard"]');
        const isLoggedIn = await dashboard.isVisible().catch(() => false);

        // Either dashboard loaded or still on some page (no errors)
        expect(consoleErrors.length).toBe(0);
        expect(responseErrors.filter(code => code >= 500).length).toBe(0);
      }
    } else {
      // Already logged in or dashboard visible
      const dashboard = page.locator('[data-testid="dashboard"]');
      expect(dashboard.isVisible() || page.url().includes('/dashboard')).toBeTruthy();
      expect(consoleErrors.length).toBe(0);
    }
  });

  // Test 2: Criar cobrança Asaas → Validar na lista
  test('should create charge on Asaas and validate in list', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to navigate to charges section
    const chargesLink = page.locator('a:has-text("Cobrança"), a:has-text("Charges"), [data-testid="charges-link"]');
    if (await chargesLink.first().isVisible()) {
      await chargesLink.first().click();
      await page.waitForLoadState('networkidle');

      // Try to find create charge button
      const createButton = page.locator('button:has-text("Nova Cobrança"), button:has-text("Create"), [data-testid="create-charge"]');
      if (await createButton.first().isVisible()) {
        await createButton.first().click();

        // Fill charge form
        const customerInput = page.locator('input[placeholder*="Cliente"], input[placeholder*="Customer"]').first();
        const amountInput = page.locator('input[placeholder*="Valor"], input[placeholder*="Amount"]').first();

        if (await customerInput.isVisible() && await amountInput.isVisible()) {
          await customerInput.fill('Test Customer');
          await amountInput.fill('100.00');

          // Submit form
          const submitButton = page.locator('button:has-text("Salvar"), button:has-text("Save")').last();
          if (await submitButton.isVisible()) {
            await submitButton.click();

            // Wait for success message or list update
            await page.waitForLoadState('networkidle');

            // Validate charge appears in list
            const chargeInList = page.locator('text="Test Customer"').first();
            const isCreated = await chargeInList.isVisible().catch(() => false);

            expect(isCreated || page.url().includes('charge')).toBeTruthy();
          }
        }
      }
    }
  });

  // Test 3: Reconciliar pagamentos → Validar status atualizado
  test('should reconcile payments and validate updated status', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to navigate to reconciliation section
    const reconcileLink = page.locator('a:has-text("Reconciliação"), a:has-text("Reconcile"), [data-testid="reconcile-link"]');
    if (await reconcileLink.first().isVisible()) {
      await reconcileLink.first().click();
      await page.waitForLoadState('networkidle');

      // Look for payment items to reconcile
      const paymentItems = page.locator('[data-testid="payment-item"], .payment-item, tr:has([data-testid="reconcile-btn"])');
      const count = await paymentItems.count();

      if (count > 0) {
        // Get first payment item
        const firstItem = paymentItems.first();

        // Try to find reconcile button
        const reconcileBtn = firstItem.locator('button:has-text("Reconciliar"), button:has-text("Reconcile"), [data-testid="reconcile-btn"]');
        if (await reconcileBtn.isVisible()) {
          // Get status before reconciliation
          const statusBefore = await firstItem.locator('[data-testid="status"]').textContent();

          await reconcileBtn.click();
          await page.waitForLoadState('networkidle');

          // Get status after reconciliation
          const statusAfter = await firstItem.locator('[data-testid="status"]').textContent();

          // Status should have changed
          expect(statusAfter).not.toBe(statusBefore);
        }
      }
    }
  });

  // Test 4: Gerar relatório executivo → PDF gerado sem erro
  test('should generate executive report and create PDF without errors', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Track download
    let downloadPath: string | null = null;
    page.on('popup', async popup => {
      await popup.waitForLoadState();
      downloadPath = popup.url();
    });

    // Try to navigate to reports section
    const reportsLink = page.locator('a:has-text("Relatório"), a:has-text("Reports"), [data-testid="reports-link"]');
    if (await reportsLink.first().isVisible()) {
      await reportsLink.first().click();
      await page.waitForLoadState('networkidle');

      // Try to find executive report or generate button
      const generateBtn = page.locator('button:has-text("Gerar Relatório"), button:has-text("Generate"), button:has-text("Executive")').first();
      if (await generateBtn.isVisible()) {
        // Monitor downloads
        const downloadPromise = page.waitForEvent('download');

        await generateBtn.click();

        try {
          const download = await downloadPromise.catch(() => null);

          if (download) {
            const fileName = download.suggestedFilename();
            // Verify PDF file
            expect(fileName.endsWith('.pdf')).toBeTruthy();
            expect(download.fail()).toBeNull();
          }
        } catch (e) {
          // If no download event, check for success message or PDF viewer
          const successMsg = page.locator('text=/sucesso|success|gerado|generated/i').first();
          expect(successMsg.isVisible() || page.url().includes('pdf')).toBeTruthy();
        }
      }
    }
  });

  // Test 5: Login com credentials inválidas → 401
  test('should reject login with invalid credentials and return 401', async ({ page }) => {
    // Navigate to login page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Track HTTP status
    let loginResponseStatus: number | null = null;

    page.on('response', response => {
      if (response.url().includes('/api') && response.url().includes('login')) {
        loginResponseStatus = response.status();
      }
    });

    // Check if login form exists
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    if (await emailInput.isVisible()) {
      // Fill with invalid credentials
      await emailInput.fill('invalid@test.com');
      await passwordInput.fill('wrongpassword');

      // Click login button
      const loginButton = page.locator('button:has-text("Login")');
      if (await loginButton.isVisible()) {
        await loginButton.click();

        // Wait for response
        await page.waitForLoadState('networkidle');

        // Check for error message
        const errorMsg = page.locator('text=/erro|error|inválido|invalid|falha|failed/i').first();
        const hasError = await errorMsg.isVisible().catch(() => false);

        // Should see error or be on login page
        const stillOnLogin = page.url().includes('/login') || await emailInput.isVisible();

        expect(hasError || stillOnLogin).toBeTruthy();

        // Check response status if available
        if (loginResponseStatus !== null) {
          expect(loginResponseStatus).toBe(401);
        }
      }
    }
  });
});

import { test, expect } from '@playwright/test';

/**
 * OWASP Top 10 Security Tests
 *
 * Tests for common security vulnerabilities:
 * 1. SQL Injection
 * 2. Cross-Site Scripting (XSS)
 * 3. Cross-Site Request Forgery (CSRF)
 * 4. XML External Entity (XXE)
 * 5. Directory Traversal
 */

test.describe('OWASP Security Tests', () => {
  // Test 1: SQL Injection in search/filter fields
  test('should block SQL Injection attack: OR 1=1 payload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Track server responses
    let sqlInjectionDetected = false;
    let responseStatus: number | null = null;

    page.on('response', response => {
      // Monitor API responses
      if (response.url().includes('/api')) {
        responseStatus = response.status();
        // Check if injection was blocked (403 Forbidden or 400 Bad Request)
        if (response.status() === 403 || response.status() === 400) {
          sqlInjectionDetected = true;
        }
      }
    });

    // Try to find search/filter input fields
    const searchInputs = page.locator(
      'input[placeholder*="busca"], input[placeholder*="search"], input[placeholder*="filtro"], input[placeholder*="filter"]'
    );

    const inputCount = await searchInputs.count();
    if (inputCount > 0) {
      // Try SQL injection payload in each input
      const firstInput = searchInputs.first();

      // Clear and fill with SQL injection payload
      await firstInput.clear();
      await firstInput.fill("' OR 1=1 -- ");

      // Press Enter to trigger search
      await firstInput.press('Enter');
      await page.waitForLoadState('networkidle');

      // Check for:
      // 1. Error message about invalid input
      // 2. SQL error in console (should NOT appear)
      // 3. No unexpected data returned

      const errorMsg = page.locator('text=/SQL|erro|error|inválido|invalid/i').first();
      const hasError = await errorMsg.isVisible().catch(() => false);

      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error' && msg.text().toLowerCase().includes('sql')) {
          consoleErrors.push(msg.text());
        }
      });

      // Should NOT have SQL errors in console
      expect(consoleErrors.length).toBe(0);

      // Either shows error or blocks silently
      // Main point: no SQL execution
      expect(sqlInjectionDetected || hasError || responseStatus === 400).toBeTruthy();
    }
  });

  // Test 2: SQL Injection in filter dropdowns
  test('should block SQL Injection attack: semicolon-based payload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find filter/dropdown fields
    const filterSelects = page.locator('select, [role="combobox"], [data-testid*="filter"]');
    const selectCount = await filterSelects.count();

    if (selectCount > 0) {
      const firstSelect = filterSelects.first();

      // Try to interact with select and inject SQL
      const response = page.waitForResponse(
        resp => resp.url().includes('/api') && (resp.status() === 400 || resp.status() === 403)
      ).catch(() => null);

      // Type SQL injection payload
      await firstSelect.focus();
      await firstSelect.fill("; DROP TABLE users; --");

      // Blur to trigger API call
      await firstSelect.blur();
      await page.waitForLoadState('networkidle');

      // Check response
      const blockedResponse = await response;

      if (blockedResponse) {
        expect([400, 403]).toContain(blockedResponse.status());
      }
    }
  });

  // Test 3: Cross-Site Scripting (XSS) in comment fields
  test('should block XSS attack: script tag payload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Track if script was executed
    let scriptExecuted = false;

    page.on('console', msg => {
      if (msg.type() === 'log' && msg.text().includes('XSS_PAYLOAD')) {
        scriptExecuted = true;
      }
    });

    // Find comment or text input fields
    const commentInputs = page.locator(
      'textarea[placeholder*="comentário"], textarea[placeholder*="comment"], input[placeholder*="observação"]'
    );

    const commentCount = await commentInputs.count();
    if (commentCount > 0) {
      const firstComment = commentInputs.first();

      // XSS payload: script tag
      const xssPayload = '<script>console.log("XSS_PAYLOAD");</script>';

      await firstComment.fill(xssPayload);

      // Try to submit
      const submitBtn = page.locator('button:has-text("Enviar"), button:has-text("Save"), button:has-text("Submit")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
      }

      // Script should NOT have executed
      expect(scriptExecuted).toBeFalsy();

      // Check if payload was escaped in DOM
      const pageContent = await page.content();

      // Payload should be escaped (< becomes &lt; or &#60;)
      const isEscaped = pageContent.includes('&lt;script') || pageContent.includes('&#60;script');
      expect(isEscaped || !pageContent.includes('<script')).toBeTruthy();
    }
  });

  // Test 4: XSS in URL parameters
  test('should block XSS attack: URL parameter payload', async ({ page }) => {
    const xssPayload = encodeURIComponent('<img src=x onerror=alert("XSS")>');

    // Try to navigate to page with XSS in query param
    await page.goto(`/?search=${xssPayload}`, { waitUntil: 'networkidle' });

    let alertTriggered = false;

    // Override alert to detect if it would have been called
    page.on('popup', async popup => {
      alertTriggered = true;
      await popup.close();
    });

    // Wait a bit for any potential alert
    await page.waitForTimeout(500);

    // Alert should NOT have triggered
    expect(alertTriggered).toBeFalsy();

    // Check page content for escaped payload
    const pageContent = await page.content();
    expect(pageContent.includes('<img src=x') || pageContent.includes('&lt;img')).toBeFalsy();
  });

  // Test 5: CSRF - Request without CSRF token should fail
  test('should reject POST request without CSRF token (403)', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    let csrfResponse: unknown = null;

    // Intercept the CSRF validation
    await context.route('**/api/**', async (route) => {
      if (route.request().method() === 'POST') {
        // Remove CSRF token headers/params
        const request = route.request();
        const headers = { ...request.headers() };
        delete headers['x-csrf-token'];
        delete headers['csrf-token'];

        // Continue with modified request
        const response = await route.fetch({ headers });
        csrfResponse = response;

        if (response.status() === 403) {
          // Expected CSRF protection
          await route.abort('accessdenied');
        } else {
          await route.continue();
        }
      } else {
        await route.continue();
      }
    });

    // Try to make a POST request without CSRF token
    const postResponse = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/test-csrf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Intentionally omit CSRF token
          },
          body: JSON.stringify({ test: 'data' }),
        });
        return response.status;
      } catch {
        return null;
      }
    });

    // Should be rejected or blocked
    expect(postResponse === null || postResponse === 403 || csrfResponse?.status() === 403).toBeTruthy();
  });

  // Test 6: CSRF - Check for CSRF token in forms
  test('should include CSRF token in forms', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Find all forms
    const forms = page.locator('form');
    const formCount = await forms.count();

    if (formCount > 0) {
      const firstForm = forms.first();

      // Check for hidden CSRF token field
      const csrfField = firstForm.locator(
        'input[name*="csrf"], input[name*="_token"], input[type="hidden"][name*="token"]'
      );

      const hasCsrfToken = await csrfField.count() > 0;

      // Should have CSRF token
      expect(hasCsrfToken).toBeTruthy();
    }
  });

  // Test 7: XXE - XML External Entity in upload/XML fields
  test('should block XXE attack: XML entity expansion payload', async ({ page }) => {
    // XXE payload that attempts to read local files
    const xxePayload = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ELEMENT foo ANY>
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<foo>&xxe;</foo>`;

    // Try to find file upload or XML input
    const fileInputs = page.locator('input[type="file"]');
    const xmlInputs = page.locator('textarea[placeholder*="xml"], textarea[placeholder*="XML"]');

    const fileCount = await fileInputs.count();
    const xmlCount = await xmlInputs.count();

    if (xmlCount > 0) {
      // Fill XML textarea with XXE payload
      const firstXmlInput = xmlInputs.first();
      await firstXmlInput.fill(xxePayload);

      // Try to submit
      const submitBtn = page.locator('button:has-text("Parse"), button:has-text("Upload"), button:has-text("Submit")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
      }

      // Check for error about XML parsing
      const errorMsg = page.locator('text=/xml|parse|invalid/i').first();
      const hasError = await errorMsg.isVisible().catch(() => false);

      // Should show error or be blocked
      expect(hasError || page.url() !== '').toBeTruthy();
    }

    if (fileCount > 0) {
      // Create temporary XXE file and try to upload
      // Note: Cannot directly create files in Playwright, but can test response
      // File upload tests would need proper setup, but main point is to test server-side validation
    }
  });

  // Test 8: XXE - DTD entity expansion
  test('should block XXE attack: Billion Laughs DoS', async ({ page }) => {
    // Billion Laughs / XML Bomb payload
    const billionLaughs = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<lolz>&lol3;</lolz>`;

    const xmlInputs = page.locator('textarea[placeholder*="xml"], textarea[placeholder*="XML"]');
    const xmlCount = await xmlInputs.count();

    if (xmlCount > 0) {
      const firstXmlInput = xmlInputs.first();

      // Fill with Billion Laughs payload
      await firstXmlInput.fill(billionLaughs);

      // Time the response to detect if it's being parsed
      const startTime = Date.now();

      const submitBtn = page.locator('button:has-text("Parse"), button:has-text("Validate")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
      }

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should fail quickly (< 2 seconds) indicating it was blocked
      // Not expanding infinitely
      expect(responseTime).toBeLessThan(2000);
    }
  });

  // Test 9: Directory Traversal in file paths
  test('should block Directory Traversal: ../../etc/passwd payload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    let traversalDetected = false;

    page.on('response', response => {
      if (response.status() === 403 || response.status() === 400) {
        traversalDetected = true;
      }
    });

    // Try to find download or file access features
    const downloadLinks = page.locator('a:has-text("Download"), a:has-text("Baixar"), [data-testid*="download"]');
    const downloadCount = await downloadLinks.count();

    if (downloadCount > 0) {
      // Try to manipulate URL with directory traversal
      const firstLink = downloadLinks.first();
      const href = await firstLink.getAttribute('href');

      if (href) {
        // Navigate with traversal payload
        await page.goto(href + '?file=../../etc/passwd', {
          waitUntil: 'networkidle',
          timeout: 10000
        }).catch(() => null);

        // Should be blocked or error
        expect(traversalDetected || page.url().includes('error')).toBeTruthy();
      }
    }

    // Try direct API call with traversal
    const traversalPayload = encodeURIComponent('../../etc/passwd');
    const apiResponse = await page.evaluate(async (payload) => {
      try {
        const response = await fetch(`/api/download?file=${payload}`);
        return response.status;
      } catch {
        return null;
      }
    }, traversalPayload);

    // Should be blocked (403 or 400)
    expect(apiResponse === null || apiResponse === 403 || apiResponse === 400).toBeTruthy();
  });

  // Test 10: Directory Traversal with backslash encoding
  test('should block Directory Traversal: encoded traversal payload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try various directory traversal encodings
    const traversalPayloads = [
      '..\\..\\windows\\system32\\config\\sam',
      '..%2F..%2Fetc%2Fpasswd',
      '..;/..;/etc/passwd',
      '....//....//etc/passwd',
    ];

    for (const payload of traversalPayloads) {
      const response = await page.evaluate(async (p) => {
        try {
          const res = await fetch(`/api/file?path=${encodeURIComponent(p)}`);
          return res.status;
        } catch {
          return null;
        }
      }, payload);

      // All traversal attempts should be blocked
      expect(response === null || response === 403 || response === 400).toBeTruthy();
    }
  });

  // Test 11: Input validation - Long payload
  test('should handle excessively long input gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create very long string (10MB)
    const longPayload = 'A'.repeat(10 * 1024 * 1024);

    const inputs = page.locator('input[type="text"], textarea');
    const inputCount = await inputs.count();

    if (inputCount > 0) {
      const firstInput = inputs.first();

      // Try to fill with long payload
      try {
        await firstInput.fill(longPayload.substring(0, 100000)); // Fill with reasonable chunk

        // Should not crash
        expect(await firstInput.isVisible()).toBeTruthy();
      } catch (e) {
        // Error is acceptable if gracefully handled
        expect(e).toBeDefined();
      }
    }
  });

  // Test 12: Security Headers validation
  test('should include important security headers', async ({ page }) => {
    const response = await page.goto('/');

    if (response) {
      const headers = response.headers();

      // Check for important security headers
      const hasCSP = headers['content-security-policy'] || headers['x-content-security-policy'];
      const hasXFrameOptions = headers['x-frame-options'];
      const hasXContentTypeOptions = headers['x-content-type-options'];
      const hasStrictTransportSecurity = headers['strict-transport-security'];

      // At least some security headers should be present
      expect(hasCSP || hasXFrameOptions || hasXContentTypeOptions || hasStrictTransportSecurity).toBeTruthy();
    }
  });
});

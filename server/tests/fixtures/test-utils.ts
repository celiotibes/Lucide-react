import { Page, expect } from '@playwright/test';

/**
 * Wait for network idle after user action
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Take screenshot for debugging
 */
export async function takeScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await page.screenshot({ path: `test-results/screenshots/${name}-${timestamp}.png` });
}

/**
 * Check if element contains text
 */
export async function elementContainsText(page: Page, selector: string, text: string) {
  const element = page.locator(selector);
  await expect(element).toContainText(text);
}

/**
 * Get all text from multiple elements
 */
export async function getElementsText(page: Page, selector: string): Promise<string[]> {
  const elements = page.locator(selector);
  const count = await elements.count();
  const texts: string[] = [];

  for (let i = 0; i < count; i++) {
    const text = await elements.nth(i).textContent();
    if (text) texts.push(text.trim());
  }

  return texts;
}

/**
 * Wait for element with retry logic
 */
export async function waitForElement(
  page: Page,
  selector: string,
  maxRetries = 3,
  delayMs = 500
) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await page.waitForSelector(selector, { timeout: 2000 });
      return true;
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await page.waitForTimeout(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Mock API response
 */
export async function mockApiResponse(
  page: Page,
  urlPattern: string,
  responseData: Record<string, unknown>,
  statusCode = 200
) {
  await page.route(urlPattern, (route) => {
    route.abort('blockedbyclient');
  });

  await page.route(urlPattern, (route) => {
    route.continue();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    route.fetch().then((_response) => {
      route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    });
  });
}

/**
 * Get localStorage value
 */
export async function getLocalStorage(page: Page, key: string): Promise<string | null> {
  return await page.evaluate(([storageKey]) => {
    return window.localStorage.getItem(storageKey);
  }, [key]);
}

/**
 * Set localStorage value
 */
export async function setLocalStorage(page: Page, key: string, value: string) {
  await page.evaluate(([storageKey, storageValue]) => {
    window.localStorage.setItem(storageKey, storageValue);
  }, [key, value]);
}

/**
 * Clear localStorage
 */
export async function clearLocalStorage(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear();
  });
}

/**
 * Check if element has class
 */
export async function hasClass(page: Page, selector: string, className: string): Promise<boolean> {
  return await page.evaluate(
    ([sel, cls]) => {
      const element = document.querySelector(sel);
      return element?.classList.contains(cls) ?? false;
    },
    [selector, className]
  );
}

/**
 * Fill form field with validation
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string,
  waitForReady = true
) {
  const field = page.locator(selector);

  if (waitForReady) {
    await field.waitFor({ state: 'visible' });
  }

  await field.clear();
  await field.fill(value);
  await field.blur();
}

/**
 * Submit form and wait for result
 */
export async function submitForm(
  page: Page,
  formSelector: string,
  buttonSelector = 'button[type="submit"]'
) {
  const submitButton = page.locator(`${formSelector} ${buttonSelector}`);
  await submitButton.click();

  // Wait for either success or error message
  await Promise.race([
    page.waitForSelector('[role="alert"]', { timeout: 5000 }).catch(() => null),
    page.waitForLoadState('networkidle').catch(() => null),
  ]);
}

/**
 * Extract table data
 */
export async function getTableData(page: Page, tableSelector: string) {
  return await page.evaluate((selector) => {
    const table = document.querySelector(selector);
    if (!table) return null;

    const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent?.trim() || '');
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(row =>
      Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() || '')
    );

    return { headers, rows };
  }, tableSelector);
}

/**
 * Get chart data (for charts built with Recharts or similar)
 */
export async function getChartData(page: Page, chartSelector: string) {
  return await page.evaluate((selector) => {
    const chart = document.querySelector(selector);
    if (!chart) return null;

    // Extract data points from SVG elements
    const dataPoints = Array.from(chart.querySelectorAll('[data-value]')).map(el => ({
      value: el.getAttribute('data-value'),
      label: el.getAttribute('data-label'),
    }));

    return dataPoints;
  }, chartSelector);
}

/**
 * Measure performance of an action
 */
export async function measurePerformance(
  page: Page,
  action: (p: Page) => Promise<void>,
  label = 'Action'
): Promise<number> {
  const startTime = Date.now();
  await action(page);
  const endTime = Date.now();

  const duration = endTime - startTime;
  console.log(`${label} took ${duration}ms`);

  return duration;
}

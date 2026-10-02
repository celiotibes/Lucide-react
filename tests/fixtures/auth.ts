import { Page } from '@playwright/test';

export async function loginUser(page: Page, email: string, password: string) {
  await page.goto('/');

  // Wait for the page to load
  await page.waitForLoadState('networkidle');

  // Find and fill login form
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // Click login button
  await page.click('button:has-text("Entrar")');

  // Wait for redirect to dashboard
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

export async function checkAuthToken(page: Page): Promise<string | null> {
  const localStorage = await page.evaluate(() => {
    return window.localStorage.getItem('authToken');
  });
  return localStorage;
}

export async function logout(page: Page) {
  // Click user menu
  await page.click('[data-testid="user-menu"]');

  // Click logout button
  await page.click('button:has-text("Sair")');

  // Wait for redirect to login
  await page.waitForURL('/', { timeout: 5000 });
}

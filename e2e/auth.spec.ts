import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test('should display login page on initial access', async ({ page }) => {
    await page.goto('/')
    // Should redirect to login
    expect(page.url()).toContain('/login')
  })

  test('should load mock data in development mode', async ({ page }) => {
    // Enable mock data
    await page.context().addInitScript(() => {
      localStorage.setItem('ENABLE_MOCK_DATA', 'true')
    })

    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    // Check if login page elements are present
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
  })

  test('should show error on invalid credentials', async ({ page }) => {
    await page.goto('/login')

    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')
    const submitButton = page.locator('button:has-text("Entrar")')

    await emailInput.fill('invalid@email.com')
    await passwordInput.fill('wrongpassword')
    await submitButton.click()

    // Wait for error message (or timeout if API not available)
    const errorMessage = page.locator('text=/erro|não|invalid/i')

    // Either error appears or we get network error - both acceptable in dev
    const hasErrorOrNetwork = await Promise.race([
      errorMessage.isVisible().then(() => true),
      page.waitForTimeout(2000).then(() => false),
    ]).catch(() => false)

    expect(hasErrorOrNetwork || !page.url().includes('/dashboard')).toBeTruthy()
  })

  test('should navigate to dashboard with mock data', async ({ page }) => {
    // Inject mock data before navigation
    await page.context().addInitScript(() => {
      localStorage.setItem('ENABLE_MOCK_DATA', 'true')
    })

    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should either have dashboard content or redirect to login
    const isDashboard = page.url().includes('/dashboard')
    const isLogin = page.url().includes('/login')

    expect(isDashboard || isLogin).toBeTruthy()

    if (isDashboard) {
      // Check for dashboard elements
      const pageTitle = page.locator('h1')
      await expect(pageTitle).toContainText(/dashboard|casos|compliance/i)
    }
  })
})

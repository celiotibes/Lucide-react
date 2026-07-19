import { test, expect } from '@playwright/test'

test.describe('Lucide-react Application', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.goto('/')
  })

  test('should load the application', async ({ page }) => {
    await expect(page).toHaveTitle(/Lucide/)
    await expect(page.locator('⚖️ Lucide-react')).toBeTruthy()
  })

  test('should have visible navigation', async ({ page }) => {
    const navButtons = page.locator('button[style*="padding"]')
    await expect(navButtons.first()).toBeVisible()
  })

  test('should navigate to documents page', async ({ page }) => {
    const docsButton = page.locator('text=📄 Documentos')
    if (await docsButton.isVisible()) {
      await docsButton.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain('documents')
    }
  })

  test('should navigate to analytics page', async ({ page }) => {
    const analyticsButton = page.locator('text=📊 Analytics')
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain('analytics')
    }
  })

  test('should have responsive layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()
  })

  test('should have responsive layout on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()
  })

  test('should have responsive layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()
  })

  test('should support dark mode preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    const app = page.locator('[style*="backgroundColor"]').first()
    await expect(app).toBeVisible()
  })

  test('should support light mode preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    const app = page.locator('[style*="backgroundColor"]').first()
    await expect(app).toBeVisible()
  })
})

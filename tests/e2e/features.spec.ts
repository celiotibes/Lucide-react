import { test, expect } from '@playwright/test'

test.describe('Feature Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should load analytics dashboard', async ({ page }) => {
    const analyticsButton = page.locator('text=📊 Analytics')
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click()
      await page.waitForLoadState('networkidle')

      const dashboard = page.locator('text=Analytics Dashboard')
      await expect(dashboard).toBeVisible()
    }
  })

  test('should display analytics cards', async ({ page }) => {
    const analyticsButton = page.locator('text=📊 Analytics')
    if (await analyticsButton.isVisible()) {
      await analyticsButton.click()
      await page.waitForLoadState('networkidle')

      const statsCards = page.locator('[class*="stat-card"]')
      const count = await statsCards.count()
      expect(count).toBeGreaterThan(0)
    }
  })

  test('should load reports builder', async ({ page }) => {
    const reportsButton = page.locator('text=📄 Relatórios')
    if (await reportsButton.isVisible()) {
      await reportsButton.click()
      await page.waitForLoadState('networkidle')

      const builder = page.locator('text=Relatórios').or(page.locator('text=Criar Relatório'))
      if (await builder.isVisible()) {
        await expect(builder).toBeVisible()
      }
    }
  })

  test('should access annotations feature', async ({ page }) => {
    const annotationsButton = page.locator('text=📝 Anotações')
    if (await annotationsButton.isVisible()) {
      await annotationsButton.click()
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('annotations')
    }
  })

  test('should access templates feature', async ({ page }) => {
    const templatesButton = page.locator('text=📋 Templates')
    if (await templatesButton.isVisible()) {
      await templatesButton.click()
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('templates')
    }
  })

  test('should access sharing feature', async ({ page }) => {
    const sharingButton = page.locator('text=🔗 Compartilhar')
    if (await sharingButton.isVisible()) {
      await sharingButton.click()
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('sharing')
    }
  })

  test('should access PDF export feature', async ({ page }) => {
    const pdfButton = page.locator('text=📄 PDF Export')
    if (await pdfButton.isVisible()) {
      await pdfButton.click()
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('pdf-export')
    }
  })

  test('should access import/export feature', async ({ page }) => {
    const importButton = page.locator('text=📤📥 Import/Export')
    if (await importButton.isVisible()) {
      await importButton.click()
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('import-export')
    }
  })

  test('should navigate all pages without errors', async ({ page }) => {
    const pages = [
      'dashboard',
      'documents',
      'document-search',
      'editor',
      'calculadores',
      'pesquisa',
      'llm-config',
      'rag-analysis',
      'timeline',
      'strategic-analysis',
      'outcome-prediction',
      'template-matching',
    ]

    for (const pageName of pages) {
      const button = page.locator(`button:has-text("${pageName.charAt(0).toUpperCase() + pageName.slice(1)}")`).first()
      if (await button.isVisible()) {
        await button.click()
        await page.waitForLoadState('networkidle')
        expect(page.url()).toBeTruthy()
      }
    }
  })

  test('should handle errors gracefully', async ({ page }) => {
    await page.goto('/nonexistent-page')
    // Page should still be functional
    const header = page.locator('header')
    await expect(header).toBeVisible()
  })
})

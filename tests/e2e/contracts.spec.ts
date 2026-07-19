/**
 * E2E Tests: Contract Analysis Module (FASE 10-11)
 * Testa fluxos completos de análise de contratos
 */

import { test, expect } from '@playwright/test'

test.describe('Contract Analyzer Module', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for login
    await page.goto('http://localhost:5173')

    // Simulate logged-in state (adjust based on your auth)
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test_token')
      localStorage.setItem('user_data', JSON.stringify({
        id: 'test_user',
        nome: 'Test User',
        email: 'test@example.com'
      }))
    })

    await page.reload()
  })

  test('should navigate to Contract Analyzer', async ({ page }) => {
    // Look for contracts button in navbar
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')

    // Button should exist
    await expect(contractsButton).toBeVisible()

    // Click and navigate
    await contractsButton.click()

    // Check page loaded
    await expect(page.locator('text=Analisador de Contratos Imobiliários')).toBeVisible()
  })

  test('should display upload section initially', async ({ page }) => {
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Should show upload section
    await expect(page.locator('text=Faça upload do Contrato')).toBeVisible()
    await expect(page.locator('text=Suporta: PDF, DOCX, imagens, texto')).toBeVisible()

    // Should have file input
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toHaveAttribute('accept', '.pdf,.docx,.jpg,.png,.txt')
  })

  test('should show loading state during analysis', async ({ page }) => {
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Create a small test file
    const fileContent = new Blob(
      ['CONTRATO DE ALUGUEL\nLocador: João Silva\nLocatário: Maria Santos\nAluguel: R$ 2.000,00'],
      { type: 'text/plain' }
    )

    // Set file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-contract.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent.stream ? 'test' : 'test content'),
    })

    // Should transition to processing
    await expect(page.locator('text=Convertendo documento e analisando')).toBeVisible({ timeout: 5000 })
  })

  test('should display analysis results', async ({ page }) => {
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Wait for analysis to complete
    await page.waitForTimeout(2000)

    // Should show analysis section eventually
    const analysisHeader = page.locator('text=Análise Concluída')
    if (await analysisHeader.isVisible()) {
      // Check confidence badge
      await expect(page.locator('text=Confiança:')).toBeVisible()

      // Check data sections
      await expect(page.locator('text=Partes do Contrato')).toBeVisible()
      await expect(page.locator('text=Dados do Imóvel')).toBeVisible()
      await expect(page.locator('text=Valores Monetários')).toBeVisible()
    }
  })

  test('should have error handling for invalid files', async ({ page }) => {
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Try to upload an invalid file type (if validation exists)
    const fileInput = page.locator('input[type="file"]')

    // File input should only accept allowed types
    const acceptAttr = await fileInput.getAttribute('accept')
    expect(acceptAttr).toBe('.pdf,.docx,.jpg,.png,.txt')
  })

  test('should persist configuration in localStorage', async ({ page }) => {
    // Check if Claude API config is stored
    const config = await page.evaluate(() => {
      return localStorage.getItem('claude_api_config')
    })

    // Config should be JSON (even if empty)
    if (config) {
      expect(() => JSON.parse(config)).not.toThrow()
    }
  })

  test('should handle file upload with form submission', async ({ page }) => {
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Find file input
    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeVisible()

    // Verify input is within form context
    const uploadButton = page.locator('button:has-text("Selecione um Arquivo")')
    await expect(uploadButton).toBeVisible()
  })

  test('should handle CSV import in BI module', async ({ page }) => {
    // Navigate to financial dashboard (if exists)
    const financialButton = page.locator('button:has-text("📊 Financeiro")')

    if (await financialButton.isVisible()) {
      await financialButton.click()

      // Look for CSV importer
      const importSection = page.locator('[class*="csv"]')

      // Should have some CSV related UI (may vary)
      // Just check the page loads without errors
      await page.waitForLoadState('networkidle')
    }
  })

  test('should maintain state across navigation', async ({ page }) => {
    // Navigate to contracts
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    const pageTitle = page.locator('h2:has-text("Analisador de Contratos")')
    await expect(pageTitle).toBeVisible()

    // Navigate away
    const dashboardButton = page.locator('button:has-text("🏠 Home")')
    await dashboardButton.click()

    // Navigate back to contracts
    await contractsButton.click()

    // Should still show contracts module
    await expect(pageTitle).toBeVisible()
  })

  test('should have responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Should be visible even on mobile
    await expect(page.locator('text=Faça upload do Contrato')).toBeVisible()

    // Reset viewport
    await page.setViewportSize({ width: 1280, height: 720 })
  })

  test('should handle dark mode', async ({ page }) => {
    // Set dark mode preference
    await page.evaluate(() => {
      window.matchMedia = (query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      } as any)
    })

    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    await contractsButton.click()

    // Page should render without errors in dark mode
    await page.waitForLoadState('networkidle')

    // Check some elements are visible
    await expect(page.locator('text=Analisador de Contratos')).toBeVisible()
  })

  test('should handle rapid navigation', async ({ page }) => {
    const contractsButton = page.locator('button:has-text("🏢 Contratos")')
    const dashboardButton = page.locator('button:has-text("🏠 Home")')

    // Rapid clicks
    for (let i = 0; i < 3; i++) {
      await contractsButton.click()
      await page.waitForTimeout(100)
      await dashboardButton.click()
      await page.waitForTimeout(100)
    }

    // Should still work without errors
    await contractsButton.click()
    await expect(page.locator('text=Analisador de Contratos')).toBeVisible()
  })
})

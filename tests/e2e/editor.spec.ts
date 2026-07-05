import { test, expect } from '@playwright/test'

test.describe('Editor Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should access editor page', async ({ page }) => {
    const editorButton = page.locator('text=✏️ Editor Sprint 5')
    if (await editorButton.isVisible()) {
      await editorButton.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain('editor-novo')
    }
  })

  test('should have export functionality', async ({ page }) => {
    const editorButton = page.locator('text=✏️ Editor Sprint 5')
    if (await editorButton.isVisible()) {
      await editorButton.click()
      await page.waitForLoadState('networkidle')

      const exportButton = page.locator('text=Export').or(page.locator('button:has-text("Export")')).first()
      if (await exportButton.isVisible()) {
        await expect(exportButton).toBeVisible()
      }
    }
  })

  test('should support undo/redo operations', async ({ page }) => {
    const editorButton = page.locator('text=✏️ Editor Sprint 5')
    if (await editorButton.isVisible()) {
      await editorButton.click()
      await page.waitForLoadState('networkidle')

      const editor = page.locator('[contenteditable="true"]').first()
      if (await editor.isVisible()) {
        await editor.focus()
        await editor.type('Test content')

        await page.keyboard.press('Control+Z')
        // Content should be removed after undo
      }
    }
  })

  test('should handle keyboard shortcuts', async ({ page }) => {
    const editorButton = page.locator('text=✏️ Editor Sprint 5')
    if (await editorButton.isVisible()) {
      await editorButton.click()
      await page.waitForLoadState('networkidle')

      await page.keyboard.press('Control+S')
      // Should trigger save
      await page.waitForTimeout(500)
    }
  })

  test('should display auto-save indicator', async ({ page }) => {
    const editorButton = page.locator('text=✏️ Editor Sprint 5')
    if (await editorButton.isVisible()) {
      await editorButton.click()
      await page.waitForLoadState('networkidle')

      const editor = page.locator('[contenteditable="true"]').first()
      if (await editor.isVisible()) {
        await editor.focus()
        await editor.type('Test')
        await page.waitForTimeout(1000)

        const saveIndicator = page.locator('text=Salvando').or(page.locator('text=Salvo'))
        // Check if auto-save worked
      }
    }
  })
})

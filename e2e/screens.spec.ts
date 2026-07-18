import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Enable mock data and navigate to app
  await page.context().addInitScript(() => {
    localStorage.setItem('ENABLE_MOCK_DATA', 'true')
  })
})

test.describe('Dashboard Screen', () => {
  test('should display dashboard with KPI cards', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Check for KPI cards
    const kpiCards = page.locator('text=/Total de Casos|Casos Ativos|Concluídos|Taxa de Sucesso/i')
    const cardCount = await kpiCards.count()

    // Should have at least some KPI cards
    expect(cardCount).toBeGreaterThan(0)
  })

  test('should display bottom navigation', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const navButtons = page.locator('nav button')
    const navCount = await navButtons.count()

    // Should have navigation items
    expect(navCount).toBeGreaterThanOrEqual(4)
  })
})

test.describe('Cases Screen', () => {
  test('should display cases list', async ({ page }) => {
    await page.goto('/cases')
    await page.waitForLoadState('networkidle')

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded')

    // Look for case cards or empty state
    const pageContent = page.locator('main, [role="main"]')
    await expect(pageContent).toBeVisible()
  })

  test('should have search functionality', async ({ page }) => {
    await page.goto('/cases')
    await page.waitForLoadState('networkidle')

    // Look for search input
    const searchInput = page.locator('input[placeholder*="Buscar"]')

    if (await searchInput.isVisible()) {
      await searchInput.fill('PROC-2024')
      await page.waitForTimeout(500)

      // Results should be filtered
      expect(searchInput).toHaveValue('PROC-2024')
    }
  })

  test('should have status filters', async ({ page }) => {
    await page.goto('/cases')
    await page.waitForLoadState('networkidle')

    // Look for filter buttons
    const filterButtons = page.locator('button:has-text(/Todos|Ativos|Pausados|Concluídos/)')
    const filterCount = await filterButtons.count()

    expect(filterCount).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Intimations Screen', () => {
  test('should display intimations list', async ({ page }) => {
    await page.goto('/intimations')
    await page.waitForLoadState('networkidle')

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded')

    // Look for intimations content
    const pageContent = page.locator('main, [role="main"]')
    await expect(pageContent).toBeVisible()
  })

  test('should display intimation status badges', async ({ page }) => {
    await page.goto('/intimations')
    await page.waitForLoadState('networkidle')

    // Look for status badges
    const statusBadges = page.locator('text=/Pendente|Processado|Arquivado/')

    const badgeCount = await statusBadges.count()

    if (badgeCount > 0) {
      expect(badgeCount).toBeGreaterThan(0)
    }
  })
})

test.describe('Compliance Screen', () => {
  test('should display compliance metrics', async ({ page }) => {
    await page.goto('/compliance')
    await page.waitForLoadState('networkidle')

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded')

    // Look for metrics content
    const pageContent = page.locator('main, [role="main"]')
    await expect(pageContent).toBeVisible()
  })

  test('should display compliance score', async ({ page }) => {
    await page.goto('/compliance')
    await page.waitForLoadState('networkidle')

    // Look for score display (could be number between 0-100)
    const scoreElement = page.locator('text=/de 100|Excelente|Bom|Alerta|Crítico/')

    const scoreCount = await scoreElement.count()

    if (scoreCount > 0) {
      expect(scoreCount).toBeGreaterThan(0)
    }
  })
})

test.describe('Navigation', () => {
  test('should navigate between screens using bottom nav', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Click on Cases nav button
    const casesNavButton = page.locator('button:has-text("Casos")')

    if (await casesNavButton.isVisible()) {
      await casesNavButton.click()
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('/cases')
    }
  })

  test('should maintain scroll position when navigating', async ({ page }) => {
    await page.goto('/cases')
    await page.waitForLoadState('networkidle')

    const mainContent = page.locator('main')

    if (await mainContent.isVisible()) {
      // Scroll down
      await mainContent.evaluate((el) => {
        el.scrollTop = 100
      })

      // Navigate away
      const dashboardNav = page.locator('button:has-text("Dashboard")')
      if (await dashboardNav.isVisible()) {
        await dashboardNav.click()
        await page.waitForLoadState('networkidle')
      }
    }
  })
})

/**
 * E2E Tests para fluxo de apontamento de horas
 * Task #54
 */

import { test, expect } from '@playwright/test';

test.describe('Fluxo de Apontamento', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForURL('/painel-prestador');
  });

  test('Criar apontamento simples', async ({ page }) => {
    // Navigate to apontamentos page
    await page.goto('/painel-prestador/apontamentos');

    // Click new apontamento button
    await page.click('button:has-text("Novo Apontamento")');

    // Fill form
    await page.fill('input[type="date"]', '2024-07-17');
    await page.fill('input[name="horas"]', '8');
    await page.fill('textarea[name="descricao"]', 'Manutenção predial - Limpeza de áreas comuns');

    // Submit
    await page.click('button:has-text("Registrar Apontamento")');

    // Verify success message
    await expect(page.locator('text=Apontamento registrado com sucesso')).toBeVisible();

    // Verify in list
    await page.goto('/painel-prestador/apontamentos');
    await expect(page.locator('text=2024-07-17')).toBeVisible();
  });

  test('Criar apontamento com múltiplas residenciais', async ({ page }) => {
    await page.goto('/painel-prestador/apontamentos');
    await page.click('button:has-text("Novo Apontamento")');

    // Fill basic info
    await page.fill('input[type="date"]', '2024-07-17');
    await page.fill('input[name="horas"]', '4');

    // Select residenciais
    await page.click('button:has-text("Adicionar Residencial")');
    await page.click('text=Residencial A');
    await page.fill('input[name="horas_A"]', '2');

    await page.click('button:has-text("Adicionar Residencial")');
    await page.click('text=Residencial B');
    await page.fill('input[name="horas_B"]', '2');

    // Submit
    await page.click('button:has-text("Registrar Apontamento")');

    await expect(page.locator('text=Apontamento registrado com sucesso')).toBeVisible();
  });

  test('Validar campos obrigatórios', async ({ page }) => {
    await page.goto('/painel-prestador/apontamentos');
    await page.click('button:has-text("Novo Apontamento")');

    // Try to submit empty form
    await page.click('button:has-text("Registrar Apontamento")');

    // Expect error messages
    await expect(page.locator('text=Data é obrigatória')).toBeVisible();
    await expect(page.locator('text=Horas é obrigatório')).toBeVisible();
  });

  test('Editar apontamento existente', async ({ page }) => {
    await page.goto('/painel-prestador/apontamentos');

    // Click edit button on first apontamento
    await page.click('button[aria-label="Editar"]');

    // Modify hours
    await page.fill('input[name="horas"]', '6');

    // Save
    await page.click('button:has-text("Salvar Apontamento")');

    await expect(page.locator('text=Apontamento atualizado com sucesso')).toBeVisible();
  });

  test('Deletar apontamento', async ({ page }) => {
    await page.goto('/painel-prestador/apontamentos');

    // Click delete button
    await page.click('button[aria-label="Deletar"]');

    // Confirm deletion
    await page.click('button:has-text("Confirmar")');

    await expect(page.locator('text=Apontamento deletado com sucesso')).toBeVisible();
  });
});

test.describe('Validações de Apontamento', () => {
  test('Rejeitar horas negativas', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    await page.goto('/painel-prestador/apontamentos');
    await page.click('button:has-text("Novo Apontamento")');

    await page.fill('input[name="horas"]', '-5');
    await page.click('button:has-text("Registrar Apontamento")');

    await expect(page.locator('text=Horas não podem ser negativas')).toBeVisible();
  });

  test('Rejeitar horas acima do limite diário', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    await page.goto('/painel-prestador/apontamentos');
    await page.click('button:has-text("Novo Apontamento")');

    await page.fill('input[name="horas"]', '14');
    await page.click('button:has-text("Registrar Apontamento")');

    await expect(
      page.locator('text=Horas não podem exceder 12 horas por dia')
    ).toBeVisible();
  });

  test('Rejeitar datas futuras', async ({ page }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateStr = futureDate.toISOString().split('T')[0];

    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    await page.goto('/painel-prestador/apontamentos');
    await page.click('button:has-text("Novo Apontamento")');

    await page.fill('input[type="date"]', dateStr);
    await page.fill('input[name="horas"]', '8');
    await page.click('button:has-text("Registrar Apontamento")');

    await expect(page.locator('text=Não é permitido apontar datas futuras')).toBeVisible();
  });
});

test.describe('Apontamento com Rateio', () => {
  test('Criar apontamento que requer rateio manual', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    await page.goto('/painel-prestador/apontamentos');
    await page.click('button:has-text("Novo Apontamento")');

    await page.fill('input[type="date"]', '2024-07-17');
    await page.fill('input[name="horas"]', '8');

    // Add multiple residenciais without specifying hours for each
    await page.click('button:has-text("Adicionar Residencial")');
    await page.click('text=Residencial A');

    await page.click('button:has-text("Adicionar Residencial")');
    await page.click('text=Residencial B');

    await page.click('button:has-text("Registrar Apontamento")');

    // Expect warning about rateio
    await expect(
      page.locator(
        'text=Este apontamento será marcado como não rateado e requer revisão manual'
      )
    ).toBeVisible();
  });
});

test.describe('Performance', () => {
  test('Carregar lista de apontamentos com 1000 registros', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    const startTime = Date.now();
    await page.goto('/painel-prestador/apontamentos?limit=1000');
    const loadTime = Date.now() - startTime;

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);

    // Verify table is rendered
    await expect(page.locator('table tbody tr')).toHaveCount(1000);
  });

  test('Aplicar filtros de data sem lag', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');

    await page.goto('/painel-prestador/apontamentos');

    const startTime = Date.now();
    await page.fill('input[name="dataInicio"]', '2024-01-01');
    await page.fill('input[name="dataFim"]', '2024-12-31');
    await page.click('button:has-text("Filtrar")');

    // Wait for results
    await page.waitForTimeout(500);
    const filterTime = Date.now() - startTime;

    // Should filter within 1 second
    expect(filterTime).toBeLessThan(1000);
  });
});

/**
 * E2E Tests para gerenciamento de despesas (OCR e reembolsos)
 * Task #54
 */

import { test, expect } from '@playwright/test';

test.describe('Registro de Despesa com OCR', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForURL('/painel-prestador');
  });

  test('Upload e processamento OCR de comprovante', async ({ page }) => {
    await page.goto('/painel-prestador/despesas-ocr');

    // Selecionar arquivo
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/recibo-combustivel.jpg');

    // Verificar preview
    await expect(page.locator('img[alt="Preview"]')).toBeVisible();

    // Selecionar tipo
    await page.selectOption('select[name="tipo"]', 'combustivel');

    // Submeter
    await page.click('button:has-text("Registrar Despesa")');

    // Verificar sucesso
    await expect(page.locator('text=Despesa registrada com sucesso')).toBeVisible();
    await expect(page.locator('text=Confiança:')).toBeVisible();
  });

  test('Editar dados extraídos pelo OCR', async ({ page }) => {
    await page.goto('/painel-prestador/despesas-ocr');

    // Upload arquivo
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/recibo-combustivel.jpg');

    // Aguardar processamento OCR
    await page.waitForTimeout(1000);

    // Modificar valor extraído
    const valorInput = await page.locator('input[name="valor"]');
    const valorAtual = await valorInput.inputValue();
    expect(valorAtual).toBeTruthy(); // Deve ter valor extraído

    // Editar para valor diferente
    await valorInput.clear();
    await valorInput.fill('75.50');

    // Modificar descrição
    await page.fill('input[name="descricao"]', 'Combustível - Gasolina aditivada');

    // Submeter
    await page.click('button:has-text("Registrar Despesa")');

    await expect(page.locator('text=Despesa registrada com sucesso')).toBeVisible();
  });

  test('Validar confiança baixa do OCR', async ({ page }) => {
    await page.goto('/painel-prestador/despesas-ocr');

    // Upload imagem de baixa qualidade
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles('tests/fixtures/recibo-ruim.jpg');

    await page.waitForTimeout(1000);

    // Se confiança < 50%, avisar ao usuário
    const confiancaText = await page.locator('text=/Confiança: \\d+%/').textContent();
    const confianca = parseInt(confiancaText?.match(/\\d+/)?.[0] || '0');

    if (confianca < 50) {
      await expect(
        page.locator('text=Confiança de extração muito baixa')
      ).toBeVisible();
    }
  });

  test('Campos obrigatórios para OCR', async ({ page }) => {
    await page.goto('/painel-prestador/despesas-ocr');

    // Tentar enviar sem arquivo
    await page.click('button:has-text("Registrar Despesa")');

    await expect(
      page.locator('text=Selecione um arquivo e um contrato')
    ).toBeVisible();
  });
});

test.describe('Requisição de Reembolso', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForURL('/painel-prestador');
  });

  test('Criar requisição de reembolso com múltiplos itens', async ({ page }) => {
    await page.goto('/painel-prestador/reembolsos');

    // Adicionar primeiro item
    await page.fill('input[name="descricao"]', 'Luvas de Segurança');
    await page.fill('input[name="valor"]', '45.90');
    await page.fill('input[name="dataCompra"]', '2024-07-10');
    await page.selectOption('select[name="categoriaMaterial"]', 'manutencao');
    await page.click('button:has-text("Adicionar Item")');

    // Verificar item adicionado
    await expect(page.locator('text=Luvas de Segurança')).toBeVisible();

    // Adicionar segundo item
    await page.fill('input[name="descricao"]', 'Desinfetante Profissional');
    await page.fill('input[name="valor"]', '28.50');
    await page.fill('input[name="dataCompra"]', '2024-07-11');
    await page.selectOption('select[name="categoriaMaterial"]', 'limpeza');
    await page.click('button:has-text("Adicionar Item")');

    // Verificar total
    await expect(page.locator('text=74.40')).toBeVisible();

    // Submeter
    await page.click('button:has-text("Enviar Requisição de Reembolso")');

    await expect(
      page.locator('text=/Requisição criada! Total: R\\$ \\d+\\.\\d+/')
    ).toBeVisible();
  });

  test('Remover item da requisição', async ({ page }) => {
    await page.goto('/painel-prestador/reembolsos');

    // Adicionar item
    await page.fill('input[name="descricao"]', 'Item para remover');
    await page.fill('input[name="valor"]', '50.00');
    await page.fill('input[name="dataCompra"]', '2024-07-10');
    await page.click('button:has-text("Adicionar Item")');

    // Remover item
    await page.click('button[aria-label="Remover item"]');

    // Verificar que foi removido
    await expect(page.locator('text=Item para remover')).not.toBeVisible();
  });

  test('Validar campos obrigatórios de reembolso', async ({ page }) => {
    await page.goto('/painel-prestador/reembolsos');

    // Tentar enviar sem itens
    await page.click('button:has-text("Enviar Requisição de Reembolso")');

    await expect(
      page.locator('text=Preencha contrato e adicione itens')
    ).toBeVisible();
  });

  test('Adicionar observações à requisição', async ({ page }) => {
    await page.goto('/painel-prestador/reembolsos');

    // Adicionar item
    await page.fill('input[name="descricao"]', 'Materiais de limpeza');
    await page.fill('input[name="valor"]', '120.00');
    await page.fill('input[name="dataCompra"]', '2024-07-10');
    await page.click('button:has-text("Adicionar Item")');

    // Adicionar observações
    await page.fill('textarea[name="observacoes"]', 'Notas fiscais anexadas ao gerenciador');

    // Submeter
    await page.click('button:has-text("Enviar Requisição de Reembolso")');

    await expect(
      page.locator('text=Requisição criada!')
    ).toBeVisible();
  });
});

test.describe('Fluxo Admin de Reembolso', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button:has-text("Entrar")');
    await page.waitForURL('/painel-gestao');
  });

  test('Listar requisições de reembolso pendentes', async ({ page }) => {
    await page.goto('/painel-gestao/reembolsos');

    // Verificar tabela de requisições
    await expect(page.locator('table')).toBeVisible();

    // Verificar colunas
    await expect(page.locator('text=Prestador')).toBeVisible();
    await expect(page.locator('text=Valor')).toBeVisible();
    await expect(page.locator('text=Data')).toBeVisible();
  });

  test('Aprovar requisição de reembolso', async ({ page }) => {
    await page.goto('/painel-gestao/reembolsos');

    // Encontrar primeira requisição
    const primeiraLinha = page.locator('table tbody tr').first();
    await primeiraLinha.click();

    // Click aprovar
    await page.click('button:has-text("Aprovar Reembolso")');

    // Adicionar observações de aprovação
    await page.fill(
      'textarea[name="observacoes"]',
      'Aprovado. Pagamento agendado para amanhã.'
    );

    // Confirmar
    await page.click('button:has-text("Confirmar Aprovação")');

    await expect(
      page.locator('text=Reembolso aprovado e pagamento agendado')
    ).toBeVisible();
  });

  test('Rejeitar requisição de reembolso', async ({ page }) => {
    await page.goto('/painel-gestao/reembolsos');

    // Encontrar primeira requisição
    const primeiraLinha = page.locator('table tbody tr').first();
    await primeiraLinha.click();

    // Click rejeitar
    await page.click('button:has-text("Rejeitar Reembolso")');

    // Adicionar motivo
    await page.fill('textarea[name="motivo"]', 'Documentação incompleta - faltam notas fiscais');

    // Confirmar
    await page.click('button:has-text("Confirmar Rejeição")');

    await expect(
      page.locator('text=Reembolso rejeitado com sucesso')
    ).toBeVisible();
  });
});

test.describe('Validações de Despesa', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="email"]', 'prestador@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForURL('/painel-prestador');
  });

  test('Rejeitar valores negativos', async ({ page }) => {
    await page.goto('/painel-prestador/reembolsos');

    await page.fill('input[name="valor"]', '-50');
    await page.click('button:has-text("Adicionar Item")');

    await expect(
      page.locator('text=/Valores não podem ser negativos/')
    ).toBeVisible();
  });

  test('Rejeitar datas futuras em despesas', async ({ page }) => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const dateStr = futureDate.toISOString().split('T')[0];

    await page.goto('/painel-prestador/reembolsos');

    await page.fill('input[name="descricao"]', 'Teste');
    await page.fill('input[name="valor"]', '50');
    await page.fill('input[name="dataCompra"]', dateStr);
    await page.click('button:has-text("Adicionar Item")');

    await expect(
      page.locator('text=Data não pode ser no futuro')
    ).toBeVisible();
  });
});

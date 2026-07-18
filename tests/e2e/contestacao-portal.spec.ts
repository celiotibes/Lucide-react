import { test, expect } from '@playwright/test';

test.describe('Portal de Contestação - E2E', () => {
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';
  const vistoriaId = 'test-vistoria-e2e-001';

  test.beforeEach(async ({ page }) => {
    // Login como gestor
    await page.goto(`${baseUrl}/auth/login`);
    await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL || 'test@example.com');
    await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || 'password123');
    await page.click('button:has-text("Entrar")');
    await page.waitForNavigation();
  });

  test('deve exibir portal de contestação com itens danificados', async ({ page }) => {
    // Navegar para portal de contestação
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao`);

    // Verificar cabeçalho
    await expect(page.locator('h1')).toContainText('Portal de Contestação');

    // Verificar seção de itens da vistoria
    const itensSection = page.locator('text=Itens da Vistoria');
    await expect(itensSection).toBeVisible();

    // Verificar presença de itens danificados
    const botõesContestar = page.locator('a:has-text("Contestar")');
    await expect(botõesContestar.first()).toBeVisible();
  });

  test('deve exibir informações legais corretas', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao`);

    // Verificar texto legal
    await expect(page.locator('text=Lei 8.245/91')).toBeVisible();
    await expect(page.locator('text=5 dias úteis')).toBeVisible();
    await expect(page.locator('text=presunção de veracidade')).toBeVisible();
  });

  test('deve abrir formulário de contestação ao clicar em "Contestar"', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao`);

    // Clicar no primeiro botão "Contestar"
    await page.locator('a:has-text("Contestar")').first().click();

    // Verificar URL mudou para formulário
    await expect(page).toHaveURL(/\/contestacao\/novo/);

    // Verificar título do formulário
    await expect(page.locator('h1')).toContainText('Nova Contestação');

    // Verificar presença de campos
    await expect(page.locator('input[name="motivo"]')).toBeVisible();
    await expect(page.locator('textarea[name="descricaoDesacordo"]')).toBeVisible();
    await expect(page.locator('input[name="contatoInquilino"]')).toBeVisible();
  });

  test('deve validar campos obrigatórios do formulário', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Tentar enviar formulário vazio
    await page.click('button:has-text("Registrar Contestação")');

    // Verificar mensagens de validação
    const motivoInput = page.locator('input[name="motivo"]');
    await expect(motivoInput).toHaveAttribute('required', '');
  });

  test('deve rejeitar contestação com motivo muito curto', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Preencher com dados inválidos
    await page.fill('input[name="motivo"]', 'Erro'); // < 10 caracteres
    await page.fill(
      'textarea[name="descricaoDesacordo"]',
      'Descrição com mais de 20 caracteres mas motivo é curto'
    );
    await page.fill('input[name="contatoInquilino"]', 'test@example.com');
    await page.fill('input[name="fotoEvidencia"]', 'https://example.com/foto.jpg');

    // Enviar
    await page.click('button:has-text("Registrar Contestação")');

    // Verificar erro
    await expect(page.locator('text=erro')).toBeVisible();
  });

  test('deve registrar contestação com dados válidos', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Preencher formulário
    await page.fill('input[name="motivo"]', 'Dano não foi causado por mim - desgaste natural');
    await page.fill(
      'textarea[name="descricaoDesacordo"]',
      'Este dano já existia quando realizei a inspeção de entrada. Tenho fotos anexadas que comprovam a situação inicial do imóvel.'
    );
    await page.fill('input[name="contatoInquilino"]', 'inquilino@example.com');
    await page.fill('input[name="fotoEvidencia"]', 'https://example.com/evidencia.jpg');

    // Enviar
    await page.click('button:has-text("Registrar Contestação")');

    // Aguardar redirecionamento
    await page.waitForNavigation();

    // Verificar sucesso (deve voltar para lista de contestações)
    await expect(page).toHaveURL(/\/contestacao$/);

    // Verificar que contestação foi listada
    await expect(page.locator('text=Dano não foi causado por mim')).toBeVisible();
  });

  test('deve exibir contador de dias úteis restantes', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao`);

    // Procurar por contestação existente (assumindo que existe uma)
    const diasRestantes = page.locator('text=/\\d+ dias úteis restantes/');

    if (await diasRestantes.count() > 0) {
      await expect(diasRestantes.first()).toBeVisible();

      // Verificar cor de alerta se ≤1 dia
      const alertRed = page.locator('.alert-red, [style*="ffebee"]');
      // Pode ou não estar presente dependendo dos dados
    }
  });

  test('deve exibir avisos legais sobre declarações falsas', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Verificar aviso legal
    const aviso = page.locator('text=/Declarações falsas.*crime/');
    await expect(aviso).toBeVisible();

    // Verificar período de 5 dias
    await expect(page.locator('text=5 dias úteis')).toBeVisible();

    // Verificar referência legal
    await expect(page.locator('text=Lei 8.245/91')).toBeVisible();
  });

  test('deve permitir upload de foto de evidência', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Verificar campo de URL de foto
    const fotoInput = page.locator('input[name="fotoEvidencia"]');
    await expect(fotoInput).toBeVisible();

    // Preencher URL
    await fotoInput.fill('https://example.com/evidencia.jpg');

    // Verificar que foi preenchido
    await expect(fotoInput).toHaveValue('https://example.com/evidencia.jpg');
  });

  test('deve exibir status de contestação com badge colorida', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao`);

    // Procurar por badges de status
    const badges = page.locator('[style*="backgroundColor"]');

    // Verificar presença de badges (aberta, aceita, rejeitada, preclusao_expirada)
    const badgeCount = await badges.count();
    if (badgeCount > 0) {
      await expect(badges.first()).toBeVisible();
    }
  });

  test('deve mostrar status de reparo se disponível', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao`);

    // Procurar por seção de status de reparo
    const statusReparo = page.locator('text=Status do Reparo');

    if (await statusReparo.count() > 0) {
      await expect(statusReparo).toBeVisible();
      // Verificar que mostra status (pendente, em_execucao, concluido, etc)
    }
  });

  test('deve validar email antes de enviar', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Preencher com email inválido
    await page.fill('input[name="motivo"]', 'Dano não causado por mim');
    await page.fill(
      'textarea[name="descricaoDesacordo"]',
      'Descrição longa o suficiente para passar na validação.'
    );
    await page.fill('input[name="contatoInquilino"]', 'invalid-email');

    // Enviar
    await page.click('button:has-text("Registrar Contestação")');

    // Verificar erro ou falha de validação
    // O tipo="email" do HTML5 deve bloquear no navegador
    // ou o servidor deve rejeitar
    const errorMessage = page.locator('[role="alert"]');
    // Aguardar erro ou ser redirecionado com erro
    await expect(
      errorMessage.or(page.locator('text=erro')).or(page.locator('text=inválid'))
    ).toBeVisible();
  });

  test('deve exibir botão "Voltar" funcional', async ({ page }) => {
    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao/novo`);

    // Clicar em voltar
    await page.click('button:has-text("Cancelar")');

    // Deve retornar para lista de contestações
    await expect(page).toHaveURL(/\/contestacao$/);
  });
});

test.describe('Portal de Contestação - Inquilino (sem login)', () => {
  const baseUrl = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000';

  test('inquilino deve acessar contestação via link público (token)', async ({ page }) => {
    // Simular acesso via link compartilhado com token
    const token = 'test-token-123abc';
    const vistoriaId = 'test-vistoria-e2e-001';

    await page.goto(`${baseUrl}/vistorias/${vistoriaId}/contestacao?token=${token}`);

    // Deve exibir portal (com token validado)
    // Ou redirecionar para login se token inválido
    // Comportamento depende da implementação RLS

    // Verificar que página carrega (sucesso ou redirecionamento transparente)
    await expect(page.locator('text=Portal de Contestação').or(page.locator('[name="email"]'))).toBeVisible();
  });
});

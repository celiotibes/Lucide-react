# Frontend E2E Tests - Rental Sync

Este diretório contém testes end-to-end automatizados usando Playwright, que cobrem todos os 23 casos de teste manual do framework `FRONTEND_TESTING_EXECUTION.md`.

## 📋 Cobertura de Testes

### Section 1: Login Flow (8 testes)
- ✅ Login Page Displays
- ✅ Email Field Input
- ✅ Password Field Masking
- ✅ Login Button Clickable
- ✅ Form Validation - Empty Email
- ✅ Form Validation - Empty Password
- ✅ Invalid Credentials Error
- ✅ Successful Login & Redirect

### Section 2: Calendar Component (6 testes)
- ✅ Calendar Displays
- ✅ Calendar Shows 180 Days
- ✅ Date Selection - Check-in
- ✅ Date Selection - Check-out
- ✅ Cannot Select Check-out Before Check-in
- ✅ Past Dates Disabled

### Section 3: Booking Form (7 testes)
- ✅ Booking Form Appears
- ✅ Form Disappears When No Dates
- ✅ Guest Name Required
- ✅ Guest Email Validation
- ✅ Guest Phone Validation
- ✅ Price Calculation Correct
- ✅ Form Submission Success

### Section 4: Navigation & Auth (2 testes)
- ✅ Logout Button Functionality
- ✅ Login Persists on Page Refresh

### Section 5: Responsive Design (3 testes)
- ✅ Mobile Layout (iPhone 12 - 390×844)
- ✅ Tablet Layout (iPad - 768×1024)
- ✅ Desktop Layout (1920×1080)

### Section 6: Accessibility (3 testes)
- ✅ Keyboard Navigation
- ✅ Color Contrast (WCAG AA)
- ✅ Screen Reader Compatibility

### Section 7: Error Handling (2+ testes)
- ✅ Network Error Handling
- ✅ API Timeout Handling

**Total: 33+ testes automatizados**

## 🚀 Como Executar

### Pré-requisitos

1. **Node.js e npm instalados**
   ```bash
   node --version  # v22+
   npm --version   # 10+
   ```

2. **Dependências instaladas**
   ```bash
   npm install
   cd frontend
   npm install
   cd ../backend
   npm install
   ```

3. **Playwright instalado**
   ```bash
   npm install @playwright/test
   npx playwright install
   ```

### Executar Todos os Testes

```bash
# Na raiz do projeto
npm run test:e2e
```

Ou:

```bash
# Usando Playwright diretamente
npx playwright test
```

### Executar Teste Específico

```bash
# Testes de login apenas
npx playwright test rental-sync.spec.ts -g "Login Flow"

# Testes de calendário apenas
npx playwright test rental-sync.spec.ts -g "Calendar Component"

# Teste específico
npx playwright test rental-sync.spec.ts -g "1.1"
```

### Executar em Modo de Visualização (Watch Mode)

```bash
npx playwright test --ui
```

Abre interface visual onde você pode:
- Ver cada teste sendo executado
- Pausar/retomar testes
- Ver screenshots e vídeos
- Inspecionar elementos

### Modo Debug

```bash
npx playwright test --debug
```

Abre o Playwright Inspector que permite:
- Step through cada ação
- Inspecionar o DOM
- Executar JavaScript no console

### Gerar Report HTML

```bash
npx playwright test
npx playwright show-report
```

Abre relatório HTML interativo com:
- Status de cada teste
- Screenshots de falhas
- Vídeos de execução
- Traces detalhados

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# URL da API (padrão: http://localhost:5173)
export VITE_API_URL=http://localhost:5173

# Modo CI
export CI=true

# Modo debug
export DEBUG=pw:api
```

### Arquivo de Configuração

Ver `playwright.config.ts` para:
- Configuração de navegadores
- Timeouts
- Retries
- Screenshots/Videos
- Servidores web

## 📊 Estrutura de Resultados

Após executar os testes, você encontrará:

```
playwright-report/
├── index.html          # Report principal
├── data/
│   └── trace files     # Recordings de execução
test-results/
├── screenshots/        # Screenshots de falhas
├── videos/            # Vídeos de testes falhados
└── [test-name].webm   # Vídeo individual
```

## ✅ Checklist antes de Executar

- [ ] Backend rodando em `http://localhost:3000`
- [ ] Frontend rodando em `http://localhost:5173`
- [ ] Database PostgreSQL disponível
- [ ] Redis disponível
- [ ] Credenciais de teste configuradas

## 🏃 Quick Start (Completo)

```bash
# 1. Terminal 1: Backend
cd backend
npm install
npm run dev

# 2. Terminal 2: Frontend
cd frontend
npm install
npm run dev

# 3. Terminal 3: Testes
npm install @playwright/test
npx playwright install
npx playwright test --ui
```

## 📝 Escrevendo Novos Testes

Adicione no arquivo `rental-sync.spec.ts`:

```typescript
test('Novo teste', async ({ page }) => {
  // Arrange
  await page.goto('http://localhost:5173');
  
  // Act
  await page.click('button');
  
  // Assert
  await expect(page.locator('div')).toBeVisible();
});
```

## 🐛 Troubleshooting

### Timeout em Testes

```bash
# Aumentar timeout global
npx playwright test --timeout=60000

# Ou no arquivo de config
use: {
  navigationTimeout: 60000,
}
```

### Navegador não encontrado

```bash
npx playwright install chromium
npx playwright install firefox
npx playwright install webkit
```

### Testes falham localmente mas passam em CI

- Verificar tamanho de viewport
- Verificar timing de rede
- Usar `waitForLoadState('networkidle')`
- Aumentar timeouts

### API retorna erro 500

- Verificar logs do backend
- Verificar banco de dados
- Verificar variáveis de ambiente

## 📚 Recursos

- [Documentação Playwright](https://playwright.dev)
- [Seletores](https://playwright.dev/docs/locators)
- [Assertions](https://playwright.dev/docs/assertions)
- [API Reference](https://playwright.dev/docs/api/class-test)

## 🔗 Referências

- `FRONTEND_TESTING_EXECUTION.md` - Framework manual com 23 casos
- `playwright.config.ts` - Configuração de testes
- `rental-sync.spec.ts` - Suite de testes E2E

## 📄 Licença

Parte do projeto Rental Sync

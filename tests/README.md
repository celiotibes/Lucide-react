# Testes E2E - Lucide-react

Este diretório contém testes End-to-End (E2E) para a aplicação Lucide-react usando Playwright.

## Configuração

### Instalação do Playwright

```bash
npm install @playwright/test
```

### Configuração de Browsers

O Playwright usa os browsers pré-instalados no ambiente. Para mais informações, veja `playwright.config.ts`.

## Rodando os Testes

### Executar todos os testes

```bash
npm run test:e2e
```

### UI de Testes (interativo)

```bash
npm run test:e2e:ui
```

### Debug Mode

```bash
npm run test:e2e:debug
```

### Ver Relatório

```bash
npm run test:e2e:report
```

### Rodar teste específico

```bash
npx playwright test tests/e2e/app.spec.ts
```

### Rodar teste em navegador específico

```bash
npx playwright test --project=chromium
npx playwright test --project="Mobile Chrome"
npx playwright test --project="iPhone 12"
```

## Estrutura de Testes

### `app.spec.ts`
- Testes gerais da aplicação
- Navegação e responsividade
- Dark mode support
- Layout em diferentes tamanhos

### `editor.spec.ts`
- Testes do editor de petições
- Auto-save
- Export functionality
- Keyboard shortcuts
- Undo/redo

### `features.spec.ts`
- Testes de features principais
- Analytics dashboard
- Reports builder
- Annotations
- Templates
- Sharing
- PDF export
- Navigation entre todas as páginas

## Padrões de Teste

### Esperar elementos
```typescript
await expect(page.locator('text=Dashboard')).toBeVisible()
await page.waitForLoadState('networkidle')
```

### Clicar em botões
```typescript
const button = page.locator('text=Novo Documento')
await button.click()
```

### Preencher formulários
```typescript
await page.fill('input[name="titulo"]', 'Minha Petição')
```

### Verificar URLs
```typescript
expect(page.url()).toContain('/documents')
```

## CI/CD Integration

Os testes são configurados para rodar em CI (GitHub Actions, etc) com:
- 2 retries automáticos
- Parallelização desabilitada
- Relatórios HTML
- Screenshots/videos em caso de falha

## Boas Práticas

1. **Use `beforeEach` para setup**: Navigação inicial, login mock, etc
2. **Aguarde estado de rede**: `await page.waitForLoadState('networkidle')`
3. **Localize elementos de forma robusta**: Use `text=` ou `data-testid` quando possível
4. **Teste responsividade**: Simulate diferentes tamanhos de viewport
5. **Teste dark mode**: Use `emulateMedia` para modo escuro/claro
6. **Use conditional checks**: Verifique se elementos existem antes de interagir

## Debugging

### Ver logs detalhados
```bash
DEBUG=pw:api npx playwright test
```

### Parar em um ponto específico
```bash
await page.pause()
```

### Inspector
```bash
npx playwright test --debug
```

## Limitations & Notes

- Testes usam mock authentication (sem login real)
- Alguns testes verificam apenas visibilidade e navegação
- A aplicação usa localStorage para persistência
- Testes podem falhar se a aplicação não estiver rodando

## Próximos Passos

- [ ] Adicionar testes de formulários
- [ ] Adicionar testes de armazenamento de documentos
- [ ] Adicionar testes de performance
- [ ] Adicionar testes de acessibilidade (axe)
- [ ] Setup de CI/CD pipeline
- [ ] Coverage reports

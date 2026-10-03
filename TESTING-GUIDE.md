# Guide Completo de Testes - Lucide React

Documentação consolidada para rodar todas as suites de testes implementadas.

## Índice

- [E2E Tests (Happy Paths)](#e2e-tests-happy-paths)
- [Load Tests (K6)](#load-tests-k6)
- [Security Tests (OWASP)](#security-tests-owasp)
- [Execução Combinada](#execução-combinada)
- [CI/CD Integration](#cicd-integration)

---

## E2E Tests (Happy Paths)

### Descrição

Testes end-to-end que cobrem fluxos críticos da aplicação:

1. **Login → Dashboard** (sem erros)
2. **Criar Cobrança** (Asaas → validar em lista)
3. **Reconciliar Pagamentos** (status atualizado)
4. **Gerar Relatório** (PDF gerado sem erro)
5. **Login Inválido** (rejeita com 401)

### Pré-requisitos

- Node.js 20.19.0+ ou 22.12.0+
- Playwright (instalado via package.json)

### Arquivo

- `tests/e2e/happy-paths.spec.ts` (237 linhas, 5 testes)

### Execução

#### Rodar todos os testes
```bash
npm run test:e2e -- tests/e2e/happy-paths.spec.ts
```

#### Modo UI (recomendado para debug)
```bash
npm run test:e2e:ui -- tests/e2e/happy-paths.spec.ts
```

#### Modo headed (navegador visível)
```bash
npm run test:e2e:headed -- tests/e2e/happy-paths.spec.ts
```

#### Teste específico
```bash
npm run test:e2e -- tests/e2e/happy-paths.spec.ts -g "should login successfully"
```

#### Gerar relatório HTML
```bash
npm run test:e2e -- tests/e2e/happy-paths.spec.ts
npx playwright show-report
```

### Validações incluídas

- ✅ Erros de console (não deve haver)
- ✅ Status HTTP > 400 (não deve haver, exceto login inválido)
- ✅ Elementos da UI (visibilidade e interação)
- ✅ PDF downloads (validação de arquivo)
- ✅ HTTP 401 para credentials inválidas

---

## Load Tests (K6)

### Descrição

Testes de carga com 10 usuários simultâneos por 2 minutos.

Endpoints testados:
- `GET /api/relatorios`
- `POST /api/cobrancas`
- `GET /api/anomalias`

SLAs:
- Response time P95 < 500ms
- Error rate < 1%
- HTTP success > 99%

### Pré-requisitos

- K6 CLI (https://k6.io/docs/get-started/installation/)

### Arquivo

- `load-tests/basic-load.js` (161 linhas, 3 endpoints)
- `load-tests/README.md` (documentação completa)

### Instalação K6

#### macOS
```bash
brew install k6
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install -y apt-transport-https
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6-archive.list
sudo apt-get update
sudo apt-get install k6
```

#### Windows (Chocolatey)
```bash
choco install k6
```

### Execução

#### 1. Inicie o servidor
```bash
npm run dev
```

#### 2. Em outro terminal, rode o teste
```bash
# Localhost (padrão)
k6 run load-tests/basic-load.js

# Com BASE_URL customizada
BASE_URL=http://localhost:5173 k6 run load-tests/basic-load.js

# Produção
BASE_URL=https://sua-app.com k6 run load-tests/basic-load.js
```

### Interpretação de Resultados

```
checks.........................: 100% ✓ 300   ✗ 0
error_rate.....................: 0%   ✓ 0     ✗ 300
http_req_duration..............: avg=125.23ms min=98.3ms p(95)=380.5ms max=450.12ms
http_req_failed................: 0%   ✓ 0     ✗ 300
```

**PASSOU**: Todos os SLAs foram atingidos ✅

**FALHOU**: Se P95 > 500ms ou error rate > 1% ❌

---

## Security Tests (OWASP)

### Descrição

12 testes cobrindo OWASP Top 10:

1. **SQL Injection** (2 testes)
   - `' OR 1=1 --` payload
   - `; DROP TABLE users; --` payload

2. **XSS** (3 testes)
   - Script tag injection
   - Event handler injection
   - URL parameter injection

3. **CSRF** (2 testes)
   - Rejeição sem token
   - Presença de token em forms

4. **XXE** (2 testes)
   - File disclosure attempt
   - Billion Laughs DoS

5. **Directory Traversal** (2 testes)
   - `../../etc/passwd` payload
   - Encoded variants

6. **Security Headers** (1 teste)
   - CSP, X-Frame-Options, etc

### Arquivo

- `security-tests/owasp-tests.spec.ts` (554 linhas, 12 testes)
- `security-tests/README.md` (documentação e remediation)

### Execução

#### Rodar todos os testes de segurança
```bash
npm run test:e2e -- security-tests/owasp-tests.spec.ts
```

#### Modo UI
```bash
npm run test:e2e:ui -- security-tests/owasp-tests.spec.ts
```

#### Teste específico
```bash
npm run test:e2e -- security-tests/owasp-tests.spec.ts -g "SQL Injection"
```

#### Com relatório JSON
```bash
npm run test:e2e -- security-tests/owasp-tests.spec.ts --reporter=json > security-report.json
```

### Checklist de Vulnerabilidades

- [ ] ✅ SQL Injection - blocked
- [ ] ✅ XSS - blocked
- [ ] ✅ CSRF - tokens presentes
- [ ] ✅ XXE - disabled
- [ ] ✅ Directory Traversal - blocked
- [ ] ✅ Security Headers - presentes

---

## Execução Combinada

### Script de teste completo (local)

```bash
#!/bin/bash

echo "==== INICIANDO TESTES COMPLETOS ===="

# 1. E2E Tests
echo "1. Executando E2E Tests..."
npm run test:e2e -- tests/e2e/happy-paths.spec.ts
if [ $? -ne 0 ]; then
  echo "❌ E2E Tests falharam"
  exit 1
fi
echo "✅ E2E Tests passaram"

# 2. Load Tests
echo ""
echo "2. Executando Load Tests..."
# Servidor já deve estar rodando em background
k6 run load-tests/basic-load.js
if [ $? -ne 0 ]; then
  echo "❌ Load Tests falharam"
  exit 1
fi
echo "✅ Load Tests passaram"

# 3. Security Tests
echo ""
echo "3. Executando Security Tests..."
npm run test:e2e -- security-tests/owasp-tests.spec.ts
if [ $? -ne 0 ]; then
  echo "❌ Security Tests falharam"
  exit 1
fi
echo "✅ Security Tests passaram"

echo ""
echo "==== TODOS OS TESTES PASSARAM ===="
```

### Rodar na sequência (manual)

```bash
# Terminal 1: Servidor
npm run dev

# Terminal 2: E2E + Security
npm run test:e2e

# Terminal 3: Load (enquanto o servidor está rodando)
k6 run load-tests/basic-load.js
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e -- tests/e2e/happy-paths.spec.ts
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: e2e-report
          path: playwright-report/

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      
      - run: npm ci
      - run: npm run test:e2e -- security-tests/owasp-tests.spec.ts
      
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: security-report
          path: playwright-report/

  load-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.0
        with:
          filename: load-tests/basic-load.js
          cloud: false
```

### GitLab CI

```yaml
stages:
  - test
  - security
  - load

e2e_tests:
  stage: test
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  script:
    - npm ci
    - npm run test:e2e -- tests/e2e/happy-paths.spec.ts
  artifacts:
    paths:
      - playwright-report/

security_tests:
  stage: security
  image: mcr.microsoft.com/playwright:v1.40.0-focal
  script:
    - npm ci
    - npm run test:e2e -- security-tests/owasp-tests.spec.ts
  artifacts:
    paths:
      - playwright-report/

load_tests:
  stage: load
  image: grafana/k6:latest
  script:
    - npm ci
    - npm run dev &
    - sleep 10
    - k6 run load-tests/basic-load.js
```

---

## Status de Cobertura

| Suite | Testes | Cobertura | Status |
|-------|--------|-----------|--------|
| E2E (Happy Paths) | 5 | Fluxos críticos | ✅ Implementado |
| E2E (Smoke) | 3 | Básico | ✅ Existente |
| Load | 3 endpoints | Performance | ✅ Implementado |
| Security | 12 | OWASP Top 10 | ✅ Implementado |
| Unit | Múltiplos | Código | ✅ Existente (vitest) |

**Total: 23+ testes de cobertura**

---

## Troubleshooting

### E2E Tests

| Erro | Solução |
|------|---------|
| Port 5173 already in use | `lsof -i :5173` e `kill -9 <PID>` |
| Timeout waiting for server | Aguarde 15s, verifique npm run dev |
| Element not found | Ajuste seletores para seu DOM |

### Load Tests

| Erro | Solução |
|------|---------|
| "Could not resolve api address" | Verifique BASE_URL |
| P95 > 500ms | Reduza VUs, analise servidor |
| Connection refused | Inicie npm run dev primeiro |

### Security Tests

| Erro | Solução |
|------|---------|
| Test fails with "not blocked" | Implementar validação no servidor |
| "Input not found" | Ajuste seletores CSS/data-testid |
| Headers missing | Adicionar middleware de segurança |

---

## Próximos Passos

- [ ] Spike testing (carga repentina)
- [ ] Stress testing (até quebrar)
- [ ] Testes de API (endpoint contracts)
- [ ] Testes de acessibilidade (a11y)
- [ ] Penetration testing profissional
- [ ] SLA monitoring em produção

---

## Referências

- **Playwright**: https://playwright.dev/docs/intro
- **K6**: https://k6.io/docs/
- **OWASP**: https://owasp.org/Top10/
- **Segurança**: https://cheatsheetseries.owasp.org/

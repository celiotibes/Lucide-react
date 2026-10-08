# CI/CD Troubleshooting Guide

Guia de diagnóstico e resolução de problemas em workflows do GitHub Actions.

## Índice Rápido

- [Testes Falhando](#testes-falhando)
- [Build Falhando](#build-falhando)
- [Segurança - Vulnerabilidades](#segurança---vulnerabilidades)
- [Deploy Falhando](#deploy-falhando)
- [Cache Issues](#cache-issues)
- [Permissões](#permissões)
- [Performance](#performance)
- [Secrets & Environment](#secrets--environment)

---

## Testes Falhando

### Problema: "npm test" falha localmente mas passa no CI

**Causas Comuns:**
1. Node.js versão diferente
2. Arquivos `.env` ausentes
3. Dependencies não instaladas

**Solução:**
```bash
# 1. Verificar versão Node.js
node --version  # Deve ser 18.x ou 20.x

# 2. Instalar dependencies
npm ci  # Use ci ao invés de install

# 3. Rodar teste em modo CI
CI=true npm test

# 4. Verificar .env.example
cat .env.example > .env
```

---

### Problema: Coverage abaixo de 70%

**Mensagem:**
```
❌ Coverage is below 70% threshold (current: 45%)
```

**Solução:**
```bash
# 1. Gerar relatório de cobertura
npm test -- --coverage

# 2. Ver qual arquivo está baixo
cat coverage/coverage-summary.json | jq '.total'

# 3. Melhorar testes para os arquivos com baixa cobertura
# Adicionar testes em __tests__ directory
```

**Arquivo:** `.github/workflows/test.yml` linha ~65

---

### Problema: Timeout no teste (>30 min)

**Solução:**
```yaml
# Aumentar timeout em .github/workflows/test.yml
timeout-minutes: 45  # ou mais se necessário

# Ou adicionar retry
- name: Run tests
  run: npm test
  timeout-minutes: 45
```

---

### Problema: "jest/vitest" não encontrado

**Causa:** node_modules corrompido no cache

**Solução:**
```bash
# Limpar cache da action
# No Settings → Actions → Runners → "Clear all caches"

# Ou forçar sem cache
- name: Clear npm cache
  run: npm cache clean --force && rm -rf node_modules

- name: Install
  run: npm ci
```

---

## Build Falhando

### Problema: "Cannot find module" durante build

**Comum em:**
- Import paths incorretos
- Imports circulares
- Dependencies não instaladas

**Debug:**
```bash
# 1. Rodar build localmente
npm run build 2>&1 | head -50

# 2. Verificar se o arquivo existe
ls -la src/path/to/file.ts

# 3. Limpar dist e reconstruir
rm -rf dist node_modules
npm ci
npm run build
```

---

### Problema: TypeScript errors

**Erro:**
```
error TS2307: Cannot find module
```

**Solução:**
```bash
# 1. Rodar typecheck explícito
npm run build:typecheck

# 2. Verificar tsconfig.json
cat tsconfig.json | grep -A5 "include\|exclude"

# 3. Executar tsc manualmente
npx tsc --noEmit --listFiles | grep error
```

---

### Problema: Electron build falha com certificado

**Erro:**
```
Cannot find certificate file
```

**Solução:**
1. Setup secrets no GitHub:
   ```
   Settings → Secrets and variables → Actions
   ```

2. Adicionar secrets:
   - `WINDOWS_CERTIFICATE_FILE` - Path relativo
   - `WINDOWS_CERTIFICATE_PASSWORD` - Password

3. Arquivo `.github/workflows/build.yml` linha ~110:
   ```yaml
   env:
     WINDOWS_CERTIFICATE_FILE: ${{ secrets.WINDOWS_CERTIFICATE_FILE }}
     WINDOWS_CERTIFICATE_PASSWORD: ${{ secrets.WINDOWS_CERTIFICATE_PASSWORD }}
   ```

---

### Problema: Docker build muito lento

**Sintoma:** Build leva >30 minutos

**Solução:**
```yaml
# Garantir cache ativo
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

# Usar cache backend
- name: Build
  uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Segurança - Vulnerabilidades

### Problema: npm audit encontra vulnerabilidades

**Saída:**
```json
{
  "vulnerabilities": {
    "package-name": {
      "severity": "high",
      "via": "CVE-2024-XXXXX"
    }
  }
}
```

**Resolução por Severidade:**

#### Critical/High
1. Atualizar package:
   ```bash
   npm update package-name
   npm ci && npm test
   ```

2. Se não tem fix:
   ```bash
   npm audit --fix --force
   ```

3. Se impossível fixar:
   ```bash
   npm audit fix --force --audit-level=moderate
   npm ci
   ```

#### Moderate
- Pode esperar próxima versão
- Considere atualizar preventivamente

---

### Problema: Secret detectado no código

**Mensagem:**
```
TruffleHog: Secrets found!
```

**Ações:**
1. **Imediatamente:**
   ```bash
   # Retirar secret do código
   git rm -f file-with-secret.key
   
   # Rotacionar credencial comprometida
   # (chamar administrador)
   ```

2. **Usar GitHub Secrets:**
   ```yaml
   env:
     MY_SECRET: ${{ secrets.MY_SECRET }}
   ```

3. **Limpar história:**
   ```bash
   git filter-branch --tree-filter 'rm -f file' HEAD
   git push --force-with-lease
   ```

---

### Problema: Semgrep encontra issues

**Análise:**
```bash
# Executar localmente
npm install -g semgrep
semgrep --config=p/security-audit .
```

**Fix:**
1. Revisar issue reportado
2. Refatorar código
3. Re-rodar scan

---

## Deploy Falhando

### Problema: Deploy está bloqueado (required status checks)

**Erro:**
```
Required status check "Build" is failing
```

**Solução:**

1. Verificar workflow falhando:
   - Actions tab → Verificar qual workflow falha
   - Abrir workflow → Ver step com erro

2. Fixar issue no branch:
   ```bash
   git checkout feature-branch
   # Fixar erro
   git push
   ```

3. Se falso positivo:
   - Contatar admin repositório
   - Temporariamente desabilitar check
   - Depois re-ativar

---

### Problema: GitHub Pages deploy falha

**Erro:**
```
error: failed to push some refs to 'https://github.com/...'
```

**Causas:**
1. Permissões insuficientes
2. Branch `gh-pages` protegido
3. Token expirado

**Solução:**

1. Verificar permissões:
   ```
   Settings → Actions → General
   → Workflow permissions → Read and write
   ```

2. Remover proteção de branch:
   ```
   Settings → Branches → gh-pages
   → Remove all protection rules
   ```

3. Forçar re-criação:
   ```bash
   git push --delete origin gh-pages
   # Workflow criará novo
   ```

---

### Problema: Slack notification não funciona

**Erro:**
```
Invalid value for webhook_url
```

**Solução:**

1. Verificar secret:
   ```
   Settings → Secrets → SLACK_WEBHOOK
   ```

2. Verificar formato:
   ```
   https://hooks.slack.com/services/T[WORKSPACE_ID]/B[CHANNEL_ID]/[TOKEN]
   ```

3. Re-gerar webhook:
   - Slack App → Incoming Webhooks
   - Create New Webhook
   - Copiar URL
   - Atualizar secret no GitHub

---

## Cache Issues

### Problema: Cache não está sendo reutilizado

**Sintoma:** Cada run leva 5+ min para instalar

**Debug:**
```bash
# Verificar hits de cache
# Actions tab → Workflow run → Look for "Restored from cache"
```

**Solução:**

1. Verificar cache key:
   ```yaml
   key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
   ```

2. Se package-lock.json mudou:
   ```bash
   npm ci  # Regenera lock file
   git add package-lock.json
   git commit -m "Update lock file"
   ```

3. Limpar cache manual:
   ```
   Settings → Actions → Runners
   → Clear all caches
   ```

---

### Problema: Cache corrompido

**Sintoma:**
```
npm ERR! 404 Not Found - GET https://registry.npmjs.org/...
```

**Solução:**
```bash
# 1. Forçar rebuild sem cache
npm cache clean --force
rm -rf node_modules package-lock.json

# 2. Reinstalar
npm install

# 3. Commit lock file
git add package-lock.json
git commit -m "Rebuild dependencies"
git push
```

---

## Permissões

### Problema: "Permission denied" ao fazer push

**Erro:**
```
remote: Permission to repo denied to github-actions[bot]
```

**Solução:**

1. Verificar workflow permissions:
   ```yaml
   permissions:
     contents: write  # Necessário para push
     pull-requests: write
   ```

2. Job-level permissions:
   ```yaml
   jobs:
     deploy:
       permissions:
         contents: write
   ```

3. Verificar GITHUB_TOKEN:
   - Não precisa de secret adicional
   - Automaticamente disponível

---

### Problema: Não consegue deletar artifacts

**Permissões necessárias:**
```yaml
permissions:
  actions: write  # Para deletar artifacts
```

---

## Performance

### Problema: Workflow lento (>20 min)

**Análise:**
1. Abrir workflow run
2. Expandir cada job
3. Procurar steps lentos

**Otimizações:**

```yaml
# 1. Usar matrix menos jobs
strategy:
  matrix:
    node-version: ['20.x']  # Remover Node 18 se não necessário

# 2. Paralelizar jobs
jobs:
  test:
    runs-on: ubuntu-latest
  lint:
    runs-on: ubuntu-latest  # Roda em paralelo
  build:
    needs: [test, lint]  # Roda depois

# 3. Usar executores melhores
runs-on: ubuntu-latest-8-cores  # Se disponível
```

---

### Problema: CI minutes esgotando

**Verificar uso:**
```
Settings → Billing and plans → Actions
```

**Reduzir consumo:**

```yaml
# 1. Não rodar em cada push
on:
  push:
    branches:
      - main  # Apenas main, não feature branches

# 2. Cancelar runs duplicadas
concurrency:
  group: ${{ github.ref }}
  cancel-in-progress: true

# 3. Usar cache agressivo
cache:
  path: node_modules
  key: ${{ runner.os }}-${{ hashFiles('package-lock.json') }}
```

---

## Secrets & Environment

### Problema: Secret não está disponível

**Erro:**
```
${{ secrets.MY_SECRET }} não é substituído
```

**Causas:**
1. Secret não criado
2. Nome errado
3. Não está no escopo

**Solução:**

1. Verificar se existe:
   ```
   Settings → Secrets and variables → Actions
   ```

2. Usar nome exato (case-sensitive):
   ```yaml
   webhook_url: ${{ secrets.SLACK_WEBHOOK }}  # Correto
   webhook_url: ${{ secrets.slack_webhook }}  # Errado
   ```

3. Org secrets vs Repo secrets:
   - Org: `Settings` (organização) → Secrets
   - Repo: `Settings` (repositório) → Secrets

---

### Problema: Variáveis de ambiente não funcionam

**Erro:**
```
$MY_VAR é vazio
```

**Solução:**

```yaml
# Correto
env:
  MY_VAR: value
run: echo $MY_VAR

# Ou
run: |
  export MY_VAR=value
  echo $MY_VAR
```

---

## Checklist Rápido

- [ ] package-lock.json atualizado?
- [ ] .env.example configurado?
- [ ] Secrets adicionados no GitHub?
- [ ] Branch protection rules ativas?
- [ ] Permissions no workflow OK?
- [ ] Cache estratégia implementada?
- [ ] Timeouts adequados?
- [ ] Logs analisados?

---

## Contatos & Recursos

**Documentação:**
- [GitHub Actions Docs](https://docs.github.com/actions)
- [Workflow Syntax](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions)

**Nossos Docs:**
- [GITHUB_ACTIONS.md](./GITHUB_ACTIONS.md)
- [WORKFLOW_CONFIGURATION.md](./WORKFLOW_CONFIGURATION.md)

**Suporte:**
- GitHub Actions → Check runs
- Look for error messages
- Review logs in workflow run

---

**Última atualização:** 2026-10-08
**Versão de referência:** Phase 22.12

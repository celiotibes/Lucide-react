# Workflow Configuration Guide

Guia passo-a-passo para configurar e customizar workflows do GitHub Actions.

## Setup Inicial

### 1. Configurar Secrets no GitHub

Acessar: `Settings → Secrets and variables → Actions`

#### Secrets Necessários

```bash
SLACK_WEBHOOK
  Descrição: Webhook URL para Slack notifications
  Valor: https://hooks.slack.com/services/[WORKSPACE_ID]/[CHANNEL_ID]/[TOKEN]
  Como obter: Slack App → Incoming Webhooks → Create New Webhook

CODECOV_TOKEN
  Descrição: Token para upload de coverage em codecov.io
  Valor: Obtido em codecov.io → Settings
  
WINDOWS_CERTIFICATE_FILE (Opcional)
  Descrição: Base64 encoded do certificado Windows
  Valor: Base64 do arquivo .pfx
  Como gerar: 
    base64 certificate.pfx > cert.txt
    # Copiar conteúdo

WINDOWS_CERTIFICATE_PASSWORD (Opcional)
  Descrição: Senha do certificado
  Valor: Sua senha
```

### 2. Setup Slack Webhook

1. Acessar Slack App Management
   ```
   https://api.slack.com/apps
   ```

2. Create New App → From scratch
   - Name: "Lucide Bot"
   - Workspace: Seu workspace

3. Features → Incoming Webhooks
   - Ativar
   - Add New Webhook to Workspace
   - Selecionar channel (ex: #deployments)
   - Copy Webhook URL

4. GitHub → Settings → Secrets
   - Name: `SLACK_WEBHOOK`
   - Value: Cole a URL

### 3. Setup Codecov

1. Acessar https://codecov.io
2. Sign in com GitHub
3. Select repository
4. Settings → Account → Copy token
5. GitHub → Settings → Secrets
   - Name: `CODECOV_TOKEN`
   - Value: Paste token

---

## Customization Guide

### Modificar Triggers

#### Test Suite

**Arquivo:** `.github/workflows/test.yml` linha 3-9

Adicionar triggers:
```yaml
on:
  push:
    branches:
      - main
      - develop
      - 'feature/**'
      - claude/**
  pull_request:
    branches:
      - main
      - develop
  schedule:
    - cron: '0 */4 * * *'  # A cada 4 horas
```

#### Scheduled Jobs

**Arquivo:** `.github/workflows/scheduled-jobs.yml` linha 3-9

Modificar crons:
```yaml
on:
  schedule:
    # Sintaxe: minute hour day-of-month month day-of-week
    # Exemplos:
    - cron: '0 0 * * 0'      # Sunday midnight
    - cron: '0 9 * * 1-5'    # Weekdays 9am
    - cron: '*/30 * * * *'   # A cada 30 min
```

**Referência Cron:**
- `0 0 * * *` = Daily 00:00 UTC
- `0 0 * * 0` = Sunday 00:00 UTC
- `0 0 1 * *` = 1º dia do mês
- `0 9-17 * * 1-5` = 9am-5pm Seg-Sex

---

### Modificar Timeouts

Aumentar timeout para workflows lentos:

```yaml
# Job-level
jobs:
  build:
    timeout-minutes: 60  # 60 minutos ao invés de 30

# Step-level
- name: Long running step
  run: ./long-script.sh
  timeout-minutes: 30
```

---

### Adicionar Plataformas ao Build

**Arquivo:** `.github/workflows/build.yml` linha ~90

```yaml
build-electron:
  strategy:
    matrix:
      os: [ubuntu-latest, windows-latest, macos-latest]
      include:
        - os: ubuntu-latest
          artifact: '*.AppImage'
        - os: windows-latest
          artifact: '*.exe'
        - os: macos-latest
          artifact: '*.dmg'
        - os: macos-13  # Intel Macs (novo)
          artifact: '*.dmg'
```

---

### Modificar Matrix Node Versions

Adicionar/remover versões:

```yaml
# Arquivo: .github/workflows/test.yml linha ~20
strategy:
  matrix:
    node-version: ['18.x', '20.x', '22.x']  # Adicionar 22.x
```

---

### Customizar Coverage Threshold

**Arquivo:** `.github/workflows/test.yml` linha ~80

```bash
# Default: 70%
if (( $(echo "$COVERAGE < 70" | bc -l) )); then
  echo "Coverage abaixo de 70%"
  exit 1
fi

# Mudar para 80%:
if (( $(echo "$COVERAGE < 80" | bc -l) )); then
  echo "Coverage abaixo de 80%"
  exit 1
fi
```

---

### Habilitar E2E Tests no Deploy

**Arquivo:** `.github/workflows/deploy.yml` linha ~200

Adicionar após build-and-test:

```yaml
- name: Run E2E tests
  run: npm run test:e2e
  env:
    CI: true
    BASE_URL: https://staging.example.com
```

---

### Modificar Notification Channels Slack

**Arquivo:** `.github/workflows/build.yml` linha ~115

```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
    channel: '#build-notifications'  # Adicionar channel
    username: 'Lucide Bot'  # Customizar username
    icon_emoji: ':rocket:'  # Adicionar emoji
```

---

## Branch Protection Configuration

### Setup Branch Protection

1. GitHub → Settings → Branches → Add rule

2. **Branch name pattern:** `main`

3. **Status checks to require:**
   - ✓ Test Suite
   - ✓ Build
   - ✓ Security
   - ✓ Lint Check

4. **Require status checks:**
   - ✓ Require branches to be up to date
   - ✓ Require checks to pass

5. **Additional rules:**
   - ✓ Require pull request reviews: 1
   - ✓ Dismiss stale reviews on new commits
   - ✓ Require code review from code owners

```yaml
# .github/CODEOWNERS (opcional)
* @team-lead
src/ @frontend-team
server/ @backend-team
```

---

## Environment Configuration

### Setup GitHub Environments

1. Settings → Environments → New environment

#### Production Environment

```
Name: production
Deployment branches: main
Reviewers: @team-lead @tech-lead
```

#### Staging Environment

```
Name: staging
Deployment branches: develop, feature/*
Reviewers: None (auto-deploy)
```

### Reference in Workflow

```yaml
deploy-production:
  environment:
    name: production
    url: https://app.example.com
```

---

## Advanced Configurations

### Using Reusable Workflows

Criar arquivo reutilizável:

`.github/workflows/shared-test.yml`:
```yaml
name: Shared Test Workflow

on:
  workflow_call:
    inputs:
      node-version:
        required: true
        type: string

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm test
```

Usar em outro workflow:
```yaml
jobs:
  test-18:
    uses: ./.github/workflows/shared-test.yml
    with:
      node-version: '18.x'
```

---

### Matrix Exclusions

Excluir combinações específicas:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node: [18, 20]
    exclude:
      - os: macos-latest
        node: 18  # Não build macOS + Node 18
```

---

### Conditional Jobs

Executar job apenas se condição:

```yaml
jobs:
  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
```

Múltiplas condições:
```yaml
if: |
  github.event_name == 'push' &&
  github.ref == 'refs/heads/main' &&
  github.event.head_commit.message != '[skip ci]'
```

---

### Upload Custom Artifacts

```yaml
- name: Upload custom artifact
  uses: actions/upload-artifact@v4
  if: always()  # Mesmo se falhar
  with:
    name: reports-${{ matrix.node-version }}
    path: |
      coverage/
      reports/
      logs/
    retention-days: 90
    compression-level: 9  # Max compression
    overwrite: true
```

---

### Download All Artifacts

```yaml
- name: Download all artifacts
  uses: actions/download-artifact@v4
  with:
    path: all-artifacts/
    pattern: '*'  # Todos os artifacts

- name: List artifacts
  run: find all-artifacts -type f
```

---

## Monitoring & Analytics

### View Workflow Runs

GitHub → Actions → Selecionar workflow

Métricas disponíveis:
- Execution time
- Artifact size
- Cache hit rate
- Cost estimation

### Export Metrics

```bash
# Via GitHub API
gh api repos/OWNER/REPO/actions/runs \
  --paginate \
  --jq '.workflow_runs[] | {name, conclusion, run_number, created_at}'
```

---

## Troubleshooting Configuration

### Debug Mode

Habilitar debug logs:
```yaml
env:
  ACTIONS_STEP_DEBUG: true  # Muito verbose!
  ACTIONS_RUNNER_DEBUG: true
```

### Verify Workflow Syntax

```bash
# Online validator
https://www.yamllint.com/

# Local validation
npm install -g ajv-cli
ajv validate -s schema.json -d workflow.yml
```

---

## Cost Optimization

### CI Minutes

Verificar uso em Settings → Billing

Reduzir custos:

```yaml
# 1. Rodas apenas em main
on:
  push:
    branches: [main]

# 2. Cancelar duplicadas
concurrency:
  group: ${{ github.ref }}
  cancel-in-progress: true

# 3. Rodas menos vezes
schedule:
  - cron: '0 0 * * 0'  # Semanal ao invés de diário

# 4. Usar runners mais baratos
runs-on: ubuntu-latest  # $0.008/min vs $0.016 (windows)
```

---

## Maintenance

### Regular Checks

- [ ] Revisar secrets (trimestral)
- [ ] Atualizar actions para v4+ (mensal)
- [ ] Limpar artifacts antigos (semanal)
- [ ] Revisar workflow runs falhados (diário)

### Dependency Updates

```bash
# Renovate/Dependabot configuração
name: Update Actions

on:
  schedule:
    - cron: '0 0 1 * *'  # 1º dia do mês

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # Update action versions
          sed -i 's|actions/.*@.*|actions/checkout@v4|g' .github/workflows/*.yml
```

---

## Best Practices

1. ✅ Sempre usar `@v4` (versão estável)
2. ✅ Usar `actions/checkout@v4` antes de jobs
3. ✅ Implementar cache agressivo
4. ✅ Usar concurrency para economizar CI minutes
5. ✅ Comentar configurações não óbvias
6. ✅ Monitorar artifact size
7. ✅ Revisar logs regularmente
8. ✅ Documentar customizações

---

## Templates Prontos

### Minimal Test Workflow
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci && npm test
```

### Complete Workflow
Ver `GITHUB_ACTIONS.md` para templates completos

---

**Última atualização:** 2026-10-08
**Status:** Production Ready

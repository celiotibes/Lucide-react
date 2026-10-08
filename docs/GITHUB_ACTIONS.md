# GitHub Actions CI/CD Pipeline

Documentação completa dos workflows de CI/CD implementados via GitHub Actions para automação de testes, build e deploy.

## Visão Geral

O pipeline de CI/CD consiste em 5 workflows principais:

1. **Test Suite** - Testes automatizados com cobertura
2. **Build** - Build para múltiplas plataformas (Web, Electron, Docker)
3. **Security** - Scanning de segurança abrangente
4. **Deploy** - Deployment automático para staging e production
5. **Scheduled Jobs** - Tarefas agendadas (updates, scans, limpeza)

## Workflows Detalhados

### 1. Test Suite (`.github/workflows/test.yml`)

Executa testes automatizados em múltiplas versões do Node.js com verificação de cobertura.

**Triggers:**
- Push em qualquer branch (main, develop, feature/*, claude/*)
- Pull requests para main/develop

**Matrix Strategy:**
- Node 18.x
- Node 20.x

**Etapas:**
1. Checkout do código
2. Setup Node.js com cache
3. Install dependencies (root + subdirectórios)
4. ESLint linting
5. TypeScript typecheck
6. Unit tests
7. Coverage report (mínimo 70%)
8. Upload para Codecov
9. Comentário no PR com resultados

**Artefatos:**
- `coverage-report-node-*` - Relatórios de cobertura
- `lint-results` - Resultados do ESLint

**Variáveis de Ambiente:**
- `CI=true` - Modo CI
- `NODE_OPTIONS=--max_old_space_size=4096` - Memória expandida

---

### 2. Build (`.github/workflows/build.yml`)

Constrói a aplicação para múltiplas plataformas.

**Triggers:**
- Push em main, develop, claude/*
- workflow_dispatch (manual)

**Jobs:**

#### build-web
- Build da aplicação web com Vite
- Versionamento: `dist/`
- Retenção: 30 dias

#### build-electron
Matrix de SO:
- Ubuntu (AppImage)
- Windows (EXE)
- macOS (DMG)

Cada SO:
- Build Electron
- Assinatura digital (com secrets)
- Upload de artefatos

#### build-docker
- Setup Docker Buildx
- Login no registry (GHCR)
- Build multi-stage com cache
- Push condicional (não em PRs)
- Notificação Slack

#### security-scan
- Trivy filesystem scan
- Trivy image scan
- Upload SARIF results

**Caching:**
- node_modules: ~60% redução de tempo
- Docker layers: Buildx cache backend

**Notificações:**
- Slack webhook em falhas/sucesso

---

### 3. Security (`.github/workflows/security.yml`)

Scanning completo de segurança com múltiplas ferramentas.

**Triggers:**
- Push em main, develop
- PRs para main, develop
- Agendado: Tuesday & Friday 00:00 UTC

**Jobs:**

#### dependency-scanning
- npm audit com JSON output
- Contagem: Critical, High, Moderate
- Conversão para SARIF
- Upload para Security tab

#### code-scanning
- ESLint com SARIF output
- Regras de segurança
- Comentário no PR

#### secret-scanning
- TruffleHog filesystem scan
- Detecção de credenciais
- Relatório de segredos

#### sast-analysis
- Semgrep com múltiplos rulesets:
  - security-audit
  - typescript
  - react
  - owasp-top-ten

#### typescript-strict
- Compilação TypeScript `--noEmit`
- Strict mode check

**Saídas:**
- SARIF results para Code Scanning
- Artefatos: audit-report.json, semgrep-results

---

### 4. Deploy (`.github/workflows/deploy.yml`)

Deployment condicional a testes passando.

**Triggers:**
- workflow_dispatch (staging/production)
- Push tags v* (production)
- PRs para main (staging)

**Jobs:**

#### pre-deploy-checks
Determina ambiente:
- workflow_dispatch → input do usuário
- Tag v* → production
- PR → staging

#### build-and-test
Executado antes de qualquer deploy:
- Lint, typecheck, test
- Build application
- Upload artifacts

#### deploy-staging
Condicional a:
- build-and-test success
- Environment = staging

Steps:
1. Download artifacts
2. Deploy via peaceiris/actions-gh-pages
3. Create GitHub deployment
4. Comment PR com URL

URL: `https://{owner}.github.io/{repo}/staging`

#### deploy-production
Condicional a:
- build-and-test success
- Environment = production

Steps:
1. Deploy via peaceiris/actions-gh-pages
2. Create GitHub Release
3. Create deployment record
4. Notificar Slack (mention channel)

#### post-deploy
Sempre executado:
- Smoke tests
- Health checks
- Create summary

---

### 5. Scheduled Jobs (`.github/workflows/scheduled-jobs.yml`)

Tarefas automáticas agendadas.

**Schedules:**
- **00:00 Sunday**: Dependency update (weekly)
- **00:00 Tue/Fri**: Security scan (twice weekly)
- **02:00 Daily**: Performance benchmark (nightly)
- **03:00 Sunday**: Cleanup artifacts (weekly)

#### dependency-update
- `npm outdated --json`
- Atualiza pacotes
- Roda testes
- Cria PR automático
- Label: `dependencies,automated`

#### security-scan-scheduled
- npm audit completo
- Semgrep scan
- TruffleHog scan
- Cria issue se critical/high

#### performance-benchmark
- Bundle size analysis
- Build time logging
- Lighthouse audit
- Armazena histórico (60 dias)

#### cleanup-artifacts
- Remove artifacts >30 dias
- Deleta workflow runs antigos
- Libera espaço

---

## Configuração de Secrets

Secrets necessários no GitHub (Settings → Secrets and variables):

```bash
SLACK_WEBHOOK          # Webhook URL para notificações Slack
CODECOV_TOKEN          # Token Codecov para upload de cobertura
GITHUB_TOKEN           # Automaticamente disponível
WINDOWS_CERTIFICATE_FILE    # Para assinatura Windows (opcional)
WINDOWS_CERTIFICATE_PASSWORD # Para assinatura Windows (opcional)
```

## Variáveis de Ambiente

Variáveis globais configuradas em `env:`:

```yaml
CI=true                              # Modo CI para testes
NODE_OPTIONS=--max_old_space_size=4096 # Memória expandida para builds
```

## Caching Strategy

### NPM Cache
```yaml
uses: actions/setup-node@v4
with:
  cache: 'npm'
  cache-dependency-path: |
    package-lock.json
    server/package-lock.json
    sync-server/package-lock.json
    mobile-app/package-lock.json
```

**Impacto:**
- Redução ~60% no tempo de install
- Reutiliza node_modules entre runs
- Fallback automático se cache falhar

### Docker Cache
```yaml
cache-from: type=gha
cache-to: type=gha,mode=max
```

**Impacto:**
- Layers reutilizáveis
- Build time reduzido ~40%

## Concurrency & Cancel

Cancelamento automático de runs duplicadas:

```yaml
concurrency:
  group: test-${{ github.ref }}
  cancel-in-progress: true
```

**Benefício:**
- Apenas o latest run executa
- Economiza CI minutes
- Reduz fila

## Status Badges

Adicionar ao README.md:

```markdown
[![Test Suite](https://github.com/USER/REPO/actions/workflows/test.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/test.yml)
[![Build](https://github.com/USER/REPO/actions/workflows/build.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/build.yml)
[![Security](https://github.com/USER/REPO/actions/workflows/security.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/security.yml)
[![Deploy](https://github.com/USER/REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/deploy.yml)
```

## Branch Protection Rules

Configurar em Settings → Branches → Branch protection rules:

```
Branch name pattern: main

Require status checks to pass before merging:
  ✓ Test Suite
  ✓ Build
  ✓ Security
  ✓ Lint Check

Require branches to be up to date: Yes
```

## Troubleshooting

Ver [CICD_TROUBLESHOOTING.md](./CICD_TROUBLESHOOTING.md)

## Performance Metrics

### Tempos Típicos

| Workflow | Tempo Médio | Cache Reuso |
|----------|------------|-----------|
| Test Suite | 5-8 min | 60% |
| Build (Web) | 4-6 min | 60% |
| Build (Electron) | 15-20 min | 40% |
| Build (Docker) | 10-15 min | 70% |
| Security Scan | 8-12 min | 50% |
| Deploy | 3-5 min | - |

### Redução de Tempo

Com caching implementado:
- **Sem cache**: ~45 min por workflow
- **Com cache**: ~15 min por workflow
- **Redução**: **~67%**

## Logs & Debugging

Acessar logs:
1. GitHub → Actions
2. Selecionar workflow run
3. Expandir job → step logs

Variáveis de debug:
```yaml
env:
  ACTIONS_STEP_DEBUG: true  # Habilita debug mode
```

## Monitoramento

### GitHub Web UI
- Actions tab → Workflows
- Status badges no README
- Branch protection status

### Slack Notifications
- Deploy status
- Build failures
- Security alerts

### Artifacts
- Coverage reports
- Build artifacts (30 dias)
- Test reports (7 dias)
- Performance benchmarks (60 dias)

## Roadmap Futuro

- [ ] Integration tests (E2E)
- [ ] Performance regression detection
- [ ] Automated rollback on failures
- [ ] Multi-environment promotion
- [ ] Blue-green deployments
- [ ] Canary releases

---

**Última atualização:** 2026-10-08
**Versão do Node.js:** 18.x, 20.x
**Docker Registry:** ghcr.io

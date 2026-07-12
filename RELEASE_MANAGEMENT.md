# 🚀 Release Management - Sistema de Gerenciamento de Aluguéis

Estratégia completa de versionamento, release e deploy para o sistema de gerenciamento de aluguéis.

---

## 📋 Sumário

1. [Estratégia de Versionamento](#estratégia-de-versionamento)
2. [Tipos de Release](#tipos-de-release)
3. [Processo de Release](#processo-de-release)
4. [Gestão de Changelog](#gestão-de-changelog)
5. [Release Checklist](#release-checklist)
6. [Automação de Versioning](#automação-de-versioning)
7. [Rollback Procedures](#rollback-procedures)

---

## 🔢 Estratégia de Versionamento

Utilizamos **Semantic Versioning (SemVer)** com o formato: `MAJOR.MINOR.PATCH(-PRERELEASE+BUILD)`

### Incrementos de Versão

#### MAJOR (Mudanças Incompatíveis)
```
v2.0.0 ← v1.9.9
```

**Exemplos**:
- Remover endpoints da API
- Alterar estrutura de resposta
- Mudança significativa de schema de database
- Descontinuar suporte de plataforma
- Reescrever core de sincronização

**Release Type**: `Major Release`
**Lead Time**: 2-4 semanas de planejamento
**Testing**: Full regression testing + compatibilidade
**Communication**: Aviso prévio aos clientes

#### MINOR (Novas Features - Backward Compatible)
```
v1.3.0 ← v1.2.9
```

**Exemplos**:
- Novos endpoints da API
- Novos campos opcionais
- Novas estratégias de preços
- Otimizações de performance
- Novos tipos de relatórios

**Release Type**: `Feature Release`
**Lead Time**: 1-2 semanas
**Testing**: Feature testing + smoke tests
**Communication**: Release notes com exemplos

#### PATCH (Bug Fixes - Backward Compatible)
```
v1.2.4 ← v1.2.3
```

**Exemplos**:
- Bug fixes em validações
- Correções de performance
- Segurança patches
- Otimizações de queries

**Release Type**: `Hotfix Release`
**Lead Time**: 1-3 dias
**Testing**: Targeted testing + regression
**Communication**: Brevemente nos release notes

### Versões Pré-release

```
v1.0.0-alpha.1      # Alpha - early development
v1.0.0-beta.1       # Beta - feature complete, testing
v1.0.0-rc.1         # Release Candidate - ready for production
v1.0.0              # Stable Release
```

**Onde usar**:
- Alpha: Desenvolvadores internos apenas
- Beta: Selected customers para feedback
- RC: Final validation antes de produção
- Stable: Production release

---

## 📦 Tipos de Release

### 1. Stable Release (Produção)
**Frequência**: A cada 2-4 semanas  
**Branch**: `main`  
**Tag**: `v1.2.3`  
**Processo**: Full testing + staging validation

```bash
# Criar release
git tag -a v1.2.3 -m "Release v1.2.3: Nova estratégia de preços"
git push origin v1.2.3

# Criar GitHub Release
gh release create v1.2.3 --draft -F CHANGELOG-1.2.3.md
```

### 2. Hotfix Release
**Frequência**: Sob demanda (crítico bugs)  
**Branch**: `hotfix/issue-XXX`  
**Tag**: `v1.2.3-hotfix.1`  
**Process**: Fast-track testing + immediate deploy

```bash
# Branching
git checkout -b hotfix/critical-sync-bug main

# Depois de fix
git tag -a v1.2.4 -m "Hotfix: Sincronização crítica"
git push origin v1.2.4
```

### 3. Staging Release
**Frequência**: Contínuo (CI/CD)  
**Branch**: `staging`  
**Tag**: `v1.2.3-staging.20240115`  
**Purpose**: Testing antes de produção

```bash
git tag -a v1.2.3-staging.20240115 -m "Staging release"
```

### 4. Alpha/Beta Release
**Frequência**: Sob demanda  
**Branch**: `develop`  
**Tag**: `v1.3.0-beta.1`  
**Purpose**: Early feedback de usuários selecionados

```bash
git tag -a v1.3.0-beta.1 -m "Beta release: Nova funcionalidade X"
```

---

## 🔄 Processo de Release

### Fase 1: Planejamento (1-2 semanas antes)

#### 1.1 Definir Scope
```
- Listar features/fixes inclusos
- Estimar impacto
- Identificar breaking changes
- Planejar comunicação
```

#### 1.2 Criar Release Branch
```bash
# Feature Release
git checkout -b release/v1.3.0 develop

# Hotfix Release
git checkout -b hotfix/v1.2.4 main
```

#### 1.3 Atualizar Versão
```bash
# package.json
{
  "name": "rental-sync",
  "version": "1.3.0",
  ...
}

# backend/src/config/version.ts
export const APP_VERSION = '1.3.0';
export const API_VERSION = 'v1';
export const RELEASE_DATE = '2024-01-20';
```

### Fase 2: Preparação (3-5 dias antes)

#### 2.1 Freeze de Features
```bash
# Bloquear PRs de features - apenas bugfixes
# Comunicar ao time
```

#### 2.2 Atualizar Documentação
```
- API Documentation (se há mudanças)
- README.md
- CHANGELOG.md
- Migration guides (se necessário)
```

#### 2.3 Performance Testing
```bash
npm run test:perf:baseline

# Validar que:
# ✅ P95 latência < 500ms
# ✅ Error rate < 1%
# ✅ Throughput > 100 req/s
```

#### 2.4 Security Testing
```bash
npm run test:security

# Checklist:
# ✅ Dependency audit
# ✅ SAST analysis
# ✅ Container scan
# ✅ SQL injection tests
```

#### 2.5 Database Migrations
```bash
# Validar que todas as migrações funcionam

npm run migrate:test

# Para rollback:
npm run migrate:rollback -- --steps 5
```

### Fase 3: Staging Deploy (2 dias antes)

```bash
# 1. Deploy para staging
npm run deploy:staging

# 2. Smoke tests
npm run test:smoke

# 3. Exploratory testing
# - Login flow
# - Property CRUD
# - Listing sync
# - Payment flow
# - Admin functions

# 4. Performance validation
# - Load times < 500ms P95
# - Memory usage stable
# - No memory leaks

# 5. Security validation
# - HTTPS working
# - CORS proper
# - Auth tokens valid
```

### Fase 4: Release (Dia do Deploy)

#### 4.1 Criar Release Tag
```bash
# Criar tag anotada
git tag -a v1.3.0 -m "Release v1.3.0

- Feature 1: Novo algoritmo de preços dinâmicos
- Feature 2: Integração com Gemini AI
- Fix: Sincronização de Booking
- Perf: -40% latência em dashboard

Breaking Changes:
- /listings endpoint agora retorna performance_metrics
- Removido deprecated /sync/manual endpoint

Migration:
- Executar: npm run migrate:v1.3.0
- Tempo estimado: 2-3 horas (horário de baixo volume)"

# Validar tag
git tag -v v1.3.0

# Fazer push
git push origin v1.3.0
```

#### 4.2 Criar GitHub Release
```bash
gh release create v1.3.0 \
  --title "v1.3.0 - Dynamic Pricing & AI Integration" \
  --draft \
  -F CHANGELOG-v1.3.0.md

# Depois de validação, publicar
gh release edit v1.3.0 --draft=false
```

#### 4.3 Deploy para Produção
```bash
# Option 1: Automated via GitHub Actions
# Push trigger deploy automaticamente

# Option 2: Manual
npm run deploy:production -- --version=v1.3.0

# 4.4 Validações Pós-Deploy
# ✅ Service health
curl https://api.example.com/api/health

# ✅ Key endpoints
curl -H "Authorization: Bearer $TOKEN" \
  https://api.example.com/api/properties?limit=1

# ✅ Database connectivity
# ✅ Redis connectivity
# ✅ External APIs (Airbnb, Booking, Gemini)
# ✅ Alertas não disparados
# ✅ Performance metrics normal
```

#### 4.5 Notificação
```bash
# Post em #releases Slack
@channel 🚀 **v1.3.0 Released**

Features:
- Dynamic pricing engine
- Gemini AI integration
- Performance improvements (-40% latency)

Fixes:
- Booking sync issues

Breaking Changes:
- /listings response format changed
- /sync/manual endpoint removed

Rollback available: v1.2.3
Status: Monitoring...
```

### Fase 5: Monitoramento (24-48h)

#### 5.1 Métricas Críticas
```
- Error rate < 1%
- P95 latência < 500ms
- P99 latência < 1000ms
- CPU < 80%
- Memory stable
- Database connections normal
```

#### 5.2 Alertas Ativados
```
- High error rate
- High latency
- Service down
- Database issues
```

#### 5.3 Bugs Conhecidos
- Documentar issues encontradas
- Priorizar críticos para hotfix
- Não-críticos para próxima release

### Fase 6: Pós-Release (1-2 semanas)

#### 6.1 Feedback
- Coletar feedback de usuários
- Monitorar bugs reports
- Analisar performance metrics

#### 6.2 Documentação
- Atualizar runbooks
- Documentar breaking changes
- Criar migration guides

#### 6.3 Merge Back
```bash
# Merge release branch de volta para main/develop
git checkout main
git merge release/v1.3.0
git merge release/v1.3.0 develop

# Tag para merge
git tag -a v1.3.0-merged -m "Merged v1.3.0"
```

---

## 📝 Gestão de Changelog

### Formato de Changelog

```markdown
# Changelog

Todas as mudanças significativas neste projeto estão documentadas aqui.

## [1.3.0] - 2024-01-20

### Added
- Nova estratégia de preços dinâmica (#1234)
- Integração com Gemini AI para recomendações (#1235)
- Endpoint para análise de competidores (#1236)

### Changed
- **BREAKING**: Estrutura de resposta de `/listings` (#1237)
  Antes: `{ price: 50, strategy: 'static' }`
  Depois: `{ pricing: { current: 50, strategy: 'static' }, metrics: {...} }`
- Performance: Otimização de queries de dashboard (-40% latência) (#1238)

### Deprecated
- Endpoint `/sync/manual` será removido em v2.0 (#1239)
- Campo `legacy_status` em Properties deprecated (#1240)

### Removed
- Suporte para plataforma BookingLegacy (migrar para Booking v2) (#1241)
- Endpoint `/pricing/old-analysis` removido (#1242)

### Fixed
- Sincronização incorreta com Booking quando property tem espaços (#1243)
- Memory leak em Redis connection pool (#1244)
- Crash quando lead email é vazio (#1245)

### Security
- Atualizado express para 4.18.2 (CVE-2024-XXXXX) (#1246)
- Adicionado rate limiting para /auth endpoints (#1247)

## [1.2.3] - 2024-01-06
...
```

### Geração Automática via Commits

Usar prefixos de commit convencionais:

```bash
# Feature
git commit -m "feat: adicionar preços dinâmicos (#1234)"

# Bugfix
git commit -m "fix: sincronização incorreta com Booking"

# Breaking change
git commit -m "feat!: nova estrutura de response em listings"

# Security
git commit -m "security: atualizar dependências críticas"

# Performance
git commit -m "perf: otimizar query de dashboard"

# Docs
git commit -m "docs: adicionar migration guide v1.2->v1.3"
```

### Script para Gerar Changelog

```bash
#!/bin/bash
# scripts/generate-changelog.sh

VERSION=$1
START_TAG=$(git describe --tags --abbrev=0 HEAD^)

echo "# Changelog v$VERSION" > CHANGELOG-$VERSION.md
echo "" >> CHANGELOG-$VERSION.md
echo "## Features" >> CHANGELOG-$VERSION.md
git log $START_TAG..HEAD --oneline | grep "^.*feat:" >> CHANGELOG-$VERSION.md

echo "" >> CHANGELOG-$VERSION.md
echo "## Bugfixes" >> CHANGELOG-$VERSION.md
git log $START_TAG..HEAD --oneline | grep "^.*fix:" >> CHANGELOG-$VERSION.md

echo "" >> CHANGELOG-$VERSION.md
echo "## Performance" >> CHANGELOG-$VERSION.md
git log $START_TAG..HEAD --oneline | grep "^.*perf:" >> CHANGELOG-$VERSION.md
```

---

## ✅ Release Checklist

### Pré-Release (1 semana)
- [ ] Feature freeze comunicado
- [ ] Todas as features em main/develop
- [ ] Versão atualizada (package.json, src/config/version.ts)
- [ ] CHANGELOG.md atualizado
- [ ] Documentação de breaking changes criada
- [ ] Migration scripts testados

### Dia da Release
- [ ] Release branch criada
- [ ] All tests passing (unit, integration, e2e)
- [ ] Performance tests baseline met
- [ ] Security scan clean
- [ ] Database migrations validated
- [ ] Staging deploy validated
- [ ] Smoke tests passed
- [ ] Tag criada e assinada
- [ ] GitHub Release criada (draft)
- [ ] Notification template pronto

### Deploy para Produção
- [ ] Finalize GitHub Release
- [ ] Deploy trigger enviado
- [ ] Health checks passing
- [ ] Key endpoints validated
- [ ] Database connectivity OK
- [ ] Redis connectivity OK
- [ ] External APIs responding
- [ ] Alerts not triggered
- [ ] Performance metrics normal
- [ ] Slack notification enviada
- [ ] Create Jira ticket para monitoring

### Pós-Release (24-48h)
- [ ] Error rate < 1%
- [ ] Latência P95 < 500ms
- [ ] Nenhum bug crítico reportado
- [ ] User feedback monitorado
- [ ] Performance baseline consistent
- [ ] Security issues monitored
- [ ] Logs normais
- [ ] Database performance OK

### Pós-Release (1 semana)
- [ ] All PRs para hotfixes merged
- [ ] Release branch merged back
- [ ] Changelog final
- [ ] Documentação final
- [ ] Post-mortem (se houver issues)

---

## 🤖 Automação de Versioning

### GitHub Actions Workflow

```yaml
name: Release

on:
  push:
    tags:
      - 'v[0-9]+.[0-9]+.[0-9]+'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Extract version
        id: version
        run: echo "version=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT
      
      - name: Create Release
        uses: ncipollo/release-action@v1
        with:
          tag: ${{ steps.version.outputs.version }}
          draft: true
          bodyFile: CHANGELOG-${{ steps.version.outputs.version }}.md
      
      - name: Deploy to Production
        run: |
          npm run deploy:production -- \
            --version=${{ steps.version.outputs.version }}
      
      - name: Smoke Tests
        run: npm run test:smoke
      
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK }}
          payload: |
            {
              "text": "🚀 Released ${{ steps.version.outputs.version }}",
              "blocks": [...]
            }
```

### NPM Scripts

```json
{
  "scripts": {
    "version": "npm run build && npm test",
    "postversion": "git push --follow-tags",
    "release:major": "npm version major",
    "release:minor": "npm version minor",
    "release:patch": "npm version patch",
    "release:beta": "npm version prerelease --preid=beta"
  }
}
```

---

## 🔙 Rollback Procedures

### Scenario 1: Crítico Bug em Produção

```bash
# 1. Imediato: Revert para versão anterior
git checkout v1.2.3
npm run deploy:production --version=v1.2.3

# 2. Validar rollback
curl https://api.example.com/api/health

# 3. Notificar
# Post no Slack #incidents
# Create incident ticket
# Start investigation
```

### Scenario 2: Performance Degradation

```bash
# 1. Verificar métricas
# P95 latência > 1000ms? Sim → Rollback

# 2. Rollback gradual (canary rollback)
# 10% traffic para v1.2.3 (5 min)
# 25% traffic para v1.2.3 (5 min)
# 50% traffic para v1.2.3 (10 min)
# 100% traffic para v1.2.3

# 3. Monitorar
# Latência volta ao normal? Continuar ou revert

# 4. Comunicar
# Slack notification
```

### Scenario 3: Database Migration Issue

```bash
# 1. Rollback database
npm run migrate:rollback -- --steps 1 --version=v1.2.3

# 2. Rollback application
git checkout v1.2.3
npm run deploy:production

# 3. Fix and retest
# Fix migration em develop
# Test thoroughly
# Re-release
```

### Rollback Checklist

- [ ] Validate rollback target version
- [ ] Backup current version code
- [ ] Backup database (if migrations)
- [ ] Stop current deployment
- [ ] Deploy previous version
- [ ] Run health checks
- [ ] Verify key endpoints
- [ ] Monitor for 15+ minutes
- [ ] Notify stakeholders
- [ ] Create incident report
- [ ] Plan post-mortem
- [ ] Start investigation

---

## 📊 Versioning Statistics

### Release Cadence Target

| Release Type | Frequency | Lead Time | Duration |
|-------------|-----------|-----------|----------|
| Patch (Hotfix) | As needed | 1-3 days | 30 min |
| Minor (Features) | Every 2 weeks | 1-2 weeks | 2-3 hours |
| Major | Every 3 months | 2-4 weeks | 4+ hours |
| Beta | As needed | 1 week | 2 hours |

### Quality Gates

```
✅ All tests passing (unit, integration, e2e)
✅ Code coverage > 80%
✅ Performance baseline met
✅ Security scan clean
✅ Staging validation passed
✅ Documentation updated
✅ Changelog written
```

---

## 📞 Suporte

- **Release Process**: https://wiki.example.com/releases
- **Rollback Guide**: https://wiki.example.com/rollback
- **SemVer Spec**: https://semver.org
- **Slack Channel**: #releases

---

**Última Atualização**: 2024-01-15  
**Status**: ✅ Pronto para Implementação

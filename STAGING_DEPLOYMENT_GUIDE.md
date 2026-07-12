# Guia de Deploy para Staging - Sistema de Gerenciamento de Aluguéis

## 📋 Visão Geral

Este guia documenta o processo completo de deploy para o ambiente de staging do sistema de gerenciamento de aluguéis de kitnets da UFSC.

## 🎯 Ambiente de Staging

### Características
- **Propósito**: Validação pré-produção, testes de integração, staging de features
- **Dados**: Cópia do banco de dados de produção (atualizada semanalmente)
- **Tráfego**: Limitado a equipe interna e clientes beta
- **SLA**: 99% disponibilidade (sem SLA crítico como produção)

### URLs de Staging
```
API: https://api-staging.example.com
Dashboard: https://staging.example.com
Admin: https://admin-staging.example.com
```

## 🔧 Pré-requisitos

### Dependências do Sistema
```bash
# Node.js 18+ com npm
node --version  # v18.0.0+
npm --version   # v9.0.0+

# PostgreSQL 14+
psql --version  # PostgreSQL 14+

# Redis 6+
redis-cli --version  # redis-cli 6.0+

# Docker (opcional, para ambiente isolado)
docker --version
docker-compose --version
```

### Permissões de Deploy
- Acesso SSH ao servidor de staging
- Acesso ao repositório GitHub (chave SSH configurada)
- Permissões de escrita no database de staging
- Credenciais AWS para S3 (se aplicável)

## 📦 Preparação para Deploy

### 1. Configuração de Variáveis de Ambiente

Criar arquivo `.env.staging` baseado em `.env.example`:

```bash
# Backend - Variables obrigatórias
NODE_ENV=staging
PORT=3000
LOG_LEVEL=DEBUG

# Database
DATABASE_URL=postgresql://staging_user:password@staging-db:5432/rental_sync_staging
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://staging-redis:6379

# Auth
JWT_SECRET=<generate-new-secret-for-staging>
JWT_EXPIRATION=7d

# Platform APIs (Credenciais de teste)
BOOKING_API_KEY=<staging-booking-key>
AIRBNB_API_KEY=<staging-airbnb-key>
VRBO_API_KEY=<staging-vrbo-key>
GEMINI_API_KEY=<staging-gemini-key>

# Webhooks
BOOKING_WEBHOOK_SECRET=<staging-webhook-secret>
AIRBNB_WEBHOOK_SECRET=<staging-webhook-secret>
VRBO_WEBHOOK_SECRET=<staging-webhook-secret>

# Features
ENABLE_DYNAMIC_PRICING=true
ENABLE_AI_LEAD_SCORING=true
ENABLE_DETAILED_LOGGING=true
```

### 2. Checklist Pré-Deploy

- [ ] Todas as mudanças foram commitadas e pushed
- [ ] Testes passaram localmente (`npm test`)
- [ ] Build foi testado localmente (`npm run build`)
- [ ] Sem secrets ou credenciais no código
- [ ] .env.staging foi atualizado com valores corretos
- [ ] Migrations foram revisadas e testadas
- [ ] Documentação foi atualizada
- [ ] Changelog foi atualizado

## 🚀 Processo de Deploy

### Opção 1: Deploy Manual

#### Passo 1: Conectar ao Servidor de Staging
```bash
ssh deploy@staging.example.com
cd /var/www/rental-sync-backend
```

#### Passo 2: Atualizar Código
```bash
# Fazer backup do código atual
cp -r . ../rental-sync-backup-$(date +%Y%m%d-%H%M%S)

# Atualizar repositório
git fetch origin
git checkout staging
git pull origin staging
```

#### Passo 3: Instalar Dependências
```bash
npm install --production
npm run build
```

#### Passo 4: Executar Migrations
```bash
# Listar migrations pendentes
npm run migrate -- --dry-run

# Executar migrations
npm run migrate

# Verificar status
npm run migrate -- --status
```

#### Passo 5: Reiniciar Serviços
```bash
# Parar serviços atuais
systemctl stop rental-sync-backend
systemctl stop rental-sync-workers

# Limpar cache
redis-cli FLUSHDB

# Iniciar serviços
systemctl start rental-sync-backend
systemctl start rental-sync-workers

# Verificar status
systemctl status rental-sync-backend
systemctl status rental-sync-workers
```

#### Passo 6: Validar Deploy
```bash
# Verificar saúde da API
curl https://api-staging.example.com/health

# Verificar logs
tail -f /var/log/rental-sync/app.log

# Executar testes de smoke
npm run test:smoke
```

### Opção 2: Deploy com Docker (Recomendado)

#### Passo 1: Build da Imagem Docker
```bash
docker build -f Dockerfile.staging -t rental-sync:staging-v1.0.0 .
```

#### Passo 2: Push para Registry
```bash
docker tag rental-sync:staging-v1.0.0 registry.example.com/rental-sync:staging-v1.0.0
docker push registry.example.com/rental-sync:staging-v1.0.0
```

#### Passo 3: Deploy com Docker Compose
```bash
# Atualizar docker-compose.staging.yml
# Alterar imagem para a versão mais recente

# Deploy
docker-compose -f docker-compose.staging.yml down
docker-compose -f docker-compose.staging.yml up -d

# Verificar status
docker-compose -f docker-compose.staging.yml ps
```

#### Passo 4: Executar Migrations em Container
```bash
docker-compose -f docker-compose.staging.yml exec backend npm run migrate
```

### Opção 3: Deploy com CI/CD (GitHub Actions)

#### Arquivo `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Deploy to staging server
        env:
          DEPLOY_KEY: ${{ secrets.STAGING_DEPLOY_KEY }}
          DEPLOY_HOST: staging.example.com
          DEPLOY_USER: deploy
        run: |
          mkdir -p ~/.ssh
          echo "$DEPLOY_KEY" > ~/.ssh/id_rsa
          chmod 600 ~/.ssh/id_rsa
          ssh-keyscan -H $DEPLOY_HOST >> ~/.ssh/known_hosts
          
          ssh $DEPLOY_USER@$DEPLOY_HOST << 'EOF'
          cd /var/www/rental-sync-backend
          git fetch origin staging && git checkout staging && git pull origin staging
          npm install --production
          npm run build
          npm run migrate
          systemctl restart rental-sync-backend rental-sync-workers
          EOF
      
      - name: Health check
        run: |
          for i in {1..30}; do
            if curl -f https://api-staging.example.com/health; then
              echo "✓ Staging is healthy"
              exit 0
            fi
            echo "Waiting for staging to be ready... ($i/30)"
            sleep 2
          done
          echo "✗ Staging health check failed"
          exit 1
      
      - name: Slack notification
        if: always()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Deploy to Staging: ${{ job.status }}",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deploy*\nStatus: ${{ job.status }}\nBranch: ${{ github.ref }}\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }
```

## 📊 Monitoramento Pós-Deploy

### Logs
```bash
# Logs de aplicação
tail -f /var/log/rental-sync/app.log

# Logs de workers
tail -f /var/log/rental-sync/workers.log

# Logs de sistema
journalctl -u rental-sync-backend -f
```

### Métricas
```bash
# Verificar CPU e memória
top

# Verificar conexões de database
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Verificar jobs na fila Redis
redis-cli LLEN bull:sync-listings
redis-cli LLEN bull:update-pricing
redis-cli LLEN bull:lead-management
```

### Alertas Automáticos
- CPU > 80% por mais de 5 minutos
- Memória > 85% por mais de 5 minutos
- Erro rate > 1% nas últimas 5 minutos
- Latência P95 > 1000ms
- Workers parados por mais de 10 minutos

## 🔄 Rollback

### Rollback Rápido
```bash
ssh deploy@staging.example.com
cd /var/www/rental-sync-backend

# Reverter para commit anterior
git revert HEAD --no-edit

# Ou checkout direto
git checkout <commit-anterior>

# Rebuild e restart
npm install --production
npm run build
systemctl restart rental-sync-backend rental-sync-workers
```

### Rollback com Backup
```bash
# Se existir backup
cd /var/www
rm -rf rental-sync-backend
cp -r rental-sync-backup-20240101-120000 rental-sync-backend
cd rental-sync-backend

# Restart
systemctl restart rental-sync-backend rental-sync-workers
```

### Rollback de Database
```bash
# Lista de backups
ls -la /var/backups/rental-sync-db-*.sql.gz

# Restaurar de backup
gunzip -c /var/backups/rental-sync-db-20240101-120000.sql.gz | psql rental_sync_staging
```

## 🧪 Testes de Staging

### Testes Manuais
1. **Login**: Verificar autenticação com conta de teste
2. **CRUD**: Criar, ler, atualizar, deletar propriedades
3. **Sync**: Verificar sincronização com plataformas
4. **Pricing**: Testar cálculo de preços dinâmicos
5. **Leads**: Testar gerenciamento de leads

### Testes Automatizados
```bash
# Smoke tests
npm run test:smoke

# Integration tests
npm run test:integration

# E2E tests (se disponível)
npm run test:e2e

# Load test
npm run test:load
```

### Performance Testing
```bash
# Verificar tempo de resposta
ab -n 100 -c 10 https://api-staging.example.com/api/properties

# Load test com k6
k6 run load-test.js
```

## 📝 Processo de Versionamento

### Versioning Strategy
- **Major**: Mudanças que quebram compatibilidade
- **Minor**: Novas features
- **Patch**: Bug fixes

Exemplo: `v1.2.3-staging.5` (5ª build do staging da v1.2.3)

### Changelog
Manter `CHANGELOG.md` atualizado:

```markdown
## [1.2.0] - 2024-01-15

### Added
- Logger integration em 3 workers
- .env.example com variáveis completas
- Staging deployment guide

### Fixed
- Bug na sincronização de preços
- Timeout em queries longas

### Changed
- Melhorado performance do dashboard em 50%
```

## 🔐 Segurança

### Secrets Management
- Usar GitHub Secrets para credenciais de CI/CD
- Usar HashiCorp Vault para staging runtime secrets
- Rotacionar JWT_SECRET a cada 90 dias
- Manter logs de acesso em `/var/log/auth.log`

### Compliance
- Verificar logs de deployment
- Auditar mudanças de database
- Revisar permissões de acesso
- Cumprir LGPD/GDPR para dados pessoais

## 📞 Troubleshooting

### API não responde
```bash
# Verificar se serviço está rodando
systemctl status rental-sync-backend

# Verificar porta
netstat -tlnp | grep 3000

# Verificar logs
tail -100 /var/log/rental-sync/app.log
```

### Workers parados
```bash
# Verificar status
systemctl status rental-sync-workers

# Reiniciar workers
systemctl restart rental-sync-workers

# Verificar fila Redis
redis-cli KEYS "bull:*"
```

### Database connection timeout
```bash
# Verificar conexões ativas
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Verificar pool size
grep DATABASE_POOL_SIZE .env.staging

# Aumentar se necessário
```

## 📞 Contatos Importantes

- **DevOps Lead**: devops@example.com
- **On-call**: [link para PagerDuty]
- **Slack Channel**: #rental-sync-deploys
- **Incident Response**: [link para runbook]

## ✅ Checklist Pós-Deploy

- [ ] Saúde da API verificada (HTTP 200 em /health)
- [ ] Logs sem erros críticos
- [ ] Testes de smoke passaram
- [ ] Alertas monitorados por 30 minutos
- [ ] Equipe foi notificada do deploy
- [ ] Changelog foi atualizado
- [ ] Versão foi taguada no git
- [ ] Documentação foi atualizada
- [ ] Feedback foi coletado

## 🚀 Próximas Etapas

- [ ] Configurar monitoring com Datadog/Sentry
- [ ] Implementar feature flags para rollback sem redeploy
- [ ] Configurar auto-scaling baseado em load
- [ ] Implementar blue-green deployment
- [ ] Configurar disaster recovery

---

**Última atualização**: 2024-01-15  
**Versão**: 1.0  
**Próxima revisão**: 2024-02-15

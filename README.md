# 🏠 Sistema de Gerenciamento de Aluguéis - Lucide React

[![GitHub Actions](https://github.com/celiotibes/Lucide-react/workflows/CI%2FCD/badge.svg)](https://github.com/celiotibes/Lucide-react/actions)
[![Performance Baseline](https://img.shields.io/badge/performance-baseline-brightgreen)](./PERFORMANCE_BASELINE.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

Plataforma completa de gerenciamento de aluguéis com sincronização multi-plataforma, preços dinâmicos e análise de leads.

---

## 📋 Sumário

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Arquitetura](#-arquitetura)
- [Documentação](#-documentação)
- [Desenvolvimento](#-desenvolvimento)
- [Deployment](#-deployment)
- [Suporte](#-suporte)

---

## ⭐ Features

### 🏠 Gerenciamento de Propriedades
- ✅ CRUD de propriedades
- ✅ Dashboard com analytics
- ✅ Histórico de ocupação
- ✅ Performance por plataforma

### 📢 Anúncios Multi-Plataforma
- ✅ Sincronização automática (Airbnb, Booking, VRBO)
- ✅ Atualização de conteúdo em tempo real
- ✅ Publicação/despublicação
- ✅ Histórico de sincronização

### 💰 Preços Dinâmicos
- ✅ Análise de preços competitivos
- ✅ Recomendações baseadas em ocupação
- ✅ Múltiplas estratégias (static, dynamic, seasonal)
- ✅ Histórico de preços

### 👥 Gerenciamento de Leads
- ✅ Captura de leads multi-canal (WhatsApp, Facebook, Booking, Airbnb)
- ✅ Funil de sales (inquiry → closed)
- ✅ Scoring automático
- ✅ Histórico de contatos

### 📊 Analytics & Monitoramento
- ✅ 8 dashboards Grafana
- ✅ 20+ alertas inteligentes
- ✅ Performance testing automatizado
- ✅ Logs estruturados

---

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- Docker & Docker Compose
- Make (opcional, mas recomendado)

### Setup (2 minutos)

```bash
# 1. Clonar repositório
git clone https://github.com/celiotibes/Lucide-react.git
cd Lucide-react

# 2. Instalar dependências
npm install

# 3. Iniciar ambiente completo
make dev

# 4. Validar saúde do sistema
make health
```

### Acessos Imediatos

| Serviço | URL | Credenciais |
|---------|-----|-------------|
| **API** | http://localhost:3000 | - |
| **Grafana** | http://localhost:3001 | admin/admin |
| **Prometheus** | http://localhost:9090 | - |
| **AlertManager** | http://localhost:9093 | - |
| **Database** | localhost:5432 | rental_user/rental_pass |
| **Redis** | localhost:6379 | - |

---

## 🏗️ Arquitetura

### Stack Tecnológico

```
Frontend/API:     Node.js 18 + TypeScript + Express
Database:         PostgreSQL 15 (+ replicas em prod)
Cache:            Redis 7
Message Queue:    BullMQ (+ Redis)
Logging:          Structured JSON + ELK Stack
Monitoring:       Prometheus + Grafana + AlertManager
Deployment:       Docker + Docker Compose (dev) / K8s (prod)
CI/CD:            GitHub Actions
```

### Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────────┐
│                   Load Balancer (ALB)                    │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   ┌────▼────┐             ┌────▼────┐
   │  API    │             │  API    │  (Replicas)
   │ :3000   │             │ :3000   │
   └────┬────┘             └────┬────┘
        │                       │
        └───────────┬───────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
┌───▼──┐      ┌────▼────┐      ┌──▼───┐
│  DB  │      │  Redis  │      │ S3   │
│      │      │  Cache  │      │Backup│
└──────┘      └─────────┘      └──────┘

Workers (BullMQ):
├─ sync-listings (Airbnb, Booking, VRBO)
├─ update-pricing (análise + recomendações)
└─ lead-management (scoring + notificações)

Monitoring Stack:
├─ Prometheus (métricas)
├─ Grafana (dashboards)
├─ AlertManager (alertas)
└─ ELK (logs)
```

---

## 📚 Documentação

### 📖 Guias Principais

| Documento | Conteúdo |
|-----------|----------|
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | 25+ endpoints REST com exemplos |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Design de sistema completo |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Guia de contribuição |
| [SECURITY.md](./SECURITY.md) | Segurança e hardening |

### 🔧 Documentação Operacional

| Documento | Conteúdo |
|-----------|----------|
| [PERFORMANCE_BASELINE.md](./PERFORMANCE_BASELINE.md) | Métricas de performance esperadas |
| [STAGING_DEPLOYMENT_GUIDE.md](./STAGING_DEPLOYMENT_GUIDE.md) | Deploy em staging |
| [PRODUCTION_DEPLOYMENT_GUIDE.md](./PRODUCTION_DEPLOYMENT_GUIDE.md) | Deploy em produção |
| [RELEASE_MANAGEMENT.md](./RELEASE_MANAGEMENT.md) | Processo de release (SemVer) |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Resposta a incidentes (P1-P4) |

### 📊 Documentação de Monitoramento

| Arquivo | Conteúdo |
|---------|----------|
| `backend/monitoring/prometheus.yml` | Configuração de métricas |
| `backend/monitoring/alerts.yaml` | 20+ alertas inteligentes |
| `backend/monitoring/alertmanager.yml` | Roteamento de alertas |
| `backend/monitoring/grafana-dashboards-config.yaml` | 8 dashboards |

---

## 💻 Desenvolvimento

### Comandos Principais

```bash
# Ver todos os comandos disponíveis
make help

# Ambiente
make dev              # Iniciar environment completo
make stop             # Parar serviços
make clean            # Limpeza de artifacts
make clean-all        # Remover tudo (cuidado!)

# Build & Quality
make build            # Compilar TypeScript
make lint             # ESLint check
make format           # Prettier format
make check            # Lint + types + tests

# Testing
make test             # Todos os testes
make test-unit        # Testes unitários
make test-integration # Testes de integração
make test-e2e         # Testes end-to-end

# Performance
make perf-load        # Load test (19 min, 100 users)
make perf-soak        # Soak test (40 min, 20 users)
make perf-stress      # Stress test (12 min, até 500 users)
make perf-baseline    # Todos os testes de performance

# Database
make migrate          # Rodar migrations
make db-seed          # Popular com dados de teste
make db-reset         # Reset completo (confirmação obrigatória)

# Monitoring
make health           # Health check completo
make prometheus       # Abrir Prometheus
make grafana          # Abrir Grafana
make alerts           # Abrir AlertManager

# Debug
make shell            # Shell do container API
make db-shell         # PostgreSQL psql
make redis-shell      # Redis CLI
make logs             # Logs da API
```

### Estrutura de Diretórios

```
.
├── backend/
│   ├── src/
│   │   ├── shared/          # Código compartilhado (logger, types)
│   │   ├── properties/      # Properties domain
│   │   ├── listings/        # Listings domain
│   │   ├── pricing/         # Pricing domain
│   │   ├── leads/           # Leads domain
│   │   ├── workers/         # BullMQ workers
│   │   └── health/          # Health checks
│   ├── migrations/          # Database migrations
│   ├── performance/         # Performance testing (k6)
│   ├── monitoring/          # Prometheus, Grafana, AlertManager configs
│   └── package.json
│
├── scripts/                 # Bash scripts operacionais
│   ├── pre-deploy-check.sh
│   ├── deep-health-check.sh
│   ├── check-metrics.sh
│   └── notify-slack.sh
│
├── kubernetes/              # K8s manifests (production)
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── configmap.yaml
│   └── ingress.yaml
│
├── nginx/                   # Nginx configuration
│   ├── nginx.conf
│   └── ssl-defaults.conf
│
├── .github/
│   ├── workflows/
│   │   └── ci-cd.yml
│   └── ISSUE_TEMPLATE/
│
├── Makefile                 # 40+ comandos
├── docker-compose.yml       # 9 serviços para dev
├── Dockerfile               # Build otimizado
├── .env.example             # Template de env vars
├── .editorconfig            # Consistência de editor
├── .npmrc                   # NPM config
│
└── Documentação/
    ├── API_DOCUMENTATION.md
    ├── ARCHITECTURE.md
    ├── CONTRIBUTING.md
    ├── SECURITY.md
    ├── PERFORMANCE_BASELINE.md
    ├── STAGING_DEPLOYMENT_GUIDE.md
    ├── PRODUCTION_DEPLOYMENT_GUIDE.md
    ├── RELEASE_MANAGEMENT.md
    └── INCIDENT_RESPONSE.md
```

### Workflow de Desenvolvimento

```bash
# 1. Criar branch
git checkout -b feature/new-feature

# 2. Fazer mudanças
vim backend/src/...

# 3. Validar código
make lint
make format
make test

# 4. Validar performance (se relevante)
make perf-load

# 5. Fazer commit
git add .
git commit -m "feat: descrição da feature"

# 6. Push e PR
git push origin feature/new-feature
# Abrir PR no GitHub
# CI/CD executa automaticamente
```

---

## 🚀 Deployment

### Desenvolvimento Local (1 comando)
```bash
make dev
```
Inicia: API, PostgreSQL, Redis, Prometheus, Grafana, AlertManager

### Staging (Automated)
```bash
make pre-deploy      # Validações
make deploy-staging  # Deploy
make health          # Validar
```

### Produção (Canary Deployment)
```bash
# Pré-requisitos
make pre-deploy      # Validar tudo

# Deploy (canary: 5% → 25% → 50% → 100%)
make deploy-prod

# Monitorar
make health
make prometheus
make grafana

# Rollback se necessário (reverter para v1.2.3)
git checkout v1.2.3
make deploy-prod
```

### Estratégias Disponíveis

| Estratégia | Zero Downtime | Rollback | Monitoramento |
|-----------|---------------|----------|---------------|
| **Blue-Green** | ✅ Sim | ✅ Instantâneo | ⚠️ Manual |
| **Canary** | ✅ Sim | ✅ Automático | ✅ Contínuo |
| **Rolling** | ❌ Não | ⚠️ Lento | ⚠️ Parcial |

---

## 🔐 Segurança

### Recursos de Segurança

- ✅ JWT authentication
- ✅ RBAC (Role-based access control)
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS protection
- ✅ CSRF tokens
- ✅ Rate limiting
- ✅ Input validation
- ✅ SSL/TLS (production)

Ver [SECURITY.md](./SECURITY.md) para detalhes completos.

---

## 📊 Monitoramento

### Dashboards Grafana

1. **Overview** - Sistema geral
2. **API Performance** - Latência e throughput
3. **Database** - PostgreSQL metrics
4. **Redis Cache** - Cache performance
5. **Workers** - BullMQ jobs
6. **Infrastructure** - CPU, Memory, Disk
7. **Business Metrics** - KPIs de negócio
8. **Alerts Status** - Alertas ativos

### Health Checks

```bash
# Liveness (está UP?)
curl http://localhost:3000/api/health

# Readiness (está PRONTO?)
curl http://localhost:3000/api/health/ready

# Detalhado (todas as métricas)
curl http://localhost:3000/api/health/detailed
```

---

## 🧪 Testing

### Coverage

- ✅ Unit tests: 80%+ coverage
- ✅ Integration tests: Críticos + happy paths
- ✅ E2E tests: User flows completos
- ✅ Performance tests: Load, soak, stress

### Executar Testes

```bash
make test              # Todos
make test-unit         # Unitários
make test-integration  # Integração
make test-e2e          # End-to-end
make perf-baseline     # Performance completo
```

---

## 🐛 Issues & Bugs

Encontrou um bug? [Criar bug report](https://github.com/celiotibes/Lucide-react/issues/new?template=bug_report.md)

Quer sugerir uma feature? [Feature request](https://github.com/celiotibes/Lucide-react/issues/new?template=feature_request.md)

---

## 📖 Como Contribuir

Leia [CONTRIBUTING.md](./CONTRIBUTING.md) para:
- Processo de pull request
- Padrões de código
- Convenções de commit
- Setup de desenvolvimento

---

## 📞 Suporte

- **Email**: support@example.com
- **Slack**: #rental-sync
- **GitHub Issues**: [Criar issue](https://github.com/celiotibes/Lucide-react/issues)
- **Docs**: [Wiki](https://github.com/celiotibes/Lucide-react/wiki)

---

## 📄 License

MIT License - veja [LICENSE](./LICENSE) para detalhes

---

## 🙋 Autores

- **Time de Desenvolvimento**: @celiotibes
- **Arquitetura**: Microserviços serverless-ready
- **Operações**: Platform Engineering

---

## 🎯 Roadmap

### Fase Atual (✅ Completa)
- [x] Performance testing baseline
- [x] Logging & staging deployment
- [x] CI/CD + Monitoring
- [x] Automações operacionais

### Próximas Fases
- [ ] E2E Testing (Playwright)
- [ ] Full documentation
- [ ] Production hardening
- [ ] Mobile app (React Native)

---

**Última atualização**: 2024-01-20  
**Versão**: 1.0.0  
**Status**: ✅ Production Ready

---

**Pronto para começar?** → `make dev` 🚀

.PHONY: help dev start stop logs build test lint format clean health deploy check

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
NC := \033[0m

help: ## Show this help message
	@echo "$(BLUE)Sistema de Gerenciamento de Aluguéis - Comandos Disponíveis$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(BLUE)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ============================================================================
# DESENVOLVIMENTO
# ============================================================================

dev: ## Iniciar ambiente de desenvolvimento (docker-compose)
	@echo "$(GREEN)🚀 Iniciando ambiente de desenvolvimento...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✅ Serviços iniciados:$(NC)"
	@echo "  API:         http://localhost:3000"
	@echo "  Prometheus:  http://localhost:9090"
	@echo "  Grafana:     http://localhost:3001"

start: ## Alias para 'dev'
	@$(MAKE) dev

stop: ## Parar todos os serviços docker
	@echo "$(GREEN)⏹️  Parando serviços...$(NC)"
	docker-compose down

logs: ## Ver logs do container API
	docker-compose logs -f api

logs-db: ## Ver logs do PostgreSQL
	docker-compose logs -f postgres

logs-redis: ## Ver logs do Redis
	docker-compose logs -f redis

shell: ## Entrar no shell do container API
	docker-compose exec api bash

db-shell: ## Entrar no PostgreSQL
	docker-compose exec postgres psql -U rental_user -d rental_sync

redis-shell: ## Entrar no Redis CLI
	docker-compose exec redis redis-cli

# ============================================================================
# BUILD & TEST
# ============================================================================

build: ## Compilar projeto TypeScript
	@echo "$(GREEN)🔨 Compilando TypeScript...$(NC)"
	npm run build
	@echo "$(GREEN)✅ Build completo!$(NC)"

test: ## Executar todos os testes
	@echo "$(GREEN)🧪 Rodando testes...$(NC)"
	npm run test

test-unit: ## Executar testes unitários
	npm run test:unit

test-integration: ## Executar testes de integração
	npm run test:integration

test-e2e: ## Executar testes end-to-end
	npm run test:e2e

# ============================================================================
# QUALIDADE DE CÓDIGO
# ============================================================================

lint: ## Verificar linting (ESLint)
	@echo "$(GREEN)📝 Verificando linting...$(NC)"
	npm run lint
	@echo "$(GREEN)✅ Linting OK!$(NC)"

format: ## Formatar código (Prettier)
	@echo "$(GREEN)✨ Formatando código...$(NC)"
	npm run format

check: ## Verificar código (lint + tipos)
	@echo "$(GREEN)🔍 Verificando código...$(NC)"
	npm run lint
	npm run typecheck
	@echo "$(GREEN)✅ Tudo OK!$(NC)"

# ============================================================================
# PERFORMANCE & MONITORING
# ============================================================================

health: ## Verificar saúde do sistema
	@echo "$(GREEN)🏥 Verificando saúde...$(NC)"
	@bash scripts/deep-health-check.sh

perf-baseline: ## Executar testes de performance (load + soak + stress)
	npm run test:perf:baseline

perf-load: ## Executar load test (19 min)
	npm run test:perf:load

perf-soak: ## Executar soak test (40 min)
	npm run test:perf:soak

perf-stress: ## Executar stress test (12 min)
	npm run test:perf:stress

# ============================================================================
# DEPLOYMENT
# ============================================================================

pre-deploy: ## Validações pré-deployment
	@echo "$(GREEN)🚀 Validando pré-deploy...$(NC)"
	@bash scripts/pre-deploy-check.sh

deploy-staging: ## Deploy para staging
	@echo "$(GREEN)🚀 Deploy para staging...$(NC)"
	npm run deploy:staging

deploy-prod: ## Deploy para produção (cuidado!)
	@echo "$(GREEN)🚀 Deploy para produção...$(NC)"
	@read -p "Tem certeza? (s/n) " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Ss]$$ ]]; then \
		npm run deploy:production; \
	else \
		echo "Deploy cancelado"; \
	fi

# ============================================================================
# DATABASE
# ============================================================================

migrate: ## Executar migrations
	npm run migrate

migrate-rollback: ## Rollback da última migration
	npm run migrate:rollback

migrate-status: ## Ver status das migrations
	npm run migrate:status

db-seed: ## Popular database com dados de teste
	npm run db:seed

db-reset: ## Reset database (cuidado!)
	@echo "$(GREEN)🗑️  Resetting database...$(NC)"
	@read -p "Tem certeza? (s/n) " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Ss]$$ ]]; then \
		docker-compose exec postgres psql -U rental_user -d rental_sync -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"; \
		npm run migrate; \
		npm run db:seed; \
		echo "$(GREEN)✅ Database reset!$(NC)"; \
	else \
		echo "Reset cancelado"; \
	fi

# ============================================================================
# MONITORAMENTO
# ============================================================================

prometheus: ## Abrir Prometheus em navegador
	@echo "$(GREEN)📊 Abrindo Prometheus...$(NC)"
	@open http://localhost:9090 2>/dev/null || xdg-open http://localhost:9090 2>/dev/null || echo "Acesse: http://localhost:9090"

grafana: ## Abrir Grafana em navegador
	@echo "$(GREEN)📈 Abrindo Grafana (admin/admin)...$(NC)"
	@open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001 2>/dev/null || echo "Acesse: http://localhost:3001"

alerts: ## Abrir AlertManager em navegador
	@echo "$(GREEN)🚨 Abrindo AlertManager...$(NC)"
	@open http://localhost:9093 2>/dev/null || xdg-open http://localhost:9093 2>/dev/null || echo "Acesse: http://localhost:9093"

# ============================================================================
# LIMPEZA
# ============================================================================

clean: ## Limpar build artifacts
	@echo "$(GREEN)🧹 Limpando...$(NC)"
	rm -rf dist/ build/ *.log
	npm run clean
	@echo "$(GREEN)✅ Limpeza completa!$(NC)"

clean-docker: ## Parar e remover containers (mantém volumes)
	docker-compose down

clean-all: ## Parar, remover containers E volumes (cuidado!)
	@read -p "Tem certeza? Isso vai deletar dados! (s/n) " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Ss]$$ ]]; then \
		docker-compose down -v; \
		echo "$(GREEN)✅ Tudo removido!$(NC)"; \
	fi

# ============================================================================
# UTILITÁRIOS
# ============================================================================

info: ## Mostrar informações do ambiente
	@echo "$(BLUE)Informações do Ambiente:$(NC)"
	@echo "  Node: $$(node -v)"
	@echo "  npm: $$(npm -v)"
	@echo "  Docker: $$(docker -v)"
	@echo "  Docker Compose: $$(docker-compose -v)"
	@echo "  Git: $$(git --version)"

version: ## Mostrar versão da aplicação
	@cat package.json | grep '"version"' | head -1 | cut -d: -f2 | tr -d ' ",'

.DEFAULT_GOAL := help

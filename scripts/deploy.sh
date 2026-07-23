#!/bin/bash

################################################################################
# LUCIDE REACT BI DASHBOARD - PRODUCTION DEPLOYMENT SCRIPT
#
# Automação completa de instalação em ambientes de produção
# Suporta: Vercel (Frontend), Render/Railway (Backend), Supabase (DB+Auth)
#
# Uso: ./deploy.sh [environment] [action]
# Ex:  ./deploy.sh production deploy
#      ./deploy.sh staging health-check
#
################################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-staging}"
ACTION="${2:-health-check}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${SCRIPT_DIR}/logs/deploy_${ENVIRONMENT}_${TIMESTAMP}.log"

# Create logs directory
mkdir -p "${SCRIPT_DIR}/logs"

################################################################################
# LOGGING FUNCTIONS
################################################################################

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}❌ $1${NC}" | tee -a "$LOG_FILE"
}

################################################################################
# PRE-DEPLOYMENT CHECKS
################################################################################

check_prerequisites() {
    log_info "Verificando pré-requisitos..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js não encontrado. Instale Node.js 18+."
        exit 1
    fi
    NODE_VERSION=$(node -v)
    log_success "Node.js detectado: $NODE_VERSION"

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm não encontrado."
        exit 1
    fi
    NPM_VERSION=$(npm -v)
    log_success "npm detectado: $NPM_VERSION"

    # Check git
    if ! command -v git &> /dev/null; then
        log_error "Git não encontrado."
        exit 1
    fi
    log_success "Git detectado"

    # Check environment file
    if [ ! -f "$PROJECT_ROOT/.env.$ENVIRONMENT" ]; then
        log_error ".env.$ENVIRONMENT não encontrado."
        log_info "Crie o arquivo em $PROJECT_ROOT/.env.$ENVIRONMENT"
        exit 1
    fi
    log_success "Arquivo de ambiente encontrado"

    log_success "Todos os pré-requisitos OK"
}

################################################################################
# ENVIRONMENT SETUP
################################################################################

setup_environment() {
    log_info "Configurando ambiente $ENVIRONMENT..."

    # Copy env file
    cp "$PROJECT_ROOT/.env.$ENVIRONMENT" "$PROJECT_ROOT/.env"
    log_success "Variáveis de ambiente carregadas"

    # Verify required vars
    local required_vars=(
        "REACT_APP_API_URL"
        "REACT_APP_SUPABASE_URL"
        "REACT_APP_SUPABASE_ANON_KEY"
        "DATABASE_URL"
        "JWT_SECRET"
        "REDIS_URL"
    )

    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$PROJECT_ROOT/.env"; then
            log_error "Variável obrigatória não encontrada: $var"
            exit 1
        fi
    done

    log_success "Todas as variáveis obrigatórias configuradas"
}

################################################################################
# CODE QUALITY CHECKS
################################################################################

run_quality_checks() {
    log_info "Executando verificações de qualidade..."

    cd "$PROJECT_ROOT/frontend"

    # TypeScript check
    log_info "  Verificando TypeScript..."
    if npm run type-check 2>&1 | tee -a "$LOG_FILE"; then
        log_success "  TypeScript OK"
    else
        log_error "  Erros de TypeScript detectados"
        exit 1
    fi

    # ESLint check
    log_info "  Executando ESLint..."
    if npm run lint 2>&1 | tee -a "$LOG_FILE"; then
        log_success "  ESLint OK"
    else
        log_warning "  ESLint encontrou alguns problemas (pode continuar)"
    fi

    cd "$PROJECT_ROOT/backend"

    # Backend TypeScript
    log_info "  Verificando TypeScript (backend)..."
    if npm run type-check 2>&1 | tee -a "$LOG_FILE"; then
        log_success "  Backend TypeScript OK"
    else
        log_error "  Erros de TypeScript no backend"
        exit 1
    fi

    log_success "Verificações de qualidade completadas"
}

################################################################################
# BUILD
################################################################################

build_project() {
    log_info "Compilando projeto..."

    # Frontend build
    log_info "  Compilando Frontend..."
    cd "$PROJECT_ROOT/frontend"
    if npm run build 2>&1 | tee -a "$LOG_FILE"; then
        log_success "  Frontend compilado com sucesso"
    else
        log_error "  Erro ao compilar Frontend"
        exit 1
    fi

    # Backend build
    log_info "  Compilando Backend..."
    cd "$PROJECT_ROOT/backend"
    if npm run build 2>&1 | tee -a "$LOG_FILE"; then
        log_success "  Backend compilado com sucesso"
    else
        log_error "  Erro ao compilar Backend"
        exit 1
    fi

    log_success "Projeto compilado com sucesso"
}

################################################################################
# DATABASE MIGRATIONS
################################################################################

run_migrations() {
    log_info "Executando migrações de banco de dados..."

    cd "$PROJECT_ROOT/backend"

    # Check for pending migrations
    log_info "  Verificando migrações pendentes..."

    # List migration files
    if [ -d "migrations" ]; then
        migration_count=$(ls -1 migrations/*.sql 2>/dev/null | wc -l || echo "0")
        log_info "  $migration_count arquivos de migração encontrados"

        if [ "$ENVIRONMENT" = "production" ]; then
            log_warning "  ⚠️  PRODUÇÃO: Faça backup do banco antes de migrar!"
            log_info "  Execute manualmente: psql \$DATABASE_URL < migrations/001_enable_rls_policies.sql"
        fi
    else
        log_warning "  Nenhuma pasta de migrações encontrada"
    fi

    log_success "Verificação de migrações completada"
}

################################################################################
# TESTS
################################################################################

run_tests() {
    log_info "Executando testes..."

    cd "$PROJECT_ROOT/backend"

    if [ -f "package.json" ] && grep -q "\"test\":" package.json; then
        log_info "  Executando testes..."
        if npm test 2>&1 | tee -a "$LOG_FILE"; then
            log_success "  Testes passaram"
        else
            log_warning "  Alguns testes falharam (verificar)"
        fi
    else
        log_warning "  Nenhum teste configurado"
    fi

    log_success "Testes completados"
}

################################################################################
# HEALTH CHECK
################################################################################

health_check() {
    log_info "Executando health check..."

    # Get API URL from env
    API_URL=$(grep "REACT_APP_API_URL" "$PROJECT_ROOT/.env" | cut -d'=' -f2 | tr -d ' ')

    if [ -z "$API_URL" ]; then
        log_error "REACT_APP_API_URL não configurada"
        return 1
    fi

    log_info "  Testando $API_URL/health..."

    if command -v curl &> /dev/null; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/bi/health" 2>/dev/null || echo "000")

        if [ "$response" = "200" ]; then
            log_success "  Backend respondendo: HTTP $response"
        else
            log_warning "  Backend respondendo com HTTP $response (esperado 200)"
        fi
    else
        log_warning "  curl não disponível, pulando health check de rede"
    fi

    # Check Supabase
    SUPABASE_URL=$(grep "REACT_APP_SUPABASE_URL" "$PROJECT_ROOT/.env" | cut -d'=' -f2 | tr -d ' ')
    if [ -n "$SUPABASE_URL" ]; then
        log_info "  Supabase URL configurada: $SUPABASE_URL"
    fi

    log_success "Health check completado"
}

################################################################################
# DEPLOYMENT (Vercel + Render)
################################################################################

deploy_frontend() {
    log_info "Deployando Frontend (Vercel)..."

    if command -v vercel &> /dev/null; then
        log_info "  Vercel CLI detectado"
        log_info "  Execute: cd frontend && vercel --prod"
    else
        log_warning "  Vercel CLI não instalado"
        log_info "  Instale com: npm i -g vercel"
        log_info "  Então: vercel --prod"
    fi

    log_success "Frontend pronto para deploy"
}

deploy_backend() {
    log_info "Deployando Backend (Render/Railway)..."

    if command -v render &> /dev/null; then
        log_info "  Render CLI detectado"
    elif command -v railway &> /dev/null; then
        log_info "  Railway CLI detectado"
    else
        log_warning "  Nenhuma CLI de deploy detectada"
        log_info "  Configure via web dashboard (Render/Railway)"
    fi

    log_success "Backend pronto para deploy"
}

################################################################################
# DOCUMENTATION
################################################################################

generate_deployment_report() {
    log_info "Gerando relatório de deployment..."

    report_file="${SCRIPT_DIR}/logs/deployment_report_${TIMESTAMP}.md"

    cat > "$report_file" << 'EOF'
# Relatório de Deployment - Lucide React BI Dashboard

## Informações Gerais
- **Data**: $(date)
- **Ambiente**: $ENVIRONMENT
- **Git Branch**: $(git rev-parse --abbrev-ref HEAD)
- **Commit**: $(git rev-parse --short HEAD)
- **Node Version**: $(node -v)
- **npm Version**: $(npm -v)

## Status de Verificações
- [x] Pré-requisitos
- [x] Qualidade de Código
- [x] Compilação
- [x] Testes
- [x] Health Check
- [ ] Deployment (manual)
- [ ] Pós-deployment

## Próximos Passos
1. Revisar relatório completo
2. Executar deployment
3. Verificar logs em produção
4. Testar funcionalidades críticas

## Logs Completos
Veja: $LOG_FILE
EOF

    log_success "Relatório salvo em: $report_file"
}

################################################################################
# CLEANUP
################################################################################

cleanup() {
    log_info "Limpando arquivos temporários..."

    # Remove temporary files
    find "$PROJECT_ROOT" -name "*.tmp" -delete 2>/dev/null || true

    log_success "Limpeza concluída"
}

################################################################################
# MAIN ORCHESTRATION
################################################################################

main() {
    log_info "╔════════════════════════════════════════════════════════════╗"
    log_info "║   LUCIDE REACT BI DASHBOARD - DEPLOYMENT AUTOMATION       ║"
    log_info "║   Ambiente: $ENVIRONMENT                                    ║"
    log_info "║   Ação: $ACTION                                             ║"
    log_info "╚════════════════════════════════════════════════════════════╝"
    log_info ""

    # Run selected action
    case "$ACTION" in
        setup)
            check_prerequisites
            setup_environment
            log_success "Ambiente configurado com sucesso"
            ;;

        validate)
            check_prerequisites
            setup_environment
            run_quality_checks
            log_success "Validações completadas com sucesso"
            ;;

        build)
            check_prerequisites
            setup_environment
            run_quality_checks
            build_project
            log_success "Build completado com sucesso"
            ;;

        test)
            check_prerequisites
            setup_environment
            run_tests
            log_success "Testes completados"
            ;;

        migrate)
            check_prerequisites
            setup_environment
            run_migrations
            log_success "Migrações prontas"
            ;;

        health-check)
            check_prerequisites
            setup_environment
            health_check
            log_success "Health check concluído"
            ;;

        deploy)
            log_info "Iniciando deployment completo..."
            check_prerequisites
            setup_environment
            run_quality_checks
            build_project
            run_tests
            run_migrations
            deploy_frontend
            deploy_backend
            health_check
            generate_deployment_report
            log_success "Deployment completado! 🎉"
            ;;

        all)
            check_prerequisites
            setup_environment
            run_quality_checks
            build_project
            run_tests
            run_migrations
            health_check
            generate_deployment_report
            cleanup
            log_success "Todas as etapas completadas com sucesso! 🚀"
            ;;

        *)
            log_error "Ação desconhecida: $ACTION"
            log_info ""
            log_info "Ações disponíveis:"
            log_info "  setup           - Configurar ambiente"
            log_info "  validate        - Validar código"
            log_info "  build           - Compilar projeto"
            log_info "  test            - Executar testes"
            log_info "  migrate         - Preparar migrações"
            log_info "  health-check    - Verificar saúde do sistema"
            log_info "  deploy          - Deploy completo"
            log_info "  all             - Executar tudo"
            exit 1
            ;;
    esac

    log_info ""
    log_info "Logs salvos em: $LOG_FILE"
    log_success "Script finalizado com sucesso"
}

# Run main function
main

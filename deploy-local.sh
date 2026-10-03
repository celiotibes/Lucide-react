#!/bin/bash

##############################################################################
# Deploy Script — Lucide Contabilidade (Produção Local / MacBook)
#
# Uso: ./deploy-local.sh
#
# Passos:
#   1. Valida .env existe
#   2. Confirma deploy com usuário
#   3. Git pull origin main
#   4. npm install (backend + frontend)
#   5. npm run build (frontend)
#   6. npm run migrate (backend, se aplicável)
#   7. pm2 restart contabilidade-server
#   8. Verifica saúde pós-deploy
#
# Nota: Este script é idempotente (seguro rodar múltiplas vezes)
##############################################################################

set -e  # Exit on error

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções de logging
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# 1. Validar .env
# ============================================================================
log_info "Validando .env..."

if [ ! -f ".env" ]; then
  log_error ".env não encontrado! Copie de .env.example e configure."
  exit 1
fi

if ! grep -q "API_KEY" .env; then
  log_warn ".env não contém API_KEY — servidor não iniciará."
fi

log_success ".env validado"

# ============================================================================
# 2. Confirmar deploy
# ============================================================================
log_warn "Aviso: Este script fará deploy da aplicação."
log_warn "Backup automático será criado antes de fazer deploy."
read -p "Deseja continuar? (s/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  log_info "Deploy cancelado."
  exit 0
fi

# ============================================================================
# 3. Criar backup (opcional)
# ============================================================================
if [ -f "deploy-local-backup.sh" ]; then
  log_info "Criando backup automático..."
  bash deploy-local-backup.sh || log_warn "Falha ao criar backup (continuando...)"
  log_success "Backup criado"
fi

# ============================================================================
# 4. Git pull
# ============================================================================
log_info "Atualizando repositório (git pull)..."

if git status &> /dev/null; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  log_info "Branch atual: $CURRENT_BRANCH"

  if git pull origin "$CURRENT_BRANCH"; then
    log_success "Repositório atualizado"
  else
    log_error "Falha em git pull"
    exit 1
  fi
else
  log_warn "Não é um repositório git — pulando git pull"
fi

# ============================================================================
# 5. npm install (backend + frontend)
# ============================================================================
log_info "Instalando dependências (frontend)..."
npm install --legacy-peer-deps || npm install
log_success "Dependências frontend instaladas"

log_info "Instalando dependências (backend)..."
cd server
npm install --legacy-peer-deps || npm install
cd ..
log_success "Dependências backend instaladas"

# ============================================================================
# 6. npm run build (frontend)
# ============================================================================
log_info "Compilando frontend (Vite)..."
npm run build || {
  log_error "Falha em npm run build"
  exit 1
}
log_success "Frontend compilado com sucesso"

# ============================================================================
# 7. npm run migrate (se existir)
# ============================================================================
if grep -q '"migrate"' package.json || grep -q '"migrate"' server/package.json; then
  log_info "Executando migrations..."
  if npm run migrate 2>/dev/null || (cd server && npm run migrate 2>/dev/null); then
    log_success "Migrations executadas"
  else
    log_warn "Script migrate não encontrado — pulando"
  fi
fi

# ============================================================================
# 8. PM2 restart
# ============================================================================
log_info "Reiniciando server com PM2..."

if command -v pm2 &> /dev/null; then
  # Verificar se o processo já está em execução
  if pm2 list | grep -q "contabilidade-server"; then
    log_info "Processo já existe — reiniciando..."
    pm2 restart ecosystem.config.js || {
      log_error "Falha em pm2 restart"
      exit 1
    }
  else
    log_info "Iniciando novo processo..."
    pm2 start ecosystem.config.js || {
      log_error "Falha em pm2 start"
      exit 1
    }
  fi

  log_success "Server iniciado/reiniciado com PM2"

  # Salvar processo para startup automático
  log_info "Salvando processos para startup automático..."
  pm2 save
  log_success "Processos salvos"
else
  log_error "PM2 não encontrado. Instale com: npm install -g pm2"
  exit 1
fi

# ============================================================================
# 9. Verificar saúde
# ============================================================================
log_info "Verificando saúde da aplicação..."
sleep 2

if pm2 list | grep -q "contabilidade-server"; then
  PROCESS_STATUS=$(pm2 list | grep "contabilidade-server" | awk '{print $10}')

  if [[ "$PROCESS_STATUS" == "online" ]]; then
    log_success "Processo está ONLINE"
  else
    log_warn "Processo status: $PROCESS_STATUS (pode estar iniciando...)"
  fi
else
  log_error "Processo contabilidade-server não encontrado"
  pm2 list
  exit 1
fi

# ============================================================================
# 10. Resultado final
# ============================================================================
log_success "Deploy concluído com sucesso!"
log_info "Para monitorar logs: pm2 logs"
log_info "Para ver dashboard: pm2 web"
log_info "Para listar processos: pm2 list"

exit 0

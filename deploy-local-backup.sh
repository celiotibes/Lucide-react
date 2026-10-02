#!/bin/bash

##############################################################################
# Backup Script — Lucide Contabilidade
#
# Uso: ./deploy-local-backup.sh
#
# Cria backup antes de deploy:
#   - .env e variáveis sensíveis
#   - Database (se existir)
#   - node_modules (opcional, pode ser restaurado com npm install)
#   - dist/ compilado
#
# Backup armazenado em: ./backups/YYYYMMDD_HHMMSS/
##############################################################################

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Funções
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================================
# Criar diretório de backup
# ============================================================================
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

log_info "Iniciando backup em: $BACKUP_DIR"

# ============================================================================
# Backup de .env
# ============================================================================
if [ -f ".env" ]; then
  log_info "Fazendo backup de .env..."
  cp .env "$BACKUP_DIR/.env"
  log_success ".env backup criado"
else
  log_warn ".env não encontrado — pulando"
fi

# ============================================================================
# Backup de database (se existir)
# ============================================================================
if [ -d "server/src" ] && ls server/src/*.db 2>/dev/null; then
  log_info "Fazendo backup de database..."
  mkdir -p "$BACKUP_DIR/database"
  cp server/src/*.db "$BACKUP_DIR/database/" 2>/dev/null || true
  log_success "Database backup criado"
else
  log_warn "Database não encontrado — pulando"
fi

# ============================================================================
# Backup de dist/ compilado
# ============================================================================
if [ -d "dist" ]; then
  log_info "Fazendo backup de dist/..."
  cp -r dist "$BACKUP_DIR/dist"
  log_success "dist/ backup criado"
else
  log_warn "dist/ não encontrado — pulando"
fi

# ============================================================================
# Backup de package.json (referência)
# ============================================================================
log_info "Fazendo backup de package.json..."
cp package.json "$BACKUP_DIR/package.json"
cp server/package.json "$BACKUP_DIR/server-package.json"
log_success "package.json backups criados"

# ============================================================================
# Resumo
# ============================================================================
BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
FILE_COUNT=$(find "$BACKUP_DIR" -type f | wc -l)

log_success "Backup concluído!"
log_info "Localização: $BACKUP_DIR"
log_info "Tamanho: $BACKUP_SIZE"
log_info "Arquivos: $FILE_COUNT"

# ============================================================================
# Limpeza de backups antigos (manter últimos 7)
# ============================================================================
log_info "Limpando backups antigos (mantendo últimos 7)..."

BACKUP_COUNT=$(ls -d backups/*/ 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 7 ]; then
  # Remove os backups mais antigos (mantendo 7)
  ls -d backups/*/ | head -n $((BACKUP_COUNT - 7)) | xargs rm -rf
  log_success "Backups antigos removidos"
fi

log_success "Backup finalizado com sucesso!"
exit 0

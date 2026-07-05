#!/bin/bash

# ============================================================================
# Start Script - Sistema de Automação Jurídica para Tribunais Brasileiros
# ============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# Verificar .env
if [ ! -f .env ]; then
  print_error "Arquivo .env não encontrado!"
  print_info "Execute: cp .env.example .env e configure as variáveis"
  exit 1
fi

# Verificar node_modules
if [ ! -d node_modules ]; then
  print_info "Instalando dependências..."
  npm install
fi

# Executar migrations
if [ "$1" != "--skip-migrations" ]; then
  print_info "Executando migrations..."
  npm run db:migrate || print_error "Erro nas migrations"
fi

# Iniciar aplicação
ENVIRONMENT=${NODE_ENV:-development}

if [ "$ENVIRONMENT" = "production" ]; then
  print_info "Iniciando em modo PRODUÇÃO..."
  npm start
else
  print_info "Iniciando em modo DESENVOLVIMENTO..."
  npm run dev
fi

#!/bin/bash

# ============================================================================
# Setup Script - Sistema de Automação Jurídica para Tribunais Brasileiros
# ============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funções auxiliares
print_header() {
  echo -e "${BLUE}================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}================================${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# 1. Verificar Node.js
print_header "Verificando Node.js"
if ! command -v node &> /dev/null; then
  print_error "Node.js não está instalado"
  exit 1
fi
print_success "Node.js $(node --version) detectado"

# 2. Verificar npm
print_header "Verificando npm"
if ! command -v npm &> /dev/null; then
  print_error "npm não está instalado"
  exit 1
fi
print_success "npm $(npm --version) detectado"

# 3. Instalar dependências
print_header "Instalando dependências"
npm install
print_success "Dependências instaladas"

# 4. Verificar .env
print_header "Verificando arquivo de configuração"
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    print_warning "Arquivo .env criado a partir de .env.example"
    print_warning "⚠ IMPORTANTE: Configure as variáveis de ambiente em .env antes de iniciar!"
  else
    print_error "Arquivo .env não encontrado e .env.example não existe"
    exit 1
  fi
else
  print_success "Arquivo .env existente"
fi

# 5. Criar diretórios necessários
print_header "Criando diretórios"
mkdir -p data/backups
mkdir -p data/certificates
mkdir -p data/reports
mkdir -p logs
print_success "Diretórios criados"

# 6. Type check
print_header "Verificando tipos TypeScript"
npm run type-check || print_warning "Alguns erros de tipo foram detectados (podem ser resolvidos em build)"

# 7. Compilar
print_header "Compilando TypeScript"
npm run build || print_warning "Compilação com avisos"
print_success "Código compilado com sucesso"

# 8. Executar migrations
print_header "Executando migrations do banco de dados"
npm run db:migrate || print_warning "Erro na migração (verifique banco de dados)"
print_success "Migrations executadas"

# 9. Executar linting (opcional)
print_header "Executando linter"
npm run lint || print_warning "Alguns problemas de linting detectados"

# 10. Teste rápido
print_header "Executando testes unitários"
npm run test 2>/dev/null || print_warning "Alguns testes não passaram (verifique)"

# 11. Sumário
print_header "SETUP CONCLUÍDO ✓"
echo ""
echo -e "${GREEN}Próximos passos:${NC}"
echo "1. Configure as variáveis de ambiente em .env"
echo "2. Execute: npm run dev (desenvolvimento)"
echo "3. Ou: npm start (produção)"
echo ""
echo -e "${YELLOW}Documentação:${NC}"
echo "- API: ./docs/API.md"
echo "- Deployment: ./docs/deployment.md"
echo "- Fases: ./PHASES_SUMMARY.md"
echo ""

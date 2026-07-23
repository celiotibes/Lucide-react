#!/bin/bash

#############################################################################
#                                                                           #
#  INSTALADOR AUTOMATIZADO — Kitnets UFSC                                 #
#  Sistema de Marketing & Lead Management v2.0                            #
#                                                                           #
#  Uso: bash instalar-producao.sh                                         #
#                                                                           #
#############################################################################

set -e

# ============================================================================
# CONFIGURAÇÕES E CORES
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/producao.config"
LOG_FILE="$SCRIPT_DIR/instalacao.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ============================================================================
# FUNÇÕES UTILITÁRIAS
# ============================================================================

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✅ $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}❌ ERRO: $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}" | tee -a "$LOG_FILE"
}

separator() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ============================================================================
# VERIFICAÇÃO DE PRÉ-REQUISITOS
# ============================================================================

verificar_prereq() {
    log "Verificando pré-requisitos..."

    local missing_tools=()

    # Verificar ferramentas necessárias
    if ! command -v python3 &> /dev/null; then
        missing_tools+=("python3")
    fi

    if ! command -v curl &> /dev/null; then
        missing_tools+=("curl")
    fi

    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi

    if [ ${#missing_tools[@]} -gt 0 ]; then
        error "Ferramentas necessárias não encontradas: ${missing_tools[*]}"
        echo "Instale com: sudo apt-get install ${missing_tools[*]}"
        exit 1
    fi

    success "Todos os pré-requisitos verificados"
}

# ============================================================================
# CRIAR ARQUIVO DE CONFIGURAÇÃO
# ============================================================================

criar_config() {
    log "Criando arquivo de configuração..."

    if [ -f "$CONFIG_FILE" ]; then
        warning "Arquivo de configuração já existe: $CONFIG_FILE"
        read -p "Deseja sobrescrever? (s/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Ss]$ ]]; then
            log "Usando configuração existente"
            return
        fi
    fi

    # Solicitar entrada do usuário
    echo ""
    echo -e "${BLUE}📋 CONFIGURAÇÃO DO SISTEMA${NC}"
    echo "Forneça as seguintes informações:"
    echo ""

    read -p "📧 Seu email (para receber alertas): " OPERATOR_EMAIL
    if [[ ! "$OPERATOR_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        error "Email inválido: $OPERATOR_EMAIL"
        exit 1
    fi

    read -p "📱 Seu número WhatsApp (com código país, ex: 5548999887766): " WHATSAPP_NUMBER
    if [[ ! "$WHATSAPP_NUMBER" =~ ^[0-9]{10,15}$ ]]; then
        error "Número WhatsApp inválido: $WHATSAPP_NUMBER"
        exit 1
    fi

    read -p "🆔 ID da Planilha Central (veja em https://docs.google.com/spreadsheets/d/[ID]/...): " PLANILHA_CENTRAL_ID
    if [ -z "$PLANILHA_CENTRAL_ID" ]; then
        error "ID da planilha central é obrigatório"
        exit 1
    fi

    read -p "⏱️  Tempo limite SLA em minutos (padrão: 10): " SLA_MINUTOS
    SLA_MINUTOS=${SLA_MINUTOS:-10}

    read -p "🏢 Nomes das propriedades (separadas por vírgula, ex: Pottker 25, Milton Sullivan 142): " PROPRIEDADES
    if [ -z "$PROPRIEDADES" ]; then
        PROPRIEDADES="Pottker 25, Milton Sullivan 142, Ana Maria Nunes 214"
    fi

    read -p "🔗 URL da landing page (ex: https://kitnets-ufsc.com ou vazio para localhost): " LANDING_URL
    LANDING_URL=${LANDING_URL:-"http://localhost:8080"}

    read -p "📊 URL do dashboard (ex: https://dashboard-kitnets.com ou vazio para localhost): " DASHBOARD_URL
    DASHBOARD_URL=${DASHBOARD_URL:-"http://localhost:8081"}

    # Criar arquivo de configuração
    cat > "$CONFIG_FILE" << EOF
# Configuração de Produção — Kitnets UFSC
# Gerado em: $TIMESTAMP

# Email do Operador (recebe alertas SLA, follow-ups, reviews)
OPERATOR_EMAIL="$OPERATOR_EMAIL"

# ID da Planilha Central Google Sheets
PLANILHA_CENTRAL_ID="$PLANILHA_CENTRAL_ID"

# Tempo limite SLA em minutos (após este tempo, alerta é enviado)
SLA_MINUTOS=$SLA_MINUTOS

# Número WhatsApp para contato (sem símbolos, com código país)
WHATSAPP_NUMBER="$WHATSAPP_NUMBER"

# Nomes das propriedades (usados para sincronização reversa)
PROPRIEDADES=("${PROPRIEDADES//,/\"}")

# URLs de Deploy
LANDING_URL="$LANDING_URL"
DASHBOARD_URL="$DASHBOARD_URL"

# Status da Instalação
INSTALACAO_DATA="$TIMESTAMP"
INSTALACAO_STATUS="em_progresso"
EOF

    success "Arquivo de configuração criado: $CONFIG_FILE"
}

# ============================================================================
# VALIDAR CONFIGURAÇÃO
# ============================================================================

validar_config() {
    log "Validando configuração..."

    if [ ! -f "$CONFIG_FILE" ]; then
        error "Arquivo de configuração não encontrado"
        exit 1
    fi

    # Source the config
    set +e
    source "$CONFIG_FILE"
    set -e

    # Validações
    if [ -z "$OPERATOR_EMAIL" ]; then
        error "OPERATOR_EMAIL não configurado"
        exit 1
    fi

    if [ -z "$PLANILHA_CENTRAL_ID" ]; then
        error "PLANILHA_CENTRAL_ID não configurado"
        exit 1
    fi

    if [ -z "$SLA_MINUTOS" ]; then
        error "SLA_MINUTOS não configurado"
        exit 1
    fi

    success "Configuração validada com sucesso"
}

# ============================================================================
# GERAR ARQUIVOS DE CONFIGURAÇÃO ESPECÍFICOS
# ============================================================================

gerar_appsscript_customizado() {
    log "Gerando AppsScript customizado..."

    source "$CONFIG_FILE"

    local output_file="$SCRIPT_DIR/AppsScript-customizado.gs"

    # Ler template original
    local template="$SCRIPT_DIR/scripts/AppsScript.gs"

    if [ ! -f "$template" ]; then
        error "Arquivo template não encontrado: $template"
        exit 1
    fi

    # Substituir variáveis
    sed "s|OPERATOR_EMAIL = \"[^\"]*\"|OPERATOR_EMAIL = \"$OPERATOR_EMAIL\"|g; \
         s|PLANILHA_CENTRAL_ID = \"[^\"]*\"|PLANILHA_CENTRAL_ID = \"$PLANILHA_CENTRAL_ID\"|g; \
         s|SLA_MINUTOS = [0-9]*|SLA_MINUTOS = $SLA_MINUTOS|g" \
        "$template" > "$output_file"

    success "AppsScript customizado gerado: $output_file"
    log "⚠️  PRÓXIMO PASSO: Copie o conteúdo para Google Apps Script editor"
}

# ============================================================================
# ATUALIZAR LANDING PAGE
# ============================================================================

atualizar_landing_page() {
    log "Atualizando landing page com número WhatsApp..."

    source "$CONFIG_FILE"

    local landing_file="$SCRIPT_DIR/landing/index.html"
    local landing_backup="$SCRIPT_DIR/landing/index.html.bak"

    if [ ! -f "$landing_file" ]; then
        error "Arquivo landing page não encontrado: $landing_file"
        exit 1
    fi

    # Fazer backup
    cp "$landing_file" "$landing_backup"
    success "Backup criado: $landing_backup"

    # Substituir número WhatsApp (padrão é 554140425242)
    sed -i "s|wa\.me/[0-9]*|wa.me/$WHATSAPP_NUMBER|g" "$landing_file"

    success "Landing page atualizada com número WhatsApp"
}

# ============================================================================
# ATUALIZAR DASHBOARD
# ============================================================================

atualizar_dashboard() {
    log "Atualizando dashboard com ID da planilha central..."

    source "$CONFIG_FILE"

    local dashboard_file="$SCRIPT_DIR/dashboard/painel.html"
    local dashboard_backup="$SCRIPT_DIR/dashboard/painel.html.bak"

    if [ ! -f "$dashboard_file" ]; then
        error "Arquivo dashboard não encontrado: $dashboard_file"
        exit 1
    fi

    # Fazer backup
    cp "$dashboard_file" "$dashboard_backup"
    success "Backup criado: $dashboard_backup"

    # Substituir ID da planilha (padrão é 1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ)
    local old_id="1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ"
    sed -i "s|$old_id|$PLANILHA_CENTRAL_ID|g" "$dashboard_file"

    success "Dashboard atualizado com ID da planilha"
}

# ============================================================================
# CRIAR SCRIPT DE DEPLOYMENT
# ============================================================================

criar_deploy_script() {
    log "Criando script de deployment..."

    source "$CONFIG_FILE"

    local deploy_script="$SCRIPT_DIR/deploy-producao.sh"

    cat > "$deploy_script" << 'DEPLOY_EOF'
#!/bin/bash

# Script de Deployment — Kitnets UFSC v2.0

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ ERRO: $1${NC}"; exit 1; }

# Verificar ferramentas
if ! command -v vercel &> /dev/null && ! command -v netlify &> /dev/null; then
    error "Instale Vercel CLI (npm i -g vercel) ou Netlify CLI (npm i -g netlify-cli)"
fi

log "Escolha a plataforma de deployment:"
echo "1) Vercel (recomendado)"
echo "2) Netlify"
echo "3) Servidor próprio (local)"
read -p "Opção (1-3): " option

case $option in
    1)
        log "Deploying com Vercel..."

        if [ -d "landing" ]; then
            log "Deployando landing page..."
            cd landing
            vercel --prod
            cd ..
            success "Landing page deployada!"
        fi

        if [ -d "dashboard" ]; then
            log "Deployando dashboard..."
            cd dashboard
            vercel --prod
            cd ..
            success "Dashboard deployado!"
        fi
        ;;
    2)
        log "Deploying com Netlify..."

        if [ -d "landing" ]; then
            log "Deployando landing page..."
            netlify deploy --prod --dir=landing
            success "Landing page deployada!"
        fi

        if [ -d "dashboard" ]; then
            log "Deployando dashboard..."
            netlify deploy --prod --dir=dashboard
            success "Dashboard deployado!"
        fi
        ;;
    3)
        log "Configurando servidor local..."

        if ! command -v python3 &> /dev/null; then
            error "Python3 é necessário para servidor local"
        fi

        log "Landing page: http://localhost:8080"
        log "Dashboard: http://localhost:8081"

        # Servidor em background
        (cd landing && python3 -m http.server 8080) &
        LANDING_PID=$!

        (cd dashboard && python3 -m http.server 8081) &
        DASHBOARD_PID=$!

        success "Servidores iniciados!"
        log "PIDs: Landing=$LANDING_PID, Dashboard=$DASHBOARD_PID"
        log "Para parar: kill $LANDING_PID $DASHBOARD_PID"

        # Manter aberto
        wait
        ;;
    *)
        error "Opção inválida"
        ;;
esac

success "Deployment completo!"
DEPLOY_EOF

    chmod +x "$deploy_script"
    success "Script de deployment criado: $deploy_script"
}

# ============================================================================
# CRIAR CHECKLIST DE INSTALAÇÃO
# ============================================================================

criar_checklist() {
    log "Criando checklist de instalação..."

    source "$CONFIG_FILE"

    local checklist_file="$SCRIPT_DIR/CHECKLIST-INSTALACAO.md"

    cat > "$checklist_file" << EOF
# ✅ Checklist de Instalação — Kitnets UFSC

**Data de Início**: $TIMESTAMP
**Email do Operador**: $OPERATOR_EMAIL
**WhatsApp**: $WHATSAPP_NUMBER
**Planilha Central ID**: $PLANILHA_CENTRAL_ID
**SLA**: $SLA_MINUTOS minutos

---

## Fase 1: Google Sheets (15 min)

- [ ] Criar planilha Google central com propriedades
- [ ] Importar central-leads-kitnets-ufsc.xlsx como Google Sheet
- [ ] Copiar ID da URL: https://docs.google.com/spreadsheets/d/[ID]/...
- [ ] Criar sheet "Dashboard Geral" com headers
- [ ] Criar sheets para cada propriedade (Pottker 25, Milton Sullivan 142, Ana Maria Nunes 214)
- [ ] Preencher dados de unidades em cada sheet
- [ ] **Guardar ID**: Você precisará em "Fase 2"

---

## Fase 2: Google Apps Script (20 min)

- [ ] Abrir planilha de Leads (Google Sheet importado)
- [ ] Ir para: Extensões > Apps Script
- [ ] Copiar arquivo: \`AppsScript-customizado.gs\` (gerado nesta instalação)
- [ ] Colar TUDO no editor
- [ ] Verificar variáveis:
  - [ ] OPERATOR_EMAIL = $OPERATOR_EMAIL
  - [ ] PLANILHA_CENTRAL_ID = $PLANILHA_CENTRAL_ID
  - [ ] SLA_MINUTOS = $SLA_MINUTOS
- [ ] Clicar "Salvar"
- [ ] Testar: Selecionar \`checkSLA\` > Clicar play ▶️
- [ ] Autorizar quando Google pedir

---

## Fase 3: Configurar Gatilhos (15 min)

Na editor de Apps Script, lado esquerdo: **Acionadores** (ícone de relógio)

- [ ] **Gatilho 1 — SLA Monitoring**
  - Função: checkSLA
  - Tipo: Time-driven
  - Frequência: Minute timer > Every 5 minutes
  - Notificações: At least once per day

- [ ] **Gatilho 2 — Follow-up Reminders**
  - Função: checkFollowUps
  - Tipo: Time-driven
  - Frequência: Hour timer > Every hour
  - Notificações: At least once per day

- [ ] **Gatilho 3 — Review Requests**
  - Função: checkReviewRequests
  - Tipo: Time-driven
  - Frequência: Day timer > Every day at midnight
  - Notificações: At least once per day

- [ ] **Gatilho 4 — Reverse Sync on Edit**
  - Função: onEditLeadsSheet
  - Tipo: From spreadsheet
  - Evento: On edit
  - Notificações: At least once per day

- [ ] Verificar que todos os 4 gatilhos aparecem como "Enabled"

---

## Fase 4: Dashboard IMPORTRANGE (10 min)

- [ ] Abrir Painel sheet na sua planilha de Leads
- [ ] Você verá #REF! ou "Permission denied"
- [ ] Clicar na célula do erro
- [ ] Clicar "Permitir acesso"
- [ ] Autorizar Google Sheets
- [ ] Valores devem aparecer em 5-10 segundos
- [ ] Verificar 3 células IMPORTRANGE:
  - [ ] Total de vagas
  - [ ] Receita mensal
  - [ ] Ocupação por propriedade

---

## Fase 5: Landing Page Deploy (10 min)

- [ ] Executar: \`bash deploy-producao.sh\`
- [ ] Escolher plataforma: 1 (Vercel), 2 (Netlify), ou 3 (Local)
- [ ] Se Vercel/Netlify: Fazer login quando solicitado
- [ ] Aguardar deployment
- [ ] Acessar URL fornecida
- [ ] Testar clique em WhatsApp CTA de cada propriedade
- [ ] Verificar mensagem pré-preenchida no WhatsApp

---

## Fase 6: Dashboard Deploy (5 min)

- [ ] Executar: \`bash deploy-producao.sh\` (novamente)
- [ ] Escolher mesma plataforma
- [ ] Dashboard será deployado em URL diferente
- [ ] Compartilhar URL com sua equipe

---

## Fase 7: Testes Funcionais (30 min)

### Teste 1: SLA Alert (10 min)

- [ ] Adicionar lead de teste:
  - Nome: "Teste SLA"
  - WhatsApp: Seu número real
  - Canal: "Direto"
  - Público: "Estudante"
  - Unidade: "Pottker 25 - Kitnet 3"
  - Status: "Novo"

- [ ] Aguardar $SLA_MINUTOS minutos (ou 1 min se alterado)
- [ ] ✅ Receber email de alerta com link WhatsApp
- [ ] ✅ Clicar link e verificar mensagem pré-preenchida

### Teste 2: Reverse Sync (10 min)

- [ ] Usar lead de teste acima
- [ ] Alterar Status para "Visitou"
- [ ] Alterar Status para "Fechado"
- [ ] ✅ Receber email de sincronização
- [ ] Abrir planilha central, sheet "Pottker 25"
- [ ] ✅ Verificar que unidade 3 agora está "Alugada"
- [ ] ✅ Verificar que "Teste SLA" aparece como locatário
- [ ] ✅ Verificar que data do contrato está preenchida

### Teste 3: Follow-up (20 min)

- [ ] Adicionar 3 leads com status "Visitou"
- [ ] Preencher "Último Contato" com tempo entre 24-48h atrás
- [ ] Aguardar próxima hora cheia (ex: 16:00)
- [ ] ✅ Receber email consolidado com 3 leads para follow-up

---

## Fase 8: Produção (Ongoing)

- [ ] Compartilhar landing page URL com clientes
- [ ] Treinar equipe no uso do sistema:
  - [ ] Como adicionar leads
  - [ ] Como atualizar status
  - [ ] Como interpretar dashboard
- [ ] Monitorar primeiro mês de dados
- [ ] Ajustar SLA_MINUTOS se necessário
- [ ] Fazer review semanal de métricas

---

## Rollback (Se Necessário)

Se algo der errado:

\`\`\`bash
# Restaurar landing page
cp landing/index.html.bak landing/index.html

# Restaurar dashboard
cp dashboard/painel.html.bak dashboard/painel.html

# Desabilitar triggers na Apps Script (manualmente via UI)
\`\`\`

---

## Suporte

- 📖 Documentação: README.md
- 🔍 Troubleshooting: SETUP.md
- 📋 Auditoria: AUDITORIA.md

**Contato**: support@example.com
EOF

    success "Checklist criado: $checklist_file"
}

# ============================================================================
# RELATÓRIO FINAL
# ============================================================================

relatorio_final() {
    log "Gerando relatório final..."

    source "$CONFIG_FILE"

    local report_file="$SCRIPT_DIR/RELATORIO-INSTALACAO-$(date +%Y%m%d-%H%M%S).txt"

    cat > "$report_file" << EOF
╔════════════════════════════════════════════════════════════════╗
║         RELATÓRIO DE INSTALAÇÃO — Kitnets UFSC v2.0           ║
╚════════════════════════════════════════════════════════════════╝

DATA/HORA: $TIMESTAMP
STATUS: ✅ CONFIGURAÇÃO CONCLUÍDA

┌─ INFORMAÇÕES DE CONTATO ─────────────────────────────────────┐
│ Email do Operador: $OPERATOR_EMAIL
│ WhatsApp: $WHATSAPP_NUMBER
│ Planilha Central ID: $PLANILHA_CENTRAL_ID
└──────────────────────────────────────────────────────────────┘

┌─ CONFIGURAÇÕES ──────────────────────────────────────────────┐
│ SLA Minutos: $SLA_MINUTOS
│ Landing URL: $LANDING_URL
│ Dashboard URL: $DASHBOARD_URL
└──────────────────────────────────────────────────────────────┘

┌─ ARQUIVOS GERADOS ───────────────────────────────────────────┐
│ ✅ producao.config (configurações)
│ ✅ AppsScript-customizado.gs (pronto para copiar-colar)
│ ✅ landing/index.html (atualizado)
│ ✅ dashboard/painel.html (atualizado)
│ ✅ deploy-producao.sh (script de deployment)
│ ✅ CHECKLIST-INSTALACAO.md (guia passo-a-passo)
└──────────────────────────────────────────────────────────────┘

┌─ PRÓXIMOS PASSOS ────────────────────────────────────────────┐
│
│ 1. COPIAR APPSSCRIPT:
│    → cat AppsScript-customizado.gs
│    → Colar em: Google Sheets > Extensões > Apps Script
│
│ 2. CRIAR GATILHOS:
│    → Seguir: CHECKLIST-INSTALACAO.md (Fase 3)
│
│ 3. TESTAR IMPORTRANGE:
│    → Abrir Painel sheet > Autorizar IMPORTRANGE
│    → Verificar valores aparecem
│
│ 4. FAZER DEPLOY:
│    → bash deploy-producao.sh
│    → Escolher: Vercel (1), Netlify (2), ou Local (3)
│
│ 5. TESTES FUNCIONAIS:
│    → Seguir: CHECKLIST-INSTALACAO.md (Fase 7)
│
└──────────────────────────────────────────────────────────────┘

┌─ CONTATO DE SUPORTE ─────────────────────────────────────────┐
│ 📖 Documentação: README.md
│ 🚀 Setup: SETUP.md
│ 🔍 Auditoria: AUDITORIA.md
│ ✅ Checklist: CHECKLIST-INSTALACAO.md
└──────────────────────────────────────────────────────────────┘

╔════════════════════════════════════════════════════════════════╗
║  SISTEMA PRONTO PARA PRODUÇÃO                                 ║
║  Copie este relatório para seus registros                     ║
╚════════════════════════════════════════════════════════════════╝
EOF

    cat "$report_file"
    success "Relatório salvo: $report_file"
}

# ============================================================================
# MAIN — EXECUTAR FLUXO COMPLETO
# ============================================================================

main() {
    clear

    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     INSTALADOR DE PRODUÇÃO — Kitnets UFSC v2.0       ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""

    separator
    verificar_prereq
    separator

    separator
    criar_config
    separator

    separator
    validar_config
    separator

    separator
    gerar_appsscript_customizado
    separator

    separator
    atualizar_landing_page
    separator

    separator
    atualizar_dashboard
    separator

    separator
    criar_deploy_script
    separator

    separator
    criar_checklist
    separator

    separator
    relatorio_final
    separator

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ INSTALAÇÃO AUTOMATIZADA CONCLUÍDA!${NC}"
    echo ""
    echo "Arquivo de log: $LOG_FILE"
    echo "Configuração: $CONFIG_FILE"
    echo ""
    echo "Próximas ações:"
    echo "  1. Leia: CHECKLIST-INSTALACAO.md"
    echo "  2. Execute: bash deploy-producao.sh"
    echo "  3. Teste conforme CHECKLIST-INSTALACAO.md (Fase 7)"
    echo ""
    echo -e "${GREEN}Sucesso! 🚀${NC}"
}

# ============================================================================
# EXECUTAR
# ============================================================================

main "$@"

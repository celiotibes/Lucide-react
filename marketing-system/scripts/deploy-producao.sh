#!/bin/bash
set -e

echo "🚀 DEPLOY CRMT — Produção"
echo "=========================="
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se Netlify CLI está instalado
if ! command -v netlify &> /dev/null; then
    echo -e "${RED}❌ Netlify CLI não encontrado${NC}"
    echo "Instale com: npm install -g netlify-cli"
    exit 1
fi

echo -e "${YELLOW}📍 Verificando status do login Netlify...${NC}"
if ! netlify status &> /dev/null; then
    echo -e "${YELLOW}Você precisa fazer login no Netlify${NC}"
    netlify login
fi

echo ""
echo -e "${GREEN}✅ Autenticado no Netlify${NC}"
echo ""

# Opções de deploy
echo "Escolha o que fazer:"
echo "1. Deploy LANDING PAGE (landing/index.html)"
echo "2. Deploy DASHBOARD (dashboard/painel.html)"
echo "3. Deploy AMBOS"
echo ""

read -p "Digite a opção (1/2/3): " opcao

case $opcao in
    1)
        echo ""
        echo -e "${YELLOW}🚀 Deployando LANDING PAGE...${NC}"
        cd marketing-system/landing
        netlify deploy --prod --dir=. --message="Landing Page - CRMT $(date +%Y-%m-%d)"
        echo -e "${GREEN}✅ Landing Page deployada!${NC}"
        cd ../..
        ;;
    2)
        echo ""
        echo -e "${YELLOW}🚀 Deployando DASHBOARD...${NC}"
        cd marketing-system/dashboard
        netlify deploy --prod --dir=. --message="Dashboard - CRMT $(date +%Y-%m-%d)"
        echo -e "${GREEN}✅ Dashboard deployado!${NC}"
        cd ../..
        ;;
    3)
        echo ""
        echo -e "${YELLOW}🚀 Deployando LANDING PAGE...${NC}"
        cd marketing-system/landing
        netlify deploy --prod --dir=. --message="Landing Page - CRMT $(date +%Y-%m-%d)"
        echo -e "${GREEN}✅ Landing Page deployada!${NC}"
        cd ../..

        echo ""
        echo -e "${YELLOW}🚀 Deployando DASHBOARD...${NC}"
        cd marketing-system/dashboard
        netlify deploy --prod --dir=. --message="Dashboard - CRMT $(date +%Y-%m-%d)"
        echo -e "${GREEN}✅ Dashboard deployado!${NC}"
        cd ../..
        ;;
    *)
        echo -e "${RED}Opção inválida${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}════════════════════════════════════${NC}"
echo -e "${GREEN}✅ DEPLOY CONCLUÍDO!${NC}"
echo -e "${GREEN}════════════════════════════════════${NC}"
echo ""
echo "📱 Próximo passo:"
echo "1. Teste os links WhatsApp"
echo "2. Valide que os CTAs funcionam"
echo "3. Verifique o dashboard com dados reais"
echo ""
echo "🎯 Pronto para receber leads!"

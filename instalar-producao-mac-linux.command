#!/bin/bash
# Modo PRODUCAO: gera o pacote otimizado (minificado, code-split) e serve
# esse pacote pronto, em vez do servidor de desenvolvimento (mais lento pra
# carregar, com ferramentas de debug embutidas). Use este atalho quando
# quiser a mesma experiencia que uma versao publicada teria, mas ainda
# 100% local. Para o dia a dia de uso normal, iniciar-mac-linux.command
# (modo desenvolvimento) funciona igualmente bem e é mais simples.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
    echo
    echo "Node.js não foi encontrado neste computador."
    echo "Instale em https://nodejs.org (versão LTS) e rode este atalho de novo."
    echo
    read -r -p "Pressione Enter para sair..."
    exit 1
fi

if [ ! -d node_modules ]; then
    echo
    echo "Primeira vez rodando aqui — instalando dependências a partir do"
    echo "package-lock.json (instalação reprodutível), isso pode demorar"
    echo "alguns minutos. Não feche esta janela."
    echo
    if ! npm ci; then
        echo
        echo "A instalação falhou. Confira sua conexão com a internet e tente de novo."
        read -r -p "Pressione Enter para sair..."
        exit 1
    fi
fi

echo
echo "Gerando o pacote de produção (build otimizado)..."
echo

if ! npm run build; then
    echo
    echo "O build falhou — o sistema NÃO vai subir com um pacote quebrado."
    echo "Revise a mensagem de erro acima antes de tentar de novo."
    echo
    read -r -p "Pressione Enter para sair..."
    exit 1
fi

echo
echo "Build concluído. Iniciando o servidor de produção local..."
echo "O navegador vai abrir sozinho em alguns segundos."
echo "Para desligar, feche esta janela ou aperte Ctrl+C."
echo

(sleep 3 && (open http://localhost:4173 2>/dev/null || xdg-open http://localhost:4173 2>/dev/null)) &

npm run preview -- --port 4173

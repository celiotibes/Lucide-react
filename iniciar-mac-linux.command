#!/bin/bash
# Duplo clique neste arquivo (Mac) ou "./iniciar-mac-linux.command" no
# terminal (Linux) para instalar (só na primeira vez) e abrir o sistema.
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
    echo "Primeira vez rodando aqui — instalando dependências, isso pode"
    echo "demorar alguns minutos. Não feche esta janela."
    echo
    if ! npm install; then
        echo
        echo "A instalação falhou. Confira sua conexão com a internet e tente de novo."
        read -r -p "Pressione Enter para sair..."
        exit 1
    fi
fi

echo
echo "Iniciando o sistema... o navegador vai abrir sozinho em alguns segundos."
echo "Para desligar, feche esta janela ou aperte Ctrl+C."
echo

(sleep 3 && (open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null)) &

npm run dev

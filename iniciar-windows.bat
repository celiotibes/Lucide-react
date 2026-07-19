@echo off
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo Node.js nao foi encontrado neste computador.
    echo Instale em https://nodejs.org (versao LTS) e rode este atalho de novo.
    echo.
    pause
    exit /b 1
)

if not exist node_modules (
    echo.
    echo Primeira vez rodando aqui - instalando dependencias, isso pode
    echo demorar alguns minutos. Nao feche esta janela.
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo A instalacao falhou. Confira sua conexao com a internet e tente de novo.
        pause
        exit /b 1
    )
)

echo.
echo Iniciando o sistema... o navegador vai abrir sozinho em alguns segundos.
echo Para desligar, feche esta janela ou aperte Ctrl+C.
echo.

start "" http://localhost:5173

call npm run dev

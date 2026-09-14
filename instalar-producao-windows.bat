@echo off
rem Modo PRODUCAO: gera o pacote otimizado (minificado, code-split) e serve
rem esse pacote pronto, em vez do servidor de desenvolvimento (mais lento
rem pra carregar, com ferramentas de debug embutidas). Use este atalho
rem quando quiser a mesma experiencia que uma versao publicada teria, mas
rem ainda 100% local. Para o dia a dia de uso normal, iniciar-windows.bat
rem (modo desenvolvimento) funciona igualmente bem e e mais simples.
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
    echo Primeira vez rodando aqui - instalando dependencias a partir do
    echo package-lock.json (instalacao reprodutivel), isso pode demorar
    echo alguns minutos. Nao feche esta janela.
    echo.
    call npm ci
    if %errorlevel% neq 0 (
        echo.
        echo A instalacao falhou. Confira sua conexao com a internet e tente de novo.
        pause
        exit /b 1
    )
)

echo.
echo Gerando o pacote de producao (build otimizado)...
echo.

call npm run build
if %errorlevel% neq 0 (
    echo.
    echo O build falhou - o sistema NAO vai subir com um pacote quebrado.
    echo Revise a mensagem de erro acima antes de tentar de novo.
    echo.
    pause
    exit /b 1
)

echo.
echo Build concluido. Iniciando o servidor de producao local...
echo O navegador vai abrir sozinho em alguns segundos.
echo Para desligar, feche esta janela ou aperte Ctrl+C.
echo.

rem Mesmo truque de atraso do iniciar-windows.bat: espera o servidor subir
rem antes de abrir o navegador, numa janela minimizada a parte.
start /min "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:4173"

call npm run preview -- --port 4173

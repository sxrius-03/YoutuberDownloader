@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ==========================================================
echo       Youtube Downloader - Build e Empacotamento
echo ==========================================================
echo.

:: 1. Compilação do Frontend React/Vite
echo [1/3] Compilando Frontend React/Vite...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha durante o build do frontend.
    cd ..
    exit /b %errorlevel%
)
cd ..
echo.

:: 2. Limpeza de compilações anteriores
echo [2/3] Limpando diretórios de build anteriores...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo Limpeza concluída com sucesso!
echo.

:: 3. Compilação com PyInstaller
echo [3/3] Compilando aplicação com PyInstaller...
python -m PyInstaller "Youtube Downloader.spec" -y

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha durante a compilação do PyInstaller.
    echo Certifique-se de que todas as dependências estão instaladas.
    exit /b %errorlevel%
)
echo.
echo ==========================================================
echo       SUCESSO: Processo de Compilação Concluído!
echo ==========================================================
echo.
echo O aplicativo compilado está em:
echo dist\Youtube Downloader\
echo.
pause

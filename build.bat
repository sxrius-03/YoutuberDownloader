@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ==========================================================
echo       YouTube Downloader - Compilação e Instalador
echo ==========================================================
echo.

:: 0. Compilação do Frontend React/Vite
echo [0/4] Compilando Frontend React/Vite...
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

:: 1. Limpeza de compilações anteriores
echo [1/4] Limpando compilações anteriores...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo Limpeza concluída com sucesso!
echo.

:: 2. Compilação com PyInstaller
echo [2/4] Compilando aplicação com PyInstaller...
pyinstaller YoutubeDownloader.spec -y

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha durante a compilação do PyInstaller.
    echo Certifique-se de que todas as dependências estão instaladas.
    exit /b %errorlevel%
)
echo Executável compilado com sucesso em dist/YoutubeDownloader/
echo.

:: 3. Localização/Instalação do Inno Setup
echo [3/4] Procurando o compilador do Inno Setup (ISCC.exe)...

:: Verifica se está no PATH
where iscc >nul 2>nul
if %errorlevel% equ 0 (
    set ISCC_PATH=iscc
    echo Inno Setup localizado no PATH!
    goto compile_installer
)

:: Verifica no diretório padrão do Windows (x86)
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    echo Inno Setup localizado em: !ISCC_PATH!
    goto compile_installer
)

:: Verifica no diretório padrão do Windows (64-bit)
if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Program Files\Inno Setup 6\ISCC.exe"
    echo Inno Setup localizado em: !ISCC_PATH!
    goto compile_installer
)

:: Verifica no diretório de Programas Local (User AppData)
if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
    echo Inno Setup localizado em: !ISCC_PATH!
    goto compile_installer
)

:: Caso não localize, tenta instalar via winget
echo [AVISO] Inno Setup 6 não foi encontrado no seu computador.
echo Tentando baixar e instalar o Inno Setup automaticamente via winget...
winget install JRSoftware.InnoSetup --silent --accept-package-agreements --accept-source-agreements

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Não foi possível instalar o Inno Setup via winget.
    echo Por favor, instale-o manualmente através do link:
    echo https://jrsoftware.org/isdl.php
    exit /b 1
)

:: Espera 3 segundos para inicialização dos caminhos após instalação
timeout /t 3 /nobreak > nul

:: Re-verifica os diretórios após a instalação do winget
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
    echo Inno Setup instalado com sucesso e localizado em: !ISCC_PATH!
    goto compile_installer
)

if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="C:\Program Files\Inno Setup 6\ISCC.exe"
    echo Inno Setup instalado com sucesso e localizado em: !ISCC_PATH!
    goto compile_installer
)

if exist "%LocalAppData%\Programs\Inno Setup 6\ISCC.exe" (
    set ISCC_PATH="%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
    echo Inno Setup instalado com sucesso e localizado em: !ISCC_PATH!
    goto compile_installer
)

echo.
echo [ERRO] O Inno Setup foi instalado, mas o executável ISCC.exe não foi encontrado nos caminhos padrão.
echo Por favor, feche este terminal, abra um novo e execute o script novamente para atualizar as variáveis de ambiente.
exit /b 1

:compile_installer
echo.
:: 4. Compilação do Instalador
echo [4/4] Gerando instalador final com Inno Setup...
!ISCC_PATH! installer.iss

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Ocorreu uma falha ao gerar o instalador com Inno Setup.
    exit /b %errorlevel%
)

echo.
echo ==========================================================
echo       SUCESSO: Processo de Compilação Concluído!
echo ==========================================================
echo.
echo O instalador final foi gerado em:
echo dist\Output\YoutubeDownloader_Setup_v2.0.1.exe
echo.
pause

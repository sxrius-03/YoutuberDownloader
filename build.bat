@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo   Compilando Youtube Downloader (Tauri v2 Release)
echo ========================================================
set CARGO_TARGET_DIR=C:\CargoTarget\youtubedownloader
call npx tauri build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha durante a compilacao do release.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ========================================================
echo   SUCESSO: Executavel e Instalador Gerados!
echo ========================================================
echo.
pause

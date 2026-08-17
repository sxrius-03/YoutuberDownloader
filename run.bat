@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Youtube Downloader (Tauri v2 + Vite Dev)
echo ========================================================
set CARGO_TARGET_DIR=C:\CargoTarget\youtubedownloader
call npx tauri dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocorreu um erro ao iniciar o aplicativo.
    pause
)

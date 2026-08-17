# Youtube Downloader (Desktop Native)

Aplicativo desktop 100% autônomo para download de vídeos e playlists do YouTube com seleção de qualidade, formatos de saída (MP4, MKV, WEBM, MOV, AVI / MP3, M4A, WAV, FLAC, OPUS) e extração de áudio, construído sob a stack **Vite + React 19 + Tauri v2 (Rust)** (padrão Prospera / Semestrar).

---

## 🛠️ Comandos de Desenvolvimento

Executar a partir da raiz do repositório:

```powershell
# Execução em Desenvolvimento (Frontend Vite + Backend Nativo Rust Tauri)
.\run.bat
# ou:
npm run dev

# Compilação Release Local (Gera .exe standalone, instalador NSIS e pacote MSI)
.\build.bat
# ou:
npm run build

# Testes E2E Automatizados (Playwright)
npm run test:e2e

# Incremento e Controle de Versão (Atualiza package.json, Cargo.toml, tauri.conf.json, commita e tagueia)
.\bump-version.ps1 2.0.6
# ou:
npm run version:bump 2.0.6
```

---

## 🏗️ Arquitetura do Projeto

1. **Frontend (`frontend/`):**
   - **React 19 + TypeScript + Vite 8**
   - Estilização com **Vanilla CSS / OKLCH**
   - Comunicação com backend via IPC nativo `@tauri-apps/api/core` (`invoke`) e eventos `@tauri-apps/api/event` (`listen`).

2. **Backend Nativo (`src-tauri/`):**
   - Crate Rust Tauri v2 (`src-tauri/src/lib.rs`).
   - Execução direta do binário `bin/yt-dlp.exe` via pipes assíncronos com motor QuickJS/Node para resolução de desafios JavaScript (`n-token`).
   - Gerenciamento de configurações e histórico isolados no `%LOCALAPPDATA%\com.siriux.youtubedownloader\` (nunca expostos ou commitados no build).
   - **Sem Python, sem PyInstaller, sem servidores web em produção.**

3. **Diretório de Cache de Build (Kaspersky Workaround):**
   - `CARGO_TARGET_DIR=C:\CargoTarget\youtubedownloader`
   - Garante que a compilação de scripts de build do Rust (`build-script-build.exe`) execute fora de diretórios bloqueados pelo antivírus.

---

## 🚀 CI / CD & Releases

O fluxo de release (`.github/workflows/release.yml`) roda no GitHub Actions acionado automaticamente por tags `v*` (ex: `v2.0.3`):
1. Faz checkout e instala Node 20 + Rust toolchain estável x64.
2. Compila nativamente o frontend e o bundle Tauri para Windows.
3. Cria a GitHub Release no repositório anexando o instalador setup NSIS e pacote MSI com notas de versão automáticas.

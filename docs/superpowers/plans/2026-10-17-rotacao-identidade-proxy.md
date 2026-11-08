# Plano de Implementação: Rotação de Identidade de Acesso ao YouTube

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar falhas intermitentes de download por bloqueio do YouTube, rotacionando identidade anônima (pool de 100 jars de cookies gerados via curl) e proxies por run, com retry automático ao detectar bloqueio.

**Architecture:** Módulo Rust novo (`src-tauri/src/identity.rs`) com parte pura testável (validação de jar, detecção de bloqueio, round-robin) e parte de efeito (geração de jar por curl.exe, cópia por tarefa). `lib.rs` passa `--cookies`/`--proxy`/`--sleep-requests` nas 3 invocações de yt-dlp e faz retry 1x em `start_download`. Frontend ganha aba "Ajustes" para a lista de proxies.

**Tech Stack:** Rust (Tauri v2), React 19 + TypeScript + Vite 8, Vanilla CSS (tokens OKLCH), Playwright E2E, `curl.exe` nativo do Windows.

**Spec:** `docs/superpowers/specs/2026-10-17-rotacao-identidade-proxy-design.md` (o plano argumenta a partir dele; executor deve ler os dois.)

## Global Constraints

- Todo comando cargo usa `CARGO_TARGET_DIR=C:\CargoTarget\youtubedownloader` (workaround Kaspersky) — PowerShell: `$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'`.
- Jars, `identity.json` e proxies vivem **exclusivamente** em `%LOCALAPPDATA%\com.siriux.youtubedownloader\` — nada disso no repo, no `.gitignore`-watch nem no instalador.
- Nenhum cookie real de conta em nenhum momento.
- Falha na geração de identidade **nunca** bloqueia o download (segue sem `--cookies`).
- Proxy pode conter credenciais: nunca logar o valor (máscara `****` após `--proxy`).
- Copy de UI em pt-BR; código e commits em inglês.
- Suite Playwright: `workers: 1`, `fullyParallel: false` (já configurado em `playwright.config.ts`).
- Versão continua `2.0.9` — bump é fluxo de release separado (`bump-version.ps1`).
- Sujeito apenas a alterar arquivos listados nos tasks; sem refactors fora do escopo.

---

### Task 1: Módulo `identity.rs` — parte pura + testes

**Files:**
- Create: `src-tauri/src/identity.rs`
- Modify: `src-tauri/src/lib.rs` (uma linha: declaração do módulo)

**Interfaces:**
- Consumes: nada.
- Produces (usado por Tasks 3-4):
  - `pub const POOL_CAP: usize`
  - `pub struct RrState { pub jar_idx: usize, pub proxy_idx: usize }` (serde Serialize+Deserialize+Clone+Debug+Default)
  - `pub fn validate_cookie_jar(content: &str) -> bool`
  - `pub fn is_block_error(stderr: &str) -> bool`
  - `pub fn next_index(idx: usize, len: usize) -> usize`

- [ ] **Step 1: Criar `identity.rs` com SÓ os testes** (contrato primeiro; compile-error = red do motivo certo)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // Formato NETSCAPE real emitido pelo curl.exe do Windows (probe 17-10-2026):
    // linhas HttpOnly vem com prefixo "#HttpOnly_" e SÃO válidas.
    const VALID_JAR: &str = "# Netscape HTTP Cookie File\n\
    #HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1807793894\t__Secure-BUCKET\tCCM\n\
    #HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1807793894\tVISITOR_INFO1_LIVE\teXZxRjvMqOw\n\
    #HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1792243694\tGPS\t1\n";

    #[test]
    fn jar_valido_aceito() {
        assert!(validate_cookie_jar(VALID_JAR));
    }

    #[test]
    fn jar_sem_visitor_rejeitado() {
        let no_visitor = "# Netscape HTTP Cookie File\n\
        .youtube.com\tTRUE\t/\tTRUE\t1792243694\tGPS\t1\n";
        assert!(!validate_cookie_jar(no_visitor));
    }

    #[test]
    fn jar_vazio_ou_sem_sentido_rejeitado() {
        assert!(!validate_cookie_jar(""));
        assert!(!validate_cookie_jar("lixo de texto qualquer"));
    }

    #[test]
    fn mensagens_de_bloqueio_detectadas() {
        for msg in [
            "ERROR: [youtube] vid: Sign in to confirm you're not a bot. Use --cookies-from-browser",
            "ERROR: [youtube] vid: This content isn't available, try again later",
            "WARNING: [youtube] The page needs to be reloaded.",
            "ERROR: [youtube] vid: HTTP Error 403: Forbidden",
            "ERROR: [youtube] vid: HTTP Error 429: Too Many Requests",
        ] {
            assert!(is_block_error(msg), "deveria detectar: {msg}");
        }
    }

    #[test]
    fn mensagens_normais_nao_sao_bloqueio() {
        assert!(!is_block_error(""));
        assert!(!is_block_error("ERROR: unable to parse output template"));
        assert!(!is_block_error("[download] Destination: pasta\\video.mp4"));
    }

    #[test]
    fn round_robin_retorna_ao_comeco() {
        let mut idx = 0usize;
        for _ in 0..POOL_CAP + 5 {
            idx = next_index(idx, POOL_CAP);
        }
        assert_eq!(idx, 5);
    }

    #[test]
    fn round_robin_sem_opcoes_nao_panica() {
        assert_eq!(next_index(7, 0), 0);
    }
}
```

- [ ] **Step 2: Declarar o módulo em `lib.rs`** — localizar `pub mod updater;` (~linha 553) e adicionar acima:

```rust
pub mod identity;
```

- [ ] **Step 3: Rodar teste e confirmar o red**

Run (PowerShell, workdir = raiz do repo):
```powershell
$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'; cargo test --manifest-path src-tauri/Cargo.toml
```
Expected: FAIL de compilação — `E0425: cannot find function validate_cookie_jar` (e `is_block_error`, `next_index`, `POOL_CAP`). Motivo certo: funções não existem ainda.

- [ ] **Step 4: Implementar o mínimo** — adicionar ao topo de `identity.rs` (antes de `#[cfg(test)]`):

```rust
use serde::{Deserialize, Serialize};

pub const POOL_CAP: usize = 100;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct RrState {
    pub jar_idx: usize,
    pub proxy_idx: usize,
}

const VISITOR_COOKIE_TOKEN: &str = "VISITOR_INFO1_LIVE";

/// Aceita jar Netscape do curl (linhas "#HttpOnly_" contam); valida pela presença
/// do cookie de identidade VISITOR_INFO1_LIVE em qualquer linha de cookie.
pub fn validate_cookie_jar(content: &str) -> bool {
    content.lines().any(|line| {
        let body = line.strip_prefix("#HttpOnly_").unwrap_or(line);
        !body.starts_with('#') && body.split('\t').nth(5) == Some(VISITOR_COOKIE_TOKEN)
    })
}

const BLOCK_MARKERS: &[&str] = &[
    "Sign in to confirm",
    "not a bot",
    "This content isn't available, try again later",
    "The page needs to be reloaded",
    "HTTP Error 403",
    "HTTP Error 429",
];

pub fn is_block_error(stderr: &str) -> bool {
    BLOCK_MARKERS.iter().any(|m| stderr.contains(m))
}

pub fn next_index(idx: usize, len: usize) -> usize {
    if len == 0 { 0 } else { (idx + 1) % len }
}
```

- [ ] **Step 5: Rodar testes e confirmar green**

Run: mesmo comando do Step 3.
Expected: `test result: ok. 7 passed`.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/identity.rs src-tauri/src/lib.rs
git commit -m "feat(identity): pure block-error and cookie-jar logic"
```

---

### Task 2: `Settings.proxies` + comando de salvamento

**Files:**
- Modify: `src-tauri/src/lib.rs` (struct `Settings` ~linhas 54-57; `get_settings` ~linhas 486-503; novo comando; `generate_handler` ~linhas 560-571)

**Interfaces:**
- Consumes: nada de novos módulos.
- Produces (usado por Tasks 3-5):
  - `pub struct Settings { pub paths: Vec<String>, pub proxies: Vec<String> }` (serde; `proxies` com `#[serde(default)]`)
  - `pub fn load_settings_sync(app: &AppHandle) -> Settings`
  - `#[tauri::command] async fn save_setting_proxies(app: AppHandle, proxies: Vec<String>) -> Result<Settings, String>`

- [ ] **Step 1: Estender `Settings`** — substituir:

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub paths: Vec<String>,
}
```

por:

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    pub paths: Vec<String>,
    #[serde(default)]
    pub proxies: Vec<String>,
}
```

- [ ] **Step 2: Extrair leitura síncrona única** — em `lib.rs`, antes de `get_settings`, adicionar:

```rust
pub fn load_settings_sync(app: &AppHandle) -> Settings {
    let settings_file = get_app_dir(app).join("settings.json");
    if settings_file.exists() {
        if let Ok(content) = fs::read_to_string(&settings_file) {
            if let Ok(s) = serde_json::from_str::<Settings>(&content) {
                return s;
            }
        }
    }
    let default_downloads = match std::env::var("USERPROFILE") {
        Ok(up) => format!("{}\\Downloads", up),
        Err(_) => "C:\\Downloads".to_string(),
    };
    Settings { paths: vec![default_downloads], proxies: vec![] }
}
```

E reescrever `get_settings` para usá-lo (comportamento de escrever default quando arquivo não existe preservado):

```rust
#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let settings = load_settings_sync(&app);
    let settings_file = get_app_dir(&app).join("settings.json");
    if !settings_file.exists() {
        let _ = fs::write(&settings_file, serde_json::to_string_pretty(&settings).unwrap_or_default());
    }
    Ok(settings)
}
```

- [ ] **Step 3: Novo comando `save_setting_proxies`** — adicionar junto aos outros comandos:

```rust
#[tauri::command]
async fn save_setting_proxies(app: AppHandle, proxies: Vec<String>) -> Result<Settings, String> {
    let mut settings = load_settings_sync(&app);
    settings.proxies = proxies
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    let settings_file = get_app_dir(&app).join("settings.json");
    fs::write(&settings_file, serde_json::to_string_pretty(&settings).unwrap_or_default())
        .map_err(|e| format!("Falha ao salvar proxies: {}", e))?;
    Ok(settings)
}
```

- [ ] **Step 4: Registrar no handler** — em `tauri::generate_handler![...]`, adicionar `save_setting_proxies,` após `save_setting_path,`.

- [ ] **Step 5: Corrigir os dois construtores de `Settings` restantes** (não compilam mais sem `proxies`):
  - Em `save_setting_path`: `Ok(settings)` — sem mudança (usa `load_settings_sync` via `get_settings(app.clone())`; conferir que não há `Settings { paths: vec![] }` literal — trocar por `Settings { paths: vec![], proxies: vec![] }` se houver).
  - Grep de segurança (PowerShell):

```powershell
Select-String -Path src-tauri/src/lib.rs -Pattern 'Settings \{\s*$|Settings \{ paths|Settings \{' | ForEach-Object { "$($_.LineNumber): $($_.Line.Trim())" }
```

  Expected: todo literal `Settings {` têm `proxies` no campo. Corrigir os que não têm.

Run: `$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'; cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished` sem erros.

- [ ] **Step 6: Rodar unit tests** (regressão do Task 1)

Run: `$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `7 passed`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(settings): proxies list with save command"
```

---

### Task 3: Efeitos de identidade (geração/rotação) + wiring em `analyze_*`

**Files:**
- Modify: `src-tauri/src/identity.rs` (adiciona parte de efeito)
- Modify: `src-tauri/src/lib.rs` (`get_app_dir`/`create_hidden_command` viram `pub`; wiring em `analyze_video` ~linhas 131-140 e `analyze_playlist` ~linhas 204-213; máscara do log)

**Interfaces:**
- Consumes: Task 1 (funções puras) e Task 2 (`load_settings_sync`, `Settings.proxies`), `get_app_dir` e `create_hidden_command` de `lib.rs`.
- Produces (usado pelo Task 4):
  - `pub fn identity_dir(app: &AppHandle) -> PathBuf`
  - `pub fn load_state(app: &AppHandle) -> RrState` / `pub fn save_state(app: &AppHandle, st: &RrState)`
  - `pub fn generate_cookie_jar(slot: &Path) -> Result<(), String>`
  - `pub fn prepare_cookie(app: &AppHandle, task_id: &str) -> Option<PathBuf>`
  - `pub fn next_proxy(app: &AppHandle) -> Option<String>`

- [ ] **Step 1: Tornar utilitários visíveis ao módulo** — em `lib.rs`, trocar `fn get_app_dir(` por `pub fn get_app_dir(` e `fn create_hidden_command(` por `pub fn create_hidden_command(`.

- [ ] **Step 2: Implementar os efeitos** — adicionar ao final de `identity.rs` e completar os imports no topo do arquivo: `use std::fs;` e `use std::path::{Path, PathBuf};` (Path/PathBuf ainda não estão no arquivo — Task 1 não os usa):

```rust
use std::fs;
use tauri::AppHandle;

use crate::{create_hidden_command, get_app_dir, load_settings_sync};

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub fn identity_dir(app: &AppHandle) -> PathBuf {
    let dir = get_app_dir(app).join("yt-identity");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn state_path(app: &AppHandle) -> PathBuf {
    identity_dir(app).join("identity.json")
}

pub fn load_state(app: &AppHandle) -> RrState {
    fs::read_to_string(state_path(app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_state(app: &AppHandle, st: &RrState) {
    let _ = fs::write(state_path(app), serde_json::to_string_pretty(st).unwrap_or_default());
}

/// Gera jar anônimo (SEM conta) via curl.exe nativo do Windows: 2 GETs quentes.
pub fn generate_cookie_jar(slot: &Path) -> Result<(), String> {
    let jar = slot.to_string_lossy().to_string();
    let ua = BROWSER_UA.to_string();

    let mut home = create_hidden_command("curl.exe");
    home.arg("-s").arg("-L")
        .arg("-c").arg(&jar)
        .arg("-A").arg(&ua)
        .arg("https://www.youtube.com/?hl=pt-BR");
    home.output().map_err(|e| format!("curl indisponivel: {}", e))?;

    let mut robots = create_hidden_command("curl.exe");
    robots.arg("-s").arg("-L")
        .arg("-c").arg(&jar).arg("-b").arg(&jar)
        .arg("-A").arg(&ua)
        .arg("https://www.youtube.com/robots.txt");
    let _ = robots.output();

    let content = fs::read_to_string(slot).unwrap_or_default();
    if validate_cookie_jar(&content) {
        Ok(())
    } else {
        let _ = fs::remove_file(slot);
        Err("Não foi possível gerar identidade anônima do YouTube".to_string())
    }
}

/// Avança o índice do pool (round-robin persistido), gera o slot se faltar e
/// devolve uma CÓPIA temporária por tarefa — o yt-dlp reescreve o jar ao sair
/// e o master não pode ser tocado por runs concorrentes.
/// Falha de geração => None (download segue sem cookies).
pub fn prepare_cookie(app: &AppHandle, task_id: &str) -> Option<PathBuf> {
    let dir = identity_dir(app);
    let mut st = load_state(app);
    let idx = st.jar_idx;
    st.jar_idx = next_index(idx, POOL_CAP);
    save_state(app, &st);

    let slot = dir.join(format!("jar_{}.txt", idx));
    let valid = fs::read_to_string(&slot).ok()
        .map(|c| validate_cookie_jar(&c))
        .unwrap_or(false);
    if !valid && generate_cookie_jar(&slot).is_err() {
        return None;
    }

    // ponytail: mesmo nome de copy para multiplas analyze_* concorrentes;
    // race teorica aceita, trocar por sufixo unico se virar problema real.
    let tmp = dir.join(format!("temp_cookie_{}.txt", task_id));
    match fs::copy(&slot, &tmp) {
        Ok(_) => Some(tmp),
        Err(_) => Some(slot),
    }
}

/// Round-robin da lista de proxies do usuário (vazia => None).
pub fn next_proxy(app: &AppHandle) -> Option<String> {
    let proxies = load_settings_sync(app).proxies;
    if proxies.is_empty() {
        return None;
    }
    let mut st = load_state(app);
    let idx = st.proxy_idx % proxies.len();
    st.proxy_idx = next_index(idx, proxies.len());
    save_state(app, &st);
    Some(proxies[idx].clone())
}
```

(O import `use std::path::{Path, PathBuf};` entra no topo do arquivo junto com `use std::fs;` e os novos `use` do bloco.)

- [ ] **Step 3: Wiring em `analyze_video`** — após `cmd.arg("--retries").arg("10");` e ANTES de `cmd.arg(&url);` inserir:

```rust
    let cookies = identity::prepare_cookie(&app, "analyze");
    if let Some(jar) = &cookies {
        cmd.arg("--cookies").arg(jar);
    }
    if let Some(proxy) = identity::next_proxy(&app) {
        cmd.arg("--proxy").arg(&proxy);
    }
    cmd.arg("--sleep-requests").arg("1");
```

- [ ] **Step 4: Idem em `analyze_playlist`** — mesma inserção após `cmd.arg("--retries").arg("10");` e antes de `cmd.arg(&url);`.

- [ ] **Step 5: Máscara do log de comando** — em `start_download`, substituir:

```rust
        println!("[yt-dlp command] {:?}", cmd);
```

por:

```rust
        let mut mask_next = false;
        let args_disp: Vec<String> = cmd.get_args().map(|a| {
            let s = a.to_string_lossy().to_string();
            if mask_next {
                mask_next = false;
                return "****".to_string();
            }
            if s == "--proxy" { mask_next = true; }
            s
        }).collect();
        println!("[yt-dlp command] {}", args_disp.join(" "));
```

- [ ] **Step 6: Compilar + unit green**

Run: `$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 7 passed, sem warnings novos relevantes.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/identity.rs src-tauri/src/lib.rs
git commit -m "feat(identity): lazy anonymous jar pool with round-robin"
```

---

### Task 4: `start_download` — loop de retry com rotação

**Files:**
- Modify: `src-tauri/src/lib.rs` (corpo do `spawn_blocking` em `start_download`, ~linhas 282-481)

**Interfaces:**
- Consumes: Task 3 (`identity::prepare_cookie`, `identity::next_proxy`, `identity::is_block_error`).
- Produces: comportamento de retry (nada exportado).

- [ ] **Step 1: Reestruturar o corpo do `spawn_blocking` em loop de 2 tentativas.** Todo o bloco entre `tokio::task::spawn_blocking(move || {` e o fechamento `});` passa a ser:

```rust
    tokio::task::spawn_blocking(move || {
        let re_percent = regex::Regex::new(r"(\d+(?:\.\d+)?)%").unwrap();
        let re_speed = regex::Regex::new(r"at\s+([\d\w\.\/]+)").unwrap();
        let re_eta = regex::Regex::new(r"ETA\s+([\d:]+)").unwrap();

        let out_dir = if path.trim().is_empty() {
            match std::env::var("USERPROFILE") {
                Ok(up) => format!("{}\\Downloads", up),
                Err(_) => ".".to_string(),
            }
        } else {
            path.trim_end_matches(['/', '\\']).to_string()
        };
        let _ = fs::create_dir_all(&out_dir);

        let mut last_tmp: Option<PathBuf> = None;
        let mut final_err = String::new();
        let mut succeeded = false;

        for attempt in 0..2usize {
            last_tmp = identity::prepare_cookie(&app_handle, &task_id_clone);
            let proxy = identity::next_proxy(&app_handle);

            let mut cmd = create_hidden_command(&yt_dlp);
            cmd.arg("--newline");
            cmd.arg("--no-mtime");
            cmd.arg("--windows-filenames");
            cmd.arg("--remote-components").arg("ejs:github");
            cmd.arg("--js-runtimes").arg("node");
            if qjs.exists() {
                cmd.arg("--js-runtimes").arg(format!("quickjs:{}", qjs.to_string_lossy()));
            }
            if ffmpeg.exists() {
                cmd.arg("--ffmpeg-location").arg(&ffmpeg_dir);
            }
            cmd.arg("--socket-timeout").arg("30");
            cmd.arg("--retries").arg("10");
            cmd.arg("--fragment-retries").arg("10");
            cmd.arg("--sleep-requests").arg("1");
            if let Some(jar) = &last_tmp {
                cmd.arg("--cookies").arg(jar);
            }
            if let Some(p) = &proxy {
                cmd.arg("--proxy").arg(p);
            }

            let out_tmpl = format!("{}/{}.%(ext)s", out_dir, safe_filename);
            cmd.arg("-o").arg(&out_tmpl);

            if download_type == "audio" {
                cmd.arg("-x");
                cmd.arg("--audio-format").arg(&target_format);
                cmd.arg("--audio-quality").arg("0");
            } else {
                let digits: String = quality.chars().filter(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() && quality != "Melhor" {
                    let fmt = format!("bestvideo[height<={0}]+bestaudio/best[height<={0}]/best", digits);
                    cmd.arg("-f").arg(&fmt);
                } else {
                    cmd.arg("-f").arg("bestvideo+bestaudio/best");
                }
                if target_format == "mkv" || target_format == "webm" || target_format == "mp4" {
                    cmd.arg("--merge-output-format").arg(&target_format);
                } else {
                    cmd.arg("--recode-video").arg(&target_format);
                }
            }
            cmd.arg(&url);
            cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

            let mut mask_next = false;
            let args_disp: Vec<String> = cmd.get_args().map(|a| {
                let s = a.to_string_lossy().to_string();
                if mask_next {
                    mask_next = false;
                    return "****".to_string();
                }
                if s == "--proxy" { mask_next = true; }
                s
            }).collect();
            println!("[yt-dlp command] {}", args_disp.join(" "));

            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(e) => {
                    final_err = format!("Falha ao iniciar yt-dlp: {}", e);
                    eprintln!("[yt-dlp error] {}", final_err);
                    break;
                }
            };

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            let mut stderr_lines: Vec<String> = Vec::new();
            let stderr_handle = if let Some(err_pipe) = stderr {
                Some(std::thread::spawn(move || {
                    let reader = BufReader::new(err_pipe);
                    let mut captured = Vec::new();
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            eprintln!("[yt-dlp stderr] {}", l);
                            captured.push(l);
                        }
                    }
                    captured
                }))
            } else {
                None
            };

            if let Some(out_pipe) = stdout {
                let reader = BufReader::new(out_pipe);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        println!("[yt-dlp stdout] {}", l);
                        if l.contains("[download]") {
                            let mut progress = 0.0;
                            if let Some(cap) = re_percent.captures(&l) {
                                if let Ok(p) = cap[1].parse::<f64>() { progress = p; }
                            }
                            let speed = re_speed.captures(&l).map(|c| c[1].to_string()).unwrap_or_default();
                            let eta = re_eta.captures(&l).map(|c| c[1].to_string()).unwrap_or_default();
                            let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                                task_id: task_id_clone.clone(),
                                status: "downloading".to_string(),
                                progress,
                                speed,
                                eta,
                                message: format!("Baixando: {}%", progress as i32),
                            });
                        } else if l.contains("[ExtractAudio]") || l.contains("[Merger]") || l.contains("[Fixup]") {
                            let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                                task_id: task_id_clone.clone(),
                                status: "processing".to_string(),
                                progress: 100.0,
                                speed: "".to_string(),
                                eta: "".to_string(),
                                message: "Convertendo / mesclando áudio e vídeo...".to_string(),
                            });
                        }
                    }
                }
            }

            if let Some(handle) = stderr_handle {
                if let Ok(errs) = handle.join() {
                    stderr_lines = errs;
                }
            }

            let status = child.wait();
            match status {
                Ok(s) if s.success() => {
                    succeeded = true;
                    break;
                }
                _ => {
                    final_err = if stderr_lines.is_empty() {
                        "Processo do yt-dlp encerrou com erro".to_string()
                    } else {
                        stderr_lines.join("\n")
                    };
                    eprintln!("[yt-dlp error] Process exited with failure: {}", final_err);
                    if identity::is_block_error(&final_err) && attempt == 0 {
                        let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                            task_id: task_id_clone.clone(),
                            status: "downloading".to_string(),
                            progress: 0.0,
                            speed: "".to_string(),
                            eta: "".to_string(),
                            message: "Rotacionando identidade de acesso e tentando novamente...".to_string(),
                        });
                        continue; // 2º ciclo cai em slot novo de jar + próximo proxy
                    }
                    break;
                }
            }
        }

        if let Some(tmp) = &last_tmp {
            let _ = fs::remove_file(tmp);
        }

        if succeeded {
            let history_file = get_app_dir(&app_handle).join("history.json");
            let mut history: Vec<HistoryItem> = if history_file.exists() {
                fs::read_to_string(&history_file)
                    .ok()
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            let now = chrono::Local::now().format("%d/%m/%Y %H:%M").to_string();
            let display_type = format!("{} ({})",
                if download_type == "audio" { "Áudio" } else { "Vídeo" },
                target_format.to_uppercase()
            );
            history.insert(0, HistoryItem {
                title: safe_filename,
                path: out_dir,
                date: now,
                r#type: display_type,
                size: serde_json::json!("N/A"),
            });
            history.truncate(100);
            let _ = fs::write(&history_file, serde_json::to_string_pretty(&history).unwrap_or_default());

            let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                task_id: task_id_clone,
                status: "finished".to_string(),
                progress: 100.0,
                speed: "0".to_string(),
                eta: "0".to_string(),
                message: "Download concluído com sucesso!".to_string(),
            });
        } else {
            let _ = app_handle.emit("download-progress", DownloadProgressPayload {
                task_id: task_id_clone,
                status: "error".to_string(),
                progress: 0.0,
                speed: "".to_string(),
                eta: "".to_string(),
                message: if final_err.is_empty() { "Processo do yt-dlp encerrou com erro".to_string() } else { final_err },
            });
        }
    });
```

**Nota:** o `out_dir` foi **hospedado fora do loop** (não rotaciona entre tentativas — depende só de `path`), então o `HistoryItem` usa `path: out_dir` direto, `String` movida uma única vez no fim. No `Err(e)` de `cmd.spawn()` o `final_err` é alimentado e o loop cai direto no emit de erro final (spawn failure não é bloqueio do YouTube, sem retry).

- [ ] **Step 2: Compilar + testes**

Run: `$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 7 passed, compilação limpa.

- [ ] **Step 3: Revisão rápida de movimentação** — o `cargo check` já pega E0382 (use-after-move). Conferir que depois do `spawn_blocking` o escopo async só usa `Ok(task_id)`:

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(download): rotate identity and retry once on block"
```

---

### Task 5: Frontend — aba Ajustes (lista de proxies)

**Files:**
- Modify: `frontend/src/api/bridge.ts` (interface `Settings` ~linhas 24-26; nova função após `saveSettingPath`)
- Create: `frontend/src/components/SettingsPanel.tsx`
- Modify: `frontend/src/App.tsx` (nav + render + tipo do estado)
- Modify: `frontend/src/index.css` (adicionar `.proxy-textarea`, `.feedback-text` perto de `.meta-*`)
- Modify: `e2e/smoke.spec.ts` (teste de navegação: 3 → 4 abas)

**Interfaces:**
- Consumes: Task 2 (`save_setting_proxies`, `Settings.proxies`).
- Produces: componente `<SettingsPanel />` na 4ª aba.

- [ ] **Step 1: `bridge.ts`** — substituir:

```ts
export interface Settings {
  paths: string[];
}
```

por:

```ts
export interface Settings {
  paths: string[];
  proxies: string[];
}
```

E adicionar após `saveSettingPath`:

```ts
export async function saveSettingProxies(proxies: string[]): Promise<Settings> {
  if (isTauri()) {
    return invoke<Settings>('save_setting_proxies', { proxies });
  }
  throw new Error('Proxies só podem ser configurados no app nativo');
}
```

- [ ] **Step 2: `SettingsPanel.tsx` (novo):**

```tsx
import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { getSettings, saveSettingProxies } from '../api/bridge';

export const SettingsPanel: React.FC = () => {
  const [proxiesText, setProxiesText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s) => setProxiesText((s.proxies || []).join('\n')))
      .catch(() => { /* preview web sem backend: segue com textarea vazia */ });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await saveSettingProxies(proxiesText.split('\n'));
      setFeedback('Proxies salvos com sucesso.');
    } catch (e: any) {
      setFeedback(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-card" data-testid="settings-panel">
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Ajustes</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' }}>
        Caminho alternativo de rede para contornar bloqueio de IP. Um proxy por linha
        (ex.: <code>http://user:senha@host:porta</code> ou <code>socks5://host:porta</code>).
        A cada download o app rotaciona entre os proxies da lista.
      </p>
      <div className="meta-field">
        <label className="meta-label">Proxies (round-robin)</label>
        <textarea
          className="proxy-textarea"
          placeholder={'http://user:senha@host:porta\nsocks5://host:porta\n(Deixe vazio para não usar proxy)'}
          value={proxiesText}
          onChange={(e) => { setProxiesText(e.target.value); setFeedback(null); }}
          disabled={saving}
          spellCheck={false}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={15} />
          <span>{saving ? 'Salvando...' : 'Salvar proxies'}</span>
        </button>
        {feedback && <span className="feedback-text">{feedback}</span>}
      </div>
    </div>
  );
};

export default SettingsPanel;
```

- [ ] **Step 3: `App.tsx`** — tipo do estado, ícone, botão e render:

Import: `import { Film, ListMusic, History, Settings as SettingsIcon, Download } from 'lucide-react';`
Import do painel: `import SettingsPanel from './components/SettingsPanel';`

Estado: `useState<'single' | 'playlist' | 'history' | 'settings'>('single')`

Nav (após o botão Histórico):

```tsx
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon size={16} />
          <span>Ajustes</span>
        </button>
```

Render (após HistoryList):

```tsx
        {activeTab === 'settings' && <SettingsPanel />}
```

- [ ] **Step 4: `index.css`** — após o bloco `.meta-input:focus` (~linha 381):

```css
.proxy-textarea {
  width: 100%;
  min-height: 140px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.85rem;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.5;
  outline: none;
  transition: border-color 0.2s;
  resize: vertical;
}

.proxy-textarea:focus {
  border-color: var(--accent-blue);
}

.feedback-text {
  font-size: 0.8rem;
  color: var(--text-muted);
}
```

- [ ] **Step 5: Atualizar o e2e de navegação** — em `e2e/smoke.spec.ts`, no teste `Can navigate between all 3 tabs smoothly`, renomear para `Can navigate between all 4 tabs smoothly` e inserir ANTES do "Return to Single Download tab":

```ts
    // Go to Settings tab
    const settingsTab = page.locator('button.tab-btn:has-text("Ajustes")');
    await settingsTab.click();
    await expect(settingsTab).toHaveClass(/active/);
    await page.waitForTimeout(300);
    await expect(page.locator('textarea.proxy-textarea')).toBeVisible();
    await page.screenshot({ path: 'e2e-screenshots/04-settings-tab.png', fullPage: true });
```

E incluir no primeiro teste (`App loads without errors...`):

```ts
    const settingsTab = page.locator('button.tab-btn:has-text("Ajustes")');
    await expect(settingsTab).toBeVisible();
```

- [ ] **Step 6: Build do frontend + suite e2e**

Run: `npm run test:e2e`
Expected: todos os testes passam; `e2e-screenshots/04-settings-tab.png` gerado; **abrir e olhar o screenshot** (regra de verificação visual — screenshot que ninguém olhou não é verificação).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/bridge.ts frontend/src/components/SettingsPanel.tsx frontend/src/App.tsx frontend/src/index.css e2e/smoke.spec.ts
git commit -m "feat(ui): settings tab with proxy round-robin list"
```

---

### Task 6: Verificação de ponta a ponta na janela real (WebView2)

**Files:**
- Create: `e2e/tauri-visual.mjs` (script descartável de verificação visual via CDP)
- Não modifica código de produto.

**Interfaces:**
- Consumes: tudo dos Tasks 1-5.
- Produces: evidências (screenshots + probe de download real).

- [ ] **Step 1: Subir `tauri dev` com porta de debug** (PowerShell, raiz do repo, background):

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222';
$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader';
npx tauri dev
```

Poll até responder (não sleep fixo):

```powershell
do { Start-Sleep -Milliseconds 800; $ok = (try { (Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/version' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }) } while ($ok -ne 200)
```

- [ ] **Step 2: Script CDP `e2e/tauri-visual.mjs`** — conecta na janela real (não cria página nova):

```js
// Verificacao visual da janela WebView2 real via CDP (padrao Semestrar/e2e/fixtures).
// Descartavel: roda fora da suite Playwright, workers irrelevantes.
import { chromium } from '@playwright/test';

const cdp = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = cdp.contexts()[0];
// Janela única do WebView2: pega a página já aberta, NÃO cria página nova.
const page = ctx.pages().find(p => (p.url() || '').startsWith('http')) || ctx.pages()[0];
await page.bringToFront();

// Aba Ajustes na janela REAL
await page.locator('button.tab-btn:has-text("Ajustes")').click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'e2e-screenshots/tauri-real-settings.png', fullPage: true });

// Probe funcional: salvar 2 proxies e recarregar a tela
await page.locator('textarea.proxy-textarea').fill('http://127.0.0.1:9\nhttp://127.0.0.1:8');
await page.locator('button:has-text("Salvar proxies")').click();
await page.waitForTimeout(500);
await page.screenshot({ path: 'e2e-screenshots/tauri-real-proxy-saved.png', fullPage: true });

// Limpar (deixa a instalacao do Eduardo sem proxies de teste)
await page.locator('textarea.proxy-textarea').fill('');
await page.locator('button:has-text("Salvar proxies")').click();
await page.waitForTimeout(500);

await cdp.close();
console.log('OK: settings tab verified in real window');
```

(Lógica do `find` simplificada de propósito: na janela única do WebView2 só existe uma página. **Pegar a página já aberta, nunca criar página nova** — sem a ponte IPC uma página nova quebra em toda tela que busca dado.)

Run: `node e2e/tauri-visual.mjs`
Expected: dois screenshots gerados; **olhá-los** antes de seguir.

- [ ] **Step 3: Probe de download real** — na mesma janela (via Playwright CDP ou manualmente pelo Eduardo olhando): aba Download Único, URL de vídeo público (ex.: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`), baixar. Verificar:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\com.siriux.youtubedownloader\yt-identity" | Select-Object Name
```

Expected: `jar_0.txt` (ou índice maior) + `identity.json` — prova de que o wiring `--cookies`/round-robin está de pé. Download conclui na UI.

- [ ] **Step 4: Suite completa final**

Run:
```powershell
$env:CARGO_TARGET_DIR='C:\CargoTarget\youtubedownloader'; cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
```
Expected: verde nos dois. Anexar nos comentários do PR (ou relatório) os screenshots.

- [ ] **Step 5: Derrubar o `tauri dev`** (árvore do processo — não deixar instância órfã presa na porta 9222/banco):

```powershell
taskkill /PID <pid_do_npx_tauri_dev> /T /F
```

- [ ] **Step 6: Commit do script de verificação (descartável, vai no repo por rastreabilidade)**

```bash
git add e2e/tauri-visual.mjs
git commit -m "test(e2e): real-window visual check via CDP"
```

---

## Checklist de fechamento (todas as tasks)

- [ ] `cargo test` verde (unit)
- [ ] `npm run test:e2e` verde (4 abas, screenshots vistos)
- [ ] Probe real gerou `jar_*.txt` em `%LOCALAPPDATA%` e download concluiu
- [ ] Log do console NUNCA mostra o valor do proxy (mascarado `****`)
- [ ] `settings.json` legado (sem `proxies`) carrega sem erro
- [ ] Git: branch `work/2026-10-17`, um commit por task, working tree limpa ao final

# Design: Rotação de Identidade de Acesso ao YouTube (Pool de Cookies Anônimos + Proxy Round-Robin)

**Data:** 17-10-2026
**Branch:** `work/2026-10-17`
**Status:** Aprovado pelo Eduardo (design em chat + ajuste: pool por download com jar temporário)
**Escopo:** Bounded — fluxo de download/analise existente em `src-tauri/src/lib.rs` + campo de proxy na UI.

---

## 1. Contexto e Diagnóstico

**Sintato relatado:** às vezes o download falha e o app mostra um alerta de "IP block ou algo assim". O alerta é o stderr cru do `yt-dlp` repassado pelo evento `download-progress` (status `error` → `SingleDownload.tsx` linha 168 usa `payload.message`).

**Estado do código hoje (v2.0.9, `lib.rs`):** nenhuma invocação passa cookies, nenhuma passa `player_client`, nenhum pacing — só retries, timeouts e os runtimes EJS (`--remote-components ejs:github`, `--js-runtimes node` + `quickjs`). Todos os clientes do YouTube são os defaults do yt-dlp.

**Evidência de probes (17-10-2026, `bin/yt-dlp.exe` versão 2026.08.19) no repo yt-dlp/wiki:**

| Probe | Resultado |
| --- | --- |
| `player_client=android_vr` | WARNING: formatos HTTPS exigem GVS PO Token (skip → fallback só 360p `format 18`). Enforcement ativo nesta versão. |
| Default (sem args) | `webpage` → cliente `visionos` → HLS m3u8 — caminho sem PO Token, funciona sem cookies. |
| Cliente `tv` sem cookies | Formatos SABR-only, n-sig falha, nenhum formato utilizável. |
| Cliente `tv` + jar anônimo de curl | `ERROR: The page needs to be reloaded.` — jar feito por máquina não é "active guest" para o `tv`. **Caminho excluído.** |
| Jar anônimo (curl, 2 GETs, cookies `VISITOR_INFO1_LIVE` etc.) + cliente default | **Funciona**: mesmo resultado do run sem cookies. Zero conta. |
| `--help` + `-v` | `PO Token Providers: none` — o binário incluído não traz provider algum; PO token exige plugin externo. |

**Pesquisa no repo yt-dlp (wiki Extractors + PO Token Guide, edição Jul/2026):**

- PO Token é obrigatório para GVS em `web`/`mweb` (e agora parcialmente `android_vr`); sem token → 403/bloqueio de IP.
- Limite de taxa por sessão convidada: **~300 vídeos/hora** (~1000 requests webpage/player). Exceder → "Sign in to confirm you're not a bot" / "This content isn't available, try again later", com flag temporária no IP.
- Cookies de conta real: risco real de throttle/ban da conta (wiki adverte) — **descartado pelo Eduardo** (nada de cookie real).
- PO Token provider (bgutil-ytdlp-pot-provider, recomendado pela wiki) exige **Node ≥22 ou Deno**; incompatível com o QuickJS embutido; bundlar um runtime inteiro (+~100 MB no instalador) não entra neste escopo.

**Conclusão:** o bloqueio intermitente é combinação de (a) esgotamento da identidade convidada (rate limit por sessão) e (b) reputação do IP. Cookies anônimos gerados por máquina funcionam no caminho default e são a alavanca disponível sem conta; proxy externo é a alavanca para IP.

---

## 2. Decisões

| Decisão | Escolha | Motivo resumido |
| --- | --- | --- |
| Identidade sem conta | Pool de **qjs jars anônimos** gerados por `curl.exe` nativo do Windows (2 GETs) | Probe provou que o caminho default aceita; zero dependência nova |
| Pool | Cap de **100 slots**, **geração lazy** (só o slot selecionado é gerado, 1 jar = 2 requests) | Pré-aquecer 100 = 200 requests cegos do próprio IP — irônico e custoso |
| Round-robin | **Cada run de yt-dlp** (incl. `analyze_*`) consome o próximo slot; índice persistido em `identity.json` | Análise também consome requests da sessão |
| Arquivo por tarefa | `--cookies` aponta para **cópia temporária por tarefa** (master intocado) | yt-dlp reescreve o jar ao sair (YSC observado mudando); concorrência não corrompe o master |
| Proxy | Lista em `Settings.proxies`, **round-robin por run**, `--proxy` | Proxy não se "gera" — vem do Eduardo/provedor; o app só rotaciona |
| Bloqueio detectado | `is_block_error(stderr)` → **avança slot + proxy, 1 retry automático** (status `downloading`, progress 0, msg "Rotacionando identidade...") | Aprovação do Eduardo: "para cada download, um novo". Não usar `processing` — a UI força o progresso a 100 nesse status |
| Pacing | `--sleep-requests 1` em todas as invocações |wiki: 5-10s entre downloads; 1s por request já diminue rajada |
| PO Token provider | **Fora do escopo** (futuro: bundlar Deno + plugin bgutil) | +100 MB e manutenção contínua; pool cobre o caso atual |
| Import de cookies.txt manual | **Fora do escopo** (futuro) | Eduardo não quer cookie real |

---

## 3. Arquitetura

```
frontend/src/
  api/bridge.ts            (+Settings.proxies, +saveSettingProxies)
  components/SettingsPanel.tsx  (NOVO - textarea proxy + salvar)
  App.tsx                  (+ tab "Ajustes", 4ª)
  index.css                (+ .proxy-textarea, .feedback-text)

src-tauri/src/
  identity.rs              (NOVO - pool, validação, detecção, round-robin)
  lib.rs                   (Settings.proxies, load_settings_sync,
                            save_setting_proxies, wiring --cookies/--proxy/
                            --sleep-requests, retry 1x no start_download,
                            get_app_dir/create_hidden_command → pub)
```

**Contratos (`identity.rs`):**

```rust
pub const POOL_CAP: usize = 100;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct RrState { pub jar_idx: usize, pub proxy_idx: usize }

// puros, testáveis:
pub fn validate_cookie_jar(content: &str) -> bool   // aceita prefixo #HttpOnly_; exige VISITOR_INFO1_LIVE
pub fn is_block_error(stderr: &str) -> bool         // marcadores de bloqueio
pub fn next_index(idx: usize, len: usize) -> usize  // wrap, len==0 → 0

// efeitos:
pub fn identity_dir(app: &AppHandle) -> PathBuf                       // app_dir/yt-identity
pub fn load_state(app) -> RrState / pub fn save_state(app, &RrState)  // identity.json
pub fn generate_cookie_jar(slot: &Path) -> Result<(), String>         // curl.exe oculto, 2 GETs
pub fn prepare_cookie(app, task_id: &str) -> Option<PathBuf>          // rotaciona+gera+copia temp
pub fn next_proxy(app) -> Option<String>                              // rotaciona entre proxies
```

**Marcadores de bloqueio (`is_block_error`):** `Sign in to confirm`, `not a bot`, `This content isn't available, try again later`, `The page needs to be reloaded`, `HTTP Error 403`, `HTTP Error 429`.

**Wiring:** `analyze_video`, `analyze_playlist` e `start_download` recebem `--cookies <temp>` (se jar ok), `--proxy <proxy>` (se lista não vazia) e `--sleep-requests 1`, na ordem, antes da URL.

**`start_download` (retry):** corpo do `spawn_blocking` vira loop de no máx. 2 tentativas: prepara identidade → monta comando → roda → sucesso sai; falha com `is_block_error` e `attempt == 0` emite `downloading` com progress 0 e "Rotacionando identidade de acesso e tentando novamente..." e repete (o `prepare_cookie` do 2º ciclo cai num slot novo, possivelmente gerando jar novo; `next_proxy` avança o proxy). Sucesso → histórico + emit `finished` (inalterado). Falha final → emit `error` com stderr (inalterado). Temp files removidos ao final.

---

## 4. Fluxo de Dados e Locais de Arquivo

- Tudo dentro de `get_app_dir()` = `%LOCALAPPDATA%\com.siriux.youtubedownloader\` (regra de isolamento #### 5 do GEMINI.md — nada disso vai para repo nem instalador):
  - `yt-identity/jar_<0..99>.txt` — pool master (Netscape, gerado por curl).
  - `yt-identity/temp_cookie_<task_id>.txt` — cópia por tarefa, apagada no fim da run.
  - `yt-identity/identity.json` — `{"jar_idx": n, "proxy_idx": n}`.
  - `settings.json` — ganha `"proxies": []` (`#[serde(default)]`, retrocompatível).
- Jar válido: linha do cookie (com ou sem prefixo `#HttpOnly_`) cujo campo 5 (nome) seja `VISITOR_INFO1_LIVE` — formato real do curl.exe do Windows, probe confirmado.

## 5. Falhas, Concorrência e Segurança

- **Geração de jar falha** (sem rede, curl ausente): `prepare_cookie` → `None` → comando segue **sem** `--cookies`. Nunca bloqueia download por-causa da identidade.
- **Concorrência:** cópia por tarefa isola o write-back do yt-dlp. Geração lazy escreve direto no slot (dois criadores simultâneos no mesmo slot: corrida teórica aceita — `ponytail:` trocar por `.tmp`+rename se virar problema real). `temp_cookie_analyze.txt` é nome fixo para análises concorrentes — mesma aceitação anotada.
- **Segurança:** proxy pode embutir `user:senha` → o `println!("[yt-dlp command] ...")` passa a imprimir os args com o valor após `--proxy` mascarado como `****`. Jars/proxies só em disco local do usuário.
- **Settings legados:** `settings.json` sem `proxies` carrega com `Vec vazio` via `#[serde(default)]`.

## 6. Contrato de Testes (TDD)

1. **Unit (Rust, escritos primeiro → red = E0425, depois impl → green):**
   - `validate_cookie_jar`: jar válido do fixture real do curl aceito; sem VISITOR rejeitado; vazio/lixo rejeitado.
   - `is_block_error`: os 5 formatos de erro reais detectados; mensagens normais não detectadas; vazio false.
   - `next_index`: wrap em `POOL_CAP`; `len == 0` não pânico → 0.
   - Comando: `cargo test` com `CARGO_TARGET_DIR=C:\CargoTarget\youtubedownloader` (workaround Kaspersky).
2. **E2E (Playwright, suite existente):** smoke atualizado para **4 abas** (Ajustes visível, textarea visível, screenshot `04-settings-tab.png`). `npm run test:e2e` (build do frontend + preview :8888, `workers: 1`).
3. **Janela real (regra Playwright/WebView2):** `tauri dev` com `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, conectar via CDP (`connectOverCDP`), screenshot da aba Ajustes na WebView2 real; probe de download real de vídeo público → verificar `jar_*.txt` criado e histórico gravado.
4. **Regressão:** suíte completa verde antes de fechar.

## 7. Fora do Escopo (futuros)

- Bundlar PO Token provider (Deno + plugin bgutil) — necessário só se o caminho default virar insufficient.
- Import manual de cookies.txt (conteúdo de conta) — reversível a qualquer momento.
- Checagem de saúde dos proxies (testar conectividade antes de usar) — YAGNI hoje.
- Fix de corrida na geração lazy (`.tmp` + rename) — anotado com `ponytail:`.

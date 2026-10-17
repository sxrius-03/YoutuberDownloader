use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::{create_hidden_command, get_app_dir, load_settings_sync};

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

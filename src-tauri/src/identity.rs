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

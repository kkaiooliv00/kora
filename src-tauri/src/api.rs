use serde::Serialize;
use std::{
    collections::hash_map::RandomState,
    error::Error,
    hash::{BuildHasher, Hasher},
    thread,
};
use tauri::{AppHandle, Emitter};
use tiny_http::{Response, Server};

const STATES: [&str; 3] = ["running", "waiting", "idle"];

/// Servidor HTTP local que os hooks dos agentes chamam para avisar o status.
pub struct Api {
    pub port: u16,
    pub token: String,
}

#[derive(Clone, Serialize)]
struct StatusEvent {
    chat: String,
    state: String,
}

fn random_token() -> String {
    (0..2)
        .map(|_| format!("{:016x}", RandomState::new().build_hasher().finish()))
        .collect()
}

pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub fn start(app: AppHandle) -> Result<Api, Box<dyn Error>> {
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|addr| addr.port())
        .ok_or("endereço da API local inválido")?;
    let token = random_token();
    let expected = token.clone();

    thread::spawn(move || {
        for req in server.incoming_requests() {
            let code: u16 = match parse(req.url(), &expected) {
                Some((chat, state)) => {
                    let _ = app.emit("chat-status", StatusEvent { chat, state });
                    204
                }
                None => 403,
            };
            let _ = req.respond(Response::empty(code));
        }
    });

    Ok(Api { port, token })
}

/// Aceita só `/status/<chat>/<estado>?t=<token>`.
fn parse(url: &str, token: &str) -> Option<(String, String)> {
    let (path, query) = url.split_once('?')?;
    if query != format!("t={token}") {
        return None;
    }
    let mut parts = path.trim_start_matches('/').split('/');
    if parts.next()? != "status" {
        return None;
    }
    let chat = parts.next()?;
    let state = parts.next()?;
    let valid = parts.next().is_none() && is_valid_id(chat) && STATES.contains(&state);
    valid.then(|| (chat.to_string(), state.to_string()))
}

#[cfg(test)]
mod tests {
    use super::parse;

    #[test]
    fn parse_accepts_only_valid_requests() {
        let ok = parse("/status/ab-12/running?t=tok", "tok");
        assert_eq!(ok, Some(("ab-12".into(), "running".into())));
        assert_eq!(parse("/status/ab-12/running?t=bad", "tok"), None);
        assert_eq!(parse("/status/ab-12/running", "tok"), None);
        assert_eq!(parse("/status/ab-12/hacked?t=tok", "tok"), None);
        assert_eq!(parse("/status/a%2F/idle?t=tok", "tok"), None);
        assert_eq!(parse("/status/ab/idle/x?t=tok", "tok"), None);
    }
}

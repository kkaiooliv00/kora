use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{hash_map::RandomState, HashMap},
    error::Error,
    hash::{BuildHasher, Hasher},
    io::Read,
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Request, Response, Server};

const STATES: [&str; 3] = ["running", "waiting", "idle"];
const CLI_KINDS: [&str; 4] = ["list", "send", "read", "status"];
const MAX_BODY: u64 = 1 << 20;
const CLI_TIMEOUT: Duration = Duration::from_secs(15);

/// Pedidos do `kora-cli` esperando a resposta do frontend (que conhece chats e terminais).
#[derive(Default)]
struct Bridge {
    pending: Mutex<HashMap<u64, mpsc::Sender<(bool, String)>>>,
    next: AtomicU64,
}

/// Servidor HTTP local: hooks dos agentes avisam o status; o `kora-cli` conversa com os chats.
pub struct Api {
    pub port: u16,
    pub token: String,
    bridge: Arc<Bridge>,
}

#[derive(Clone, Serialize)]
struct StatusEvent {
    chat: String,
    state: String,
    session: Option<String>,
}

#[derive(Clone, Serialize)]
struct CliEvent {
    id: u64,
    kind: String,
    body: String,
    from: Option<String>,
}

#[derive(Debug, PartialEq)]
enum Route {
    Status { chat: String, state: String },
    Cli(String),
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
    let bridge = Arc::new(Bridge::default());
    let (expected, shared) = (token.clone(), bridge.clone());

    thread::spawn(move || {
        for req in server.incoming_requests() {
            let (app, token, bridge) = (app.clone(), expected.clone(), shared.clone());
            // Um thread por pedido: um `kora-cli` esperando o frontend não trava os hooks.
            thread::spawn(move || handle(&app, &token, &bridge, req));
        }
    });

    Ok(Api { port, token, bridge })
}

/// Aceita só `/status/<chat>/<estado>` e `/cli/<comando>`, sempre com `?t=<token>`.
fn route(url: &str, token: &str) -> Option<Route> {
    let (path, query) = url.split_once('?')?;
    if query != format!("t={token}") {
        return None;
    }
    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match parts.as_slice() {
        ["status", chat, state] if is_valid_id(chat) && STATES.contains(state) => {
            Some(Route::Status { chat: chat.to_string(), state: state.to_string() })
        }
        ["cli", kind] if CLI_KINDS.contains(kind) => Some(Route::Cli(kind.to_string())),
        _ => None,
    }
}

/// O hook do Claude manda o JSON do evento no corpo; dele só interessa o `session_id`.
fn session_id(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    value.get("session_id")?.as_str().filter(|s| is_valid_id(s)).map(String::from)
}

fn handle(app: &AppHandle, token: &str, bridge: &Bridge, mut req: Request) {
    let Some(route) = route(req.url(), token) else {
        let _ = req.respond(Response::empty(403u16));
        return;
    };
    // Corpo truncado ou com UTF-8 quebrado não pode derrubar o status: lê o que der.
    let mut raw = Vec::new();
    let _ = req.as_reader().take(MAX_BODY).read_to_end(&mut raw);
    let body = String::from_utf8_lossy(&raw).into_owned();
    let from = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("X-Kora-From"))
        .map(|h| h.value.as_str().to_string())
        .filter(|v| is_valid_id(v));

    match route {
        Route::Status { chat, state } => {
            let session = session_id(&body);
            let _ = app.emit("chat-status", StatusEvent { chat, state, session });
            let _ = req.respond(Response::empty(204u16));
        }
        Route::Cli(kind) => {
            let (code, text) = ask_frontend(app, bridge, kind, body, from);
            let _ = req.respond(Response::from_string(text).with_status_code(code));
        }
    }
}

fn ask_frontend(app: &AppHandle, bridge: &Bridge, kind: String, body: String, from: Option<String>) -> (u16, String) {
    let id = bridge.next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    if let Ok(mut pending) = bridge.pending.lock() {
        pending.insert(id, tx);
    }
    let reply = match app.emit("kora-cli", CliEvent { id, kind, body, from }) {
        Ok(()) => rx.recv_timeout(CLI_TIMEOUT).ok(),
        Err(_) => None,
    };
    if let Ok(mut pending) = bridge.pending.lock() {
        pending.remove(&id);
    }
    match reply {
        Some((true, text)) => (200, text),
        Some((false, text)) => (400, text),
        None => (504, "o Kora não respondeu a tempo".into()),
    }
}

/// Resposta do frontend a um pedido do `kora-cli`.
#[tauri::command]
pub fn cli_reply(api: State<Api>, id: u64, ok: bool, text: String) {
    let sender = api.bridge.pending.lock().ok().and_then(|mut pending| pending.remove(&id));
    if let Some(tx) = sender {
        let _ = tx.send((ok, text));
    }
}

#[cfg(test)]
mod tests {
    use super::{route, session_id, Route};

    #[test]
    fn route_accepts_only_valid_requests() {
        let status = Route::Status { chat: "ab-12".into(), state: "running".into() };
        assert_eq!(route("/status/ab-12/running?t=tok", "tok"), Some(status));
        assert_eq!(route("/cli/send?t=tok", "tok"), Some(Route::Cli("send".into())));
        assert_eq!(route("/status/ab-12/running?t=bad", "tok"), None);
        assert_eq!(route("/status/ab-12/running", "tok"), None);
        assert_eq!(route("/status/ab-12/hacked?t=tok", "tok"), None);
        assert_eq!(route("/status/a%2F/idle?t=tok", "tok"), None);
        assert_eq!(route("/cli/rm?t=tok", "tok"), None);
        assert_eq!(route("/status/ab/idle/x?t=tok", "tok"), None);
    }

    #[test]
    fn session_id_reads_only_safe_ids() {
        assert_eq!(session_id(r#"{"session_id":"abc-123","x":1}"#), Some("abc-123".into()));
        assert_eq!(session_id(r#"{"session_id":"../../x"}"#), None);
        assert_eq!(session_id("não é json"), None);
    }
}

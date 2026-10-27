//! Limites de uso das assinaturas (janela de 5 h e semanal), em % já usado.
//! Claude Code: só a statusline recebe `rate_limits`; o Kora põe o `kora-cli statusline` no lugar
//! e ele repassa o JSON para cá e roda a statusline do usuário. Codex: `rate_limits` no `token_count` dos logs.

use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tauri::{AppHandle, Manager};

const WEEK_MINUTES: u64 = 7 * 24 * 60;
/// O log do Codex cresce a sessão inteira: o limite mais recente está no fim.
const CODEX_TAIL: usize = 512 * 1024;

fn window(label: &str, percent: Option<f64>, resets_at: Option<u64>) -> Option<Value> {
    let percent = percent?.clamp(0.0, 100.0);
    Some(json!({ "label": label, "percent": percent, "resetsAt": resets_at }))
}

/// `rate_limits` do JSON da statusline do Claude → `[{label, percent, resetsAt}]`.
pub fn claude(body: &str) -> Option<Value> {
    let status: Value = serde_json::from_str(body).ok()?;
    let limits = status.get("rate_limits")?;
    let read = |key: &str, label: &str| {
        let w = limits.get(key)?;
        window(label, w.get("used_percentage").and_then(Value::as_f64), w.get("resets_at").and_then(Value::as_u64))
    };
    let windows: Vec<Value> = [read("five_hour", "5h"), read("seven_day", "semana")].into_iter().flatten().collect();
    (!windows.is_empty()).then(|| Value::Array(windows))
}

fn codex_label(minutes: Option<u64>) -> String {
    match minutes {
        Some(m) if m >= WEEK_MINUTES => "semana".into(),
        Some(m) if m > 0 => format!("{}h", m.div_ceil(60)),
        _ => "janela".into(),
    }
}

/// `rate_limits` do último `token_count` com limites num trecho de log do Codex.
fn codex_from_log(text: &str) -> Option<Value> {
    text.lines().rev().find_map(|line| {
        let v: Value = serde_json::from_str(line).ok()?;
        let limits = v.pointer("/payload/rate_limits")?;
        let windows: Vec<Value> = ["primary", "secondary"]
            .iter()
            .filter_map(|key| {
                let w = limits.get(*key)?;
                let label = codex_label(w.get("window_minutes").and_then(Value::as_u64));
                window(&label, w.get("used_percent").and_then(Value::as_f64), w.get("resets_at").and_then(Value::as_u64))
            })
            .collect();
        (!windows.is_empty()).then(|| Value::Array(windows))
    })
}

/// O `.jsonl` modificado por último sob `dir` (sessões do Codex ficam em ano/mês/dia).
fn newest_jsonl(dir: &Path, depth: usize) -> Option<(SystemTime, PathBuf)> {
    fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let meta = entry.metadata().ok()?;
            if meta.is_dir() && depth < 4 {
                newest_jsonl(&path, depth + 1)
            } else if path.extension().is_some_and(|e| e == "jsonl") {
                Some((meta.modified().ok()?, path))
            } else {
                None
            }
        })
        .max_by_key(|(modified, _)| *modified)
}

fn read_tail(path: &Path) -> Option<String> {
    let raw = fs::read(path).ok()?;
    let start = raw.len().saturating_sub(CODEX_TAIL);
    Some(String::from_utf8_lossy(&raw[start..]).into_owned())
}

/// Limites do Codex na sessão mais recente; `None` sem Codex ou sem limites registrados.
#[tauri::command]
pub async fn codex_limits(app: AppHandle) -> Result<Option<Value>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let dir = std::env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".codex"));
    tauri::async_runtime::spawn_blocking(move || {
        newest_jsonl(&dir.join("sessions"), 0).and_then(|(_, path)| read_tail(&path)).and_then(|text| codex_from_log(&text))
    })
    .await
    .map_err(|e| e.to_string())
}

/// O `statusLine.command` do settings do usuário, que o `kora-cli statusline` roda depois de avisar o Kora.
pub fn user_statusline(home: &Path) -> String {
    let dir = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or_else(|| home.join(".claude"));
    fs::read_to_string(dir.join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|s| s.pointer("/statusLine/command")?.as_str().map(String::from))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_reads_both_windows() {
        let body = r#"{"rate_limits":{"five_hour":{"used_percentage":42.5,"resets_at":1790000000},"seven_day":{"used_percentage":130}}}"#;
        assert_eq!(
            claude(body),
            Some(json!([
                { "label": "5h", "percent": 42.5, "resetsAt": 1790000000u64 },
                { "label": "semana", "percent": 100.0, "resetsAt": null }
            ]))
        );
        assert_eq!(claude(r#"{"model":{}}"#), None);
        assert_eq!(claude("lixo"), None);
    }

    #[test]
    fn codex_reads_last_rate_limits() {
        let log = concat!(
            r#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":1,"window_minutes":300}}}}"#,
            "\n",
            r#"{"type":"event_msg","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":12.5,"window_minutes":300,"resets_at":5},"secondary":{"used_percent":40,"window_minutes":10080}}}}"#,
            "\n",
            r#"{"type":"turn_context","payload":{"model":"gpt-x"}}"#,
            "\n"
        );
        assert_eq!(
            codex_from_log(log),
            Some(json!([
                { "label": "5h", "percent": 12.5, "resetsAt": 5 },
                { "label": "semana", "percent": 40.0, "resetsAt": null }
            ]))
        );
        assert_eq!(codex_from_log("{}"), None);
    }
}

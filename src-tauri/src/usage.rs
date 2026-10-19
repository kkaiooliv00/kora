//! Uso de tokens lido dos logs locais dos agentes (nada sai da máquina):
//! Claude Code em `~/.claude/projects/**/*.jsonl` e Codex em `~/.codex/sessions/**/*.jsonl`.

use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};
use tauri::{AppHandle, Manager};

const MAX_DEPTH: usize = 6;
const DAY: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Default, Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tokens {
    input: u64,
    output: u64,
    cache_write: u64,
    cache_read: u64,
}

impl Tokens {
    fn add(&mut self, other: Tokens) {
        self.input += other.input;
        self.output += other.output;
        self.cache_write += other.cache_write;
        self.cache_read += other.cache_read;
    }
}

#[derive(Serialize)]
pub struct Row {
    day: String,
    source: &'static str,
    model: String,
    project: String,
    tokens: Tokens,
}

#[derive(Serialize)]
pub struct Usage {
    rows: Vec<Row>,
    files: usize,
}

#[derive(Debug, PartialEq)]
struct Entry {
    day: String,
    model: String,
    project: String,
    tokens: Tokens,
}

type Key = (String, &'static str, String, String);

fn num(v: &Value, key: &str) -> u64 {
    v.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn last_segment(path: &str) -> String {
    path.rsplit(['/', '\\']).find(|s| !s.is_empty()).unwrap_or(path).to_string()
}

/// Uma linha do log do Claude Code com `message.usage`. Devolve também a chave de deduplicação:
/// o Claude grava a mesma resposta em várias linhas (uma por bloco de conteúdo).
fn claude_entry(v: &Value) -> Option<(String, Entry)> {
    let message = v.get("message")?;
    let usage = message.get("usage")?;
    let day = v.get("timestamp")?.as_str()?.get(..10)?.to_string();
    let tokens = Tokens {
        input: num(usage, "input_tokens"),
        output: num(usage, "output_tokens"),
        cache_write: num(usage, "cache_creation_input_tokens"),
        cache_read: num(usage, "cache_read_input_tokens"),
    };
    if tokens == Tokens::default() {
        return None;
    }
    let text = |v: Option<&Value>| v.and_then(Value::as_str).unwrap_or_default().to_string();
    let key = format!("{}:{}", text(message.get("id")), text(v.get("requestId")));
    let model = text(message.get("model"));
    let project = last_segment(&text(v.get("cwd")));
    Some((key, Entry { day, model, project, tokens }))
}

/// Estado por arquivo do Codex: o modelo e a pasta vêm em linhas anteriores ao `token_count`.
#[derive(Default)]
struct CodexFile {
    model: String,
    project: String,
}

fn codex_entry(v: &Value, file: &mut CodexFile) -> Option<Entry> {
    let payload = v.get("payload")?;
    match v.get("type")?.as_str()? {
        "session_meta" => {
            file.project = last_segment(payload.get("cwd")?.as_str()?);
            None
        }
        "turn_context" => {
            file.model = payload.get("model")?.as_str()?.to_string();
            None
        }
        "event_msg" if payload.get("type")?.as_str()? == "token_count" => {
            let usage = payload.get("info")?.get("last_token_usage")?;
            let cached = num(usage, "cached_input_tokens");
            let tokens = Tokens {
                input: num(usage, "input_tokens").saturating_sub(cached),
                output: num(usage, "output_tokens"),
                cache_write: 0,
                cache_read: cached,
            };
            let day = v.get("timestamp")?.as_str()?.get(..10)?.to_string();
            Some(Entry { day, model: file.model.clone(), project: file.project.clone(), tokens })
        }
        _ => None,
    }
}

/// `.jsonl` modificados desde `since`, até `MAX_DEPTH` níveis.
fn recent_jsonl(dir: &Path, since: SystemTime, depth: usize, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() && depth < MAX_DEPTH {
            recent_jsonl(&path, since, depth + 1, out);
        } else if path.extension().is_some_and(|e| e == "jsonl") && meta.modified().is_ok_and(|m| m >= since) {
            out.push(path);
        }
    }
}

fn read_lines(path: &Path) -> impl Iterator<Item = Value> {
    File::open(path)
        .into_iter()
        .flat_map(|f| BufReader::new(f).lines().map_while(Result::ok))
        .filter_map(|line| serde_json::from_str(&line).ok())
}

fn summarize(home: &Path, days: u32) -> Usage {
    let since = SystemTime::now() - DAY * days;
    let mut totals: HashMap<Key, Tokens> = HashMap::new();
    let mut add = |source: &'static str, e: Entry| {
        totals.entry((e.day, source, e.model, e.project)).or_default().add(e.tokens);
    };

    let claude_dir = std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or_else(|| home.join(".claude"));
    let mut claude_files = Vec::new();
    recent_jsonl(&claude_dir.join("projects"), since, 0, &mut claude_files);
    let mut seen = HashSet::new();
    for path in &claude_files {
        for (key, entry) in read_lines(path).filter_map(|v| claude_entry(&v)) {
            if key == ":" || seen.insert(key) {
                add("claude", entry);
            }
        }
    }

    let codex_dir = std::env::var_os("CODEX_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".codex"));
    let mut codex_files = Vec::new();
    recent_jsonl(&codex_dir.join("sessions"), since, 0, &mut codex_files);
    for path in &codex_files {
        let mut file = CodexFile::default();
        for value in read_lines(path) {
            if let Some(entry) = codex_entry(&value, &mut file) {
                add("codex", entry);
            }
        }
    }

    let mut rows: Vec<Row> = totals
        .into_iter()
        .map(|((day, source, model, project), tokens)| Row { day, source, model, project, tokens })
        .collect();
    rows.sort_by(|a, b| b.day.cmp(&a.day).then(a.source.cmp(b.source)));
    Usage { rows, files: claude_files.len() + codex_files.len() }
}

/// Tokens dos últimos `days` dias (1 a 90), por dia, agente, modelo e projeto.
#[tauri::command]
pub async fn usage_summary(app: AppHandle, days: u32) -> Result<Usage, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let days = days.clamp(1, 90);
    tauri::async_runtime::spawn_blocking(move || summarize(&home, days))
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_entry_reads_usage_and_dedup_key() {
        let line: Value = serde_json::from_str(
            r#"{"timestamp":"2026-10-19T12:00:00Z","requestId":"r1","cwd":"C:\\dev\\kora",
                "message":{"id":"m1","model":"claude-opus-5-5","usage":{"input_tokens":10,"output_tokens":5,
                "cache_creation_input_tokens":3,"cache_read_input_tokens":100}}}"#,
        )
        .unwrap();
        let (key, entry) = claude_entry(&line).unwrap();
        assert_eq!(key, "m1:r1");
        assert_eq!(entry.day, "2026-10-19");
        assert_eq!(entry.project, "kora");
        assert_eq!(entry.tokens, Tokens { input: 10, output: 5, cache_write: 3, cache_read: 100 });
        let empty: Value = serde_json::from_str(r#"{"timestamp":"2026-10-19T00:00:00Z","message":{"usage":{}}}"#).unwrap();
        assert!(claude_entry(&empty).is_none());
    }

    #[test]
    fn codex_entry_uses_context_from_earlier_lines() {
        let mut file = CodexFile::default();
        let lines = [
            r#"{"type":"session_meta","payload":{"cwd":"/home/k/app"}}"#,
            r#"{"type":"turn_context","payload":{"model":"gpt-x"}}"#,
            r#"{"timestamp":"2026-10-18T09:00:00Z","type":"event_msg","payload":{"type":"token_count",
                "info":{"last_token_usage":{"input_tokens":50,"cached_input_tokens":20,"output_tokens":7}}}}"#,
        ];
        let entries: Vec<Entry> = lines
            .iter()
            .filter_map(|l| codex_entry(&serde_json::from_str(l).unwrap(), &mut file))
            .collect();
        assert_eq!(
            entries,
            vec![Entry {
                day: "2026-10-18".into(),
                model: "gpt-x".into(),
                project: "app".into(),
                tokens: Tokens { input: 30, output: 7, cache_write: 0, cache_read: 20 },
            }]
        );
    }
}

//! Busca de texto nas conversas do Claude Code (`~/.claude/projects/*/<sessão>.jsonl`),
//! só nas sessões dos chats do Kora. Tudo local.

use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

const MAX_HITS: usize = 200;
const MAX_PER_SESSION: usize = 20;
const SNIPPET_RADIUS: usize = 80;
const MIN_QUERY: usize = 2;

#[derive(Serialize, Debug, PartialEq)]
pub struct Hit {
    session: String,
    time: String,
    role: String,
    snippet: String,
}

/// Texto que você escreveu ou o agente respondeu (sem resultados de ferramenta nem "thinking").
fn message_text(entry: &Value) -> Option<(String, String)> {
    let message = entry.get("message")?;
    let role = message.get("role")?.as_str()?.to_string();
    let text = match message.get("content")? {
        Value::String(s) => s.clone(),
        Value::Array(blocks) => blocks
            .iter()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|b| b.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        _ => return None,
    };
    (!text.trim().is_empty()).then_some((role, text))
}

/// Trecho em volta da primeira ocorrência (sem diferenciar maiúsculas), numa linha só.
fn snippet(text: &str, query_lower: &str) -> Option<String> {
    // Minúscula letra por letra: as posições batem com o texto original.
    let lower_char = |c: char| c.to_lowercase().next().unwrap_or(c);
    let chars: Vec<char> = text.chars().collect();
    let haystack: Vec<char> = chars.iter().map(|&c| lower_char(c)).collect();
    let needle: Vec<char> = query_lower.chars().map(lower_char).collect();
    if needle.is_empty() {
        return None;
    }
    let at = haystack.windows(needle.len()).position(|w| w == needle.as_slice())?;
    let start = at.saturating_sub(SNIPPET_RADIUS);
    let end = (at + needle.len() + SNIPPET_RADIUS).min(chars.len());
    let body: String = chars[start..end].iter().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
    Some(format!("{}{body}{}", if start > 0 { "…" } else { "" }, if end < chars.len() { "…" } else { "" }))
}

fn session_files(root: &Path, sessions: &HashSet<String>) -> Vec<(String, PathBuf)> {
    let Ok(projects) = fs::read_dir(root) else { return Vec::new() };
    projects
        .flatten()
        .filter_map(|p| fs::read_dir(p.path()).ok())
        .flat_map(|files| files.flatten())
        .filter_map(|f| {
            let path = f.path();
            let stem = path.file_stem()?.to_str()?.to_string();
            (path.extension().is_some_and(|e| e == "jsonl") && sessions.contains(&stem)).then_some((stem, path))
        })
        .collect()
}

fn search(root: &Path, query: &str, sessions: &HashSet<String>) -> Vec<Hit> {
    let query_lower = query.to_lowercase();
    // A linha é JSON: `C:\dev` está gravado como `C:\\dev`. Compara com a busca escapada do mesmo jeito.
    let escaped = serde_json::to_string(&query_lower).unwrap_or_default();
    let escaped = escaped.trim_matches('"').to_string();
    let mut hits = Vec::new();
    for (session, path) in session_files(root, sessions) {
        let Ok(file) = File::open(&path) else { continue };
        let mut found = 0;
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if !line.to_lowercase().contains(&escaped) {
                continue;
            }
            let Ok(entry) = serde_json::from_str::<Value>(&line) else { continue };
            let Some((role, text)) = message_text(&entry) else { continue };
            let Some(snippet) = snippet(&text, &query_lower) else { continue };
            let time = entry.get("timestamp").and_then(Value::as_str).unwrap_or_default().to_string();
            hits.push(Hit { session: session.clone(), time, role, snippet });
            found += 1;
            if found >= MAX_PER_SESSION || hits.len() >= MAX_HITS {
                break;
            }
        }
        if hits.len() >= MAX_HITS {
            break;
        }
    }
    hits.sort_by(|a, b| b.time.cmp(&a.time));
    hits
}

#[tauri::command]
pub async fn search_history(app: AppHandle, query: String, sessions: Vec<String>) -> Result<Vec<Hit>, String> {
    let query = query.trim().to_string();
    if query.chars().count() < MIN_QUERY {
        return Ok(Vec::new());
    }
    let root = claude_projects(&app)?;
    let sessions: HashSet<String> = sessions.into_iter().collect();
    tauri::async_runtime::spawn_blocking(move || search(&root, &query, &sessions)).await.map_err(|e| e.to_string())
}

fn claude_projects(app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(std::env::var_os("CLAUDE_CONFIG_DIR").map(PathBuf::from).unwrap_or_else(|| home.join(".claude")).join("projects"))
}

/// A conversa em Markdown: só o que você escreveu e o texto que o agente respondeu.
fn to_markdown(title: &str, lines: impl Iterator<Item = String>) -> String {
    let mut out = format!("# {title}\n");
    for line in lines {
        let Ok(entry) = serde_json::from_str::<Value>(&line) else { continue };
        let Some((role, text)) = message_text(&entry) else { continue };
        let who = if role == "user" { "Você" } else { "Agente" };
        let time = entry.get("timestamp").and_then(Value::as_str).unwrap_or_default();
        out.push_str(&format!("\n## {who} · {time}\n\n{}\n", text.trim()));
    }
    out
}

#[tauri::command]
pub async fn conversation_markdown(app: AppHandle, session: String, title: String) -> Result<String, String> {
    if !crate::api::is_valid_id(&session) {
        return Err("sessão inválida".into());
    }
    let root = claude_projects(&app)?;
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let sessions = HashSet::from([session]);
        let (_, path) = session_files(&root, &sessions).into_iter().next().ok_or("a conversa não está mais nos logs do Claude")?;
        let file = File::open(&path).map_err(|e| e.to_string())?;
        Ok(to_markdown(&title, BufReader::new(file).lines().map_while(Result::ok)))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Grava o texto exportado no caminho escolhido no diálogo (só .md ou .txt).
#[tauri::command]
pub fn save_text(path: String, text: String) -> Result<(), String> {
    let ok = PathBuf::from(&path).extension().is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("txt"));
    if !ok {
        return Err("salve como .md ou .txt".into());
    }
    fs::write(&path, text).map_err(|e| format!("não foi possível salvar: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn message_text_reads_prompts_and_text_blocks_only() {
        let user = json!({ "message": { "role": "user", "content": "migrar config para TOML" } });
        assert_eq!(message_text(&user), Some(("user".into(), "migrar config para TOML".into())));
        let tool = json!({ "message": { "role": "user", "content": [{ "type": "tool_result", "content": "x" }] } });
        assert_eq!(message_text(&tool), None);
        let reply = json!({ "message": { "role": "assistant", "content": [{ "type": "thinking" }, { "type": "text", "text": "Feito." }] } });
        assert_eq!(message_text(&reply), Some(("assistant".into(), "Feito.".into())));
    }

    #[test]
    fn to_markdown_keeps_only_conversation() {
        let lines = [
            r#"{"timestamp":"t1","message":{"role":"user","content":"oi"}}"#,
            r#"{"message":{"role":"user","content":[{"type":"tool_result","content":"x"}]}}"#,
            r#"{"timestamp":"t2","message":{"role":"assistant","content":[{"type":"text","text":"olá"}]}}"#,
        ];
        let md = to_markdown("Claude 1", lines.iter().map(|l| l.to_string()));
        assert_eq!(md, "# Claude 1\n\n## Você · t1\n\noi\n\n## Agente · t2\n\nolá\n");
    }

    #[test]
    fn snippet_finds_case_insensitive_and_trims() {
        let text = format!("{} Configuração em TOML {}", "a".repeat(200), "b".repeat(200));
        let s = snippet(&text, "toml").unwrap();
        assert!(s.starts_with('…') && s.ends_with('…') && s.contains("TOML"));
        assert_eq!(snippet("nada aqui", "toml"), None);
    }
}

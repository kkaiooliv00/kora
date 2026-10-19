//! O que o painel do agente usa do JSON dos hooks do Claude Code:
//! evento, mensagem (pedido de permissão), plano (TodoWrite) e uso de contexto.

use serde_json::{json, Value};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

const MAX_MESSAGE: usize = 500;
const MAX_TODOS: usize = 50;
const MAX_TODO_TEXT: usize = 200;
const MAX_PATH: usize = 500;
const EDIT_TOOLS: [&str; 4] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];
/// O transcript cresce sem limite: o uso mais recente está no fim, então lê só a cauda.
const TRANSCRIPT_TAIL: u64 = 256 * 1024;

fn truncate(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// Só `content` e `status` de cada item do TodoWrite, com limites.
fn todos(value: &Value) -> Value {
    let items: Vec<Value> = value
        .as_array()
        .into_iter()
        .flatten()
        .take(MAX_TODOS)
        .filter_map(|t| {
            let content = t.get("content")?.as_str()?;
            let status = t.get("status").and_then(Value::as_str).unwrap_or("pending");
            Some(json!({ "content": truncate(content, MAX_TODO_TEXT), "status": truncate(status, 20) }))
        })
        .collect();
    Value::Array(items)
}

/// Tokens no contexto (entrada + cache) da última resposta registrada no transcript.
fn context_usage(path: &Path) -> Option<Value> {
    if path.extension().is_none_or(|e| e != "jsonl") {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(len.saturating_sub(TRANSCRIPT_TAIL))).ok()?;
    let mut raw = Vec::new();
    file.read_to_end(&mut raw).ok()?;
    let text = String::from_utf8_lossy(&raw);
    text.lines().rev().find_map(|line| {
        let entry: Value = serde_json::from_str(line).ok()?;
        let message = entry.get("message")?;
        let usage = message.get("usage")?;
        let n = |k: &str| usage.get(k).and_then(Value::as_u64).unwrap_or(0);
        let tokens = n("input_tokens") + n("cache_creation_input_tokens") + n("cache_read_input_tokens");
        (tokens > 0).then(|| json!({ "tokens": tokens, "model": message.get("model").and_then(Value::as_str).unwrap_or_default() }))
    })
}

/// Resumo do evento para o frontend; `None` se o corpo não for um JSON de hook.
pub fn detail(body: &str) -> Option<Value> {
    let hook: Value = serde_json::from_str(body).ok()?;
    let event = hook.get("hook_event_name")?.as_str()?;
    let mut out = json!({ "event": truncate(event, 40) });
    if let Some(message) = hook.get("message").and_then(Value::as_str) {
        out["message"] = json!(truncate(message, MAX_MESSAGE));
    }
    if let Some(tool) = hook.get("tool_name").and_then(Value::as_str) {
        out["tool"] = json!(truncate(tool, 60));
        // Arquivo que o agente editou: alimenta "arquivos alterados" e o aviso de conflito entre chats.
        if EDIT_TOOLS.contains(&tool) {
            let path = hook.pointer("/tool_input/file_path").or_else(|| hook.pointer("/tool_input/notebook_path"));
            if let Some(path) = path.and_then(Value::as_str) {
                out["file"] = json!(truncate(path, MAX_PATH));
            }
        }
        if tool == "TodoWrite" {
            if let Some(list) = hook.pointer("/tool_input/todos") {
                out["todos"] = todos(list);
            }
        }
    }
    if event == "Stop" {
        if let Some(context) = hook.get("transcript_path").and_then(Value::as_str).and_then(|p| context_usage(Path::new(p))) {
            out["context"] = context;
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detail_keeps_message_and_todos() {
        let body = r#"{"hook_event_name":"PostToolUse","tool_name":"TodoWrite",
            "tool_input":{"todos":[{"content":"Rodar testes","status":"in_progress","activeForm":"x"},{"bad":1}]}}"#;
        let d = detail(body).unwrap();
        assert_eq!(d["event"], "PostToolUse");
        assert_eq!(d["todos"], json!([{ "content": "Rodar testes", "status": "in_progress" }]));
        let note = detail(r#"{"hook_event_name":"Notification","message":"Claude needs your permission to use Bash"}"#).unwrap();
        assert_eq!(note["message"], "Claude needs your permission to use Bash");
        assert!(detail("não é json").is_none());
    }

    #[test]
    fn detail_keeps_edited_file_only_for_edit_tools() {
        let edit = detail(r#"{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"C:/p/src/a.ts"}}"#).unwrap();
        assert_eq!(edit["file"], "C:/p/src/a.ts");
        let read = detail(r#"{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"C:/p/b.ts"}}"#).unwrap();
        assert!(read.get("file").is_none());
    }

    #[test]
    fn context_usage_reads_last_response() {
        let path = std::env::temp_dir().join(format!("kora-transcript-{}.jsonl", std::process::id()));
        fs::write(
            &path,
            concat!(
                r#"{"message":{"model":"m1","usage":{"input_tokens":1}}}"#,
                "\n",
                r#"{"message":{"model":"m2","usage":{"input_tokens":10,"cache_read_input_tokens":90,"cache_creation_input_tokens":5}}}"#,
                "\n",
                r#"{"type":"user"}"#,
                "\n"
            ),
        )
        .unwrap();
        assert_eq!(context_usage(&path), Some(json!({ "tokens": 105, "model": "m2" })));
        fs::remove_file(&path).unwrap();
        assert_eq!(context_usage(Path::new("C:/x.txt")), None);
    }
}

use crate::api::{is_valid_id, Api};
use serde_json::{json, Value};
use std::{fs, io::ErrorKind, path::PathBuf, process::Command};
use tauri::{AppHandle, Manager, State};

const JSON_FILES: [&str; 2] = ["config", "state"];

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn json_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !JSON_FILES.contains(&name) {
        return Err(format!("arquivo desconhecido: {name}"));
    }
    Ok(config_dir(app)?.join(format!("{name}.json")))
}

#[tauri::command]
pub fn load_json(app: AppHandle, name: String) -> Result<Option<Value>, String> {
    let path = json_path(&app, &name)?;
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| format!("{} está corrompido: {e}", path.display())),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("falha ao ler {}: {e}", path.display())),
    }
}

/// Grava em arquivo temporário e renomeia, para não deixar JSON pela metade.
#[tauri::command]
pub fn save_json(app: AppHandle, name: String, value: Value) -> Result<(), String> {
    let path = json_path(&app, &name)?;
    let tmp = path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(&tmp, text).map_err(|e| format!("falha ao gravar {}: {e}", tmp.display()))?;
    fs::rename(&tmp, &path).map_err(|e| format!("falha ao gravar {}: {e}", path.display()))
}

/// Gera um settings do Claude Code com hooks que avisam o status deste chat.
#[tauri::command]
pub fn claude_settings(app: AppHandle, api: State<Api>, chat: String) -> Result<String, String> {
    if !is_valid_id(&chat) {
        return Err("id de chat inválido".into());
    }
    let curl = if cfg!(windows) { "curl.exe" } else { "curl" };
    let hook = |state: &str| {
        let url = format!("http://127.0.0.1:{}/status/{chat}/{state}?t={}", api.port, api.token);
        json!([{ "matcher": "", "hooks": [{ "type": "command", "command": format!("{curl} -s -m 2 -X POST \"{url}\"") }] }])
    };
    let settings = json!({
        "hooks": {
            "UserPromptSubmit": hook("running"),
            "PreToolUse": hook("running"),
            "PostToolUse": hook("running"),
            "Notification": hook("waiting"),
            "Stop": hook("idle"),
        }
    });

    let dir = config_dir(&app)?.join("hooks");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{chat}.json"));
    fs::write(&path, settings.to_string()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn chrome_candidates() -> Vec<PathBuf> {
    if cfg!(windows) {
        ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"]
            .iter()
            .filter_map(std::env::var_os)
            .map(|base| PathBuf::from(base).join(r"Google\Chrome\Application\chrome.exe"))
            .filter(|path| path.exists())
            .collect()
    } else {
        ["google-chrome", "google-chrome-stable", "chromium"].iter().map(PathBuf::from).collect()
    }
}

fn open_default(url: &str) -> std::io::Result<()> {
    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    cmd.spawn().map(|_| ())
}

/// Abre no Chrome (ou no navegador configurado); cai no navegador padrão se não achar.
#[tauri::command]
pub fn open_url(url: String, browser: Option<String>) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("só links http/https podem ser abertos".into());
    }
    let configured = browser.filter(|b| !b.trim().is_empty()).map(PathBuf::from);
    let opened = configured
        .into_iter()
        .chain(chrome_candidates())
        .any(|bin| Command::new(bin).arg(&url).spawn().is_ok());
    if opened {
        return Ok(());
    }
    open_default(&url).map_err(|e| format!("não foi possível abrir o link: {e}"))
}

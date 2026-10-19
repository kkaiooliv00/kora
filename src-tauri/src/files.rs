use crate::api::{is_valid_id, Api};
use serde_json::{json, Value};
use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager, State,
};

const JSON_FILES: [&str; 2] = ["config", "state"];
const PNG_MAGIC: &[u8] = b"\x89PNG\r\n\x1a\n";
const JPEG_MAGIC: &[u8] = &[0xFF, 0xD8, 0xFF];
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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
        json!([{ "matcher": "", "hooks": [{ "type": "command", "command": format!("{curl} -s -m 2 -X POST --data-binary @- \"{url}\"") }] }])
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

/// Grava a imagem colada (bytes crus do IPC) num arquivo temporário e devolve o caminho,
/// que é colado no terminal para o agente ler.
// ponytail: os prints acumulam no temp do sistema; limpar na inicialização se crescer.
#[tauri::command]
pub fn save_image(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("esperava os bytes da imagem".into());
    };
    let ext = if bytes.starts_with(PNG_MAGIC) {
        "png"
    } else if bytes.starts_with(JPEG_MAGIC) {
        "jpg"
    } else {
        return Err("formato de imagem não suportado (use PNG ou JPEG)".into());
    };
    let dir = std::env::temp_dir().join("kora-images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or_default();
    let path = dir.join(format!("print-{stamp}.{ext}"));
    fs::write(&path, bytes).map_err(|e| format!("falha ao salvar a imagem: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Aspas em todo argumento da linha do `cmd /s /c`: dentro delas `& | < > ^` são literais,
/// então um nome de pasta como `foo&calc` não vira um segundo comando.
/// `"` e `%` são recusados (fechariam as aspas / expandiriam variáveis).
#[cfg_attr(not(windows), allow(dead_code))]
fn cmd_quote(arg: &str) -> Result<String, String> {
    if arg.contains(['"', '%']) {
        return Err(format!("caminho com caractere não suportado pelo cmd (\" ou %): {arg}"));
    }
    Ok(format!("\"{arg}\""))
}

/// Monta o processo do editor sem janela de console.
fn editor_command(program: &str, args: &[String]) -> Result<Command, String> {
    let (exe, prefix) = crate::pty::resolve_program(program)?;
    let mut cmd = Command::new(&exe);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
        // `.cmd` (ex.: code.cmd em "Microsoft VS Code\bin"): com /s o cmd só tira as aspas
        // externas, então caminhos com espaço sobrevivem.
        if prefix.first().is_some_and(|p| p == "/d") {
            let script = prefix.last().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
            let line = std::iter::once(script.as_str())
                .chain(args.iter().map(String::as_str))
                .map(cmd_quote)
                .collect::<Result<Vec<_>, _>>()?;
            cmd.raw_arg(format!("/d /s /c \"{}\"", line.join(" ")));
            return Ok(cmd);
        }
    }
    cmd.args(prefix).args(args);
    Ok(cmd)
}

#[tauri::command]
pub fn open_in_editor(program: String, args: Vec<String>, path: String) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err(format!("pasta não encontrada: {path}"));
    }
    let all_args: Vec<String> = args.into_iter().chain([path]).collect();
    editor_command(&program, &all_args)?
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("não foi possível abrir o editor: {e}"))
}

#[cfg(test)]
mod tests {
    use super::cmd_quote;

    #[test]
    fn cmd_quote_neutralizes_cmd_metacharacters() {
        assert_eq!(cmd_quote(r"C:\Program Files\x.cmd").unwrap(), r#""C:\Program Files\x.cmd""#);
        assert_eq!(cmd_quote(r"C:\dev\foo&calc").unwrap(), r#""C:\dev\foo&calc""#);
        assert!(cmd_quote(r#"C:\a"&calc&""#).is_err());
        assert!(cmd_quote(r"C:\%PATH%").is_err());
    }
}

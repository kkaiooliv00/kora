use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::{
    collections::HashMap,
    ffi::OsString,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
    thread,
};
use crate::api::{is_valid_id, Api};
use tauri::{
    ipc::{Channel, InvokeResponseBody},
    State,
};

const READ_BUF: usize = 16 * 1024;

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct Ptys {
    map: Arc<Mutex<HashMap<u32, Pty>>>,
    next: AtomicU32,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }
}

fn default_shell() -> String {
    if cfg!(windows) {
        "powershell.exe".into()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

// Ordem de preferência do Windows; arquivos sem extensão (scripts sh do npm) ficam de fora.
const WIN_EXTS: [&str; 5] = ["exe", "com", "cmd", "bat", "ps1"];

/// Procura `program` nas pastas dadas como o Windows faria, mas só com extensões executáveis.
fn find_executable(program: &str, dirs: impl Iterator<Item = PathBuf>) -> Option<PathBuf> {
    let path = Path::new(program);
    let has_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| WIN_EXTS.contains(&e.to_ascii_lowercase().as_str()));
    if path.is_absolute() {
        return path.is_file().then(|| path.to_path_buf());
    }
    dirs.into_iter().find_map(|dir| {
        if has_ext {
            return Some(dir.join(program)).filter(|p| p.is_file());
        }
        WIN_EXTS
            .iter()
            .map(|ext| dir.join(format!("{program}.{ext}")))
            .find(|p| p.is_file())
    })
}

/// Executável + argumentos iniciais para rodar `program`.
/// No Windows: `.cmd`/`.bat` passam pelo `cmd /d /c` e `.ps1` pelo PowerShell.
pub fn resolve_program(program: &str) -> Result<(OsString, Vec<OsString>), String> {
    if !cfg!(windows) {
        return Ok((program.into(), Vec::new()));
    }
    let path_var = std::env::var_os("PATH").unwrap_or_default();
    let exe = find_executable(program, std::env::split_paths(&path_var))
        .ok_or_else(|| format!("'{program}' não foi encontrado no PATH"))?;
    let ext = exe.extension().and_then(|e| e.to_str()).unwrap_or_default().to_ascii_lowercase();
    let prefix = |args: &[&str]| args.iter().map(OsString::from).chain([exe.clone().into_os_string()]).collect();
    Ok(match ext.as_str() {
        "cmd" | "bat" => ("cmd.exe".into(), prefix(&["/d", "/c"])),
        "ps1" => ("powershell.exe".into(), prefix(&["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])),
        _ => (exe.clone().into_os_string(), Vec::new()),
    })
}

/// Abre o agente direto, sem shell no meio (o PowerShell custava ~0,5 s por chat).
// ponytail: cmd /c quebra se o caminho do .cmd tiver espaço E houver args com aspas;
// resolver com o parser de linha do cmd se aparecer.
fn agent_command(program: &str, args: &[String]) -> Result<CommandBuilder, String> {
    let (exe, prefix) = resolve_program(program)?;
    let mut cmd = CommandBuilder::new(exe);
    cmd.args(prefix);
    cmd.args(args);
    Ok(cmd)
}

/// Variáveis que o `kora-cli` usa, e a pasta do Kora (onde ele está instalado) no PATH.
fn kora_env(builder: &mut CommandBuilder, api: &Api, chat: Option<&str>) {
    builder.env("KORA_PORT", api.port.to_string());
    builder.env("KORA_TOKEN", &api.token);
    if let Some(chat) = chat.filter(|c| is_valid_id(c)) {
        builder.env("KORA_CHAT_ID", chat);
    }
    let Some(app_dir) = std::env::current_exe().ok().and_then(|exe| exe.parent().map(Path::to_path_buf)) else {
        return;
    };
    let path = std::env::var_os("PATH").unwrap_or_default();
    if let Ok(joined) = std::env::join_paths(std::iter::once(app_dir).chain(std::env::split_paths(&path))) {
        builder.env("PATH", joined);
    }
}

#[tauri::command]
pub fn pty_spawn(
    state: State<Ptys>,
    api: State<Api>,
    chat: Option<String>,
    program: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
    on_exit: Channel<u32>,
) -> Result<u32, String> {
    let mut builder = match program.filter(|p| !p.trim().is_empty()) {
        Some(program) => agent_command(&program, &args.unwrap_or_default())?,
        None => CommandBuilder::new(default_shell()),
    };
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;

    if let Some(dir) = cwd {
        builder.cwd(dir);
    }
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    kora_env(&mut builder, &api, chat.as_deref());

    let mut child = pair.slave.spawn_command(builder).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let id = state.next.fetch_add(1, Ordering::Relaxed);

    state.map.lock().unwrap().insert(
        id,
        Pty { master: pair.master, writer, killer: child.clone_killer() },
    );

    thread::spawn(move || {
        let mut buf = vec![0u8; READ_BUF];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if on_data.send(InvokeResponseBody::Raw(buf[..n].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Remover do mapa derruba o master: no Windows o ConPTY só fecha o reader assim.
    let map = state.map.clone();
    thread::spawn(move || {
        let code = child.wait().map(|s| s.exit_code()).unwrap_or(u32::MAX);
        map.lock().unwrap().remove(&id);
        let _ = on_exit.send(code);
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<Ptys>, id: u32, data: String) -> Result<(), String> {
    let mut map = state.map.lock().unwrap();
    let pty = map.get_mut(&id).ok_or("pty não encontrado")?;
    pty.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(state: State<Ptys>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.map.lock().unwrap();
    let pty = map.get(&id).ok_or("pty não encontrado")?;
    pty.master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<Ptys>, id: u32) -> Result<(), String> {
    match state.map.lock().unwrap().get_mut(&id) {
        Some(pty) => pty.killer.kill().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::find_executable;
    use std::fs;

    #[test]
    fn find_executable_skips_extensionless_scripts() {
        let root = std::env::temp_dir().join(format!("kora-find-{}", std::process::id()));
        let (npm, bin) = (root.join("npm"), root.join("bin"));
        fs::create_dir_all(&npm).unwrap();
        fs::create_dir_all(&bin).unwrap();
        fs::write(npm.join("gemini"), "#!/bin/sh").unwrap();
        fs::write(npm.join("gemini.cmd"), "").unwrap();
        fs::write(npm.join("codex.cmd"), "").unwrap();
        fs::write(bin.join("codex.exe"), "").unwrap();

        let dirs = || vec![npm.clone(), bin.clone()].into_iter();
        assert_eq!(find_executable("gemini", dirs()), Some(npm.join("gemini.cmd")));
        assert_eq!(find_executable("codex", dirs()), Some(npm.join("codex.cmd")));
        assert_eq!(find_executable("codex.exe", dirs()), Some(bin.join("codex.exe")));
        assert_eq!(find_executable("nada", dirs()), None);

        fs::remove_dir_all(&root).unwrap();
    }
}

//! Preparação de worktree (copiar arquivos + script do projeto) e porta livre para o "rodar".

use std::{
    fs,
    io::Read,
    net::TcpListener,
    path::{Component, Path},
    sync::mpsc,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const SETUP_TIMEOUT: Duration = Duration::from_secs(600);
const POLL: Duration = Duration::from_millis(200);
/// Só o fim da saída vai para o aviso de erro.
const OUTPUT_TAIL: usize = 1200;
/// Quanto da saída fica na memória enquanto o script roda (o resto é descartado do começo).
const KEEP_BYTES: usize = 64 * 1024;
const DRAIN_GRACE: Duration = Duration::from_secs(2);

/// Caminho relativo simples, sem `..` nem raiz: nada sai da pasta do projeto.
pub(crate) fn is_safe_relative(path: &str) -> bool {
    let p = Path::new(path);
    !path.trim().is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)))
}

fn tail(text: &str) -> String {
    let chars: Vec<char> = text.trim().chars().collect();
    chars[chars.len().saturating_sub(OUTPUT_TAIL)..].iter().collect()
}

/// Linha de comando do usuário no shell do sistema, sem janela de console.
fn shell(command: &str) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.creation_flags(CREATE_NO_WINDOW);
        // /s: o cmd tira só as aspas externas e roda o resto como digitado.
        cmd.raw_arg(format!("/d /s /c \"{command}\""));
        cmd
    }
    #[cfg(not(windows))]
    {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(command);
        cmd
    }
}

fn run_setup(dir: &str, root: &str, command: &str) -> Result<String, String> {
    let mut child = shell(command)
        .current_dir(dir)
        .env("KORA_ROOT", root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("não foi possível rodar o script: {e}"))?;
    // Lê a saída em paralelo: um script verboso (npm install) não trava esperando o pipe esvaziar.
    let drain = |pipe: Option<Box<dyn Read + Send>>| {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut kept: Vec<u8> = Vec::new();
            if let Some(mut pipe) = pipe {
                let mut buf = [0u8; 8192];
                while let Ok(n) = pipe.read(&mut buf) {
                    if n == 0 {
                        break;
                    }
                    kept.extend_from_slice(&buf[..n]);
                    if kept.len() > KEEP_BYTES {
                        kept.drain(..kept.len() - KEEP_BYTES);
                    }
                }
            }
            let _ = tx.send(String::from_utf8_lossy(&kept).into_owned());
        });
        rx
    };
    let out = drain(child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>));
    let err = drain(child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if started.elapsed() > SETUP_TIMEOUT {
            // O cmd/sh é só o pai: no Windows derruba a árvore (npm e filhos) para os pipes fecharem.
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("taskkill")
                    .args(["/T", "/F", "/PID", &child.id().to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .status();
            }
            let _ = child.kill();
            return Err("o script passou de 10 minutos e foi interrompido".into());
        }
        std::thread::sleep(POLL);
    };
    // Um processo deixado em segundo plano (npm run dev &) segura o pipe aberto: não espera por ele.
    let out = out.recv_timeout(DRAIN_GRACE).unwrap_or_default();
    let err = err.recv_timeout(DRAIN_GRACE).unwrap_or_default();
    if status.success() { Ok(tail(&out)) } else { Err(tail(&format!("{err}\n{out}"))) }
}

/// Copia `files` (relativos à raiz do projeto) para o worktree e roda `command` nele.
/// `KORA_ROOT` aponta para a raiz, para o script copiar o que mais precisar.
#[tauri::command]
pub async fn worktree_setup(dir: String, root: String, files: Vec<String>, command: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut missing = Vec::new();
        for file in files.iter().map(|f| f.trim()).filter(|f| !f.is_empty()) {
            if !is_safe_relative(file) {
                return Err(format!("caminho não permitido: {file}"));
            }
            let from = Path::new(&root).join(file);
            let to = Path::new(&dir).join(file);
            if !from.is_file() {
                missing.push(file.to_string());
                continue;
            }
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&from, &to).map_err(|e| format!("falha ao copiar {file}: {e}"))?;
        }
        let output = if command.trim().is_empty() { String::new() } else { run_setup(&dir, &root, command.trim())? };
        let note = if missing.is_empty() { String::new() } else { format!("não encontrados na raiz: {}\n", missing.join(", ")) };
        Ok(format!("{note}{output}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Uma porta TCP livre agora (o sistema escolhe); vai no `{port}` do comando de rodar.
#[tauri::command]
pub fn free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map(|a| a.port()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::is_safe_relative;

    #[test]
    fn only_plain_relative_paths_are_copied() {
        assert!(is_safe_relative(".env"));
        assert!(is_safe_relative("config/.env.local"));
        assert!(!is_safe_relative("../segredo"));
        assert!(!is_safe_relative("/etc/passwd"));
        // No Linux `C:\...` é só um nome de arquivo (relativo e inofensivo).
        #[cfg(windows)]
        assert!(!is_safe_relative(r"C:\Windows\x"));
        assert!(!is_safe_relative(""));
    }
}

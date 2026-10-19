use serde::Serialize;
use std::{fs, path::Path, process::Command};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(dir).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| format!("git não encontrado: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Nome seguro para pasta e branch: minúsculas, dígitos e hífen.
fn slug(name: &str) -> String {
    let raw: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    raw.split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-")
}

#[derive(Serialize)]
pub struct Worktree {
    path: String,
    branch: String,
}

/// Esconde `.kora/` do `git status` do repositório principal.
fn exclude_kora_dir(root: &str) -> Result<(), String> {
    let git_dir = git(root, &["rev-parse", "--git-common-dir"])?;
    let exclude = Path::new(root).join(git_dir.trim()).join("info").join("exclude");
    let current = fs::read_to_string(&exclude).unwrap_or_default();
    if current.lines().any(|l| l.trim() == ".kora/") {
        return Ok(());
    }
    if let Some(dir) = exclude.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let sep = if current.is_empty() || current.ends_with('\n') { "" } else { "\n" };
    fs::write(&exclude, format!("{current}{sep}.kora/\n")).map_err(|e| e.to_string())
}

/// Cria `.kora/worktrees/<nome>` numa branch nova `kora/<nome>` a partir do HEAD atual.
#[tauri::command]
pub fn git_worktree_add(project: String, name: String) -> Result<Worktree, String> {
    let name = slug(&name);
    if name.is_empty() {
        return Err("nome de worktree inválido".into());
    }
    let root = git(&project, &["rev-parse", "--show-toplevel"]).map_err(|e| format!("a pasta não é um repositório git: {e}"))?;
    let root = root.trim();
    exclude_kora_dir(root)?;
    let path = Path::new(root).join(".kora").join("worktrees").join(&name);
    let path = path.to_string_lossy().into_owned();
    let branch = format!("kora/{name}");
    git(root, &["worktree", "add", "-b", &branch, &path])?;
    Ok(Worktree { path, branch })
}

/// Remove o worktree; recusa se houver mudanças não commitadas (a branch fica).
#[tauri::command]
pub fn git_worktree_remove(path: String) -> Result<(), String> {
    git(&path, &["worktree", "remove", &path]).map(|_| ())
}

/// `git init` na pasta (botão do estado de erro do diff).
#[tauri::command]
pub async fn git_init(dir: String) -> Result<(), String> {
    if !Path::new(&dir).is_dir() {
        return Err(format!("pasta não encontrada: {dir}"));
    }
    git(&dir, &["init"]).map(|_| ())
}

/// Branch atual da pasta, ou `None` se não for repositório git. (async: fora do thread da janela)
#[tauri::command]
pub async fn git_branch(dir: String) -> Option<String> {
    git(&dir, &["rev-parse", "--abbrev-ref", "HEAD"]).ok().map(|b| b.trim().to_string()).filter(|b| !b.is_empty())
}

#[derive(Serialize)]
pub struct Changes {
    status: String,
    diff: String,
}

/// `git status --short` + diff (sem cor) contra o HEAD; o frontend desenha os blocos.
#[tauri::command]
pub async fn git_diff(dir: String) -> Result<Changes, String> {
    let status = git(&dir, &["status", "--short", "--branch"])?;
    // Repositório sem commit ainda não tem HEAD.
    let diff = git(&dir, &["-c", "core.quotepath=off", "diff", "--no-color", "HEAD"])
        .or_else(|_| git(&dir, &["-c", "core.quotepath=off", "diff", "--no-color"]))?;
    Ok(Changes { status, diff })
}

#[cfg(test)]
mod tests {
    use super::slug;

    #[test]
    fn slug_keeps_only_safe_characters() {
        assert_eq!(slug("Claude 2 (ação)-a1b2c3"), "claude-2-a-o-a1b2c3");
        assert_eq!(slug("../../etc"), "etc");
        assert_eq!(slug("  "), "");
    }
}

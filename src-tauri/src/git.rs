use serde::Serialize;
use std::{fs, path::Path, process::Command};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const MAX_DIFF: usize = 5 * 1024 * 1024;

pub(crate) fn git(dir: &str, args: &[&str]) -> Result<String, String> {
    git_env(dir, args, &[])
}

/// `git` com variáveis de ambiente extras (ex.: `GIT_INDEX_FILE` do ponto de restauração).
pub(crate) fn git_env(dir: &str, args: &[&str], envs: &[(&str, &str)]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    // Sem prompt de senha: um push sem credencial falha na hora em vez de travar o worker.
    cmd.arg("-C").arg(dir).args(args).env("GIT_TERMINAL_PROMPT", "0").envs(envs.iter().copied());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| format!("git não encontrado: {e}"))?;
    if !out.status.success() {
        // stderr + stdout: "nothing to commit" e as linhas de CONFLICT saem no stdout.
        let text = format!("{}\n{}", String::from_utf8_lossy(&out.stderr).trim(), String::from_utf8_lossy(&out.stdout).trim());
        return Err(text.trim().to_string());
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
pub async fn git_worktree_add(project: String, name: String) -> Result<Worktree, String> {
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

/// Remove o worktree a partir do repositório principal (o git não apaga a pasta em que está rodando);
/// recusa se houver mudanças não commitadas. Pasta já apagada à mão: só limpa o registro. A branch fica.
#[tauri::command]
pub async fn git_worktree_remove(project: String, path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return git(&project, &["worktree", "prune"]).map(|_| ());
    }
    git(&project, &["worktree", "remove", &path]).map(|_| ())
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
    // symbolic-ref funciona em repositório sem commit; HEAD destacado mostra o commit curto.
    git(&dir, &["symbolic-ref", "--short", "-q", "HEAD"])
        .or_else(|_| git(&dir, &["rev-parse", "--short", "HEAD"]))
        .ok()
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
}

#[derive(Serialize)]
pub struct Changes {
    status: String,
    diff: String,
}

/// `git status --short` + diff (sem cor) contra o HEAD; o frontend desenha os blocos.
#[tauri::command]
pub async fn git_diff(dir: String) -> Result<Changes, String> {
    let status = git(&dir, &["-c", "core.quotepath=off", "status", "--short", "--branch"])?;
    // Repositório sem commit ainda não tem HEAD.
    let mut diff = git(&dir, &["-c", "core.quotepath=off", "diff", "--no-color", "HEAD"])
        .or_else(|_| git(&dir, &["-c", "core.quotepath=off", "diff", "--no-color"]))?;
    // Diff gigante (arquivo gerado) travaria a janela: corta e avisa.
    if diff.len() > MAX_DIFF {
        let cut = (0..=MAX_DIFF).rev().find(|&i| diff.is_char_boundary(i)).unwrap_or(0);
        diff.truncate(cut);
        diff.push_str("\n@@ diff cortado em 5 MB; abra no editor para ver tudo @@\n");
    }
    Ok(Changes { status, diff })
}

/// "Desfazer alteração" de um arquivo: volta ao último commit; arquivo novo (fora do git) é apagado.
#[tauri::command]
pub async fn git_discard(dir: String, file: String) -> Result<(), String> {
    if !crate::project::is_safe_relative(&file) {
        return Err(format!("caminho não permitido: {file}"));
    }
    // O diff mostra caminhos a partir da raiz do repositório.
    let root = git(&dir, &["rev-parse", "--show-toplevel"])?;
    let root = root.trim();
    let tracked = git(root, &["ls-files", "--error-unmatch", "--", &file]).is_ok();
    if tracked {
        return git(root, &["restore", "--source=HEAD", "--staged", "--worktree", "--", &file]).map(|_| ());
    }
    fs::remove_file(Path::new(root).join(&file)).map_err(|e| format!("não foi possível apagar {file}: {e}"))
}

/// Branch como argumento de git: sem `-` no começo (viraria opção) e só caracteres de ref comuns.
fn valid_branch(branch: &str) -> Result<&str, String> {
    let ok = !branch.is_empty()
        && !branch.starts_with('-')
        && !branch.contains("..")
        && branch.chars().all(|c| c.is_ascii_alphanumeric() || "._/-".contains(c));
    if ok { Ok(branch) } else { Err(format!("nome de branch inválido: {branch}")) }
}

/// `git add -A` + commit com a mensagem; devolve a linha do commit.
#[tauri::command]
pub async fn git_commit(dir: String, message: String) -> Result<String, String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("escreva uma mensagem de commit".into());
    }
    git(&dir, &["add", "-A"])?;
    git(&dir, &["commit", "-m", message]).map(|out| out.lines().next().unwrap_or_default().to_string())
}

/// Mescla a branch do worktree na branch atual da pasta do projeto (`--no-ff`).
/// Em conflito, desfaz o merge: o projeto fica como estava.
#[tauri::command]
pub async fn git_merge(project: String, branch: String) -> Result<String, String> {
    let branch = valid_branch(&branch)?;
    let dirty = git(&project, &["status", "--porcelain", "--untracked-files=no"])?;
    if !dirty.trim().is_empty() {
        return Err("a pasta do projeto tem mudanças não commitadas; faça commit ou stash antes de mesclar".into());
    }
    git(&project, &["merge", "--no-ff", "--no-edit", branch]).map_err(|e| {
        // Merge pela metade (MERGE_HEAD existe): desfaz. Não depende do idioma da mensagem do git.
        if git(&project, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]).is_err() {
            return e;
        }
        let _ = git(&project, &["merge", "--abort"]);
        format!("conflito ao mesclar; nada foi alterado.\n{e}")
    })
}

/// Publica a branch e abre o PR pelo GitHub CLI (`gh`); devolve a URL do PR.
#[tauri::command]
pub async fn git_pr(dir: String, branch: String) -> Result<String, String> {
    let branch = valid_branch(&branch)?;
    git(&dir, &["push", "-u", "origin", branch])?;
    let mut cmd = Command::new("gh");
    cmd.current_dir(&dir).args(["pr", "create", "--fill", "--head", branch]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|_| "GitHub CLI (gh) não encontrado; instale e rode gh auth login".to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    let text = format!("{stdout}{}", String::from_utf8_lossy(&out.stderr));
    // Sucesso: a URL está no stdout. Falha: só vale a URL do PR que já existe ("already exists");
    // qualquer outra URL é de mensagem de erro.
    let source = if out.status.success() {
        stdout.as_str()
    } else if text.contains("already exists") {
        text.as_str()
    } else {
        ""
    };
    source
        .split_whitespace()
        .find(|w| w.starts_with("https://github.com/") || (out.status.success() && w.starts_with("https://")))
        .map(str::to_string)
        .ok_or_else(|| text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::{slug, valid_branch};

    #[test]
    fn valid_branch_rejects_options_and_odd_refs() {
        assert!(valid_branch("kora/claude-2-a1b2c3").is_ok());
        assert!(valid_branch("feat/tray_icon.v2").is_ok());
        assert!(valid_branch("--upload-pack=x").is_err());
        assert!(valid_branch("a..b").is_err());
        assert!(valid_branch("a b").is_err());
        assert!(valid_branch("").is_err());
    }

    #[test]
    fn slug_keeps_only_safe_characters() {
        assert_eq!(slug("Claude 2 (ação)-a1b2c3"), "claude-2-a-o-a1b2c3");
        assert_eq!(slug("../../etc"), "etc");
        assert_eq!(slug("  "), "");
    }
}

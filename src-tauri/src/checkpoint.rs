//! Pontos de restauração: antes de cada prompt, um commit "solto" com o estado da pasta
//! (rastreados + novos, respeitando .gitignore) em `refs/kora/checkpoints/<chat>/<ms>`.
//! Não mexe no índice, no HEAD nem na branch do usuário.

use crate::api::is_valid_id;
use crate::git::{git, git_env};
use serde::Serialize;
use std::{
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

const PREFIX: &str = "refs/kora/checkpoints";
const MAX_CHECKPOINTS: usize = 30;
const LABEL_MAX: usize = 120;
/// Autor fixo: `commit-tree` falha sem user.name/email configurados.
const AUTHOR: [(&str, &str); 4] = [
    ("GIT_AUTHOR_NAME", "kora"),
    ("GIT_AUTHOR_EMAIL", "kora@localhost"),
    ("GIT_COMMITTER_NAME", "kora"),
    ("GIT_COMMITTER_EMAIL", "kora@localhost"),
];

#[derive(Serialize)]
pub struct Checkpoint {
    #[serde(rename = "ref")]
    reference: String,
    time: u64,
    label: String,
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or_default()
}

/// Ref válida deste chat: `refs/kora/checkpoints/<chat>/<ms>`; devolve o instante.
fn checkpoint_time(reference: &str, chat: &str) -> Option<u64> {
    let stamp = reference.strip_prefix(&format!("{PREFIX}/{chat}/"))?;
    stamp.chars().all(|c| c.is_ascii_digit()).then(|| stamp.parse().ok()).flatten()
}

/// Raiz do repositório: o ponto sempre cobre o repositório inteiro, mesmo que o chat (ou o hook) esteja numa subpasta.
fn toplevel(dir: &str) -> Result<String, String> {
    git(dir, &["rev-parse", "--show-toplevel"]).map(|t| t.trim().to_string())
}

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// Commit com o estado atual do repositório. Usa uma cópia do índice (mantém o cache de stat: rápido em repositório grande).
fn snapshot(dir: &str, label: &str) -> Result<String, String> {
    let dir = toplevel(dir)?;
    let dir = dir.as_str();
    let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let temp = std::env::temp_dir().join(format!("kora-index-{}-{}-{seq}", std::process::id(), now_ms()));
    let temp_str = temp.to_string_lossy().into_owned();
    let head = git(dir, &["rev-parse", "--verify", "-q", "HEAD"]).ok().map(|h| h.trim().to_string()).filter(|h| !h.is_empty());
    let result = (|| {
        let real_index = git(dir, &["rev-parse", "--path-format=absolute", "--git-path", "index"])?;
        let env = [("GIT_INDEX_FILE", temp_str.as_str())];
        if fs::copy(real_index.trim(), &temp).is_err() {
            if let Some(head) = &head {
                git_env(dir, &["read-tree", head], &env)?;
            }
        }
        git_env(dir, &["add", "-A"], &env)?;
        let tree = git_env(dir, &["write-tree"], &env)?;
        let mut args = vec!["commit-tree", tree.trim(), "-m", label];
        if let Some(head) = &head {
            args.extend(["-p", head.as_str()]);
        }
        git_env(dir, &args, &AUTHOR).map(|c| c.trim().to_string())
    })();
    let _ = fs::remove_file(&temp);
    result
}

fn list_refs(dir: &str, chat: &str) -> Result<Vec<(String, String, String)>, String> {
    let out = git(dir, &["for-each-ref", "--sort=-refname", "--format=%(refname)%09%(tree)%09%(contents:subject)", &format!("{PREFIX}/{chat}/")])?;
    Ok(out
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            Some((parts.next()?.to_string(), parts.next()?.to_string(), parts.next().unwrap_or_default().to_string()))
        })
        .collect())
}

/// Cria o ponto (se o estado mudou desde o último) e apaga os mais antigos além do limite.
pub fn create(dir: &str, chat: &str, label: &str) -> Result<bool, String> {
    if !is_valid_id(chat) || !Path::new(dir).is_dir() {
        return Err("chat ou pasta inválidos".into());
    }
    let label: String = label.lines().next().unwrap_or_default().chars().take(LABEL_MAX).collect();
    let label = if label.trim().is_empty() { "prompt".to_string() } else { label };
    let commit = snapshot(dir, &label)?;
    let tree = git(dir, &["rev-parse", &format!("{commit}^{{tree}}")])?;
    let existing = list_refs(dir, chat)?;
    if existing.first().is_some_and(|(_, last_tree, _)| last_tree.trim() == tree.trim()) {
        return Ok(false);
    }
    git(dir, &["update-ref", &format!("{PREFIX}/{chat}/{:013}", now_ms()), &commit])?;
    for (old, _, _) in existing.iter().skip(MAX_CHECKPOINTS - 1) {
        let _ = git(dir, &["update-ref", "-d", old]);
    }
    Ok(true)
}

#[tauri::command]
pub async fn checkpoints(dir: String, chat: String) -> Result<Vec<Checkpoint>, String> {
    if !is_valid_id(&chat) {
        return Err("chat inválido".into());
    }
    Ok(list_refs(&dir, &chat)?
        .into_iter()
        .filter_map(|(reference, _, label)| Some(Checkpoint { time: checkpoint_time(&reference, &chat)?, reference, label }))
        .collect())
}

/// Volta os arquivos da pasta ao estado do ponto. Antes, salva o estado atual como outro ponto (dá para desfazer).
#[tauri::command]
pub async fn restore_checkpoint(dir: String, chat: String, reference: String) -> Result<(), String> {
    if checkpoint_time(&reference, &chat).is_none() {
        return Err("ponto de restauração inválido".into());
    }
    create(&dir, &chat, "antes de restaurar")?;
    let top = toplevel(&dir)?;
    let current = snapshot(&top, "kora: estado atual")?;
    // Arquivos que não existiam no ponto: o restore não remove o que não é rastreado.
    // --no-renames: um arquivo renomeado depois do ponto aparece como novo (e é removido).
    let added = git(&top, &["diff", "--name-only", "--no-renames", "--diff-filter=A", "-z", &reference, &current])?;
    for file in added.split('\0').filter(|f| !f.is_empty()) {
        let _ = fs::remove_file(Path::new(&top).join(file));
    }
    git(&top, &["restore", &format!("--source={reference}"), "--worktree", "--", "."]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::checkpoint_time;

    #[test]
    fn checkpoint_time_accepts_only_this_chat_refs() {
        let chat = "c1";
        assert_eq!(checkpoint_time("refs/kora/checkpoints/c1/0001700000000000", chat), Some(1_700_000_000_000));
        assert_eq!(checkpoint_time("refs/kora/checkpoints/c2/0001700000000000", chat), None);
        assert_eq!(checkpoint_time("refs/heads/main", chat), None);
        assert_eq!(checkpoint_time("refs/kora/checkpoints/c1/12;rm", chat), None);
    }
}

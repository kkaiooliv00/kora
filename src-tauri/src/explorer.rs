//! Painel de arquivos: lista as pastas do projeto, lê um arquivo para conferir e diz o que mudou (git).

use crate::{git::git, project::is_safe_relative};
use serde::Serialize;
use std::{fs, path::Path, time::UNIX_EPOCH};

const MAX_ENTRIES: usize = 5000;
const MAX_FILE: u64 = 2 * 1024 * 1024;
const BINARY_SNIFF: usize = 8000;

#[derive(Serialize)]
pub struct Entry {
    name: String,
    dir: bool,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Changed {
    path: String,
    /// M alterado, A adicionado, D apagado, U novo (fora do git).
    code: char,
    /// Última modificação (ms), para destacar o que mudou agora.
    mtime: Option<u64>,
}

fn checked(root: &str, sub: &str) -> Result<std::path::PathBuf, String> {
    if sub.is_empty() {
        return Ok(Path::new(root).to_path_buf());
    }
    if !is_safe_relative(sub) {
        return Err(format!("caminho não permitido: {sub}"));
    }
    Ok(Path::new(root).join(sub))
}

/// Itens de uma pasta (pastas primeiro, por nome), sem o `.git`.
#[tauri::command]
pub async fn list_dir(root: String, sub: String) -> Result<Vec<Entry>, String> {
    let dir = checked(&root, &sub)?;
    let mut entries: Vec<Entry> = fs::read_dir(&dir)
        .map_err(|e| format!("não foi possível ler {}: {e}", dir.display()))?
        .filter_map(Result::ok)
        .filter(|e| e.file_name() != ".git")
        .take(MAX_ENTRIES)
        .map(|e| Entry { name: e.file_name().to_string_lossy().into_owned(), dir: e.path().is_dir() })
        .collect();
    entries.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

/// Texto do arquivo para o visualizador; recusa binário e arquivo grande.
#[tauri::command]
pub async fn read_file(root: String, path: String) -> Result<String, String> {
    let file = checked(&root, &path)?;
    let size = fs::metadata(&file).map_err(|e| format!("não foi possível abrir {path}: {e}"))?.len();
    if size > MAX_FILE {
        return Err(format!("arquivo grande demais para abrir aqui ({} MB)", size / 1024 / 1024));
    }
    let bytes = fs::read(&file).map_err(|e| format!("não foi possível abrir {path}: {e}"))?;
    if bytes.iter().take(BINARY_SNIFF).any(|&b| b == 0) {
        return Err("arquivo binário".into());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// `git status --porcelain -z` → (caminho relativo à pasta do chat, código).
fn parse_status(text: &str, prefix: &str) -> Vec<(String, char)> {
    text.split('\0')
        .filter(|item| item.len() > 3)
        .filter_map(|item| {
            let (xy, path) = item.split_at(3);
            let code = match xy.trim() {
                "??" => 'U',
                s if s.contains('D') => 'D',
                s if s.contains('A') => 'A',
                _ => 'M',
            };
            path.strip_prefix(prefix).map(|p| (p.to_string(), code))
        })
        .collect()
}

/// Arquivos alterados desde o último commit; pasta fora do git → lista vazia.
#[tauri::command]
pub async fn changed_files(dir: String) -> Result<Vec<Changed>, String> {
    let Ok(prefix) = git(&dir, &["rev-parse", "--show-prefix"]) else {
        return Ok(Vec::new());
    };
    let status = git(&dir, &["-c", "core.quotepath=off", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames", "."])?;
    Ok(parse_status(&status, prefix.trim())
        .into_iter()
        .map(|(path, code)| {
            let mtime = fs::metadata(Path::new(&dir).join(&path))
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64);
            Changed { path, code, mtime }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::parse_status;

    #[test]
    fn parse_status_maps_codes_and_strips_prefix() {
        let text = " M app/src/a.ts\0?? app/novo.md\0D  app/velho.rs\0A  app/b.ts\0 M fora/c.ts\0";
        assert_eq!(
            parse_status(text, "app/"),
            vec![
                ("src/a.ts".into(), 'M'),
                ("novo.md".into(), 'U'),
                ("velho.rs".into(), 'D'),
                ("b.ts".into(), 'A'),
            ]
        );
        assert_eq!(parse_status(" M a.ts\0", ""), vec![("a.ts".into(), 'M')]);
    }
}

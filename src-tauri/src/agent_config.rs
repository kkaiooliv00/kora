//! Configuração dos agentes por projeto: servidores MCP (`.mcp.json`) e skills (`.claude/skills/<nome>/SKILL.md`),
//! os mesmos arquivos que o Claude Code lê na pasta do projeto.

use serde::Serialize;
use serde_json::{Map, Value};
use std::{fs, path::Path, path::PathBuf};

const MCP_FILE: &str = ".mcp.json";
const SKILLS_DIR: &str = ".claude/skills";
const SKILL_FILE: &str = "SKILL.md";
const NAME_MAX: usize = 64;

#[derive(Serialize, Debug, PartialEq)]
pub struct Skill {
    name: String,
    description: String,
    body: String,
}

/// Nome de skill do Claude Code: minúsculas, números e hífens (também é o nome da pasta).
fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= NAME_MAX
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.starts_with('-')
}

fn skill_dir(root: &str, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("nome inválido \"{name}\": use letras minúsculas, números e hífens"));
    }
    Ok(Path::new(root).join(SKILLS_DIR).join(name))
}

/// Separa o frontmatter (`---` … `---`) do corpo e lê `name` e `description`.
fn parse_skill(text: &str) -> (Option<String>, String, String) {
    let text = text.trim_start_matches('\u{feff}');
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return (None, String::new(), text.trim().to_string());
    }
    let (mut name, mut description) = (None, String::new());
    let mut consumed = 1;
    for line in lines.by_ref() {
        consumed += 1;
        if line.trim() == "---" {
            break;
        }
        if let Some((key, value)) = line.split_once(':') {
            let value = unquote(value.trim());
            match key.trim() {
                "name" => name = Some(value),
                "description" => description = value,
                _ => {}
            }
        }
    }
    let body = text.lines().skip(consumed).collect::<Vec<_>>().join("\n");
    (name, description, body.trim().to_string())
}

/// Valor YAML de uma linha: tira as aspas e desfaz `\"` e `\\` (aspas duplas) ou `''` (simples).
fn unquote(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        let mut out = String::new();
        let mut chars = value[1..value.len() - 1].chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                out.extend(chars.next());
            } else {
                out.push(c);
            }
        }
        return out;
    }
    if value.len() >= 2 && value.starts_with('\'') && value.ends_with('\'') {
        return value[1..value.len() - 1].replace("''", "'");
    }
    value.to_string()
}

/// Descrição numa linha só, entre aspas (YAML), para o frontmatter não quebrar.
fn render_skill(name: &str, description: &str, body: &str) -> String {
    let description = description.split_whitespace().collect::<Vec<_>>().join(" ").replace('\\', "\\\\").replace('"', "\\\"");
    format!("---\nname: {name}\ndescription: \"{description}\"\n---\n\n{}\n", body.trim())
}

/// Conteúdo do `.mcp.json` do projeto (objeto vazio quando ainda não existe).
#[tauri::command]
pub async fn project_mcp(root: String) -> Result<Value, String> {
    let path = Path::new(&root).join(MCP_FILE);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| format!("{MCP_FILE} inválido: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Value::Object(Map::new())),
        Err(e) => Err(format!("não foi possível ler {MCP_FILE}: {e}")),
    }
}

/// Grava o `.mcp.json` inteiro (formatado), mantendo o que não é `mcpServers` como veio.
#[tauri::command]
pub async fn save_project_mcp(root: String, value: Value) -> Result<(), String> {
    if !value.is_object() {
        return Err(format!("{MCP_FILE} precisa ser um objeto JSON"));
    }
    let text = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(Path::new(&root).join(MCP_FILE), format!("{text}\n")).map_err(|e| format!("não foi possível salvar {MCP_FILE}: {e}"))
}

/// Skills do projeto, por nome da pasta.
#[tauri::command]
pub async fn project_skills(root: String) -> Result<Vec<Skill>, String> {
    let dir = Path::new(&root).join(SKILLS_DIR);
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut skills: Vec<Skill> = entries
        .filter_map(Result::ok)
        .filter(|e| e.path().is_dir())
        .filter_map(|e| {
            let folder = e.file_name().to_string_lossy().into_owned();
            let text = fs::read_to_string(e.path().join(SKILL_FILE)).ok()?;
            let (name, description, body) = parse_skill(&text);
            Some(Skill { name: name.filter(|n| !n.is_empty()).unwrap_or(folder), description, body })
        })
        .collect();
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
}

/// Cria ou reescreve `.claude/skills/<nome>/SKILL.md`; `previous` renomeia a pasta de uma skill existente.
#[tauri::command]
pub async fn save_skill(root: String, name: String, description: String, body: String, previous: Option<String>) -> Result<(), String> {
    let dir = skill_dir(&root, &name)?;
    if description.trim().is_empty() {
        return Err("a descrição é obrigatória: é por ela que o agente decide quando usar a skill".into());
    }
    match previous.filter(|p| p != &name) {
        Some(old) => {
            let old_dir = skill_dir(&root, &old)?;
            if dir.exists() {
                return Err(format!("já existe uma skill \"{name}\""));
            }
            fs::rename(&old_dir, &dir).map_err(|e| format!("não foi possível renomear: {e}"))?;
        }
        None => fs::create_dir_all(&dir).map_err(|e| format!("não foi possível criar {}: {e}", dir.display()))?,
    }
    fs::write(dir.join(SKILL_FILE), render_skill(&name, &description, &body)).map_err(|e| format!("não foi possível salvar a skill: {e}"))
}

/// Apaga a pasta da skill (com os arquivos de apoio dela).
#[tauri::command]
pub async fn remove_skill(root: String, name: String) -> Result<(), String> {
    let dir = skill_dir(&root, &name)?;
    fs::remove_dir_all(&dir).map_err(|e| format!("não foi possível apagar {}: {e}", dir.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_follow_claude_code_rules() {
        assert!(valid_name("revisar-pr"));
        assert!(valid_name("deploy2"));
        assert!(!valid_name("../fora"));
        assert!(!valid_name("Com Espaço"));
        assert!(!valid_name("-x"));
        assert!(!valid_name(""));
    }

    #[test]
    fn skill_round_trips_through_frontmatter() {
        let text = render_skill("revisar", "Revisa \"PRs\"\n antes do merge", "Passo 1\nPasso 2");
        let (name, description, body) = parse_skill(&text);
        assert_eq!(name.as_deref(), Some("revisar"));
        assert_eq!(description, "Revisa \"PRs\" antes do merge");
        assert_eq!(parse_skill(&render_skill("revisar", &description, &body)).1, description);
        assert_eq!(body, "Passo 1\nPasso 2");
    }

    #[test]
    fn skill_without_frontmatter_is_all_body() {
        assert_eq!(parse_skill("só texto"), (None, String::new(), "só texto".into()));
    }
}

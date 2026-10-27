//! `kora-cli`: deixa um agente rodando num terminal do Kora falar com os outros chats.
//! Fala com a API local do Kora (127.0.0.1 + token), que vem nas variáveis de ambiente
//! que o Kora coloca em cada terminal. Só biblioteca padrão.

use std::{
    env,
    io::{self, Read, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Command, ExitCode, Stdio},
    thread,
    time::{Duration, Instant},
};

const USAGE: &str = "uso: kora-cli <comando>

  list                      chats do Kora (id, status, nome, projeto)
  send <chat> <mensagem>    envia a mensagem como prompt ao chat ('-' lê do stdin)
  wait <chat> [segundos]    espera o chat terminar o que está fazendo (padrão 600 s)
  read <chat> [linhas]      últimas linhas da tela do chat (padrão 80)
  status <chat>             status atual do chat

<chat> é o nome do chat ou o começo do id (veja `kora-cli list`).
Funciona só dentro de um terminal aberto pelo Kora.";

const DEFAULT_READ_LINES: u32 = 80;
const DEFAULT_WAIT_SECS: u64 = 600;
const POLL: Duration = Duration::from_secs(2);
/// Depois de um `send`, o destino pode levar um instante para começar a trabalhar.
const START_GRACE: Duration = Duration::from_secs(8);
const IO_TIMEOUT: Duration = Duration::from_secs(30);

struct Api {
    port: u16,
    token: String,
    from: String,
}

impl Api {
    fn from_env() -> Result<Self, String> {
        let missing = || "rode dentro de um terminal do Kora (KORA_PORT/KORA_TOKEN ausentes)".to_string();
        let port = env::var("KORA_PORT").map_err(|_| missing())?.parse().map_err(|_| missing())?;
        let token = env::var("KORA_TOKEN").map_err(|_| missing())?;
        let from = env::var("KORA_CHAT_ID").unwrap_or_default();
        Ok(Self { port, token, from })
    }

    fn call(&self, kind: &str, body: &str) -> Result<String, String> {
        self.post(&format!("/cli/{kind}"), body)
    }

    fn post(&self, path: &str, body: &str) -> Result<String, String> {
        let mut stream =
            TcpStream::connect(("127.0.0.1", self.port)).map_err(|e| format!("o Kora não respondeu ({e}); ele está aberto?"))?;
        let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
        let request = format!(
            "POST {path}?t={token} HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Kora-From: {from}\r\n\
             Content-Type: text/plain; charset=utf-8\r\nContent-Length: {len}\r\nConnection: close\r\n\r\n{body}",
            token = self.token,
            from = self.from,
            len = body.len(),
        );
        stream.write_all(request.as_bytes()).map_err(|e| e.to_string())?;
        let mut raw = Vec::new();
        stream.read_to_end(&mut raw).map_err(|e| e.to_string())?;
        parse_response(&String::from_utf8_lossy(&raw))
    }
}

/// Status 200 → corpo; qualquer outro → erro com o corpo.
fn parse_response(raw: &str) -> Result<String, String> {
    let (head, body) = raw.split_once("\r\n\r\n").ok_or("resposta inválida do Kora")?;
    let code = head.split_whitespace().nth(1).ok_or("resposta inválida do Kora")?;
    if code == "200" {
        Ok(body.to_string())
    } else {
        Err(if body.is_empty() { format!("erro {code}") } else { body.to_string() })
    }
}

fn wait(api: &Api, chat: &str, timeout: Duration) -> Result<String, String> {
    let started = Instant::now();
    let mut seen_busy = false;
    loop {
        let status = api.call("status", &format!("{chat}\n"))?;
        let status = status.trim();
        if status == "running" {
            seen_busy = true;
        } else if seen_busy || started.elapsed() > START_GRACE {
            return Ok(format!("{chat}: {status}"));
        }
        if started.elapsed() > timeout {
            return Err(format!("{chat} ainda está trabalhando depois de {} s", timeout.as_secs()));
        }
        thread::sleep(POLL);
    }
}

/// O shell em que o Claude Code roda a statusline: Git Bash no Windows (cmd se não houver), `sh` no resto.
fn shell(command: &str) -> Command {
    if cfg!(windows) {
        let git_bash = env::var_os("CLAUDE_CODE_GIT_BASH_PATH")
            .map(PathBuf::from)
            .or_else(|| env::var_os("ProgramFiles").map(|p| PathBuf::from(p).join(r"Git\bin\bash.exe")))
            .filter(|p| p.exists());
        if let Some(bash) = git_bash {
            let mut cmd = Command::new(bash);
            cmd.args(["-c", command]);
            return cmd;
        }
        let mut cmd = Command::new("cmd");
        cmd.args(["/d", "/c", command]);
        cmd
    } else {
        let mut cmd = Command::new("sh");
        cmd.args(["-c", command]);
        cmd
    }
}

/// Statusline do Claude no Kora: manda o JSON (limites de uso) ao Kora, que devolve a statusline
/// do usuário; ela roda com o mesmo JSON e a saída dela é a que aparece.
fn statusline() -> Result<String, String> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).map_err(|e| e.to_string())?;
    // Kora fechado ou lento não pode apagar a statusline: sem resposta, segue sem a do usuário.
    let command = Api::from_env().and_then(|api| api.post("/limits", &input)).unwrap_or_default();
    let command = command.trim();
    if command.is_empty() {
        return Ok(String::new());
    }
    let mut child = shell(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("statusline: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(input.as_bytes());
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn run(args: &[String]) -> Result<String, String> {
    let Some((command, rest)) = args.split_first() else {
        return Err(USAGE.into());
    };
    if matches!(command.as_str(), "help" | "-h" | "--help") {
        return Ok(USAGE.into());
    }
    if command == "statusline" {
        return statusline();
    }
    let api = Api::from_env()?;
    match (command.as_str(), rest) {
        ("list", []) => api.call("list", ""),
        ("send", [chat, message @ ..]) if !message.is_empty() => {
            let text = if message == ["-"] {
                let mut input = String::new();
                io::stdin().read_to_string(&mut input).map_err(|e| e.to_string())?;
                input
            } else {
                message.join(" ")
            };
            api.call("send", &format!("{chat}\n{text}"))
        }
        ("read", [chat]) => api.call("read", &format!("{chat}\n{DEFAULT_READ_LINES}")),
        ("read", [chat, lines]) => {
            let lines: u32 = lines.parse().map_err(|_| "linhas precisa ser um número")?;
            api.call("read", &format!("{chat}\n{lines}"))
        }
        ("status", [chat]) => api.call("status", &format!("{chat}\n")),
        ("wait", [chat]) => wait(&api, chat, Duration::from_secs(DEFAULT_WAIT_SECS)),
        ("wait", [chat, secs]) => {
            let secs: u64 = secs.parse().map_err(|_| "segundos precisa ser um número")?;
            wait(&api, chat, Duration::from_secs(secs))
        }
        _ => Err(USAGE.into()),
    }
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    match run(&args) {
        Ok(out) => {
            println!("{}", out.trim_end());
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("kora-cli: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_response;

    #[test]
    fn parse_response_splits_status_and_body() {
        let ok = "HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello";
        assert_eq!(parse_response(ok), Ok("hello".into()));
        let bad = "HTTP/1.1 400 Bad Request\r\n\r\nchat não encontrado";
        assert_eq!(parse_response(bad), Err("chat não encontrado".into()));
        assert!(parse_response("lixo").is_err());
    }
}

# Terminal Person — Plano

Terminal leve (Windows + Linux) para rodar e organizar agentes de IA de linha de comando (Claude, Codex, Gemini, Grok, OpenCode…).

## Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Shell do app | **Tauri 2** (Rust) | ~10 MB, usa WebView do sistema (WebView2 / WebKitGTK) |
| PTY | `portable-pty` | ConPTY no Windows, PTY no Linux, mesma API |
| Terminal | **xterm.js** + addons `webgl`, `fit`, `search`, `serialize`, `web-links` | mesmo motor do VS Code |
| UI | **Svelte 5 + Vite + TypeScript** | runtime mínimo |
| Persistência | arquivos JSON em `%APPDATA%/terminal-person` (`~/.config/terminal-person`) | sem banco; troca para SQLite se crescer |
| Git | CLI `git` via `std::process` | sem libgit2 |

## Modelo de dados

```
Projeto (pasta raiz, snippets, editor)
 └─ Grupo (pasta lógica, opcional)
     └─ Chat (perfil, cwd, worktree?, status, sessionId, fila de prompts)

Perfil (config.json):  { id, nome, ícone, comando, args, resume: "claude --resume {sessionId}", env }
```

Perfis ficam em config — adicionar uma IA nova não exige código. SSH (K) é só um perfil cujo comando é `ssh host -t "cd dir && claude"`.

## Arquitetura

```
┌──────────── WebView (Svelte) ────────────┐
│ Sidebar árvore │ Abas + splits (xterm.js)│
│ Palette Ctrl+K │ Diff │ Config/Tema      │
└───────▲──────────────────────┬───────────┘
        │ eventos (output/status)  │ comandos (write/resize/spawn)
┌───────┴──────────────────────▼───────────┐
│ Rust core                                 │
│  PtyManager  ─ spawn/kill/write/resize    │
│  StatusEngine ─ hooks + heurística        │
│  Store ─ config.json / state.json         │
│  LocalApi ─ HTTP 127.0.0.1:<porta>+token  │◀── `tp` CLI (hooks e chat↔chat)
└───────────────────────────────────────────┘
```

Cada PTY recebe no ambiente `TP_CHAT_ID`, `TP_PORT`, `TP_TOKEN`.

### Status (item 3)

Estados: `rodando` · `aguardando você` · `ocioso` · `finalizado` · `erro`.

- **Claude Code** (preciso): o app inicia `claude --settings <arquivo gerado>` com hooks que chamam `tp status <estado>`
  - `UserPromptSubmit`, `PreToolUse` → rodando
  - `Notification` → aguardando você (permissão / idle)
  - `Stop` → ocioso (turno terminou); grava `session_id` para resume
  - Não toca no `~/.claude/settings.json` do usuário.
- **Codex**: `notify` do config → `tp status`.
- **Demais CLIs** (heurística): saída nos últimos ~2s → rodando; sem saída → ocioso.
- **Processo saiu**: código 0 → finalizado, ≠0 → erro.

### Chats conversando (item 2)

Binário `tp` (mesmo workspace Rust) fala com o `LocalApi`:

```
tp list                       # chats do grupo/projeto
tp send <chat> "mensagem"     # escreve no PTY do outro chat
tp read <chat> [--lines 200]  # lê o fim do scrollback
tp wait <chat>                # bloqueia até o chat ficar ocioso
```

Qualquer agente consegue usar, porque todos sabem rodar comando de shell. Um MCP server em cima disso só se a CLI não bastar.

## Funcionalidades → implementação

| # | Funcionalidade | Como |
|---|---|---|
| 1 | Várias IAs | perfis em config |
| 2 | Grupos + conversa | árvore na sidebar + `tp` CLI |
| 3 | Status | StatusEngine (acima) |
| 4 | Projetos | pasta raiz; chat nasce com cwd do projeto |
| 5 | Visual | tema/fonte/cursor/opacidade em config, hot reload; import de temas do Windows Terminal |
| A | Worktree por chat | `git worktree add .tp/worktrees/<chat> -b tp/<chat>` |
| B | Broadcast | mesmo texto em N PTYs selecionados |
| C | Notificações/bandeja | `tauri-plugin-notification` + tray com contador de "aguardando" |
| D | Restaurar sessão | `state.json` + scrollback via addon `serialize` + comando `resume` do perfil |
| E | Splits | árvore binária de painéis por aba |
| F | Palette + atalhos | lista fuzzy de ações; atalhos em config |
| G | Busca | addon `search` no chat; busca global nos buffers serializados |
| H | Diff viewer | `git diff --color` num xterm somente-leitura |
| I | Snippets | lista por projeto, inserida via palette |
| J | Uso/custo | lê os JSONL locais (`~/.claude/projects`, `~/.codex/sessions`) |
| K | SSH | perfil com `ssh -t`; status por heurística (hooks não alcançam a máquina local) |
| L | Colar imagem | salva a imagem do clipboard num arquivo temporário e cola o caminho no PTY |
| M | Fila de prompts | envia o próximo quando o status vira ocioso |
| N | Abrir no editor | comando configurável (`code {path}`) |
| O | Links abrem no Chrome | addon `web-links` + `tauri-plugin-opener` com app explícito (`chrome` no Windows, `google-chrome` no Linux), configurável em `config.json` (`browser`); se o Chrome não for encontrado, avisa e cai no navegador padrão. Sem navegador interno |

## Fases

| Fase | Entrega | Itens |
|---|---|---|
| 0 | Toolchain + scaffold Tauri/Svelte/xterm, um shell abrindo | — |
| 1 | **MVP**: projetos, perfis, árvore projeto→grupo→chat, abas, status, temas, notificações, links | 1, 3, 4, 5, C, O |
| 2 | Produtividade | E, F, G, I, B, M, N, L |
| 3 | Git | A, H |
| 4 | Persistência + comunicação | D, 2 (`tp` CLI) |
| 5 | Extras | J, K (reconexão) |

Cada fase termina com o app rodando no Windows; o build no Linux é validado via CI (GitHub Actions, `ubuntu-latest`) a partir da fase 1.

## Decisões assumidas (dá para mudar)

- Layout: sidebar em árvore (como o Orca) + abas + splits.
- Linux: desktop com GUI; servidor remoto via perfil SSH (K).
- Chat↔chat: delegação via `tp send/read/wait`.

## Pré-requisitos (Windows)

- Visual Studio Build Tools 2022 com "Desenvolvimento para desktop com C++" (linker MSVC) — **ausente hoje**
- `rustup` (stable, MSVC) — **ausente hoje**
- WebView2 — ok (155.x)
- Node 24 — ok

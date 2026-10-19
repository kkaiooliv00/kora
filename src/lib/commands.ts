import {
  app,
  addChat,
  addProject,
  closePane,
  cycleTab,
  openChat,
  projectOf,
  restartChat,
  splitChat,
  toggleDirection,
} from './state.svelte'
import { activeSnippets, openActiveInEditor, openInEditor, pasteSnippet, resumeAgents } from './automation'

export interface Command {
  id: string
  label: string
  /** Atalho mostrado na paleta. */
  hint?: string
  run: () => void
}

export function openPalette(query = '') {
  app.paletteQuery = query
  // Remonta a paleta (via {#key}) mesmo quando ela já está aberta, ex.: "Dividir" escolhido nela.
  app.paletteOpens += 1
  app.modal = 'palette'
}

/** Ações com atalho configurável (as chaves batem com settings.keys). */
export const ACTIONS: Record<string, { label: string; run: () => void }> = {
  palette: { label: 'Paleta de comandos', run: () => openPalette() },
  search: { label: 'Buscar no terminal', run: () => app.active && (app.searching = app.active) },
  split: { label: 'Dividir: abrir outro chat ao lado', run: () => openPalette('Dividir com: ') },
  closePane: { label: 'Fechar chat em foco', run: () => app.active && closePane(app.active) },
  nextTab: { label: 'Próxima aba', run: () => cycleTab(1) },
  prevTab: { label: 'Aba anterior', run: () => cycleTab(-1) },
  broadcast: { label: 'Broadcast: enviar para vários chats', run: () => (app.modal = 'broadcast') },
  queue: { label: 'Fila de prompts do chat em foco', run: () => app.active && (app.modal = 'queue') },
  editor: { label: 'Abrir projeto no editor', run: openActiveInEditor },
  diff: { label: 'Ver mudanças (git diff) do chat em foco', run: () => (app.modal = 'diff') },
  usage: { label: 'Uso de tokens (Claude e Codex)', run: () => (app.modal = 'usage') },
  settings: { label: 'Configurações', run: () => (app.modal = 'settings') },
}

/** Tudo o que a paleta oferece, montado na hora a partir do estado. */
export function buildCommands(): Command[] {
  const actions = Object.entries(ACTIONS)
    .filter(([id]) => id !== 'palette')
    .map(([id, a]) => ({ id, label: a.label, hint: app.settings.keys[id], run: a.run }))
  const active = app.active
  const extras: Command[] = [
    { id: 'newProject', label: 'Novo projeto', run: addProject },
    ...(active
      ? [
          { id: 'restart', label: 'Reiniciar chat em foco (retoma a conversa)', run: () => restartChat(active, false) },
          { id: 'fresh', label: 'Nova conversa no chat em foco', run: () => restartChat(active, true) },
        ]
      : []),
    ...(app.agentsPaused ? [{ id: 'resumeAgents', label: 'Liberar mensagens entre agentes', run: resumeAgents }] : []),
    { id: 'toggleSplit', label: 'Alternar divisão lado a lado / empilhada', run: toggleDirection },
  ]
  const snippets = activeSnippets().map((s, i) => ({ id: `snippet:${i}`, label: `Snippet: ${s.name}`, run: () => pasteSnippet(s.text) }))
  const chats = app.chats.flatMap((c) => {
    const where = projectOf(c)?.name ?? ''
    return [
      { id: `open:${c.id}`, label: `Abrir: ${c.name} — ${where}`, run: () => openChat(c.id) },
      { id: `split:${c.id}`, label: `Dividir com: ${c.name} — ${where}`, run: () => splitChat(c.id) },
    ]
  })
  const created = app.projects.flatMap((p) =>
    app.profiles.map((profile) => ({ id: `new:${p.id}:${profile.id}`, label: `Novo ${profile.name} em ${p.name}`, run: () => addChat(p.id, profile.id) })),
  )
  const worktrees = app.projects.flatMap((p) =>
    app.profiles.map((profile) => ({
      id: `worktree:${p.id}:${profile.id}`,
      label: `Novo ${profile.name} em worktree de ${p.name}`,
      run: () => addChat(p.id, profile.id, undefined, true),
    })),
  )
  const editors = app.projects.map((p) => ({ id: `editor:${p.id}`, label: `Abrir no editor: ${p.name}`, run: () => openInEditor(p.path) }))
  return [...actions, ...extras, ...snippets, ...chats, ...created, ...worktrees, ...editors]
}

/** Todas as palavras da busca precisam aparecer no rótulo (sem acento e sem caixa). */
export function matches(label: string, query: string): boolean {
  const plain = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const text = plain(label)
  return plain(query).split(/\s+/).filter(Boolean).every((word) => text.includes(word))
}

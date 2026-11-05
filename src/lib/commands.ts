import {
  app,
  addChat,
  addProject,
  requestClosePane,
  hidePane,
  goToWaiting,
  cycleTab,
  isOpen,
  openChat,
  projectOf,
  restartChat,
  splitChat,
  toggleDirection,
  STATUS,
} from './state.svelte'
import { activeSnippets, openActiveInEditor, openInEditor, pasteSnippet, resumeAgents } from './automation'
import { terminals } from './terminals'
import { toast } from './toasts.svelte'
import { answer } from './approval'

/** Grupos da paleta, na ordem em que aparecem (tela 03 do design). */
export const GROUPS = ['ações', 'sessões', 'novo chat', 'snippets', 'projetos'] as const
export type Group = (typeof GROUPS)[number]

export interface Command {
  id: string
  label: string
  group: Group
  /** Atalho mostrado à direita. */
  hint?: string
  /** Texto à direita quando não há atalho (ex.: status da sessão). */
  detail?: string
  /** Cor do detalhe (status). */
  detailColor?: string
  /** Rótulo em mono (nomes de sessão e caminhos). */
  mono?: boolean
  run: () => void
}

function copyLastReply() {
  const text = app.active ? terminals.get(app.active)?.lastReply() : ''
  if (!text) return toast({ tone: 'info', title: 'Nada para copiar', text: 'Envie um prompt neste chat primeiro.' })
  navigator.clipboard
    .writeText(text)
    .then(() => toast({ tone: 'success', title: 'Resposta copiada', text: `${text.split('\n').length} linhas` }))
    .catch((e) => toast({ tone: 'danger', title: 'Não foi possível copiar', text: String(e) }))
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
  split: { label: 'Dividir: abrir outro chat ao lado', run: () => openPalette('Dividir com ') },
  closePane: { label: 'Fechar painel (o chat segue na barra lateral)', run: () => app.active && hidePane(app.active) },
  nextTab: { label: 'Próximo chat aberto', run: () => cycleTab(1) },
  prevTab: { label: 'Chat aberto anterior', run: () => cycleTab(-1) },
  waiting: { label: 'Ir para quem espera você', run: goToWaiting },
  newChat: { label: 'Novo chat', run: () => (app.activeTab = null) },
  approveOnce: { label: 'Aprovar uma vez', run: () => app.active && answer(app.active, 'once') },
  approveAlways: { label: 'Aprovar sempre (neste projeto)', run: () => app.active && answer(app.active, 'always') },
  reason: { label: 'Ver motivo e regra da aprovação', run: () => app.active && (app.showReason = app.showReason === app.active ? null : app.active) },
  broadcast: { label: 'Enviar o mesmo prompt para vários chats', run: () => (app.modal = 'broadcast') },
  queue: { label: 'Fila de prompts do chat em foco', run: () => app.active && (app.modal = 'queue') },
  editor: { label: 'Abrir projeto no editor', run: openActiveInEditor },
  diff: { label: 'Ver mudanças do chat em foco', run: () => (app.modal = 'diff') },
  usage: { label: 'Uso de tokens', run: () => (app.modal = 'usage') },
  panel: { label: 'Mostrar ou esconder o painel de arquivos', run: () => (app.showPanel = !app.showPanel) },
  settings: { label: 'Configurações', run: () => (app.modal = 'settings') },
  agents: { label: 'Painel de todos os agentes', run: () => (app.modal = 'agents') },
  prevPrompt: { label: 'Ir ao prompt anterior', run: () => app.active && terminals.get(app.active)?.jumpPrompt(-1) },
  nextPrompt: { label: 'Ir ao próximo prompt', run: () => app.active && terminals.get(app.active)?.jumpPrompt(1) },
  copyReply: { label: 'Copiar a última resposta do chat em foco', run: copyLastReply },
  board: { label: 'Quadro de tarefas', run: () => (app.modal = 'board') },
  history: { label: 'Buscar em todas as conversas', run: () => (app.modal = 'history') },
  compare: {
    label: 'Comparar agentes: mesmo prompt em vários',
    run: () => {
      app.comparing = null
      app.modal = 'compare'
    },
  },
  shortcuts: { label: 'Todos os atalhos', run: () => (app.modal = 'shortcuts') },
  tour: { label: 'Fazer o tour', run: () => ((app.modal = null), (app.activeTab = null), (app.tourStep = 0)) },
  stopChat: { label: 'Encerrar o chat em foco (para o processo)', run: () => app.active && requestClosePane(app.active) },
}

function actionCommands(): Command[] {
  const actions: Command[] = Object.entries(ACTIONS)
    .filter(([id]) => id !== 'palette')
    .map(([id, a]) => ({ id, group: 'ações', label: a.label, hint: app.settings.keys[id], run: a.run }))
  const active = app.active
  if (active) {
    actions.push(
      { id: 'restart', group: 'ações', label: 'Reiniciar chat em foco', detail: 'retoma a conversa', run: () => restartChat(active, false) },
      { id: 'fresh', group: 'ações', label: 'Nova conversa no chat em foco', run: () => restartChat(active, true) },
    )
  }
  if (app.agentsPaused) actions.push({ id: 'resumeAgents', group: 'ações', label: 'Liberar mensagens entre agentes', run: resumeAgents })
  actions.push(
    { id: 'toggleSplit', group: 'ações', label: 'Alternar divisão lado a lado / empilhada', run: toggleDirection },
    { id: 'newProject', group: 'ações', label: 'Abrir pasta como projeto', run: addProject },
  )
  return actions
}

function sessionCommands(): Command[] {
  return app.chats.flatMap((c) => {
    const where = projectOf(c)?.name ?? ''
    const status = isOpen(c.id) ? STATUS[app.status[c.id] ?? 'idle'] : undefined
    return [
      {
        id: `open:${c.id}`,
        group: 'sessões' as const,
        label: `${where}/${c.name}`,
        mono: true,
        detail: status ? `${status.glyph} ${status.label}` : 'fechado',
        detailColor: status?.color,
        run: () => openChat(c.id),
      },
      {
        id: `split:${c.id}`,
        group: 'sessões' as const,
        label: `Dividir com ${where}/${c.name}`,
        detail: 'abre ao lado',
        run: () => splitChat(c.id),
      },
    ]
  })
}

/** Tudo o que a paleta oferece, montado na hora a partir do estado. */
export function buildCommands(): Command[] {
  const created: Command[] = app.projects.flatMap((p) =>
    app.profiles.flatMap((profile) => [
      { id: `new:${p.id}:${profile.id}`, group: 'novo chat' as const, label: `Novo ${profile.name} em ${p.name}`, run: () => addChat(p.id, profile.id) },
      {
        id: `worktree:${p.id}:${profile.id}`,
        group: 'novo chat' as const,
        label: `Novo ${profile.name} em ${p.name}`,
        detail: 'worktree isolado',
        run: () => addChat(p.id, profile.id, undefined, true),
      },
    ]),
  )
  const snippets: Command[] = activeSnippets().map((s, i) => ({
    id: `snippet:${i}`,
    group: 'snippets',
    label: s.name,
    detail: s.project ? s.project : 'todos os projetos',
    run: () => pasteSnippet(s.text),
  }))
  const projects: Command[] = app.projects.map((p) => ({
    id: `editor:${p.id}`,
    group: 'projetos',
    label: p.name,
    mono: true,
    detail: 'abrir no editor',
    run: () => openInEditor(p.path),
  }))
  return [...actionCommands(), ...sessionCommands(), ...created, ...snippets, ...projects]
}

/** Texto sem acento e em minúsculas, mantendo um caractere por caractere original. */
const plainChar = (c: string) => c.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().slice(0, 1) || c

/** Todas as palavras da busca precisam aparecer no rótulo (sem acento e sem caixa). */
export function matches(label: string, query: string): boolean {
  const text = [...label].map(plainChar).join('')
  return words(query).every((word) => text.includes(word))
}

const words = (query: string) =>
  [...query].map(plainChar).join('').split(/\s+/).filter(Boolean)

/** Pedaços do rótulo marcando o que bate com a busca, para destacar em `accent`. */
export function highlight(label: string, query: string): { text: string; hit: boolean }[] {
  const chars = [...label]
  const plain = chars.map(plainChar).join('')
  const hit = chars.map(() => false)
  for (const word of words(query)) {
    let from = plain.indexOf(word)
    while (from !== -1) {
      for (let i = from; i < from + word.length; i++) hit[i] = true
      from = plain.indexOf(word, from + word.length)
    }
  }
  return chars.reduce<{ text: string; hit: boolean }[]>((parts, c, i) => {
    const last = parts.at(-1)
    if (last && last.hit === hit[i]) last.text += c
    else parts.push({ text: c, hit: hit[i] })
    return parts
  }, [])
}

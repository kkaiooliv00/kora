import { tick } from 'svelte'
import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { DEFAULT_KEYS } from './keys'

export type Status = 'idle' | 'running' | 'waiting' | 'done' | 'error'
export type Modal = 'palette' | 'broadcast' | 'queue' | 'settings' | 'diff' | 'usage'

export interface Profile {
  id: string
  name: string
  /** Linha de comando; vazio abre só o shell. */
  command: string
  /** 'claude' liga o status preciso via hooks. */
  hooks?: 'claude'
  /** Reabre sozinho quando o processo cai com erro (ex.: ssh que perdeu a conexão). */
  reconnect?: boolean
}
export interface Project {
  id: string
  name: string
  path: string
}
export interface Group {
  id: string
  name: string
  projectId: string
}
export interface Chat {
  id: string
  name: string
  profileId: string
  projectId: string
  groupId?: string
  /** Pasta do git worktree próprio (vazio = pasta do projeto). */
  cwd?: string
  branch?: string
  /** Sessão do Claude, para retomar a conversa ao reabrir. */
  sessionId?: string
}
export interface Snippet {
  name: string
  text: string
  /** Nome do projeto; vazio = vale para todos. */
  project?: string
}
export interface Settings {
  fontFamily: string
  fontSize: number
  theme: string
  /** Caminho do navegador; vazio procura o Chrome. */
  browser: string
  /** Comando do editor; recebe a pasta do projeto no fim. */
  editor: string
  keys: Record<string, string>
  snippets: Snippet[]
}
/** Uma aba com um ou mais chats lado a lado. */
export interface Tab {
  id: string
  panes: string[]
  vertical: boolean
}

export const STATUS: Record<Status, { label: string; color: string }> = {
  running: { label: 'rodando', color: '#4cc38a' },
  waiting: { label: 'aguardando você', color: '#f2b84b' },
  idle: { label: 'pronto', color: '#8a90a0' },
  done: { label: 'finalizado', color: '#5b8def' },
  error: { label: 'erro', color: '#e5484d' },
}

const AGY_PROFILE: Profile = { id: 'agy', name: 'Agy', command: 'agy' }

const DEFAULT_PROFILES: Profile[] = [
  { id: 'claude', name: 'Claude', command: 'claude', hooks: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  AGY_PROFILE,
  { id: 'grok', name: 'Grok', command: 'grok' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'shell', name: 'Shell', command: '' },
]

const DEFAULT_SETTINGS: Settings = {
  fontFamily: '"Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace',
  fontSize: 14,
  theme: 'Grafite',
  browser: '',
  editor: 'code',
  keys: DEFAULT_KEYS,
  snippets: [
    { name: 'Revisar mudanças', text: 'Revise as mudanças não commitadas e aponte bugs e riscos.' },
    {
      name: 'Kora: conversar com outros chats',
      text:
        'Você está dentro do Kora. Para falar com outros chats de IA abertos nele, use no terminal: ' +
        '`kora-cli list` (lista os chats), `kora-cli send <chat> <mensagem>` (envia um prompt), ' +
        '`kora-cli wait <chat>` (espera terminar) e `kora-cli read <chat> [linhas]` (lê a tela). ' +
        'Mensagens de outros chats chegam como [mensagem de <chat>].',
    },
  ],
}

export const app = $state({
  profiles: DEFAULT_PROFILES,
  settings: DEFAULT_SETTINGS,
  projects: [] as Project[],
  groups: [] as Group[],
  chats: [] as Chat[],
  tabs: [] as Tab[],
  activeTab: null as string | null,
  /** Chat com foco (recebe snippets, busca, fila). */
  active: null as string | null,
  status: {} as Record<string, Status>,
  /** Prompts esperando o agente ficar pronto, por chat. */
  queue: {} as Record<string, string[]>,
  modal: null as Modal | null,
  paletteQuery: '',
  paletteOpens: 0,
  /** Chat com a barra de busca aberta. */
  searching: null as string | null,
  /** Mensagens entre agentes desde a última vez que você digitou; pausa no limite. */
  agentMessages: 0,
  agentsPaused: false,
  error: '',
})

const uid = () => crypto.randomUUID()

export function fail(context: string, e: unknown) {
  app.error = `${context}: ${e instanceof Error ? e.message : e}`
}

export const chatById = (id: string) => app.chats.find((c) => c.id === id)
export const projectOf = (chat: Chat) => app.projects.find((p) => p.id === chat.projectId)

/** false = arquivo ilegível; nesse caso não salvamos para não sobrescrever os dados. */
export async function load(): Promise<boolean> {
  try {
    const [config, state] = await Promise.all([
      invoke<Partial<{ profiles: Profile[]; settings: Partial<Settings> }> | null>('load_json', { name: 'config' }),
      invoke<Partial<SavedState> | null>('load_json', { name: 'state' }),
    ])
    const profiles = config?.profiles ?? DEFAULT_PROFILES
    // v0.1.0 salvou o perfil "gemini"; o comando certo é o agy.
    const legacyGemini = profiles.some((p) => p.id === 'gemini' && p.command === 'gemini')
    app.profiles = profiles.map((p) => (legacyGemini && p.id === 'gemini' ? AGY_PROFILE : p))
    app.settings = {
      ...DEFAULT_SETTINGS,
      ...config?.settings,
      keys: { ...DEFAULT_KEYS, ...config?.settings?.keys },
    }
    app.projects = state?.projects ?? []
    app.groups = state?.groups ?? []
    app.chats = (state?.chats ?? []).map((c) => (legacyGemini && c.profileId === 'gemini' ? { ...c, profileId: 'agy' } : c))
    restoreTabs(state ?? {})
    return true
  } catch (e) {
    fail('Configuração não carregada (nada será salvo até corrigir)', e)
    return false
  }
}

/** O que vai para state.json: árvore + abas abertas (reabertas na próxima vez). */
export interface SavedState {
  projects: Project[]
  groups: Group[]
  chats: Chat[]
  tabs: Tab[]
  activeTab: string | null
  active: string | null
}

export const savedState = (): SavedState => ({
  projects: app.projects,
  groups: app.groups,
  chats: app.chats,
  tabs: app.tabs,
  activeTab: app.activeTab,
  active: app.active,
})

function restoreTabs(state: Partial<SavedState>) {
  const known = new Set(app.chats.map((c) => c.id))
  app.tabs = (state.tabs ?? [])
    .map((t) => ({ ...t, panes: t.panes.filter((id) => known.has(id)) }))
    .filter((t) => t.panes.length > 0)
  const active = state.active && known.has(state.active) ? state.active : app.tabs[0]?.panes[0]
  if (active) focusChat(active)
}

export function save(config: unknown, state: unknown) {
  invoke('save_json', { name: 'config', value: config }).catch((e) => fail('Falha ao salvar configuração', e))
  invoke('save_json', { name: 'state', value: state }).catch((e) => fail('Falha ao salvar projetos', e))
}

// ---- projetos, grupos e chats ----

export async function addProject() {
  const path = await open({ directory: true, title: 'Pasta do projeto' })
  if (typeof path !== 'string') return
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path
  app.projects.push({ id: uid(), name, path })
}

export async function removeProject(id: string) {
  const project = app.projects.find((p) => p.id === id)
  if (!project) return
  const confirmed = await ask(`Remover "${project.name}" e seus chats? A pasta no disco não é apagada.`, {
    title: 'Remover projeto',
    kind: 'warning',
  })
  if (!confirmed) return
  app.chats.filter((c) => c.projectId === id).forEach((c) => closePane(c.id))
  app.chats = app.chats.filter((c) => c.projectId !== id)
  app.groups = app.groups.filter((g) => g.projectId !== id)
  app.projects = app.projects.filter((p) => p.id !== id)
}

export function addGroup(projectId: string, name: string) {
  if (name.trim()) app.groups.push({ id: uid(), name: name.trim(), projectId })
}

/** Os chats do grupo voltam para a raiz do projeto. */
export function removeGroup(id: string) {
  app.chats = app.chats.map((c) => (c.groupId === id ? { ...c, groupId: undefined } : c))
  app.groups = app.groups.filter((g) => g.id !== id)
}

/** `worktree`: o chat ganha um git worktree e uma branch `kora/...` só dele. */
export async function addChat(projectId: string, profileId: string, groupId?: string, worktree = false) {
  const profile = app.profiles.find((p) => p.id === profileId)
  const project = app.projects.find((p) => p.id === projectId)
  if (!profile || !project) return
  const count = app.chats.filter((c) => c.projectId === projectId && c.profileId === profileId).length
  const chat: Chat = { id: uid(), name: `${profile.name} ${count + 1}`, profileId, projectId, groupId }
  if (worktree) {
    try {
      const created = await invoke<{ path: string; branch: string }>('git_worktree_add', {
        project: project.path,
        name: `${chat.name}-${chat.id.slice(0, 6)}`,
      })
      chat.cwd = created.path
      chat.branch = created.branch
    } catch (e) {
      return fail('Worktree não criado', e)
    }
  }
  app.chats.push(chat)
  openChat(chat.id)
}

export function renameChat(id: string, name: string) {
  if (name.trim()) app.chats = app.chats.map((c) => (c.id === id ? { ...c, name: name.trim() } : c))
}

export function moveChat(id: string, projectId: string, groupId?: string) {
  app.chats = app.chats.map((c) => (c.id === id ? { ...c, projectId, groupId } : c))
}

/** Com worktree, pergunta se apaga a pasta também (a branch sempre fica). */
export async function removeChat(id: string) {
  const chat = chatById(id)
  if (!chat) return
  closePane(id)
  app.chats = app.chats.filter((c) => c.id !== id)
  if (!chat.cwd) return
  const remove = await ask(`Apagar também o worktree em ${chat.cwd}? A branch ${chat.branch} continua no repositório.`, {
    title: 'Remover chat',
    kind: 'warning',
  })
  if (remove) invoke('git_worktree_remove', { path: chat.cwd }).catch((e) => fail('Worktree mantido', e))
}

export const chatDir = (chat: Chat) => chat.cwd ?? projectOf(chat)?.path

export function updateChat(id: string, patch: Partial<Chat>) {
  app.chats = app.chats.map((c) => (c.id === id ? { ...c, ...patch } : c))
}

/** Fecha e reabre o terminal do chat; `fresh` esquece a sessão (conversa nova). */
export async function restartChat(id: string, fresh: boolean) {
  if (fresh) updateChat(id, { sessionId: undefined })
  closePane(id)
  await tick()
  openChat(id)
}

// ---- abas e painéis ----

export const tabOf = (id: string) => app.tabs.find((t) => t.panes.includes(id))
export const isOpen = (id: string) => tabOf(id) !== undefined
export const openIds = () => app.tabs.flatMap((t) => t.panes)

export function focusChat(id: string) {
  const tab = tabOf(id)
  if (!tab) return
  app.activeTab = tab.id
  app.active = id
}

export function openChat(id: string) {
  if (!isOpen(id)) app.tabs.push({ id: uid(), panes: [id], vertical: false })
  focusChat(id)
}

const withoutPane = (tabs: Tab[], id: string) =>
  tabs.map((t) => ({ ...t, panes: t.panes.filter((p) => p !== id) })).filter((t) => t.panes.length > 0)

/** Coloca o chat ao lado do que está em foco; se ele já estiver aberto em outra aba, move. */
export function splitChat(id: string) {
  const target = app.tabs.find((t) => t.id === app.activeTab)
  if (!target || target.panes.includes(id)) return openChat(id)
  app.tabs = withoutPane(app.tabs, id).map((t) => (t.id === target.id ? { ...t, panes: [...t.panes, id] } : t))
  focusChat(id)
}

/** Tira o chat da divisão e põe numa aba só dele. */
export function popOut(id: string) {
  if ((tabOf(id)?.panes.length ?? 0) < 2) return
  app.tabs = [...withoutPane(app.tabs, id), { id: uid(), panes: [id], vertical: false }]
  focusChat(id)
}

/** Fecha o painel e encerra o processo; o chat continua na árvore. */
export function closePane(id: string) {
  const tab = tabOf(id)
  if (!tab) return
  const index = app.tabs.findIndex((t) => t.id === tab.id)
  app.tabs = withoutPane(app.tabs, id)
  delete app.status[id]
  delete app.queue[id]
  if (app.searching === id) app.searching = null
  if (app.active !== id) return
  const next = tabOf(tab.panes.find((p) => p !== id) ?? '') ?? app.tabs[Math.min(index, app.tabs.length - 1)]
  const nextChat = next?.panes.find((p) => p !== id)
  if (nextChat) focusChat(nextChat)
  else {
    app.active = null
    app.activeTab = null
  }
}

export function closeTab(tabId: string) {
  const tab = app.tabs.find((t) => t.id === tabId)
  ;[...(tab?.panes ?? [])].forEach(closePane)
}

export function cycleTab(step: number) {
  if (app.tabs.length === 0) return
  const index = app.tabs.findIndex((t) => t.id === app.activeTab)
  const tab = app.tabs[(index + step + app.tabs.length) % app.tabs.length]
  focusChat(tab.panes[0])
}

export function toggleDirection() {
  app.tabs = app.tabs.map((t) => (t.id === app.activeTab ? { ...t, vertical: !t.vertical } : t))
}

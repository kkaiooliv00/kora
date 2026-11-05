import { tick } from 'svelte'
import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { DEFAULT_KEYS } from './keys'
import { DEFAULT_PERMISSIONS, type Permissions } from './permissions'
import { dismiss, toast } from './toasts.svelte'
import type { Queue } from './queue'

export type Status = 'idle' | 'running' | 'waiting' | 'done' | 'error'
export type Modal = 'palette' | 'broadcast' | 'queue' | 'settings' | 'diff' | 'usage' | 'project' | 'agents' | 'board' | 'compare' | 'history' | 'template' | 'shortcuts'

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
  /** Arquivos copiados da raiz para cada worktree novo, separados por vírgula (padrão: .env). */
  setupFiles?: string
  /** Roda no worktree novo antes do agente abrir (ex.: npm install). */
  setupCommand?: string
  /** Comando do botão ▶; `{port}` vira uma porta livre. */
  runCommand?: string
}
export interface Group {
  id: string
  name: string
  projectId: string
  /** Grupo criado por "comparar agentes": o prompt que todos receberam. */
  compare?: string
}

export type TaskColumn = 'todo' | 'doing' | 'review' | 'done'
/** Cartão do quadro de tarefas; ao ir para "em andamento" vira um chat com o texto como prompt. */
export interface Task {
  id: string
  projectId: string
  text: string
  column: TaskColumn
  chatId?: string
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
  /** Shell que roda o projeto para o chat `runOf` (mesma pasta; não é dono do worktree). */
  runOf?: string
  /** Fora da barra lateral (fica em "chats arquivados"); a conversa e o worktree continuam. */
  archived?: boolean
  /** Você renomeou: o título da sessão do Claude não sobrescreve mais o nome. */
  namedByUser?: boolean
  /** Sessão do Claude, para retomar a conversa ao reabrir. */
  sessionId?: string
  /** Última vez aberto (ms), para a lista de recentes. */
  lastActive?: number
}
export interface Snippet {
  name: string
  text: string
  /** Nome do projeto; vazio = vale para todos. */
  project?: string
}
export interface Settings {
  /** Versão do formato; < 2 = antes da identidade visual Kora. */
  version: number
  fontFamily: string
  fontSize: number
  theme: string
  /** Caminho do navegador; vazio procura o Chrome. */
  browser: string
  /** Comando do editor; recebe a pasta do projeto no fim. */
  editor: string
  keys: Record<string, string>
  snippets: Snippet[]
  /** Regras passadas ao Claude Code de cada chat. */
  permissions: Permissions
  /** Limite diário de tokens (entrada + saída); 0 = sem limite. Passou: aviso e fila pausada. */
  budget: { chatTokens: number; projectTokens: number }
  /** Anti-loop: o mesmo comando `repeats` vezes em `minutes` minutos, sem mudar arquivo, pausa o chat. */
  loop: { repeats: number; minutes: number }
  /** Tour de primeiro uso concluído ou pulado. */
  tourDone: boolean
}
/** Do hook do Claude: plano (TodoWrite), pedido de permissão em aberto e uso de contexto. */
export interface AgentInfo {
  todos?: { content: string; status: string }[]
  permission?: string
  context?: { tokens: number; model: string }
  /** A última ferramenta que o agente quis usar (o que a aprovação mostra). */
  pending?: { tool: string; command?: string; reason?: string; target?: string; file?: string }
}

/** Resumo de um evento de hook (montado em src-tauri/src/hooks.rs). */
export interface HookDetail {
  event: string
  message?: string
  tool?: string
  todos?: { content: string; status: string }[]
  context?: { tokens: number; model: string }
  /** Arquivo que o agente editou (Edit/Write). */
  file?: string
  /** O Kora criou um ponto de restauração antes deste prompt. */
  checkpoint?: boolean
  /** Comando do Bash, motivo (description) e alvo (URL, busca) da ferramenta. */
  command?: string
  reason?: string
  target?: string
}

/** Uma aba com um ou mais chats lado a lado. */
export interface Tab {
  id: string
  panes: string[]
  vertical: boolean
  /** Tamanho de cada painel em %, na ordem de `panes` (vazio = divisão igual). */
  sizes?: number[]
  /** Como os chats da vista aparecem: um só (o em foco), em colunas ou em grade. */
  layout?: Layout
}

export type Layout = 'single' | 'columns' | 'grid'

/** Estado nunca só por cor: cada um tem glifo e palavra (regra do design). */
export const STATUS: Record<Status, { label: string; glyph: string; color: string; tone: string }> = {
  running: { label: 'trabalhando', glyph: '›', color: 'var(--accent)', tone: 'accent' },
  waiting: { label: 'aguardando você', glyph: '!', color: 'var(--warning)', tone: 'warning' },
  idle: { label: 'pronto', glyph: '·', color: 'var(--ink-muted)', tone: '' },
  done: { label: 'concluído', glyph: '✓', color: 'var(--success)', tone: 'success' },
  error: { label: 'erro', glyph: '✗', color: 'var(--danger)', tone: 'danger' },
}

const AGY_PROFILE: Profile = { id: 'agy', name: 'Agy', command: 'agy' }

const DEFAULT_PROFILES: Profile[] = [
  { id: 'claude', name: 'Claude', command: 'claude', hooks: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  AGY_PROFILE,
  { id: 'grok', name: 'Grok', command: 'grok' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'shell', name: 'Terminal', command: '' },
]

const LEGACY_FONT = '"Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace'
const SETTINGS_VERSION = 3

const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  fontSize: 13,
  theme: 'Kora',
  browser: '',
  editor: 'code',
  keys: DEFAULT_KEYS,
  permissions: DEFAULT_PERMISSIONS,
  budget: { chatTokens: 0, projectTokens: 0 },
  loop: { repeats: 6, minutes: 3 },
  tourDone: false,
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
  tasks: [] as Task[],
  tabs: [] as Tab[],
  /** Largura da barra lateral em px (arrastável, 240–360). */
  sidebarWidth: 288,
  /** Projetos e grupos recolhidos na barra lateral. */
  collapsed: {} as Record<string, boolean>,
  activeTab: null as string | null,
  /** Chat com foco (recebe snippets, busca, fila). */
  active: null as string | null,
  status: {} as Record<string, Status>,
  /** Arquivos que cada chat editou nesta sessão, relativos à pasta dele. */
  touched: {} as Record<string, string[]>,
  /** Projeto aberto no modal de configuração. */
  editingProject: null as string | null,
  /** Desde quando cada chat espera você (para ir ao que espera há mais tempo). */
  waitingSince: {} as Record<string, number>,
  /** Chats pausados pelo anti-loop: o comando repetido e quantas vezes. */
  loopPaused: {} as Record<string, { command: string; count: number; from: number; to: number }>,
  /** Arquivos que você pôs no contexto pelo botão "@ Contexto", por chat. */
  context: {} as Record<string, string[]>,
  /** Chat com o motivo e a regra da aprovação abertos (painel compacto, Ctrl+Shift+I). */
  showReason: null as string | null,
  /** Tour de primeiro uso aberto (passo atual). */
  tourStep: null as number | null,
  /** Muda quando um chat ganha ponto de restauração (o painel recarrega a lista). */
  checkpointRev: {} as Record<string, number>,
  /** Snippet com campos `{nome}` esperando os valores. */
  template: '',
  /** Chat que pediu ▶ sem comando configurado: roda quando o projeto for salvo. */
  pendingRun: null as string | null,
  /** Grupo mostrado na página de comparação. */
  comparing: null as string | null,
  /** Prompts esperando o agente ficar pronto, por chat. */
  queue: {} as Record<string, Queue>,
  modal: null as Modal | null,
  /** Seção em que as Configurações abrem (ex.: agentes, a partir de um erro). */
  settingsSection: null as string | null,
  paletteQuery: '',
  paletteOpens: 0,
  /** Chat com a barra de busca aberta. */
  searching: null as string | null,
  /** Mensagens entre agentes desde a última vez que você digitou; pausa no limite. */
  agentMessages: 0,
  agentsPaused: false,
  agentInfo: {} as Record<string, AgentInfo>,
  /** Painel lateral do agente (plano, permissões, contexto). */
  showPanel: true,
  /** Primeiro prompt de um chat novo (tela de boas-vindas): enviado quando o agente termina de abrir. */
  pendingPrompt: {} as Record<string, string>,
})

export const uid = () => crypto.randomUUID()

export function fail(context: string, e: unknown) {
  toast({ tone: 'danger', title: context, text: e instanceof Error ? e.message : String(e) })
}

export const chatById = (id: string) => app.chats.find((c) => c.id === id)
export const projectOf = (chat: Chat) => app.projects.find((p) => p.id === chat.projectId)
export const profileOf = (chat: Chat) => app.profiles.find((p) => p.id === chat.profileId)

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
    app.profiles = profiles
      .map((p) => (legacyGemini && p.id === 'gemini' ? AGY_PROFILE : p))
      // O perfil de shell padrão virou "Terminal"; nomes trocados pelo usuário ficam.
      .map((p) => (p.id === 'shell' && p.name === 'Shell' ? { ...p, name: 'Terminal' } : p))
    app.settings = migrateSettings({
      ...DEFAULT_SETTINGS,
      ...config?.settings,
      keys: { ...DEFAULT_KEYS, ...config?.settings?.keys },
      permissions: { ...DEFAULT_PERMISSIONS, ...config?.settings?.permissions },
      version: config?.settings?.version ?? 1,
      budget: { ...DEFAULT_SETTINGS.budget, ...config?.settings?.budget },
      loop: { ...DEFAULT_SETTINGS.loop, ...config?.settings?.loop },
    })
    app.projects = state?.projects ?? []
    app.groups = state?.groups ?? []
    app.tasks = state?.tasks ?? []
    app.chats = (state?.chats ?? []).map((c) => (legacyGemini && c.profileId === 'gemini' ? { ...c, profileId: 'agy' } : c))
    restoreTabs(state ?? {})
    return true
  } catch (e) {
    fail('Configuração não carregada (nada será salvo até corrigir)', e)
    return false
  }
}

/** Quem ainda estava nos padrões antigos (Grafite, Cascadia 14) passa para o tema Kora. */
function migrateSettings(settings: Settings): Settings {
  const from = settings.version ?? 1
  if (from >= SETTINGS_VERSION) return settings
  let next = settings
  if (from < 2) {
    next = {
      ...next,
      theme: next.theme === 'Grafite' ? DEFAULT_SETTINGS.theme : next.theme,
      fontFamily: next.fontFamily === LEGACY_FONT ? DEFAULT_SETTINGS.fontFamily : next.fontFamily,
      fontSize: next.fontSize === 14 ? DEFAULT_SETTINGS.fontSize : next.fontSize,
    }
  }
  // v3: Ctrl+Shift+A virou "Aprovar sempre"; o painel de agentes foi para outro atalho.
  if (from < 3 && next.keys.agents === 'Ctrl+Shift+A') next = { ...next, keys: { ...next.keys, agents: DEFAULT_KEYS.agents } }
  return { ...next, version: SETTINGS_VERSION }
}

/** O que vai para state.json: árvore + abas abertas (reabertas na próxima vez). */
export interface SavedState {
  projects: Project[]
  groups: Group[]
  chats: Chat[]
  tasks: Task[]
  tabs: Tab[]
  activeTab: string | null
  active: string | null
  collapsed: Record<string, boolean>
  sidebarWidth?: number
}

export const savedState = (): SavedState => ({
  projects: app.projects,
  groups: app.groups,
  chats: app.chats,
  tasks: app.tasks,
  tabs: app.tabs,
  activeTab: app.activeTab,
  active: app.active,
  collapsed: app.collapsed,
  sidebarWidth: app.sidebarWidth,
})

function restoreTabs(state: Partial<SavedState>) {
  app.collapsed = state.collapsed ?? {}
  app.sidebarWidth = state.sidebarWidth ?? app.sidebarWidth
  const known = new Set(app.chats.map((c) => c.id))
  app.tabs = (state.tabs ?? [])
    .map((t) => ({ ...t, panes: t.panes.filter((id) => known.has(id)) }))
    .filter((t) => t.panes.length > 0)
  const active = state.active && known.has(state.active) ? state.active : app.tabs[0]?.panes[0]
  // Abre na tela inicial; as abas restauradas ficam no topo, a um clique.
  app.active = active ?? null
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
  app.tasks = app.tasks.filter((t) => t.projectId !== id)
  app.projects = app.projects.filter((p) => p.id !== id)
}

export function addGroup(projectId: string, name: string) {
  if (name.trim()) app.groups.push({ id: uid(), name: name.trim(), projectId })
}

export function renameGroup(id: string, name: string) {
  if (name.trim()) app.groups = app.groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g))
}

/** Ordem de urgência para resumir vários chats num ponto só (grupo recolhido, ícone da bandeja). */
const URGENCY: Status[] = ['waiting', 'error', 'running', 'done', 'idle']

export function mostUrgent(ids: string[]): Status | undefined {
  const statuses = ids.map((id) => app.status[id]).filter((s): s is Status => s !== undefined)
  return URGENCY.find((s) => statuses.includes(s))
}

/** Os chats do grupo voltam para a raiz do projeto. */
export function removeGroup(id: string) {
  app.chats = app.chats.map((c) => (c.groupId === id ? { ...c, groupId: undefined } : c))
  app.groups = app.groups.filter((g) => g.id !== id)
}

const DEFAULT_SETUP_FILES = '.env'

/** Copia os arquivos combinados (padrão .env) e roda o script do projeto no worktree novo. Falha não impede o chat. */
async function prepareWorktree(project: Project, dir: string) {
  const files = (project.setupFiles ?? DEFAULT_SETUP_FILES).split(',').map((f) => f.trim()).filter(Boolean)
  const command = project.setupCommand?.trim() ?? ''
  if (files.length === 0 && !command) return
  const id = command ? toast({ tone: 'info', title: 'Preparando worktree…', text: command }) : undefined
  try {
    const note = await invoke<string>('worktree_setup', { dir, root: project.path, files, command })
    if (command) toast({ tone: 'success', title: 'Worktree pronto', text: note.trim().split('\n').slice(-3).join('\n') || undefined })
  } catch (e) {
    fail('Preparação do worktree falhou (o chat abre mesmo assim)', e)
  } finally {
    if (id) dismiss(id)
  }
}

/** `> comando` na paleta: abre um shell ao lado do chat em foco (na pasta dele) e roda o comando. */
export function runInShell(command: string) {
  const source = app.active ? chatById(app.active) : undefined
  const projectId = source?.projectId ?? app.projects[0]?.id
  const shell = app.profiles.find((p) => !p.command.trim())
  if (!projectId || !shell || !command.trim()) return fail('Shell', 'abra um projeto e tenha um perfil de shell em Configurações → Agentes')
  const chat: Chat = {
    id: uid(),
    name: `$ ${command.trim().slice(0, 30)}`,
    profileId: shell.id,
    projectId,
    groupId: source?.groupId,
    cwd: source?.cwd,
    branch: source?.branch,
  }
  app.chats.push(chat)
  app.pendingPrompt[chat.id] = command.trim()
  if (source && isOpen(source.id)) splitChat(chat.id)
  else openChat(chat.id)
}

/** Abre um shell ao lado do chat, na mesma pasta, rodando o comando do projeto (`{port}` = porta livre). */
export async function runProject(sourceId: string) {
  const source = chatById(sourceId)
  const project = source && projectOf(source)
  const shell = app.profiles.find((p) => !p.command.trim())
  if (!source || !project) return
  if (!shell) return fail('Rodar projeto', 'crie um perfil de shell (command vazio) em Configurações → Agentes')
  if (!project.runCommand?.trim()) {
    toast({ tone: 'info', title: 'Defina o comando para rodar o projeto', text: 'Ele roda assim que você salvar.' })
    app.pendingRun = source.id
    app.editingProject = project.id
    app.modal = 'project'
    return
  }
  openChat(source.id)
  const existing = app.chats.find((c) => c.runOf === source.id)
  if (existing) {
    // Fechado: o shell reabre vazio, então roda o comando de novo.
    if (!isOpen(existing.id)) app.pendingPrompt[existing.id] = project.runCommand.replaceAll('{port}', String(await invoke<number>('free_port')))
    return splitChat(existing.id)
  }
  try {
    const port = await invoke<number>('free_port')
    const chat: Chat = {
      id: uid(),
      name: `▶ ${source.name}`,
      profileId: shell.id,
      projectId: source.projectId,
      groupId: source.groupId,
      cwd: source.cwd,
      branch: source.branch,
      runOf: source.id,
    }
    app.chats.push(chat)
    app.pendingPrompt[chat.id] = project.runCommand.replaceAll('{port}', String(port))
    splitChat(chat.id)
  } catch (e) {
    fail('Não foi possível rodar o projeto', e)
  }
}

/** `worktree`: o chat ganha um git worktree e uma branch `kora/...` só dele. Devolve o id criado. */
export async function addChat(projectId: string, profileId: string, groupId?: string, worktree = false): Promise<string | undefined> {
  const profile = app.profiles.find((p) => p.id === profileId)
  const project = app.projects.find((p) => p.id === projectId)
  if (!profile || !project) return
  const taken = new Set(app.chats.map((c) => c.name))
  let n = 1
  while (taken.has(`${profile.name} ${n}`)) n += 1
  const chat: Chat = { id: uid(), name: `${profile.name} ${n}`, profileId, projectId, groupId }
  if (worktree) {
    try {
      const created = await invoke<{ path: string; branch: string }>('git_worktree_add', {
        project: project.path,
        name: `${chat.name}-${chat.id.slice(0, 6)}`,
      })
      chat.cwd = created.path
      chat.branch = created.branch
    } catch (e) {
      fail('Worktree não criado', e)
      return undefined
    }
    await prepareWorktree(project, chat.cwd)
  }
  app.chats.push(chat)
  openChat(chat.id)
  return chat.id
}

/** Arquivar fecha o painel (encerra o processo); desarquivar só devolve o chat à barra lateral. */
export async function archiveChat(id: string, archived: boolean) {
  if (archived && app.status[id] === 'running') {
    const ok = await ask('O agente está trabalhando. Arquivar encerra o processo agora.', { title: 'Arquivar chat', kind: 'warning' })
    if (!ok) return
  }
  if (archived) closePane(id)
  updateChat(id, { archived })
}

export function renameChat(id: string, name: string) {
  const next = name.trim()
  if (next) app.chats = app.chats.map((c) => (c.id === id && c.name !== next ? { ...c, name: next, namedByUser: true } : c))
}

export function moveChat(id: string, projectId: string, groupId?: string) {
  app.chats = app.chats.map((c) => (c.id === id ? { ...c, projectId, groupId } : c))
}

/** Com worktree, pergunta se apaga a pasta também (a branch sempre fica). */
export async function removeChat(id: string, confirm = true) {
  const chat = chatById(id)
  if (!chat) return
  const sure = !confirm || await ask(`Remover "${chat.name}" da barra lateral? O processo é encerrado; a conversa continua nos logs do agente.`, {
    title: 'Remover chat',
    kind: 'warning',
  })
  if (!sure) return
  closePane(id)
  // O shell de "rodar" deste chat usa a mesma pasta: sai junto.
  for (const run of app.chats.filter((c) => c.runOf === id)) closePane(run.id)
  app.chats = app.chats.filter((c) => c.id !== id && c.runOf !== id)
  delete app.pendingPrompt[id]
  delete app.touched[id]
  // O shell de "rodar" usa a pasta do chat, mas o worktree não é dele.
  if (!chat.cwd || chat.runOf) return
  const remove = await ask(`Apagar também o worktree em ${chat.cwd}? A branch ${chat.branch} continua no repositório.`, {
    title: 'Remover chat',
    kind: 'warning',
  })
  if (remove) invoke('git_worktree_remove', { project: projectOf(chat)?.path ?? chat.cwd, path: chat.cwd }).catch((e) => fail('Worktree mantido', e))
}

export const chatDir = (chat: Chat) => chat.cwd ?? projectOf(chat)?.path

/** "projeto / grupo" (cabeçalho de painel, uso por chat, título da janela). */
export function whereOf(chat: Chat): string {
  const project = app.projects.find((p) => p.id === chat.projectId)?.name ?? ''
  const group = app.groups.find((g) => g.id === chat.groupId)?.name
  return group ? `${project} / ${group}` : project
}

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
/** Chat na aba em foco (o resto está "fora da vista" e recebe avisos em toast). */
/** Na tela: a vista ativa, e no layout "1 painel" só o chat em foco. */
export const isVisible = (id: string) => {
  const tab = tabOf(id)
  return tab?.id === app.activeTab && (tab.layout !== 'single' || tab.panes.length === 1 || app.active === id)
}
export const openIds = () => app.tabs.flatMap((t) => t.panes)

export function focusChat(id: string) {
  const tab = tabOf(id)
  if (!tab) return
  app.activeTab = tab.id
  app.active = id
}

/** Abrir um chat arquivado (pela paleta, recentes, quadro…) o tira do arquivo. */
export function openChat(id: string) {
  if (!isOpen(id)) app.tabs.push({ id: uid(), panes: [id], vertical: false })
  updateChat(id, { lastActive: Date.now(), archived: false })
  focusChat(id)
}

// Mudou o número de painéis: os tamanhos arrastados deixam de valer (divisão igual).
const withoutPane = (tabs: Tab[], id: string) =>
  tabs
    .map((t) => (t.panes.includes(id) ? { ...t, panes: t.panes.filter((p) => p !== id), sizes: undefined } : t))
    .filter((t) => t.panes.length > 0)

/** Coloca o chat ao lado do que está em foco; se ele já estiver aberto em outra aba, move. */
export function splitChat(id: string) {
  const target = app.tabs.find((t) => t.id === app.activeTab)
  if (!target || target.panes.includes(id)) return openChat(id)
  app.tabs = withoutPane(app.tabs, id).map((t) => (t.id === target.id ? { ...t, panes: [...t.panes, id], sizes: undefined } : t))
  focusChat(id)
}

/** Tipo do arrastar de chats (barra lateral → área dos terminais, cabeçalho → outro painel). */
export const CHAT_DRAG = 'application/x-kora-chat'

/**
 * Soltar um chat na área dos terminais: entra na vista em foco, ao lado de `after` (ou no fim),
 * sem limite de painéis. Se já está na vista, só muda de lugar. Na tela inicial, abre sozinho.
 */
export function placeInView(id: string, after?: string) {
  if (!chatById(id)) return
  const target = app.tabs.find((t) => t.id === app.activeTab)
  if (!target) return openChat(id)
  const rest = target.panes.filter((p) => p !== id)
  const at = after && after !== id ? rest.indexOf(after) + 1 : rest.length
  const panes = [...rest.slice(0, at || rest.length), id, ...rest.slice(at || rest.length)]
  // "1 painel" mostraria só um: soltar outro chat é pedir lado a lado.
  const layout = target.layout === 'single' ? undefined : target.layout
  app.tabs = withoutPane(app.tabs, id)
    .filter((t) => t.id !== target.id)
    .concat({ ...target, panes, layout, sizes: undefined })
  app.activeTab = target.id
  updateChat(id, { lastActive: Date.now(), archived: false })
  focusChat(id)
}

/** Layout em uso: o escolhido, ou colunas até 3 chats e grade a partir de 4. */
export const layoutOf = (tab: Tab): Layout => tab.layout ?? (tab.panes.length > 3 ? 'grid' : 'columns')

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
  delete app.agentInfo[id]
  delete app.waitingSince[id]
  delete app.loopPaused[id]
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

/** Fechar encerra o processo: pergunta quando algum agente ainda trabalha ou espera você. */
export async function confirmStop(ids: string[]): Promise<boolean> {
  const busy = ids.filter((id) => app.status[id] === 'running' || app.status[id] === 'waiting').map((id) => chatById(id)?.name ?? 'chat')
  if (busy.length === 0) return true
  const who = busy.join(', ')
  return ask(`${who} ${busy.length === 1 ? 'ainda está' : 'ainda estão'} trabalhando. Fechar encerra o processo agora.`, {
    title: 'Fechar chat',
    kind: 'warning',
  })
}

export async function requestClosePane(id: string) {
  if (await confirmStop([id])) closePane(id)
}

export async function requestCloseTab(tabId: string) {
  const tab = app.tabs.find((t) => t.id === tabId)
  if (tab && (await confirmStop(tab.panes))) closeTab(tabId)
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

export function setLayout(layout: Layout) {
  app.tabs = app.tabs.map((t) => (t.id === app.activeTab ? { ...t, layout, sizes: undefined } : t))
}

/**
 * "Fechar painel" não encerra o chat: numa vista com vários, ele sai da divisão e segue rodando
 * numa vista própria (a um clique na barra lateral); sozinho, volta para a tela inicial.
 */
export function hidePane(id: string) {
  const tab = tabOf(id)
  if (!tab) return
  if (tab.panes.length === 1) {
    app.activeTab = null
    return
  }
  const rest = tab.panes.filter((p) => p !== id)
  app.tabs = [...withoutPane(app.tabs, id), { id: uid(), panes: [id], vertical: false }]
  focusChat(rest[0])
}

/** Os chats de um grupo, lado a lado; os fechados abrem junto, os arquivados ficam de fora (breadcrumb e menu do grupo). */
export function showSideBySide(ids: string[]) {
  const open = ids.filter((id) => app.chats.some((c) => c.id === id && !c.archived))
  if (open.length < 2) return open[0] && openChat(open[0])
  app.tabs = [...app.tabs.filter((t) => !t.panes.every((p) => open.includes(p))).map((t) => ({ ...t, panes: t.panes.filter((p) => !open.includes(p)), sizes: undefined })).filter((t) => t.panes.length > 0), { id: uid(), panes: open, vertical: false, layout: 'columns' }]
  app.activeTab = app.tabs.at(-1)?.id ?? null
  app.active = open[0]
}

/** O chat que espera você há mais tempo (rodapé da barra lateral, Ctrl+Shift+J, clique na bandeja). */
export function goToWaiting() {
  const oldest = Object.entries(app.waitingSince).sort((a, b) => a[1] - b[1])[0]?.[0]
  if (oldest && chatById(oldest)) openChat(oldest)
}

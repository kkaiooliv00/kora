import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'

export type Status = 'idle' | 'running' | 'waiting' | 'done' | 'error'

export interface Profile {
  id: string
  name: string
  /** Linha de comando; vazio abre só o shell. */
  command: string
  /** 'claude' liga o status preciso via hooks. */
  hooks?: 'claude'
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
}
export interface Settings {
  fontFamily: string
  fontSize: number
  theme: string
  /** Caminho do navegador; vazio procura o Chrome. */
  browser: string
}

export const STATUS: Record<Status, { label: string; color: string }> = {
  running: { label: 'rodando', color: '#4cc38a' },
  waiting: { label: 'aguardando você', color: '#f2b84b' },
  idle: { label: 'pronto', color: '#8a90a0' },
  done: { label: 'finalizado', color: '#5b8def' },
  error: { label: 'erro', color: '#e5484d' },
}

const DEFAULT_PROFILES: Profile[] = [
  { id: 'claude', name: 'Claude', command: 'claude', hooks: 'claude' },
  { id: 'codex', name: 'Codex', command: 'codex' },
  { id: 'gemini', name: 'Gemini', command: 'gemini' },
  { id: 'grok', name: 'Grok', command: 'grok' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode' },
  { id: 'shell', name: 'Shell', command: '' },
]

const DEFAULT_SETTINGS: Settings = {
  fontFamily: '"Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace',
  fontSize: 14,
  theme: 'Grafite',
  browser: '',
}

export const app = $state({
  profiles: DEFAULT_PROFILES,
  settings: DEFAULT_SETTINGS,
  projects: [] as Project[],
  groups: [] as Group[],
  chats: [] as Chat[],
  open: [] as string[],
  active: null as string | null,
  status: {} as Record<string, Status>,
  showSettings: false,
  error: '',
})

const uid = () => crypto.randomUUID()

export function fail(context: string, e: unknown) {
  app.error = `${context}: ${e}`
}

/** false = arquivo ilegível; nesse caso não salvamos para não sobrescrever os dados. */
export async function load(): Promise<boolean> {
  try {
    const [config, state] = await Promise.all([
      invoke<Partial<{ profiles: Profile[]; settings: Settings }> | null>('load_json', { name: 'config' }),
      invoke<Partial<{ projects: Project[]; groups: Group[]; chats: Chat[] }> | null>('load_json', { name: 'state' }),
    ])
    app.profiles = config?.profiles ?? DEFAULT_PROFILES
    app.settings = { ...DEFAULT_SETTINGS, ...config?.settings }
    app.projects = state?.projects ?? []
    app.groups = state?.groups ?? []
    app.chats = state?.chats ?? []
    return true
  } catch (e) {
    fail('Configuração não carregada (nada será salvo até corrigir)', e)
    return false
  }
}

export function save(config: unknown, state: unknown) {
  invoke('save_json', { name: 'config', value: config }).catch((e) => fail('Falha ao salvar configuração', e))
  invoke('save_json', { name: 'state', value: state }).catch((e) => fail('Falha ao salvar projetos', e))
}

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
  app.chats.filter((c) => c.projectId === id).forEach((c) => closeTab(c.id))
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

export function addChat(projectId: string, profileId: string, groupId?: string) {
  const profile = app.profiles.find((p) => p.id === profileId)
  if (!profile) return
  const count = app.chats.filter((c) => c.projectId === projectId && c.profileId === profileId).length
  const chat: Chat = { id: uid(), name: `${profile.name} ${count + 1}`, profileId, projectId, groupId }
  app.chats.push(chat)
  openChat(chat.id)
}

export function renameChat(id: string, name: string) {
  if (name.trim()) app.chats = app.chats.map((c) => (c.id === id ? { ...c, name: name.trim() } : c))
}

export function moveChat(id: string, projectId: string, groupId?: string) {
  app.chats = app.chats.map((c) => (c.id === id ? { ...c, projectId, groupId } : c))
}

export function removeChat(id: string) {
  closeTab(id)
  app.chats = app.chats.filter((c) => c.id !== id)
}

export function openChat(id: string) {
  if (!app.open.includes(id)) app.open.push(id)
  app.active = id
}

/** Fechar a aba encerra o processo; o chat continua na árvore. */
export function closeTab(id: string) {
  app.open = app.open.filter((x) => x !== id)
  delete app.status[id]
  if (app.active === id) app.active = app.open.at(-1) ?? null
}

export function setStatus(id: string, status: Status) {
  if (app.status[id] !== status) app.status[id] = status
}

export async function notify(title: string, body: string) {
  try {
    const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
    if (granted) sendNotification({ title, body })
  } catch (e) {
    fail('Falha ao notificar', e)
  }
}

/** Status vindo dos hooks do Claude Code; notifica se o chat não está à vista. */
export function onHookStatus(id: string, status: Status) {
  if (!app.open.includes(id)) return
  const previous = app.status[id]
  setStatus(id, status)
  const chat = app.chats.find((c) => c.id === id)
  const unseen = !document.hasFocus() || app.active !== id
  if (!chat || !unseen) return
  if (status === 'waiting') notify(chat.name, 'Aguardando sua interação')
  else if (status === 'idle' && previous === 'running') notify(chat.name, 'Terminou')
}

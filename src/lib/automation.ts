import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import {
  app,
  chatById,
  chatDir,
  fail,
  isOpen,
  isVisible,
  openChat,
  projectOf,
  updateChat,
  type Chat,
  type HookDetail,
  type Snippet,
  type Status,
} from './state.svelte'
import { terminals } from './terminals'
import { splitCommand } from './command'
import { onQueueStatus } from './queue'
import { onTaskStatus } from './work'
import { toast } from './toasts.svelte'

export function setStatus(id: string, status: Status) {
  const previous = app.status[id]
  if (previous === status) return
  app.status[id] = status
  if (status === 'waiting') app.waitingSince[id] = Date.now()
  else delete app.waitingSince[id]
  onQueueStatus(id, previous, status)
  onTaskStatus(id, previous, status)
}

export { broadcast, enqueue, dequeue } from './queue'

/** Snippets globais + os do projeto do chat em foco. */
export function activeSnippets(): Snippet[] {
  const chat = app.active ? chatById(app.active) : undefined
  const project = chat ? projectOf(chat)?.name : undefined
  return app.settings.snippets.filter((s) => !s.project || s.project === project)
}

/** Campos `{nome}` de um snippet, na ordem em que aparecem, sem repetir. */
// Só nomes (letras, números, _, espaço, -): `{ return 1 }` e JSON não viram campo.
const FIELD = /\{([\p{L}_][\p{L}\p{N}_ -]{0,39})\}/gu

export function templateFields(text: string): string[] {
  return [...new Set([...text.matchAll(FIELD)].map((m) => m[1].trim()))].filter(Boolean)
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(FIELD, (whole, name: string) => (Object.hasOwn(values, name.trim()) ? values[name.trim()] : whole))
}

/** Cola o snippet no chat em foco; se tiver campos `{nome}`, pergunta os valores antes. */
export function pasteSnippet(text: string) {
  const terminal = app.active ? terminals.get(app.active) : undefined
  if (!terminal) return fail('Snippet', 'abra um chat primeiro')
  if (templateFields(text).length > 0) {
    app.template = text
    app.modal = 'template'
    return
  }
  terminal.paste(text)
}

export function openInEditor(path: string | undefined) {
  if (!path) return fail('Editor', 'abra um chat ou escolha um projeto')
  const [program, ...args] = splitCommand(app.settings.editor)
  if (!program) return fail('Editor', 'defina o comando do editor em Configurações')
  invoke('open_in_editor', { program, args, path }).catch((e) => fail('Editor', e))
}

export function openActiveInEditor() {
  const chat = app.active ? chatById(app.active) : undefined
  openInEditor(chat ? chatDir(chat) : app.projects[0]?.path)
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
export function onHookStatus(id: string, status: Status, session: string | null, detail: HookDetail | null) {
  if (!isOpen(id)) return
  const previous = app.status[id]
  // Aviso de ociosidade do Claude depois de terminar: o chat continua pronto, não esperando você.
  const idleNotice = detail?.event === 'Notification' && !PERMISSION_MESSAGE.test(detail.message ?? '')
  if (idleNotice && (previous === 'idle' || previous === 'done' || previous === undefined)) return
  setStatus(id, status)
  const chat = chatById(id)
  if (chat && session && chat.sessionId !== session) updateChat(id, { sessionId: session })
  updateAgentInfo(id, status, detail)
  if (!chat) return
  if (detail?.file) noteTouched(chat, detail.file)
  if (detail?.event === 'PreToolUse') watchLoop(chat, detail)
  const finished = status === 'idle' && (previous === 'running' || previous === 'waiting')
  // Janela fora de foco: notificação do sistema. Janela em foco, chat em outra aba: toast.
  if (!document.hasFocus()) {
    if (status === 'waiting') notify(chat.name, 'Aguardando sua interação')
    else if (finished) notify(chat.name, 'Terminou')
  } else if (!isVisible(id) && status === 'waiting') {
    toast({
      tone: 'warning',
      title: `${chat.name} aguarda você`,
      text: detail?.message ?? 'O agente parou esperando uma resposta sua.',
      actions: [{ label: 'Ir para o chat', primary: true, run: () => openChat(id) }],
    })
  }
}

/** Caminho relativo à pasta do chat, com `/`; worktrees diferentes comparam pelo mesmo caminho. */
export function relativeTo(dir: string | undefined, file: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const path = norm(file)
  const base = dir ? norm(dir) : ''
  return base && path.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? path.slice(base.length + 1) : path
}

/** Outros chats abertos do mesmo projeto que editaram o mesmo arquivo. */
export function sharedWith(chat: Chat, path: string): Chat[] {
  return app.chats.filter((c) => c.id !== chat.id && c.projectId === chat.projectId && isOpen(c.id) && app.touched[c.id]?.includes(path))
}

const warnedConflicts = new Set<string>()

function noteTouched(chat: Chat, file: string) {
  const path = relativeTo(chatDir(chat), file)
  const list = app.touched[chat.id] ?? []
  if (list.includes(path)) return
  app.touched[chat.id] = [...list, path]
  for (const other of sharedWith(chat, path)) {
    const key = [chat.id, other.id].sort().join(':') + path
    if (warnedConflicts.has(key)) continue
    warnedConflicts.add(key)
    toast({
      tone: 'warning',
      title: `${chat.name} e ${other.name} editaram o mesmo arquivo`,
      text: `${path}: pode dar conflito no merge.`,
      actions: [{ label: 'Ver mudanças', primary: true, run: () => (openChat(chat.id), (app.modal = 'diff')) }],
    })
  }
}

const PERMISSION_MESSAGE = /permission/i

// ---- anti-loop por chat: o mesmo comando várias vezes sem mudar nenhum arquivo ----

const ESC = '\x1b'
/** Comandos recentes do Bash por chat; editar um arquivo zera (o agente está avançando). */
const recentCommands = new Map<string, { command: string; at: number }[]>()

function watchLoop(chat: Chat, detail: HookDetail) {
  if (detail.file) return void recentCommands.delete(chat.id)
  if (!detail.command || app.loopPaused[chat.id]) return
  const { repeats, minutes } = app.settings.loop
  const since = Date.now() - minutes * 60_000
  const list = [...(recentCommands.get(chat.id) ?? []).filter((c) => c.at >= since), { command: detail.command, at: Date.now() }]
  recentCommands.set(chat.id, list)
  const same = list.filter((c) => c.command === detail.command)
  if (repeats < 2 || same.length < repeats) return
  // Esc interrompe o agente no meio; ele espera a sua resposta no próprio chat.
  terminals.get(chat.id)?.keys(ESC)
  app.loopPaused[chat.id] = { command: detail.command, count: same.length, from: same[0].at, to: same.at(-1)!.at }
  recentCommands.delete(chat.id)
  if (!isVisible(chat.id)) {
    toast({
      tone: 'warning',
      title: `${chat.name} pausado pelo anti-loop`,
      text: `Repetiu "${detail.command}" ${same.length} vezes sem mudar arquivos.`,
      actions: [{ label: 'Ir para o chat', primary: true, run: () => openChat(chat.id) }],
    })
  }
}

/** Retoma um chat pausado pelo anti-loop: como está ("continue") ou com uma instrução sua. */
export function resumeLoop(id: string, instruction?: string) {
  delete app.loopPaused[id]
  noteHumanInput()
  terminals.get(id)?.submit(instruction?.trim() || 'Continue de onde parou, mas não repita o mesmo comando sem mudar algo antes.')
}

export const resumeAllLoops = () => Object.keys(app.loopPaused).forEach((id) => resumeLoop(id))

/** Você respondeu direto no terminal: o cartão de aprovação some (senão ficaria até o próximo hook). */
export function clearPermission(id: string) {
  if (app.agentInfo[id]?.permission) app.agentInfo[id] = { ...app.agentInfo[id], permission: undefined }
}

/** Plano, contexto e pedido de permissão do painel; a permissão some quando o agente volta a andar. */
function updateAgentInfo(id: string, status: Status, detail: HookDetail | null) {
  const info = { ...app.agentInfo[id] }
  if (detail?.todos) info.todos = detail.todos
  if (detail?.context) info.context = detail.context
  if (detail?.event === 'PreToolUse' && detail.tool) {
    info.pending = { tool: detail.tool, command: detail.command, reason: detail.reason, target: detail.target, file: detail.file }
  }
  if (detail?.event === 'Notification' && detail.message && PERMISSION_MESSAGE.test(detail.message)) info.permission = detail.message
  else if (status !== 'waiting') info.permission = undefined
  app.agentInfo[id] = info
}

/** Mensagens entre agentes sem você digitar nada; acima disso o Kora pausa as entregas. */
export const AGENT_MESSAGE_LIMIT = 20

/** Você digitou num terminal: o contador anti-loop zera. */
export function noteHumanInput() {
  if (app.agentMessages > 0) app.agentMessages = 0
}

export function resumeAgents() {
  app.agentMessages = 0
  app.agentsPaused = false
}

/** Conta uma mensagem entre agentes; false = limite atingido (entregas pausadas). */
export function admitAgentMessage(): boolean {
  if (app.agentsPaused) return false
  app.agentMessages += 1
  if (app.agentMessages <= AGENT_MESSAGE_LIMIT) return true
  app.agentsPaused = true
  notify('Kora', `Agentes pausados: ${AGENT_MESSAGE_LIMIT} mensagens entre eles sem você interagir.`)
  return false
}

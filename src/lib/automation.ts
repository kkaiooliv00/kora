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
  type HookDetail,
  type Snippet,
  type Status,
} from './state.svelte'
import { terminals } from './terminals'
import { splitCommand } from './command'
import { onQueueStatus } from './queue'
import { toast } from './toasts.svelte'

export function setStatus(id: string, status: Status) {
  const previous = app.status[id]
  if (previous === status) return
  app.status[id] = status
  onQueueStatus(id, previous, status)
}

export { broadcast, enqueue, dequeue } from './queue'

/** Snippets globais + os do projeto do chat em foco. */
export function activeSnippets(): Snippet[] {
  const chat = app.active ? chatById(app.active) : undefined
  const project = chat ? projectOf(chat)?.name : undefined
  return app.settings.snippets.filter((s) => !s.project || s.project === project)
}

export function pasteSnippet(text: string) {
  const terminal = app.active ? terminals.get(app.active) : undefined
  if (!terminal) return fail('Snippet', 'abra um chat primeiro')
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
  setStatus(id, status)
  const chat = chatById(id)
  if (chat && session && chat.sessionId !== session) updateChat(id, { sessionId: session })
  updateAgentInfo(id, status, detail)
  if (!chat) return
  const finished = status === 'idle' && previous === 'running'
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

const PERMISSION_MESSAGE = /permission/i

/** Você respondeu direto no terminal: o cartão de aprovação some (senão ficaria até o próximo hook). */
export function clearPermission(id: string) {
  if (app.agentInfo[id]?.permission) app.agentInfo[id] = { ...app.agentInfo[id], permission: undefined }
}

/** Plano, contexto e pedido de permissão do painel; a permissão some quando o agente volta a andar. */
function updateAgentInfo(id: string, status: Status, detail: HookDetail | null) {
  const info = { ...app.agentInfo[id] }
  if (detail?.todos) info.todos = detail.todos
  if (detail?.context) info.context = detail.context
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

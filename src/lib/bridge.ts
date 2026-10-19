import { invoke } from '@tauri-apps/api/core'
import { app, chatById, isOpen, projectOf, type Chat } from './state.svelte'
import { terminals } from './terminals'
import { AGENT_MESSAGE_LIMIT, admitAgentMessage } from './automation'

/** Pedido do `kora-cli` (via API local). `body` = "<chat>\n<resto>". */
export interface CliRequest {
  id: number
  kind: 'list' | 'send' | 'read' | 'status'
  body: string
  from: string | null
}

const MAX_READ_LINES = 2000
const SHORT_ID = 8

/** Nome exato, começo do id ou começo único do nome (sem diferenciar maiúsculas). */
export function findChat(target: string): Chat {
  const query = target.trim().toLowerCase()
  if (!query) throw new Error('informe o chat (nome ou id; veja kora-cli list)')
  const byName = app.chats.filter((c) => c.name.toLowerCase() === query)
  if (byName.length === 1) return byName[0]
  const candidates = app.chats.filter((c) => c.id.startsWith(query) || c.name.toLowerCase().startsWith(query))
  if (candidates.length === 1) return candidates[0]
  if (candidates.length === 0) throw new Error(`chat "${target}" não encontrado (veja kora-cli list)`)
  throw new Error(`"${target}" é ambíguo: ${candidates.map((c) => `${c.name} (${c.id.slice(0, SHORT_ID)})`).join(', ')}`)
}

function openTerminal(chat: Chat) {
  const terminal = terminals.get(chat.id)
  if (!terminal) throw new Error(`"${chat.name}" está fechado no Kora; peça ao usuário para abri-lo`)
  return terminal
}

function list(from: string | null): string {
  return app.chats
    .map((c) => {
      const status = isOpen(c.id) ? (app.status[c.id] ?? 'idle') : 'closed'
      const me = c.id === from ? ' (você)' : ''
      return `${c.id.slice(0, SHORT_ID)}  ${status.padEnd(8)}  ${c.name}${me}  [${projectOf(c)?.name ?? ''}]`
    })
    .join('\n')
}

/**
 * A mensagem vira uma linha de texto puro: quebras de linha viram espaço e os demais
 * caracteres de controle (ESC incluso) somem. Sem isso, um `ESC[201~` fecharia o
 * bracketed paste e o resto viraria teclas cruas no outro chat (ex.: aprovar permissões).
 */
export function sanitizeMessage(text: string): string {
  return text
    .replace(/\r\n|\r|\n|\t/g, ' ')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .trim()
}

function send(target: string, raw: string, from: string | null): string {
  const chat = findChat(target)
  const text = sanitizeMessage(raw)
  if (!text) throw new Error('mensagem vazia')
  if (chat.id === from) throw new Error('não dá para mandar mensagem para você mesmo')
  const profile = app.profiles.find((p) => p.id === chat.profileId)
  if (!profile?.command.trim()) throw new Error(`"${chat.name}" é um shell, não um agente; mensagens só vão para chats de IA`)
  const terminal = openTerminal(chat)
  if (!admitAgentMessage()) {
    throw new Error(
      `entregas pausadas: ${AGENT_MESSAGE_LIMIT} mensagens entre agentes sem interação humana. Peça ao usuário para liberar no Kora.`,
    )
  }
  const sender = from ? chatById(from)?.name : undefined
  terminal.submit(`[mensagem de ${sender ?? 'outro processo'}] ${text}`)
  return `enviado para ${chat.name}`
}

function read(target: string, lines: string): string {
  const chat = findChat(target)
  const count = Math.min(MAX_READ_LINES, Math.max(1, Number.parseInt(lines, 10) || 80))
  return openTerminal(chat).read(count)
}

function status(target: string): string {
  const chat = findChat(target)
  return isOpen(chat.id) ? (app.status[chat.id] ?? 'idle') : 'closed'
}

function run(request: CliRequest): string {
  const newline = request.body.indexOf('\n')
  const target = newline === -1 ? request.body : request.body.slice(0, newline)
  const rest = newline === -1 ? '' : request.body.slice(newline + 1)
  switch (request.kind) {
    case 'list':
      return list(request.from)
    case 'send':
      return send(target, rest, request.from)
    case 'read':
      return read(target, rest)
    case 'status':
      return status(target)
  }
}

export function handleCli(request: CliRequest) {
  let reply: { ok: boolean; text: string }
  try {
    reply = { ok: true, text: run(request) }
  } catch (e) {
    reply = { ok: false, text: e instanceof Error ? e.message : String(e) }
  }
  invoke('cli_reply', { id: request.id, ...reply }).catch((e) => {
    app.error = `kora-cli: ${e}`
  })
}

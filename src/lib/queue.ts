import { app, chatById, focusChat, isVisible, type Status } from './state.svelte'
import { terminals } from './terminals'
import { toast } from './toasts.svelte'

/** Fila de um chat: o que já foi, o que está rodando e o que vem depois. */
export interface Queue {
  pending: string[]
  sent: string[]
  /** Prompt enviado que o agente ainda está processando. */
  current?: string
  paused: boolean
  /** Pausa se o agente sair com erro. */
  pauseOnError: boolean
  /** Pergunta antes de cada envio (aviso com "Enviar"). */
  confirm: boolean
}

const EMPTY: Queue = { pending: [], sent: [], paused: false, pauseOnError: true, confirm: false }

export const queueOf = (id: string): Queue => app.queue[id] ?? EMPTY
const update = (id: string, patch: Partial<Queue>) => (app.queue[id] = { ...queueOf(id), ...patch })

function submitNext(id: string) {
  const queue = queueOf(id)
  const [next, ...rest] = queue.pending
  const terminal = terminals.get(id)
  if (next === undefined || !terminal) return
  update(id, { pending: rest, current: next, sent: [...queue.sent, ...(queue.current ? [queue.current] : [])] })
  terminal.submit(next)
  if (!isVisible(id)) {
    const name = chatById(id)?.name ?? 'chat'
    toast({
      tone: 'info',
      title: `Fila de ${name}: prompt ${queue.sent.length + (queue.current ? 2 : 1)} enviado`,
      text: rest.length ? `${rest.length} ${rest.length === 1 ? 'prompt restante' : 'prompts restantes'}.` : 'Era o último da fila.',
    })
  }
}

/** Manda o próximo, respeitando pausa e confirmação. */
export function sendNext(id: string) {
  const queue = queueOf(id)
  if (queue.paused || queue.pending.length === 0) return
  if (!queue.confirm) return submitNext(id)
  const name = chatById(id)?.name ?? 'chat'
  toast({
    tone: 'warning',
    title: `${name} terminou`,
    text: `Próximo da fila: ${queue.pending[0]}`,
    actions: [
      { label: 'Enviar', primary: true, run: () => submitNext(id) },
      { label: 'Pausar fila', run: () => update(id, { paused: true }) },
    ],
  })
}

/** Chamado quando o status muda; a fila anda quando o agente termina o que estava fazendo. */
export function onQueueStatus(id: string, previous: Status | undefined, status: Status) {
  const queue = app.queue[id]
  if (!queue) return
  if (status === 'idle' && previous === 'running') {
    if (queue.current) update(id, { current: undefined, sent: [...queue.sent, queue.current] })
    sendNext(id)
  } else if (status === 'error' && queue.pauseOnError && queue.pending.length > 0) {
    update(id, { paused: true })
    toast({ tone: 'warning', title: `Fila de ${chatById(id)?.name ?? 'chat'} pausada`, text: 'O agente saiu com erro.' })
  }
}

/** Enfileira; se o agente já está parado, envia na hora. */
export function enqueue(id: string, text: string) {
  if (!text.trim()) return
  update(id, { pending: [...queueOf(id).pending, text.trim()] })
  if (app.status[id] === 'idle' && !queueOf(id).current) sendNext(id)
}

export const dequeue = (id: string, index: number) => update(id, { pending: queueOf(id).pending.filter((_, i) => i !== index) })
export const clearQueue = (id: string) => update(id, { pending: [] })
export const setQueueOption = (id: string, patch: Pick<Partial<Queue>, 'paused' | 'pauseOnError' | 'confirm'>) => {
  update(id, patch)
  if (patch.paused === false && app.status[id] === 'idle' && !queueOf(id).current) sendNext(id)
}

/** Arrastar para reordenar os pendentes. */
export function moveQueued(id: string, from: number, to: number) {
  const pending = [...queueOf(id).pending]
  const [item] = pending.splice(from, 1)
  if (item === undefined) return
  pending.splice(to, 0, item)
  update(id, { pending })
}

/** Broadcast: chat livre recebe na hora; ocupado vai para a fila. */
export function broadcast(text: string, ids: string[]): { sent: number; queued: number } {
  if (!text.trim()) return { sent: 0, queued: 0 }
  let sent = 0
  let queued = 0
  for (const id of ids) {
    const busy = app.status[id] === 'running' || app.status[id] === 'waiting'
    if (busy) {
      update(id, { pending: [...queueOf(id).pending, text.trim()] })
      queued += 1
    } else if (terminals.get(id)) {
      terminals.get(id)?.submit(text.trim())
      sent += 1
    }
  }
  return { sent, queued }
}

export const goTo = (id: string) => focusChat(id)

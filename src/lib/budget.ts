import { invoke } from '@tauri-apps/api/core'
import { app, openChat, whereOf } from './state.svelte'
import { setQueueOption } from './queue'
import { toast } from './toasts.svelte'
import { between, byChat, startOfDay, type UsageRow } from './usage'

/** Confere os limites diários de tokens (entrada + saída) a cada poucos minutos. */
const CHECK_MS = 5 * 60_000
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
/** Avisos já dados hoje (chave: dia + chat/projeto), para não repetir a cada leitura. */
const warned = new Set<string>()

export async function checkBudget() {
  const { chatTokens, projectTokens } = app.settings.budget
  if (!chatTokens && !projectTokens) return
  let rows: UsageRow[]
  try {
    rows = (await invoke<{ rows: UsageRow[] }>('usage_summary', { days: 1 })).rows
  } catch {
    return
  }
  const today = between(rows, startOfDay(0), Date.now() + 1)
  const day = new Date().toDateString()
  const usage = byChat(today, app.chats, whereOf)
  const chats = new Map(app.chats.map((c) => [c.id, c]))

  for (const u of usage) {
    const chat = chats.get(u.key)
    if (!chat || !chatTokens || u.total < chatTokens || warned.has(`${day}:${chat.id}`)) continue
    warned.add(`${day}:${chat.id}`)
    setQueueOption(chat.id, { paused: true })
    toast({
      tone: 'danger',
      title: `${chat.name} passou do limite diário`,
      text: `${compact.format(u.total)} tokens hoje (limite ${compact.format(chatTokens)}). A fila do chat foi pausada.`,
      actions: [{ label: 'Ir para o chat', primary: true, run: () => openChat(chat.id) }],
    })
  }

  if (!projectTokens) return
  for (const project of app.projects) {
    const total = usage.filter((u) => chats.get(u.key)?.projectId === project.id).reduce((n, u) => n + u.total, 0)
    if (total < projectTokens || warned.has(`${day}:${project.id}`)) continue
    warned.add(`${day}:${project.id}`)
    for (const chat of app.chats.filter((c) => c.projectId === project.id)) setQueueOption(chat.id, { paused: true })
    toast({
      tone: 'danger',
      title: `${project.name} passou do limite diário`,
      text: `${compact.format(total)} tokens hoje nos chats do projeto (limite ${compact.format(projectTokens)}). As filas foram pausadas.`,
      actions: [{ label: 'Ver uso', primary: true, run: () => (app.modal = 'usage') }],
    })
  }
}

export function watchBudget(): () => void {
  const timer = setInterval(checkBudget, CHECK_MS)
  checkBudget()
  return () => clearInterval(timer)
}

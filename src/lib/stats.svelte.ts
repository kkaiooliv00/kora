import { invoke } from '@tauri-apps/api/core'
import { app, type AgentInfo } from './state.svelte'
import { terminals } from './terminals'
import { between, startOfDay, totalOf, type UsageRow } from './usage'

const POLL_MS = 3000

/** CPU (% da máquina) e memória (bytes) por chat aberto, somando os processos filhos. */
export const procStats = $state<Record<string, { cpu: number; memory: number }>>({})

/** Liga a leitura periódica; devolve a função que desliga. */
export function watchStats(): () => void {
  const tick = async () => {
    const byPty = new Map<number, string>()
    for (const [chat, handle] of terminals) {
      const id = handle.pty()
      if (id !== undefined) byPty.set(id, chat)
    }
    for (const key of Object.keys(procStats)) if (!terminals.has(key)) delete procStats[key]
    if (byPty.size === 0) return
    try {
      const result = await invoke<Record<string, { cpu: number; memory: number }>>('pty_stats', { ids: [...byPty.keys()] })
      for (const [pty, usage] of Object.entries(result)) {
        const chat = byPty.get(Number(pty))
        if (chat) procStats[chat] = usage
      }
    } catch {
      // Medidor é informativo: uma leitura perdida não merece aviso.
    }
  }
  const timer = setInterval(tick, POLL_MS)
  tick()
  return () => clearInterval(timer)
}

const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
/** "3,2%" (formato brasileiro, como o resto da interface). */
export const percent = (value: number) => `${pct.format(value)}%`

const mem = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
export const formatMemory = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${mem.format(bytes / 1024 ** 3)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

// Janela de contexto padrão do Claude; 1M na variante [1m], acima de 200k ou nos Opus que já vêm com 1M.
// ponytail: tabela por nome de modelo; o tamanho exato só chega no JSON da statusline, que é do usuário.
const DEFAULT_WINDOW = 200_000
const LARGE_WINDOW = 1_000_000
const LARGE_BY_DEFAULT = /\[1m\]|opus-(4-[6-9]|[5-9])/

export function contextWindow(info: AgentInfo | undefined): number {
  const context = info?.context
  return context && (context.tokens > DEFAULT_WINDOW || LARGE_BY_DEFAULT.test(context.model)) ? LARGE_WINDOW : DEFAULT_WINDOW
}

export function contextPercent(info: AgentInfo | undefined): number | undefined {
  if (!info?.context) return undefined
  return Math.min(100, Math.round((info.context.tokens / contextWindow(info)) * 100))
}

export const chatsOpen = () => app.chats.filter((c) => terminals.has(c.id))

// ---- uso de hoje (barra de status) ----

const USAGE_POLL_MS = 5 * 60_000
/** Tokens (entrada + saída) de hoje em todos os agentes, lidos dos logs locais. */
export const usageToday = $state({ tokens: 0 })
const tokens = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 })
export const formatTokens = (n: number) => tokens.format(n)

export function watchUsageToday(): () => void {
  const tick = async () => {
    try {
      const { rows } = await invoke<{ rows: UsageRow[] }>('usage_summary', { days: 1 })
      usageToday.tokens = between(rows, startOfDay(0), Date.now() + 1).reduce((n, r) => n + totalOf(r.tokens), 0)
    } catch {
      // Sem logs ainda: fica 0.
    }
  }
  const timer = setInterval(tick, USAGE_POLL_MS)
  tick()
  return () => clearInterval(timer)
}

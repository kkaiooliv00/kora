import type { Chat } from './state.svelte'

export interface Tokens {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

/** Linha do `usage_summary` (Rust): dia/hora em UTC, sessão = nome do arquivo de log. */
export interface UsageRow {
  day: string
  hour: number
  session: string
  source: 'claude' | 'codex'
  model: string
  project: string
  tokens: Tokens
}

export interface ChatUsage {
  key: string
  label: string
  where: string
  input: number
  output: number
  total: number
  last: number
}

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Momento (ms) do registro: o dia e a hora vêm em UTC. */
export const stampOf = (r: UsageRow) => Date.parse(`${r.day}T${String(r.hour).padStart(2, '0')}:00:00Z`)
export const totalOf = (t: Tokens) => t.input + t.output

/** Meia-noite local de `daysAgo` dias atrás. */
export function startOfDay(daysAgo: number, now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime() - daysAgo * DAY_MS
}

export const between = (rows: UsageRow[], from: number, to: number) =>
  rows.filter((r) => {
    const t = stampOf(r)
    return t >= from && t < to
  })

export function sum(rows: UsageRow[]): Tokens {
  return rows.reduce(
    (acc, r) => ({
      input: acc.input + r.tokens.input,
      output: acc.output + r.tokens.output,
      cacheWrite: acc.cacheWrite + r.tokens.cacheWrite,
      cacheRead: acc.cacheRead + r.tokens.cacheRead,
    }),
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
  )
}

/** Entrada + saída por intervalo (`buckets` fatias de `size` ms a partir de `from`). */
export function series(rows: UsageRow[], from: number, size: number, buckets: number): number[] {
  const out = Array.from({ length: buckets }, () => 0)
  for (const r of rows) {
    const i = Math.floor((stampOf(r) - from) / size)
    if (i >= 0 && i < buckets) out[i] += totalOf(r.tokens)
  }
  return out
}

/**
 * Uso por chat: o Claude grava cada conversa num arquivo com o id da sessão, que o Kora guarda no chat.
 * O que não bate com nenhum chat (Codex, sessões antigas) fica agrupado por agente e projeto.
 */
export function byChat(rows: UsageRow[], chats: Chat[], whereOf: (chat: Chat) => string): ChatUsage[] {
  const bySession = new Map(chats.filter((c) => c.sessionId).map((c) => [c.sessionId as string, c]))
  const groups = new Map<string, ChatUsage>()
  for (const r of rows) {
    const chat = bySession.get(r.session)
    const key = chat ? chat.id : `${r.source}:${r.project}`
    const label = chat ? chat.name : `${r.source} · outras sessões`
    const where = chat ? whereOf(chat) : r.project
    const current = groups.get(key) ?? { key, label, where, input: 0, output: 0, total: 0, last: 0 }
    current.input += r.tokens.input
    current.output += r.tokens.output
    current.total += totalOf(r.tokens)
    current.last = Math.max(current.last, stampOf(r) + HOUR_MS)
    groups.set(key, current)
  }
  return [...groups.values()].sort((a, b) => b.total - a.total)
}

export { DAY_MS, HOUR_MS }

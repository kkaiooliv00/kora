import { invoke } from '@tauri-apps/api/core'
import { app, type AgentInfo } from './state.svelte'
import { terminals } from './terminals'

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

export const formatMemory = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`

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

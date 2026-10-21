import { app, type AgentInfo } from './state.svelte'
import { CATEGORIES, type Policy } from './permissions'
import { terminals } from './terminals'

/**
 * Responde o pedido de permissão do Claude como se fosse no teclado:
 * Enter aceita a opção marcada (Sim), "2" escolhe "sim, e não perguntar de novo neste projeto", Esc recusa.
 */
const KEYS = { once: '\r', always: '2', refuse: '\x1b' } as const
export type Answer = keyof typeof KEYS

export const pendingApproval = (id: string) => app.status[id] === 'waiting' && Boolean(app.agentInfo[id]?.permission)

export function answer(id: string, kind: Answer) {
  if (!pendingApproval(id)) return
  terminals.get(id)?.keys(KEYS[kind])
  app.agentInfo[id] = { ...app.agentInfo[id], permission: undefined }
}

export type Risk = 'lê arquivos' | 'altera arquivos' | 'acessa a rede' | 'destrutivo' | 'roda comando'

const NETWORK = /\b(curl|wget|ssh|scp|rsync|git\s+(push|pull|fetch|clone)|npm\s+(i|install|publish)|pnpm\s+(add|install)|yarn\s+add|pip\s+install|docker|kubectl|gh\s)\b|https?:\/\//i
const DESTRUCTIVE = /\b(rm\s+-\w*[rf]|rmdir|del\s|Remove-Item|drop\s+(table|database)|truncate|git\s+(reset\s+--hard|clean\s+-\w*f|push\s+(-f|--force))|mkfs|format\s)/i
const WRITES = /\s>>?\s*\S|\b(mv|cp|touch|mkdir|sed\s+-i|tee|migrate|git\s+(commit|checkout|merge|rebase))\b/i

/** Selos do que o pedido faz, pelo tipo de ferramenta e pelo comando. */
export function risks(pending: AgentInfo['pending']): Risk[] {
  if (!pending) return []
  const { tool, command = '' } = pending
  if (['Read', 'Grep', 'Glob', 'LS'].includes(tool)) return ['lê arquivos']
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) return ['altera arquivos']
  if (['WebFetch', 'WebSearch'].includes(tool)) return ['acessa a rede']
  const found: Risk[] = []
  if (NETWORK.test(command)) found.push('acessa a rede')
  if (WRITES.test(command)) found.push('altera arquivos')
  if (DESTRUCTIVE.test(command)) found.push('destrutivo')
  return found.length ? found : ['roda comando']
}

export const RISK_TONE: Record<Risk, string> = {
  'lê arquivos': '',
  'altera arquivos': 'accent',
  'acessa a rede': 'warning',
  destrutivo: 'danger',
  'roda comando': '',
}

const POLICY_LABEL: Record<Policy, string> = { allow: 'Sempre', ask: 'Perguntar', deny: 'Nunca' }

/** "Rodar comandos" está em Perguntar: a regra que fez o Claude pedir. */
export function ruleOf(pending: AgentInfo['pending']): { label: string; policy: string } | undefined {
  const category = pending && CATEGORIES.find((c) => c.tools.includes(pending.tool))
  if (!category) return undefined
  return { label: category.label, policy: POLICY_LABEL[app.settings.permissions[category.key]] }
}

/** O que o agente quer fazer, numa linha: o comando, o arquivo ou o endereço. */
export const actionOf = (pending: AgentInfo['pending']) => pending?.command ?? pending?.file ?? pending?.target ?? pending?.tool ?? ''

/** Política por categoria, como na tela de permissões: Sempre / Perguntar / Nunca. */
export type Policy = 'allow' | 'ask' | 'deny'

export interface Permissions {
  read: Policy
  edit: Policy
  bash: Policy
  web: Policy
  /** Padrões de comando liberados mesmo com "Rodar comandos" em Perguntar (`npm test*`). */
  allowCommands: string[]
  /** Padrões de comando sempre bloqueados. */
  denyCommands: string[]
}

export const DEFAULT_PERMISSIONS: Permissions = {
  read: 'allow',
  edit: 'ask',
  bash: 'ask',
  web: 'ask',
  allowCommands: [],
  denyCommands: [],
}

export const CATEGORIES: { key: 'read' | 'edit' | 'bash' | 'web'; label: string; help: string; tools: string[] }[] = [
  { key: 'read', label: 'Ler arquivos', help: 'Arquivos dentro do diretório da sessão.', tools: ['Read', 'Grep', 'Glob', 'LS'] },
  { key: 'edit', label: 'Editar arquivos', help: 'Toda edição aparece no diff e pode ser desfeita.', tools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] },
  { key: 'bash', label: 'Rodar comandos', help: 'Qualquer comando no shell da sessão.', tools: ['Bash'] },
  { key: 'web', label: 'Acessar a internet', help: 'Buscar documentação e baixar páginas.', tools: ['WebFetch', 'WebSearch'] },
]

/** `npm test*` → `Bash(npm test:*)` (prefixo); sem `*` final, comando exato. */
export function bashRule(pattern: string): string {
  const trimmed = pattern.trim()
  return trimmed.endsWith('*') ? `Bash(${trimmed.slice(0, -1).trimEnd()}:*)` : `Bash(${trimmed})`
}

/** Regras no formato `permissions` do settings do Claude Code. */
export function claudePermissions(p: Permissions): { allow: string[]; ask: string[]; deny: string[] } {
  const byPolicy = (policy: Policy) => CATEGORIES.filter((c) => p[c.key] === policy).flatMap((c) => c.tools)
  const commands = (list: string[]) => list.filter((c) => c.trim()).map(bashRule)
  return {
    allow: [...byPolicy('allow'), ...commands(p.allowCommands)],
    ask: byPolicy('ask'),
    deny: [...byPolicy('deny'), ...commands(p.denyCommands)],
  }
}

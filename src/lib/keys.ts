/** Atalhos padrão; o usuário sobrescreve em Configurações. Evitam Ctrl+letra pura, que os TUIs usam. */
export const DEFAULT_KEYS: Record<string, string> = {
  palette: 'Ctrl+Shift+P',
  search: 'Ctrl+Shift+F',
  split: 'Ctrl+Shift+D',
  closePane: 'Ctrl+Shift+W',
  nextTab: 'Ctrl+Tab',
  prevTab: 'Ctrl+Shift+Tab',
  broadcast: 'Ctrl+Shift+B',
  queue: 'Ctrl+Shift+Q',
  editor: 'Ctrl+Shift+E',
  diff: 'Ctrl+Shift+G',
  usage: 'Ctrl+Shift+U',
  panel: 'Ctrl+Shift+L',
  settings: 'Ctrl+,',
}

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta']

const keyName = (key: string) => (key.length === 1 ? key.toUpperCase() : key)

/** Combinação do evento no formato `Ctrl+Shift+P`. */
export function comboOf(e: KeyboardEvent): string {
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta'].filter(Boolean)
  return [...mods, keyName(e.key)].join('+')
}

/** Normaliza o texto digitado pelo usuário (`shift+ctrl+p` → `Ctrl+Shift+P`). */
export function normalizeCombo(combo: string): string {
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean)
  const key = parts.pop() ?? ''
  const lower = parts.map((p) => p.toLowerCase())
  const mods = MODIFIERS.filter((m) => lower.includes(m.toLowerCase()))
  return [...mods, keyName(key)].join('+')
}

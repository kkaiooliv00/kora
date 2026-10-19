export type Tone = 'info' | 'success' | 'warning' | 'danger'

export interface ToastAction {
  label: string
  run: () => void
  primary?: boolean
}

export interface Toast {
  id: number
  tone: Tone
  title: string
  text?: string
  actions?: ToastAction[]
}

/** success/info somem em 5 s, warning em 8 s; danger só fecha pelo usuário (componente Toast do design). */
export const TOAST_DURATION: Record<Tone, number | null> = { info: 5000, success: 5000, warning: 8000, danger: null }
export const TOAST_GLYPH: Record<Tone, string> = { info: '›', success: '✓', warning: '!', danger: '✗' }
const MAX_TOASTS = 3

export const toastState = $state({ list: [] as Toast[] })
let nextId = 1

/** Mostra um aviso no canto inferior direito; o mais antigo sai quando passa de 3. */
export function toast(item: Omit<Toast, 'id'>): number {
  const id = nextId++
  toastState.list = [...toastState.list, { ...item, id }].slice(-MAX_TOASTS)
  return id
}

export function dismiss(id: number) {
  toastState.list = toastState.list.filter((t) => t.id !== id)
}

export interface MenuItem {
  label?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  /** Um nível de submenu, no máximo (regra do design). */
  submenu?: MenuItem[]
  run?: () => void
}

export const menuState = $state({ open: false, x: 0, y: 0, items: [] as MenuItem[] })

/** Abre o menu de contexto na posição do clique. */
export function openMenu(e: MouseEvent, items: MenuItem[]) {
  e.preventDefault()
  e.stopPropagation()
  menuState.items = items
  menuState.x = e.clientX
  menuState.y = e.clientY
  menuState.open = true
}

export function closeMenu() {
  menuState.open = false
}

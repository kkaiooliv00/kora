import type { ITheme } from '@xterm/xterm'

export const THEMES: Record<string, ITheme> = {
  Grafite: {
    background: '#16181d',
    foreground: '#d7dae0',
    cursor: '#f2b84b',
    selectionBackground: '#3a3f4b',
  },
  Dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#ff79c6',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
  },
  'Solarized Dark': {
    background: '#002b36',
    foreground: '#93a1a1',
    cursor: '#b58900',
    selectionBackground: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
  },
  Claro: {
    background: '#fafaf7',
    foreground: '#2b2b2b',
    cursor: '#1f6feb',
    selectionBackground: '#d0d7de',
    black: '#2b2b2b',
    red: '#c4262e',
    green: '#2f8132',
    yellow: '#946b00',
    blue: '#1f6feb',
    magenta: '#a23ab5',
    cyan: '#16808a',
    white: '#e5e5e0',
  },
}

export const themeOf = (name: string): ITheme => THEMES[name] ?? THEMES.Grafite

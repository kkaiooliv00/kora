import type { ITheme } from '@xterm/xterm'

/** Tema padrão: tokens do design (bg-000, ink, accent, petrol, success/warning/danger). */
const KORA: ITheme = {
  background: '#0a0e11',
  foreground: '#e2eaed',
  cursor: '#3cc8d4',
  cursorAccent: '#0a0e11',
  selectionBackground: '#0e4f5a',
  black: '#151d22',
  red: '#ff8a6b',
  green: '#7fd69b',
  yellow: '#e8b852',
  blue: '#6fa8dc',
  magenta: '#c79bd8',
  cyan: '#3cc8d4',
  white: '#93a3ab',
  brightBlack: '#748690',
  brightRed: '#ffb29c',
  brightGreen: '#a6e7b9',
  brightYellow: '#f2d08a',
  brightBlue: '#9cc6ec',
  brightMagenta: '#ddbde8',
  brightCyan: '#7fe0e8',
  brightWhite: '#e2eaed',
}

/** Monta um tema a partir das 16 cores ANSI na ordem black…white, brightBlack…brightWhite. */
function palette(background: string, foreground: string, cursor: string, selectionBackground: string, ansi: string): ITheme {
  const [black, red, green, yellow, blue, magenta, cyan, white, ...bright] = ansi.split(' ')
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] = bright
  return {
    background, foreground, cursor, cursorAccent: background, selectionBackground,
    black, red, green, yellow, blue, magenta, cyan, white,
    brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
  }
}

/** Temas do terminal. Os que têm entrada em UI_THEMES também mudam a interface; os outros mantêm a marca Kora. */
export const THEMES: Record<string, ITheme> = {
  Kora: KORA,
  // Tons quentes (areia, argila, papel): mudam a interface inteira.
  Areia: palette('#1a1918', '#ebe6df', '#d97757', '#4a3d33',
    '#2a2826 #e8735a #8fc28a #e0b45c #8fa8c8 #c49ac0 #8cbfb5 #a8a199 #6b645c #f2957e #a9d4a4 #ecc982 #aec2dc #d8b6d4 #a9d3ca #ebe6df'),
  Argila: palette('#15110f', '#f0e6dc', '#c8643c', '#4d3226',
    '#251f1b #e06a4a #8cbf7f #d9a94f #8aa0bf #c08fb4 #86b8a8 #b3a291 #75655a #ef8e72 #a8d39c #e6c27a #a9bcd6 #d4adca #a4cfc1 #f0e6dc'),
  Papel: palette('#faf8f4', '#2b2724', '#b85a35', '#e6d3c4',
    '#2b2724 #c0392b #2f7d3a #8f6400 #2f5f9a #8a3f8a #1f7a74 #d6cfc3 #7a7269 #d0503f #3d8f48 #a87700 #3d72b0 #a052a0 #2a8f88 #e9e4db'),
  // Fundo bg-100 (o da barra lateral): o terminal some na interface. ANSI puxado para azul/ciano.
  'Kora Azul': palette('#0f1519', '#e2eaed', '#3cc8d4', '#0e4f5a',
    '#1c262c #ff8a6b #7fd69b #e8b852 #5aa9e6 #a99cf0 #3cc8d4 #93a3ab #5a6d77 #ffb29c #a6e7b9 #f2d08a #8cc4f0 #c8bff7 #7fe0e8 #e2eaed'),
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
  // Paletas oficiais de cada projeto (portes para terminal).
  'One Dark': palette('#282c34', '#abb2bf', '#528bff', '#3e4451',
    '#3f4451 #e05561 #8cc265 #d18f52 #4aa5f0 #c162de #42b3c2 #d7dae0 #4f5666 #ff616e #a5e075 #f0a45d #4dc4ff #de73ff #4cd1e0 #e6e6e6'),
  'GitHub Dark': palette('#0d1117', '#e6edf3', '#2f81f7', '#264f78',
    '#484f58 #ff7b72 #3fb950 #d29922 #58a6ff #bc8cff #39c5cf #b1bac4 #6e7681 #ffa198 #56d364 #e3b341 #79c0ff #d2a8ff #56d4dd #ffffff'),
  'GitHub Light': palette('#ffffff', '#1f2328', '#0969da', '#add6ff',
    '#24292f #cf222e #116329 #4d2d00 #0969da #8250df #1b7c83 #6e7781 #57606a #a40e26 #1a7f37 #633c01 #218bff #a475f9 #3192aa #8c959f'),
  'Tokyo Night': palette('#1a1b26', '#c0caf5', '#c0caf5', '#33467c',
    '#15161e #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6 #414868 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #c0caf5'),
  'Catppuccin Mocha': palette('#1e1e2e', '#cdd6f4', '#f5e0dc', '#585b70',
    '#45475a #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #bac2de #585b70 #f38ba8 #a6e3a1 #f9e2af #89b4fa #f5c2e7 #94e2d5 #a6adc8'),
  'Catppuccin Latte': palette('#eff1f5', '#4c4f69', '#dc8a78', '#acb0be',
    '#5c5f77 #d20f39 #40a02b #df8e1d #1e66f5 #ea76cb #179299 #acb0be #6c6f85 #d20f39 #40a02b #df8e1d #1e66f5 #ea76cb #179299 #bcc0cc'),
  'Gruvbox Dark': palette('#282828', '#ebdbb2', '#ebdbb2', '#504945',
    '#282828 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #a89984 #928374 #fb4934 #b8bb26 #fabd2f #83a598 #d3869b #8ec07c #ebdbb2'),
  Nord: palette('#2e3440', '#d8dee9', '#d8dee9', '#434c5e',
    '#3b4252 #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #88c0d0 #e5e9f0 #4c566a #bf616a #a3be8c #ebcb8b #81a1c1 #b48ead #8fbcbb #eceff4'),
  'Monokai Pro': palette('#2d2a2e', '#fcfcfa', '#fcfcfa', '#5b595c',
    '#403e41 #ff6188 #a9dc76 #ffd866 #fc9867 #ab9df2 #78dce8 #fcfcfa #727072 #ff6188 #a9dc76 #ffd866 #fc9867 #ab9df2 #78dce8 #fcfcfa'),
  'Rosé Pine': palette('#191724', '#e0def4', '#524f67', '#403d52',
    '#26233a #eb6f92 #31748f #f6c177 #9ccfd8 #c4a7e7 #ebbcba #e0def4 #6e6a86 #eb6f92 #31748f #f6c177 #9ccfd8 #c4a7e7 #ebbcba #e0def4'),
  'Ayu Dark': palette('#0b0e14', '#bfbdb6', '#e6b450', '#273747',
    '#11151c #ea6c73 #7fd962 #f9af4f #53bdfa #cda1fa #90e1c6 #c7c7c7 #686868 #f07178 #aad94c #ffb454 #59c2ff #d2a6ff #95e6cb #ffffff'),
  'Ayu Mirage': palette('#1f2430', '#cccac2', '#ffcc66', '#33415e',
    '#171b24 #ed8274 #87d96c #facc6e #6dcbfa #dabafa #90e1c6 #c7c7c7 #686868 #f28779 #d5ff80 #ffd173 #73d0ff #dfbfff #95e6cb #ffffff'),
  'Solarized Light': palette('#fdf6e3', '#657b83', '#586e75', '#eee8d5',
    '#073642 #dc322f #859900 #b58900 #268bd2 #d33682 #2aa198 #eee8d5 #002b36 #cb4b16 #586e75 #657b83 #839496 #6c71c4 #93a1a1 #fdf6e3'),
}

export const themeOf = (name: string): ITheme => THEMES[name] ?? KORA

type UiTheme = { scheme: 'dark' | 'light'; tokens: Record<string, string> }

/** Sobrescreve os tokens de src/styles/tokens.css. */
const UI_THEMES: Record<string, UiTheme> = {
  Areia: {
    scheme: 'dark',
    tokens: {
      'bg-000': '#1a1918', 'bg-100': '#201f1d', 'bg-200': '#2a2826', 'bg-300': '#34312e',
      line: '#3a3632', 'line-control': '#6b645c',
      ink: '#ebe6df', 'ink-muted': '#a8a199', 'ink-faint': '#857e76',
      accent: '#d97757', 'accent-strong': '#ec9a7c', 'accent-soft': '#3a241b', 'on-accent': '#1d0f09', petrol: '#4a3d33',
      success: '#8fc28a', 'success-soft': '#1d2a1c', warning: '#e0b45c', 'warning-soft': '#2f2614',
      danger: '#e8735a', 'danger-soft': '#331a14',
      'shadow-pop': '0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px #3a3632',
    },
  },
  Argila: {
    scheme: 'dark',
    tokens: {
      'bg-000': '#15110f', 'bg-100': '#1c1714', 'bg-200': '#251f1b', 'bg-300': '#2f2722',
      line: '#3d332c', 'line-control': '#75655a',
      ink: '#f0e6dc', 'ink-muted': '#b3a291', 'ink-faint': '#8c7c6e',
      accent: '#c8643c', 'accent-strong': '#e08a63', 'accent-soft': '#36201a', 'on-accent': '#1a0b05', petrol: '#4d3226',
      success: '#8cbf7f', 'success-soft': '#1b271a', warning: '#d9a94f', 'warning-soft': '#2d2312',
      danger: '#e06a4a', 'danger-soft': '#321812',
      'shadow-pop': '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px #3d332c',
    },
  },
  Papel: {
    scheme: 'light',
    tokens: {
      'bg-000': '#faf8f4', 'bg-100': '#f2eee7', 'bg-200': '#e9e4db', 'bg-300': '#ddd6ca',
      line: '#d6cfc3', 'line-control': '#9c9285',
      ink: '#2b2724', 'ink-muted': '#5f5851', 'ink-faint': '#7a7269',
      accent: '#b85a35', 'accent-strong': '#9a4526', 'accent-soft': '#f3e1d6', 'on-accent': '#ffffff', petrol: '#e6d3c4',
      success: '#2f7d3a', 'success-soft': '#e2efdf', warning: '#8f6400', 'warning-soft': '#f5ead0',
      danger: '#c0392b', 'danger-soft': '#f7dfda',
      'shadow-pop': '0 12px 32px rgba(60, 40, 20, 0.15), 0 0 0 1px #d6cfc3',
    },
  },
}

const UI_TOKENS = [...new Set(Object.values(UI_THEMES).flatMap((t) => Object.keys(t.tokens)))]

/** Aplica (ou desfaz, para temas só de terminal) as cores da interface do tema. */
export function applyUiTheme(name: string) {
  const root = document.documentElement.style
  const ui = UI_THEMES[name]
  for (const token of UI_TOKENS) {
    const value = ui?.tokens[token]
    if (value) root.setProperty(`--${token}`, value)
    else root.removeProperty(`--${token}`)
  }
  root.colorScheme = ui?.scheme ?? ''
}

export const changesUi = (name: string) => name in UI_THEMES

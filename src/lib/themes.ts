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

/** Temas do terminal. A interface segue sempre a marca Kora; só o terminal muda. */
export const THEMES: Record<string, ITheme> = {
  Kora: KORA,
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

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

/** Temas do terminal. Os que têm entrada em UI_THEMES também existem como tema da interface. */
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
  // Mais populares do iTerm2-Color-Schemes (paletas oficiais; seleção ajustada onde vinha igual ao texto).
  Kanagawa: palette('#1f1f28', '#dcd7ba', '#c8c093', '#2d4f67',
    '#090618 #c34043 #76946a #c0a36e #7e9cd8 #957fb8 #6a9589 #c8c093 #727169 #e82424 #98bb6c #e6c384 #7fb4ca #938aa9 #7aa89f #dcd7ba'),
  'Kanagawa Dragon': palette('#181616', '#c5c9c5', '#c8c093', '#223249',
    '#0d0c0c #c4746e #8a9a7b #c4b28a #8ba4b0 #a292a3 #8ea4a2 #c8c093 #a6a69c #e46876 #87a987 #e6c384 #7fb4ca #938aa9 #7aa89f #c5c9c5'),
  Everforest: palette('#1e2326', '#d3c6aa', '#e69875', '#4c3743',
    '#7a8478 #e67e80 #a7c080 #dbbc7f #7fbbb3 #d699b6 #83c092 #f2efdf #a6b0a0 #f85552 #8da101 #dfa000 #3a94c5 #df69ba #35a77c #fffbef'),
  'Everforest Light': palette('#efebd4', '#5c6a72', '#f57d26', '#eaedc8',
    '#7a8478 #e67e80 #9ab373 #c1a266 #7fbbb3 #d699b6 #83c092 #b2af9f #a6b0a0 #f85552 #8da101 #dfa000 #3a94c5 #df69ba #35a77c #fffbef'),
  'Night Owl': palette('#011627', '#d6deeb', '#7e57c2', '#5f7e97',
    '#011627 #ef5350 #22da6e #addb67 #82aaff #c792ea #21c7a8 #ffffff #575656 #ef5350 #22da6e #ffeb95 #82aaff #c792ea #7fdbca #ffffff'),
  Horizon: palette('#1c1e26', '#d5d8da', '#e95678', '#2e303e',
    '#000000 #e95678 #29d398 #fab795 #26bbd9 #ee64ac #59e1e3 #e5e5e5 #666666 #ec6a88 #3fdaa4 #fbc3a7 #3fc4de #f075b5 #6be4e6 #e5e5e5'),
  Poimandres: palette('#1a1e28', '#a6accd', '#ffffff', '#303340',
    '#1a1e28 #d0679d #5de4c7 #fffac2 #89ddff #fcc5e9 #add7ff #ffffff #a6accd #d0679d #5de4c7 #fffac2 #add7ff #fae4fc #89ddff #ffffff'),
  'Tokyo Night Storm': palette('#24283b', '#c0caf5', '#c0caf5', '#364a82',
    '#1d202f #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #a9b1d6 #4e5575 #f7768e #9ece6a #e0af68 #7aa2f7 #bb9af7 #7dcfff #c0caf5'),
  'Catppuccin Macchiato': palette('#24273a', '#cad3f5', '#f4dbd6', '#5b6078',
    '#494d64 #ed8796 #a6da95 #eed49f #8aadf4 #f5bde6 #8bd5ca #b8c0e0 #5b6078 #f2a7b2 #bde3b0 #f4e3c1 #adc5f7 #f493da #a5ded6 #a5adcb'),
  'Rosé Pine Moon': palette('#232136', '#e0def4', '#e0def4', '#44415a',
    '#393552 #eb6f92 #3e8fb0 #f6c177 #9ccfd8 #c4a7e7 #ea9a97 #e0def4 #6e6a86 #eb6f92 #3e8fb0 #f6c177 #9ccfd8 #c4a7e7 #ea9a97 #e0def4'),
  'Rosé Pine Dawn': palette('#faf4ed', '#575279', '#575279', '#dfdad9',
    '#f2e9e1 #b4637a #286983 #ea9d34 #56949f #907aa9 #d7827e #575279 #9893a5 #b4637a #286983 #ea9d34 #56949f #907aa9 #d7827e #575279'),
  'Gruvbox Light': palette('#fbf1c7', '#3c3836', '#3c3836', '#d5c4a1',
    '#fbf1c7 #cc241d #98971a #d79921 #458588 #b16286 #689d6a #7c6f64 #928374 #9d0006 #79740e #b57614 #076678 #8f3f71 #427b58 #3c3836'),
  Vesper: palette('#101010', '#ffffff', '#acb1ab', '#988049',
    '#101010 #f5a191 #90b99f #e6b99d #aca1cf #e29eca #ea83a5 #a0a0a0 #7e7e7e #ff8080 #99ffe4 #ffc799 #b9aeda #ecaad6 #f591b2 #ffffff'),
  Nightfox: palette('#192330', '#cdcecf', '#cdcecf', '#2b3b51',
    '#393b44 #c94f6d #81b29a #dbc074 #719cd6 #9d79d6 #63cdcf #dfdfe0 #575860 #d16983 #8ebaa4 #e0c989 #86abdc #baa1e2 #7ad5d6 #e4e4e5'),
  Moonfly: palette('#080808', '#bdbdbd', '#9e9e9e', '#323437',
    '#323437 #ff5454 #8cc85f #e3c78a #80a0ff #cf87e8 #79dac8 #c6c6c6 #949494 #ff5189 #36c692 #c6c684 #74b2ff #ae81ff #85dc85 #e4e4e4'),
  Oxocarbon: palette('#161616', '#f2f4f8', '#ffffff', '#393939',
    '#161616 #00dfdb #00b4ff #ff4297 #00c15a #c693ff #ff74b8 #f2f4f8 #585858 #00dfdb #00b4ff #ff4297 #00c15a #c693ff #ff74b8 #f2f4f8'),
  'GitHub Dark Dimmed': palette('#22272e', '#adbac7', '#539bf5', '#2d3f57',
    '#545d68 #f47067 #57ab5a #c69026 #539bf5 #b083f0 #39c5cf #909dab #636e7b #ff938a #6bc46d #daaa3f #6cb6ff #dcbdfb #56d4dd #cdd9e5'),
  'One Light': palette('#f9f9f9', '#2a2c33', '#526fff', '#d0dffc',
    '#000000 #de3e35 #3f953a #d2b67c #2f5af3 #950095 #3f953a #bbbbbb #000000 #de3e35 #3f953a #d2b67c #2f5af3 #a00095 #3f953a #ffffff'),
  Synthwave: palette('#262335', '#dad9c7', '#19cde6', '#463465',
    '#000000 #f6188f #1ebb2b #fdf834 #2186ec #f85a21 #12c3e2 #ffffff #7f7094 #f841a0 #25c141 #fdf454 #2f9ded #f97137 #19cde6 #ffffff'),
  // Temas da casa (mudam a interface inteira): musgo, azul-noite e névoa (claro frio).
  Musgo: palette('#0f1410', '#e3eadf', '#9cc069', '#2f4325',
    '#1b231c #e8806a #86c98a #e3b55a #7fa7c9 #c39ad0 #7cc4b4 #a3b09e #5f6f5f #f2a08c #a7dcaa #ecca85 #a3c3dd #d7b8e0 #a1d9cc #e3eadf'),
  Noite: palette('#0b0f1c', '#e1e6f5', '#8b9cff', '#2a3570',
    '#161d36 #ff8a8a #7fd6a6 #f0c068 #8b9cff #c79bf2 #6fd3e8 #9aa4c7 #56628e #ffb0b0 #a7e7c4 #f6d692 #b4c0ff #dcbff8 #9ee4f1 #e1e6f5'),
  Névoa: palette('#f5f7fa', '#1f2933', '#1a7f8e', '#c9e4e8',
    '#1f2933 #c2413a #2e7d4f #8a6100 #2f62a8 #8b45a6 #1a7f8e #d6dde7 #66727f #d4544c #3a9461 #a37600 #3d74bf #a05abb #24939f #e9edf2'),
  // Alvor Labs (manual da marca): grafite #1D1D1F, névoa #F5F5F7, prata #6E6E73 e o âmbar do cursor #FFB02E.
  Alvor: palette('#1d1d1f', '#f5f5f7', '#ffb02e', '#4a3c22',
    '#2c2c2e #ff7a45 #5fd38a #ffb02e #64a8ff #c89bf0 #5ccfe6 #a1a1a6 #6e6e73 #ff9b70 #86e0a7 #ffc766 #8ec0ff #dbb9f6 #8fdfef #f5f5f7'),
  'Alvor Claro': palette('#ffffff', '#1d1d1f', '#ffb02e', '#ffe7bf',
    '#1d1d1f #c4401a #1f7a45 #8a5800 #1d5fbf #8a3fb0 #0f7a8a #e8e8ed #6e6e73 #d9531f #268c52 #b87500 #2f72d0 #9d52c2 #158c9c #f5f5f7'),
}

export const themeOf = (name: string): ITheme => THEMES[name] ?? KORA

type UiTheme = { scheme: 'dark' | 'light'; tokens: Record<string, string> }

const UI_ORDER = [
  'bg-000', 'bg-100', 'bg-200', 'bg-300', 'line', 'line-control',
  'ink', 'ink-muted', 'ink-faint',
  'accent', 'accent-strong', 'accent-soft', 'on-accent', 'petrol',
  'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft',
]

/** Sobrescreve os tokens de src/styles/tokens.css. */
const UI_THEMES: Record<string, UiTheme> = {
  Areia: {
    scheme: 'dark',
    tokens: {
      'bg-000': '#1a1918', 'bg-100': '#201f1d', 'bg-200': '#2a2826', 'bg-300': '#34312e',
      line: '#3a3632', 'line-control': '#716a63',
      ink: '#ebe6df', 'ink-muted': '#a8a199', 'ink-faint': '#969089',
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
      ink: '#f0e6dc', 'ink-muted': '#b3a291', 'ink-faint': '#938477',
      accent: '#ce7450', 'accent-strong': '#e08a63', 'accent-soft': '#36201a', 'on-accent': '#1a0b05', petrol: '#4d3226',
      success: '#8cbf7f', 'success-soft': '#1b271a', warning: '#d9a94f', 'warning-soft': '#2d2312',
      danger: '#e06a4a', 'danger-soft': '#321812',
      'shadow-pop': '0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px #3d332c',
    },
  },
  Papel: {
    scheme: 'light',
    tokens: {
      'bg-000': '#faf8f4', 'bg-100': '#f2eee7', 'bg-200': '#e9e4db', 'bg-300': '#ddd6ca',
      line: '#d6cfc3', 'line-control': '#90867a',
      ink: '#2b2724', 'ink-muted': '#5f5851', 'ink-faint': '#6b645c',
      accent: '#9e4d2e', 'accent-strong': '#9a4526', 'accent-soft': '#f3e1d6', 'on-accent': '#ffffff', petrol: '#e6d3c4',
      success: '#2d7838', 'success-soft': '#e2efdf', warning: '#8c6200', 'warning-soft': '#f5ead0',
      danger: '#b83729', 'danger-soft': '#f7dfda',
      'shadow-pop': '0 12px 32px rgba(60, 40, 20, 0.15), 0 0 0 1px #d6cfc3',
    },
  },
  // Paletas oficiais de cada projeto levadas para a interface (bg-000 = fundo do terminal).
  Dracula: ui('dark',
    '#282a36 #2d2f3d #343746 #424450 #44475a #6878a8 #f8f8f2 #bfc1d4 #989fc5 #bd93f9 #d6bcfc #3a3352 #1e1530 #44475a #50fa7b #1f3b2a #ffb86c #3e3125 #ff6363 #41242b'),
  'Tokyo Night': ui('dark',
    '#1a1b26 #1f2030 #24283b #292e42 #2c3148 #656c8b #c0caf5 #a9b1d6 #888fb2 #7aa2f7 #a9c1fb #1f2a4a #0f1220 #33467c #9ece6a #1f2b1d #e0af68 #30281b #f7768e #3a1f2a'),
  'Catppuccin Mocha': ui('dark',
    '#1e1e2e #232334 #2a2b3c #313244 #393a4e #6c7086 #cdd6f4 #bac2de #9399b2 #cba6f7 #ddc6fa #372f4f #1e1530 #45475a #a6e3a1 #233227 #f9e2af #3a3528 #f38ba8 #3d2433'),
  'Catppuccin Latte': ui('light',
    '#eff1f5 #e6e9ef #dce0e8 #ccd0da #ccd0da #818494 #4c4f69 #5c5f77 #5f6275 #8036e1 #7028e4 #e9dcfb #ffffff #d0d6ea #2d7821 #e0efdc #a1530a #f6e8d3 #c50e36 #f8dbe1'),
  Nord: ui('dark',
    '#2e3440 #343a48 #3b4252 #434c5e #3f4758 #7a859b #eceff4 #d8dee9 #a5afc3 #88c0d0 #b5dbe5 #2f4450 #1e242e #434c5e #a3be8c #323d35 #ebcb8b #403b31 #dd8f97 #43303a'),
  'Gruvbox Dark': ui('dark',
    '#282828 #32302f #3c3836 #504945 #45403d #84786d #ebdbb2 #d5c4a1 #afa18e #fe8019 #ffa057 #3d2a1c #1d2021 #504945 #b8bb26 #33331c #fabd2f #3d321a #fc6a59 #3f2120'),
  'Gruvbox Light': ui('light',
    '#fbf1c7 #f2e5bc #ebdbb2 #d5c4a1 #d5c4a1 #8f8072 #3c3836 #504945 #6b5f57 #af3a03 #8a2e02 #f5d9b5 #fbf1c7 #e0cfa6 #6a660c #e6e3b5 #8c580a #f3e0b0 #9d0006 #f5d0c4'),
  'Rosé Pine': ui('dark',
    '#191724 #1f1d2e #26233a #312e46 #2a283e #6e6a86 #e0def4 #908caa #8e89a6 #ebbcba #f5d6d4 #3a2a33 #191724 #403d52 #9ccfd8 #1f3036 #f6c177 #3a3024 #eb6f92 #3d1f2d'),
  'Rosé Pine Dawn': ui('light',
    '#faf4ed #f4ede4 #f2e9e1 #e6dcd3 #dfdad9 #898495 #464261 #67637f #6a657c #9e4f4c #8f403d #f6e1dc #ffffff #dfdad9 #286983 #dbe8ea #935e0f #f8ead2 #945164 #f3dfe3'),
  'GitHub Dark': ui('dark',
    '#0d1117 #151b23 #212830 #2a313c #2f3742 #656c76 #f0f6fc #9198a1 #899099 #4493f8 #79c0ff #152a45 #0d1117 #264f78 #3fb950 #132b1c #d29922 #2e2410 #f85149 #3b1719'),
  'GitHub Light': ui('light',
    '#ffffff #f6f8fa #eff2f5 #e6eaef #d1d9e0 #818b98 #1f2328 #59636e #656d77 #0969da #0550ae #ddf4ff #ffffff #b6e3ff #1a7f37 #dafbe1 #9a6700 #fff8c5 #d1242f #ffebe9'),
  'One Dark': ui('dark',
    '#282c34 #2c313a #333842 #3e4452 #383d48 #737a86 #d7dae0 #abb2bf #9ba1ac #61afef #8cc4f5 #1f3347 #1a1d23 #3e4451 #98c379 #27322a #e5c07b #3a3428 #e37b83 #3d2629'),
  // Temas da casa.
  Musgo: ui('dark',
    '#0f1410 #141a15 #1b231c #232d24 #2a352b #5f6f5f #e3eadf #a3b09e #7e8c7a #9cc069 #bcd894 #222d17 #141c0a #2f4325 #86c98a #162a1a #e3b55a #2c2414 #e8806a #2f1a14'),
  Noite: ui('dark',
    '#0b0f1c #10152a #161d36 #1e2644 #232c4c #56628e #e1e6f5 #9aa4c7 #7a85ab #8b9cff #b4c0ff #1c2350 #0b0f2a #2a3570 #7fd6a6 #112a22 #f0c068 #2c2414 #ff8a8a #341619'),
  Névoa: ui('light',
    '#f5f7fa #eceff4 #e2e7ee #d6dde7 #d1d8e2 #7f8998 #1f2933 #4b5866 #5d6976 #177280 #115e6a #d9eef1 #ffffff #c9e4e8 #2b764a #dcefe3 #8a6100 #f5ebcf #b63d37 #f8e0de'),
  // Alvor Labs. Âmbar só como destaque; no claro, o âmbar que vira texto é o "âmbar texto" escurecido.
  Alvor: ui('dark',
    '#1d1d1f #232325 #2c2c2e #3a3a3c #38383a #6e6e73 #f5f5f7 #a1a1a6 #939397 #ffb02e #ffc766 #3a2c14 #1d1d1f #4a3c22 #5fd38a #16291d #ffd25e #33290f #ff7a45 #3a1c10'),
  'Alvor Claro': ui('light',
    '#ffffff #fbfbfd #f5f5f7 #e8e8ed #e5e5ea #919195 #1d1d1f #6e6e73 #6e6e73 #9a6200 #7a4d00 #fff3e2 #ffffff #ffe7bf #1f7a45 #e3f4e9 #8a5800 #fff3e2 #bc3d19 #fde6de'),
}

/** Monta um tema de interface a partir dos 20 tokens de cor, na ordem de UI_ORDER. */
function ui(scheme: 'dark' | 'light', colors: string): UiTheme {
  const values = colors.split(' ')
  const tokens: Record<string, string> = Object.fromEntries(UI_ORDER.map((t, i) => [t, values[i]]))
  const shadow = scheme === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(20, 30, 40, 0.15)'
  tokens['shadow-pop'] = `0 12px 32px ${shadow}, 0 0 0 1px ${tokens.line}`
  return { scheme, tokens }
}

const UI_TOKENS = [...new Set(Object.values(UI_THEMES).flatMap((t) => Object.keys(t.tokens)))]

/** Aplica as cores da interface do tema (ou volta às do Kora). */
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

/** Temas da interface; "Kora" é o padrão de src/styles/tokens.css. */
export const UI_THEME_NAMES = ['Kora', ...Object.keys(UI_THEMES)]

/** Valor do tema do terminal que segue o tema da interface (todo tema de interface tem paleta de terminal). */
export const FOLLOW_UI = 'auto'

/** Paleta do terminal: a escolhida, ou a do tema da interface quando segue a interface. */
export const terminalTheme = (theme: string, uiTheme: string): ITheme => themeOf(theme === FOLLOW_UI ? uiTheme : theme)

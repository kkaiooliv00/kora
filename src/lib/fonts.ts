/** Fontes do seletor do terminal: as monoespaçadas mais usadas na web (Google Fonts) vêm embutidas
 *  (src/styles/fonts.css, só latin); as do sistema dependem de estarem instaladas. */
export type FontOption = { name: string; system?: boolean }

export const FONTS: FontOption[] = [
  { name: 'JetBrains Mono' },
  { name: 'Fira Code' },
  { name: 'Roboto Mono' },
  { name: 'Source Code Pro' },
  { name: 'IBM Plex Mono' },
  { name: 'Inconsolata' },
  { name: 'Ubuntu Mono' },
  { name: 'Space Mono' },
  { name: 'DM Mono' },
  { name: 'Geist Mono' },
  { name: 'Red Hat Mono' },
  { name: 'Cascadia Code' },
  { name: 'Consolas', system: true },
  { name: 'Cascadia Mono', system: true },
  { name: 'Lucida Console', system: true },
  { name: 'Courier New', system: true },
  { name: 'Arial Rounded MT Bold', system: true },
]

/** Pilha CSS com reserva na fonte da marca (cobre símbolos e desenhos de caixa que faltarem). */
export const fontStack = (name: string) => `"${name}", "JetBrains Mono", monospace`

/** Qual opção do seletor corresponde à fonte configurada (undefined = personalizada). */
export const fontOf = (family: string) => FONTS.find((f) => family.startsWith(`"${f.name}"`))

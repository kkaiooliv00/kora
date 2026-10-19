/** Tamanhos dos painéis lado a lado (em %) e da barra lateral (em px). */

export const SIDEBAR = { min: 240, max: 360, default: 288 }
/** Mínimo por painel (regra do design); em janela pequena cai para 15%. */
const MIN_PANE_PX = 360
const MIN_PANE_PCT = 15

/** Tamanhos válidos para `count` painéis; senão divide igual. */
export function paneSizes(sizes: number[] | undefined, count: number): number[] {
  const valid = sizes && sizes.length === count && sizes.every((s) => s > 0) && Math.abs(sizes.reduce((a, b) => a + b, 0) - 100) < 0.5
  return valid ? sizes : Array.from({ length: count }, () => 100 / count)
}

/**
 * Move a divisória entre os painéis `index` e `index + 1` para `pointerPct` (0–100 do total),
 * respeitando o mínimo de cada um. Devolve tamanhos novos (não muda o original).
 */
export function dragDivider(sizes: number[], index: number, pointerPct: number, totalPx: number): number[] {
  const min = Math.min(MIN_PANE_PCT * 2, Math.max(MIN_PANE_PCT, (MIN_PANE_PX / Math.max(1, totalPx)) * 100))
  const before = sizes.slice(0, index).reduce((a, b) => a + b, 0)
  const pair = sizes[index] + sizes[index + 1]
  const first = Math.min(pair - min, Math.max(min, pointerPct - before))
  if (pair < 2 * min) return sizes
  return sizes.map((s, i) => (i === index ? first : i === index + 1 ? pair - first : s))
}

export const clampSidebar = (px: number) => Math.round(Math.min(SIDEBAR.max, Math.max(SIDEBAR.min, px)))

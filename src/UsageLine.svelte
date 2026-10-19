<script lang="ts">
  /** Linha do período (accent) contra o período anterior (tracejada): uma série por linha, um eixo só. */
  let {
    current,
    previous,
    labels,
    currentName,
    previousName,
  }: { current: number[]; previous: number[]; labels: string[]; currentName: string; previousName: string } = $props()

  const W = 640
  const H = 220
  const PAD = { top: 16, right: 16, bottom: 28, left: 48 }
  const TICKS = 4
  const LABEL_EVERY_MAX = 8

  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
  let hover = $state<number | null>(null)

  const max = $derived(Math.max(1, ...current, ...previous))
  const niceMax = $derived(niceCeil(max))
  const step = $derived((W - PAD.left - PAD.right) / Math.max(1, labels.length - 1))
  const x = (i: number) => PAD.left + i * step
  const y = (v: number) => PAD.top + (1 - v / niceMax) * (H - PAD.top - PAD.bottom)
  const path = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const labelEvery = $derived(Math.ceil(labels.length / LABEL_EVERY_MAX))

  /** Teto "redondo" para as linhas de grade (1, 2, 5 × 10ⁿ). */
  function niceCeil(value: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(value))
    return [1, 2, 5, 10].map((m) => m * magnitude).find((v) => v >= value) ?? value
  }

  function onMove(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement
    const box = svg.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    hover = Math.max(0, Math.min(labels.length - 1, Math.round((px - PAD.left) / step)))
  }
</script>

<div class="chart">
  <div class="legend" aria-hidden="true">
    <span><i class="swatch now"></i>{currentName}</span>
    <span><i class="swatch before"></i>{previousName}</span>
  </div>
  <svg
    viewBox="0 0 {W} {H}"
    role="img"
    aria-label="Tokens por intervalo: {currentName} contra {previousName}"
    onpointermove={onMove}
    onpointerleave={() => (hover = null)}
  >
    {#each Array.from({ length: TICKS + 1 }, (_, i) => i) as i (i)}
      {@const v = (niceMax / TICKS) * i}
      <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
      <text class="tick" x={PAD.left - 8} y={y(v) + 4} text-anchor="end">{compact.format(v)}</text>
    {/each}
    {#each labels as label, i (i)}
      {#if i % labelEvery === 0 || i === labels.length - 1}
        <text class="tick" x={x(i)} y={H - 8} text-anchor="middle">{label}</text>
      {/if}
    {/each}

    <path class="line before" d={path(previous)} />
    <path class="line now" d={path(current)} />
    {#each current as v, i (i)}
      <circle class="point" cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.5} />
    {/each}

    {#if hover !== null}
      <line class="cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} />
    {/if}
  </svg>
  {#if hover !== null}
    <div class="tooltip" style:left="{(x(hover) / W) * 100}%">
      <strong>{labels[hover]}</strong>
      <span><i class="swatch now"></i>{currentName}: {compact.format(current[hover] ?? 0)}</span>
      <span><i class="swatch before"></i>{previousName}: {compact.format(previous[hover] ?? 0)}</span>
    </div>
  {/if}
</div>

<style>
  .chart {
    position: relative;
  }
  .legend {
    position: absolute;
    top: -34px;
    right: 0;
    display: flex;
    gap: var(--space-4);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .legend span,
  .tooltip span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .swatch {
    display: inline-block;
    width: 14px;
    height: 0;
    border-top: 2px solid var(--accent);
  }
  .swatch.before {
    border-top: 2px dashed var(--ink-muted);
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .tick {
    fill: var(--ink-muted);
    font: 11px var(--font-mono);
  }
  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .line.now {
    stroke: var(--accent);
  }
  .line.before {
    stroke: var(--ink-muted);
    stroke-dasharray: 4 4;
  }
  .point {
    fill: var(--accent);
    stroke: var(--bg-200);
    stroke-width: 2;
  }
  .cross {
    stroke: var(--line-control);
    stroke-width: 1;
  }
  .tooltip {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--bg-300);
    box-shadow: var(--shadow-pop);
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
  }
</style>

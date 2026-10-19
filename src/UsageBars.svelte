<script lang="ts">
  import type { ChatUsage } from './lib/usage'

  /** Top 5 chats + "outros": barras horizontais de uma série só; o primeiro em destaque (tela 08). */
  let { chats }: { chats: ChatUsage[] } = $props()

  const TOP = 5
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

  const rows = $derived.by(() => {
    const top = chats.slice(0, TOP).map((c) => ({ key: c.key, label: c.label, total: c.total, other: false }))
    const rest = chats.slice(TOP)
    if (rest.length > 0) {
      const total = rest.reduce((acc, c) => acc + c.total, 0)
      top.push({ key: 'outros', label: `outros ${rest.length} chats`, total, other: true })
    }
    return top
  })
  const max = $derived(Math.max(1, ...rows.map((r) => r.total)))
</script>

<ul class="bars">
  {#each rows as row, i (row.key)}
    <li title="{row.label}: {compact.format(row.total)} tokens">
      <span class="label" class:other={row.other}>{row.label}</span>
      <span class="track"><span class="fill" class:lead={i === 0} class:other={row.other} style:width="{(row.total / max) * 100}%"></span></span>
      <span class="value">{compact.format(row.total)}</span>
    </li>
  {/each}
</ul>

<style>
  .bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-template-columns: 120px 1fr 72px;
    align-items: center;
    gap: var(--space-3);
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 12px var(--font-mono);
  }
  .label.other {
    color: var(--ink-muted);
  }
  .track {
    height: 14px;
    border-radius: var(--radius-sm);
    background: var(--bg-300);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    background: var(--petrol);
  }
  .fill.lead {
    background: var(--accent);
  }
  .fill.other {
    background: var(--line-control);
  }
  li:hover .fill {
    filter: brightness(1.2);
  }
  .value {
    text-align: right;
    font: 12px var(--font-mono);
    color: var(--ink-muted);
  }
</style>

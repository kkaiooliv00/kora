<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { app } from './lib/state.svelte'

  interface Tokens {
    input: number
    output: number
    cacheWrite: number
    cacheRead: number
  }
  interface Row {
    day: string
    source: 'claude' | 'codex'
    model: string
    project: string
    tokens: Tokens
  }

  const PERIODS = [1, 7, 30]
  const SOURCES = { claude: 'Claude', codex: 'Codex' } as const

  let days = $state(7)
  let rows = $state<Row[]>([])
  let files = $state(0)
  let loading = $state(false)
  let error = $state('')

  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
  const fmt = (n: number) => compact.format(n)
  const sum = (list: Tokens[]): Tokens =>
    list.reduce(
      (acc, t) => ({
        input: acc.input + t.input,
        output: acc.output + t.output,
        cacheWrite: acc.cacheWrite + t.cacheWrite,
        cacheRead: acc.cacheRead + t.cacheRead,
      }),
      { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
    )

  function groupBy(key: (r: Row) => string): { label: string; tokens: Tokens }[] {
    const groups = new Map<string, Tokens[]>()
    rows.forEach((r) => groups.set(key(r), [...(groups.get(key(r)) ?? []), r.tokens]))
    return [...groups.entries()]
      .map(([label, list]) => ({ label, tokens: sum(list) }))
      .sort((a, b) => b.tokens.input + b.tokens.output - (a.tokens.input + a.tokens.output))
  }

  const bySource = $derived(groupBy((r) => SOURCES[r.source]))
  const byDay = $derived(groupBy((r) => r.day).sort((a, b) => b.label.localeCompare(a.label)))
  const byModel = $derived(groupBy((r) => `${SOURCES[r.source]} · ${r.model || '?'}`))
  const byProject = $derived(groupBy((r) => r.project || '?'))
  const maxDay = $derived(Math.max(1, ...byDay.map((d) => d.tokens.input + d.tokens.output)))

  async function refresh() {
    loading = true
    error = ''
    try {
      const usage = await invoke<{ rows: Row[]; files: number }>('usage_summary', { days })
      rows = usage.rows
      files = usage.files
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void days
    refresh()
  })
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

{#snippet table(title: string, groups: { label: string; tokens: Tokens }[])}
  <section>
    <h3>{title}</h3>
    <table>
      <thead>
        <tr><th></th><th>entrada</th><th>saída</th><th>cache (gravação)</th><th>cache (leitura)</th></tr>
      </thead>
      <tbody>
        {#each groups as g (g.label)}
          <tr>
            <td class="label">{g.label}</td>
            <td>{fmt(g.tokens.input)}</td>
            <td>{fmt(g.tokens.output)}</td>
            <td>{fmt(g.tokens.cacheWrite)}</td>
            <td>{fmt(g.tokens.cacheRead)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/snippet}

<div class="backdrop">
  <div class="modal usage" role="dialog" aria-modal="true" aria-label="Uso de tokens">
    <header>
      <div>
        <h2>Uso de tokens</h2>
        <p class="sub">Lido dos logs locais do Claude Code e do Codex ({files} arquivos). Nada sai da máquina.</p>
      </div>
      <div class="periods" role="group" aria-label="Período">
        {#each PERIODS as p (p)}
          <button class="btn" class:primary={days === p} onclick={() => (days = p)}>{p === 1 ? 'hoje' : `${p} dias`}</button>
        {/each}
      </div>
      <button class="btn" onclick={() => (app.modal = null)}>Fechar</button>
    </header>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if loading && rows.length === 0}
      <p class="sub">Lendo logs…</p>
    {:else if rows.length === 0}
      <p class="sub">Nenhum uso registrado nesse período.</p>
    {:else}
      <div class="cards">
        {#each bySource as s (s.label)}
          <div class="card">
            <span class="sub">{s.label}</span>
            <strong>{fmt(s.tokens.input + s.tokens.output)}</strong>
            <span class="sub">entrada + saída · {fmt(s.tokens.cacheRead)} lidos do cache</span>
          </div>
        {/each}
      </div>

      <section>
        <h3>Por dia (entrada + saída)</h3>
        {#each byDay as d (d.label)}
          {@const total = d.tokens.input + d.tokens.output}
          <div class="bar-row">
            <span class="label">{d.label.slice(8, 10)}/{d.label.slice(5, 7)}</span>
            <div class="bar"><div style:width="{(total / maxDay) * 100}%"></div></div>
            <span>{fmt(total)}</span>
          </div>
        {/each}
      </section>

      {@render table('Por modelo', byModel)}
      {@render table('Por projeto', byProject)}
    {/if}
  </div>
</div>

<style>
  .usage {
    width: min(860px, calc(100vw - 32px));
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  header > div:first-child {
    flex: 1;
  }
  .periods {
    display: flex;
    gap: 4px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin: 6px 0 18px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg-000);
  }
  .card .sub {
    margin: 0;
  }
  .card strong {
    font-size: 24px;
    font-variant-numeric: tabular-nums;
  }
  section {
    margin-bottom: 18px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .bar-row {
    display: grid;
    grid-template-columns: 48px 1fr 64px;
    align-items: center;
    gap: 10px;
    padding: 3px 0;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 10px;
    border-radius: 5px;
    background: var(--bg-300);
    overflow: hidden;
  }
  .bar div {
    height: 100%;
    border-radius: 5px;
    background: var(--accent);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 6px 8px;
    text-align: right;
    border-bottom: 1px solid var(--line);
  }
  th {
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-muted);
  }
  .label {
    text-align: left;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

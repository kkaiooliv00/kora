<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import EmptyState from './EmptyState.svelte'
  import Skeleton from './Skeleton.svelte'
  import UsageLine from './UsageLine.svelte'
  import UsageBars from './UsageBars.svelte'
  import { app, whereOf } from './lib/state.svelte'
  import { between, byChat, DAY_MS, HOUR_MS, series, startOfDay, sum, totalOf, type UsageRow } from './lib/usage'

  const PERIODS = [
    { days: 1, label: 'Hoje' },
    { days: 7, label: '7 dias' },
    { days: 30, label: '30 dias' },
  ]
  const PAGE_SIZE = 6
  // O Rust lê no máximo 90 dias; o período anterior serve de comparação.
  const MAX_DAYS = 90

  let days = $state(1)
  let project = $state('')
  let rows = $state<UsageRow[]>([])
  let loading = $state(true)
  let error = $state('')
  let updatedAt = $state<Date | null>(null)
  let page = $state(0)

  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 })
  const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dayLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

  async function refresh() {
    loading = true
    error = ''
    try {
      const usage = await invoke<{ rows: UsageRow[]; files: number }>('usage_summary', { days: Math.min(MAX_DAYS, days * 2 + 1) })
      rows = usage.rows
      updatedAt = new Date()
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void days
    page = 0
    refresh()
  })

  const now = $derived(updatedAt?.getTime() ?? Date.now())
  const from = $derived(startOfDay(days - 1, now))
  const filtered = $derived(project ? rows.filter((r) => r.project === project) : rows)
  const current = $derived(between(filtered, from, now + HOUR_MS))
  // Hoje compara com ontem até o mesmo horário; 7/30 dias com o período anterior inteiro.
  const previous = $derived(between(filtered, from - days * DAY_MS, days === 1 ? now - DAY_MS : from))
  const totals = $derived(sum(current))
  const total = $derived(totalOf(totals))
  const previousTotal = $derived(totalOf(sum(previous)))
  const delta = $derived(previousTotal ? (total - previousTotal) / previousTotal : null)
  const chats = $derived(byChat(current, app.chats, whereOf))
  const projects = $derived(new Set(current.map((r) => r.project)).size)
  const projectNames = $derived([...new Set(rows.map((r) => r.project).filter(Boolean))].sort())

  // Hoje: por hora até agora; 7/30 dias: por dia.
  const chart = $derived.by(() => {
    if (days === 1) {
      const hours = new Date(now).getHours() + 1
      return {
        current: series(current, from, HOUR_MS, hours),
        previous: series(filtered, from - DAY_MS, HOUR_MS, hours),
        labels: Array.from({ length: hours }, (_, h) => `${String(h).padStart(2, '0')}h`),
        currentName: 'hoje',
        previousName: 'ontem',
        title: 'Como o consumo evoluiu hoje?',
        sub: 'Tokens por hora, entrada + saída',
      }
    }
    return {
      current: series(current, from, DAY_MS, days),
      previous: series(previous, from - days * DAY_MS, DAY_MS, days),
      labels: Array.from({ length: days }, (_, i) => dayLabel.format(new Date(from + i * DAY_MS))),
      currentName: `últimos ${days} dias`,
      previousName: `${days} dias anteriores`,
      title: `Como o consumo evoluiu em ${days} dias?`,
      sub: 'Tokens por dia, entrada + saída',
    }
  })

  const pages = $derived(Math.max(1, Math.ceil(chats.length / PAGE_SIZE)))
  const visible = $derived(chats.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))
  const periodName = $derived(PERIODS.find((p) => p.days === days)?.label ?? '')

  function ago(ms: number): string {
    const minutes = Math.round((now - ms) / 60_000)
    if (minutes < 5) return 'agora'
    if (minutes < 60) return `há ${minutes} min`
    const hours = Math.round(minutes / 60)
    return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} dias`
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<div class="page" role="dialog" aria-modal="true" aria-label="Uso de tokens">
  <header>
    <button class="icon-btn" aria-label="Voltar" title="Voltar (Esc)" onclick={() => (app.modal = null)}>
      <ChevronLeft size={16} strokeWidth={1.5} />
    </button>
    <h1>uso de tokens</h1>
    <span class="spacer"></span>
    <div class="segmented" role="radiogroup" aria-label="Período">
      {#each PERIODS as p (p.days)}
        <button role="radio" aria-checked={days === p.days} class:on={days === p.days} onclick={() => (days = p.days)}>{p.label}</button>
      {/each}
    </div>
    <select class="input mono project" bind:value={project} aria-label="Projeto">
      <option value="">Todos os projetos</option>
      {#each projectNames as name (name)}<option value={name}>{name}</option>{/each}
    </select>
    {#if updatedAt}<span class="updated">Atualizado às {time.format(updatedAt)}</span>{/if}
  </header>

  <main>
    {#if error}
      <section class="card">
        <EmptyState kind="error" title="Não foi possível ler o uso" detail={error}>
          Os logs locais do Claude e do Codex não puderam ser lidos. Os dados não foram perdidos.
          {#snippet actions()}<button class="btn sm" onclick={refresh}>Tentar de novo</button>{/snippet}
        </EmptyState>
      </section>
    {:else if loading && rows.length === 0}
      <div class="kpis">
        {#each [0, 1, 2, 3] as i (i)}<div class="card kpi"><Skeleton lines={2} widths={['50%', '70%']} /></div>{/each}
      </div>
      <section class="card"><Skeleton lines={4} /><p class="hint">Carregando uso de {periodName.toLowerCase()}…</p></section>
    {:else if total === 0}
      <section class="card">
        <EmptyState kind="empty" title="Sem uso neste período">
          Nenhum chat consumiu tokens {days === 1 ? 'hoje' : `nos últimos ${days} dias`}. O histórico dos outros períodos continua disponível.
          {#snippet actions()}
            {#if days === 1}<button class="btn sm" onclick={() => (days = 7)}>Ver últimos 7 dias</button>{/if}
          {/snippet}
        </EmptyState>
      </section>
    {:else}
      <div class="kpis">
        <div class="card kpi">
          <span class="kpi-label">Tokens {days === 1 ? 'hoje' : `em ${days} dias`} (entrada + saída)</span>
          <strong>{compact.format(total)}</strong>
          {#if delta !== null}
            <span class="kpi-sub">{delta >= 0 ? '▲' : '▼'} {percent.format(Math.abs(delta))} vs {days === 1 ? 'ontem no mesmo horário' : 'período anterior'}</span>
          {/if}
        </div>
        <div class="card kpi">
          <span class="kpi-label">Entrada</span>
          <strong>{compact.format(totals.input)}</strong>
          <span class="kpi-sub">{percent.format(totals.input / total)} do total · {compact.format(totals.cacheRead)} lidos do cache</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">Saída</span>
          <strong>{compact.format(totals.output)}</strong>
          <span class="kpi-sub">{percent.format(totals.output / total)} do total</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">Chats com uso</span>
          <strong>{chats.length}</strong>
          <span class="kpi-sub">em {projects} {projects === 1 ? 'projeto' : 'projetos'}</span>
        </div>
      </div>

      <div class="charts">
        <section class="card">
          <h2>{chart.title}</h2>
          <p class="hint">{chart.sub}</p>
          <UsageLine
            current={chart.current}
            previous={chart.previous}
            labels={chart.labels}
            currentName={chart.currentName}
            previousName={chart.previousName}
          />
        </section>
        <section class="card">
          <h2>Qual chat mais consumiu?</h2>
          <p class="hint">Top 5 + demais, tokens totais</p>
          <UsageBars {chats} />
        </section>
      </div>

      <section class="card table-card">
        <div class="table-head">
          <h2>Uso por chat</h2>
          <span class="hint">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min(chats.length, (page + 1) * PAGE_SIZE)} de {chats.length} · {periodName} · {project || 'Todos os projetos'}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Chat</th>
              <th>Projeto / grupo</th>
              <th class="num">Entrada (tokens)</th>
              <th class="num">Saída (tokens)</th>
              <th class="num">Total ▼</th>
              <th>Última atividade</th>
            </tr>
          </thead>
          <tbody>
            {#each visible as chat (chat.key)}
              <tr>
                <td class="mono">{chat.label}</td>
                <td class="muted">{chat.where}</td>
                <td class="num mono">{compact.format(chat.input)}</td>
                <td class="num mono">{compact.format(chat.output)}</td>
                <td class="num mono strong">{compact.format(chat.total)}</td>
                <td class="muted">{ago(chat.last)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if pages > 1}
          <div class="pager">
            <button class="btn sm" disabled={page === 0} onclick={() => (page -= 1)}>Anterior</button>
            <button class="btn sm" disabled={page >= pages - 1} onclick={() => (page += 1)}>Próxima</button>
          </div>
        {/if}
      </section>
    {/if}
  </main>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 44px 1fr;
    background: var(--bg-100);
    z-index: 15;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-4) 0 var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font: 600 14px var(--font-mono);
  }
  .spacer {
    flex: 1;
  }
  .segmented {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
  }
  .segmented button {
    height: 26px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .segmented button.on {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 500;
  }
  .project {
    height: 32px;
    min-height: 32px;
  }
  .updated {
    font-size: 12px;
    color: var(--ink-muted);
  }
  main {
    overflow-y: auto;
    padding: var(--space-6) clamp(16px, 7vw, 104px);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .card {
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-200);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
  }
  .kpi {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .kpi-label,
  .kpi-sub {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .kpi strong {
    font: 600 26px/34px var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .charts {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--space-4);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    line-height: 22px;
    font-weight: 600;
  }
  .hint {
    margin: var(--space-1) 0 var(--space-6);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .table-card {
    padding: 0;
  }
  .table-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--space-4);
  }
  .table-head .hint {
    margin: 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th,
  td {
    padding: 10px var(--space-4);
    border-top: 1px solid var(--line);
    text-align: left;
  }
  th {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-muted);
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .strong {
    font-weight: 600;
  }
  .muted {
    color: var(--ink-muted);
  }
  .pager {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--line);
  }
</style>

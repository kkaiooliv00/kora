<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import { app, openChat, whereOf, STATUS, type Chat } from './lib/state.svelte'
  import { terminals } from './lib/terminals'
  import { contextPercent, formatMemory, procStats } from './lib/stats.svelte'
  import EmptyState from './EmptyState.svelte'

  /** Todos os chats abertos numa grade: status, últimas linhas, contexto, CPU/memória. */
  const PREVIEW_LINES = 6
  const REFRESH_MS = 2000

  let tick = $state(0)
  $effect(() => {
    const timer = setInterval(() => (tick += 1), REFRESH_MS)
    return () => clearInterval(timer)
  })

  const open = $derived(app.chats.filter((c) => app.tabs.some((t) => t.panes.includes(c.id))))
  const order = ['waiting', 'error', 'running', 'done', 'idle']
  const sorted = $derived([...open].sort((a, b) => order.indexOf(app.status[a.id] ?? 'idle') - order.indexOf(app.status[b.id] ?? 'idle')))

  function preview(chat: Chat): string {
    void tick
    return terminals.get(chat.id)?.read(PREVIEW_LINES) ?? ''
  }

  function go(chat: Chat) {
    app.modal = null
    openChat(chat.id)
  }
</script>

<div class="page" role="dialog" aria-modal="true" aria-label="Agentes">
  <header>
    <button class="icon-btn" aria-label="Voltar" title="Voltar (Esc)" onclick={() => (app.modal = null)}>
      <ChevronLeft size={16} strokeWidth={1.5} />
    </button>
    <h1>agentes</h1>
    <span class="count">{open.length} {open.length === 1 ? 'aberto' : 'abertos'}</span>
  </header>

  <main>
    {#if open.length === 0}
      <EmptyState kind="empty" title="Nenhum chat aberto">Abra chats na barra lateral para acompanhar todos daqui.</EmptyState>
    {:else}
      <div class="grid">
        {#each sorted as chat (chat.id)}
          {@const status = STATUS[app.status[chat.id] ?? 'idle']}
          {@const ctx = contextPercent(app.agentInfo[chat.id])}
          {@const proc = procStats[chat.id]}
          {@const edited = app.touched[chat.id]?.length ?? 0}
          {@const queued = app.queue[chat.id]?.pending.length ?? 0}
          <button class="card" class:waiting={app.status[chat.id] === 'waiting'} onclick={() => go(chat)}>
            <span class="head">
              <span class="dot" style:--dot={status.color} aria-hidden="true"></span>
              <span class="name">{chat.name}</span>
              <span class="badge {status.tone}">{status.glyph} {status.label}</span>
            </span>
            <span class="where">{whereOf(chat)}{chat.branch ? ` · ${chat.branch}` : ''}</span>
            <pre class="preview">{preview(chat) || ' '}</pre>
            <span class="meta">
              {#if ctx !== undefined}<span title="janela de contexto usada">ctx {ctx}%</span>{/if}
              {#if proc}<span title="CPU e memória do agente e dos processos filhos">{proc.cpu.toFixed(1)}% · {formatMemory(proc.memory)}</span>{/if}
              {#if edited}<span>{edited} {edited === 1 ? 'arquivo' : 'arquivos'}</span>{/if}
              {#if queued}<span class="accent">{queued} na fila</span>{/if}
            </span>
          </button>
        {/each}
      </div>
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
  .count {
    font-size: 12px;
    color: var(--ink-muted);
  }
  main {
    overflow-y: auto;
    padding: var(--space-6) clamp(16px, 4vw, 64px);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-4);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--bg-200);
    text-align: left;
    transition: border-color 120ms ease-out;
  }
  .card:hover {
    border-color: var(--line-control);
  }
  .card.waiting {
    border-color: var(--warning);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 1px;
    background: var(--dot);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 600 14px var(--font-mono);
  }
  .where {
    font-size: 12px;
    color: var(--ink-muted);
  }
  .preview {
    height: calc(6 * 16px);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--bg-000);
    color: var(--ink-muted);
    font: 11px/16px var(--font-mono);
    white-space: pre;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font: 11px var(--font-mono);
    color: var(--ink-muted);
  }
  .accent {
    color: var(--accent);
  }
</style>

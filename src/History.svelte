<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import Search from '@lucide/svelte/icons/search'
  import { app, openChat, whereOf } from './lib/state.svelte'
  import EmptyState from './EmptyState.svelte'

  /** Busca nas conversas do Claude de todos os chats do Kora, inclusive os fechados. */
  const DEBOUNCE_MS = 300

  type Hit = { session: string; time: string; role: string; snippet: string }
  let query = $state('')
  let hits = $state<Hit[]>([])
  let loading = $state(false)
  let error = $state('')
  let timer: ReturnType<typeof setTimeout> | undefined

  const bySession = $derived(new Map(app.chats.filter((c) => c.sessionId).map((c) => [c.sessionId as string, c])))
  const when = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  function onInput() {
    clearTimeout(timer)
    timer = setTimeout(run, DEBOUNCE_MS)
  }

  /** Só a busca mais recente aplica o resultado (uma antiga e lenta não sobrescreve). */
  let seq = 0

  async function run() {
    const mine = ++seq
    const text = query.trim()
    if (text.length < 2) {
      hits = []
      loading = false
      return
    }
    loading = true
    error = ''
    try {
      const found = await invoke<Hit[]>('search_history', { query: text, sessions: [...bySession.keys()] })
      if (mine === seq) hits = found
    } catch (e) {
      if (mine === seq) error = String(e)
    } finally {
      if (mine === seq) loading = false
    }
  }

  function go(hit: Hit) {
    const chat = bySession.get(hit.session)
    if (!chat) return
    app.modal = null
    openChat(chat.id)
  }

  const focus = (node: HTMLInputElement) => node.focus()

  /** Partes do trecho com o termo buscado marcado (sem diferenciar maiúsculas). */
  function parts(text: string, term: string): { text: string; hit: boolean }[] {
    const lower = text.toLowerCase()
    const needle = term.toLowerCase()
    const out: { text: string; hit: boolean }[] = []
    let from = 0
    for (let at = lower.indexOf(needle); needle && at >= 0; at = lower.indexOf(needle, from)) {
      if (at > from) out.push({ text: text.slice(from, at), hit: false })
      out.push({ text: text.slice(at, at + needle.length), hit: true })
      from = at + needle.length
    }
    if (from < text.length) out.push({ text: text.slice(from), hit: false })
    return out
  }
</script>

<div class="page" role="dialog" aria-modal="true" aria-label="Buscar nas conversas">
  <header>
    <button class="icon-btn" aria-label="Voltar" title="Voltar (Esc)" onclick={() => (app.modal = null)}>
      <ChevronLeft size={16} strokeWidth={1.5} />
    </button>
    <h1>buscar nas conversas</h1>
  </header>

  <main>
    <label class="search">
      <Search size={16} strokeWidth={1.5} />
      <input bind:value={query} oninput={onInput} use:focus placeholder="Um termo, um arquivo, uma decisão…" aria-label="Buscar" spellcheck="false" />
      {#if loading}<span class="state">buscando…</span>{:else if query.trim().length >= 2}<span class="state">{hits.length} resultados</span>{/if}
    </label>

    {#if error}
      <EmptyState kind="error" title="Não foi possível buscar" detail={error}>Os logs do Claude não puderam ser lidos.</EmptyState>
    {:else if query.trim().length < 2}
      <EmptyState kind="empty" title="Busca em todas as conversas">
        Procura o que você pediu e o que os agentes Claude responderam em todos os chats do Kora, inclusive os fechados.
      </EmptyState>
    {:else if !loading && hits.length === 0}
      <EmptyState kind="empty" title="Nada encontrado">Nenhuma conversa tem “{query.trim()}”.</EmptyState>
    {:else}
      <ul>
        {#each hits as hit, i (i)}
          {@const chat = bySession.get(hit.session)}
          <li>
            <button onclick={() => go(hit)} disabled={!chat}>
              <span class="meta">
                <span class="name">{chat?.name ?? 'chat removido'}</span>
                {#if chat}<span class="where">{whereOf(chat)}</span>{/if}
                <span class="role">{hit.role === 'user' ? 'você' : 'agente'}</span>
                <span class="time">{hit.time ? when.format(new Date(hit.time)) : ''}</span>
              </span>
              <span class="snippet">
                {#each parts(hit.snippet, query.trim()) as part, j (j)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
              </span>
            </button>
          </li>
        {/each}
      </ul>
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
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
    padding: var(--space-6) clamp(16px, 10vw, 160px);
  }
  .search {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 48px;
    padding: 0 var(--space-4);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-lg);
    background: var(--bg-200);
    color: var(--ink-muted);
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search input {
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: 15px var(--font-mono);
  }
  .state {
    font: 12px var(--font-mono);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li button {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    text-align: left;
  }
  li button:hover:not(:disabled) {
    border-color: var(--line-control);
  }
  .meta {
    display: flex;
    gap: var(--space-3);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .name {
    font: 600 13px var(--font-mono);
    color: var(--ink);
  }
  .time {
    margin-left: auto;
    font-family: var(--font-mono);
  }
  .snippet {
    font-size: 13px;
    line-height: 20px;
  }
  mark {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
</style>

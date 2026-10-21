<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import Search from '@lucide/svelte/icons/search'
  import { app } from './lib/state.svelte'
  import { ACTIONS } from './lib/commands'
  import { normalizeCombo } from './lib/keys'
  import Kbd from './Kbd.svelte'

  /** Todos os atalhos (tela 07), em 4 grupos, com busca e a notação do macOS ou do Windows/Linux. */
  type Row = { label: string; combo: string }
  const GROUPS: { title: string; rows: (string | Row)[] }[] = [
    { title: 'geral', rows: ['palette', { label: 'Esta lista de atalhos', combo: '?' }, 'waiting', 'settings', 'history', 'usage', 'agents', 'board'] },
    { title: 'chats e painéis', rows: ['newChat', 'split', 'closePane', 'nextTab', 'prevTab', 'panel', 'search', 'diff', 'editor', 'prevPrompt', 'nextPrompt'] },
    {
      title: 'prompt',
      rows: [
        { label: 'Alternar agente (tela inicial, campo vazio)', combo: 'Tab' },
        { label: 'Enviar', combo: 'Enter' },
        'queue',
        'broadcast',
        { label: 'Arquivo no contexto (no Claude)', combo: '@' },
      ],
    },
    { title: 'aprovação', rows: ['approveOnce', 'approveAlways', { label: 'Recusar', combo: 'Esc' }, 'reason'] },
  ]

  const MAC: Record<string, string> = { Ctrl: '⌘', Shift: '⇧', Alt: '⌥', Meta: '⌘', Enter: '↵', ArrowUp: '↑', ArrowDown: '↓', Tab: 'Tab' }
  const PC: Record<string, string> = { Enter: '↵', ArrowUp: '↑', ArrowDown: '↓' }

  let query = $state('')
  let mac = $state(navigator.userAgent.includes('Mac'))

  const rowOf = (entry: string | Row): Row | undefined =>
    typeof entry === 'string' ? (ACTIONS[entry] ? { label: ACTIONS[entry].label, combo: app.settings.keys[entry] ?? '' } : undefined) : entry
  const keysOf = (combo: string) => {
    if (!combo) return ['—']
    const parts = combo.length === 1 ? [combo] : normalizeCombo(combo).split('+')
    return parts.map((k) => (mac ? MAC : PC)[k] ?? k)
  }
  const groups = $derived(
    GROUPS.map((g) => ({
      title: g.title,
      rows: g.rows.map(rowOf).filter((r): r is Row => !!r && r.label.toLowerCase().includes(query.trim().toLowerCase())),
    })).filter((g) => g.rows.length > 0),
  )
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Esc fecha pelo App) -->
<div class="backdrop top" onclick={(e) => e.target === e.currentTarget && (app.modal = null)}>
  <div class="modal shortcuts" role="dialog" aria-modal="true" aria-label="Atalhos">
    <header>
      <h2>atalhos</h2>
      <label class="search">
        <Search size={16} strokeWidth={1.5} />
        <input bind:value={query} placeholder="Buscar atalho ou ação" aria-label="Buscar atalho ou ação" />
      </label>
      <div class="segmented" role="radiogroup" aria-label="Sistema">
        <button role="radio" aria-checked={mac} class:on={mac} onclick={() => (mac = true)}>macOS</button>
        <button role="radio" aria-checked={!mac} class:on={!mac} onclick={() => (mac = false)}>Windows / Linux</button>
      </div>
      <button class="icon-btn" aria-label="Fechar" title="Fechar (Esc)" onclick={() => (app.modal = null)}><X size={16} strokeWidth={1.5} /></button>
    </header>
    <div class="grid">
      {#each groups as group (group.title)}
        <section>
          <p class="overline">{group.title}</p>
          {#each group.rows as row (row.label)}
            <div class="row"><span>{row.label}</span><Kbd keys={keysOf(row.combo)} /></div>
          {/each}
        </section>
      {:else}
        <p class="empty">Nenhum atalho com “{query.trim()}”.</p>
      {/each}
    </div>
    <footer>Abre com <strong>?</strong> fora do terminal, ou pelo botão Atalhos embaixo do chat. Troque os atalhos em Configurações › Atalhos.</footer>
  </div>
</div>

<style>
  .shortcuts {
    width: min(960px, calc(100vw - 32px));
    padding: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--line);
  }
  h2 {
    margin: 0;
  }
  .search {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2);
    height: 34px;
    padding: 0 var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    color: var(--ink-muted);
  }
  .search input {
    flex: 1;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font-size: 13px;
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
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
    gap: var(--space-6) var(--space-8);
    max-height: 60vh;
    overflow-y: auto;
    padding: var(--space-6);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .empty {
    color: var(--ink-muted);
  }
  footer {
    padding: var(--space-3) var(--space-6);
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>

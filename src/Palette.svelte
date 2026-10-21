<script lang="ts">
  import { untrack } from 'svelte'
  import Search from '@lucide/svelte/icons/search'
  import Kbd from './Kbd.svelte'
  import { app } from './lib/state.svelte'
  import { buildCommands, GROUPS, highlight, matches, type Command } from './lib/commands'
  import { normalizeCombo } from './lib/keys'

  const MAX_PER_GROUP = 12

  let query = $state(app.paletteQuery)
  let selected = $state(0)
  let input = $state<HTMLInputElement>()
  let list = $state<HTMLDivElement>()

  const commands = buildCommands()
  const groups = $derived(
    GROUPS.map((group) => ({
      group,
      items: commands.filter((c) => c.group === group && matches(c.label, query)).slice(0, MAX_PER_GROUP),
    })).filter((g) => g.items.length > 0),
  )
  const flat = $derived(groups.flatMap((g) => g.items))

  // Só ao abrir: foco com o cursor no fim do texto inicial (sem reagir a cada tecla).
  $effect(() => {
    if (!input) return
    const end = untrack(() => query.length)
    input.focus()
    input.setSelectionRange(end, end)
  })

  $effect(() => {
    list?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  })

  function run(command: Command | undefined) {
    if (!command) return
    app.modal = null
    command.run()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') selected = Math.min(selected + 1, flat.length - 1)
    else if (e.key === 'ArrowUp') selected = Math.max(selected - 1, 0)
    else if (e.key === 'Enter') run(flat[selected])
    else return
    e.preventDefault()
  }

  const keysOf = (combo: string) => normalizeCombo(combo).split('+')
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Esc fecha pelo App) -->
<div class="backdrop top" onclick={(e) => e.target === e.currentTarget && (app.modal = null)}>
  <div class="palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
    <div class="search">
      <Search size={16} strokeWidth={1.5} />
      <input
        bind:this={input}
        bind:value={query}
        oninput={() => (selected = 0)}
        onkeydown={onKey}
        placeholder="Buscar ação, sessão ou snippet"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        spellcheck="false"
      />
      <Kbd keys={['Esc']} />
    </div>

    <div id="palette-list" class="results" role="listbox" bind:this={list}>
      {#each groups as { group, items } (group)}
        <p class="overline">{group}</p>
        {#each items as command (command.id)}
          {@const index = flat.indexOf(command)}
          <button
            class="item"
            class:selected={index === selected}
            data-index={index}
            role="option"
            aria-selected={index === selected}
            onmousemove={() => (selected = index)}
            onclick={() => run(command)}
          >
            <span class="caret" aria-hidden="true">{index === selected ? '›' : ''}</span>
            <span class="label" class:mono={command.mono}>
              {#each highlight(command.label, query) as part, i (i)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
            </span>
            {#if command.hint}
              <Kbd keys={keysOf(command.hint)} />
            {:else if command.detail}
              <span class="detail" style:color={command.detailColor}>{command.detail}</span>
            {/if}
          </button>
        {/each}
      {:else}
        <p class="empty">Nada encontrado para “{query}”.</p>
      {/each}
    </div>

    <footer>
      <span><Kbd keys={['↑']} /><Kbd keys={['↓']} /> navegar</span>
      <span><Kbd keys={['↵']} /> abrir</span>
      <span class="spacer"></span>
      <span class="mono">{flat.length} {flat.length === 1 ? 'resultado' : 'resultados'}</span>
    </footer>
  </div>
</div>

<style>
  .palette {
    display: flex;
    flex-direction: column;
    width: min(640px, calc(100vw - 32px));
    max-height: 70vh;
    border-radius: var(--radius-lg);
    background: var(--bg-200);
    box-shadow: var(--shadow-pop);
    overflow: hidden;
  }
  .search {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 52px;
    padding: 0 var(--space-4);
    border-bottom: 1px solid var(--line);
    color: var(--ink-muted);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: 15px/22px var(--font-mono);
    caret-color: var(--accent);
  }
  .search input::placeholder {
    color: var(--ink-faint);
  }
  .results {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }
  .overline {
    padding: var(--space-3) var(--space-2) var(--space-2);
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    height: 36px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-md);
    text-align: left;
    font-size: 14px;
  }
  .item.selected {
    background: var(--bg-300);
  }
  .caret {
    width: 12px;
    font: 600 13px var(--font-mono);
    color: var(--accent);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .label.mono,
  .mono {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  mark {
    background: none;
    color: var(--accent);
    font-weight: 600;
  }
  .detail {
    flex: none;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .empty {
    padding: var(--space-4) var(--space-2);
    color: var(--ink-muted);
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: 36px;
    padding: 0 var(--space-4);
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-muted);
  }
  footer span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .spacer {
    flex: 1;
  }
</style>

<script lang="ts">
  import { app } from './lib/state.svelte'
  import { buildCommands, matches, type Command } from './lib/commands'

  const MAX_RESULTS = 50

  let query = $state(app.paletteQuery)
  let selected = $state(0)
  let input = $state<HTMLInputElement>()
  let list = $state<HTMLUListElement>()

  const commands = buildCommands()
  const results = $derived(commands.filter((c) => matches(c.label, query)).slice(0, MAX_RESULTS))

  $effect(() => {
    input?.focus()
    input?.setSelectionRange(query.length, query.length)
  })

  $effect(() => {
    list?.children[selected]?.scrollIntoView({ block: 'nearest' })
  })

  function run(command: Command | undefined) {
    if (!command) return
    app.modal = null
    command.run()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.modal = null
    else if (e.key === 'ArrowDown') selected = Math.min(selected + 1, results.length - 1)
    else if (e.key === 'ArrowUp') selected = Math.max(selected - 1, 0)
    else if (e.key === 'Enter') run(results[selected])
    else return
    e.preventDefault()
  }
</script>

<div class="backdrop top">
  <div class="palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
    <input
      bind:this={input}
      bind:value={query}
      oninput={() => (selected = 0)}
      onkeydown={onKey}
      placeholder="Digite um comando, chat ou snippet…"
      role="combobox"
      aria-expanded="true"
      aria-controls="palette-list"
    />
    <ul id="palette-list" role="listbox" bind:this={list}>
      {#each results as command, i (command.id)}
        <li role="option" aria-selected={i === selected}>
          <button class:selected={i === selected} onmousemove={() => (selected = i)} onclick={() => run(command)}>
            <span>{command.label}</span>
            {#if command.hint}<kbd>{command.hint}</kbd>{/if}
          </button>
        </li>
      {:else}
        <li class="empty">Nada encontrado</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .palette {
    width: min(620px, calc(100vw - 32px));
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    color: var(--fg);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.45);
    overflow: hidden;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 14px 16px;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
    color: var(--fg);
    font: 15px inherit;
  }
  input:focus {
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 6px;
    max-height: 50vh;
    overflow-y: auto;
  }
  li button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 10px;
    border-radius: 6px;
    text-align: left;
  }
  li button.selected {
    background: var(--selected);
  }
  kbd {
    flex: none;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    font: 11px var(--mono);
    color: var(--muted);
  }
  .empty {
    padding: 10px;
    color: var(--muted);
  }
</style>

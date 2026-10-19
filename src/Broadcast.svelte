<script lang="ts">
  import { app, chatById, openIds, STATUS } from './lib/state.svelte'
  import { broadcast } from './lib/automation'

  const open = openIds()
  const activeTabPanes = app.tabs.find((t) => t.id === app.activeTab)?.panes ?? []
  // Padrão: os chats da divisão atual; se for um só, todos os abertos.
  let selected = $state<string[]>(activeTabPanes.length > 1 ? [...activeTabPanes] : [...open])
  let text = $state('')

  function send(e: SubmitEvent) {
    e.preventDefault()
    broadcast(text, selected)
    app.modal = null
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.modal = null
    if (e.key === 'Enter' && e.ctrlKey) e.currentTarget instanceof HTMLElement && e.currentTarget.closest('form')?.requestSubmit()
  }
</script>

<div class="backdrop">
  <div role="dialog" aria-modal="true" aria-label="Broadcast">
    <form class="modal" onsubmit={send}>
      <h2>Broadcast</h2>
      <p class="sub">O mesmo prompt é colado e enviado em cada chat marcado.</p>

      {#if open.length === 0}
        <p class="sub">Nenhum chat aberto.</p>
      {:else}
        <fieldset>
          <legend>Enviar para</legend>
          {#each open as id (id)}
            {@const status = app.status[id]}
            <label class="check">
              <input type="checkbox" value={id} bind:group={selected} />
              <span class="dot" style:--dot={status ? STATUS[status].color : 'transparent'}></span>
              {chatById(id)?.name}
            </label>
          {/each}
        </fieldset>
      {/if}

      <label>
        Prompt
        <!-- svelte-ignore a11y_autofocus -->
        <textarea bind:value={text} rows="6" autofocus onkeydown={onKey}></textarea>
      </label>

      <div class="actions">
        <span class="hint">Ctrl+Enter envia</span>
        <button type="button" class="btn" onclick={() => (app.modal = null)}>Cancelar</button>
        <button type="submit" class="btn primary" disabled={!text.trim() || selected.length === 0}>
          Enviar para {selected.length}
        </button>
      </div>
    </form>
  </div>
</div>

<style>
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin: 0 0 14px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  legend {
    padding: 0 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .check {
    flex-direction: row !important;
    align-items: center;
    gap: 8px !important;
    color: var(--fg) !important;
    font-size: 13px !important;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dot);
  }
</style>

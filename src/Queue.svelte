<script lang="ts">
  import { app, chatById, STATUS } from './lib/state.svelte'
  import { dequeue, enqueue } from './lib/automation'

  const id = app.active ?? ''
  const chat = chatById(id)
  let text = $state('')

  const items = $derived(app.queue[id] ?? [])
  const status = $derived(app.status[id])

  function add(e: SubmitEvent) {
    e.preventDefault()
    enqueue(id, text)
    text = ''
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') app.modal = null
    if (e.key === 'Enter' && e.ctrlKey) e.currentTarget instanceof HTMLElement && e.currentTarget.closest('form')?.requestSubmit()
  }
</script>

<div class="backdrop">
  <div role="dialog" aria-modal="true" aria-label="Fila de prompts">
    <form class="modal" onsubmit={add}>
      <h2>Fila · {chat?.name ?? 'sem chat'}</h2>
      <p class="sub">
        Cada prompt é enviado quando o agente termina o anterior.
        Agora: <b style:color={status ? STATUS[status].color : 'inherit'}>{status ? STATUS[status].label : 'fechado'}</b>
      </p>

      {#if items.length > 0}
        <ol>
          {#each items as item, i (i)}
            <li>
              <span>{item}</span>
              <button type="button" title="Remover da fila" onclick={() => dequeue(id, i)}>×</button>
            </li>
          {/each}
        </ol>
      {/if}

      <label>
        Próximo prompt
        <!-- svelte-ignore a11y_autofocus -->
        <textarea bind:value={text} rows="4" autofocus onkeydown={onKey}></textarea>
      </label>

      <div class="actions">
        <span class="hint">Ctrl+Enter adiciona</span>
        <button type="button" class="btn" onclick={() => (app.modal = null)}>Fechar</button>
        <button type="submit" class="btn primary" disabled={!text.trim() || !chat}>Adicionar à fila</button>
      </div>
    </form>
  </div>
</div>

<style>
  ol {
    margin: 0 0 14px;
    padding-left: 22px;
  }
  li {
    padding: 4px 0;
  }
  li span {
    white-space: pre-wrap;
  }
  li button {
    margin-left: 8px;
    color: var(--muted);
  }
  li button:hover {
    color: #e5484d;
  }
</style>

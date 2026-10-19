<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import GripVertical from '@lucide/svelte/icons/grip-vertical'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import { app, chatById } from './lib/state.svelte'
  import { clearQueue, dequeue, enqueue, moveQueued, queueOf, setQueueOption } from './lib/queue'

  const id = app.active ?? ''
  const chat = chatById(id)
  let text = $state('')
  let dragged: number | null = null

  const queue = $derived(queueOf(id))
  const sentCount = $derived(queue.sent.length)

  function add(e?: SubmitEvent) {
    e?.preventDefault()
    enqueue(id, text)
    text = ''
  }

  function drop(to: number) {
    if (dragged !== null && dragged !== to) moveQueued(id, dragged, to)
    dragged = null
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<div class="backdrop">
  <div class="modal queue" role="dialog" aria-modal="true" aria-label="Fila de prompts">
    <div class="content">
      <header>
        <h2>fila de prompts</h2>
        {#if chat}<span class="badge">{chat.name}</span>{/if}
        <span class="spacer"></span>
        <button class="icon-btn" aria-label="Fechar" onclick={() => (app.modal = null)}><X size={16} strokeWidth={1.5} /></button>
      </header>
      <p class="sub">Cada prompt é enviado quando o agente termina o anterior. Arraste para reordenar.</p>

      <ol class="items">
        {#each queue.sent as item, i (i)}
          <li class="item done">
            <span class="handle"></span>
            <span class="no">{i + 1}</span>
            <span class="text">{item}</span>
            <span class="badge success">✓ enviado</span>
          </li>
        {/each}
        {#if queue.current}
          <li class="item current">
            <span class="handle caret">›</span>
            <span class="no">{sentCount + 1}</span>
            <span class="text">{queue.current}</span>
            <span class="state">em execução</span>
          </li>
        {/if}
        {#each queue.pending as item, i (i)}
          <li
            class="item pending"
            draggable="true"
            ondragstart={() => (dragged = i)}
            ondragover={(e) => e.preventDefault()}
            ondrop={() => drop(i)}
          >
            <span class="handle" aria-hidden="true"><GripVertical size={14} strokeWidth={1.5} /></span>
            <span class="no">{sentCount + (queue.current ? 2 : 1) + i}</span>
            <span class="text">{item}</span>
            <span class="state">{i === 0 ? (queue.paused ? '‖ pausado' : 'próximo') : 'aguardando'}</span>
            <button class="icon-btn" aria-label="Remover da fila" onclick={() => dequeue(id, i)}><X size={14} strokeWidth={1.5} /></button>
          </li>
        {/each}
        <li class="item add">
          <form onsubmit={add}>
            <span class="handle"></span>
            <span class="no">{sentCount + (queue.current ? 1 : 0) + queue.pending.length + 1}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input bind:value={text} placeholder="Adicionar prompt à fila" aria-label="Adicionar prompt à fila" autofocus disabled={!chat} />
            <button class="enter" type="submit" aria-label="Adicionar" disabled={!text.trim()}><CornerDownLeft size={14} strokeWidth={1.5} /></button>
          </form>
        </li>
      </ol>

      <div class="options">
        <label>
          <input type="checkbox" checked={queue.pauseOnError} onchange={(e) => setQueueOption(id, { pauseOnError: e.currentTarget.checked })} />
          Pausar a fila se o agente parar com erro
        </label>
        <label>
          <input type="checkbox" checked={queue.confirm} onchange={(e) => setQueueOption(id, { confirm: e.currentTarget.checked })} />
          Pedir minha confirmação antes de cada envio
        </label>
      </div>
    </div>

    <footer>
      <span class="summary">
        {queue.pending.length} na fila · {queue.current ? 1 : 0} em execução · {sentCount} {sentCount === 1 ? 'enviado' : 'enviados'}
      </span>
      <button class="btn ghost" disabled={queue.pending.length === 0} onclick={() => clearQueue(id)}>Limpar fila</button>
      <button class="btn" onclick={() => setQueueOption(id, { paused: !queue.paused })}>{queue.paused ? 'Retomar fila' : 'Pausar fila'}</button>
      <button class="btn primary" onclick={() => (app.modal = null)}>Concluir</button>
    </footer>
  </div>
</div>

<style>
  .queue {
    width: min(680px, calc(100vw - 32px));
    padding: 0;
  }
  .content {
    padding: var(--space-6) var(--space-6) var(--space-4);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .spacer {
    flex: 1;
  }
  .items {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 44px;
    padding: 0 var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-100);
    font: 13px var(--font-mono);
  }
  .item.done {
    color: var(--ink-muted);
  }
  .item.current {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .item.pending {
    cursor: grab;
  }
  .item.add {
    border-style: dashed;
    background: transparent;
  }
  .item.add form {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
  }
  .handle {
    display: inline-grid;
    place-items: center;
    width: 16px;
    color: var(--ink-muted);
  }
  .caret {
    font-weight: 600;
    color: var(--accent);
  }
  .no {
    width: 20px;
    text-align: right;
    color: var(--ink-muted);
  }
  .current .no {
    color: var(--accent);
  }
  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    font: 12px var(--font-sans);
    color: var(--ink-muted);
  }
  .current .state {
    color: var(--accent-strong);
    font-family: var(--font-mono);
  }
  .item.add input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: 13px var(--font-mono);
    caret-color: var(--accent);
  }
  .item.add input::placeholder {
    color: var(--ink-faint);
  }
  .enter {
    display: grid;
    place-items: center;
    width: 28px;
    height: 22px;
    border: 1px solid var(--line-control);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }
  .options label {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: 13px;
  }
  .options input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    border-top: 1px solid var(--line);
  }
  .summary {
    flex: 1;
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>

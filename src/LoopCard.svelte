<script lang="ts">
  import { app, requestClosePane } from './lib/state.svelte'
  import { resumeLoop } from './lib/automation'

  /** "Pausei este agente para evitar um loop" (tela 10): retomar como está, com instrução, ou encerrar. */
  let { chatId }: { chatId: string } = $props()

  const paused = $derived(app.loopPaused[chatId])
  const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  let instruction = $state('')
  let withText = $state(false)

  function resume(e?: SubmitEvent) {
    e?.preventDefault()
    resumeLoop(chatId, withText ? instruction : undefined)
    instruction = ''
    withText = false
  }

  const focus = (node: HTMLInputElement) => node.focus()
</script>

{#if paused}
  <section class="loop" role="alert" aria-label="Agente pausado pelo anti-loop">
    <p class="repeat">
      <span class="x">× {paused.count}</span> mesmo comando · {clock.format(paused.from)} – {clock.format(paused.to)}
      <code>{paused.command}</code>
    </p>
    <div class="card">
      <span class="glyph" aria-hidden="true">‖</span>
      <div class="text">
        <strong>Pausei este agente para evitar um loop</strong>
        <p>Ele tentou o mesmo comando {paused.count} vezes sem mudar nenhum arquivo. Retome como está ou diga o que fazer diferente.</p>
        {#if withText}
          <form onsubmit={resume}>
            <input class="input" bind:value={instruction} use:focus placeholder="Instrução para retomar (ex.: rode o rollback antes)" aria-label="Instrução para retomar" />
            <button class="btn primary sm" type="submit" disabled={!instruction.trim()}>Retomar</button>
          </form>
        {:else}
          <div class="actions">
            <button class="btn primary sm" onclick={() => resume()}>Retomar</button>
            <button class="btn sm" onclick={() => (withText = true)}>Retomar com instrução</button>
            <button class="btn ghost sm" onclick={() => requestClosePane(chatId)}>Encerrar chat</button>
          </div>
        {/if}
      </div>
    </div>
  </section>
{/if}

<style>
  .loop {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0 var(--space-3) var(--space-2);
  }
  .repeat {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--line-control);
    border-radius: var(--radius-md);
    font: 12px var(--font-mono);
    color: var(--ink-muted);
  }
  .repeat code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    color: var(--danger);
  }
  .card {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-200);
  }
  .glyph {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-sm);
    background: var(--warning-soft);
    color: var(--warning);
    font: 600 14px var(--font-mono);
  }
  .text p {
    margin: var(--space-1) 0 var(--space-3);
    font-size: 13px;
    color: var(--ink-muted);
  }
  .actions,
  form {
    display: flex;
    gap: var(--space-2);
  }
  form .input {
    flex: 1;
  }
</style>

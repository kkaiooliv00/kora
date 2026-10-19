<script lang="ts">
  import { app } from './lib/state.svelte'
  import { terminals } from './lib/terminals'

  /**
   * Responde o pedido de permissão do Claude como se fosse no teclado:
   * Enter aceita a opção marcada (Sim), "2" escolhe "sim, e não perguntar de novo", Esc recusa.
   */
  const APPROVE = '\r'
  const APPROVE_ALWAYS = '2'
  const REFUSE = '\x1b'

  let { chatId }: { chatId: string } = $props()
  const message = $derived(app.agentInfo[chatId]?.permission)
  const visible = $derived(app.status[chatId] === 'waiting' && Boolean(message))

  function answer(keys: string) {
    terminals.get(chatId)?.keys(keys)
    app.agentInfo[chatId] = { ...app.agentInfo[chatId], permission: undefined }
  }
</script>

{#if visible}
  <div class="card" role="alertdialog" aria-label="Pedido de permissão do agente">
    <span class="glyph" aria-hidden="true">!</span>
    <div class="text">
      <p class="title">O agente quer sua permissão</p>
      <p class="message">{message}. Confira o pedido no terminal abaixo.</p>
      <div class="actions">
        <button class="btn primary sm" onclick={() => answer(APPROVE)}>Aprovar <span class="shortcut">↵</span></button>
        <button class="btn sm" onclick={() => answer(APPROVE_ALWAYS)}>Aprovar e não perguntar de novo</button>
        <span class="spacer"></span>
        <button class="btn danger sm" onclick={() => answer(REFUSE)}>Recusar <span class="shortcut">Esc</span></button>
      </div>
    </div>
  </div>
{/if}

<style>
  .card {
    position: absolute;
    top: var(--space-3);
    left: var(--space-4);
    right: var(--space-4);
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--warning);
    border-radius: var(--radius-md);
    background: var(--warning-soft);
    box-shadow: var(--shadow-pop);
    z-index: 6;
  }
  .glyph {
    font: 600 15px/22px var(--font-mono);
    color: var(--warning);
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .title {
    margin: 0;
    font-size: 15px;
    line-height: 22px;
    font-weight: 600;
  }
  .message {
    margin: 2px 0 var(--space-3);
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .spacer {
    flex: 1;
  }
</style>

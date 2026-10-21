<script lang="ts">
  import { app } from './lib/state.svelte'
  import { actionOf, answer, pendingApproval, risks, RISK_TONE, ruleOf } from './lib/approval'
  import Kbd from './Kbd.svelte'
  import { normalizeCombo } from './lib/keys'

  /**
   * Pedido de permissão do Claude no rodapé do painel (tela 04): o que ele quer fazer, o motivo,
   * os riscos e a regra que fez pedir. Os botões respondem no terminal como se fosse o teclado.
   */
  let { chatId, compact = false }: { chatId: string; compact?: boolean } = $props()

  const visible = $derived(pendingApproval(chatId))
  const info = $derived(app.agentInfo[chatId])
  const pending = $derived(info?.pending)
  const action = $derived(actionOf(pending) || info?.permission || '')
  const badges = $derived(risks(pending))
  const rule = $derived(ruleOf(pending))
  // Ctrl+Shift+I ("Ver motivo e regra") liga isto no chat em foco; no painel compacto começa fechado.
  const expanded = $derived(!compact || app.showReason === chatId)
  const keysOf = (combo: string | undefined) => (combo ? normalizeCombo(combo).split('+') : [])

  function openRule() {
    app.settingsSection = 'permissoes'
    app.modal = 'settings'
  }
</script>

{#if visible}
  <div class="approval" class:compact role="alertdialog" aria-label="Pedido de aprovação do agente" data-tour="approval">
    <header>
      <span class="prompt" aria-hidden="true">›</span>
      <code class="action" title={action}>{action}</code>
      <span class="who">agente</span>
      <span class="state">! aguardando aprovação</span>
    </header>
    {#if pending?.reason || badges.length}
      <div class="why">
        {#if pending?.reason}<p class="reason"><span aria-hidden="true">↳</span> {pending.reason}</p>{/if}
        <span class="badges">
          {#each badges as risk (risk)}<span class="badge {RISK_TONE[risk]}">{risk}</span>{/each}
        </span>
      </div>
    {/if}
    <footer>
      {#if expanded}
        <p class="rule">
          {#if rule}Pedi porque "{rule.label}" está em <strong>{rule.policy}</strong> ·{:else}{info?.permission} ·{/if}
          <button class="link" onclick={openRule}>Mudar regra</button>
        </p>
      {:else}
        <button class="link" onclick={() => (app.showReason = chatId)}>Por que pediu?</button>
      {/if}
      <span class="spacer"></span>
      <button class="btn danger sm" onclick={() => answer(chatId, 'refuse')} title="Recusar (Esc no terminal)">Recusar <span class="hint">Esc</span></button>
      {#if !compact}
        <button class="btn sm" onclick={() => answer(chatId, 'always')} title="Aprovar sempre ({normalizeCombo(app.settings.keys.approveAlways ?? '')})">Aprovar sempre</button>
      {/if}
      <button class="btn primary sm" onclick={() => answer(chatId, 'once')} title="Aprovar uma vez">
        {compact ? 'Aprovar' : 'Aprovar uma vez'}
        {#if !compact}<Kbd keys={keysOf(app.settings.keys.approveOnce)} />{/if}
      </button>
    </footer>
    {#if !compact && pending?.command}
      <p class="note">
        <span class="i" aria-hidden="true">i</span>
        <strong>Aprovar sempre</strong> deixa o agente rodar <code>{pending.command.split(' ').slice(0, 3).join(' ')}…</code> sem perguntar, só neste
        projeto. Dá para desfazer em <code>.claude/settings.local.json</code> do projeto.
      </p>
    {/if}
  </div>
{/if}

<style>
  .approval {
    flex: none;
    margin: 0 var(--space-3) var(--space-2);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    font-size: 13px;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--line);
    font-family: var(--font-mono);
  }
  .prompt {
    color: var(--accent);
  }
  .action {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 13px var(--font-mono);
  }
  .who {
    color: var(--accent);
  }
  .state {
    color: var(--warning);
    white-space: nowrap;
  }
  .why {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--line);
  }
  .reason {
    flex: 1;
    margin: 0;
    color: var(--ink-muted);
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-left: auto;
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
  }
  .rule {
    margin: 0;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .spacer {
    flex: 1;
  }
  .hint {
    margin-left: var(--space-1);
    font: 11px var(--font-mono);
    opacity: 0.8;
  }
  .note {
    display: block;
    margin: 0 var(--space-4) var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--line-control);
    border-radius: var(--radius-md);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .note .i {
    margin-right: var(--space-2);
    color: var(--accent);
    font-family: var(--font-mono);
  }
  .compact header,
  .compact .why,
  .compact footer {
    padding-left: var(--space-3);
    padding-right: var(--space-3);
  }
  .compact .why {
    flex-direction: column;
  }
  .compact .badges {
    margin-left: 0;
  }
  .link {
    white-space: nowrap;
    font-size: 12px;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>

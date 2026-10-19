<script lang="ts">
  import { app, chatById } from './lib/state.svelte'
  import { CATEGORIES, type Policy } from './lib/permissions'
  import EmptyState from './EmptyState.svelte'

  // Janela de contexto padrão do Claude; acima disso o modelo é de 1M (variante [1m]).
  const DEFAULT_WINDOW = 200_000
  const LARGE_WINDOW = 1_000_000

  const POLICY: Record<Policy, { text: string; tone: string }> = {
    allow: { text: '✓ sempre', tone: 'success' },
    ask: { text: '! perguntar', tone: 'warning' },
    deny: { text: '✗ nunca', tone: 'danger' },
  }
  const TODO_GLYPH: Record<string, string> = { completed: '✓', in_progress: '…', pending: '·' }

  const chat = $derived(app.active ? chatById(app.active) : undefined)
  const isClaude = $derived(app.profiles.find((p) => p.id === chat?.profileId)?.hooks === 'claude')
  const info = $derived(app.active ? app.agentInfo[app.active] : undefined)
  const contextWindow = $derived(
    info?.context && (info.context.tokens > DEFAULT_WINDOW || info.context.model.includes('1m')) ? LARGE_WINDOW : DEFAULT_WINDOW,
  )
  const contextPct = $derived(info?.context ? Math.min(100, Math.round((info.context.tokens / contextWindow) * 100)) : 0)
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
</script>

<aside class="panel" aria-label="Painel do agente">
  {#if !chat}
    <EmptyState kind="empty" title="Nenhum chat em foco" compact>Abra um chat para ver o plano e o contexto do agente.</EmptyState>
  {:else if !isClaude}
    <p class="overline">agente</p>
    <EmptyState kind="empty" title="Painel indisponível para este agente" compact>
      O plano e o contexto vêm dos hooks do Claude. Acompanhe {chat.name} pelo terminal.
    </EmptyState>
  {:else}
    <section>
      <p class="overline">plano</p>
      {#if info?.todos?.length}
        <ul class="todos">
          {#each info.todos as todo, i (i)}
            <li class={todo.status}>
              <span class="glyph" aria-hidden="true">{TODO_GLYPH[todo.status] ?? '·'}</span>
              <span>{todo.content}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState kind="empty" title="Sem plano ainda" compact>
          O agente monta um plano quando a tarefa tem mais de um passo. Peça algo maior ou peça um plano.
        </EmptyState>
      {/if}
    </section>

    <section>
      <p class="overline">permissões</p>
      <ul class="perms">
        {#each CATEGORIES as category (category.key)}
          {@const policy = POLICY[app.settings.permissions[category.key]]}
          <li>
            <span>{category.label}</span>
            <span class="badge {policy.tone}">{policy.text}</span>
          </li>
        {/each}
      </ul>
      <button class="link" onclick={() => (app.modal = 'settings')}>Editar permissões</button>
    </section>

    <section>
      <p class="overline">contexto</p>
      {#if info?.context}
        <div class="meter" role="meter" aria-valuenow={contextPct} aria-valuemin={0} aria-valuemax={100} aria-label="Contexto usado">
          <div style:width="{contextPct}%"></div>
        </div>
        <p class="muted">
          {contextPct}% da janela de contexto usada ({compact.format(info.context.tokens)} de {compact.format(contextWindow)} tokens)
        </p>
      {:else}
        <EmptyState kind="empty" title="Sem dados de contexto" compact>Aparece depois da primeira resposta do agente.</EmptyState>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
    border-left: 1px solid var(--line);
    background: var(--bg-100);
    font-size: 13px;
    line-height: 18px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .muted {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--ink-muted);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .todos li {
    display: flex;
    gap: var(--space-2);
  }
  .todos .glyph {
    flex: none;
    width: 12px;
    font: 600 13px var(--font-mono);
  }
  .todos .completed .glyph {
    color: var(--success);
  }
  .todos .in_progress .glyph {
    color: var(--accent);
  }
  .todos .pending {
    color: var(--ink-muted);
  }
  .perms li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .link {
    align-self: flex-start;
    font-size: 12px;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .meter {
    height: 4px;
    border-radius: 2px;
    background: var(--bg-300);
    overflow: hidden;
  }
  .meter div {
    height: 100%;
    background: var(--accent);
  }
</style>

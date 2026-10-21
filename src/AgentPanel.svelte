<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { ask } from '@tauri-apps/plugin-dialog'
  import { app, chatById, chatDir, fail } from './lib/state.svelte'
  import { toast } from './lib/toasts.svelte'
  import { terminals } from './lib/terminals'
  import { CATEGORIES, type Policy } from './lib/permissions'
  import EmptyState from './EmptyState.svelte'
  import { sharedWith } from './lib/automation'
  import { contextPercent, contextWindow, formatMemory, percent, procStats } from './lib/stats.svelte'

  const POLICY: Record<Policy, { text: string; tone: string }> = {
    allow: { text: '✓ sem perguntar', tone: 'success' },
    ask: { text: '! pergunta antes', tone: 'warning' },
    deny: { text: '✗ nunca', tone: 'danger' },
  }
  const TODO_GLYPH: Record<string, string> = { completed: '✓', in_progress: '…', pending: '·' }

  const chat = $derived(app.active ? chatById(app.active) : undefined)
  const isClaude = $derived(app.profiles.find((p) => p.id === chat?.profileId)?.hooks === 'claude')
  const info = $derived(app.active ? app.agentInfo[app.active] : undefined)
  const windowSize = $derived(contextWindow(info))
  const contextPct = $derived(contextPercent(info) ?? 0)
  const proc = $derived(app.active ? procStats[app.active] : undefined)
  const touched = $derived(app.active ? (app.touched[app.active] ?? []) : [])
  const CHECKPOINTS_SHOWN = 8
  type Checkpoint = { ref: string; time: number; label: string }
  let checkpoints = $state<Checkpoint[]>([])
  let restoring = $state('')
  const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dated = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  const when = (t: number) => (new Date(t).toDateString() === new Date().toDateString() ? clock : dated).format(t)

  // Recarrega quando muda o chat em foco ou ele ganha um ponto novo (hook antes do prompt).
  $effect(() => {
    const id = app.active
    void (id && app.checkpointRev[id])
    const dir = chat && isClaude ? chatDir(chat) : undefined
    if (!id || !dir) {
      checkpoints = []
      return
    }
    invoke<Checkpoint[]>('checkpoints', { dir, chat: id })
      .then((list) => app.active === id && (checkpoints = list ?? []))
      .catch(() => app.active === id && (checkpoints = []))
  })

  async function restore(cp: Checkpoint) {
    const dir = chat && chatDir(chat)
    if (!chat || !dir) return
    const ok = await ask(`Voltar os arquivos de ${chat.name} para antes de "${cp.label}"? O estado atual vira outro ponto, então dá para desfazer.`, {
      title: 'Restaurar ponto',
      kind: 'warning',
    })
    if (!ok) return
    restoring = cp.ref
    try {
      await invoke('restore_checkpoint', { dir, chat: chat.id, reference: cp.ref })
      app.checkpointRev[chat.id] = (app.checkpointRev[chat.id] ?? 0) + 1
      toast({ tone: 'success', title: 'Arquivos restaurados', text: `Estado de antes de "${cp.label}".` })
    } catch (e) {
      fail('Não foi possível restaurar', e)
    } finally {
      restoring = ''
    }
  }

  /** O /compact do Claude resume a conversa e libera a memória. */
  function compactConversation() {
    if (app.active) terminals.get(app.active)?.submit('/compact')
  }

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
      <p class="overline">o que o agente pode fazer</p>
      <ul class="perms">
        {#each CATEGORIES as category (category.key)}
          {@const policy = POLICY[app.settings.permissions[category.key]]}
          <li>
            <span>{category.label}</span>
            <span class="badge {policy.tone}">{policy.text}</span>
          </li>
        {/each}
      </ul>
      <button class="link" onclick={() => ((app.settingsSection = 'permissoes'), (app.modal = 'settings'))}>Editar permissões</button>
    </section>

    <section>
      <p class="overline">arquivos alterados</p>
      {#if touched.length}
        <ul class="files">
          {#each touched as path (path)}
            {@const others = sharedWith(chat, path)}
            <li title={others.length ? `também editado por ${others.map((c) => c.name).join(', ')}` : path}>
              {#if others.length}<span class="conflict" aria-label="editado por outro chat">!</span>{/if}
              <span class="path">{path}</span>
            </li>
          {/each}
        </ul>
        <button class="link" onclick={() => (app.modal = 'diff')}>Ver mudanças</button>
      {:else}
        <EmptyState kind="empty" title="Nenhum arquivo editado" compact>Os arquivos que o agente editar nesta sessão aparecem aqui.</EmptyState>
      {/if}
    </section>

    <section>
      <p class="overline">pontos de restauração</p>
      {#if checkpoints.length}
        <ul class="checkpoints">
          {#each checkpoints.slice(0, CHECKPOINTS_SHOWN) as cp (cp.ref)}
            <li>
              <span class="time">{when(cp.time)}</span>
              <span class="label" title={cp.label}>{cp.label}</span>
              <button class="link" disabled={!!restoring} onclick={() => restore(cp)}>{restoring === cp.ref ? 'voltando…' : 'voltar aqui'}</button>
            </li>
          {/each}
        </ul>
      {:else}
        <EmptyState kind="empty" title="Nenhum ponto ainda" compact>Antes de cada prompt o Kora guarda o estado dos arquivos, para você desfazer o que o agente fez.</EmptyState>
      {/if}
    </section>

    <section>
      <p class="overline">memória da conversa</p>
      {#if info?.context}
        <div class="meter" role="meter" aria-valuenow={contextPct} aria-valuemin={0} aria-valuemax={100} aria-label="Memória da conversa usada">
          <div style:width="{contextPct}%" class:full={contextPct >= 80}></div>
        </div>
        <p class="muted" title="{compact.format(info.context.tokens)} de {compact.format(windowSize)} tokens">
          <strong>{contextPct}% usada.</strong> Quando enche, o agente começa a esquecer o início da conversa. Compacte para resumir o que já foi feito.
        </p>
        <button class="btn sm compact-btn" onclick={compactConversation} disabled={app.status[chat.id] === 'running'} title="Manda /compact para o Claude">
          Compactar conversa
        </button>
      {:else}
        <EmptyState kind="empty" title="Sem dados de memória" compact>Aparece depois da primeira resposta do agente.</EmptyState>
      {/if}
    </section>
  {/if}

  {#if chat && proc}
    <section>
      <p class="overline">processo</p>
      <p class="muted mono-line">{percent(proc.cpu)} de CPU · {formatMemory(proc.memory)}</p>
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
  .checkpoints li {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }
  .checkpoints .time {
    flex: none;
    font: 11px var(--font-mono);
    color: var(--ink-muted);
  }
  .checkpoints .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .checkpoints .link {
    flex: none;
  }
  .mono-line {
    font-family: var(--font-mono);
  }
  .files li {
    display: flex;
    gap: var(--space-2);
    min-width: 0;
  }
  .files .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
    font: 12px var(--font-mono);
  }
  .conflict {
    flex: none;
    font: 600 12px var(--font-mono);
    color: var(--warning);
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
  .meter div.full {
    background: var(--warning);
  }
  .compact-btn {
    align-self: flex-start;
  }
</style>

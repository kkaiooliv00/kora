<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { app, openIds, type Chat } from './lib/state.svelte'
  import { broadcast } from './lib/automation'
  import { toast } from './lib/toasts.svelte'

  const open = new Set(openIds())
  const openChats = app.chats.filter((c) => open.has(c.id))
  const activeTabPanes = app.tabs.find((t) => t.id === app.activeTab)?.panes ?? []
  // Padrão: os chats da divisão atual; se for um só, todos os abertos.
  let selected = $state<string[]>(activeTabPanes.length > 1 ? [...activeTabPanes] : openChats.map((c) => c.id))
  let text = $state('')
  let whenBusy = $state<'queue' | 'skip'>('queue')

  /** Ocupado = trabalhando ou esperando você; aí o prompt vai para a fila (ou é pulado). */
  const isBusy = (id: string) => app.status[id] === 'running' || app.status[id] === 'waiting'

  const tree = app.projects
    .map((project) => {
      const chats = openChats.filter((c) => c.projectId === project.id)
      const groups = app.groups
        .filter((g) => g.projectId === project.id)
        .map((g) => ({ id: g.id, name: g.name, chats: chats.filter((c) => c.groupId === g.id) }))
        .filter((g) => g.chats.length > 0)
      return { project, groups, loose: chats.filter((c) => !c.groupId), total: chats.length }
    })
    .filter((p) => p.total > 0)

  const busyCount = $derived(selected.filter(isBusy).length)
  const sendCount = $derived(whenBusy === 'skip' ? selected.length - busyCount : selected.length)

  function toggleAll(chats: Chat[]) {
    const ids = chats.map((c) => c.id)
    const all = ids.every((id) => selected.includes(id))
    selected = all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])]
  }

  function send(e?: SubmitEvent) {
    e?.preventDefault()
    if (!text.trim() || sendCount === 0) return
    const targets = whenBusy === 'skip' ? selected.filter((id) => !isBusy(id)) : selected
    const { sent, queued } = broadcast(text, targets)
    toast({
      tone: 'success',
      title: `Broadcast enviado para ${sent + queued} ${sent + queued === 1 ? 'chat' : 'chats'}`,
      text: queued ? `${queued} ${queued === 1 ? 'foi para a fila' : 'foram para a fila'}.` : undefined,
    })
    app.modal = null
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      send()
    }
  }
</script>

{#snippet chatLine(chat: Chat, indent: boolean)}
  <label class="line chat" class:indent>
    <input type="checkbox" value={chat.id} bind:group={selected} />
    <span class="name">{chat.name}</span>
    {#if isBusy(chat.id)}
      <span class="badge warning">! ocupado · {whenBusy === 'queue' ? 'vai para a fila' : 'será pulado'}</span>
    {:else}
      <span class="free">livre</span>
    {/if}
  </label>
{/snippet}

<div class="backdrop">
  <div class="modal broadcast" role="dialog" aria-modal="true" aria-label="Broadcast">
    <form onsubmit={send}>
      <header>
        <h2>broadcast</h2>
        <button type="button" class="icon-btn" aria-label="Fechar" onclick={() => (app.modal = null)}><X size={16} strokeWidth={1.5} /></button>
      </header>
      <p class="sub">Envia o mesmo prompt para vários chats de uma vez. Cada chat responde no próprio painel.</p>

      <label class="field">
        Prompt
        <!-- svelte-ignore a11y_autofocus -->
        <textarea bind:value={text} rows="4" autofocus onkeydown={onKey}></textarea>
      </label>

      <p class="label">Enviar para</p>
      {#if tree.length === 0}
        <p class="sub">Nenhum chat aberto. Abra os chats que devem receber o prompt.</p>
      {:else}
        <div class="targets">
          {#each tree as { project, groups, loose } (project.id)}
            <p class="project">{project.name}</p>
            {#each groups as group (group.id)}
              {@const ids = group.chats.map((c) => c.id)}
              {@const count = ids.filter((id) => selected.includes(id)).length}
              <label class="line">
                <input
                  type="checkbox"
                  checked={count === ids.length}
                  indeterminate={count > 0 && count < ids.length}
                  onchange={() => toggleAll(group.chats)}
                />
                <span class="group-name">{group.name}</span>
                <span class="count">{count} de {ids.length}</span>
              </label>
              {#each group.chats as chat (chat.id)}{@render chatLine(chat, true)}{/each}
            {/each}
            {#each loose as chat (chat.id)}{@render chatLine(chat, false)}{/each}
          {/each}
        </div>
      {/if}

      <fieldset>
        <legend>Se o chat estiver ocupado</legend>
        <label class="radio"><input type="radio" value="queue" bind:group={whenBusy} /> Colocar na fila do chat e enviar quando ele terminar</label>
        <label class="radio"><input type="radio" value="skip" bind:group={whenBusy} /> Pular esse chat</label>
      </fieldset>

      <footer>
        <span class="summary">
          {selected.length} {selected.length === 1 ? 'chat selecionado' : 'chats selecionados'}{busyCount && whenBusy === 'queue' ? ` · ${busyCount} vai para a fila` : ''}
        </span>
        <button type="button" class="btn ghost" onclick={() => (app.modal = null)}>Cancelar</button>
        <button type="submit" class="btn primary" disabled={!text.trim() || sendCount === 0}>
          Enviar para {sendCount} {sendCount === 1 ? 'chat' : 'chats'} <span class="shortcut">Ctrl+↵</span>
        </button>
      </footer>
    </form>
  </div>
</div>

<style>
  .broadcast {
    width: min(640px, calc(100vw - 32px));
    padding: 0;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-6) 0;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sub {
    margin: -12px 0 0;
  }
  .label {
    margin: 0 0 calc(var(--space-2) * -1);
    font-size: 13px;
    font-weight: 500;
  }
  .targets {
    display: flex;
    flex-direction: column;
    max-height: 260px;
    overflow-y: auto;
    padding: var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-100);
  }
  .project {
    margin: var(--space-1) var(--space-2);
    font: 600 13px var(--font-mono);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 32px;
    padding: 0 var(--space-2) 0 var(--space-4);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .line:hover {
    background: var(--bg-300);
  }
  .line.indent {
    padding-left: 40px;
  }
  .line.chat .name {
    flex: 1;
    font: 13px var(--font-mono);
  }
  .group-name {
    flex: 1;
    font-size: 13px;
    color: var(--ink-muted);
  }
  .count,
  .free {
    font: 12px var(--font-mono);
    color: var(--ink-muted);
  }
  input[type='checkbox'],
  input[type='radio'] {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: var(--space-3);
    padding: 0;
    font-size: 13px;
    font-weight: 500;
  }
  .radio {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0 calc(var(--space-6) * -1);
    padding: var(--space-3) var(--space-6);
    border-top: 1px solid var(--line);
  }
  .summary {
    flex: 1;
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>

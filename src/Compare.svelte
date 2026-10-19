<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import { app, chatById, chatDir, fail, openChat, projectOf, removeChat, STATUS, type Chat } from './lib/state.svelte'
  import { parseDiff } from './lib/diff'
  import { startCompare } from './lib/work'
  import { toast } from './lib/toasts.svelte'
  import EmptyState from './EmptyState.svelte'

  /** Sem grupo: formulário para mandar o mesmo prompt a vários agentes. Com grupo: o resultado de cada um. */
  const agents = app.profiles.filter((p) => p.command.trim())
  let projectId = $state(app.projects.find((p) => p.id === (app.active && chatById(app.active)?.projectId))?.id ?? app.projects[0]?.id ?? '')
  let picked = $state<string[]>(agents.slice(0, 2).map((p) => p.id))
  let prompt = $state('')
  let starting = $state(false)

  const group = $derived(app.groups.find((g) => g.id === app.comparing))
  const chats = $derived(group ? app.chats.filter((c) => c.groupId === group.id) : [])

  type Summary = { files: number; added: number; removed: number; error?: string }
  let summaries = $state<Record<string, Summary>>({})
  let busy = $state('')

  async function refresh() {
    for (const chat of chats) {
      const dir = chatDir(chat)
      if (!dir) continue
      try {
        const { diff, status } = await invoke<{ diff: string; status: string }>('git_diff', { dir })
        const files = parseDiff(diff)
        const untracked = status.split(/\r?\n/).filter((l) => l.startsWith('??')).length
        summaries[chat.id] = {
          files: files.length + untracked,
          added: files.reduce((n, f) => n + f.added, 0),
          removed: files.reduce((n, f) => n + f.removed, 0),
        }
      } catch (e) {
        summaries[chat.id] = { files: 0, added: 0, removed: 0, error: String(e) }
      }
    }
  }

  $effect(() => {
    if (group) refresh()
  })

  async function start(e: SubmitEvent) {
    e.preventDefault()
    starting = true
    const id = await startCompare(projectId, picked, prompt)
    starting = false
    if (id) app.comparing = id
  }

  /** Commita o que o agente fez, mescla a branch dele no projeto e oferece remover os outros. */
  async function choose(chat: Chat) {
    const project = projectOf(chat)
    const dir = chatDir(chat)
    if (!project || !dir || !chat.branch || !group) return
    busy = chat.id
    try {
      if ((summaries[chat.id]?.files ?? 0) > 0) await invoke('git_commit', { dir, message: `kora: ${group.compare ?? group.name}` })
      await invoke('git_merge', { project: project.path, branch: chat.branch })
      const others = chats.filter((c) => c.id !== chat.id)
      toast({
        tone: 'success',
        title: `${chat.name} escolhido`,
        text: `${chat.branch} mesclada no projeto.`,
        actions: others.length ? [{ label: `Remover os outros ${others.length}`, run: () => others.forEach((c) => removeChat(c.id)) }] : undefined,
      })
    } catch (e) {
      fail(`Não foi possível ficar com ${chat.name}`, e)
    } finally {
      busy = ''
    }
  }

  function go(chat: Chat, diff = false) {
    openChat(chat.id)
    app.modal = diff ? 'diff' : null
  }
</script>

<div class="page" role="dialog" aria-modal="true" aria-label="Comparar agentes">
  <header>
    <button class="icon-btn" aria-label="Voltar" title="Voltar (Esc)" onclick={() => (app.modal = null)}>
      <ChevronLeft size={16} strokeWidth={1.5} />
    </button>
    <h1>{group ? group.name : 'comparar agentes'}</h1>
    <span class="spacer"></span>
    {#if group}
      <button class="btn sm" onclick={refresh}>Atualizar</button>
      <button class="btn ghost sm" onclick={() => (app.comparing = null)}>Nova comparação</button>
    {/if}
  </header>

  <main>
    {#if !group}
      <form class="card start" onsubmit={start}>
        <p class="lead">O mesmo prompt vai para cada agente marcado, cada um no próprio worktree. Depois você compara o que cada um mudou e fica com o melhor.</p>
        <label class="field">
          Projeto
          <select bind:value={projectId}>
            {#each app.projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </label>
        <fieldset>
          <legend>Agentes</legend>
          {#each agents as p (p.id)}
            <label class="check"><input type="checkbox" value={p.id} bind:group={picked} /> {p.name}</label>
          {/each}
        </fieldset>
        <label class="field">
          Prompt
          <textarea bind:value={prompt} rows="5" placeholder="Ex.: implemente a paginação na listagem de pedidos"></textarea>
        </label>
        <div class="row">
          <span class="hint">{picked.length < 2 ? 'Marque pelo menos 2 agentes.' : `${picked.length} worktrees serão criados.`}</span>
          <button class="btn primary" type="submit" disabled={starting || picked.length < 2 || !prompt.trim() || !projectId}>
            {starting ? 'Abrindo agentes…' : `Comparar ${picked.length} agentes`}
          </button>
        </div>
      </form>
    {:else if chats.length === 0}
      <EmptyState kind="empty" title="Os chats desta comparação foram removidos">Comece uma nova comparação.</EmptyState>
    {:else}
      <p class="prompt">{group.compare}</p>
      <div class="cols">
        {#each chats as chat (chat.id)}
          {@const status = STATUS[app.status[chat.id] ?? 'idle']}
          {@const s = summaries[chat.id]}
          <section class="card col">
            <span class="head"><span class="name">{chat.name}</span><span class="badge {status.tone}">{status.glyph} {status.label}</span></span>
            <span class="branch">{chat.branch}</span>
            {#if s?.error}
              <p class="err">{s.error}</p>
            {:else if s}
              <p class="stat"><strong>{s.files}</strong> {s.files === 1 ? 'arquivo' : 'arquivos'} · <span class="add">+{s.added}</span> <span class="del">-{s.removed}</span></p>
            {:else}
              <p class="stat">calculando…</p>
            {/if}
            <div class="actions">
              <button class="btn sm" onclick={() => go(chat)}>Abrir</button>
              <button class="btn sm" onclick={() => go(chat, true)}>Ver mudanças</button>
              <button class="btn primary sm" disabled={!!busy || !s || !!s.error} onclick={() => choose(chat)}>
                {busy === chat.id ? 'Mesclando…' : 'Ficar com este'}
              </button>
            </div>
          </section>
        {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 44px 1fr;
    background: var(--bg-100);
    z-index: 15;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 0 var(--space-4) 0 var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font: 600 14px var(--font-mono);
  }
  .spacer {
    flex: 1;
  }
  main {
    overflow-y: auto;
    padding: var(--space-6) clamp(16px, 7vw, 104px);
  }
  .card {
    padding: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--bg-200);
  }
  .start {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 720px;
  }
  .lead,
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--ink-muted);
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: var(--space-2);
    font-size: 13px;
    font-weight: 500;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .prompt {
    margin: 0 0 var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-left: 2px solid var(--accent);
    background: var(--bg-200);
    font: 13px/20px var(--font-mono);
    white-space: pre-wrap;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-4);
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .name {
    font: 600 14px var(--font-mono);
  }
  .branch {
    font: 12px var(--font-mono);
    color: var(--ink-muted);
  }
  .stat {
    margin: var(--space-2) 0;
    font: 13px var(--font-mono);
  }
  .add {
    color: var(--success);
  }
  .del {
    color: var(--danger);
  }
  .err {
    margin: 0;
    font: 12px var(--font-mono);
    color: var(--danger);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>

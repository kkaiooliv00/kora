<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { ask } from '@tauri-apps/plugin-dialog'
  import { app, chatById, chatDir, fail } from './lib/state.svelte'
  import { toast } from './lib/toasts.svelte'
  import EmptyState from './EmptyState.svelte'

  type Entry = { name: string; dir: boolean }
  type Changed = { path: string; code: 'M' | 'A' | 'D' | 'U'; mtime: number | null }
  type Checkpoint = { ref: string; time: number; label: string }

  // ponytail: polling do git status; trocar por watcher do sistema de arquivos se pesar em repo grande.
  const POLL_MS = 3000
  /** Alterado há menos disso conta como "agora". */
  const RECENT_MS = 2 * 60_000
  const CODE: Record<Changed['code'], { label: string; tone: string }> = {
    M: { label: 'alterado', tone: 'warning' },
    A: { label: 'adicionado', tone: 'success' },
    U: { label: 'novo', tone: 'success' },
    D: { label: 'apagado', tone: 'danger' },
  }

  const chat = $derived(app.active ? chatById(app.active) : undefined)
  const root = $derived(chat ? chatDir(chat) : app.projects[0]?.path)
  const rootName = $derived(root?.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? '')
  const isClaude = $derived(app.profiles.find((p) => p.id === chat?.profileId)?.hooks === 'claude')

  let children = $state<Record<string, Entry[]>>({})
  let expanded = $state<Record<string, boolean>>({})
  let changes = $state<Changed[]>([])
  let error = $state('')
  let now = $state(Date.now())

  const byPath = $derived(new Map(changes.map((c) => [c.path, c])))
  const recent = (c: Changed) => c.mtime !== null && now - c.mtime < RECENT_MS
  const sorted = $derived([...changes].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0)))
  /** Pastas com algo alterado dentro (para o ponto na árvore). */
  const dirtyDirs = $derived(
    new Set(changes.flatMap((c) => c.path.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/')))),
  )

  const join = (sub: string, name: string) => (sub ? `${sub}/${name}` : name)

  async function load(sub: string) {
    if (!root) return
    try {
      children[sub] = await invoke<Entry[]>('list_dir', { root, sub })
      error = ''
    } catch (e) {
      if (!sub) error = String(e)
    }
  }

  async function poll() {
    if (!root || document.hidden) return
    now = Date.now()
    const next = await invoke<Changed[]>('changed_files', { dir: root }).catch(() => [])
    const before = changes.map((c) => c.path + c.code).join('|')
    changes = next
    // Arquivo novo ou apagado: recarrega as pastas abertas para a árvore acompanhar.
    if (next.map((c) => c.path + c.code).join('|') !== before) {
      for (const sub of ['', ...Object.keys(expanded).filter((k) => expanded[k])]) load(sub)
    }
  }

  // Troca de pasta (outro chat/projeto): zera a árvore e recomeça.
  $effect(() => {
    void root
    children = {}
    expanded = {}
    changes = []
    load('')
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => clearInterval(timer)
  })

  function toggle(path: string) {
    expanded[path] = !expanded[path]
    if (expanded[path] && !children[path]) load(path)
  }

  function open(path: string) {
    if (!root) return
    app.viewFile = { root, path }
    app.modal = 'file'
  }

  // ---- pontos de restauração (hooks do Claude) ----
  let checkpoints = $state<Checkpoint[]>([])
  let restoring = $state('')
  const clock = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

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
      poll()
    } catch (e) {
      fail('Não foi possível restaurar', e)
    } finally {
      restoring = ''
    }
  }
</script>

{#snippet badge(c: Changed)}
  <span class="code {CODE[c.code].tone}" title={CODE[c.code].label}>{c.code}</span>
{/snippet}

{#snippet tree(sub: string, depth: number)}
  {#each children[sub] ?? [] as entry (entry.name)}
    {@const path = join(sub, entry.name)}
    {@const change = byPath.get(path)}
    {#if entry.dir}
      <button class="row" style:--depth={depth} onclick={() => toggle(path)} aria-expanded={!!expanded[path]}>
        <span class="caret" aria-hidden="true">{expanded[path] ? '▾' : '▸'}</span>
        <span class="name">{entry.name}</span>
        {#if dirtyDirs.has(path)}<span class="dot" title="tem arquivos alterados"></span>{/if}
      </button>
      {#if expanded[path]}{@render tree(path, depth + 1)}{/if}
    {:else}
      <button class="row file" class:changed={!!change} style:--depth={depth} onclick={() => open(path)} title={path}>
        <span class="caret" aria-hidden="true"></span>
        <span class="name">{entry.name}</span>
        {#if change && recent(change)}<span class="now" title="alterado agora">agora</span>{/if}
        {#if change}{@render badge(change)}{/if}
      </button>
    {/if}
  {/each}
{/snippet}

<aside class="panel" aria-label="Arquivos do projeto">
  {#if !root}
    <EmptyState kind="empty" title="Nenhum projeto aberto" compact>Abra um projeto para ver os arquivos dele aqui.</EmptyState>
  {:else}
    <header>
      <p class="overline" title={root}>{rootName}</p>
      <button class="link" onclick={() => (app.modal = 'diff')} disabled={!changes.length}>ver mudanças</button>
    </header>

    {#if changes.length}
      <section>
        <p class="overline">alterados · {changes.length}</p>
        <ul class="changes">
          {#each sorted as c (c.path)}
            <li>
              <button class="row file changed" onclick={() => open(c.path)} disabled={c.code === 'D'} title={c.path}>
                <span class="path">{c.path}</span>
                {#if recent(c)}<span class="now" title="alterado agora">agora</span>{/if}
                {@render badge(c)}
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="tree">
      <p class="overline">arquivos</p>
      {#if error}
        <EmptyState kind="error" title="Não foi possível ler a pasta" detail={error} compact>Confira se a pasta do projeto ainda existe.</EmptyState>
      {:else}
        {@render tree('', 0)}
      {/if}
    </section>

    {#if checkpoints.length}
      <details>
        <summary class="overline">pontos de restauração · {checkpoints.length}</summary>
        <ul class="checkpoints">
          {#each checkpoints.slice(0, 8) as cp (cp.ref)}
            <li>
              <span class="time">{clock.format(cp.time)}</span>
              <span class="label" title={cp.label}>{cp.label}</span>
              <button class="link" disabled={!!restoring} onclick={() => restore(cp)}>{restoring === cp.ref ? 'voltando…' : 'voltar aqui'}</button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4) var(--space-2) var(--space-4) var(--space-4);
    border-left: 1px solid var(--line);
    background: var(--bg-100);
    font-size: 13px;
    line-height: 18px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding-right: var(--space-2);
  }
  header .overline {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  ul {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    min-width: 0;
    padding: 2px var(--space-2) 2px calc(var(--depth, 0) * 12px);
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
    text-align: left;
  }
  .row:hover:not(:disabled) {
    background: var(--bg-200);
    color: var(--ink);
  }
  .row:focus-visible {
    outline: 1px solid var(--focus-ring);
  }
  .row.changed {
    color: var(--ink);
  }
  .changes .row {
    padding-left: var(--space-1);
  }
  .caret {
    flex: none;
    width: 12px;
    font-size: 10px;
    color: var(--ink-faint);
  }
  .name,
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path {
    direction: rtl;
    font: 12px var(--font-mono);
  }
  .code {
    flex: none;
    width: 14px;
    text-align: center;
    font: 600 11px var(--font-mono);
  }
  .code.warning {
    color: var(--warning);
  }
  .code.success {
    color: var(--success);
  }
  .code.danger {
    color: var(--danger);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    margin-right: 4px;
    border-radius: 50%;
    background: var(--warning);
  }
  .now {
    flex: none;
    padding: 0 4px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent);
    font: 600 10px var(--font-mono);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }
  .link {
    flex: none;
    font-size: 12px;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link:disabled {
    color: var(--ink-faint);
    text-decoration: none;
  }
  details summary {
    cursor: pointer;
  }
  .checkpoints {
    gap: var(--space-2);
    margin-top: var(--space-2);
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
</style>

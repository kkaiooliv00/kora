<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { app } from './lib/state.svelte'
  import { parseDiff, type DiffFile } from './lib/diff'
  import EmptyState from './EmptyState.svelte'
  import Skeleton from './Skeleton.svelte'

  // Acima disso só o começo: milhares de linhas no DOM travam a janela.
  const MAX_LINES = 5000

  let { file }: { file: { root: string; path: string } } = $props()

  let lines = $state<string[]>([])
  let diff = $state<DiffFile | undefined>()
  let loading = $state(true)
  let error = $state('')

  /** Linhas novas/alteradas (numeração do arquivo atual), para destacar no conteúdo. */
  const added = $derived(new Set(diff?.lines.filter((l) => l.kind === 'add').map((l) => l.newNo)))

  $effect(() => {
    const { root, path } = file
    Promise.all([
      invoke<string>('read_file', { root, path }),
      // O diff vem com caminhos da raiz do repositório; a pasta do chat pode ser uma subpasta.
      invoke<{ diff: string }>('git_diff', { dir: root }).catch(() => ({ diff: '' })),
    ])
      .then(([text, changes]) => {
        lines = text.split(/\r?\n/)
        diff = parseDiff(changes.diff).find((f) => f.path === path || f.path.endsWith(`/${path}`))
      })
      .catch((e) => (error = String(e)))
      .finally(() => (loading = false))
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Esc fecha pelo App) -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && (app.modal = null)}>
  <div class="modal viewer" role="dialog" aria-modal="true" aria-label={file.path}>
    <header>
      <div class="titles">
        <h2>{file.path.split('/').at(-1)}</h2>
        <p class="sub" title={file.path}>
          {file.path}
          {#if diff}· <span class="add">+{diff.added}</span> <span class="del">-{diff.removed}</span> desde o último commit{/if}
        </p>
      </div>
      {#if diff}<button class="btn" onclick={() => (app.modal = 'diff')}>Ver mudanças</button>{/if}
      <button class="btn ghost" onclick={() => (app.modal = null)}>Fechar</button>
    </header>

    <div class="body">
      {#if loading}
        <div class="pad"><Skeleton lines={6} widths={['40%', '75%', '62%', '80%', '30%', '55%']} /></div>
      {:else if error}
        <EmptyState kind="error" title="Não foi possível abrir o arquivo" detail={error}>Arquivos binários ou acima de 2 MB não abrem aqui.</EmptyState>
      {:else}
        <div class="code">
          {#each lines.slice(0, MAX_LINES) as line, i (i)}
            <div class="line" class:added={added.has(i + 1)}>
              <span class="no">{i + 1}</span>
              <span class="text">{line}</span>
            </div>
          {/each}
        </div>
        {#if lines.length > MAX_LINES}<p class="note">… mais {lines.length - MAX_LINES} linhas</p>{/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .viewer {
    display: flex;
    flex-direction: column;
    width: min(1100px, calc(100vw - 32px));
    height: calc(100vh - 64px);
    padding: var(--space-4) var(--space-6);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
  }
  .add {
    color: var(--success);
  }
  .del {
    color: var(--danger);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-000);
  }
  .pad {
    padding: var(--space-4);
  }
  .code {
    width: max-content;
    min-width: 100%;
    font: 13px/20px var(--font-mono);
  }
  .line {
    display: grid;
    grid-template-columns: 56px 1fr;
    white-space: pre;
  }
  .line.added {
    background: var(--success-soft);
    box-shadow: inset 2px 0 var(--success);
  }
  .no {
    padding-right: var(--space-3);
    text-align: right;
    color: var(--ink-faint);
    user-select: none;
  }
  .text {
    padding-right: var(--space-4);
  }
  .note {
    margin: var(--space-2) var(--space-4);
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>

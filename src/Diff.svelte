<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { app, chatById, chatDir } from './lib/state.svelte'
  import { parseDiff, type DiffFile } from './lib/diff'
  import EmptyState from './EmptyState.svelte'
  import Skeleton from './Skeleton.svelte'

  // Acima disso, cada arquivo mostra só o começo (diff gigante trava a janela).
  const MAX_LINES_PER_FILE = 800

  const chat = app.active ? chatById(app.active) : undefined
  const dir = chat ? chatDir(chat) : app.projects[0]?.path
  let files = $state<DiffFile[]>([])
  let status = $state<string[]>([])
  let loading = $state(false)
  let error = $state('')

  const untracked = $derived(status.filter((l) => l.startsWith('??')).map((l) => l.slice(3)))
  const notRepo = $derived(/not a git repository/i.test(error))

  async function gitInit() {
    if (!dir) return
    try {
      await invoke('git_init', { dir })
      await refresh()
    } catch (e) {
      error = String(e)
    }
  }
  const branchLine = $derived(status.find((l) => l.startsWith('##'))?.slice(3) ?? '')

  async function refresh() {
    if (!dir) return
    loading = true
    error = ''
    try {
      const changes = await invoke<{ status: string; diff: string }>('git_diff', { dir })
      status = changes.status.split(/\r?\n/).filter(Boolean)
      files = parseDiff(changes.diff)
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }

  refresh()
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<div class="backdrop">
  <div class="modal diff" role="dialog" aria-modal="true" aria-label="Mudanças">
    <header>
      <div class="titles">
        <h2>mudanças</h2>
        <p class="sub">{chat?.name ?? 'projeto'} · {branchLine || dir || 'nenhum projeto'}</p>
      </div>
      <button class="btn" onclick={refresh} disabled={loading}>{loading ? 'Carregando…' : 'Atualizar'}</button>
      <button class="btn ghost" onclick={() => (app.modal = null)}>Fechar</button>
    </header>

    <div class="body">
      {#if error}
        <EmptyState
          kind="error"
          title="Não foi possível gerar o diff"
          detail={error}
        >
          {notRepo ? 'Esta pasta não é um repositório git. Inicie um para acompanhar as alterações do agente.' : 'O git não respondeu nesta pasta.'}
          {#snippet actions()}
            {#if notRepo}
              <button class="btn sm" onclick={gitInit}>Rodar git init</button>
              <button class="btn ghost sm" onclick={() => (app.modal = null)}>Ignorar</button>
            {:else}
              <button class="btn sm" onclick={refresh}>Tentar de novo</button>
            {/if}
          {/snippet}
        </EmptyState>
      {:else if loading && files.length === 0}
        <section class="block">
          <div class="head"><span class="path">calculando…</span></div>
          <div class="skeleton"><Skeleton lines={5} widths={['40%', '75%', '62%', '80%', '30%']} /></div>
        </section>
      {:else if files.length === 0 && untracked.length === 0}
        <EmptyState kind="empty" title="Nenhuma alteração">
          O agente ainda não mudou arquivos nesta pasta. Edições aparecem aqui antes de qualquer commit.
        </EmptyState>
      {/if}

      {#each files as file (file.path)}
        <section class="block">
          <div class="head">
            <span class="path">{file.path}</span>
            <span class="count-add">+{file.added}</span>
            <span class="count-del">-{file.removed}</span>
          </div>
          {#if file.binary}
            <p class="note">arquivo binário</p>
          {:else}
            <div class="lines">
              {#each file.lines.slice(0, MAX_LINES_PER_FILE) as line, i (i)}
                {#if line.kind === 'hunk'}
                  <div class="hunk">⋯ {line.text}</div>
                {:else}
                  <div class="line {line.kind}">
                    <span class="no">{line.kind === 'del' ? line.oldNo : line.newNo}</span>
                    <span class="mark">{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ''}</span>
                    <span class="code">{line.text}</span>
                  </div>
                {/if}
              {/each}
              {#if file.lines.length > MAX_LINES_PER_FILE}
                <p class="note">… mais {file.lines.length - MAX_LINES_PER_FILE} linhas; abra no editor para ver tudo</p>
              {/if}
            </div>
          {/if}
        </section>
      {/each}

      {#if untracked.length > 0}
        <p class="overline">arquivos novos (fora do diff)</p>
        <ul class="untracked">
          {#each untracked as path (path)}<li>{path}</li>{/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    width: min(1100px, calc(100vw - 32px));
    height: calc(100vh - 64px);
    padding: var(--space-4) var(--space-6);
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
  }
  .body {
    flex: 1;
    overflow-y: auto;
  }
  .block {
    margin-bottom: var(--space-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-000);
    overflow: hidden;
    font: 13px/20px var(--font-mono);
  }
  .head {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--line);
    background: var(--bg-200);
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .count-add {
    color: var(--success);
  }
  .count-del {
    color: var(--danger);
  }
  .lines {
    overflow-x: auto;
  }
  .line {
    display: grid;
    grid-template-columns: 56px 20px 1fr;
    white-space: pre;
  }
  .line.add {
    background: var(--success-soft);
  }
  .line.del {
    background: var(--danger-soft);
  }
  .no {
    padding-right: var(--space-3);
    text-align: right;
    color: var(--ink-faint);
  }
  .line.add .no,
  .line.del .no {
    color: var(--ink-muted);
  }
  .mark {
    color: var(--ink-muted);
  }
  .line.add .mark {
    color: var(--success);
  }
  .line.del .mark {
    color: var(--danger);
  }
  .hunk {
    padding: 2px var(--space-4);
    background: var(--bg-200);
    color: var(--ink-muted);
    font-size: 12px;
  }
  .note {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    color: var(--ink-muted);
    font-size: 12px;
  }
  .skeleton {
    padding: var(--space-4);
  }
  .untracked {
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    font: 13px/20px var(--font-mono);
    color: var(--ink-muted);
  }
</style>

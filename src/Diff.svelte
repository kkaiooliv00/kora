<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { app, chatById, chatDir, fail, guestOf, profileOf, projectOf, removeChat } from './lib/state.svelte'
  import { toast } from './lib/toasts.svelte'
  import { ask } from '@tauri-apps/plugin-dialog'
  import { parseDiff, type DiffFile, type DiffLine } from './lib/diff'
  import { sendTo } from './lib/queue'
  import { startReview } from './lib/work'
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
  const hasChanges = $derived(files.length > 0 || untracked.length > 0)

  // Fluxo do worktree: commit aqui, depois mesclar na branch do projeto ou abrir PR.
  const project = chat ? projectOf(chat) : undefined
  const worktreeBranch = chat && guestOf(chat) ? undefined : chat?.branch

  // Comentários de revisão por linha: viram um prompt para o agente do chat corrigir.
  type Comment = { key: string; path: string; line: number; removed: boolean; code: string; text: string }
  let comments = $state<Comment[]>([])
  let editing = $state<string | null>(null)
  let draftComment = $state('')
  const isAgent = !!chat && !!profileOf(chat)?.command.trim()
  const keyOf = (path: string, i: number) => `${path}#${i}`

  function startComment(path: string, i: number) {
    const key = keyOf(path, i)
    editing = editing === key ? null : key
    draftComment = comments.find((c) => c.key === key)?.text ?? ''
  }

  function saveComment(path: string, i: number, line: DiffLine) {
    const key = keyOf(path, i)
    const text = draftComment.trim()
    const rest = comments.filter((c) => c.key !== key)
    comments = text ? [...rest, { key, path, line: (line.kind === 'del' ? line.oldNo : line.newNo) ?? 0, removed: line.kind === 'del', code: line.text.trim(), text }] : rest
    editing = null
  }

  const onCommentKey = (e: KeyboardEvent, path: string, i: number, line: DiffLine) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveComment(path, i, line)
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      editing = null
    }
  }

  function sendComments() {
    if (!chat || comments.length === 0) return
    const items = comments.map((c, n) => `${n + 1}. ${c.path}:${c.line}${c.removed ? ' (linha removida; número de antes)' : ''}${c.code ? ` (\`${c.code.slice(0, 80)}\`)` : ''}\n   ${c.text.replace(/\n/g, '\n   ')}`)
    const prompt = `Revisei as suas mudanças e deixei comentários em linhas do diff. Corrija cada ponto:\n\n${items.join('\n')}`
    const result = sendTo(chat.id, prompt)
    if (result === 'closed') return toast({ tone: 'warning', title: 'Chat fechado', text: 'Abra o chat do agente para enviar os comentários.' })
    toast({ tone: 'success', title: result === 'sent' ? 'Comentários enviados ao agente' : 'Comentários na fila do agente', text: `${comments.length} ${comments.length === 1 ? 'comentário' : 'comentários'}` })
    comments = []
    app.modal = null
  }

  function review() {
    if (!chat) return
    app.modal = null
    startReview(chat.id)
  }
  let message = $state('')
  let busy = $state('')
  let mainBranch = $state<string | null>(null)
  if (project && worktreeBranch) invoke<string | null>('git_branch', { dir: project.path }).then((b) => (mainBranch = b)).catch(() => (mainBranch = null))

  async function act(label: string, run: () => Promise<void>) {
    busy = label
    try {
      await run()
    } catch (e) {
      fail(`${label}: falhou`, e)
    } finally {
      busy = ''
    }
  }

  /** Volta um arquivo ao último commit (arquivo novo: apaga). Pergunta antes: não dá para desfazer. */
  async function discard(path: string) {
    if (!dir) return
    if (!(await ask(`Desfazer as mudanças em ${path}? O arquivo volta ao último commit; isso não pode ser desfeito.`, { title: 'Desfazer alteração', kind: 'warning' }))) return
    await act('Desfazer', async () => {
      await invoke('git_discard', { dir, file: path })
      if (chat) app.touched[chat.id] = (app.touched[chat.id] ?? []).filter((f) => f !== path)
      toast({ tone: 'success', title: 'Alteração desfeita', text: path })
      await refresh()
    })
  }

  const commit = () =>
    act('Commit', async () => {
      const line = await invoke<string>('git_commit', { dir, message })
      message = ''
      if (chat) app.touched[chat.id] = []
      toast({ tone: 'success', title: 'Commit criado', text: line })
      await refresh()
    })

  const merge = () =>
    act('Mesclar', async () => {
      if (!project || !worktreeBranch || !chat) return
      const target = mainBranch ?? 'a branch atual do projeto'
      if (!(await ask(`Mesclar ${worktreeBranch} em ${target}? Isso cria um commit de merge na pasta do projeto.`, { title: 'Mesclar', kind: 'warning' }))) return
      await invoke('git_merge', { project: project.path, branch: worktreeBranch })
      toast({
        tone: 'success',
        title: `${worktreeBranch} mesclada em ${mainBranch ?? 'projeto'}`,
        text: 'O worktree pode ser removido; a branch continua no repositório.',
        actions: [{ label: 'Remover chat e worktree', run: () => removeChat(chat.id) }],
      })
    })

  const pullRequest = () =>
    act('Abrir PR', async () => {
      if (!worktreeBranch) return
      const url = await invoke<string>('git_pr', { dir, branch: worktreeBranch })
      await invoke('open_url', { url, browser: app.settings.browser || null })
      toast({ tone: 'success', title: 'PR aberto', text: url })
    })

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

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Esc fecha pelo App) -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && (app.modal = null)}>
  <div class="modal diff" role="dialog" aria-modal="true" aria-label="Mudanças">
    <header>
      <div class="titles">
        <h2>mudanças</h2>
        <p class="sub">{chat?.name ?? 'projeto'} · {branchLine || dir || 'nenhum projeto'}</p>
      </div>
      {#if isAgent && hasChanges}
        <button class="btn" onclick={review} title="Abre ao lado outro agente que revisa estas mudanças sem editar nada">Pedir revisão</button>
      {/if}
      <button class="btn" onclick={refresh} disabled={loading}>{loading ? 'Carregando…' : 'Atualizar'}</button>
      <button class="btn ghost" onclick={() => (app.modal = null)}>Fechar</button>
    </header>

    {#if !error && dir}
      <div class="actions">
        <form class="commit" onsubmit={(e) => (e.preventDefault(), commit())}>
          <input class="input" bind:value={message} placeholder="Mensagem do commit" aria-label="Mensagem do commit" disabled={!hasChanges} />
          <button class="btn" type="submit" disabled={!hasChanges || !message.trim() || !!busy}>{busy === 'Commit' ? 'Criando commit…' : 'Criar commit'}</button>
        </form>
        {#if worktreeBranch}
          <button
            class="btn"
            onclick={merge}
            disabled={hasChanges || !!busy}
            title={hasChanges ? 'Faça commit das mudanças antes de mesclar' : `git merge --no-ff ${worktreeBranch}`}
          >
            {busy === 'Mesclar' ? 'Mesclando…' : `Mesclar em ${mainBranch ?? 'projeto'}`}
          </button>
          <button class="btn primary" onclick={pullRequest} disabled={hasChanges || !!busy} title="git push + gh pr create">
            {busy === 'Abrir PR' ? 'Abrindo…' : 'Abrir PR'}
          </button>
        {/if}
      </div>
    {/if}

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
            <button class="link" onclick={() => discard(file.path)} title="Volta este arquivo ao último commit">Desfazer alteração</button>
          </div>
          {#if file.binary}
            <p class="note">arquivo binário</p>
          {:else}
            <div class="lines">
              {#each file.lines.slice(0, MAX_LINES_PER_FILE) as line, i (i)}
                {#if line.kind === 'hunk'}
                  <div class="hunk">⋯ {line.text}</div>
                {:else}
                  {@const key = keyOf(file.path, i)}
                  {@const saved = comments.find((c) => c.key === key)}
                  <div class="line {line.kind}" class:commented={!!saved}>
                    {#if isAgent}
                      <button class="no comment-btn" onclick={() => startComment(file.path, i)} title="Comentar esta linha" aria-label="Comentar a linha {line.kind === 'del' ? line.oldNo : line.newNo}">
                        <span class="plus" aria-hidden="true">+</span>{line.kind === 'del' ? line.oldNo : line.newNo}
                      </button>
                    {:else}
                      <span class="no">{line.kind === 'del' ? line.oldNo : line.newNo}</span>
                    {/if}
                    <span class="mark">{line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ''}</span>
                    <span class="code">{line.text}</span>
                  </div>
                  {#if editing === key}
                    <div class="comment-box" data-own-escape>
                      <!-- svelte-ignore a11y_autofocus -->
                      <textarea
                        class="input"
                        rows="2"
                        bind:value={draftComment}
                        placeholder="O que o agente deve mudar aqui? (Ctrl+Enter salva)"
                        aria-label="Comentário"
                        autofocus
                        onkeydown={(e) => onCommentKey(e, file.path, i, line)}
                      ></textarea>
                      <div class="comment-actions">
                        <button class="btn ghost sm" onclick={() => (editing = null)}>Cancelar</button>
                        <button class="btn primary sm" onclick={() => saveComment(file.path, i, line)}>{draftComment.trim() || !saved ? 'Salvar' : 'Remover'}</button>
                      </div>
                    </div>
                  {:else if saved}
                    <div class="comment-note">
                      <span class="who" aria-hidden="true">↳</span>
                      <span class="text">{saved.text}</span>
                      <button class="link" onclick={() => startComment(file.path, i)}>Editar</button>
                      <button class="link" onclick={() => (comments = comments.filter((c) => c.key !== key))}>Remover</button>
                    </div>
                  {/if}
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

    {#if isAgent && files.length > 0}
      <footer class="review-bar">
        <span class="hint-text">
          {comments.length === 0
            ? 'Clique no número de uma linha para comentar; os comentários vão juntos para o agente corrigir.'
            : `${comments.length} ${comments.length === 1 ? 'comentário' : 'comentários'} para ${chat?.name}`}
        </span>
        {#if comments.length > 0}
          <button class="btn ghost sm" onclick={() => (comments = [])}>Descartar</button>
          <button class="btn primary sm" onclick={sendComments}>Enviar ao agente</button>
        {/if}
      </footer>
    {/if}
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
  .actions {
    display: flex;
    gap: var(--space-2);
    margin: var(--space-3) 0;
  }
  .commit {
    display: flex;
    flex: 1;
    gap: var(--space-2);
  }
  .commit .input {
    flex: 1;
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
  .link {
    font: 12px var(--font-sans);
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
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
  .comment-btn {
    font: inherit;
    cursor: pointer;
  }
  .comment-btn .plus {
    margin-right: var(--space-1);
    color: var(--accent);
    visibility: hidden;
  }
  .line:hover .comment-btn .plus,
  .comment-btn:focus-visible .plus {
    visibility: visible;
  }
  .line.commented {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .comment-box,
  .comment-note {
    margin: var(--space-1) var(--space-4) var(--space-2) 76px;
    font: 13px/18px var(--font-sans);
    white-space: normal;
  }
  .comment-box textarea {
    width: 100%;
    resize: vertical;
  }
  .comment-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .comment-note {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
  }
  .comment-note .who {
    color: var(--accent);
  }
  .comment-note .text {
    flex: 1;
    white-space: pre-wrap;
  }
  .review-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--line);
  }
  .hint-text {
    flex: 1;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .untracked {
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    font: 13px/20px var(--font-mono);
    color: var(--ink-muted);
  }
</style>

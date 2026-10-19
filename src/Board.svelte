<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import X from '@lucide/svelte/icons/x'
  import { app, chatById, openChat, STATUS, type Task, type TaskColumn } from './lib/state.svelte'
  import { addTask, moveTask, removeTask } from './lib/work'
  import EmptyState from './EmptyState.svelte'

  const COLUMNS: { id: TaskColumn; label: string; hint: string }[] = [
    { id: 'todo', label: 'a fazer', hint: 'Arraste para "em andamento" para abrir um agente com a tarefa.' },
    { id: 'doing', label: 'em andamento', hint: 'Vai para revisão quando o agente termina de responder.' },
    { id: 'review', label: 'revisão', hint: 'Confira as mudanças, faça commit e mescle.' },
    { id: 'done', label: 'feito', hint: '' },
  ]

  const agents = app.profiles.filter((p) => p.command.trim())
  let projectId = $state(app.projects.find((p) => p.id === (app.active && chatById(app.active)?.projectId))?.id ?? app.projects[0]?.id ?? '')
  let profileId = $state(agents[0]?.id ?? '')
  let worktree = $state(true)
  let draft = $state('')
  let dragging = $state<string | null>(null)
  let over = $state<TaskColumn | null>(null)

  const tasks = $derived(app.tasks.filter((t) => t.projectId === projectId))

  function submit(e: SubmitEvent) {
    e.preventDefault()
    addTask(projectId, draft)
    draft = ''
  }

  function drop(column: TaskColumn) {
    if (dragging) moveTask(dragging, column, profileId, worktree)
    dragging = null
    over = null
  }

  function open(task: Task) {
    if (!task.chatId || !chatById(task.chatId)) return
    app.modal = null
    openChat(task.chatId)
  }

  function review(task: Task) {
    if (!task.chatId) return
    openChat(task.chatId)
    app.modal = 'diff'
  }
</script>

<div class="page" role="dialog" aria-modal="true" aria-label="Quadro de tarefas">
  <header>
    <button class="icon-btn" aria-label="Voltar" title="Voltar (Esc)" onclick={() => (app.modal = null)}>
      <ChevronLeft size={16} strokeWidth={1.5} />
    </button>
    <h1>tarefas</h1>
    <select class="input mono" bind:value={projectId} aria-label="Projeto">
      {#each app.projects as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
    </select>
    <span class="spacer"></span>
    <label class="opt">Agente
      <select class="input" bind:value={profileId}>
        {#each agents as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </label>
    <label class="opt"><input type="checkbox" bind:checked={worktree} /> worktree isolado</label>
  </header>

  {#if app.projects.length === 0}
    <main><EmptyState kind="empty" title="Nenhum projeto">Abra uma pasta para começar a planejar tarefas.</EmptyState></main>
  {:else}
    <main class="board">
      {#each COLUMNS as column (column.id)}
        {@const items = tasks.filter((t) => t.column === column.id)}
        <section
          class="column"
          class:over={over === column.id}
          aria-label={column.label}
          ondragover={(e) => (e.preventDefault(), (over = column.id))}
          ondragleave={() => over === column.id && (over = null)}
          ondrop={() => drop(column.id)}
        >
          <p class="overline">{column.label} <span class="n">{items.length}</span></p>
          {#if column.id === 'todo'}
            <form onsubmit={submit}>
              <textarea
                class="input"
                rows="2"
                bind:value={draft}
                placeholder="Nova tarefa (vira o prompt do agente)"
                onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), e.currentTarget.form?.requestSubmit())}
              ></textarea>
            </form>
          {/if}
          {#each items as task (task.id)}
            {@const chat = task.chatId ? chatById(task.chatId) : undefined}
            {@const status = chat ? app.status[chat.id] : undefined}
            <article class="task" draggable="true" ondragstart={() => (dragging = task.id)} ondragend={() => (dragging = null)}>
              <p class="text">{task.text}</p>
              <div class="foot">
                {#if chat}
                  <button class="chip" onclick={() => open(task)} title="Abrir o chat">
                    <span style:color={status ? STATUS[status].color : 'var(--ink-faint)'}>{status ? STATUS[status].glyph : '·'}</span>
                    {chat.name}
                  </button>
                {/if}
                <span class="spacer"></span>
                {#if column.id === 'review' && chat}<button class="btn sm" onclick={() => review(task)}>Ver mudanças</button>{/if}
                <button class="icon-btn" aria-label="Remover tarefa" title="Remover tarefa" onclick={() => removeTask(task.id)}><X size={14} strokeWidth={1.5} /></button>
              </div>
            </article>
          {/each}
          {#if items.length === 0 && column.hint}<p class="hint">{column.hint}</p>{/if}
        </section>
      {/each}
    </main>
  {/if}
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
  header .input {
    height: 30px;
    min-height: 30px;
    width: auto;
  }
  .spacer {
    flex: 1;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--ink-muted);
  }
  main {
    min-height: 0;
    padding: var(--space-6);
  }
  .board {
    display: grid;
    grid-template-columns: repeat(4, minmax(220px, 1fr));
    gap: var(--space-4);
    overflow-x: auto;
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--bg-100);
  }
  .column.over {
    border-color: var(--accent);
  }
  .n {
    margin-left: var(--space-1);
    color: var(--ink-faint);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font-size: 13px;
  }
  .task {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    cursor: grab;
  }
  .text {
    margin: 0;
    font-size: 13px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .chip {
    display: inline-flex;
    gap: var(--space-1);
    min-width: 0;
    font: 12px var(--font-mono);
    color: var(--ink-muted);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--ink-faint);
  }
</style>

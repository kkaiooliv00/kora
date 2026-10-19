<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import {
    app,
    STATUS,
    addProject,
    removeProject,
    addGroup,
    removeGroup,
    renameGroup,
    addChat,
    removeChat,
    renameChat,
    moveChat,
    openChat,
    runProject,
    archiveChat,
    splitChat,
    closePane,
    isOpen,
    mostUrgent,
    type Chat,
    type Project,
  } from './lib/state.svelte'
  import { openInEditor } from './lib/automation'
  import { exportChat } from './lib/export'
  import Archive from '@lucide/svelte/icons/archive'
  import { openMenu, type MenuItem } from './lib/menu.svelte'
  import { groupViews, shortAgo, summary, type GroupView } from './lib/sidebar'
  import Plus from '@lucide/svelte/icons/plus'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import FolderPlus from '@lucide/svelte/icons/folder-plus'
  import Activity from '@lucide/svelte/icons/activity'
  import Ellipsis from '@lucide/svelte/icons/ellipsis'
  import Settings from '@lucide/svelte/icons/settings'

  const ICON = { size: 16, strokeWidth: 1.5 }
  const TICK_MS = 30_000

  type Adding = { kind: 'chat' | 'group'; projectId: string; groupId?: string }

  let adding = $state<Adding | null>(null)
  let draftName = $state('')
  let isolated = $state(false)
  let renaming = $state<string | null>(null)
  /** Grupo aberto como cartão por clique; `null` = o grupo do chat em foco, '' = nenhum. */
  let picked = $state<string | null>(null)
  let branches = $state<Record<string, string>>({})
  let now = $state(Date.now())
  let dragged: string | null = null

  // O cartão segue o chat em foco sempre que ele muda.
  $effect(() => {
    void app.active
    picked = null
  })

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), TICK_MS)
    return () => clearInterval(timer)
  })

  // Branch principal de cada projeto (o nome do grupo "principal").
  $effect(() => {
    for (const project of app.projects) {
      invoke<string | null>('git_branch', { dir: project.path })
        .then((branch) => (branches[project.id] = branch ?? ''))
        .catch(() => (branches[project.id] = ''))
    }
  })

  const working = $derived(Object.values(app.status).filter((s) => s === 'running').length)
  const waiting = $derived(Object.values(app.status).filter((s) => s === 'waiting').length)

  const liveChats = $derived(app.chats.filter((c) => !c.archived))
  const chatsIn = (project: Project) => liveChats.filter((c) => c.projectId === project.id)
  const archivedIn = (project: Project) => app.chats.filter((c) => c.projectId === project.id && c.archived)
  const viewsOf = (project: Project) => groupViews(project.id, liveChats, app.groups, branches[project.id] ?? '')
  let showArchived = $state<Record<string, boolean>>({})
  const isSelected = (view: GroupView) => (picked !== null ? picked === view.key : view.chats.some((c) => c.id === app.active))
  const statusesOf = (chats: Chat[]) => chats.map((c) => app.status[c.id])
  const flip = (id: string) => (app.collapsed[id] = !app.collapsed[id])
  const allowDrop = (e: DragEvent) => e.preventDefault()
  const focus = (node: HTMLInputElement) => node.focus()

  function toggle(next: Adding) {
    const same = adding?.kind === next.kind && adding.projectId === next.projectId && adding.groupId === next.groupId
    adding = same ? null : next
    draftName = ''
    app.collapsed[next.projectId] = false
  }

  function pickProfile(profileId: string) {
    if (!adding) return
    addChat(adding.projectId, profileId, adding.groupId, isolated)
    adding = null
    isolated = false
  }

  function submitName(e: SubmitEvent) {
    e.preventDefault()
    if (adding?.kind === 'group') addGroup(adding.projectId, draftName)
    adding = null
  }

  function drop(e: DragEvent, projectId: string, groupId?: string) {
    e.preventDefault()
    e.stopPropagation()
    if (dragged) moveChat(dragged, projectId, groupId)
    dragged = null
  }

  function finishRename(id: string, value: string, kind: 'chat' | 'group') {
    if (kind === 'chat') renameChat(id, value)
    else renameGroup(id, value)
    renaming = null
  }

  const newChatItems = (projectId: string, groupId?: string): MenuItem[] =>
    app.profiles.map((profile) => ({ label: profile.name, run: () => addChat(projectId, profile.id, groupId) }))

  function chatMenu(e: MouseEvent, chat: Chat) {
    const groups = app.groups.filter((g) => g.projectId === chat.projectId)
    openMenu(e, [
      { label: 'Abrir', shortcut: '↵', run: () => openChat(chat.id) },
      { label: 'Abrir ao lado', shortcut: 'Alt+clique', run: () => splitChat(chat.id) },
      {
        label: 'Adicionar à fila…',
        run: () => {
          openChat(chat.id)
          app.modal = 'queue'
        },
      },
      { label: 'Rodar projeto ao lado', disabled: !!chat.runOf, run: () => runProject(chat.id) },
      { separator: true },
      {
        label: 'Mover para grupo',
        submenu: [
          ...groups.map((g) => ({ label: g.name, disabled: chat.groupId === g.id, run: () => moveChat(chat.id, chat.projectId, g.id) })),
          { label: 'Sem grupo', disabled: !chat.groupId, run: () => moveChat(chat.id, chat.projectId) },
        ],
      },
      { label: 'Renomear', shortcut: 'F2', run: () => (renaming = chat.id) },
      { label: 'Duplicar chat', run: () => addChat(chat.projectId, chat.profileId, chat.groupId) },
      { label: 'Exportar conversa…', run: () => exportChat(chat.id) },
      { label: 'Arquivar', run: () => archiveChat(chat.id, true) },
      { separator: true },
      { label: 'Encerrar chat', disabled: !isOpen(chat.id), run: () => closePane(chat.id) },
      { label: 'Remover chat', danger: true, run: () => removeChat(chat.id) },
    ])
  }

  function projectMenu(e: MouseEvent, project: Project) {
    openMenu(e, [
      { label: 'Novo chat', submenu: newChatItems(project.id) },
      { label: 'Novo chat em worktree', submenu: app.profiles.map((p) => ({ label: p.name, run: () => addChat(project.id, p.id, undefined, true) })) },
      { label: 'Novo grupo', run: () => toggle({ kind: 'group', projectId: project.id }) },
      { separator: true },
      {
        label: 'Configurar projeto…',
        run: () => {
          app.editingProject = project.id
          app.modal = 'project'
        },
      },
      { label: 'Abrir no editor', run: () => openInEditor(project.path) },
      { separator: true },
      { label: 'Remover projeto', danger: true, run: () => removeProject(project.id) },
    ])
  }

  function groupMenu(e: MouseEvent, project: Project, view: GroupView) {
    const groupId = view.groupId
    const chat = view.chats[0]
    if (!groupId) {
      // Branch principal ou worktree avulso: o menu age sobre o projeto (ou sobre o chat do worktree).
      if (view.worktree && chat) chatMenu(e, chat)
      else projectMenu(e, project)
      return
    }
    const compare = app.groups.find((g) => g.id === groupId)?.compare
    openMenu(e, [
      ...(compare
        ? [
            {
              label: 'Ver comparação',
              run: () => {
                app.comparing = groupId
                app.modal = 'compare'
              },
            },
            { separator: true },
          ]
        : []),
      { label: 'Novo chat no grupo', submenu: newChatItems(project.id, groupId) },
      { label: 'Renomear grupo', run: () => (renaming = groupId) },
      { separator: true },
      { label: 'Remover grupo', danger: true, run: () => removeGroup(groupId) },
    ])
  }

  function onChatKey(e: KeyboardEvent, chat: Chat) {
    if (e.key === 'F2') {
      e.preventDefault()
      renaming = chat.id
    }
  }
</script>

{#snippet renameInput(id: string, value: string, kind: 'chat' | 'group')}
  <input
    class="rename"
    {value}
    aria-label="Novo nome"
    use:focus
    onblur={(e) => finishRename(id, e.currentTarget.value, kind)}
    onkeydown={(e) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') renaming = null
    }}
  />
{/snippet}

{#snippet nameForm(placeholder: string)}
  <form class="picker" onsubmit={submitName}>
    <input
      class="input"
      {placeholder}
      aria-label={placeholder}
      bind:value={draftName}
      use:focus
      onkeydown={(e) => e.key === 'Escape' && (adding = null)}
    />
  </form>
{/snippet}

{#snippet picker(projectId: string, groupId?: string)}
  {#if adding?.projectId === projectId && adding.groupId === groupId}
    {#if adding.kind === 'chat'}
      <div class="picker">
        {#each app.profiles as profile (profile.id)}
          <button class="btn sm" onclick={() => pickProfile(profile.id)}>{profile.name}</button>
        {/each}
        <label class="isolated" title="Cria um git worktree e uma branch kora/... só para este chat">
          <input type="checkbox" bind:checked={isolated} /> worktree isolado
        </label>
      </div>
    {:else if adding.kind === 'group'}
      {@render nameForm('Nome do grupo')}
    {/if}
  {/if}
{/snippet}

{#snippet chatRow(chat: Chat)}
  {@const status = app.status[chat.id]}
  <li class="chat" class:active={app.active === chat.id}>
    {#if renaming === chat.id}
      {@render renameInput(chat.id, chat.name, 'chat')}
    {:else}
      <button
        class="chat-btn"
        draggable="true"
        ondragstart={() => (dragged = chat.id)}
        onclick={(e) => (e.altKey ? splitChat(chat.id) : openChat(chat.id))}
        ondblclick={() => (renaming = chat.id)}
        oncontextmenu={(e) => chatMenu(e, chat)}
        onkeydown={(e) => onChatKey(e, chat)}
        title={`${status ? STATUS[status].label : 'fechado'} · Alt+clique abre ao lado · botão direito para mais`}
      >
        {#if status === 'running'}<span class="activity"><Activity size={14} strokeWidth={1.5} /></span>{/if}
        <span class="glyph" style:color={status ? STATUS[status].color : 'var(--ink-faint)'} aria-label={status ? STATUS[status].label : 'fechado'}
          >{status ? STATUS[status].glyph : '·'}</span
        >
        <span class="chat-name">{chat.name}</span>
        <span class="ago" class:warn={status === 'waiting'}>{status === 'waiting' ? 'agora' : shortAgo(chat.lastActive, now)}</span>
      </button>
    {/if}
  </li>
{/snippet}

{#snippet stateBadge(chats: Chat[])}
  {@const statuses = statusesOf(chats)}
  {@const errors = statuses.filter((s) => s === 'error').length}
  {#if statuses.includes('waiting')}
    <span class="badge warning state">! aguardando</span>
  {:else if chats.some((c) => app.queue[c.id]?.paused)}
    <span class="badge warning state">‖ pausado</span>
  {:else if errors}
    <span class="errors state">✗ {errors}</span>
  {/if}
{/snippet}

{#snippet group(project: Project, view: GroupView)}
  {@const urgent = mostUrgent(view.chats.map((c) => c.id))}
  {@const selected = isSelected(view)}
  <div
    class="group"
    class:selected
    role="group"
    aria-label={view.name}
    aria-current={selected || undefined}
    ondragover={allowDrop}
    ondrop={(e) => drop(e, project.id, view.groupId)}
  >
    <div class="group-head" oncontextmenu={(e) => groupMenu(e, project, view)} role="presentation">
      {#if view.groupId && renaming === view.groupId}
        {@render renameInput(view.groupId, view.name, 'group')}
      {:else}
        <button class="group-btn" aria-expanded={selected} onclick={() => (picked = selected ? '' : view.key)}>
          <span class="line1">
            {#if selected && urgent === 'running'}
              <span class="activity"><Activity size={14} strokeWidth={1.5} /></span>
            {:else}
              <span class="dot" class:off={!urgent} style:--dot={urgent ? STATUS[urgent].color : 'transparent'} aria-label={urgent ? STATUS[urgent].label : 'sem chats abertos'}></span>
            {/if}
            <span class="group-name">{view.name || 'pasta do projeto'}</span>
            {#if view.principal}<span class="badge">principal</span>{/if}
            <span class="spacer"></span>
            {@render stateBadge(view.chats)}
          </span>
          {#if view.branch}
            <span class="line2" class:indent={selected && urgent === 'running'}>
              <span class="branch">{view.branch}</span>
              {#if view.worktree}<span class="wt" title="worktree próprio"><GitBranch size={14} strokeWidth={1.5} /></span>{/if}
            </span>
          {/if}
          {#if !selected && view.chats.length > 1}
            {@const { glyphs, rest } = summary(statusesOf(view.chats))}
            <span class="summary" aria-label="Resumo dos chats">
              {#each glyphs as s (s)}<span style:color={STATUS[s].color} aria-label={STATUS[s].label}>{STATUS[s].glyph}</span>{/each}
              {#if rest}<span class="rest">+{rest}</span>{/if}
            </span>
          {/if}
        </button>
        <button class="icon-btn more" title="Mais ações" aria-label="Mais ações" onclick={(e) => groupMenu(e, project, view)}>
          <Ellipsis size={16} strokeWidth={1.5} />
        </button>
      {/if}
    </div>
    {@render picker(project.id, view.groupId)}
    {#if selected}
      <ul>
        {#each view.chats as chat (chat.id)}{@render chatRow(chat)}{/each}
      </ul>
    {/if}
  </div>
{/snippet}

{#snippet project(project: Project)}
  {@const chats = chatsIn(project)}
  {@const views = viewsOf(project)}
  {@const collapsed = app.collapsed[project.id]}
  <section ondragover={allowDrop} ondrop={(e) => drop(e, project.id)} aria-label={project.name}>
    <div class="row project-row" oncontextmenu={(e) => projectMenu(e, project)} role="presentation">
      <button class="row-btn" aria-expanded={!collapsed} onclick={() => flip(project.id)} title={project.path}>
        {#if collapsed}<span class="chevron"><ChevronRight size={14} strokeWidth={1.5} /></span>{/if}
        <span class="tile" aria-hidden="true">{project.name.charAt(0).toLowerCase()}</span>
        <span class="project-name">{project.name}</span>
        {#if collapsed}
          {@const urgent = mostUrgent(chats.map((c) => c.id))}
          {#if urgent}<span class="glyph" style:color={STATUS[urgent].color} aria-label={STATUS[urgent].label}>{STATUS[urgent].glyph}</span>{/if}
          <span class="count" title="grupos">{views.length}</span>
        {/if}
      </button>
      <button class="icon-btn hover" title="Novo chat" aria-label="Novo chat" onclick={() => toggle({ kind: 'chat', projectId: project.id })}><Plus {...ICON} /></button>
    </div>
    {@render picker(project.id)}

    {#if !collapsed && archivedIn(project).length}
      {@const archived = archivedIn(project)}
      <button class="archived" aria-expanded={!!showArchived[project.id]} onclick={() => (showArchived[project.id] = !showArchived[project.id])}>
        <span class="n">{archived.length}</span>
        <span class="archived-label">{archived.length === 1 ? 'chat arquivado' : 'chats arquivados'}</span>
        {#if showArchived[project.id]}<ChevronDown size={14} strokeWidth={1.5} />{:else}<ChevronRight size={14} strokeWidth={1.5} />{/if}
      </button>
      {#if showArchived[project.id]}
        <ul class="archived-list">
          {#each archived as chat (chat.id)}
            <li class="chat">
              <button class="chat-btn" title="Desarquivar e abrir" onclick={() => (archiveChat(chat.id, false), openChat(chat.id))} oncontextmenu={(e) => chatMenu(e, chat)}>
                <span class="glyph"><Archive size={12} strokeWidth={1.5} /></span>
                <span class="chat-name">{chat.name}</span>
                <span class="ago">{shortAgo(chat.lastActive, now)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}

    {#if !collapsed}
      {#if chats.length === 0 && views.length === 0}
        <div class="empty">
          <span>Nenhum chat neste projeto ainda.</span>
          <button class="btn sm" onclick={() => toggle({ kind: 'chat', projectId: project.id })}>+ Novo chat</button>
        </div>
      {:else}
        {#each views as view (view.key)}{@render group(project, view)}{/each}
      {/if}
    {/if}
  </section>
{/snippet}

<aside>
  <header>
    <span class="title">Projetos</span>
    <button class="icon-btn" title="Configurações" aria-label="Configurações" onclick={() => (app.modal = 'settings')}><Settings {...ICON} /></button>
    <button class="icon-btn" title="Abrir pasta (novo projeto)" aria-label="Abrir pasta" onclick={addProject}><FolderPlus {...ICON} /></button>
  </header>

  <div class="tree">
    {#each app.projects as item, i (item.id)}
      {#if i > 0}<div class="divider"></div>{/if}
      {@render project(item)}
    {/each}

    {#if app.projects.length === 0}
      <p class="hint">Nenhum projeto ainda. Abra uma pasta para começar.</p>
    {/if}
  </div>

  <footer>
    <span class="work-dot" aria-hidden="true"></span>
    {working} {working === 1 ? 'agente trabalhando' : 'agentes trabalhando'}
    {#if waiting}<span class="waiting" title="aguardando você">! {waiting}</span>{/if}
  </footer>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-100);
    border-right: 1px solid var(--line);
  }
  header {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 44px;
    padding: 0 var(--space-2) 0 var(--space-4);
    border-bottom: 1px solid var(--line);
  }
  .title {
    flex: 1;
    font: 600 13px var(--font-sans);
  }
  .tree {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    overflow-y: auto;
    padding: var(--space-3) var(--space-2);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .row {
    display: flex;
    align-items: center;
    height: 32px;
    border-radius: var(--radius-md);
  }
  .row:hover {
    background: var(--bg-200);
  }
  .row-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 var(--space-2);
    text-align: left;
  }
  .chevron {
    display: inline-flex;
    margin-right: -4px;
    color: var(--ink-muted);
  }
  .tile {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    background: var(--petrol);
    color: var(--accent-strong);
    font: 600 11px var(--font-mono);
  }
  .project-name,
  .group-name,
  .chat-name,
  .branch {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-name {
    flex: 1;
    font: 600 14px var(--font-mono);
  }
  .count {
    font: 11px var(--font-mono);
    color: var(--ink-muted);
  }
  .glyph {
    flex: none;
    width: 14px;
    text-align: center;
    font: 600 12px var(--font-mono);
  }
  .divider {
    height: 1px;
    margin: var(--space-2);
    background: var(--line);
  }

  /* grupo: normal, hover (bg-200 + ⋯) e selecionado (cartão com os chats) */
  .group {
    display: flex;
    flex-direction: column;
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
  }
  .group:hover {
    background: var(--bg-200);
  }
  .group.selected {
    gap: 2px;
    padding-bottom: var(--space-2);
    border-color: var(--line-control);
    background: var(--bg-200);
  }
  .group-head {
    position: relative;
    display: flex;
  }
  .group-btn {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
    padding: var(--space-2) 10px;
    text-align: left;
  }
  .line1,
  .line2 {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  .line2 {
    padding-left: 15px;
  }
  .line2.indent {
    padding-left: 22px;
  }
  .group-name {
    font: 600 14px var(--font-sans);
  }
  .spacer {
    flex: 1;
  }
  .branch {
    flex: 1;
    font: 12px var(--font-mono);
    color: var(--ink-muted);
  }
  .wt {
    display: inline-flex;
    color: var(--accent);
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 1px;
    background: var(--dot);
  }
  .dot.off {
    box-shadow: inset 0 0 0 1px var(--line-control);
  }
  .activity {
    display: inline-flex;
    color: var(--accent);
  }
  .errors {
    font: 11px var(--font-mono);
    color: var(--danger);
  }
  .summary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    align-self: flex-start;
    height: 26px;
    margin: var(--space-1) 0 0 15px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    font: 600 12px var(--font-mono);
  }
  .rest {
    font-weight: 400;
    color: var(--ink-muted);
  }
  .more {
    position: absolute;
    top: 4px;
    right: 4px;
    opacity: 0;
    background: var(--bg-200);
  }
  .group:hover .more,
  .more:focus-visible {
    opacity: 1;
  }
  .group:hover .state {
    visibility: hidden;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0 var(--space-2) 0 14px;
  }
  .chat {
    display: flex;
    border-radius: var(--radius-md);
  }
  .chat:hover {
    background: var(--bg-300);
  }
  .chat.active {
    background: var(--bg-300);
  }
  .chat-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 var(--space-2);
    text-align: left;
  }
  .chat-name {
    flex: 1;
    font: 13px var(--font-sans);
  }
  .chat.active .chat-name {
    font-weight: 500;
  }
  .ago {
    font: 11px var(--font-mono);
    color: var(--ink-muted);
  }
  .ago.warn {
    color: var(--warning);
  }

  .archived {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    margin: 2px 0 6px;
    padding: 0 10px 0 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    color: var(--ink-muted);
    text-align: left;
  }
  .archived:hover {
    background: var(--bg-200);
  }
  .archived .n {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 20px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 3px;
    background: var(--bg-300);
    color: var(--ink);
    font: 500 11px var(--font-mono);
  }
  .archived-label {
    flex: 1;
    font-size: 13px;
  }
  .archived-list {
    margin-bottom: var(--space-2);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: 10px;
    border: 1px dashed var(--line-control);
    border-radius: var(--radius-lg);
    font-size: 13px;
    color: var(--ink-muted);
  }
  .icon-btn.hover {
    opacity: 0;
  }
  .row:hover .icon-btn.hover,
  .icon-btn.hover:focus-visible {
    opacity: 1;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-1) var(--space-2) var(--space-2) var(--space-6);
  }
  .picker .input {
    flex: 1;
  }
  .isolated {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    margin-top: 2px;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .rename {
    flex: 1;
    min-width: 0;
    height: 28px;
    margin: 2px var(--space-2);
    padding: 0 var(--space-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--bg-000);
    color: var(--ink);
    font: 13px var(--font-sans);
    outline: none;
  }
  .hint {
    margin: 0;
    padding: var(--space-2);
    font-size: 13px;
    color: var(--ink-muted);
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-4);
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .work-dot {
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: var(--accent);
  }
  .waiting {
    margin-left: auto;
    font-family: var(--font-mono);
    color: var(--warning);
  }
</style>

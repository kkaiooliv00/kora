<script lang="ts">
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
    splitChat,
    closePane,
    isOpen,
    mostUrgent,
    type Chat,
    type Group,
    type Project,
  } from './lib/state.svelte'
  import { openInEditor } from './lib/automation'
  import { openMenu, type MenuItem } from './lib/menu.svelte'
  import Plus from '@lucide/svelte/icons/plus'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import Settings from '@lucide/svelte/icons/settings'

  const ICON = { size: 14, strokeWidth: 1.5 }

  type Adding = { kind: 'chat' | 'group'; projectId: string; groupId?: string }

  let adding = $state<Adding | null>(null)
  let groupName = $state('')
  let isolated = $state(false)
  let renaming = $state<string | null>(null)
  let dragged: string | null = null

  function toggle(next: Adding) {
    const same = adding?.kind === next.kind && adding.projectId === next.projectId && adding.groupId === next.groupId
    adding = same ? null : next
    groupName = ''
    if (next.groupId) app.collapsed[next.groupId] = false
    app.collapsed[next.projectId] = false
  }

  function pickProfile(profileId: string) {
    if (!adding) return
    addChat(adding.projectId, profileId, adding.groupId, isolated)
    adding = null
    isolated = false
  }

  function submitGroup(e: SubmitEvent) {
    e.preventDefault()
    if (adding) addGroup(adding.projectId, groupName)
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

  const flip = (id: string) => (app.collapsed[id] = !app.collapsed[id])
  const groupsOf = (project: Project) => app.groups.filter((g) => g.projectId === project.id)
  const chatsOf = (group: Group) => app.chats.filter((c) => c.groupId === group.id)
  const looseChats = (project: Project) => app.chats.filter((c) => c.projectId === project.id && !c.groupId)
  const allowDrop = (e: DragEvent) => e.preventDefault()
  const focus = (node: HTMLInputElement) => node.focus()

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
      { label: 'Abrir no editor', run: () => openInEditor(project.path) },
      { separator: true },
      { label: 'Remover projeto', danger: true, run: () => removeProject(project.id) },
    ])
  }

  function groupMenu(e: MouseEvent, group: Group) {
    openMenu(e, [
      { label: 'Novo chat no grupo', submenu: newChatItems(group.projectId, group.id) },
      { label: 'Renomear grupo', run: () => (renaming = group.id) },
      { separator: true },
      { label: 'Remover grupo', danger: true, run: () => removeGroup(group.id) },
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

{#snippet chevron(id: string)}
  <span class="chevron" aria-hidden="true">
    {#if app.collapsed[id]}<ChevronRight size={12} strokeWidth={1.5} />{:else}<ChevronDown size={12} strokeWidth={1.5} />{/if}
  </span>
{/snippet}

{#snippet chatRow(chat: Chat, indent: number)}
  {@const status = app.status[chat.id]}
  <li class="chat" class:active={app.active === chat.id} style:padding-left="{indent}px">
    <span class="dot" class:off={!status} style:--dot={status ? STATUS[status].color : 'transparent'} aria-hidden="true"></span>
    {#if renaming === chat.id}
      {@render renameInput(chat.id, chat.name, 'chat')}
    {:else}
      <button
        class="label"
        draggable="true"
        ondragstart={() => (dragged = chat.id)}
        onclick={(e) => (e.altKey ? splitChat(chat.id) : openChat(chat.id))}
        ondblclick={() => (renaming = chat.id)}
        oncontextmenu={(e) => chatMenu(e, chat)}
        onkeydown={(e) => onChatKey(e, chat)}
        title={`${status ? STATUS[status].label : 'fechado'} · Alt+clique abre ao lado · botão direito para mais`}
      >
        <span class="text">{chat.name}</span>
        {#if chat.branch}<span class="branch" title={`${chat.branch} · ${chat.cwd}`}><GitBranch size={12} strokeWidth={1.5} /></span>{/if}
        {#if status === 'waiting'}<span class="waiting" aria-label="aguardando você">!</span>{/if}
      </button>
    {/if}
  </li>
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
    {:else}
      <form class="picker" onsubmit={submitGroup}>
        <input
          class="input"
          placeholder="Nome do grupo"
          aria-label="Nome do grupo"
          bind:value={groupName}
          use:focus
          onkeydown={(e) => e.key === 'Escape' && (adding = null)}
        />
      </form>
    {/if}
  {/if}
{/snippet}

<aside>
  <header>
    <p class="overline">projetos</p>
    <button class="icon-btn" title="Abrir pasta como projeto" aria-label="Novo projeto" onclick={addProject}><Plus {...ICON} /></button>
  </header>

  <div class="tree">
    {#each app.projects as project (project.id)}
      {@const projectChats = app.chats.filter((c) => c.projectId === project.id)}
      <section ondragover={allowDrop} ondrop={(e) => drop(e, project.id)} aria-label={project.name}>
        <div class="row project" oncontextmenu={(e) => projectMenu(e, project)} role="presentation">
          <button class="toggle" aria-expanded={!app.collapsed[project.id]} onclick={() => flip(project.id)} title={project.path}>
            {@render chevron(project.id)}
            <span class="name">{project.name}</span>
            {#if app.collapsed[project.id]}
              {@const urgent = mostUrgent(projectChats.map((c) => c.id))}
              {#if urgent}<span class="dot" style:--dot={STATUS[urgent].color} aria-label={STATUS[urgent].label}></span>{/if}
              <span class="count">{projectChats.length}</span>
            {/if}
          </button>
          <button class="icon-btn hover" title="Novo chat" aria-label="Novo chat" onclick={() => toggle({ kind: 'chat', projectId: project.id })}><Plus {...ICON} /></button>
        </div>
        {@render picker(project.id)}

        {#if !app.collapsed[project.id]}
          {#each groupsOf(project) as group (group.id)}
            {@const chats = chatsOf(group)}
            <div class="group" role="group" aria-label={group.name} ondragover={allowDrop} ondrop={(e) => drop(e, project.id, group.id)}>
              <div class="row group-row" oncontextmenu={(e) => groupMenu(e, group)} role="presentation">
                {#if renaming === group.id}
                  {@render renameInput(group.id, group.name, 'group')}
                {:else}
                  <button class="toggle" aria-expanded={!app.collapsed[group.id]} onclick={() => flip(group.id)}>
                    {@render chevron(group.id)}
                    <span class="name group-name">{group.name}</span>
                    {#if app.collapsed[group.id]}
                      {@const urgent = mostUrgent(chats.map((c) => c.id))}
                      {#if urgent}<span class="dot" style:--dot={STATUS[urgent].color} aria-label={STATUS[urgent].label}></span>{/if}
                    {/if}
                    <span class="count">{chats.length}</span>
                  </button>
                {/if}
                <button
                  class="icon-btn hover"
                  title="Novo chat no grupo"
                  aria-label="Novo chat no grupo"
                  onclick={() => toggle({ kind: 'chat', projectId: project.id, groupId: group.id })}><Plus {...ICON} /></button
                >
              </div>
              {@render picker(project.id, group.id)}
              {#if !app.collapsed[group.id]}
                <ul>
                  {#each chats as chat (chat.id)}
                    {@render chatRow(chat, 28)}
                  {/each}
                </ul>
              {/if}
            </div>
          {/each}

          <ul>
            {#each looseChats(project) as chat (chat.id)}
              {@render chatRow(chat, 16)}
            {/each}
          </ul>
        {/if}
      </section>
    {:else}
      <p class="hint">Nenhum projeto ainda. Use <b>+</b> para abrir uma pasta.</p>
    {/each}
  </div>

  <footer>
    <button class="btn ghost settings" onclick={() => (app.modal = 'settings')}><Settings {...ICON} /> Configurações</button>
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
    justify-content: space-between;
    padding: var(--space-4) var(--space-3) var(--space-2) var(--space-4);
  }
  .tree {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-2) var(--space-3);
  }
  section {
    padding-bottom: var(--space-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    border-radius: var(--radius-md);
  }
  .row:hover,
  .chat:hover {
    background: var(--bg-200);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0 var(--space-2) 0 var(--space-1);
    text-align: left;
  }
  .chevron {
    display: inline-grid;
    place-items: center;
    width: 16px;
    color: var(--ink-muted);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project .name {
    font: 600 13px/18px var(--font-mono);
    color: var(--ink);
  }
  .group-row {
    margin-left: 12px;
  }
  .group-name {
    font: 500 12px/16px var(--font-sans);
    color: var(--ink-muted);
  }
  .count {
    font: 11px var(--font-mono);
    color: var(--ink-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .chat {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding-right: var(--space-2);
    border-radius: var(--radius-md);
    transition: background-color 120ms ease-out;
  }
  .chat.active,
  .chat.active:hover {
    background: var(--bg-300);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: var(--dot);
  }
  .dot.off {
    box-shadow: inset 0 0 0 1px var(--line-control);
  }
  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    height: 100%;
    font: 12px var(--font-mono);
    text-align: left;
    color: var(--ink);
  }
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .branch {
    display: inline-flex;
    color: var(--accent);
  }
  .waiting {
    margin-left: auto;
    font: 600 12px var(--font-mono);
    color: var(--warning);
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
    margin: var(--space-1) 0 var(--space-2) var(--space-6);
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
    height: 24px;
    padding: 0 var(--space-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    background: var(--bg-000);
    color: var(--ink);
    font: 12px var(--font-mono);
    outline: none;
  }
  .hint {
    padding: var(--space-2);
    font-size: 13px;
    color: var(--ink-muted);
  }
  footer {
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--line);
  }
  .settings {
    width: 100%;
  }
</style>

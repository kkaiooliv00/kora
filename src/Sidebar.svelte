<script lang="ts">
  import {
    app,
    STATUS,
    addProject,
    removeProject,
    addGroup,
    removeGroup,
    addChat,
    removeChat,
    renameChat,
    moveChat,
    openChat,
    splitChat,
    type Chat,
  } from './lib/state.svelte'
  import { openInEditor } from './lib/automation'
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import FolderPlus from '@lucide/svelte/icons/folder-plus'
  import ListPlus from '@lucide/svelte/icons/list-plus'
  import SquarePen from '@lucide/svelte/icons/square-pen'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
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

  function finishRename(chat: Chat, value: string) {
    renameChat(chat.id, value)
    renaming = null
  }

  const allowDrop = (e: DragEvent) => e.preventDefault()
  const focus = (node: HTMLInputElement) => node.focus()
</script>

{#snippet chatRow(chat: Chat)}
  {@const status = app.status[chat.id]}
  <li class="chat" class:active={app.active === chat.id}>
    <span
      class="dot"
      class:off={!status}
      style:--dot={status ? STATUS[status].color : 'transparent'}
      aria-hidden="true"
    ></span>
    {#if renaming === chat.id}
      <input
        class="rename"
        value={chat.name}
        aria-label="Novo nome do chat"
        use:focus
        onblur={(e) => finishRename(chat, e.currentTarget.value)}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') renaming = null
        }}
      />
    {:else}
      <button
        class="label"
        draggable="true"
        ondragstart={() => (dragged = chat.id)}
        onclick={(e) => (e.altKey ? splitChat(chat.id) : openChat(chat.id))}
        ondblclick={() => (renaming = chat.id)}
        title={`${status ? STATUS[status].label : 'fechado'} · clique abre, Alt+clique abre ao lado, duplo clique renomeia, arraste para um grupo`}
      >
        <span class="text">{chat.name}</span>
        {#if chat.branch}<span class="branch" title={`${chat.branch} · ${chat.cwd}`}><GitBranch size={12} strokeWidth={1.5} /></span>{/if}
        {#if status && status !== 'idle'}<span class="glyph" style:color={STATUS[status].color}>{STATUS[status].glyph}</span>{/if}
      </button>
    {/if}
    <button class="icon-btn hover" title="Remover chat" aria-label="Remover chat" onclick={() => removeChat(chat.id)}><X {...ICON} /></button>
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
    <button class="icon-btn" title="Abrir pasta como projeto" aria-label="Novo projeto" onclick={addProject}><FolderPlus {...ICON} /></button>
  </header>

  <div class="tree">
    {#each app.projects as project (project.id)}
      <section ondragover={allowDrop} ondrop={(e) => drop(e, project.id)} aria-label={project.name}>
        <div class="row project">
          <span class="name" title={project.path}>{project.name}</span>
          <button class="icon-btn hover" title="Novo chat" aria-label="Novo chat" onclick={() => toggle({ kind: 'chat', projectId: project.id })}><Plus {...ICON} /></button>
          <button class="icon-btn hover" title="Novo grupo" aria-label="Novo grupo" onclick={() => toggle({ kind: 'group', projectId: project.id })}><ListPlus {...ICON} /></button>
          <button class="icon-btn hover" title="Abrir no editor" aria-label="Abrir no editor" onclick={() => openInEditor(project.path)}><SquarePen {...ICON} /></button>
          <button class="icon-btn hover" title="Remover projeto" aria-label="Remover projeto" onclick={() => removeProject(project.id)}><X {...ICON} /></button>
        </div>
        {@render picker(project.id)}

        {#each app.groups.filter((g) => g.projectId === project.id) as group (group.id)}
          <div class="group" role="group" aria-label={group.name} ondragover={allowDrop} ondrop={(e) => drop(e, project.id, group.id)}>
            <div class="row">
              <span class="name group-name"><ChevronDown size={12} strokeWidth={1.5} /> {group.name}</span>
              <button class="icon-btn hover" title="Novo chat no grupo" aria-label="Novo chat no grupo" onclick={() => toggle({ kind: 'chat', projectId: project.id, groupId: group.id })}><Plus {...ICON} /></button>
              <button class="icon-btn hover" title="Remover grupo (os chats ficam)" aria-label="Remover grupo" onclick={() => removeGroup(group.id)}><X {...ICON} /></button>
            </div>
            {@render picker(project.id, group.id)}
            <ul>
              {#each app.chats.filter((c) => c.groupId === group.id) as chat (chat.id)}
                {@render chatRow(chat)}
              {/each}
            </ul>
          </div>
        {/each}

        <ul>
          {#each app.chats.filter((c) => c.projectId === project.id && !c.groupId) as chat (chat.id)}
            {@render chatRow(chat)}
          {/each}
        </ul>
      </section>
    {:else}
      <p class="hint">Nenhum projeto ainda. Abra uma pasta para começar.</p>
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
    padding: 0 var(--space-3) var(--space-3);
  }
  section {
    padding: var(--space-2) 0;
  }
  section + section {
    border-top: 1px solid var(--line);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 28px;
    padding-left: var(--space-2);
    border-radius: var(--radius-md);
  }
  .project .name {
    font-size: 13px;
    line-height: 18px;
    font-weight: 600;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group {
    margin-left: var(--space-2);
  }
  .group-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
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
    height: 32px;
    padding-left: var(--space-2);
    border-radius: var(--radius-md);
    transition: background-color 120ms ease-out;
  }
  .chat:hover,
  .row:hover {
    background: var(--bg-200);
  }
  .chat.active {
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
    font-family: var(--font-mono);
    font-size: 13px;
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
  .glyph {
    margin-left: auto;
    padding-right: var(--space-1);
    font-family: var(--font-mono);
    font-weight: 600;
  }
  .icon-btn.hover {
    opacity: 0;
  }
  .row:hover .icon-btn.hover,
  .chat:hover .icon-btn.hover,
  .icon-btn.hover:focus-visible {
    opacity: 1;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: var(--space-1) 0 var(--space-2) var(--space-2);
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
    font: 13px var(--font-mono);
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

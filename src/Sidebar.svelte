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
      title={status ? STATUS[status].label : 'fechado'}
    ></span>
    {#if renaming === chat.id}
      <input
        class="rename"
        value={chat.name}
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
        title="Clique abre · Alt+clique abre ao lado · duplo clique renomeia · arraste para um grupo"
      >
        {chat.name}
        {#if chat.branch}<span class="branch" title={`${chat.branch} · ${chat.cwd}`}>⎇</span>{/if}
      </button>
    {/if}
    <button class="icon" title="Remover chat" onclick={() => removeChat(chat.id)}>×</button>
  </li>
{/snippet}

{#snippet picker(projectId: string, groupId?: string)}
  {#if adding?.projectId === projectId && adding.groupId === groupId}
    {#if adding.kind === 'chat'}
      <div class="picker">
        {#each app.profiles as profile (profile.id)}
          <button onclick={() => pickProfile(profile.id)}>{profile.name}</button>
        {/each}
        <label class="isolated" title="Cria um git worktree e uma branch kora/... só para este chat">
          <input type="checkbox" bind:checked={isolated} /> worktree isolado
        </label>
      </div>
    {:else}
      <form class="picker" onsubmit={submitGroup}>
        <input placeholder="Nome do grupo" bind:value={groupName} use:focus onkeydown={(e) => e.key === 'Escape' && (adding = null)} />
      </form>
    {/if}
  {/if}
{/snippet}

<aside>
  <header>
    <h1>Projetos</h1>
    <button class="icon add" title="Novo projeto" onclick={addProject}>+</button>
  </header>

  <div class="tree">
    {#each app.projects as project (project.id)}
      <section ondragover={allowDrop} ondrop={(e) => drop(e, project.id)} aria-label={project.name}>
        <div class="row project">
          <span class="name" title={project.path}>{project.name}</span>
          <button class="icon" title="Novo chat" onclick={() => toggle({ kind: 'chat', projectId: project.id })}>+</button>
          <button class="icon" title="Novo grupo" onclick={() => toggle({ kind: 'group', projectId: project.id })}>⊞</button>
          <button class="icon" title="Abrir no editor" onclick={() => openInEditor(project.path)}>↗</button>
          <button class="icon" title="Remover projeto" onclick={() => removeProject(project.id)}>×</button>
        </div>
        {@render picker(project.id)}

        {#each app.groups.filter((g) => g.projectId === project.id) as group (group.id)}
          <div class="group" role="group" aria-label={group.name} ondragover={allowDrop} ondrop={(e) => drop(e, project.id, group.id)}>
            <div class="row">
              <span class="name">▾ {group.name}</span>
              <button class="icon" title="Novo chat no grupo" onclick={() => toggle({ kind: 'chat', projectId: project.id, groupId: group.id })}>+</button>
              <button class="icon" title="Remover grupo (os chats ficam)" onclick={() => removeGroup(group.id)}>×</button>
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
      <p class="hint">Clique em <b>+</b> para escolher a pasta do primeiro projeto.</p>
    {/each}
  </div>

  <footer>
    <button onclick={() => (app.modal = 'settings')}>⚙ Configurações</button>
  </footer>
</aside>

<style>
  aside {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--panel);
    border-right: 1px solid var(--line);
    font-size: 13px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 12px 10px 16px;
  }
  h1 {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .tree {
    flex: 1;
    overflow-y: auto;
    padding: 0 8px 12px;
  }
  section {
    padding: 4px 0 8px;
  }
  section + section {
    border-top: 1px solid var(--line);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 28px;
    padding-left: 8px;
  }
  .project .name {
    font-weight: 600;
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group {
    margin-left: 10px;
  }
  .group .name {
    color: var(--muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0 0 8px;
  }
  .chat {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 8px;
    border-radius: 6px;
  }
  .chat:hover,
  .row:hover {
    background: var(--hover);
    border-radius: 6px;
  }
  .chat.active {
    background: var(--selected);
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot);
  }
  .dot.off {
    box-shadow: inset 0 0 0 1.5px var(--muted);
  }
  .label {
    flex: 1;
    min-width: 0;
    padding: 5px 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .icon {
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    color: var(--muted);
    opacity: 0;
  }
  .row:hover .icon,
  .chat:hover .icon,
  .icon:focus-visible,
  .add {
    opacity: 1;
  }
  .icon:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .add {
    font-size: 18px;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0 6px 16px;
  }
  .picker button {
    padding: 3px 9px;
    border: 1px solid var(--line);
    border-radius: 999px;
  }
  .picker button:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  input {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    border: 1px solid var(--accent);
    border-radius: 5px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }
  .isolated {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    margin-top: 2px;
    font-size: 11px;
    color: var(--muted);
  }
  .branch {
    margin-left: 4px;
    color: var(--accent);
  }
  .hint {
    padding: 8px;
    color: var(--muted);
    line-height: 1.5;
  }
  footer {
    padding: 8px;
    border-top: 1px solid var(--line);
  }
  footer button {
    width: 100%;
    padding: 7px 8px;
    border-radius: 6px;
    text-align: left;
    color: var(--muted);
  }
  footer button:hover {
    background: var(--hover);
    color: var(--fg);
  }
</style>

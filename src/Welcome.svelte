<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import Kbd from './Kbd.svelte'
  import { app, addChat, addProject, openChat, projectOf } from './lib/state.svelte'
  import { normalizeCombo } from './lib/keys'

  const SUGGESTIONS = ['Explicar a estrutura do projeto', 'Rodar os testes e resumir falhas', 'Revisar o último commit']
  const RECENT_LIMIT = 5

  // Vazio = primeiro projeto (a lista pode carregar depois da tela montar).
  let projectId = $state('')
  let profileIndex = $state(0)
  let prompt = $state('')
  let branch = $state<string | null>(null)
  let input = $state<HTMLInputElement>()

  const project = $derived(app.projects.find((p) => p.id === projectId) ?? app.projects[0])
  const profile = $derived(app.profiles[profileIndex % Math.max(1, app.profiles.length)])
  const isShell = $derived(!profile?.command.trim())
  const recents = $derived(
    app.chats
      .filter((c) => c.lastActive)
      .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0))
      .slice(0, RECENT_LIMIT),
  )

  $effect(() => {
    const path = project?.path
    if (!path) return
    invoke<string | null>('git_branch', { dir: path })
      .then((b) => project?.path === path && (branch = b))
      .catch(() => (branch = null))
  })

  $effect(() => {
    input?.focus()
  })

  async function start(text = prompt) {
    if (!project || !profile) return
    const id = await addChat(project.id, profile.id)
    if (id && text.trim()) app.pendingPrompt[id] = text.trim()
    prompt = ''
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Tab' && !e.shiftKey && !prompt) {
      e.preventDefault()
      profileIndex = (profileIndex + (e.shiftKey ? app.profiles.length - 1 : 1)) % app.profiles.length
    } else if (e.key === 'Enter') {
      e.preventDefault()
      start()
    }
  }

  const OPEN_FOLDER = '__open-folder'

  /** "Abrir nova pasta…" no fim da lista: cada pasta aberta vira um projeto. */
  function onPick(e: Event & { currentTarget: HTMLSelectElement }) {
    const value = e.currentTarget.value
    if (value !== OPEN_FOLDER) return void (projectId = value)
    e.currentTarget.value = project?.id ?? ''
    openFolder()
  }

  async function openFolder() {
    await addProject()
    projectId = app.projects.at(-1)?.id ?? projectId
  }

  /** "há 2 h", "ontem", "3 dias". */
  function ago(ms: number | undefined): string {
    if (!ms) return ''
    const minutes = Math.round((Date.now() - ms) / 60_000)
    if (minutes < 60) return minutes < 1 ? 'agora' : `há ${minutes} min`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `há ${hours} h`
    const days = Math.round(hours / 24)
    return days === 1 ? 'ontem' : `${days} dias`
  }

  const keysOf = (combo: string | undefined) => (combo ? normalizeCombo(combo).split('+') : [])
</script>

<div class="welcome">
  <div class="column">
    <h1 class="wordmark">kora<span class="cursor" aria-hidden="true"></span></h1>
    <p class="lead">Abra um projeto e diga ao agente o que fazer, ou rode comandos direto no shell.</p>

    <h2 class="title">nova sessão</h2>

    {#if app.projects.length === 0}
      <div class="row">
        <button class="btn primary" onclick={openFolder}><FolderOpen size={16} strokeWidth={1.5} /> Abrir pasta do projeto</button>
      </div>
    {:else}
      <div class="row">
        <label class="dir">
          <span>Diretório</span>
          <span class="select">
            <FolderOpen size={14} strokeWidth={1.5} />
            <select value={project?.id} onchange={onPick} aria-label="Diretório do projeto">
              {#each app.projects as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
              <option value={OPEN_FOLDER}>+ Abrir nova pasta…</option>
            </select>
          </span>
        </label>
        {#if branch}<span class="badge">{branch}</span>{/if}
        <button class="btn ghost sm" onclick={openFolder}>Abrir nova pasta</button>
      </div>

      <div class="prompt">
        <button
          class="mode"
          class:shell={isShell}
          title="Tab troca o agente"
          onclick={() => (profileIndex = (profileIndex + 1) % app.profiles.length)}
        >
          {isShell ? 'shell' : profile?.name}
        </button>
        <span class="caret" aria-hidden="true">›</span>
        <input
          bind:this={input}
          bind:value={prompt}
          onkeydown={onKey}
          placeholder={isShell ? 'Abrir um shell neste projeto' : 'O que vamos fazer neste projeto?'}
          aria-label="Primeiro prompt"
          spellcheck="false"
        />
        <button class="send" title="Começar (Enter)" aria-label="Começar" onclick={() => start()}>
          <CornerDownLeft size={14} strokeWidth={1.5} />
        </button>
      </div>

      {#if !isShell}
        <div class="suggestions">
          {#each SUGGESTIONS as suggestion (suggestion)}
            <button class="btn ghost sm" onclick={() => start(suggestion)}>{suggestion}</button>
          {/each}
        </div>
      {/if}
    {/if}

    {#if recents.length > 0}
      <p class="overline recent-title">recentes</p>
      <ul class="recents">
        {#each recents as chat (chat.id)}
          <li>
            <button onclick={() => openChat(chat.id)}>
              <span class="path">{projectOf(chat)?.name ?? ''}/{chat.name}</span>
              <span class="meta">{app.profiles.find((p) => p.id === chat.profileId)?.name ?? ''} · {ago(chat.lastActive)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <div class="shortcuts">
      <span><Kbd keys={keysOf(app.settings.keys.palette)} /> paleta de comandos</span>
      <span><Kbd keys={['Tab']} /> trocar agente (campo vazio)</span>
      <span><Kbd keys={keysOf(app.settings.keys.settings)} /> configurações</span>
    </div>
  </div>
</div>

<style>
  .welcome {
    height: 100%;
    overflow-y: auto;
  }
  .column {
    width: min(640px, calc(100% - 48px));
    margin: 0 auto;
    padding: 96px 0 48px;
  }
  .wordmark {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    margin: 0;
    font-family: var(--font-mono);
    font-size: 40px;
    line-height: 44px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .cursor {
    display: inline-block;
    width: 14px;
    height: 30px;
    margin-bottom: 6px;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .lead {
    margin: var(--space-3) 0 48px;
    font-size: 15px;
    line-height: 22px;
    color: var(--ink-muted);
  }
  .title {
    margin: 0 0 var(--space-4);
    font-family: var(--font-mono);
    font-size: 22px;
    line-height: 28px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    min-width: 0;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .dir {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 14px;
    color: var(--ink-muted);
  }
  .select {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding-left: var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    color: var(--ink);
  }
  .select:focus-within {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .select select {
    height: 100%;
    padding: 0 var(--space-3) 0 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: 13px var(--font-mono);
  }
  .select option {
    background: var(--bg-200);
  }
  .prompt {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-2) 0 var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--bg-000);
  }
  .prompt:focus-within {
    border-color: var(--accent);
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .mode {
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font: 500 11px/16px var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .mode.shell {
    background: var(--bg-300);
    color: var(--ink-muted);
  }
  .caret {
    font: 600 13px var(--font-mono);
    color: var(--accent);
  }
  .prompt input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--ink);
    font: 13px/20px var(--font-mono);
    caret-color: var(--accent);
  }
  .prompt input::placeholder {
    color: var(--ink-faint);
  }
  .send {
    display: grid;
    place-items: center;
    width: 28px;
    height: 22px;
    border: 1px solid var(--line-control);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
  }
  .send:hover {
    color: var(--ink);
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }
  .recent-title {
    margin: 48px 0 var(--space-2);
  }
  .recents {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .recents button {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    width: 100%;
    padding: 10px var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    text-align: left;
  }
  .recents button:hover {
    background: var(--bg-200);
    border-color: var(--line);
  }
  .path {
    font: 13px var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    flex: none;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .shortcuts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    margin-top: 48px;
    font-size: 13px;
    color: var(--ink-muted);
  }
  .shortcuts span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  @media (prefers-reduced-motion: reduce) {
    .cursor {
      animation: none;
    }
  }
</style>

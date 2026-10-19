<script lang="ts">
  import { onMount } from 'svelte'
  import { listen } from '@tauri-apps/api/event'
  import Sidebar from './Sidebar.svelte'
  import Terminal from './Terminal.svelte'
  import Settings from './Settings.svelte'
  import { app, load, save, openChat, closeTab, onHookStatus, STATUS, type Status, type Chat } from './lib/state.svelte'
  import { themeOf } from './lib/themes'

  const SAVE_DELAY_MS = 300

  let loaded = $state(false)
  let saveTimer: ReturnType<typeof setTimeout> | undefined

  onMount(() => {
    load().then((ok) => (loaded = ok))
    const unlisten = listen<{ chat: string; state: Status }>('chat-status', ({ payload }) =>
      onHookStatus(payload.chat, payload.state),
    )
    return () => {
      unlisten.then((stop) => stop())
    }
  })

  $effect(() => {
    if (!loaded) return
    const config = $state.snapshot({ profiles: app.profiles, settings: app.settings })
    const state = $state.snapshot({ projects: app.projects, groups: app.groups, chats: app.chats })
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => save(config, state), SAVE_DELAY_MS)
  })

  const theme = $derived(themeOf(app.settings.theme))
  const openChats = $derived(
    app.open.map((id) => app.chats.find((c) => c.id === id)).filter((c): c is Chat => c !== undefined),
  )
</script>

<div
  class="app"
  style:--bg={theme.background}
  style:--fg={theme.foreground}
  style:--accent={theme.cursor}
  style:--mono={app.settings.fontFamily}
>
  <Sidebar />

  <main>
    <nav class="tabs" aria-label="Chats abertos">
      {#each openChats as chat (chat.id)}
        {@const status = app.status[chat.id]}
        <div class="tab" class:active={app.active === chat.id}>
          <button class="tab-label" onclick={() => openChat(chat.id)} title={status ? STATUS[status].label : ''}>
            <span class="dot" style:--dot={status ? STATUS[status].color : 'transparent'}></span>
            {chat.name}
          </button>
          <button class="close" title="Fechar (encerra o processo)" onclick={() => closeTab(chat.id)}>×</button>
        </div>
      {/each}
    </nav>

    <div class="terms">
      {#each openChats as chat (chat.id)}
        <Terminal {chat} visible={app.active === chat.id} />
      {:else}
        <p class="empty">Escolha um chat na barra lateral ou crie um com <b>+</b> ao lado do projeto.</p>
      {/each}
    </div>
  </main>

  {#if app.showSettings}<Settings />{/if}

  {#if app.error}
    <div class="toast" role="alert">
      <span>{app.error}</span>
      <button title="Fechar" onclick={() => (app.error = '')}>×</button>
    </div>
  {/if}
</div>

<style>
  .app {
    --panel: color-mix(in srgb, var(--bg) 92%, var(--fg));
    --hover: color-mix(in srgb, var(--fg) 8%, transparent);
    --selected: color-mix(in srgb, var(--accent) 16%, transparent);
    --line: color-mix(in srgb, var(--fg) 12%, transparent);
    --muted: color-mix(in srgb, var(--fg) 55%, var(--bg));
    display: grid;
    grid-template-columns: 250px 1fr;
    height: 100vh;
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.3 'Segoe UI', system-ui, 'Ubuntu', sans-serif;
  }
  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .tabs {
    display: flex;
    gap: 2px;
    min-height: 38px;
    padding: 6px 8px 0;
    overflow-x: auto;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  .tab {
    display: flex;
    align-items: center;
    max-width: 220px;
    border-radius: 7px 7px 0 0;
    color: var(--muted);
  }
  .tab:hover {
    background: var(--hover);
  }
  .tab.active {
    background: var(--bg);
    color: var(--fg);
    box-shadow: inset 0 2px 0 var(--accent);
  }
  .tab-label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 0 4px 0 12px;
    height: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dot);
  }
  .close {
    width: 24px;
    height: 24px;
    margin-right: 4px;
    border-radius: 5px;
    opacity: 0.5;
  }
  .close:hover {
    opacity: 1;
    background: var(--hover);
  }
  .terms {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .empty {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    color: var(--muted);
  }
  .toast {
    position: fixed;
    right: 16px;
    bottom: 16px;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    max-width: 480px;
    padding: 12px 14px;
    border-left: 3px solid #e5484d;
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
    z-index: 20;
  }
  .toast button {
    font-size: 16px;
    color: var(--muted);
  }
  :global(button) {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
</style>

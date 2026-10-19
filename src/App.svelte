<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import Sidebar from './Sidebar.svelte'
  import Terminal from './Terminal.svelte'
  import Settings from './Settings.svelte'
  import Palette from './Palette.svelte'
  import Broadcast from './Broadcast.svelte'
  import Queue from './Queue.svelte'
  import Diff from './Diff.svelte'
  import Usage from './Usage.svelte'
  import {
    app,
    load,
    save,
    savedState,
    fail,
    chatById,
    focusChat,
    closePane,
    closeTab,
    popOut,
    toggleDirection,
    STATUS,
    type Status,
    type Chat,
    type Tab,
  } from './lib/state.svelte'
  import { AGENT_MESSAGE_LIMIT, onHookStatus, resumeAgents } from './lib/automation'
  import { handleCli, type CliRequest } from './lib/bridge'
  import { ACTIONS } from './lib/commands'
  import { comboOf, normalizeCombo } from './lib/keys'
  import { themeOf } from './lib/themes'

  const SAVE_DELAY_MS = 300

  let loaded = $state(false)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastWaiting = 0

  /** Atalhos globais: rodam antes do terminal receber a tecla. */
  function onKey(e: KeyboardEvent) {
    const combo = comboOf(e)
    const action = Object.entries(app.settings.keys).find(([, keys]) => normalizeCombo(keys) === combo)?.[0]
    if (!action || !ACTIONS[action]) return
    e.preventDefault()
    e.stopPropagation()
    ACTIONS[action].run()
  }

  onMount(() => {
    load().then((ok) => (loaded = ok))
    const listeners = [
      listen<{ chat: string; state: Status; session: string | null }>('chat-status', ({ payload }) =>
        onHookStatus(payload.chat, payload.state, payload.session),
      ),
      listen<CliRequest>('kora-cli', ({ payload }) => handleCli(payload)),
    ]
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      listeners.forEach((unlisten) => unlisten.then((stop) => stop()))
    }
  })

  $effect(() => {
    if (!loaded) return
    const config = $state.snapshot({ profiles: app.profiles, settings: app.settings })
    const state = $state.snapshot(savedState())
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => save(config, state), SAVE_DELAY_MS)
  })

  // Contador de "aguardando você" no título e na bandeja; pisca a barra de tarefas quando sobe.
  $effect(() => {
    const waiting = Object.values(app.status).filter((s) => s === 'waiting').length
    invoke('set_waiting', { count: waiting, attention: waiting > lastWaiting }).catch((e) => fail('Bandeja', e))
    lastWaiting = waiting
  })

  const theme = $derived(themeOf(app.settings.theme))
  const panes = $derived(
    app.tabs.flatMap((tab) => tab.panes.map((id, index) => ({ tab, index, chat: chatById(id) }))).filter(
      (p): p is { tab: Tab; index: number; chat: Chat } => p.chat !== undefined,
    ),
  )

  function paneStyle(tab: Tab, index: number): string {
    const size = 100 / tab.panes.length
    const start = index * size
    return tab.vertical
      ? `top:${start}%;height:${size}%;left:0;width:100%`
      : `left:${start}%;width:${size}%;top:0;height:100%`
  }
</script>

{#snippet dot(id: string)}
  {@const status = app.status[id]}
  <span class="dot" style:--dot={status ? STATUS[status].color : 'transparent'} title={status ? STATUS[status].label : ''}></span>
{/snippet}

<div
  class="app"
  style:--bg={theme.background}
  style:--fg={theme.foreground}
  style:--accent={theme.cursor}
  style:--mono={app.settings.fontFamily}
>
  <Sidebar />

  <main>
    <nav class="tabs" aria-label="Abas">
      {#each app.tabs as tab (tab.id)}
        <div class="tab" class:active={app.activeTab === tab.id}>
          <button class="tab-label" onclick={() => focusChat(tab.panes[0])}>
            {#each tab.panes as id, i (id)}
              {#if i > 0}<span class="sep">│</span>{/if}
              {@render dot(id)}
              <span class="name">{chatById(id)?.name}</span>
              {#if app.queue[id]?.length}<span class="badge" title="Prompts na fila">{app.queue[id].length}</span>{/if}
            {/each}
          </button>
          {#if tab.panes.length > 1 && app.activeTab === tab.id}
            <button class="tab-btn" title="Alternar lado a lado / empilhado" onclick={toggleDirection}>{tab.vertical ? '⬌' : '⬍'}</button>
          {/if}
          <button class="tab-btn" title="Fechar aba (encerra os processos)" onclick={() => closeTab(tab.id)}>×</button>
        </div>
      {/each}
    </nav>

    <div class="terms">
      {#each panes as { tab, index, chat } (chat.id)}
        {@const visible = tab.id === app.activeTab}
        {@const split = tab.panes.length > 1}
        <section
          class="pane"
          class:hidden={!visible}
          class:split
          class:focused={split && app.active === chat.id}
          style={paneStyle(tab, index)}
          aria-label={chat.name}
        >
          {#if split}
            <header>
              {@render dot(chat.id)}
              <span class="name">{chat.name}</span>
              <button title="Separar em aba própria" onclick={() => popOut(chat.id)}>⇱</button>
              <button title="Fechar (encerra o processo)" onclick={() => closePane(chat.id)}>×</button>
            </header>
          {/if}
          <div class="body">
            <Terminal {chat} {visible} />
          </div>
        </section>
      {:else}
        <div class="empty">
          <p>Escolha um chat na barra lateral ou crie um com <b>+</b> ao lado do projeto.</p>
          <p class="keys">
            <kbd>{app.settings.keys.palette}</kbd> paleta · <kbd>{app.settings.keys.split}</kbd> dividir ·
            <b>Alt+clique</b> num chat abre ao lado
          </p>
        </div>
      {/each}
    </div>
  </main>

  {#if app.modal === 'settings'}<Settings />{/if}
  {#if app.modal === 'palette'}{#key app.paletteOpens}<Palette />{/key}{/if}
  {#if app.modal === 'broadcast'}<Broadcast />{/if}
  {#if app.modal === 'queue'}<Queue />{/if}
  {#if app.modal === 'diff'}<Diff />{/if}
  {#if app.modal === 'usage'}<Usage />{/if}

  {#if app.agentsPaused}
    <div class="paused" role="alert">
      <span>
        Agentes pausados: {AGENT_MESSAGE_LIMIT} mensagens entre eles sem você interagir. As próximas mensagens do
        <code>kora-cli</code> são recusadas até você liberar.
      </span>
      <button class="btn primary" onclick={resumeAgents}>Liberar</button>
    </div>
  {/if}

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
    max-width: 360px;
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
    gap: 7px;
    min-width: 0;
    height: 100%;
    padding: 0 4px 0 12px;
    overflow: hidden;
    white-space: nowrap;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sep {
    color: var(--line);
  }
  .badge {
    padding: 0 5px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font-size: 10px;
    font-weight: 700;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--dot);
  }
  .tab-btn {
    flex: none;
    width: 24px;
    height: 24px;
    margin-right: 2px;
    border-radius: 5px;
    opacity: 0.55;
  }
  .tab-btn:hover {
    opacity: 1;
    background: var(--hover);
  }
  .terms {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .pane {
    position: absolute;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }
  .pane.hidden {
    display: none;
  }
  .pane.split {
    border: 1px solid var(--line);
    margin: -0.5px;
  }
  .pane.focused {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
  }
  .pane header {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    padding: 0 4px 0 10px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    font-size: 12px;
    color: var(--muted);
  }
  .pane.focused header {
    color: var(--fg);
  }
  .pane header .name {
    flex: 1;
  }
  .pane header button {
    width: 22px;
    height: 22px;
    border-radius: 4px;
  }
  .pane header button:hover {
    background: var(--hover);
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .empty {
    display: grid;
    place-content: center;
    gap: 4px;
    height: 100%;
    text-align: center;
    color: var(--muted);
  }
  .keys {
    font-size: 12px;
  }
  kbd {
    padding: 1px 5px;
    border: 1px solid var(--line);
    border-radius: 4px;
    font: 11px var(--mono);
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
  .paused {
    position: fixed;
    left: 50%;
    top: 12px;
    transform: translateX(-50%);
    display: flex;
    gap: 14px;
    align-items: center;
    max-width: min(640px, calc(100vw - 32px));
    padding: 10px 12px 10px 16px;
    border: 1px solid #f2b84b;
    border-radius: 10px;
    background: var(--panel);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
    z-index: 20;
  }
  .toast button {
    font-size: 16px;
    color: var(--muted);
  }
</style>

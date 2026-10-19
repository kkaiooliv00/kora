<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import Columns2 from '@lucide/svelte/icons/columns-2'
  import Rows2 from '@lucide/svelte/icons/rows-2'
  import Maximize from '@lucide/svelte/icons/maximize-2'
  import PanelRight from '@lucide/svelte/icons/panel-right'
  import glyph from './assets/kora-glyph.svg'
  import Sidebar from './Sidebar.svelte'
  import Terminal from './Terminal.svelte'
  import Welcome from './Welcome.svelte'
  import Settings from './Settings.svelte'
  import Palette from './Palette.svelte'
  import Broadcast from './Broadcast.svelte'
  import Queue from './Queue.svelte'
  import Diff from './Diff.svelte'
  import Usage from './Usage.svelte'
  import Kbd from './Kbd.svelte'
  import ToastStack from './ToastStack.svelte'
  import Menu from './Menu.svelte'
  import AgentPanel from './AgentPanel.svelte'
  import ApprovalCard from './ApprovalCard.svelte'
  import {
    app,
    load,
    save,
    savedState,
    fail,
    chatById,
    chatDir,
    whereOf,
    focusChat,
    closePane,
    closeTab,
    popOut,
    toggleDirection,
    STATUS,
    type Status,
    type HookDetail,
    type Chat,
    type Tab,
  } from './lib/state.svelte'
  import { AGENT_MESSAGE_LIMIT, onHookStatus, resumeAgents } from './lib/automation'
  import { handleCli, type CliRequest } from './lib/bridge'
  import { ACTIONS, openPalette } from './lib/commands'
  import { menuState } from './lib/menu.svelte'
  import { comboOf, normalizeCombo } from './lib/keys'

  const SAVE_DELAY_MS = 300

  let loaded = $state(false)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastWaiting = 0
  let branch = $state<string | null>(null)
  // Sem aba ativa = tela inicial; as abas seguem montadas (processos vivos) e voltam com um clique.
  const hasTab = $derived(app.tabs.some((t) => t.id === app.activeTab))
  const goHome = () => (app.activeTab = null)

  /** Atalhos globais: rodam antes do terminal receber a tecla. */
  function onKey(e: KeyboardEvent) {
    // Esc fecha qualquer modal aqui, na captura: se o foco estiver no terminal, o xterm engoliria a tecla.
    if (e.key === 'Escape' && app.modal && !menuState.open) {
      e.preventDefault()
      e.stopPropagation()
      app.modal = null
      return
    }
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
      listen<{ chat: string; state: Status; session: string | null; detail: HookDetail | null }>('chat-status', ({ payload }) =>
        onHookStatus(payload.chat, payload.state, payload.session, payload.detail),
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

  const waitingNames = $derived(
    Object.entries(app.status)
      .filter(([, s]) => s === 'waiting')
      .map(([id]) => chatById(id)?.name ?? 'chat'),
  )
  const waiting = $derived(waitingNames.length)

  // Ponto na bandeja, "(N) kora — projeto / grupo" no título; pisca a barra de tarefas quando sobe.
  $effect(() => {
    const context = activeChat ? whereOf(activeChat) : null
    invoke('set_waiting', { waiting: waitingNames, context, attention: waiting > lastWaiting }).catch((e) => fail('Bandeja', e))
    lastWaiting = waiting
  })

  const activeChat = $derived(app.active ? chatById(app.active) : undefined)
  // Sem chat aberto (boas-vindas) o painel não tem o que mostrar.
  const showPanel = $derived(app.showPanel && app.tabs.length > 0)
  const activeDir = $derived(activeChat ? chatDir(activeChat) : undefined)
  const activeProfile = $derived(activeChat ? app.profiles.find((p) => p.id === activeChat.profileId) : undefined)
  const activeStatus = $derived(app.active ? app.status[app.active] : undefined)

  $effect(() => {
    const dir = activeDir
    if (!dir) {
      branch = null
      return
    }
    invoke<string | null>('git_branch', { dir })
      .then((b) => activeDir === dir && (branch = b))
      .catch(() => (branch = null))
  })

  /** `C:\Users\fulano\proj` → `~/proj` na barra de status. */
  function shortPath(path: string | undefined): string {
    if (!path) return ''
    const normalized = path.replace(/\\/g, '/')
    const home = normalized.match(/^([A-Za-z]:)?\/(Users|home)\/[^/]+/)?.[0]
    return home ? `~${normalized.slice(home.length)}` : normalized
  }

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

  const comboKeys = (combo: string | undefined) => (combo ? normalizeCombo(combo).split('+') : [])
</script>

{#snippet dot(id: string)}
  {@const status = app.status[id]}
  <span class="dot" style:--dot={status ? STATUS[status].color : 'var(--line-control)'} aria-hidden="true"></span>
{/snippet}

<div class="app">
  <header class="topbar">
    <button class="icon-btn glyph" class:on={!hasTab} title="Início" aria-label="Início" onclick={goHome}>
      <img src={glyph} alt="" width="18" height="18" />
    </button>
    <nav class="tabs" aria-label="Sessões abertas">
      {#each app.tabs as tab (tab.id)}
        {@const active = app.activeTab === tab.id}
        <div class="tab" class:active>
          <button
            class="tab-label"
            onclick={() => focusChat(tab.panes[0])}
            title={tab.panes.map((id) => `${chatById(id)?.name}: ${STATUS[app.status[id] ?? 'idle'].label}`).join('\n')}
          >
            {#each tab.panes as id, i (id)}
              {#if i > 0}<span class="sep" aria-hidden="true">│</span>{/if}
              {@render dot(id)}
              <span class="name">{chatById(id)?.name}</span>
              {#if app.queue[id]?.pending.length}<span class="badge accent" title="Prompts na fila">{app.queue[id].pending.length} na fila</span>{/if}
            {/each}
          </button>
          {#if tab.panes.length > 1 && active}
            <button class="icon-btn" title="Alternar lado a lado / empilhado" aria-label="Alternar divisão" onclick={toggleDirection}>
              {#if tab.vertical}<Columns2 size={14} strokeWidth={1.5} />{:else}<Rows2 size={14} strokeWidth={1.5} />{/if}
            </button>
          {/if}
          <button class="icon-btn" title="Fechar (encerra os processos)" aria-label="Fechar aba" onclick={() => closeTab(tab.id)}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      {/each}
      <button class="icon-btn add" title="Nova sessão" aria-label="Nova sessão" onclick={goHome}>
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </nav>
    <div class="top-right">
      {#if app.agentsPaused}<span class="badge warning">‖ pausado</span>{/if}
      {#if waiting > 0}<span class="badge warning">! {waiting} aguardando você</span>{/if}
      {#if branch}<span class="badge">{branch}</span>{/if}
      {#if activeStatus === 'running'}<span class="badge accent">› agente ativo</span>{/if}
      <button
        class="icon-btn"
        class:on={app.showPanel}
        title="Painel do agente"
        aria-label="Mostrar painel do agente"
        aria-pressed={app.showPanel}
        onclick={() => (app.showPanel = !app.showPanel)}
      >
        <PanelRight size={16} strokeWidth={1.5} />
      </button>
      <button class="palette-hint" title="Paleta de comandos" onclick={() => openPalette()}>
        <Kbd keys={comboKeys(app.settings.keys.palette)} />
      </button>
    </div>
  </header>

  {#if app.agentsPaused}
    <div class="paused-banner" role="alert">
      <span class="paused-glyph" aria-hidden="true">‖</span>
      <div>
        <strong>Agentes pausados pelo anti-loop</strong>
        <p>
          {AGENT_MESSAGE_LIMIT} mensagens entre chats sem você interagir. Nada foi perdido: os agentes seguem abertos, só o
          <code>kora-cli send</code> fica recusado até você retomar.
        </p>
      </div>
      <button class="btn primary sm" onclick={resumeAgents}>Retomar</button>
    </div>
  {/if}

  <div class="body" class:with-panel={showPanel}>
    <Sidebar />

    <main class="terms">
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
            {@const status = STATUS[app.status[chat.id] ?? 'idle']}
            <header>
              {@render dot(chat.id)}
              <span class="name">{chat.name}</span>
              <span class="where">{whereOf(chat)}</span>
              {#if app.status[chat.id] && app.status[chat.id] !== 'idle'}
                <span class="badge {status.tone}">{status.glyph} {status.label}</span>
              {/if}
              <button class="icon-btn" title="Dividir com outro chat" aria-label="Dividir com outro chat" onclick={() => { focusChat(chat.id); openPalette('Dividir com ') }}>
                <Columns2 size={14} strokeWidth={1.5} />
              </button>
              <button class="icon-btn" title="Maximizar em aba própria" aria-label="Maximizar em aba própria" onclick={() => popOut(chat.id)}>
                <Maximize size={14} strokeWidth={1.5} />
              </button>
              <button class="icon-btn" title="Fechar (encerra o processo)" aria-label="Fechar" onclick={() => closePane(chat.id)}>
                <X size={14} strokeWidth={1.5} />
              </button>
            </header>
          {/if}
          <div class="pane-body">
            <Terminal {chat} {visible} />
            <ApprovalCard chatId={chat.id} />
          </div>
        </section>
      {/each}
      {#if !hasTab}<Welcome />{/if}
    </main>
    {#if showPanel}<AgentPanel />{/if}
  </div>

  <footer class="statusbar">
    <span>{shortPath(activeDir)}</span>
    {#if branch}<span>{branch}</span>{/if}
    <span class="spacer"></span>
    {#if activeChat && activeStatus}
      <span style:color={STATUS[activeStatus].color}>{STATUS[activeStatus].glyph} {STATUS[activeStatus].label}</span>
    {/if}
    {#if activeProfile}<span>[{activeProfile.name.toLowerCase()}]</span>{/if}
  </footer>

  {#if app.modal === 'settings'}<Settings />{/if}
  {#if app.modal === 'palette'}{#key app.paletteOpens}<Palette />{/key}{/if}
  {#if app.modal === 'broadcast'}<Broadcast />{/if}
  {#if app.modal === 'queue'}<Queue />{/if}
  {#if app.modal === 'diff'}<Diff />{/if}
  {#if app.modal === 'usage'}<Usage />{/if}

  <ToastStack />
  <Menu />
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: 44px auto 1fr 28px;
    height: 100vh;
    background: var(--bg-100);
    color: var(--ink);
  }

  /* ---- barra superior ---- */
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  .glyph {
    flex: none;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tab {
    display: flex;
    align-items: center;
    flex: none;
    max-width: 360px;
    height: 28px;
    padding-right: 2px;
    border-radius: var(--radius-md);
    color: var(--ink-muted);
    transition: background-color 120ms ease-out;
  }
  .tab:hover {
    background: var(--bg-200);
    color: var(--ink);
  }
  .tab.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .tab-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    height: 100%;
    padding: 0 var(--space-2) 0 var(--space-3);
    font-family: var(--font-mono);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
  }
  .tab .icon-btn {
    width: 22px;
    height: 22px;
    color: inherit;
    opacity: 0.6;
  }
  .tab .icon-btn:hover {
    opacity: 1;
  }
  .add {
    margin-left: var(--space-1);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sep {
    color: var(--line-control);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 1px;
    background: var(--dot);
  }
  .top-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: none;
  }
  .palette-hint {
    display: flex;
    border-radius: var(--radius-sm);
  }

  /* ---- corpo ---- */
  .body {
    grid-row: 3;
    display: grid;
    grid-template-columns: 232px 1fr;
    min-height: 0;
  }
  .body.with-panel {
    grid-template-columns: 232px 1fr 280px;
  }
  .icon-btn.on {
    color: var(--accent);
  }
  .terms {
    position: relative;
    min-width: 0;
    min-height: 0;
    background: var(--bg-000);
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
    border-color: var(--accent);
  }
  .pane header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-2) 0 var(--space-3);
    border-bottom: 1px solid var(--line);
    background: var(--bg-100);
  }
  .pane header .name {
    flex: none;
    max-width: 40%;
    font: 600 13px var(--font-mono);
    color: var(--ink);
  }
  .where {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .pane-body {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  /* ---- barra de status ---- */
  .statusbar {
    grid-row: 4;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: 0 var(--space-3);
    border-top: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
  }
  .spacer {
    flex: 1;
  }

  /* ---- avisos flutuantes ---- */
  /* Linhas fixas: a faixa de pausado (linha 2) pode não existir. */
  .topbar {
    grid-row: 1;
  }
  .paused-banner {
    grid-row: 2;
    display: flex;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--line);
    background: var(--warning-soft);
  }
  .paused-banner div {
    flex: 1;
  }
  .paused-banner strong {
    font-size: 13px;
    line-height: 20px;
  }
  .paused-banner p {
    margin: 0;
    font-size: 12px;
    line-height: 18px;
    color: var(--ink-muted);
  }
  .paused-glyph {
    font: 600 16px var(--font-mono);
    color: var(--warning);
  }
</style>

<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import Columns2 from '@lucide/svelte/icons/columns-2'
  import SplitIcon from '@lucide/svelte/icons/square-split-horizontal'
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
  import ProjectSettings from './ProjectSettings.svelte'
  import Agents from './Agents.svelte'
  import Board from './Board.svelte'
  import Compare from './Compare.svelte'
  import History from './History.svelte'
  import Template from './Template.svelte'
  import Play from '@lucide/svelte/icons/play'
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
    requestClosePane,
    requestCloseTab,
    popOut,
    runProject,
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
  import { themeOf } from './lib/themes'
  import { watchStats } from './lib/stats.svelte'
  import { checkBudget, watchBudget } from './lib/budget'
  import { SIDEBAR, clampSidebar, dragDivider, paneSizes } from './lib/resize'
  import { comboOf, normalizeCombo } from './lib/keys'

  const SAVE_DELAY_MS = 300

  let loaded = $state(false)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastWaiting = 0
  let branch = $state<string | null>(null)
  // Sem aba ativa = tela inicial; as abas seguem montadas (processos vivos) e voltam com um clique.
  const hasTab = $derived(app.tabs.some((t) => t.id === app.activeTab))
  const goHome = () => (app.activeTab = null)

  /** Ações que agem no chat em foco (não valem na tela inicial nem por trás de um modal). */
  const CHAT_ACTIONS = new Set(['search', 'split', 'closePane', 'queue', 'diff', 'prevPrompt', 'nextPrompt'])
  const REPEATABLE = new Set(['nextTab', 'prevTab', 'prevPrompt', 'nextPrompt'])

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
    if (e.repeat && !REPEATABLE.has(action)) return
    if (app.modal && app.modal !== 'palette' && CHAT_ACTIONS.has(action)) return
    if (!hasTab && CHAT_ACTIONS.has(action)) return
    ACTIONS[action].run()
  }

  onMount(() => {
    load().then((ok) => {
      loaded = ok
      checkBudget()
    })
    const listeners = [
      listen<{ chat: string; state: Status; session: string | null; detail: HookDetail | null }>('chat-status', ({ payload }) =>
        onHookStatus(payload.chat, payload.state, payload.session, payload.detail),
      ),
      listen<CliRequest>('kora-cli', ({ payload }) => handleCli(payload)),
      listen<string>('chat-checkpoint', ({ payload }) => (app.checkpointRev[payload] = (app.checkpointRev[payload] ?? 0) + 1)),
    ]
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('focusin', keepFocusInModal)
    const stopStats = watchStats()
    const stopBudget = watchBudget()
    return () => {
      stopStats()
      stopBudget()
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('focusin', keepFocusInModal)
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
  const showPanel = $derived(app.showPanel && hasTab)
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
    const sizes = paneSizes(tab.sizes, tab.panes.length)
    const size = sizes[index]
    const start = sizes.slice(0, index).reduce((a, b) => a + b, 0)
    return tab.vertical
      ? `top:${start}%;height:${size}%;left:0;width:100%`
      : `left:${start}%;width:${size}%;top:0;height:100%`
  }

  let termsEl = $state<HTMLElement>()
  const activeTabObj = $derived(app.tabs.find((t) => t.id === app.activeTab))

  /** Arrastar a divisória `index` (entre os painéis index e index+1) da aba em foco. */
  function startPaneDrag(e: PointerEvent, tab: Tab, index: number) {
    if (!termsEl) return
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    const box = termsEl.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const pct = tab.vertical ? ((ev.clientY - box.top) / box.height) * 100 : ((ev.clientX - box.left) / box.width) * 100
      const current = app.tabs.find((t) => t.id === tab.id)
      if (!current) return
      const sizes = dragDivider(paneSizes(current.sizes, current.panes.length), index, pct, tab.vertical ? box.height : box.width)
      app.tabs = app.tabs.map((t) => (t.id === tab.id ? { ...t, sizes } : t))
    }
    track(handle, move)
  }

  /** Liga o `move` até soltar, cancelar ou perder a captura do ponteiro. */
  function track(handle: HTMLElement, move: (ev: PointerEvent) => void) {
    const stop = new AbortController()
    const end = () => stop.abort()
    handle.addEventListener('pointermove', move, { signal: stop.signal })
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, end, { signal: stop.signal })
  }

  function startSidebarDrag(e: PointerEvent) {
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    handle.setPointerCapture(e.pointerId)
    track(handle, (ev) => (app.sidebarWidth = clampSidebar(ev.clientX)))
  }

  const dividerStyle = (tab: Tab, index: number) => {
    const at = paneSizes(tab.sizes, tab.panes.length).slice(0, index + 1).reduce((a, b) => a + b, 0)
    return tab.vertical ? `top:${at}%` : `left:${at}%`
  }

  // Modal aberto: o teclado vai para ele, nunca para o terminal de trás (um "y" aprovaria um pedido do agente).
  const FIELD_SELECTOR = '[autofocus], input:not([type=checkbox]):not([type=radio]):not([disabled]), textarea, select'
  const dialogEl = () => document.querySelector<HTMLElement>('[role=dialog]')
  $effect(() => {
    if (!app.modal) return
    tick().then(() => {
      const dialog = dialogEl()
      if (!dialog || dialog.contains(document.activeElement)) return
      ;(document.activeElement as HTMLElement | null)?.blur()
      const target = dialog.querySelector<HTMLElement>(FIELD_SELECTOR) ?? dialog.querySelector<HTMLElement>('button')
      target?.focus()
    })
  })
  /** Foco que escapa do modal (Tab, clique atrás) volta para dentro dele. */
  function keepFocusInModal(e: FocusEvent) {
    const dialog = app.modal ? dialogEl() : null
    if (!dialog || menuState.open || dialog.contains(e.target as Node)) return
    dialog.querySelector<HTMLElement>(FIELD_SELECTOR)?.focus() ?? dialog.querySelector<HTMLElement>('button')?.focus()
  }

  let tabsEl = $state<HTMLElement>()
  $effect(() => {
    void app.activeTab
    tabsEl?.querySelector('.tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  })

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
    <nav class="tabs" aria-label="Sessões abertas" bind:this={tabsEl} onwheel={(e) => tabsEl && (tabsEl.scrollLeft += e.deltaY)}>
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
          <button class="icon-btn" title="Fechar (encerra os processos)" aria-label="Fechar aba" onclick={() => requestCloseTab(tab.id)}>
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

  <div class="body" class:with-panel={showPanel} style:--side="{app.sidebarWidth}px">
    <Sidebar />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="side-resize"
      title="Arraste para ajustar a largura (duplo clique volta ao padrão)"
      onpointerdown={startSidebarDrag}
      ondblclick={() => (app.sidebarWidth = SIDEBAR.default)}
    ></div>

    <main class="terms" bind:this={termsEl} style:--term-bg={themeOf(app.settings.theme).background}>
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
              {#if !chat.runOf}
                <button class="icon-btn" title="Rodar o projeto ao lado" aria-label="Rodar o projeto" onclick={() => runProject(chat.id)}>
                  <Play size={14} strokeWidth={1.5} />
                </button>
              {/if}
              <button class="icon-btn" title="Dividir com outro chat" aria-label="Dividir com outro chat" onclick={() => { focusChat(chat.id); openPalette('Dividir com ') }}>
                <SplitIcon size={14} strokeWidth={1.5} />
              </button>
              <button class="icon-btn" title="Maximizar em aba própria" aria-label="Maximizar em aba própria" onclick={() => popOut(chat.id)}>
                <Maximize size={14} strokeWidth={1.5} />
              </button>
              <button class="icon-btn" title="Fechar (encerra o processo)" aria-label="Fechar" onclick={() => requestClosePane(chat.id)}>
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
      {#if hasTab && activeTabObj && activeTabObj.panes.length > 1}
        {#each activeTabObj.panes.slice(0, -1) as id, index (id)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="divider"
            class:vertical={activeTabObj.vertical}
            style={dividerStyle(activeTabObj, index)}
            title="Arraste para redimensionar (duplo clique divide igual)"
            onpointerdown={(e) => startPaneDrag(e, activeTabObj, index)}
            ondblclick={() => (app.tabs = app.tabs.map((t) => (t.id === activeTabObj.id ? { ...t, sizes: undefined } : t)))}
          ></div>
        {/each}
      {/if}
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
  {#if app.modal === 'project'}<ProjectSettings />{/if}
  {#if app.modal === 'agents'}<Agents />{/if}
  {#if app.modal === 'board'}<Board />{/if}
  {#if app.modal === 'compare'}<Compare />{/if}
  {#if app.modal === 'history'}<History />{/if}
  {#if app.modal === 'template'}<Template />{/if}

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
    /* Some nas bordas quando há abas fora da vista. */
    mask-image: linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 24px), transparent);
  }
  /* Painel estreito: os botões ficam; caminho e texto do status saem. */
  @container (max-width: 380px) {
    .pane header .where,
    .pane header .badge {
      display: none;
    }
  }
  .pane header .icon-btn {
    flex: none;
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
    position: relative;
    grid-row: 3;
    display: grid;
    grid-template-columns: var(--side, 288px) 1fr;
    min-height: 0;
  }
  .body.with-panel {
    grid-template-columns: var(--side, 288px) 1fr 280px;
  }
  .side-resize {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--side, 288px) - 3px);
    width: 6px;
    cursor: col-resize;
    z-index: 3;
  }
  .side-resize:hover {
    background: var(--accent-soft);
  }
  .divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    margin-left: -3px;
    cursor: col-resize;
    z-index: 3;
  }
  .divider.vertical {
    top: auto;
    bottom: auto;
    left: 0;
    right: 0;
    width: auto;
    height: 6px;
    margin: -3px 0 0;
    cursor: row-resize;
  }
  .divider:hover {
    background: var(--accent-soft);
  }
  .icon-btn.on {
    color: var(--accent);
  }
  .terms {
    position: relative;
    min-width: 0;
    min-height: 0;
    background: var(--term-bg, var(--bg-000));
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
    overflow: hidden;
    container-type: inline-size;
    height: 36px;
    padding: 0 var(--space-2) 0 var(--space-3);
    border-bottom: 1px solid var(--line);
    background: var(--bg-100);
  }
  .pane header .name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

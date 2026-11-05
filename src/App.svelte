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
  import ApprovalBar from './ApprovalBar.svelte'
  import Composer from './Composer.svelte'
  import LoopCard from './LoopCard.svelte'
  import Tooltip from './Tooltip.svelte'
  import Shortcuts from './Shortcuts.svelte'
  import Tour from './Tour.svelte'
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
    hidePane,
    setLayout,
    showSideBySide,
    goToWaiting,
    placeInView,
    layoutOf,
    CHAT_DRAG,
    runProject,
    projectOf,
    isOpen,
    openIds,
    STATUS,
    type Status,
    type HookDetail,
    type Chat,
    type Tab,
    type Layout,
  } from './lib/state.svelte'
  import { AGENT_MESSAGE_LIMIT, onHookStatus, resumeAgents, resumeAllLoops } from './lib/automation'
  import { openActiveInEditor } from './lib/automation'
  import { terminals } from './lib/terminals'
  import {
    contextPercent,
    describeLimit,
    formatTokens,
    limitSource,
    usageLimits,
    usageToday,
    watchUsageLimits,
    watchUsageToday,
    type LimitSource,
  } from './lib/stats.svelte'
  import { handleCli, type CliRequest } from './lib/bridge'
  import { ACTIONS, openPalette } from './lib/commands'
  import { menuState } from './lib/menu.svelte'
  import { applyUiTheme, themeOf } from './lib/themes'
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

  /** Foco num campo de texto ou no terminal: `?` é texto, não atalho. */
  const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || !!target.closest('.xterm'))

  /** Atalhos globais: rodam antes do terminal receber a tecla. */
  function onKey(e: KeyboardEvent) {
    // Esc fecha qualquer modal aqui, na captura: se o foco estiver no terminal, o xterm engoliria a tecla.
    if (e.key === 'Escape' && app.modal && !menuState.open) {
      e.preventDefault()
      e.stopPropagation()
      app.modal = null
      return
    }
    if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey && !typing(e.target) && !app.modal) {
      e.preventDefault()
      app.modal = 'shortcuts'
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
      // Primeira execução: o tour abre sozinho (refazer pela paleta, "Fazer o tour").
      if (ok && !app.settings.tourDone) app.tourStep = 0
    })
    const listeners = [
      listen<{ chat: string; state: Status; session: string | null; detail: HookDetail | null }>('chat-status', ({ payload }) =>
        onHookStatus(payload.chat, payload.state, payload.session, payload.detail),
      ),
      listen<CliRequest>('kora-cli', ({ payload }) => handleCli(payload)),
      listen('tray-open', goToWaiting),
      listen<string>('chat-checkpoint', ({ payload }) => (app.checkpointRev[payload] = (app.checkpointRev[payload] ?? 0) + 1)),
    ]
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('focusin', keepFocusInModal)
    const stopStats = watchStats()
    const stopBudget = watchBudget()
    const stopUsage = watchUsageToday()
    const stopLimits = watchUsageLimits()
    return () => {
      stopUsage()
      stopLimits()
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

  $effect(() => applyUiTheme(app.settings.theme))

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

  /** Largura da área dos terminais (para o layout automático). */
  let termsWidth = $state(0)
  const MIN_PANE_PX = 360
  /** O layout escolhido; sem escolha, colunas enquanto cada uma tiver 360px, senão grade. */
  const effectiveLayout = (tab: Tab): Layout =>
    tab.layout ?? (tab.panes.length > 1 && termsWidth / tab.panes.length < MIN_PANE_PX ? 'grid' : layoutOf(tab))

  function paneStyle(tab: Tab, index: number): string {
    const layout = effectiveLayout(tab)
    if (layout === 'single') return 'left:0;top:0;width:100%;height:100%'
    if (layout === 'grid') {
      const cols = Math.ceil(Math.sqrt(tab.panes.length))
      const rows = Math.ceil(tab.panes.length / cols)
      const w = 100 / cols
      const h = 100 / rows
      return `left:${(index % cols) * w}%;top:${Math.floor(index / cols) * h}%;width:${w}%;height:${h}%`
    }
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

  // Breadcrumb: projeto / grupo / chat (o grupo abre os chats dele lado a lado).
  const crumbProject = $derived(activeChat ? projectOf(activeChat) : undefined)
  const crumbGroup = $derived(activeChat ? (app.groups.find((g) => g.id === activeChat.groupId)?.name ?? activeChat.branch ?? branch ?? '') : '')
  const groupMates = $derived.by(() => {
    const chat = activeChat
    if (!chat) return []
    return app.chats
      .filter((c) => !c.archived && c.projectId === chat.projectId)
      .filter((c) => (chat.groupId ? c.groupId === chat.groupId : !c.groupId && (chat.branch ? c.branch === chat.branch : !c.branch)))
      .map((c) => c.id)
  })
  /** Vista com vários chats (mostra o seletor de layout); lado a lado só fora do "1 painel". */
  const multi = $derived(hasTab && activeTabObj && activeTabObj.panes.length > 1 ? activeTabObj.panes.length : 0)
  const sideBySide = $derived(multi && activeTabObj && effectiveLayout(activeTabObj) !== 'single' ? multi : 0)

  // ---- arrastar chats: da barra lateral para a área dos terminais, ou um painel para outro lugar ----
  /** Arrastando um chat por cima da área (mostra o aviso de soltar). */
  let dropping = $state(false)
  /** Painel sob o cursor: o chat entra logo depois dele. */
  let dropAfter = $state<string | null>(null)
  const isChatDrag = (e: DragEvent) => !!e.dataTransfer?.types.includes(CHAT_DRAG)

  function onDragOver(e: DragEvent, paneId: string | null = null) {
    if (!isChatDrag(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    dropping = true
    dropAfter = paneId
  }

  function onDragLeave(e: DragEvent) {
    const into = e.relatedTarget
    if (into instanceof Node && termsEl?.contains(into)) return
    dropping = false
    dropAfter = null
  }

  function onDrop(e: DragEvent) {
    if (!isChatDrag(e)) return
    e.preventDefault()
    const id = e.dataTransfer?.getData(CHAT_DRAG)
    if (id) placeInView(id, dropAfter ?? undefined)
    dropping = false
    dropAfter = null
  }

  function onPaneDragStart(e: DragEvent, id: string) {
    e.dataTransfer?.setData(CHAT_DRAG, id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }
  const LAYOUTS: { id: Layout; label: string }[] = [
    { id: 'single', label: '1 painel' },
    { id: 'columns', label: 'Colunas' },
    { id: 'grid', label: 'Grade' },
  ]
  const loopPaused = $derived(Object.keys(app.loopPaused).length)
  const working = $derived(Object.values(app.status).filter((s) => s === 'running').length)
  const memory = $derived(app.active ? contextPercent(app.agentInfo[app.active]) : undefined)
  const model = $derived(app.active ? app.agentInfo[app.active]?.context?.model : undefined)
  const isClaudeChat = $derived(activeProfile?.hooks === 'claude')
  /** Limite de uso dos agentes com chat aberto; a barra mostra a janela mais cheia de cada um. */
  const LIMIT_NAMES: Record<LimitSource, string> = { claude: 'claude', codex: 'codex' }
  const limitsInUse = $derived.by(() => {
    const open = new Set(openIds())
    const sources = new Set(app.chats.filter((c) => open.has(c.id)).map((c) => limitSource(app.profiles.find((p) => p.id === c.profileId))))
    return (Object.keys(LIMIT_NAMES) as LimitSource[])
      .filter((source) => sources.has(source) && usageLimits[source]?.length)
      .map((source) => {
        const windows = usageLimits[source]!
        const fullest = windows.reduce((a, b) => (b.percent > a.percent ? b : a))
        return { source, name: LIMIT_NAMES[source], fullest, title: windows.map(describeLimit).join('\n') }
      })
  })

  function revealProject() {
    if (!crumbProject) return
    app.collapsed[crumbProject.id] = false
    document.querySelector(`[aria-label="${CSS.escape(crumbProject.name)}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  /** "Trocar modelo" na barra de status: o /model do Claude, no chat em foco. */
  function switchModel() {
    if (!app.active || !isClaudeChat) return
    terminals.get(app.active)?.submit('/model')
  }

  const comboKeys = (combo: string | undefined) => (combo ? normalizeCombo(combo).split('+') : [])
</script>

{#snippet dot(id: string)}
  {@const status = app.status[id]}
  <span class="dot" style:--dot={status ? STATUS[status].color : 'var(--line-control)'} aria-hidden="true"></span>
{/snippet}

<div class="app">
  <header class="topbar">
    <button class="icon-btn glyph" class:on={!hasTab} title="Início (novo chat)" aria-label="Início" onclick={goHome}>
      <img src={glyph} alt="" width="18" height="18" />
    </button>
    <nav class="crumbs" aria-label="Onde você está">
      {#if hasTab && activeChat}
        {#if crumbProject}<button class="crumb" title="Mostrar o projeto na barra lateral" onclick={revealProject}>{crumbProject.name}</button>{/if}
        {#if crumbGroup}
          <span class="slash" aria-hidden="true">/</span>
          <button class="crumb" title="Abrir os chats deste grupo lado a lado" onclick={() => showSideBySide(groupMates)}>{crumbGroup}</button>
        {/if}
        {#if sideBySide}
          <span class="note">· {sideBySide} chats lado a lado</span>
        {:else}
          <span class="slash" aria-hidden="true">/</span>
          <span class="crumb current">{activeChat.name}</span>
        {/if}
      {:else}
        <span class="crumb current">nova sessão</span>
      {/if}
    </nav>
    <div class="top-right">
      {#if multi}
        <div class="segmented" role="radiogroup" aria-label="Layout dos painéis">
          {#each LAYOUTS as l (l.id)}
            {@const current = activeTabObj ? effectiveLayout(activeTabObj) : 'columns'}
            <button role="radio" aria-checked={current === l.id} class:on={current === l.id} onclick={() => setLayout(l.id)}>{l.label}</button>
          {/each}
        </div>
      {/if}
      {#if loopPaused}<span class="badge warning" title="Chats pausados pelo anti-loop">‖ {loopPaused} {loopPaused === 1 ? 'pausado' : 'pausados'}</span>{/if}
      {#if app.agentsPaused}<span class="badge warning" title="Mensagens entre agentes pausadas">‖ pausado</span>{/if}
      {#if waiting > 0}
        <button class="badge warning wait" title="Ir para quem espera há mais tempo ({normalizeCombo(app.settings.keys.waiting ?? '')})" onclick={goToWaiting}>! {waiting} aguardando você</button>
      {/if}
      <button
        class="icon-btn"
        class:on={app.showPanel}
        title="Painel do agente ({normalizeCombo(app.settings.keys.panel ?? '')})"
        aria-label="Mostrar painel do agente"
        aria-pressed={app.showPanel}
        onclick={() => (app.showPanel = !app.showPanel)}
      >
        <PanelRight size={16} strokeWidth={1.5} />
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
  {:else if loopPaused}
    <div class="paused-banner" role="alert">
      <span class="paused-glyph" aria-hidden="true">‖</span>
      <div>
        <strong>Agentes pausados pelo anti-loop</strong>
        <p>
          {loopPaused} {loopPaused === 1 ? 'chat repetiu' : 'chats repetiram'} o mesmo comando {app.settings.loop.repeats} vezes em {app.settings.loop.minutes} min
          sem mudar nenhum arquivo. Nada foi perdido; {loopPaused === 1 ? 'ele espera' : 'eles esperam'} você.
        </p>
      </div>
      <button class="link" onclick={() => ((app.settingsSection = 'permissoes'), (app.modal = 'settings'))}>
        Ajustar limite ({app.settings.loop.repeats} repetições em {app.settings.loop.minutes} min)
      </button>
      <button class="btn sm" onclick={() => { const first = Object.keys(app.loopPaused)[0]; if (first) focusChat(first) }}>Ver detalhes</button>
      <button class="btn primary sm" onclick={resumeAllLoops}>Retomar todos</button>
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

    <main
      class="terms"
      bind:this={termsEl}
      bind:clientWidth={termsWidth}
      style:--term-bg={themeOf(app.settings.theme).background}
      ondragover={(e) => onDragOver(e)}
      ondragleave={onDragLeave}
      ondrop={onDrop}
    >
      {#each panes as { tab, index, chat } (chat.id)}
        {@const single = effectiveLayout(tab) === 'single' && tab.panes.length > 1}
        {@const visible = tab.id === app.activeTab && (!single || app.active === chat.id)}
        {@const split = tab.panes.length > 1 && !single}
        {@const focused = split && app.active === chat.id}
        <section
          class="pane"
          class:hidden={!visible}
          class:split
          class:focused
          class:drop-target={dropping && visible && dropAfter === chat.id}
          style={paneStyle(tab, index)}
          aria-label={chat.name}
          ondragover={(e) => {
            if (!visible) return
            onDragOver(e, chat.id)
            e.stopPropagation()
          }}
        >
          {#if split}
            {@const status = STATUS[app.status[chat.id] ?? 'idle']}
            <!-- Arrastar o cabeçalho muda o painel de lugar (solte em outro painel). -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <header draggable="true" ondragstart={(e) => onPaneDragStart(e, chat.id)} title="Arraste para mudar de lugar">
              <span class="glyph-status" style:color={status.color} title={status.label}>{status.glyph}</span>
              <span class="name" title={whereOf(chat)}>{chat.name}</span>
              {#if app.loopPaused[chat.id]}
                <span class="badge warning">‖ pausado</span>
              {:else if app.status[chat.id] && app.status[chat.id] !== 'idle'}
                <span class="badge {status.tone}" title={app.waitingSince[chat.id] ? `Aguardando há ${Math.max(1, Math.round((Date.now() - app.waitingSince[chat.id]) / 60_000))} min` : status.label}>{status.glyph} {status.label}</span>
              {/if}
              {#if focused}<span class="badge accent">em foco</span>{/if}
              <span class="spacer"></span>
              {#if !chat.runOf}
                <button class="icon-btn" title="Rodar o projeto ao lado" aria-label="Rodar o projeto" onclick={() => runProject(chat.id)}>
                  <Play size={14} strokeWidth={1.5} />
                </button>
              {/if}
              <button class="icon-btn" title="Abrir outro chat ao lado ({normalizeCombo(app.settings.keys.split ?? '')})" aria-label="Dividir com outro chat" onclick={() => { focusChat(chat.id); openPalette('Dividir com ') }}>
                <SplitIcon size={14} strokeWidth={1.5} />
              </button>
              <button class="icon-btn" title="Só este painel (1 painel)" aria-label="Maximizar" onclick={() => { focusChat(chat.id); setLayout('single') }}>
                <Maximize size={14} strokeWidth={1.5} />
              </button>
              <button class="icon-btn" title="Fechar painel; o chat continua na barra lateral ({normalizeCombo(app.settings.keys.closePane ?? '')})" aria-label="Fechar painel" onclick={() => hidePane(chat.id)}>
                <X size={14} strokeWidth={1.5} />
              </button>
            </header>
          {/if}
          <div class="pane-body">
            <div class="term-wrap">
              <Terminal {chat} {visible} />
            </div>
            <LoopCard chatId={chat.id} />
            <ApprovalBar chatId={chat.id} compact={split} />
            <Composer chatId={chat.id} compact={split} />
          </div>
        </section>
      {/each}
      {#if dropping}
        <div class="drop-hint" aria-hidden="true">
          <span>{hasTab ? 'Solte para abrir ao lado' : 'Solte para abrir o chat'}</span>
        </div>
      {/if}
      {#if hasTab && activeTabObj && activeTabObj.panes.length > 1 && effectiveLayout(activeTabObj) === 'columns'}
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
    {#if hasTab && activeChat}
      <button class="stat" title="Abrir a pasta no editor" onclick={openActiveInEditor}>{shortPath(activeDir)}</button>
      {#if branch}<button class="stat" title="Ver mudanças ({normalizeCombo(app.settings.keys.diff ?? '')})" onclick={() => (app.modal = 'diff')}>{branch}</button>{/if}
    {/if}
    <span class="spacer"></span>
    {#if hasTab && activeChat && activeStatus}
      <span style:color={STATUS[activeStatus].color}>{STATUS[activeStatus].glyph} {STATUS[activeStatus].label}</span>
    {/if}
    {#if hasTab && activeChat && isClaudeChat}
      <button class="stat model" title="Trocar o modelo (/model no Claude)" onclick={switchModel}>[{model ?? activeProfile?.name.toLowerCase()}] ▾</button>
      {#if memory !== undefined}
        <button class="stat" title="Memória da conversa: quanto da janela de contexto já foi usado" onclick={() => (app.showPanel = true)}>memória {memory}%</button>
      {/if}
    {:else if hasTab && activeProfile}
      <span>[{activeProfile.name.toLowerCase()}]</span>
    {/if}
    {#each limitsInUse as limit (limit.source)}
      {@const level = limit.fullest.percent >= 90 ? 'danger' : limit.fullest.percent >= 70 ? 'warning' : 'ok'}
      <span class="limit {level}" title="Limite de uso do {limit.name}:&#10;{limit.title}">
        {limit.name} {limit.fullest.label}
        <span class="limit-track" aria-hidden="true"><span class="limit-fill" style:width="{limit.fullest.percent}%"></span></span>
        {Math.round(limit.fullest.percent)}%
      </span>
    {/each}
    <button class="stat" title="Uso de tokens hoje ({normalizeCombo(app.settings.keys.usage ?? '')})" onclick={() => (app.modal = 'usage')}>uso hoje {formatTokens(usageToday.tokens)}</button>
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
  {#if app.modal === 'shortcuts'}<Shortcuts />{/if}
  {#if app.tourStep !== null}<Tour />{/if}
  <Tooltip />

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
  .crumbs {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    font: 13px var(--font-mono);
    color: var(--ink-muted);
  }
  .crumb {
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink-muted);
  }
  button.crumb:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .crumb.current {
    color: var(--ink);
    font-weight: 600;
  }
  .slash {
    color: var(--line-control);
  }
  .note {
    font: 12px var(--font-sans);
  }
  /* Painel estreito: os botões ficam; caminho e texto do status saem. */
  @container (max-width: 380px) {
    .pane header .badge {
      display: none;
    }
  }
  .pane header .icon-btn {
    flex: none;
  }
  .segmented {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
  }
  .segmented button {
    height: 24px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .segmented button.on {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 500;
  }
  .wait {
    cursor: pointer;
  }
  .glyph-status {
    flex: none;
    width: 12px;
    font: 600 13px var(--font-mono);
    text-align: center;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    overflow: hidden;
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
  .pane.drop-target::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 4px;
    background: var(--accent);
    z-index: 6;
  }
  .pane header[draggable='true'] {
    cursor: grab;
  }
  .drop-hint {
    position: absolute;
    inset: var(--space-3);
    display: grid;
    place-items: end center;
    padding-bottom: var(--space-8);
    border: 2px dashed var(--accent);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    pointer-events: none;
    z-index: 5;
  }
  .drop-hint span {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    color: var(--accent-strong);
    font-size: 13px;
    box-shadow: var(--shadow-pop);
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
    min-width: 7ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 600 13px var(--font-mono);
    color: var(--ink);
  }
  .pane-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .term-wrap {
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
  .stat {
    height: 20px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    font: inherit;
    color: inherit;
  }
  .stat:hover,
  .stat:focus-visible {
    background: var(--bg-200);
    color: var(--ink);
  }
  .limit {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    --limit: var(--accent);
  }
  .limit.warning {
    --limit: var(--warning);
  }
  .limit.danger {
    --limit: var(--danger);
  }
  .limit-track {
    width: 48px;
    height: 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-300);
    overflow: hidden;
  }
  .limit-fill {
    display: block;
    height: 100%;
    background: var(--limit);
  }
  .link {
    font-size: 12px;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
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

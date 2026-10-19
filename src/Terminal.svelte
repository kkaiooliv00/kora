<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { WebglAddon } from '@xterm/addon-webgl'
  import { WebLinksAddon } from '@xterm/addon-web-links'
  import { SearchAddon } from '@xterm/addon-search'
  import { invoke, Channel } from '@tauri-apps/api/core'
  import '@xterm/xterm/css/xterm.css'
  import { app, fail, focusChat, type Chat } from './lib/state.svelte'
  import { setStatus } from './lib/automation'
  import { terminals } from './lib/terminals'
  import { splitCommand } from './lib/command'
  import { themeOf } from './lib/themes'

  // Sem saída por esse tempo = agente parado (para CLIs sem hooks).
  const IDLE_MS = 2500
  // Tempo para o TUI processar a colagem antes do Enter.
  const SUBMIT_DELAY_MS = 120

  let { chat, visible }: { chat: Chat; visible: boolean } = $props()
  let el: HTMLDivElement
  let searchInput = $state<HTMLInputElement>()
  let query = $state('')
  let term = $state.raw<Terminal>()
  const fit = new FitAddon()
  const search = new SearchAddon()

  const profile = app.profiles.find((p) => p.id === chat.profileId)
  const label = profile?.command ? splitCommand(profile.command)[0] : 'shell'

  async function spawnArgs(): Promise<{ program: string | null; args: string[] }> {
    const [program, ...args] = splitCommand(profile?.command ?? '')
    if (!program) return { program: null, args: [] }
    if (profile?.hooks === 'claude') {
      args.push('--settings', await invoke<string>('claude_settings', { chat: chat.id }))
    }
    return { program, args }
  }

  /** Ctrl+V vira paste do navegador (texto e imagem); Ctrl+C com seleção copia. */
  function clipboardKeys(t: Terminal) {
    return (e: KeyboardEvent) => {
      if (e.type !== 'keydown' || !e.ctrlKey || e.altKey) return true
      const key = e.key.toLowerCase()
      if (key === 'v') return false
      if (key === 'c' && t.hasSelection()) {
        navigator.clipboard.writeText(t.getSelection()).catch((err) => fail('Falha ao copiar', err))
        t.clearSelection()
        return false
      }
      return true
    }
  }

  /** Print colado vira arquivo temporário; o caminho é colado para o agente ler. */
  function pasteImage(t: Terminal) {
    return (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const image = items.find((i) => i.type.startsWith('image/'))?.getAsFile()
      if (!image) return
      e.preventDefault()
      e.stopPropagation()
      image
        .arrayBuffer()
        .then((buf) => invoke<string>('save_image', new Uint8Array(buf)))
        .then((path) => t.paste(path))
        .catch((err) => fail('Falha ao colar imagem', err))
    }
  }

  onMount(() => {
    const t = new Terminal({
      fontFamily: app.settings.fontFamily,
      fontSize: app.settings.fontSize,
      theme: themeOf(app.settings.theme),
      cursorBlink: true,
    })
    t.loadAddon(fit)
    t.loadAddon(search)
    t.loadAddon(
      new WebLinksAddon((_event, url) => {
        invoke('open_url', { url, browser: app.settings.browser || null }).catch((e) => fail('Link', e))
      }),
    )
    t.open(el)
    try {
      t.loadAddon(new WebglAddon())
    } catch {
      // sem WebGL: xterm usa o renderer DOM
    }
    t.attachCustomKeyEventHandler(clipboardKeys(t))
    fit.fit()
    term = t

    const heuristic = profile?.hooks !== 'claude'
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let id: number | undefined
    let stopped = false
    const write = (data: string) => id !== undefined && invoke('pty_write', { id, data })

    const onData = new Channel<ArrayBuffer>()
    onData.onmessage = (buf) => {
      t.write(new Uint8Array(buf))
      if (!heuristic) return
      setStatus(chat.id, 'running')
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => setStatus(chat.id, 'idle'), IDLE_MS)
    }
    const onExit = new Channel<number>()
    onExit.onmessage = (code) => {
      id = undefined
      stopped = true
      clearTimeout(idleTimer)
      setStatus(chat.id, code === 0 ? 'done' : 'error')
      t.write(`\r\n\x1b[2m[${label} encerrado (${code}) — Enter para reabrir]\x1b[0m\r\n`)
    }

    const cwd = app.projects.find((p) => p.id === chat.projectId)?.path
    function start() {
      stopped = false
      t.write(`\x1b[2miniciando ${label}…\x1b[0m\r\n`)
      spawnArgs()
        .then(({ program, args }) =>
          invoke<number>('pty_spawn', { program, args, cwd, cols: t.cols, rows: t.rows, onData, onExit }),
        )
        .then((pty) => {
          id = pty
          setStatus(chat.id, 'idle')
        })
        .catch((e) => {
          stopped = true
          setStatus(chat.id, 'error')
          t.write(`\x1b[31mfalha ao abrir: ${e}\x1b[0m\r\n\x1b[2m[ajuste o perfil em Configurações e tecle Enter]\x1b[0m\r\n`)
        })
    }
    start()

    t.onData((data) => {
      if (id !== undefined) write(data)
      else if (stopped && data === '\r') {
        t.reset()
        start()
      }
    })
    t.onResize(({ cols, rows }) => id !== undefined && invoke('pty_resize', { id, cols, rows }))

    terminals.set(chat.id, {
      paste: (text) => t.paste(text),
      submit: (text) => {
        t.paste(text)
        setTimeout(() => write('\r'), SUBMIT_DELAY_MS)
      },
    })

    const onPaste = pasteImage(t)
    const onFocus = () => app.active !== chat.id && focusChat(chat.id)
    el.addEventListener('paste', onPaste, true)
    el.addEventListener('focusin', onFocus)
    const ro = new ResizeObserver(() => el.offsetParent && fit.fit())
    ro.observe(el)

    return () => {
      ro.disconnect()
      el.removeEventListener('paste', onPaste, true)
      el.removeEventListener('focusin', onFocus)
      terminals.delete(chat.id)
      clearTimeout(idleTimer)
      if (id !== undefined) invoke('pty_kill', { id })
      t.dispose()
    }
  })

  $effect(() => {
    if (!term) return
    term.options.fontFamily = app.settings.fontFamily
    term.options.fontSize = app.settings.fontSize
    term.options.theme = themeOf(app.settings.theme)
    if (el.offsetParent) fit.fit()
  })

  $effect(() => {
    if (!term || !visible) return
    const t = term
    const focused = app.active === chat.id && app.modal === null && app.searching !== chat.id
    requestAnimationFrame(() => {
      fit.fit()
      if (focused) t.focus()
    })
  })

  $effect(() => {
    if (app.searching === chat.id) searchInput?.select()
  })

  function find(backwards = false) {
    if (!query) return
    if (backwards) search.findPrevious(query)
    else search.findNext(query)
  }

  function closeSearch() {
    app.searching = null
    term?.clearSelection()
    term?.focus()
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeSearch()
    else if (e.key === 'Enter') {
      e.preventDefault()
      find(e.shiftKey)
    }
  }
</script>

<div class="term" bind:this={el}></div>

{#if app.searching === chat.id}
  <div class="search" role="search">
    <input
      bind:this={searchInput}
      bind:value={query}
      placeholder="Buscar no terminal"
      oninput={() => query && search.findNext(query, { incremental: true })}
      onkeydown={onSearchKey}
    />
    <button title="Anterior (Shift+Enter)" onclick={() => find(true)}>↑</button>
    <button title="Próximo (Enter)" onclick={() => find()}>↓</button>
    <button title="Fechar (Esc)" onclick={closeSearch}>×</button>
  </div>
{/if}

<style>
  .term {
    position: absolute;
    inset: 6px;
  }
  .search {
    position: absolute;
    top: 8px;
    right: 18px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
    z-index: 5;
  }
  .search input {
    width: 200px;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }
  .search input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .search button {
    width: 26px;
    height: 26px;
    border-radius: 5px;
    color: var(--muted);
  }
  .search button:hover {
    background: var(--hover);
    color: var(--fg);
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { WebglAddon } from '@xterm/addon-webgl'
  import { WebLinksAddon } from '@xterm/addon-web-links'
  import { invoke, Channel } from '@tauri-apps/api/core'
  import '@xterm/xterm/css/xterm.css'
  import { app, setStatus, type Chat } from './lib/state.svelte'
  import { themeOf } from './lib/themes'

  // Sem saída por esse tempo = agente parado (para CLIs sem hooks).
  const IDLE_MS = 2500

  let { chat, visible }: { chat: Chat; visible: boolean } = $props()
  let el: HTMLDivElement
  let term = $state.raw<Terminal>()
  const fit = new FitAddon()

  async function commandLine(): Promise<string | null> {
    const profile = app.profiles.find((p) => p.id === chat.profileId)
    if (!profile?.command) return null
    if (profile.hooks !== 'claude') return profile.command
    const settings = await invoke<string>('claude_settings', { chat: chat.id })
    return `${profile.command} --settings '${settings}'`
  }

  onMount(() => {
    const t = new Terminal({
      fontFamily: app.settings.fontFamily,
      fontSize: app.settings.fontSize,
      theme: themeOf(app.settings.theme),
      cursorBlink: true,
    })
    t.loadAddon(fit)
    t.loadAddon(
      new WebLinksAddon((_event, url) => {
        invoke('open_url', { url, browser: app.settings.browser || null }).catch((e) =>
          t.write(`\r\n\x1b[31m${e}\x1b[0m\r\n`),
        )
      }),
    )
    t.open(el)
    try {
      t.loadAddon(new WebglAddon())
    } catch {
      // sem WebGL: xterm usa o renderer DOM
    }
    fit.fit()
    term = t

    const heuristic = app.profiles.find((p) => p.id === chat.profileId)?.hooks !== 'claude'
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let id: number | undefined

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
      clearTimeout(idleTimer)
      setStatus(chat.id, code === 0 ? 'done' : 'error')
      t.write(`\r\n\x1b[2m[processo encerrado: ${code}]\x1b[0m\r\n`)
    }

    const cwd = app.projects.find((p) => p.id === chat.projectId)?.path
    commandLine()
      .then((line) => invoke<number>('pty_spawn', { line, cwd, cols: t.cols, rows: t.rows, onData, onExit }))
      .then((pty) => {
        id = pty
        setStatus(chat.id, 'idle')
      })
      .catch((e) => {
        setStatus(chat.id, 'error')
        t.write(`\x1b[31mfalha ao abrir o processo: ${e}\x1b[0m\r\n`)
      })

    t.onData((data) => id !== undefined && invoke('pty_write', { id, data }))
    t.onResize(({ cols, rows }) => id !== undefined && invoke('pty_resize', { id, cols, rows }))

    const ro = new ResizeObserver(() => el.offsetParent && fit.fit())
    ro.observe(el)

    return () => {
      ro.disconnect()
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
    requestAnimationFrame(() => {
      fit.fit()
      t.focus()
    })
  })
</script>

<div class="term" class:hidden={!visible} bind:this={el}></div>

<style>
  .term {
    position: absolute;
    inset: 6px;
  }
  .hidden {
    display: none;
  }
</style>

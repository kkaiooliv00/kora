<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { WebglAddon } from '@xterm/addon-webgl'
  import { invoke, Channel } from '@tauri-apps/api/core'
  import '@xterm/xterm/css/xterm.css'

  let { cmd, args, cwd }: { cmd?: string; args?: string[]; cwd?: string } = $props()
  let el: HTMLDivElement

  onMount(() => {
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace',
      fontSize: 14,
      cursorBlink: true,
      theme: { background: '#16181d' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    try {
      term.loadAddon(new WebglAddon())
    } catch {
      // sem WebGL: xterm usa o renderer DOM
    }
    fit.fit()

    let id: number | undefined
    const onData = new Channel<ArrayBuffer>()
    onData.onmessage = (buf) => term.write(new Uint8Array(buf))
    const onExit = new Channel<number>()
    onExit.onmessage = (code) => {
      id = undefined
      term.write(`\r\n\x1b[2m[processo encerrado: ${code}]\x1b[0m\r\n`)
    }

    invoke<number>('pty_spawn', { cmd, args, cwd, cols: term.cols, rows: term.rows, onData, onExit })
      .then((v) => (id = v))
      .catch((e) => term.write(`\x1b[31mfalha ao abrir o processo: ${e}\x1b[0m\r\n`))

    term.onData((data) => id !== undefined && invoke('pty_write', { id, data }))
    term.onResize(({ cols, rows }) => id !== undefined && invoke('pty_resize', { id, cols, rows }))

    const ro = new ResizeObserver(() => fit.fit())
    ro.observe(el)

    return () => {
      ro.disconnect()
      if (id !== undefined) invoke('pty_kill', { id })
      term.dispose()
    }
  })
</script>

<div class="term" bind:this={el}></div>

<style>
  .term {
    width: 100%;
    height: 100%;
  }
</style>

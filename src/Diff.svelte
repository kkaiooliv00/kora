<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { invoke } from '@tauri-apps/api/core'
  import { app, chatById, chatDir } from './lib/state.svelte'
  import { themeOf } from './lib/themes'

  const chat = app.active ? chatById(app.active) : undefined
  const dir = chat ? chatDir(chat) : app.projects[0]?.path
  let el: HTMLDivElement
  let term: Terminal | undefined
  let loading = $state(false)

  async function refresh() {
    if (!term || !dir) return
    loading = true
    term.reset()
    try {
      const text = await invoke<string>('git_diff', { dir })
      term.write(text.trim() ? text.replace(/\r?\n/g, '\r\n') : 'Sem mudanças.')
    } catch (e) {
      term.write(`\x1b[31m${e}\x1b[0m`)
    } finally {
      loading = false
    }
  }

  onMount(() => {
    // Terminal só de leitura: o diff vem com as cores ANSI do próprio git.
    const t = new Terminal({
      fontFamily: app.settings.fontFamily,
      fontSize: app.settings.fontSize - 1,
      theme: themeOf(app.settings.theme),
      disableStdin: true,
      cursorBlink: false,
      scrollback: 20000,
    })
    const fit = new FitAddon()
    t.loadAddon(fit)
    t.open(el)
    fit.fit()
    term = t
    refresh()
    return () => t.dispose()
  })
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<div class="backdrop">
  <div class="modal diff" role="dialog" aria-modal="true" aria-label="Diff">
    <header>
      <div>
        <h2>Mudanças · {chat?.name ?? 'projeto'}</h2>
        <p class="sub">{chat?.branch ? `${chat.branch} · ` : ''}{dir ?? 'nenhum projeto'}</p>
      </div>
      <button class="btn" onclick={refresh} disabled={loading}>{loading ? 'Carregando…' : 'Atualizar'}</button>
      <button class="btn" onclick={() => (app.modal = null)}>Fechar</button>
    </header>
    <div class="view" bind:this={el}></div>
  </div>
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    width: min(1100px, calc(100vw - 32px));
    height: calc(100vh - 64px);
    padding: 16px 18px;
  }
  header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  header div {
    flex: 1;
    min-width: 0;
  }
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .view {
    flex: 1;
    min-height: 0;
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg);
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte'
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import { WebglAddon } from '@xterm/addon-webgl'
  import { WebLinksAddon } from '@xterm/addon-web-links'
  import { SearchAddon } from '@xterm/addon-search'
  import { invoke, Channel } from '@tauri-apps/api/core'
  import '@xterm/xterm/css/xterm.css'
  import { app, chatDir, fail, focusChat, openChat, updateChat, type Chat } from './lib/state.svelte'
  import { toast } from './lib/toasts.svelte'
  import EmptyState from './EmptyState.svelte'
  import { clearPermission, noteHumanInput, setStatus } from './lib/automation'
  import { terminals } from './lib/terminals'
  import { splitCommand } from './lib/command'
  import { claudePermissions } from './lib/permissions'
  import { themeOf } from './lib/themes'

  // Sem saída por esse tempo = agente parado (para CLIs sem hooks).
  const IDLE_MS = 2500
  // Tempo para o TUI processar a colagem antes do Enter.
  const SUBMIT_DELAY_MS = 120
  // Só a mensagem do Claude de sessão inexistente faz esquecer a sessão salva
  // (login expirado, rede fora ou Ctrl+C também saem com erro e não devem perder a conversa).
  const RESUME_GONE = /No conversation found/i
  const RESUME_WATCH_BYTES = 8192
  const PROMPT_READY_QUIET_MS = 1500
  // Linha 13/20 do token `term` do design.
  const LINE_HEIGHT = 20 / 13
  // Perfis com "reconnect": espera 2, 4, 8… s (até 30) entre tentativas; desiste depois de 6 seguidas.
  const RECONNECT_MAX_TRIES = 6
  const RECONNECT_MAX_DELAY_S = 30
  // Ficou de pé esse tempo: a conexão era boa, então zera a contagem de tentativas.
  const RECONNECT_STABLE_MS = 60_000

  /**
   * Instrução que o Claude recebe para saber conversar com os outros chats.
   * Texto fixo, sem aspas duplas nem nome do chat: passa por `cmd /c` quando o claude é um .cmd.
   */
  const KORA_PROMPT =
    'Você está rodando dentro do Kora. Outros chats de IA abertos no Kora podem ser contatados pelo terminal ' +
    'com o comando kora-cli: kora-cli list (lista os chats; o seu aparece como você), ' +
    'kora-cli send <chat> <mensagem> (envia um prompt ao chat), kora-cli wait <chat> (espera ele terminar) e ' +
    'kora-cli read <chat> [linhas] (lê a tela dele). Use apenas quando o usuário pedir colaboração entre chats. ' +
    'Mensagens de outros chats chegam prefixadas com [mensagem de <chat>]; responda com kora-cli send quando fizer sentido.'

  let { chat, visible }: { chat: Chat; visible: boolean } = $props()
  let el: HTMLDivElement
  let searchInput = $state<HTMLInputElement>()
  let query = $state('')
  let term = $state.raw<Terminal>()
  const fit = new FitAddon()
  const search = new SearchAddon()

  const profile = app.profiles.find((p) => p.id === chat.profileId)
  const label = profile?.command ? splitCommand(profile.command)[0] : 'shell'

  // Abaixo disso a tela de "iniciando" nem aparece (regra do design).
  const STARTING_DELAY_MS = 300

  /** Fases do painel antes do terminal: abrindo o agente ou falha ao abrir. */
  let phase = $state<'starting' | 'ready' | 'failed'>('starting')
  let showStarting = $state(false)
  let failure = $state('')
  let restart: (shellOnly?: boolean) => void = () => {}

  async function spawnArgs(shellOnly = false): Promise<{ program: string | null; args: string[]; resumed: boolean }> {
    const [program, ...args] = shellOnly ? [] : splitCommand(profile?.command ?? '')
    if (!program) return { program: null, args: [], resumed: false }
    const isClaude = profile?.hooks === 'claude'
    if (isClaude) {
      if (chat.sessionId) args.push('--resume', chat.sessionId)
      args.push('--append-system-prompt', KORA_PROMPT)
      const permissions = claudePermissions(app.settings.permissions)
      args.push('--settings', await invoke<string>('claude_settings', { chat: chat.id, permissions }))
    }
    return { program, args, resumed: isClaude && Boolean(chat.sessionId) }
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
      noteHumanInput()
      // Excel/Word copiam texto + imagem juntos: aí o texto vence.
      if (e.clipboardData?.types.includes('text/plain')) return
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
      cursorStyle: 'block',
      lineHeight: LINE_HEIGHT,
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
    let resumed = false
    let startedAt = 0
    let reconnectTries = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    // Começo da saída de um `claude --resume`, para reconhecer "No conversation found".
    let resumeOutput = ''
    const decoder = new TextDecoder()
    // Depois do unmount o processo ainda manda saída/saída-de-exit; ignorar para não ressuscitar o status.
    let disposed = false
    const write = (data: string) => id !== undefined && invoke('pty_write', { id, data })

    // Primeiro prompt (boas-vindas): sai quando a saída do agente sossega, sinal de que a TUI abriu.
    let promptTimer: ReturnType<typeof setTimeout> | undefined
    const sendPendingPrompt = () => {
      const text = app.pendingPrompt[chat.id]
      if (!text) return
      delete app.pendingPrompt[chat.id]
      t.paste(text)
      setTimeout(() => write('\r'), SUBMIT_DELAY_MS)
    }

    const onData = new Channel<ArrayBuffer>()
    onData.onmessage = (buf) => {
      if (disposed) return
      phase = 'ready'
      t.write(new Uint8Array(buf))
      if (app.pendingPrompt[chat.id]) {
        clearTimeout(promptTimer)
        promptTimer = setTimeout(sendPendingPrompt, PROMPT_READY_QUIET_MS)
      }
      if (resumed && resumeOutput.length < RESUME_WATCH_BYTES) resumeOutput += decoder.decode(buf, { stream: true })
      if (!heuristic) return
      setStatus(chat.id, 'running')
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => setStatus(chat.id, 'idle'), IDLE_MS)
    }
    const onExit = new Channel<number>()
    onExit.onmessage = (code) => {
      if (disposed) return
      id = undefined
      stopped = true
      clearTimeout(idleTimer)
      setStatus(chat.id, code === 0 ? 'done' : 'error')
      if (resumed && RESUME_GONE.test(resumeOutput)) {
        updateChat(chat.id, { sessionId: undefined })
        t.write('\r\n\x1b[33m[não deu para retomar a conversa anterior — Enter abre uma nova]\x1b[0m\r\n')
        return
      }
      if (profile?.reconnect && code !== 0) {
        if (Date.now() - startedAt > RECONNECT_STABLE_MS) reconnectTries = 0
        if (reconnectTries < RECONNECT_MAX_TRIES) {
          reconnectTries += 1
          const delay = Math.min(RECONNECT_MAX_DELAY_S, 2 ** reconnectTries)
          t.write(`\r\n\x1b[33m[conexão caiu (${code}) — reconectando em ${delay} s, tentativa ${reconnectTries}/${RECONNECT_MAX_TRIES}; Enter reconecta já]\x1b[0m\r\n`)
          reconnectTimer = setTimeout(start, delay * 1000)
          return
        }
        reconnectTries = 0
      }
      t.write(`\r\n\x1b[2m[${label} encerrado (${code}) — Enter para reabrir]\x1b[0m\r\n`)
    }

    const cwd = chatDir(chat)
    function start(shellOnly = false) {
      clearTimeout(reconnectTimer)
      if (disposed) return
      stopped = false
      startedAt = Date.now()
      phase = 'starting'
      showStarting = false
      setTimeout(() => (showStarting = phase === 'starting'), STARTING_DELAY_MS)
      spawnArgs(shellOnly)
        .then(({ program, args, resumed: isResume }) => {
          resumed = isResume
          resumeOutput = ''
          return invoke<number>('pty_spawn', { chat: chat.id, program, args, cwd, cols: t.cols, rows: t.rows, onData, onExit })
        })
        .then((pty) => {
          id = pty
          setStatus(chat.id, 'idle')
        })
        .catch((e) => {
          stopped = true
          phase = 'failed'
          failure = String(e)
          setStatus(chat.id, 'error')
          // Erro do chat à vista fica no painel; de outro chat, vira aviso.
          if (!visible) {
            toast({
              tone: 'danger',
              title: `Agente não iniciou em ${chat.name}`,
              text: failure,
              actions: [{ label: 'Ver erro', run: () => openChat(chat.id) }],
            })
          }
        })
    }
    restart = (shellOnly = false) => {
      t.reset()
      start(shellOnly)
    }
    start()

    // Só tecla de verdade conta como você (onData também traz respostas automáticas do terminal).
    t.onKey(() => {
      noteHumanInput()
      clearPermission(chat.id)
    })
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
      keys: (data) => {
        write(data)
        t.focus()
      },
      read: (lines) => {
        const buffer = t.buffer.active
        const start = Math.max(0, buffer.length - lines)
        const out: string[] = []
        for (let i = start; i < buffer.length; i++) out.push(buffer.getLine(i)?.translateToString(true) ?? '')
        return out.join('\n').trimEnd()
      },
      pty: () => id,
    })

    const onPaste = pasteImage(t)
    const onFocus = () => app.active !== chat.id && focusChat(chat.id)
    el.addEventListener('paste', onPaste, true)
    el.addEventListener('focusin', onFocus)
    const ro = new ResizeObserver(() => el.offsetParent && fit.fit())
    ro.observe(el)

    return () => {
      disposed = true
      clearTimeout(reconnectTimer)
      clearTimeout(promptTimer)
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

{#if phase === 'failed'}
  <div class="overlay">
    <EmptyState kind="error" title="Não foi possível abrir o agente" detail={failure}>
      O comando <code>{label}</code> não abriu nesta pasta. Instale a CLI ou informe o caminho completo no perfil.
      {#snippet actions()}
        <button
          class="btn primary sm"
          onclick={() => {
            app.settingsSection = 'agentes'
            app.modal = 'settings'
          }}>Informar caminho</button
        >
        <button class="btn sm" onclick={() => restart()}>Tentar de novo</button>
        <button class="btn ghost sm" onclick={() => restart(true)}>Abrir só o shell</button>
      {/snippet}
    </EmptyState>
  </div>
{:else if phase === 'starting' && showStarting}
  <div class="overlay">
    <EmptyState kind="loading" title="Iniciando o agente…">Abrindo <code>{label}</code> em {chatDir(chat) ?? 'pasta do projeto'}.</EmptyState>
  </div>
{/if}

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
    inset: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: var(--bg-000);
    z-index: 4;
  }
  .search {
    position: absolute;
    top: var(--space-2);
    right: var(--space-4);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: var(--space-1);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    box-shadow: var(--shadow-pop);
    z-index: 5;
  }
  .search input {
    width: 220px;
    height: 28px;
    box-sizing: border-box;
    padding: 0 var(--space-2);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--bg-000);
    color: var(--ink);
    font: 12px/18px var(--font-mono);
    caret-color: var(--accent);
  }
  .search input:focus {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
    border-color: var(--accent);
  }
  .search button {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    color: var(--ink-muted);
  }
  .search button:hover {
    background: var(--bg-300);
    color: var(--ink);
  }
</style>

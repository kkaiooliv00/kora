<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog'
  import { app, chatById, chatDir, fail, focusChat } from './lib/state.svelte'
  import { relativeTo } from './lib/automation'
  import { openPalette } from './lib/commands'
  import { terminals } from './lib/terminals'
  import { normalizeCombo } from './lib/keys'
  import Kbd from './Kbd.svelte'

  /**
   * Barra de ações do chat (Composer do design, sem campo próprio: você digita direto no agente).
   * `compact` (painéis lado a lado) mostra só Contexto, Fila e Broadcast.
   */
  let { chatId, compact = false }: { chatId: string; compact?: boolean } = $props()

  const queued = $derived(app.queue[chatId]?.pending.length ?? 0)
  const contextCount = $derived(app.context[chatId]?.length ?? 0)
  const keysOf = (combo: string | undefined) => (combo ? normalizeCombo(combo).split('+') : [])

  /** "@ Contexto": escolhe arquivos e cola `@caminho` no prompt do agente (o Claude lê o arquivo). */
  async function addContext() {
    const chat = chatById(chatId)
    const dir = chat ? chatDir(chat) : undefined
    try {
      const picked = await open({ multiple: true, defaultPath: dir, title: 'Arquivos para o contexto do agente' })
      const files = (Array.isArray(picked) ? picked : picked ? [picked] : []).map((f) => relativeTo(dir, f))
      if (files.length === 0) return
      app.context[chatId] = [...new Set([...(app.context[chatId] ?? []), ...files])]
      terminals.get(chatId)?.paste(files.map((f) => `@${f}`).join(' ') + ' ')
      focusChat(chatId)
    } catch (e) {
      fail('Contexto', e)
    }
  }

  function openModal(modal: 'queue' | 'broadcast') {
    focusChat(chatId)
    app.modal = modal
  }
</script>

{#if compact && queued > 0}
  <p class="queued"><span aria-hidden="true">≡</span> {queued} {queued === 1 ? 'prompt espera' : 'prompts esperam'} na fila deste chat. <button class="link" onclick={() => openModal('queue')}>Ver fila</button></p>
{/if}
<div class="composer" class:compact data-tour="composer">
  <button class="chip" onclick={addContext} title="Pôr arquivos no contexto do agente (@)">
    <span class="sym" aria-hidden="true">@</span> Contexto{#if contextCount}<span class="count">{contextCount}</span>{/if}
  </button>
  <button class="chip" onclick={() => openModal('queue')} title="Fila de prompts deste chat ({normalizeCombo(app.settings.keys.queue ?? '')})">
    <span class="sym" aria-hidden="true">≡</span> Fila{#if queued}<span class="count">{queued}</span>{/if}
  </button>
  <button class="chip" onclick={() => openModal('broadcast')} title="Mandar o mesmo prompt para vários chats ({normalizeCombo(app.settings.keys.broadcast ?? '')})">
    <span class="sym" aria-hidden="true">⇉</span> Broadcast
  </button>
  {#if !compact}
    <span class="spacer"></span>
    <button class="chip" onclick={() => openPalette()} title="Paleta de comandos">
      Comandos <Kbd keys={keysOf(app.settings.keys.palette)} />
    </button>
    <button class="chip" onclick={() => (app.modal = 'shortcuts')} title="Todos os atalhos (?)">
      Atalhos <Kbd keys={['?']} />
    </button>
  {/if}
</div>

<style>
  .composer {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 36px;
    padding: 0 var(--space-3);
    border-top: 1px solid var(--line);
    background: var(--bg-100);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 26px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .chip:hover,
  .chip:focus-visible {
    background: var(--bg-200);
    color: var(--ink);
  }
  .sym {
    font: 600 12px var(--font-mono);
    color: var(--accent);
  }
  .count {
    min-width: 16px;
    padding: 0 4px;
    border-radius: 3px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font: 500 11px var(--font-mono);
    text-align: center;
  }
  .spacer {
    flex: 1;
  }
  .queued {
    flex: none;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .queued span {
    color: var(--accent);
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>

<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { dismiss, toastState, TOAST_DURATION, TOAST_GLYPH, type Toast } from './lib/toasts.svelte'

  /** Cada aviso conta o próprio tempo e pausa com o mouse em cima. */
  function lifetime(node: HTMLElement, toast: Toast) {
    const total = TOAST_DURATION[toast.tone]
    if (total === null) return
    let remaining = total
    let started = Date.now()
    let timer = setTimeout(() => dismiss(toast.id), remaining)
    const pause = () => {
      clearTimeout(timer)
      remaining -= Date.now() - started
    }
    const resume = () => {
      started = Date.now()
      timer = setTimeout(() => dismiss(toast.id), Math.max(0, remaining))
    }
    node.addEventListener('mouseenter', pause)
    node.addEventListener('mouseleave', resume)
    return {
      destroy() {
        clearTimeout(timer)
        node.removeEventListener('mouseenter', pause)
        node.removeEventListener('mouseleave', resume)
      },
    }
  }
</script>

<div class="stack" aria-live="polite">
  {#each toastState.list as toast (toast.id)}
    <div class="toast {toast.tone}" role={toast.tone === 'danger' ? 'alert' : 'status'} use:lifetime={toast}>
      <span class="glyph" aria-hidden="true">{TOAST_GLYPH[toast.tone]}</span>
      <div class="body">
        <p class="title">{toast.title}</p>
        {#if toast.text}<p class="text">{toast.text}</p>{/if}
        {#if toast.actions?.length}
          <div class="actions">
            {#each toast.actions as action (action.label)}
              <button
                class="btn sm"
                class:primary={action.primary}
                class:ghost={!action.primary && toast.actions.indexOf(action) > 0}
                onclick={() => {
                  action.run()
                  dismiss(toast.id)
                }}
              >
                {action.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <button class="close" aria-label="Fechar aviso" onclick={() => dismiss(toast.id)}><X size={14} strokeWidth={1.5} /></button>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    right: var(--space-4);
    bottom: 40px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    z-index: 30;
  }
  .toast {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    width: 360px;
    max-width: calc(100vw - 32px);
    box-sizing: border-box;
    padding: var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    box-shadow: var(--shadow-pop);
  }
  .toast.danger {
    border-color: var(--danger);
  }
  .glyph {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font: 600 13px var(--font-mono);
  }
  .success .glyph {
    background: var(--success-soft);
    color: var(--success);
  }
  .warning .glyph {
    background: var(--warning-soft);
    color: var(--warning);
  }
  .danger .glyph {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
    padding-top: 2px;
  }
  .title {
    margin: 0;
    font-size: 13px;
    line-height: 20px;
    font-weight: 600;
  }
  .text {
    margin: 0;
    font-size: 12px;
    line-height: 18px;
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .close {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
  }
  .close:hover {
    background: var(--bg-300);
    color: var(--ink);
  }
</style>

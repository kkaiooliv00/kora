<script lang="ts">
  import { onMount } from 'svelte'

  /**
   * Dica do design (tela global 5): qualquer elemento com `title` ganha a dica no estilo Kora,
   * no hover e no foco, depois de 400 ms. O `title` sai enquanto a dica está aberta (sem duas dicas).
   */
  const DELAY_MS = 400
  const GAP = 6
  const MARGIN = 8

  let text = $state('')
  let x = $state(0)
  let y = $state(0)
  let below = $state(true)
  let shown = $state(false)
  let tip = $state<HTMLDivElement>()
  let current: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function release() {
    clearTimeout(timer)
    if (current?.dataset.tip !== undefined) {
      current.setAttribute('title', current.dataset.tip)
      delete current.dataset.tip
    }
    current = null
    shown = false
  }

  function arm(target: EventTarget | null) {
    const el = target instanceof Element ? target.closest<HTMLElement>('[title]') : null
    if (el === current) return
    release()
    const title = el?.getAttribute('title')
    if (!el || !title) return
    current = el
    el.dataset.tip = title
    el.removeAttribute('title')
    timer = setTimeout(() => place(el, title), DELAY_MS)
  }

  async function place(el: HTMLElement, label: string) {
    if (!el.isConnected) return release()
    text = label
    shown = true
    await Promise.resolve()
    const box = el.getBoundingClientRect()
    const width = tip?.offsetWidth ?? 0
    const height = tip?.offsetHeight ?? 0
    below = box.bottom + GAP + height < window.innerHeight - MARGIN
    x = Math.max(MARGIN, Math.min(box.left + box.width / 2 - width / 2, window.innerWidth - width - MARGIN))
    y = below ? box.bottom + GAP : box.top - GAP - height
  }

  onMount(() => {
    // No microtask seguinte: focusin/focusout também disparam enquanto o Svelte troca a tela,
    // e mudar estado no meio dessa troca é proibido.
    const over = (e: Event) => queueMicrotask(() => arm(e.target))
    const out = (e: Event) => {
      const related = (e as PointerEvent | FocusEvent).relatedTarget
      if (current && related instanceof Node && current.contains(related)) return
      queueMicrotask(release)
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('focusin', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('focusout', out)
    const press = () => queueMicrotask(release)
    document.addEventListener('pointerdown', press, true)
    return () => {
      release()
      document.removeEventListener('pointerover', over)
      document.removeEventListener('focusin', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('focusout', out)
      document.removeEventListener('pointerdown', press, true)
    }
  })
</script>

{#if shown}
  <div class="tip" class:above={!below} role="tooltip" bind:this={tip} style:left="{x}px" style:top="{y}px">{text}</div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 60;
    max-width: 320px;
    padding: 4px 8px;
    border: 1px solid var(--line-control);
    border-radius: var(--radius-sm);
    background: var(--bg-300);
    box-shadow: var(--shadow-pop);
    color: var(--ink);
    font: 12px/16px var(--font-sans);
    white-space: pre-line;
    pointer-events: none;
  }
</style>

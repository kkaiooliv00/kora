<script lang="ts">
  import { onMount } from 'svelte'
  import { app } from './lib/state.svelte'

  /** Tour de primeiro uso (tela 02): escurece a tela e destaca a área de cada passo. */
  type Step = { target: string[]; title: string; text: string }
  const STEPS: Step[] = [
    {
      target: ['[data-tour="sidebar"]'],
      title: 'Seus projetos e chats',
      text: 'A barra lateral é a navegação: projeto → grupo (branch ou worktree) → chat. Clique num chat para abri-lo; o rodapé leva a quem espera você.',
    },
    {
      target: ['[data-tour="composer"]', '[data-tour="prompt"]'],
      title: 'Fale com o agente aqui',
      text: 'Digite direto no agente. Na barra embaixo do chat ficam Contexto (arquivos que o agente vê), Fila (pedidos para depois) e Broadcast (um pedido para vários chats).',
    },
    {
      target: ['[data-tour="approval"]', '.terms'],
      title: 'Aprovação no próprio chat',
      text: 'Quando o agente quer rodar um comando arriscado, o pedido aparece no rodapé do chat com o motivo, o risco e a regra que fez pedir. Aprove uma vez, sempre, ou recuse.',
    },
    {
      target: ['[data-tour="waiting"]'],
      title: 'Quem precisa de você',
      text: 'O ponto âmbar na bandeja do sistema e este botão avisam quando um chat espera você. Clique para ir direto a ele (Ctrl+Shift+J).',
    },
  ]
  const PAD = 6
  const CARD_W = 400

  let box = $state<{ x: number; y: number; w: number; h: number } | null>(null)
  const step = $derived(STEPS[app.tourStep ?? 0])

  function measure() {
    const el = step.target.map((s) => document.querySelector<HTMLElement>(s)).find((e) => e && e.offsetParent)
    const r = el?.getBoundingClientRect()
    box = r ? { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD } : null
  }

  $effect(() => {
    void app.tourStep
    measure()
  })

  onMount(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  function finish() {
    app.tourStep = null
    app.settings.tourDone = true
  }

  const next = () => (app.tourStep === STEPS.length - 1 ? finish() : (app.tourStep = (app.tourStep ?? 0) + 1))
  const back = () => (app.tourStep = Math.max(0, (app.tourStep ?? 0) - 1))

  // O cartão fica do lado com mais espaço em volta da área destacada.
  const card = $derived.by(() => {
    if (!box) return { left: window.innerWidth / 2 - CARD_W / 2, top: window.innerHeight / 3 }
    const right = box.x + box.w + 16
    const left = right + CARD_W < window.innerWidth ? right : Math.max(16, box.x - CARD_W - 16)
    const top = Math.min(Math.max(16, box.y), window.innerHeight - 260)
    return box.w > window.innerWidth * 0.5 ? { left: box.x + 24, top: Math.max(16, box.y + box.h - 260) } : { left, top }
  })
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && finish()} />

<div class="tour" role="dialog" aria-modal="true" aria-label="Tour do Kora">
  {#if box}
    <div class="spot" style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px"></div>
  {:else}
    <div class="shade"></div>
  {/if}
  <div class="card" style:left="{card.left}px" style:top="{card.top}px" style:width="{CARD_W}px">
    <p class="overline">passo {(app.tourStep ?? 0) + 1} de {STEPS.length}</p>
    <h3>{step.title}</h3>
    <p>{step.text}</p>
    <footer>
      <span class="dots" aria-hidden="true">
        {#each STEPS as _, i (i)}<i class:on={i === app.tourStep}></i>{/each}
      </span>
      <span class="spacer"></span>
      <button class="btn ghost sm" onclick={finish}>Pular tour</button>
      {#if (app.tourStep ?? 0) > 0}<button class="btn sm" onclick={back}>Voltar</button>{/if}
      <button class="btn primary sm" onclick={next}>{app.tourStep === STEPS.length - 1 ? 'Concluir' : 'Próximo'}</button>
    </footer>
  </div>
</div>

<style>
  .tour {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: rgb(5 8 10 / 0.72);
  }
  /* O recorte: a sombra gigante escurece tudo menos a área do passo. */
  .spot {
    position: absolute;
    border: 2px solid var(--accent);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 9999px rgb(5 8 10 / 0.72);
    pointer-events: none;
    transition:
      left 200ms ease-out,
      top 200ms ease-out,
      width 200ms ease-out,
      height 200ms ease-out;
  }
  .card {
    position: absolute;
    padding: var(--space-4) var(--space-5, 20px);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-lg);
    background: var(--bg-200);
    box-shadow: var(--shadow-pop);
  }
  h3 {
    margin: var(--space-2) 0;
    font-size: 16px;
  }
  .card p:not(.overline) {
    margin: 0;
    font-size: 13px;
    line-height: 20px;
    color: var(--ink-muted);
  }
  footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .spacer {
    flex: 1;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 3px;
    background: var(--line-control);
  }
  .dots i.on {
    width: 16px;
    background: var(--accent);
  }
  @media (prefers-reduced-motion: reduce) {
    .spot {
      transition: none;
    }
  }
</style>

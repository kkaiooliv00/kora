<script lang="ts">
  import type { Snippet } from 'svelte'

  /** Estado vazio, carregando, erro ou pausado de um painel (componente EmptyState do design). */
  let {
    kind,
    title,
    detail,
    compact = false,
    children,
    actions,
  }: {
    kind: 'empty' | 'loading' | 'error' | 'paused'
    title: string
    detail?: string
    compact?: boolean
    children?: Snippet
    actions?: Snippet
  } = $props()

  const GLYPH = { empty: '·', loading: '', error: '✗', paused: '‖' }
</script>

<div class="state {kind}" class:compact role={kind === 'error' ? 'alert' : 'status'}>
  <span class="glyph" class:cursor={kind === 'loading'} aria-hidden="true">{GLYPH[kind]}</span>
  <div class="body">
    <p class="title">{title}</p>
    {#if children}<p class="text">{@render children()}</p>{/if}
    {#if detail}<pre class="detail">{detail}</pre>{/if}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</div>

<style>
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-8) var(--space-6);
    text-align: center;
  }
  .state.compact {
    flex-direction: row;
    align-items: flex-start;
    padding: var(--space-2) 0;
    text-align: left;
  }
  .glyph {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--bg-300);
    color: var(--ink-muted);
    font: 600 16px var(--font-mono);
  }
  .error .glyph {
    background: var(--danger-soft);
    color: var(--danger);
  }
  .paused .glyph {
    background: var(--warning-soft);
    color: var(--warning);
  }
  .cursor::after {
    content: '';
    width: 8px;
    height: 16px;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: inherit;
    max-width: 380px;
    min-width: 0;
  }
  .title {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }
  .text {
    margin: 0;
    font-size: 13px;
    line-height: 20px;
    color: var(--ink-muted);
  }
  .detail {
    align-self: stretch;
    margin: var(--space-1) 0 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--bg-000);
    color: var(--danger);
    font: 12px/18px var(--font-mono);
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    justify-content: inherit;
    margin-top: var(--space-2);
  }
  .state:not(.compact) .actions {
    justify-content: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .cursor::after {
      animation: none;
    }
  }
</style>

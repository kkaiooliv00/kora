<script lang="ts">
  /** Linhas de espera com a forma do conteúdo (componente Skeleton do design). */
  let { lines = 4, widths = ['90%', '70%', '80%', '45%'] }: { lines?: number; widths?: string[] } = $props()
</script>

<div class="skeleton" aria-hidden="true">
  {#each Array.from({ length: lines }, (_, i) => i) as i (i)}
    <span style:width={widths[i % widths.length]}></span>
  {/each}
</div>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  span {
    display: block;
    height: 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-300);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    span {
      animation: none;
    }
  }
</style>

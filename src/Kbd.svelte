<script lang="ts">
  /** Atalho de teclado: cada tecla no seu próprio <kbd> (componente Kbd do design). */
  let { keys }: { keys: string[] } = $props()
</script>

<span class="kbd-group">
  {#each keys as key, i (i)}<kbd>{key}</kbd>{/each}
</span>

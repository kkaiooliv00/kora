<script lang="ts">
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import { closeMenu, menuState, type MenuItem } from './lib/menu.svelte'

  const MENU_WIDTH = 230
  const ITEM_HEIGHT = 28

  let openSub = $state<number | null>(null)
  let menu = $state<HTMLDivElement>()

  // Mantém o menu dentro da janela.
  const left = $derived(Math.min(menuState.x, window.innerWidth - MENU_WIDTH - 8))
  const top = $derived(Math.min(menuState.y, window.innerHeight - menuState.items.length * ITEM_HEIGHT - 16))

  $effect(() => {
    if (!menuState.open) return
    openSub = null
    menu?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  })

  function run(item: MenuItem) {
    if (item.disabled || item.submenu) return
    closeMenu()
    item.run?.()
  }

  function onKey(e: KeyboardEvent) {
    if (!menuState.open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(menu?.querySelectorAll<HTMLButtonElement>('.top > button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? index + 1 : index - 1
    buttons[(next + buttons.length) % buttons.length]?.focus()
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={(e) => menuState.open && !menu?.contains(e.target as Node) && closeMenu()} />

{#snippet list(items: MenuItem[], nested: boolean)}
  {#each items as item, i (i)}
    {#if item.separator}
      <div class="sep" role="separator"></div>
    {:else}
      <button
        class="item"
        class:danger={item.danger}
        class:open={!nested && openSub === i}
        disabled={item.disabled}
        role="menuitem"
        aria-haspopup={item.submenu ? 'menu' : undefined}
        onmouseenter={() => !nested && (openSub = item.submenu ? i : null)}
        onclick={() => (item.submenu ? (openSub = i) : run(item))}
      >
        <span class="label">{item.label}</span>
        {#if item.shortcut}<span class="kbd">{item.shortcut}</span>{/if}
        {#if item.submenu}<ChevronRight size={14} strokeWidth={1.5} />{/if}
      </button>
      {#if !nested && item.submenu && openSub === i}
        <div class="menu sub" role="menu">
          {#if item.submenu.length === 0}
            <span class="empty">Nada para mostrar</span>
          {:else}
            {@render list(item.submenu, true)}
          {/if}
        </div>
      {/if}
    {/if}
  {/each}
{/snippet}

{#if menuState.open}
  <div class="menu top" role="menu" bind:this={menu} style:left="{left}px" style:top="{top}px" style:width="{MENU_WIDTH}px">
    {@render list(menuState.items, false)}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    display: flex;
    flex-direction: column;
    padding: var(--space-1);
    border-radius: var(--radius-md);
    background: var(--bg-200);
    box-shadow: var(--shadow-pop);
    z-index: 40;
  }
  .sub {
    position: absolute;
    left: calc(100% - 4px);
    min-width: 200px;
  }
  .item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: 28px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    text-align: left;
    font-size: 13px;
    color: var(--ink);
  }
  .item:hover,
  .item.open,
  .item:focus-visible {
    background: var(--bg-300);
    outline: none;
  }
  .item:disabled {
    color: var(--ink-faint);
    cursor: default;
    background: transparent;
  }
  .item.danger {
    color: var(--danger);
  }
  .label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kbd {
    font: 11px var(--font-mono);
    color: var(--ink-muted);
  }
  .sep {
    height: 1px;
    margin: var(--space-1) 0;
    background: var(--line);
  }
  .empty {
    padding: 4px var(--space-2);
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>

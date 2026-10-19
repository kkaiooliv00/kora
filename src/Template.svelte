<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { app } from './lib/state.svelte'
  import { fillTemplate, templateFields } from './lib/automation'
  import { terminals } from './lib/terminals'

  /** Pede os valores dos campos `{nome}` do snippet e cola o resultado no chat em foco. */
  const text = app.template
  const fields = templateFields(text)
  let values = $state<Record<string, string>>(Object.fromEntries(fields.map((f) => [f, ''])))
  const preview = $derived(fillTemplate(text, values))

  function close() {
    app.modal = null
    app.template = ''
  }

  function paste(e: SubmitEvent) {
    e.preventDefault()
    const terminal = app.active ? terminals.get(app.active) : undefined
    terminal?.paste(preview)
    close()
  }

  const focus = (node: HTMLInputElement, index: number) => {
    if (index === 0) node.focus()
  }
</script>

<div class="backdrop">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Preencher snippet">
    <form onsubmit={paste}>
      <header>
        <h2>preencher snippet</h2>
        <button type="button" class="icon-btn" aria-label="Fechar" onclick={close}><X size={16} strokeWidth={1.5} /></button>
      </header>
      {#each fields as field, i (field)}
        <label class="field">
          {field}
          <input bind:value={values[field]} use:focus={i} spellcheck="false" />
        </label>
      {/each}
      <pre class="preview">{preview}</pre>
      <footer>
        <button type="button" class="btn ghost" onclick={close}>Cancelar</button>
        <button type="submit" class="btn primary">Colar no chat</button>
      </footer>
    </form>
  </div>
</div>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .preview {
    max-height: 200px;
    margin: 0;
    overflow: auto;
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-000);
    font: 12px/18px var(--font-mono);
    white-space: pre-wrap;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>

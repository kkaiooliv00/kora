<script lang="ts">
  import { app, type Profile } from './lib/state.svelte'
  import { THEMES } from './lib/themes'

  let draft = $state({ ...app.settings })
  let profilesText = $state(JSON.stringify(app.profiles, null, 2))
  let error = $state('')

  function parseProfiles(text: string): Profile[] {
    const parsed: unknown = JSON.parse(text)
    const valid =
      Array.isArray(parsed) &&
      parsed.every((p) => p && typeof p.id === 'string' && p.id && typeof p.name === 'string' && typeof p.command === 'string')
    if (!valid) throw new Error('cada perfil precisa de "id", "name" e "command" (texto)')
    return parsed
  }

  function apply(e: SubmitEvent) {
    e.preventDefault()
    try {
      app.profiles = parseProfiles(profilesText)
    } catch (err) {
      error = `Perfis inválidos: ${err instanceof Error ? err.message : err}`
      return
    }
    app.settings = { ...draft, fontSize: Math.min(32, Math.max(8, Number(draft.fontSize) || 14)) }
    app.showSettings = false
  }
</script>

<div class="backdrop">
  <div role="dialog" aria-modal="true" aria-label="Configurações">
  <form class="modal" onsubmit={apply}>
    <h2>Configurações</h2>

    <div class="grid">
      <label>
        Tema
        <select bind:value={draft.theme}>
          {#each Object.keys(THEMES) as name (name)}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </label>
      <label>
        Tamanho da fonte
        <input type="number" min="8" max="32" bind:value={draft.fontSize} />
      </label>
      <label class="wide">
        Fonte
        <input bind:value={draft.fontFamily} spellcheck="false" />
      </label>
      <label class="wide">
        Navegador para links
        <input bind:value={draft.browser} placeholder="vazio = Chrome (cai no padrão se não achar)" spellcheck="false" />
      </label>
      <label class="wide">
        Perfis de IA
        <span class="help"><code>command</code> é o que roda no terminal; <code>"hooks": "claude"</code> liga o status preciso.</span>
        <textarea bind:value={profilesText} rows="12" spellcheck="false"></textarea>
      </label>
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="actions">
      <button type="button" onclick={() => (app.showSettings = false)}>Cancelar</button>
      <button type="submit" class="primary">Salvar</button>
    </div>
  </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 0.45);
    z-index: 10;
  }
  .modal {
    width: min(620px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    padding: 22px 24px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.4);
  }
  h2 {
    margin: 0 0 18px;
    font-size: 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .help {
    font-size: 11px;
  }
  input,
  select,
  textarea {
    padding: 7px 9px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    font: 13px/1.4 inherit;
  }
  textarea {
    font-family: var(--mono);
    font-size: 12px;
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .error {
    color: #e5484d;
    font-size: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  .actions button {
    padding: 7px 16px;
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent) !important;
    color: var(--bg);
    font-weight: 600;
  }
</style>

<script lang="ts">
  import { app, type Profile, type Snippet } from './lib/state.svelte'
  import { ACTIONS } from './lib/commands'
  import { THEMES } from './lib/themes'

  let draft = $state({ ...app.settings })
  let profilesText = $state(JSON.stringify(app.profiles, null, 2))
  let keysText = $state(JSON.stringify(app.settings.keys, null, 2))
  let snippetsText = $state(JSON.stringify(app.settings.snippets, null, 2))
  let error = $state('')

  const isText = (v: unknown) => typeof v === 'string'

  function parseProfiles(text: string): Profile[] {
    const parsed: unknown = JSON.parse(text)
    const valid = Array.isArray(parsed) && parsed.every((p) => p && isText(p.id) && p.id && isText(p.name) && isText(p.command))
    if (!valid) throw new Error('cada perfil precisa de "id", "name" e "command" (texto)')
    return parsed
  }

  function parseKeys(text: string): Record<string, string> {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('use um objeto { "ação": "Ctrl+..." }')
    const entries = Object.entries(parsed)
    const unknown = entries.find(([action]) => !(action in ACTIONS))
    if (unknown) throw new Error(`ação desconhecida "${unknown[0]}" (válidas: ${Object.keys(ACTIONS).join(', ')})`)
    if (!entries.every(([, combo]) => isText(combo))) throw new Error('cada atalho precisa ser texto')
    return parsed as Record<string, string>
  }

  function parseSnippets(text: string): Snippet[] {
    const parsed: unknown = JSON.parse(text)
    const valid =
      Array.isArray(parsed) && parsed.every((s) => s && isText(s.name) && s.name && isText(s.text) && (s.project === undefined || isText(s.project)))
    if (!valid) throw new Error('cada snippet precisa de "name" e "text"; "project" é opcional')
    return parsed
  }

  function attempt<T>(section: string, parse: () => T): T | undefined {
    try {
      return parse()
    } catch (err) {
      error = `${section}: ${err instanceof Error ? err.message : err}`
      return undefined
    }
  }

  function apply(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    const profiles = attempt('Perfis', () => parseProfiles(profilesText))
    const keys = attempt('Atalhos', () => parseKeys(keysText))
    const snippets = attempt('Snippets', () => parseSnippets(snippetsText))
    if (!profiles || !keys || !snippets) return
    app.profiles = profiles
    app.settings = {
      ...draft,
      fontSize: Math.min(32, Math.max(8, Number(draft.fontSize) || 14)),
      keys,
      snippets,
    }
    app.modal = null
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

<div class="backdrop">
  <div role="dialog" aria-modal="true" aria-label="Configurações">
    <form class="modal" onsubmit={apply}>
      <h2>Configurações</h2>
      <p class="sub">Tudo fica salvo em %APPDATA%\com.kora.terminal\config.json.</p>

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
        <label>
          Navegador para links
          <input bind:value={draft.browser} placeholder="vazio = Chrome" spellcheck="false" />
        </label>
        <label>
          Editor
          <input bind:value={draft.editor} placeholder="code" spellcheck="false" />
        </label>
        <label class="wide">
          Perfis de IA
          <span class="help">
            <code>command</code> é o que roda no terminal; <code>"hooks": "claude"</code> liga o status preciso;
            <code>"reconnect": true</code> reabre sozinho se cair. SSH:
            <code>{'{ "id": "srv", "name": "Claude no servidor", "command": "ssh -t user@host \"cd /app && claude\"", "reconnect": true }'}</code>
          </span>
          <textarea bind:value={profilesText} rows="10" spellcheck="false"></textarea>
        </label>
        <label class="wide">
          Snippets
          <span class="help">Entram pela paleta no chat em foco. <code>"project"</code> (nome do projeto) limita a um projeto.</span>
          <textarea bind:value={snippetsText} rows="6" spellcheck="false"></textarea>
        </label>
        <label class="wide">
          Atalhos
          <span class="help">Ex.: <code>"palette": "Ctrl+Shift+P"</code>. Ações: {Object.keys(ACTIONS).join(', ')}.</span>
          <textarea bind:value={keysText} rows="8" spellcheck="false"></textarea>
        </label>
      </div>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="actions">
        <button type="button" class="btn" onclick={() => (app.modal = null)}>Cancelar</button>
        <button type="submit" class="btn primary">Salvar</button>
      </div>
    </form>
  </div>
</div>

<style>
  .modal {
    width: min(680px, calc(100vw - 32px));
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .help {
    font-size: 11px;
    line-height: 1.4;
  }
</style>

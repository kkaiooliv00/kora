<script lang="ts">
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import X from '@lucide/svelte/icons/x'
  import { app, type Profile, type Snippet } from './lib/state.svelte'
  import { ACTIONS } from './lib/commands'
  import { THEMES } from './lib/themes'
  import { CATEGORIES, DEFAULT_PERMISSIONS, type Permissions, type Policy } from './lib/permissions'

  const SECTIONS = [
    { id: 'geral', label: 'Geral' },
    { id: 'agentes', label: 'Agentes' },
    { id: 'permissoes', label: 'Permissões' },
    { id: 'terminal', label: 'Terminal e aparência' },
    { id: 'atalhos', label: 'Atalhos' },
    { id: 'snippets', label: 'Snippets' },
  ] as const
  type Section = (typeof SECTIONS)[number]['id']

  const POLICIES: { value: Policy; label: string }[] = [
    { value: 'allow', label: 'Sempre' },
    { value: 'ask', label: 'Perguntar' },
    { value: 'deny', label: 'Nunca' },
  ]

  const requested = SECTIONS.find((s) => s.id === app.settingsSection)?.id
  app.settingsSection = null
  let section = $state<Section>(requested ?? 'geral')
  let draft = $state({ ...app.settings })
  let permissions = $state<Permissions>(structuredClone($state.snapshot(app.settings.permissions)))
  let profilesText = $state(JSON.stringify(app.profiles, null, 2))
  let keysText = $state(JSON.stringify(app.settings.keys, null, 2))
  let snippetsText = $state(JSON.stringify(app.settings.snippets, null, 2))
  let newAllowed = $state('')
  let newBlocked = $state('')
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

  function attempt<T>(where: Section, label: string, parse: () => T): T | undefined {
    try {
      return parse()
    } catch (err) {
      error = `${label}: ${err instanceof Error ? err.message : err}`
      section = where
      return undefined
    }
  }

  function addPattern(list: 'allowCommands' | 'denyCommands', value: string) {
    const pattern = value.trim()
    if (pattern && !permissions[list].includes(pattern)) permissions[list] = [...permissions[list], pattern]
  }

  function save() {
    error = ''
    const profiles = attempt('agentes', 'Perfis', () => parseProfiles(profilesText))
    const keys = attempt('atalhos', 'Atalhos', () => parseKeys(keysText))
    const snippets = attempt('snippets', 'Snippets', () => parseSnippets(snippetsText))
    if (!profiles || !keys || !snippets) return
    app.profiles = profiles
    app.settings = {
      ...draft,
      fontSize: Math.min(32, Math.max(8, Number(draft.fontSize) || 13)),
      keys,
      snippets,
      permissions: $state.snapshot(permissions),
    }
    app.modal = null
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (app.modal = null)} />

{#snippet segmented(value: Policy, onchange: (p: Policy) => void, label: string)}
  <div class="segmented" role="radiogroup" aria-label={label}>
    {#each POLICIES as policy (policy.value)}
      <button role="radio" aria-checked={value === policy.value} class:on={value === policy.value} onclick={() => onchange(policy.value)}>
        {policy.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet chips(list: 'allowCommands' | 'denyCommands', placeholder: string)}
  <div class="chips">
    {#each permissions[list] as pattern (pattern)}
      <span class="chip">
        {pattern}
        <button
          class="chip-x"
          aria-label={`Remover ${pattern}`}
          onclick={() => (permissions[list] = permissions[list].filter((p) => p !== pattern))}
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </span>
    {/each}
    {#if list === 'allowCommands'}
      <input
        class="input mono chip-input"
        bind:value={newAllowed}
        {placeholder}
        aria-label="Adicionar comando permitido"
        onkeydown={(e) => {
          if (e.key !== 'Enter') return
          addPattern(list, newAllowed)
          newAllowed = ''
        }}
      />
    {:else}
      <input
        class="input mono chip-input"
        bind:value={newBlocked}
        {placeholder}
        aria-label="Adicionar comando bloqueado"
        onkeydown={(e) => {
          if (e.key !== 'Enter') return
          addPattern(list, newBlocked)
          newBlocked = ''
        }}
      />
    {/if}
  </div>
{/snippet}

<div class="page" role="dialog" aria-modal="true" aria-label="Configurações">
  <header>
    <button class="icon-btn" aria-label="Voltar sem salvar" title="Voltar sem salvar (Esc)" onclick={() => (app.modal = null)}>
      <ChevronLeft size={16} strokeWidth={1.5} />
    </button>
    <h1>configurações</h1>
  </header>

  <div class="layout">
    <nav aria-label="Seções">
      {#each SECTIONS as s (s.id)}
        <button class:active={section === s.id} aria-current={section === s.id ? 'page' : undefined} onclick={() => (section = s.id)}>
          {s.label}
        </button>
      {/each}
    </nav>

    <main>
      {#if section === 'geral'}
        <h2>geral</h2>
        <p class="lead">Programas externos que o Kora abre por você.</p>
        <div class="stack">
          <label class="field">
            Navegador para links
            <span class="help">Caminho do executável. Vazio procura o Chrome e cai no navegador padrão.</span>
            <input bind:value={draft.browser} placeholder="Chrome" spellcheck="false" />
          </label>
          <label class="field">
            Editor
            <span class="help">Comando que recebe a pasta do projeto no fim, como <code>code</code> ou <code>cursor</code>.</span>
            <input bind:value={draft.editor} placeholder="code" spellcheck="false" />
          </label>
        </div>
      {:else if section === 'agentes'}
        <h2>agentes</h2>
        <p class="lead">
          Cada perfil é um comando que roda no terminal. <code>"hooks": "claude"</code> liga o status preciso e as permissões;
          <code>"reconnect": true</code> reabre sozinho se cair.
        </p>
        <label class="field">
          Perfis
          <span class="help">
            SSH: <code>{'{ "id": "srv", "name": "Claude no servidor", "command": "ssh -t user@host \\"cd /app && claude\\"", "reconnect": true }'}</code>
          </span>
          <textarea bind:value={profilesText} rows="16" spellcheck="false"></textarea>
        </label>
      {:else if section === 'permissoes'}
        <h2>permissões do agente</h2>
        <p class="lead">
          O que o Claude pode fazer sem perguntar. Vale para os chats Claude abertos depois de salvar. Codex e Agy usam as
          permissões próprias.
        </p>
        <div class="table">
          {#each CATEGORIES as category (category.key)}
            <div class="perm-row">
              <div>
                <p class="perm-label">{category.label}</p>
                <p class="perm-help">{category.help}</p>
              </div>
              {@render segmented(permissions[category.key], (p) => (permissions[category.key] = p), category.label)}
            </div>
          {/each}
        </div>

        <h3>Comandos sempre permitidos</h3>
        <p class="perm-help">Rodam sem aprovação mesmo com "Rodar comandos" em Perguntar. <code>*</code> no fim vale como prefixo. Enter adiciona.</p>
        {@render chips('allowCommands', 'npm test*')}

        <h3>Sempre bloqueados</h3>
        <p class="perm-help">Recusados mesmo se você aprovar tudo.</p>
        {@render chips('denyCommands', 'git push --force*')}

        <div class="section-actions">
          <button class="btn ghost" onclick={() => (permissions = structuredClone(DEFAULT_PERMISSIONS))}>Restaurar padrão</button>
        </div>
      {:else if section === 'terminal'}
        <h2>terminal e aparência</h2>
        <p class="lead">A interface segue a identidade Kora; aqui muda só o terminal.</p>
        <div class="grid">
          <label class="field">
            Tema do terminal
            <select bind:value={draft.theme}>
              {#each Object.keys(THEMES) as name (name)}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </label>
          <label class="field">
            Tamanho da fonte
            <input type="number" min="8" max="32" bind:value={draft.fontSize} />
          </label>
          <label class="field wide">
            Fonte
            <span class="help">Padrão: JetBrains Mono, a fonte da marca.</span>
            <input bind:value={draft.fontFamily} spellcheck="false" />
          </label>
        </div>
      {:else if section === 'atalhos'}
        <h2>atalhos</h2>
        <p class="lead">Ações: {Object.keys(ACTIONS).join(', ')}. Use <code>Ctrl+Shift+letra</code>: Ctrl+letra pura é dos agentes.</p>
        <label class="field">
          Atalhos
          <textarea bind:value={keysText} rows="16" spellcheck="false"></textarea>
        </label>
      {:else if section === 'snippets'}
        <h2>snippets</h2>
        <p class="lead">Prompts prontos, colados pela paleta no chat em foco. <code>"project"</code> (nome do projeto) limita a um projeto.</p>
        <label class="field">
          Snippets
          <textarea bind:value={snippetsText} rows="16" spellcheck="false"></textarea>
        </label>
      {/if}

      {#if error}<p class="error" role="alert">✗ {error}</p>{/if}

      <footer>
        <button class="btn ghost" onclick={() => (app.modal = null)}>Cancelar</button>
        <button class="btn primary" onclick={save}>Salvar alterações</button>
      </footer>
    </main>
  </div>
</div>

<style>
  .page {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 44px 1fr;
    background: var(--bg-100);
    z-index: 15;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--line);
  }
  h1 {
    margin: 0;
    font: 600 14px/20px var(--font-mono);
  }
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 0;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-4) var(--space-3);
    border-right: 1px solid var(--line);
  }
  nav button {
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    text-align: left;
    font-size: 13px;
    color: var(--ink-muted);
  }
  nav button:hover {
    background: var(--bg-200);
    color: var(--ink);
  }
  nav button.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  main {
    overflow-y: auto;
    padding: var(--space-8) 40px;
  }
  main > * {
    max-width: 760px;
  }
  h2 {
    margin: 0 0 var(--space-2);
    font: 600 22px/28px var(--font-mono);
    letter-spacing: -0.01em;
  }
  h3 {
    margin: var(--space-8) 0 var(--space-1);
    font-size: 15px;
    line-height: 22px;
    font-weight: 600;
  }
  .lead {
    margin: 0 0 var(--space-6);
    font-size: 14px;
    color: var(--ink-muted);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .table {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--bg-200);
  }
  .perm-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
  }
  .perm-row + .perm-row {
    border-top: 1px solid var(--line);
  }
  .perm-label {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
  .perm-help {
    margin: 0;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .segmented {
    display: inline-flex;
    flex: none;
    padding: 2px;
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
  }
  .segmented button {
    height: 26px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--ink-muted);
  }
  .segmented button:hover {
    color: var(--ink);
  }
  .segmented button.on {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: 500;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-1) 0 var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    font: 12px var(--font-mono);
  }
  .chip-x {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
  }
  .chip-x:hover {
    background: var(--bg-300);
    color: var(--ink);
  }
  .chip-input {
    width: 180px;
    height: 28px;
    min-height: 28px;
  }
  .section-actions {
    margin-top: var(--space-6);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-8);
    padding-top: var(--space-4);
    border-top: 1px solid var(--line);
  }
</style>

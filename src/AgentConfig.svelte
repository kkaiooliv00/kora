<script lang="ts">
  import { invoke } from '@tauri-apps/api/core'
  import { ask } from '@tauri-apps/plugin-dialog'
  import { fail } from './lib/state.svelte'
  import { toast } from './lib/toasts.svelte'
  import { splitCommand } from './lib/command'
  import { openInEditor } from './lib/automation'

  /**
   * MCP e skills do projeto: os arquivos que o Claude Code lê na pasta (`.mcp.json` e `.claude/skills/`).
   * Cada ação grava na hora; não depende do "Salvar" do projeto.
   */
  let { root, view }: { root: string; view: 'mcp' | 'skills' } = $props()

  type Server = { type?: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }
  type Skill = { name: string; description: string; body: string }

  let mcp = $state<Record<string, unknown>>({})
  let skills = $state<Skill[]>([])
  let loading = $state(true)
  let error = $state('')

  const servers = $derived(Object.entries((mcp.mcpServers ?? {}) as Record<string, Server>))

  async function load() {
    loading = true
    error = ''
    try {
      ;[mcp, skills] = await Promise.all([invoke<Record<string, unknown>>('project_mcp', { root }), invoke<Skill[]>('project_skills', { root })])
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }
  load()

  // ---- MCP ----

  let adding = $state(false)
  let serverName = $state('')
  let serverKind = $state<'stdio' | 'http'>('stdio')
  let serverCommand = $state('')
  let serverUrl = $state('')
  let serverEnv = $state('')
  let rawJson = $state<string | null>(null)

  /** `CHAVE=valor` por linha → objeto. */
  function parsePairs(text: string, separator: '=' | ':'): Record<string, string> {
    const pairs: Record<string, string> = {}
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const at = line.indexOf(separator)
      if (at <= 0) throw new Error(`linha sem "${separator}": ${line}`)
      pairs[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
    return pairs
  }

  const describe = (s: Server) => (s.url ? `${s.type ?? 'http'} · ${s.url}` : [s.command, ...(s.args ?? [])].join(' '))

  async function writeServers(next: Record<string, Server>) {
    const value = { ...mcp, mcpServers: next }
    await invoke('save_project_mcp', { root, value })
    mcp = value
  }

  async function addServer(e: SubmitEvent) {
    e.preventDefault()
    const name = serverName.trim()
    try {
      if (!/^[\w.-]+$/.test(name)) throw new Error('use letras, números, ponto, _ ou - no nome')
      let server: Server
      if (serverKind === 'stdio') {
        const [command, ...args] = splitCommand(serverCommand.trim())
        if (!command) throw new Error('informe o comando (ex.: npx -y @modelcontextprotocol/server-github)')
        server = { command, args }
        const env = parsePairs(serverEnv, '=')
        if (Object.keys(env).length) server.env = env
      } else {
        if (!/^https?:\/\//.test(serverUrl.trim())) throw new Error('a URL precisa começar com http:// ou https://')
        server = { type: 'http', url: serverUrl.trim() }
        const headers = parsePairs(serverEnv, ':')
        if (Object.keys(headers).length) server.headers = headers
      }
      const current = (mcp.mcpServers ?? {}) as Record<string, Server>
      if (current[name] && !(await ask(`Já existe o servidor "${name}". Substituir?`, { title: 'MCP', kind: 'warning' }))) return
      await writeServers({ ...current, [name]: server })
      toast({ tone: 'success', title: `Servidor ${name} adicionado`, text: 'Vale para os chats abertos a partir de agora; o Claude pede para confirmar na primeira vez.' })
      adding = false
      serverName = serverCommand = serverUrl = serverEnv = ''
    } catch (e) {
      fail('MCP', e instanceof Error ? e.message : e)
    }
  }

  async function removeServer(name: string) {
    if (!(await ask(`Remover o servidor MCP "${name}" deste projeto?`, { title: 'MCP', kind: 'warning' }))) return
    const { [name]: _, ...rest } = (mcp.mcpServers ?? {}) as Record<string, Server>
    await writeServers(rest).catch((e) => fail('MCP', e))
  }

  async function saveRaw() {
    if (rawJson === null) return
    try {
      const value = JSON.parse(rawJson)
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('use um objeto { "mcpServers": { … } }')
      await invoke('save_project_mcp', { root, value })
      mcp = value
      rawJson = null
      toast({ tone: 'success', title: '.mcp.json salvo' })
    } catch (e) {
      fail('JSON inválido', e instanceof Error ? e.message : e)
    }
  }

  // ---- skills ----

  /** Skill aberta no editor: `previous` é o nome original (null = nova). */
  let editing = $state<{ previous: string | null; name: string; description: string; body: string } | null>(null)

  const newSkill = () => (editing = { previous: null, name: '', description: '', body: '' })
  const editSkill = (s: Skill) => (editing = { previous: s.name, ...s })

  async function saveSkill(e: SubmitEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      editing.name = editing.name.replace(/-+$/, '')
      await invoke('save_skill', { root, name: editing.name, description: editing.description, body: editing.body, previous: editing.previous })
      toast({ tone: 'success', title: `Skill ${editing.name.trim()} salva`, text: 'Os agentes usam quando o pedido combina com a descrição.' })
      editing = null
      skills = await invoke<Skill[]>('project_skills', { root })
    } catch (e) {
      fail('Skill', e)
    }
  }

  async function removeSkill(name: string) {
    if (!(await ask(`Apagar a skill "${name}" e a pasta dela (.claude/skills/${name})?`, { title: 'Skill', kind: 'warning' }))) return
    try {
      await invoke('remove_skill', { root, name })
      skills = skills.filter((s) => s.name !== name)
    } catch (e) {
      fail('Skill', e)
    }
  }

  // Ao digitar: o hífen do fim fica (você ainda está escrevendo a próxima palavra).
  const slug = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 64)
</script>

{#if loading}
  <p class="muted">Carregando…</p>
{:else if error}
  <p class="error">{error}</p>
  <button class="btn sm" onclick={load}>Tentar de novo</button>
{:else if view === 'mcp'}
  <p class="help">
    Servidores MCP deste projeto, em <code>.mcp.json</code>. Dão ferramentas extras ao agente (GitHub, banco de dados, navegador…). Commite o arquivo para o time
    todo usar; segredos vão em variáveis de ambiente, não no arquivo.
  </p>

  {#if rawJson !== null}
    <textarea class="input mono raw" bind:value={rawJson} spellcheck="false" aria-label=".mcp.json"></textarea>
    <div class="row-actions">
      <button class="btn ghost sm" onclick={() => (rawJson = null)}>Cancelar</button>
      <button class="btn primary sm" onclick={saveRaw}>Salvar JSON</button>
    </div>
  {:else}
    {#if servers.length === 0}
      <p class="muted">Nenhum servidor MCP neste projeto.</p>
    {:else}
      <ul class="list">
        {#each servers as [name, server] (name)}
          <li>
            <div class="item">
              <strong class="mono">{name}</strong>
              <span class="detail mono" title={describe(server)}>{describe(server)}</span>
            </div>
            <button class="link danger" onclick={() => removeServer(name)}>Remover</button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if adding}
      <form class="card" onsubmit={addServer}>
        <div class="two">
          <label class="field">
            Nome
            <input class="input mono" bind:value={serverName} placeholder="github" spellcheck="false" />
          </label>
          <label class="field">
            Tipo
            <select bind:value={serverKind}>
              <option value="stdio">Comando local (stdio)</option>
              <option value="http">Remoto (HTTP)</option>
            </select>
          </label>
        </div>
        {#if serverKind === 'stdio'}
          <label class="field">
            Comando
            <input class="input mono" bind:value={serverCommand} placeholder="npx -y @modelcontextprotocol/server-github" spellcheck="false" />
          </label>
          <label class="field">
            Variáveis de ambiente
            <span class="help">Uma por linha, CHAVE=valor. Use ${'{'}VAR{'}'} para ler do sistema em vez de gravar o segredo.</span>
            <textarea class="input mono" rows="2" bind:value={serverEnv} placeholder={'GITHUB_TOKEN=${GITHUB_TOKEN}'} spellcheck="false"></textarea>
          </label>
        {:else}
          <label class="field">
            URL
            <input class="input mono" bind:value={serverUrl} placeholder="https://mcp.exemplo.com/mcp" spellcheck="false" />
          </label>
          <label class="field">
            Cabeçalhos
            <span class="help">Um por linha, Nome: valor.</span>
            <textarea class="input mono" rows="2" bind:value={serverEnv} placeholder={'Authorization: Bearer ${API_TOKEN}'} spellcheck="false"></textarea>
          </label>
        {/if}
        <div class="row-actions">
          <button type="button" class="btn ghost sm" onclick={() => (adding = false)}>Cancelar</button>
          <button type="submit" class="btn primary sm">Adicionar</button>
        </div>
      </form>
    {:else}
      <div class="row-actions start">
        <button class="btn sm" onclick={() => (adding = true)}>Adicionar servidor</button>
        <button class="btn ghost sm" onclick={() => (rawJson = JSON.stringify(mcp, null, 2))}>Editar JSON</button>
        <button class="btn ghost sm" onclick={() => openInEditor(root)}>Abrir pasta no editor</button>
      </div>
    {/if}
  {/if}
{:else}
  <p class="help">
    Skills deste projeto, em <code>.claude/skills/</code>. Cada uma ensina o agente a fazer uma tarefa do jeito do projeto (deploy, revisão, migrations…); ele usa
    sozinho quando o pedido combina com a descrição, ou você chama com <code>/nome</code>.
  </p>

  {#if editing}
    <form class="card" onsubmit={saveSkill}>
      <label class="field">
        Nome
        <span class="help">Minúsculas, números e hífens; vira o comando /{editing.name || 'nome'}.</span>
        <input class="input mono" value={editing.name} oninput={(e) => editing && (editing.name = slug(e.currentTarget.value))} placeholder="revisar-migration" spellcheck="false" />
      </label>
      <label class="field">
        Descrição
        <span class="help">O que ela faz e quando usar. É o que o agente lê para decidir.</span>
        <input class="input" bind:value={editing.description} placeholder="Revisa migrations do banco antes do merge. Use quando mexer em db/migrations." />
      </label>
      <label class="field">
        Instruções
        <textarea class="input mono body" bind:value={editing.body} placeholder={'1. Leia as migrations novas em db/migrations\n2. Confira se cada uma tem rollback\n3. …'} spellcheck="false"></textarea>
      </label>
      <div class="row-actions">
        <button type="button" class="btn ghost sm" onclick={() => (editing = null)}>Cancelar</button>
        <button type="submit" class="btn primary sm" disabled={!editing.name || !editing.description.trim()}>Salvar skill</button>
      </div>
    </form>
  {:else}
    {#if skills.length === 0}
      <p class="muted">Nenhuma skill neste projeto.</p>
    {:else}
      <ul class="list">
        {#each skills as skill (skill.name)}
          <li>
            <div class="item">
              <strong class="mono">/{skill.name}</strong>
              <span class="detail" title={skill.description}>{skill.description || 'sem descrição'}</span>
            </div>
            <button class="link" onclick={() => editSkill(skill)}>Editar</button>
            <button class="link danger" onclick={() => removeSkill(skill.name)}>Apagar</button>
          </li>
        {/each}
      </ul>
    {/if}
    <div class="row-actions start">
      <button class="btn sm" onclick={newSkill}>Nova skill</button>
    </div>
  {/if}
{/if}

<style>
  .help,
  .muted {
    margin: 0;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  .mono {
    font-family: var(--font-mono);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
  }
  .list li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
  }
  .list li + li {
    border-top: 1px solid var(--line);
  }
  .item {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--ink-muted);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--line-control);
    border-radius: var(--radius-md);
    background: var(--bg-200);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }
  .row-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .row-actions.start {
    justify-content: flex-start;
  }
  .raw {
    min-height: 220px;
    resize: vertical;
  }
  .body {
    min-height: 160px;
    resize: vertical;
  }
  .link {
    font-size: 12px;
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .link.danger {
    color: var(--danger);
  }
</style>

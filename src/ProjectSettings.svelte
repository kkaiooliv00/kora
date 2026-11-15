<script lang="ts">
  import X from '@lucide/svelte/icons/x'
  import { app, runProject } from './lib/state.svelte'
  import AgentConfig from './AgentConfig.svelte'

  const TABS = [
    { id: 'geral', label: 'Geral' },
    { id: 'mcp', label: 'MCP' },
    { id: 'skills', label: 'Skills' },
  ] as const

  const project = app.projects.find((p) => p.id === app.editingProject)
  let tab = $state<(typeof TABS)[number]['id']>('geral')
  let setupFiles = $state(project?.setupFiles ?? '.env')
  let setupCommand = $state(project?.setupCommand ?? '')
  let runCommand = $state(project?.runCommand ?? '')

  function close() {
    app.modal = null
    app.editingProject = null
    app.pendingRun = null
  }

  function save(e: SubmitEvent) {
    e.preventDefault()
    if (project) {
      const patch = { setupFiles: setupFiles.trim(), setupCommand: setupCommand.trim(), runCommand: runCommand.trim() }
      app.projects = app.projects.map((p) => (p.id === project.id ? { ...p, ...patch } : p))
    }
    const run = app.pendingRun
    close()
    if (run && runCommand.trim()) runProject(run)
  }
</script>

<div class="backdrop">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Configurar projeto">
    <header>
      <h2>projeto · {project?.name ?? '?'}</h2>
      <button type="button" class="icon-btn" aria-label="Fechar" onclick={close}><X size={16} strokeWidth={1.5} /></button>
    </header>
    <p class="sub mono">{project?.path}</p>

    <div class="tabs" role="tablist">
      {#each TABS as t (t.id)}
        <button role="tab" class="tab" class:active={tab === t.id} aria-selected={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </div>

    {#if tab === 'geral'}
      <form onsubmit={save}>
        <label class="field">
          Arquivos copiados para cada worktree novo
          <span class="help">Relativos à pasta do projeto, separados por vírgula. Ex.: .env, .env.local, config/dev.json</span>
          <input class="input mono" bind:value={setupFiles} spellcheck="false" placeholder=".env" />
        </label>

        <label class="field">
          Script de preparação do worktree
          <span class="help">Roda na pasta do worktree antes do agente abrir. %KORA_ROOT% (ou $KORA_ROOT no Linux) é a pasta do projeto.</span>
          <input class="input mono" bind:value={setupCommand} spellcheck="false" placeholder="npm install" />
        </label>

        <label class="field">
          Comando para rodar o projeto (botão ▶)
          <span class="help">Abre num shell ao lado do chat, na pasta dele. {'{port}'} vira uma porta livre, para dois worktrees não brigarem.</span>
          <input class="input mono" bind:value={runCommand} spellcheck="false" placeholder={'npm run dev -- --port {port}'} />
        </label>

        <footer>
          <button type="button" class="btn ghost" onclick={close}>Cancelar</button>
          <button type="submit" class="btn primary">Salvar</button>
        </footer>
      </form>
    {:else if project}
      <div class="pane">
        <AgentConfig root={project.path} view={tab} />
      </div>
    {/if}
  </div>
</div>

<style>
  .modal {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-height: calc(100vh - 64px);
  }
  form,
  .pane {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-height: 0;
    overflow-y: auto;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sub {
    margin: -12px 0 0;
    font-size: 12px;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    border-bottom: 1px solid var(--line);
  }
  .tab {
    padding: var(--space-2) var(--space-3);
    margin-bottom: -1px;
    border-bottom: 2px solid transparent;
    color: var(--ink-muted);
  }
  .tab.active {
    border-bottom-color: var(--accent);
    color: var(--ink);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>

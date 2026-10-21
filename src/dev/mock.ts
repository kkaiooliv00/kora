/**
 * Só em `npm run dev` fora do Tauri: simula o backend para revisar o visual no navegador.
 * Nunca entra no build (importado atrás de `import.meta.env.DEV`).
 */
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'

const now = Date.now()
const HOUR = 3_600_000

const state = {
  projects: [
    { id: 'p-api', name: 'api', path: 'C:/Users/dev/projetos/api' },
    { id: 'p-web', name: 'web', path: 'C:/Users/dev/projetos/web' },
  ],
  groups: [{ id: 'g-rev', name: 'revisão', projectId: 'p-api' }],
  chats: [
    { id: 'c-1', name: 'Claude 1', profileId: 'claude', projectId: 'p-api', lastActive: now - 2 * HOUR, sessionId: 's-1' },
    { id: 'c-2', name: 'Codex 1', profileId: 'codex', projectId: 'p-api', groupId: 'g-rev', lastActive: now - 26 * HOUR },
    { id: 'c-4', name: 'Claude 3', profileId: 'claude', projectId: 'p-api', groupId: 'g-rev', sessionId: 's-4' },
    { id: 'c-3', name: 'Claude 2', profileId: 'claude', projectId: 'p-web', branch: 'kora/claude-2', cwd: 'C:/x', lastActive: now - 72 * HOUR },
    { id: 'c-5', name: 'Claude antigo', profileId: 'claude', projectId: 'p-api', archived: true, lastActive: now - 200 * HOUR },
  ],
  tasks: [
    { id: 't-a', projectId: 'p-api', text: 'Paginar a listagem de pedidos', column: 'todo' },
    { id: 't-b', projectId: 'p-api', text: 'Migrar config para TOML', column: 'doing', chatId: 'c-1' },
    { id: 't-c', projectId: 'p-api', text: 'Revisar o fluxo de login', column: 'review', chatId: 'c-4' },
  ],
  tabs: new URLSearchParams(location.search).has('welcome')
    ? []
    : [
        { id: 't-1', panes: ['c-1'], vertical: false },
        { id: 't-2', panes: ['c-2', 'c-3'], vertical: false },
      ],
  activeTab: 't-1',
  active: 'c-1',
}

/** Uso fictício de hoje e ontem, por hora, para revisar o painel. */
function usageRows() {
  const rows = []
  for (let back = 0; back < 48; back++) {
    const t = new Date(now - back * HOUR)
    const day = t.toISOString().slice(0, 10)
    const hour = t.getUTCHours()
    const wave = 40_000 + Math.round(30_000 * Math.sin(back / 3) ** 2)
    rows.push({ day, hour, session: 's-1', source: 'claude', model: 'claude-opus', project: 'api', tokens: { input: wave, output: wave / 5, cacheWrite: 0, cacheRead: wave * 4 } })
    rows.push({ day, hour, session: 's-4', source: 'claude', model: 'claude-opus', project: 'api', tokens: { input: wave / 2, output: wave / 9, cacheWrite: 0, cacheRead: 0 } })
    rows.push({ day, hour, session: 'x', source: 'codex', model: 'gpt', project: 'web', tokens: { input: wave / 4, output: wave / 12, cacheWrite: 0, cacheRead: 0 } })
  }
  return rows
}

export function installMocks() {
  // Estados de exemplo depois que o app carrega (um chat aguardando você).
  setTimeout(() => {
    import('../lib/state.svelte').then(({ app }) => {
      app.status['c-2'] = 'waiting'
      app.waitingSince['c-2'] = Date.now() - 120_000
      app.agentInfo['c-2'] = {
        permission: 'Claude needs your permission to use Bash',
        pending: {
          tool: 'Bash',
          command: 'docker compose up -d db && npm run test:e2e',
          reason: 'Sobe o banco local num container e roda os testes de ponta a ponta para garantir que o login funciona de verdade.',
        },
      }
      app.status['c-3'] = 'running'
      if (new URLSearchParams(location.search).has('loop')) {
        app.loopPaused['c-3'] = { command: 'npm run db:migrate', count: 6, from: Date.now() - 180_000, to: Date.now() }
      }
      if (!new URLSearchParams(location.search).has('tour')) app.tourStep = null
    })
  }, 1500)
  mockWindows('main')
  mockIPC((cmd, args) => {
    const payload = args as Record<string, unknown>
    switch (cmd) {
      case 'load_json':
        return payload.name === 'state' ? state : null
      case 'git_branch':
        return 'main'
      case 'claude_settings':
        return 'C:/mock/settings.json'
      case 'pty_spawn':
        return 1
      case 'git_diff':
        return {
          status: '## main...origin/main\n M src/auth/session.ts\n?? notas.md',
          diff: [
            'diff --git a/src/auth/session.ts b/src/auth/session.ts',
            '--- a/src/auth/session.ts',
            '+++ b/src/auth/session.ts',
            '@@ -41,4 +41,6 @@ export function createSession(user: User): Session {',
            ' export function createSession(user: User): Session {',
            '   const now = Date.now();',
            '-  const expiresAt = now / 1000 + TTL_SECONDS;',
            '+  // TTL em segundos; a API pública usa milissegundos',
            '+  const ttlMs = TTL_SECONDS * 1000;',
            '+  const expiresAt = now + ttlMs;',
            '   return { userId: user.id, expiresAt };',
          ].join('\n'),
        }
      case 'usage_summary':
        return { rows: usageRows(), files: 12 }
      case 'pty_stats':
        return Object.fromEntries((payload.ids as number[]).map((id) => [id, { cpu: 3.2 * id, memory: 180_000_000 + id * 40_000_000 }]))
      case 'checkpoints':
        return [
          { ref: 'refs/kora/checkpoints/c-1/0001792430000000', time: now - 600_000, label: 'Migrar config para TOML' },
          { ref: 'refs/kora/checkpoints/c-1/0001792420000000', time: now - 3 * HOUR, label: 'Rodar os testes e resumir falhas' },
        ]
      case 'search_history':
        return [
          { session: 's-1', time: new Date(now - HOUR).toISOString(), role: 'user', snippet: `…preciso migrar a config para ${payload.query} sem quebrar…` },
          { session: 's-4', time: new Date(now - 5 * HOUR).toISOString(), role: 'assistant', snippet: `Feito: o arquivo ${payload.query} agora é lido no boot…` },
        ]
      case 'free_port':
        return 51234
      default:
        return null
    }
  })
}

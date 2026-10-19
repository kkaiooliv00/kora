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
    { id: 'c-1', name: 'Claude 1', profileId: 'claude', projectId: 'p-api', lastActive: now - 2 * HOUR },
    { id: 'c-2', name: 'Codex 1', profileId: 'codex', projectId: 'p-api', groupId: 'g-rev', lastActive: now - 26 * HOUR },
    { id: 'c-3', name: 'Claude 2', profileId: 'claude', projectId: 'p-web', branch: 'kora/claude-2', cwd: 'C:/x', lastActive: now - 72 * HOUR },
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

export function installMocks() {
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
        return { rows: [], files: 0 }
      default:
        return null
    }
  })
}

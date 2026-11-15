import type { Chat, Group, Status } from './state.svelte'

/** Um grupo como a barra lateral mostra (tela 14): grupo criado, a branch principal ou um worktree avulso. */
export interface GroupView {
  key: string
  name: string
  branch: string
  /** Grupo criado pelo usuário (tem menu de renomear/remover). */
  groupId?: string
  principal: boolean
  worktree: boolean
  chats: Chat[]
}

/** Ordem de urgência dos glifos do resumo (! ✗ › ✓). */
export const SUMMARY_ORDER: Status[] = ['waiting', 'error', 'running', 'done']
const SUMMARY_MAX = 3

/**
 * Grupos de um projeto: os criados pelo usuário, a branch principal (chats sem grupo e sem worktree)
 * e um grupo por worktree avulso. A branch de um grupo criado é a do worktree se todos os chats estão nele.
 */
export function groupViews(projectId: string, chats: Chat[], groups: Group[], mainBranch: string): GroupView[] {
  const own = chats.filter((c) => c.projectId === projectId)
  const loose = own.filter((c) => !c.groupId)
  const principal = loose.filter((c) => !c.branch)
  const views: GroupView[] = []
  if (principal.length > 0) {
    views.push({ key: `main:${projectId}`, name: mainBranch, branch: mainBranch, principal: true, worktree: false, chats: principal })
  }
  for (const group of groups.filter((g) => g.projectId === projectId)) {
    const members = own.filter((c) => c.groupId === group.id)
    const branches = new Set(members.map((c) => c.branch))
    const worktreeBranch = branches.size === 1 ? [...branches][0] : undefined
    views.push({
      key: group.id,
      name: group.name,
      branch: worktreeBranch ?? mainBranch,
      groupId: group.id,
      principal: false,
      worktree: worktreeBranch !== undefined,
      chats: members,
    })
  }
  // O ▶ de rodar projeto e o revisor usam o worktree do dono: entram no grupo dele em vez de criar outro igual.
  for (const chat of loose.filter((c) => c.branch && !c.runOf && !c.reviewOf)) {
    const runs = loose.filter((c) => c.runOf === chat.id || c.reviewOf === chat.id)
    views.push({ key: `wt:${chat.id}`, name: chat.branch!, branch: chat.branch!, principal: false, worktree: true, chats: [chat, ...runs] })
  }
  return views
}

/** Até 3 glifos por urgência e quantos chats ficam de fora ("+N"). */
export function summary(statuses: (Status | undefined)[]): { glyphs: Status[]; rest: number } {
  const glyphs = SUMMARY_ORDER.filter((s) => statuses.includes(s)).slice(0, SUMMARY_MAX)
  return { glyphs, rest: Math.max(0, statuses.length - glyphs.length) }
}

/** "agora", "8m", "3h", "2d". */
export function shortAgo(ms: number | undefined, now = Date.now()): string {
  if (!ms) return ''
  const minutes = Math.floor((now - ms) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

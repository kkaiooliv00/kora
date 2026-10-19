import { app, addChat, renameChat, uid, type Status, type TaskColumn } from './state.svelte'

const NAME_MAX = 40
const shortName = (text: string) => {
  const line = text.trim().split('\n')[0]
  return line.length > NAME_MAX ? `${line.slice(0, NAME_MAX - 1)}…` : line
}

// ---- quadro de tarefas ----

export function addTask(projectId: string, text: string) {
  if (text.trim()) app.tasks.push({ id: uid(), projectId, text: text.trim(), column: 'todo' })
}

export function removeTask(id: string) {
  app.tasks = app.tasks.filter((t) => t.id !== id)
}

/** Mover para "em andamento" pela primeira vez abre um agente (num worktree, por padrão) com o texto da tarefa. */
export async function moveTask(id: string, column: TaskColumn, profileId: string, worktree: boolean) {
  const task = app.tasks.find((t) => t.id === id)
  if (!task || task.column === column) return
  let chatId = task.chatId
  if (column === 'doing' && !chatId) {
    chatId = await addChat(task.projectId, profileId, undefined, worktree)
    if (!chatId) return
    renameChat(chatId, shortName(task.text))
    app.pendingPrompt[chatId] = task.text
  }
  app.tasks = app.tasks.map((t) => (t.id === id ? { ...t, column, chatId } : t))
}

/** O agente da tarefa terminou de responder: a tarefa vai para revisão. */
export function onTaskStatus(chatId: string, previous: Status | undefined, status: Status) {
  if (previous !== 'running' || status !== 'idle') return
  app.tasks = app.tasks.map((t) => (t.chatId === chatId && t.column === 'doing' ? { ...t, column: 'review' } : t))
}

// ---- comparar agentes ----

/** O mesmo prompt para vários agentes, cada um no próprio worktree, num grupo e numa aba lado a lado. */
export async function startCompare(projectId: string, profileIds: string[], prompt: string): Promise<string | undefined> {
  if (!prompt.trim() || profileIds.length < 2) return
  const group = { id: uid(), name: `comparar: ${shortName(prompt)}`, projectId, compare: prompt.trim() }
  app.groups.push(group)
  const ids: string[] = []
  for (const profileId of profileIds) {
    const id = await addChat(projectId, profileId, group.id, true)
    if (!id) continue
    app.pendingPrompt[id] = prompt.trim()
    ids.push(id)
  }
  if (ids.length === 0) return
  // Uma aba só com todos lado a lado (addChat abriu cada um numa aba própria).
  app.tabs = [...app.tabs.filter((t) => !t.panes.every((p) => ids.includes(p))), { id: uid(), panes: ids, vertical: false }]
  app.activeTab = app.tabs.at(-1)?.id ?? null
  app.active = ids[0]
  return group.id
}

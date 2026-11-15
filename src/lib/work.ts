import { invoke } from '@tauri-apps/api/core'
import { app, addChat, chatById, fail, openChat, profileOf, projectOf, splitChat, updateChat, uid, type Chat, type Status, type TaskColumn } from './state.svelte'
import { terminals } from './terminals'
import { toast } from './toasts.svelte'
import { sendTo } from './queue'

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

/** Tarefas abrindo agente agora: um segundo drop não cria outro chat. */
const starting = new Set<string>()

/** Mover para "em andamento" sem chat (ou com o chat removido) abre um agente com o texto da tarefa. */
export async function moveTask(id: string, column: TaskColumn, profileId: string, worktree: boolean) {
  const task = app.tasks.find((t) => t.id === id)
  if (!task || task.column === column || starting.has(id)) return
  let chatId = task.chatId && chatById(task.chatId) ? task.chatId : undefined
  if (column === 'doing' && !chatId) {
    starting.add(id)
    try {
      chatId = await addChat(task.projectId, profileId, undefined, worktree)
    } finally {
      starting.delete(id)
    }
    if (!chatId) return
    // Nome provisório: o título da sessão do Claude assume quando chegar.
    updateChat(chatId, { name: shortName(task.text) })
    app.pendingPrompt[chatId] = task.text
  }
  app.tasks = app.tasks.map((t) => (t.id === id ? { ...t, column, chatId } : t))
}

/** O agente da tarefa terminou de responder: a tarefa vai para revisão. */
export function onTaskStatus(chatId: string, previous: Status | undefined, status: Status) {
  // Enquanto o prompt da tarefa não foi enviado, o idle é só o agente abrindo.
  if ((previous !== 'running' && previous !== 'waiting') || status !== 'idle' || app.pendingPrompt[chatId]) return
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
  if (ids.length === 0) {
    app.groups = app.groups.filter((g) => g.id !== group.id)
    return
  }
  // Uma aba só com todos lado a lado (addChat abriu cada um numa aba própria).
  app.tabs = [...app.tabs.filter((t) => !t.panes.every((p) => ids.includes(p))), { id: uid(), panes: ids, vertical: false }]
  app.activeTab = app.tabs.at(-1)?.id ?? null
  app.active = ids[0]
  return group.id
}

// ---- agente revisor ----

/** O que o revisor deve olhar: a branch do worktree contra a principal, ou só o que não foi commitado. */
function reviewScope(source: Chat, base: string | null): string {
  const pending = 'as mudanças ainda não commitadas (git status, git diff HEAD e os arquivos novos)'
  if (!source.cwd || !source.branch) return pending
  const range = base ? `git diff ${base}...HEAD` : 'git log e git diff contra a branch principal'
  return `os commits da branch ${source.branch} que ainda não estão na principal (${range}) e ${pending}`
}

export const reviewPrompt = (source: Chat, base: string | null) =>
  [
    `Revise as mudanças feitas pelo agente "${source.name}" nesta pasta. Não edite nenhum arquivo: só leia e analise.`,
    `Revise ${reviewScope(source, base)}.`,
    'Procure bugs, casos de borda, problemas de segurança, código fora do padrão do projeto e testes que faltam.',
    'Responda com uma lista numerada da maior para a menor gravidade (alta, média, baixa). Em cada item: arquivo:linha, o problema e a correção sugerida. Se estiver tudo certo, diga isso em uma linha.',
  ].join('\n')

/** Abre ao lado um agente (o primeiro perfil Claude) que revisa as mudanças de outro chat, na mesma pasta. */
export async function startReview(sourceId: string) {
  const source = chatById(sourceId)
  const project = source && projectOf(source)
  if (!source || !project) return fail('Revisão', 'abra um chat de agente primeiro')
  const owner = source.reviewOf ? chatById(source.reviewOf) : source
  if (!owner) return
  const reviewer = app.profiles.find((p) => p.hooks === 'claude') ?? profileOf(owner)
  if (!reviewer?.command.trim()) return fail('Revisão', 'crie um perfil de agente (ex.: claude) em Configurações → Agentes')
  const base = owner.cwd ? await invoke<string | null>('git_branch', { dir: project.path }).catch(() => null) : null
  const chat: Chat = {
    id: uid(),
    name: `revisão: ${owner.name}`,
    profileId: reviewer.id,
    projectId: owner.projectId,
    groupId: owner.groupId,
    cwd: owner.cwd,
    branch: owner.branch,
    reviewOf: owner.id,
    namedByUser: true,
  }
  app.chats.push(chat)
  app.pendingPrompt[chat.id] = reviewPrompt(owner, base)
  openChat(owner.id)
  splitChat(chat.id)
}

/** Manda a última resposta do revisor ao agente que fez as mudanças. */
export function sendReview(reviewerId: string) {
  const reviewer = chatById(reviewerId)
  const owner = reviewer?.reviewOf ? chatById(reviewer.reviewOf) : undefined
  const review = terminals.get(reviewerId)?.lastReply()
  if (!owner || !review) return toast({ tone: 'info', title: 'Nada para enviar', text: 'A revisão ainda não terminou ou o chat original foi fechado.' })
  const result = sendTo(owner.id, `Um revisor analisou as suas mudanças. Corrija o que fizer sentido e diga o que você não corrigiu e por quê:\n\n${review}`)
  if (result === 'closed') {
    openChat(owner.id)
    return toast({ tone: 'warning', title: `${owner.name} está fechado`, text: 'Abri o chat; envie a revisão de novo quando ele estiver pronto.' })
  }
  toast({ tone: 'success', title: result === 'sent' ? `Revisão enviada a ${owner.name}` : `Revisão na fila de ${owner.name}` })
}

/** O revisor terminou: oferece mandar a revisão ao agente original. */
export function onReviewStatus(chatId: string, previous: Status | undefined, status: Status) {
  const chat = chatById(chatId)
  if (!chat?.reviewOf || (previous !== 'running' && previous !== 'waiting') || status !== 'idle' || app.pendingPrompt[chatId]) return
  const owner = chatById(chat.reviewOf)
  if (!owner) return
  toast({
    tone: 'info',
    persistent: true,
    title: `Revisão de ${owner.name} pronta`,
    text: 'Mandar a revisão para o agente corrigir?',
    actions: [
      { label: `Enviar a ${owner.name}`, primary: true, run: () => sendReview(chatId) },
      { label: 'Ver revisão', run: () => openChat(chatId) },
    ],
  })
}

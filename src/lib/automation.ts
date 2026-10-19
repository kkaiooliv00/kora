import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { app, chatById, chatDir, fail, isOpen, projectOf, type Snippet, type Status } from './state.svelte'
import { terminals } from './terminals'
import { splitCommand } from './command'

export function setStatus(id: string, status: Status) {
  const previous = app.status[id]
  if (previous === status) return
  app.status[id] = status
  // O agente terminou o que estava fazendo: hora do próximo prompt da fila.
  if (status === 'idle' && previous === 'running') sendNextQueued(id)
}

function sendNextQueued(id: string) {
  const [next, ...rest] = app.queue[id] ?? []
  const terminal = terminals.get(id)
  if (next === undefined || !terminal) return
  app.queue[id] = rest
  terminal.submit(next)
}

/** Enfileira; se o agente já está parado, envia na hora. */
export function enqueue(id: string, text: string) {
  if (!text.trim()) return
  app.queue[id] = [...(app.queue[id] ?? []), text]
  if (app.status[id] === 'idle') sendNextQueued(id)
}

export function dequeue(id: string, index: number) {
  app.queue[id] = (app.queue[id] ?? []).filter((_, i) => i !== index)
}

export function broadcast(text: string, ids: string[]) {
  if (!text.trim()) return
  ids.forEach((id) => terminals.get(id)?.submit(text))
}

/** Snippets globais + os do projeto do chat em foco. */
export function activeSnippets(): Snippet[] {
  const chat = app.active ? chatById(app.active) : undefined
  const project = chat ? projectOf(chat)?.name : undefined
  return app.settings.snippets.filter((s) => !s.project || s.project === project)
}

export function pasteSnippet(text: string) {
  const terminal = app.active ? terminals.get(app.active) : undefined
  if (!terminal) return fail('Snippet', 'abra um chat primeiro')
  terminal.paste(text)
}

export function openInEditor(path: string | undefined) {
  if (!path) return fail('Editor', 'abra um chat ou escolha um projeto')
  const [program, ...args] = splitCommand(app.settings.editor)
  if (!program) return fail('Editor', 'defina o comando do editor em Configurações')
  invoke('open_in_editor', { program, args, path }).catch((e) => fail('Editor', e))
}

export function openActiveInEditor() {
  const chat = app.active ? chatById(app.active) : undefined
  openInEditor(chat ? chatDir(chat) : app.projects[0]?.path)
}

async function notify(title: string, body: string) {
  try {
    const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted'
    if (granted) sendNotification({ title, body })
  } catch (e) {
    fail('Falha ao notificar', e)
  }
}

/** Status vindo dos hooks do Claude Code; notifica se o chat não está à vista. */
export function onHookStatus(id: string, status: Status) {
  if (!isOpen(id)) return
  const previous = app.status[id]
  setStatus(id, status)
  const chat = chatById(id)
  const unseen = !document.hasFocus() || app.active !== id
  if (!chat || !unseen) return
  if (status === 'waiting') notify(chat.name, 'Aguardando sua interação')
  else if (status === 'idle' && previous === 'running') notify(chat.name, 'Terminou')
}

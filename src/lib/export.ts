import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { chatById, fail, profileOf } from './state.svelte'
import { terminals } from './terminals'
import { toast } from './toasts.svelte'

const SCREEN_LINES = 10_000

/** Exporta a conversa: do log do Claude (completa) ou, nos outros agentes, o que está no terminal aberto. */
export async function exportChat(id: string) {
  const chat = chatById(id)
  if (!chat) return
  try {
    const claude = profileOf(chat)?.hooks === 'claude' && chat.sessionId
    let text: string
    if (claude) {
      text = await invoke<string>('conversation_markdown', { session: chat.sessionId, title: chat.name })
    } else {
      const screen = terminals.get(id)?.read(SCREEN_LINES)
      if (!screen) return fail('Exportar', 'abra o chat primeiro: para este agente o Kora exporta o que está no terminal')
      text = `# ${chat.name}\n\n\`\`\`\n${screen}\n\`\`\`\n`
    }
    const safeName = chat.name.replace(/[\\/:*?"<>|]/g, '-')
    const path = await save({ defaultPath: `${safeName}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (!path) return
    await invoke('save_text', { path, text })
    toast({ tone: 'success', title: 'Conversa exportada', text: path })
  } catch (e) {
    fail('Não foi possível exportar', e)
  }
}

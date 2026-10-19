/** O que outras partes do app podem fazer com um terminal aberto. */
export interface TerminalHandle {
  /** Cola o texto (com bracketed paste quando o programa suporta), sem Enter. */
  paste(text: string): void
  /** Cola e envia (Enter). */
  submit(text: string): void
  /** Teclas cruas para o processo (ex.: responder o pedido de permissão). */
  keys(data: string): void
  /** Últimas `lines` linhas da tela, em texto puro. */
  read(lines: number): string
  /** Id do PTY no backend (medidor de CPU/memória); vazio enquanto o processo não abriu. */
  pty(): number | undefined
}

/** Terminais montados, por id do chat. Cada Terminal.svelte se registra ao montar. */
export const terminals = new Map<string, TerminalHandle>()

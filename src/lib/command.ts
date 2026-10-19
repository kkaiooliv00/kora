/** Separa `codex --model "x y"` em programa + argumentos (aspas simples ou duplas). */
export function splitCommand(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3])
}

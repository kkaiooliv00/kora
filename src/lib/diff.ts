/** Uma linha de diff já com os números de linha do antes/depois. */
export interface DiffLine {
  kind: 'context' | 'add' | 'del' | 'hunk'
  text: string
  oldNo?: number
  newNo?: number
}

export interface DiffFile {
  path: string
  added: number
  removed: number
  binary: boolean
  lines: DiffLine[]
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

/** Interpreta a saída de `git diff --no-color` em arquivos e linhas numeradas. */
export function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = []
  let file: DiffFile | undefined
  let oldNo = 0
  let newNo = 0
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      file = { path: line.split(' b/').at(-1) ?? line, added: 0, removed: 0, binary: false, lines: [] }
      files.push(file)
      continue
    }
    if (!file) continue
    const hunk = HUNK.exec(line)
    if (hunk) {
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      file.lines.push({ kind: 'hunk', text: hunk[3].trim() })
    } else if (line.startsWith('+++ ')) {
      if (line !== '+++ /dev/null') file.path = line.slice(4).replace(/^b\//, '')
    } else if (line.startsWith('--- ') || line.startsWith('index ') || line.startsWith('\\')) {
      continue
    } else if (line.startsWith('Binary files')) {
      file.binary = true
    } else if (line.startsWith('+')) {
      file.added += 1
      file.lines.push({ kind: 'add', text: line.slice(1), newNo: newNo++ })
    } else if (line.startsWith('-')) {
      file.removed += 1
      file.lines.push({ kind: 'del', text: line.slice(1), oldNo: oldNo++ })
    } else if (line.startsWith(' ')) {
      file.lines.push({ kind: 'context', text: line.slice(1), oldNo: oldNo++, newNo: newNo++ })
    }
  }
  return files
}

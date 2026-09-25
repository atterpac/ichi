export type ReviewLine = {
  id: string
  kind: 'context' | 'add' | 'del'
  text: string
  old: number | null
  next: number | null
}
export type ReviewHunk = { id: string; title: string; start: number; lines: ReviewLine[] }
export type ReviewFile = { path: string; summary: string; hunks: ReviewHunk[] }

function hunk(id: string, title: string, start: number, source: string[]): ReviewHunk {
  let old = start
  let next = start
  return {
    id,
    title,
    start,
    lines: source.map((line, i) => ({
      id: `${id}-${i}`,
      kind: line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'context',
      text: line.slice(1),
      old: line[0] === '+' ? null : old++,
      next: line[0] === '-' ? null : next++,
    })),
  }
}
export function reviewSamples(): ReviewFile[] {
  return [
    {
      path: 'src/review/session.ts',
      summary: 'Remember your place, then advance through unreviewed changes.',
      hunks: [
        hunk('cursor', 'Keep the cursor with the file', 12, [
          ' export function openFile(path: string) {',
          '-  activeFile.value = path',
          '-  cursor.value = 0',
          '+  positions.set(activeFile.value, cursor.value)',
          '+  activeFile.value = path',
          '+  cursor.value = positions.get(path) ?? 0',
          '   focusDiff()',
          ' }',
        ]),
        hunk('advance', 'Advance without losing the review trail', 34, [
          ' export function reviewNext() {',
          '-  activeHunk.value += 1',
          '+  reviewed.add(currentHunk.value.id)',
          '+  const next = hunks.findIndex(hunk => !reviewed.has(hunk.id))',
          '+  if (next >= 0) activeHunk.value = next',
          ' }',
        ]),
        hunk('restore', 'Restore a valid line after refresh', 57, [
          ' export function restoreCursor(lines: ReviewLine[]) {',
          '-  cursor.value = savedPosition',
          '+  const lastLine = Math.max(0, lines.length - 1)',
          '+  cursor.value = Math.min(savedPosition, lastLine)',
          '   scrollToCursor()',
          ' }',
        ]),
      ],
    },
    {
      path: 'src/theme/review.css',
      summary: 'Reserve the accent for the cursor; let the code stay quiet.',
      hunks: [
        hunk('paint', 'Give additions a quieter surface', 8, [
          ' .review-line.add {',
          '-  background: var(--positive-soft);',
          '+  background: transparent;',
          '+  border-inline-start: 2px solid var(--positive-text);',
          ' }',
        ]),
        hunk('focus', 'Make keyboard focus unmistakable', 24, [
          ' .review-line.current {',
          '-  opacity: 0.8;',
          '+  background: var(--selected);',
          '+  box-shadow: inset 2px 0 var(--accent);',
          ' }',
        ]),
      ],
    },
    {
      path: 'src/review/legacy.ts',
      summary: 'Remove the old automatic staging shortcut.',
      hunks: [
        hunk('delete', 'Retire automatic staging', 1, [
          '-export function stageOnOpen(path: string) {',
          '-  stageFile(path)',
          '-}',
        ]),
      ],
    },
  ]
}

/** A removed line maps to the next surviving line, then the previous one. */
export function editorLine(hunk: ReviewHunk, line: ReviewLine): number | null {
  const index = hunk.lines.findIndex((item) => item.id === line.id)
  return (
    line.next ??
    hunk.lines.slice(index + 1).find((item) => item.next !== null)?.next ??
    hunk.lines
      .slice(0, index)
      .reverse()
      .find((item) => item.next !== null)?.next ??
    null
  )
}

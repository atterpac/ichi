import { describe, expect, it } from 'vitest'
import { worktreeFiles, summaryDeltas } from '../components/graph/worktreeHeat'
import {
  FileDelta,
  StatusEntry,
} from '../bindings/github.com/atterpac/ichi/internal/git'
describe('working tree heatmap counts', () => {
  it('combines staged and unstaged counts for a partially staged file without duplicating it', () => {
    const diff = new FileDelta({ Path: 'src/app.ts', Added: 1, Deleted: 1 })
    const counts = summaryDeltas([diff], [diff])
    const files = worktreeFiles(
      [new StatusEntry({ Path: 'src/app.ts', IndexStatus: 1, WorkStatus: 1 })],
      counts,
    )
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({
      known: true,
      added: 2,
      removed: 2,
      state: 'Partially staged',
      key: 'u:src/app.ts',
    })
  })
  it('does not invent zero-line totals for binary, untracked, or missing diffs', () => {
    const counts = summaryDeltas([new FileDelta({ Path: 'image.png', Binary: true })], [])
    const files = worktreeFiles(
      [
        new StatusEntry({ Path: 'image.png', WorkStatus: 1 }),
        new StatusEntry({ Path: 'new.ts', IsUntracked: true }),
        new StatusEntry({ Path: 'missing.ts', WorkStatus: 1 }),
      ],
      counts,
    )
    expect(files.every((file) => !file.known)).toBe(true)
    expect(files.find((file) => file.path === 'image.png')?.binary).toBe(true)
  })
})

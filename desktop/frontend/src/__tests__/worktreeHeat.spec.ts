import { describe, expect, it } from 'vitest'
import { worktreeFiles, tallyWorktreeDiffs } from '../components/graph/worktreeHeat'
import {
  FileDiff,
  DiffHunk,
  DiffLine,
  StatusEntry,
  LineType,
} from '../bindings/github.com/atterpac/ichi/internal/git'
describe('working tree heatmap counts', () => {
  it('combines staged and unstaged counts for a partially staged file without duplicating it', () => {
    const diff = new FileDiff({
      Path: 'src/app.ts',
      Hunks: [
        new DiffHunk({
          Lines: [
            new DiffLine({ Type: LineType.LineAdded }),
            new DiffLine({ Type: LineType.LineRemoved }),
          ],
        }),
      ],
    })
    const counts = tallyWorktreeDiffs([diff], [diff])
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
    const counts = tallyWorktreeDiffs([new FileDiff({ Path: 'image.png', Binary: true })], [])
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

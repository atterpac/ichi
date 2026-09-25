import {
  FileStatus,
  LineType,
  type FileDiff,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'
export type WorktreeDelta = { added: number; removed: number; binary: boolean }
export type WorktreeDeltas = Record<string, WorktreeDelta>
export function tallyWorktreeDiffs(
  working: (FileDiff | null)[],
  staged: (FileDiff | null)[],
): WorktreeDeltas {
  const out: WorktreeDeltas = {}
  for (const [prefix, files] of [
    ['u', working],
    ['s', staged],
  ] as const) {
    for (const file of files) {
      if (!file) continue
      const count = { added: 0, removed: 0, binary: file.Binary }
      for (const hunk of file.Hunks)
        for (const line of hunk?.Lines ?? []) {
          if (line?.Type === LineType.LineAdded) count.added++
          if (line?.Type === LineType.LineRemoved) count.removed++
        }
      out[`${prefix}:${file.Path}`] = count
    }
  }
  return out
}
export function worktreeFiles(entries: StatusEntry[], deltas: WorktreeDeltas) {
  return entries
    .map((entry) => {
      const staged =
        !entry.IsUntracked && !entry.IsConflict && entry.IndexStatus !== FileStatus.FileUnchanged
      const pending =
        entry.IsUntracked || entry.IsConflict || entry.WorkStatus !== FileStatus.FileUnchanged
      const parts = [
        pending && deltas[`u:${entry.Path}`],
        staged && deltas[`s:${entry.Path}`],
      ].filter((part): part is WorktreeDelta => !!part)
      const binary = parts.some((part) => part.binary)
      const known =
        !entry.IsUntracked &&
        !entry.IsConflict &&
        !binary &&
        (!pending || !!deltas[`u:${entry.Path}`]) &&
        (!staged || !!deltas[`s:${entry.Path}`])
      const slash = entry.Path.lastIndexOf('/')
      const status = entry.IsConflict
        ? FileStatus.FileConflict
        : entry.IsUntracked
          ? FileStatus.FileUntracked
          : pending
            ? entry.WorkStatus
            : entry.IndexStatus
      const letters: Record<number, string> = {
        [FileStatus.FileAdded]: 'A',
        [FileStatus.FileModified]: 'M',
        [FileStatus.FileDeleted]: 'D',
        [FileStatus.FileRenamed]: 'R',
        [FileStatus.FileCopied]: 'C',
        [FileStatus.FileConflict]: '!',
        [FileStatus.FileUntracked]: '?',
      }
      return {
        path: entry.Path,
        oldPath: entry.OldPath,
        name: entry.Path.slice(slash + 1),
        dir: slash < 0 ? '.' : entry.Path.slice(0, slash),
        staged,
        pending,
        conflict: entry.IsConflict,
        binary,
        known,
        label: letters[status] ?? 'M',
        state: entry.IsConflict
          ? 'Conflict'
          : entry.IsUntracked
            ? 'Untracked'
            : staged && pending
              ? 'Partially staged'
              : staged
                ? 'Staged'
                : 'Unstaged',
        key: `${entry.IsConflict ? 'c' : pending ? 'u' : 's'}:${entry.Path}`,
        added: parts.reduce((sum, part) => sum + part.added, 0),
        removed: parts.reduce((sum, part) => sum + part.removed, 0),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

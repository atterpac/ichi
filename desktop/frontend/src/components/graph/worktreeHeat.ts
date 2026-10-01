import { fileStatusPresentation } from '../common/fileStatusPresentation'
import {
  FileStatus,
  type FileDelta,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'
export type WorktreeDelta = { added: number; removed: number; binary: boolean }
export type WorktreeDeltas = Record<string, WorktreeDelta>
export function summaryDeltas(
  working: FileDelta[],
  staged: FileDelta[],
): WorktreeDeltas {
  const out: WorktreeDeltas = {}
  for (const [prefix, files] of [
    ['u', working],
    ['s', staged],
  ] as const) {
    for (const file of files) {
      if (!file) continue
      const count = { added: file.Added, removed: file.Deleted, binary: file.Binary }
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
        label: fileStatusPresentation(status).code,
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

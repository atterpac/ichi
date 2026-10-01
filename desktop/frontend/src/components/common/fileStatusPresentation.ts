import { FileStatus } from '../../bindings/github.com/atterpac/ichi/internal/git'

export type StatusTone = 'warning' | 'positive' | 'negative' | 'accent' | 'neutral'
export type StatusPresentation = { code: string; label: string; tone: StatusTone; color: string }

const statuses: Record<FileStatus, StatusPresentation> = {
  [FileStatus.FileUnchanged]: { code: '–', label: 'Unchanged', tone: 'neutral', color: 'var(--text-mut)' },
  [FileStatus.FileModified]: { code: 'M', label: 'Modified', tone: 'warning', color: 'var(--orange)' },
  [FileStatus.FileAdded]: { code: 'A', label: 'Added', tone: 'positive', color: 'var(--green)' },
  [FileStatus.FileDeleted]: { code: 'D', label: 'Deleted', tone: 'negative', color: 'var(--red)' },
  [FileStatus.FileRenamed]: { code: 'R', label: 'Renamed', tone: 'accent', color: 'var(--purple)' },
  [FileStatus.FileCopied]: { code: 'C', label: 'Copied', tone: 'accent', color: 'var(--cyan)' },
  [FileStatus.FileUntracked]: { code: '?', label: 'Untracked', tone: 'warning', color: 'var(--text-mut)' },
  [FileStatus.FileIgnored]: { code: 'I', label: 'Ignored', tone: 'neutral', color: 'var(--text-mut)' },
  [FileStatus.FileConflict]: { code: '!', label: 'Conflict', tone: 'negative', color: 'var(--red)' },
}

const unknown: StatusPresentation = { code: '?', label: 'Unknown status', tone: 'neutral', color: 'var(--text-mut)' }
const byCode = new Map(Object.values(statuses).map(status => [status.code, status]))
byCode.set('·', statuses[FileStatus.FileUnchanged])

/** Display policy only; staged/working/conflict precedence belongs to the caller. */
export function fileStatusPresentation(status: FileStatus | string): StatusPresentation {
  return (typeof status === 'number' ? statuses[status] : byCode.get(status)) ?? unknown
}

import { describe, expect, it } from 'vitest'
import { FileStatus } from '../bindings/github.com/atterpac/ichi/internal/git'
import { fileStatusPresentation } from '../components/common/fileStatusPresentation'

describe('file status presentation', () => {
  it.each([
    [FileStatus.FileUnchanged, '–', 'Unchanged', 'neutral'],
    [FileStatus.FileModified, 'M', 'Modified', 'warning'],
    [FileStatus.FileAdded, 'A', 'Added', 'positive'],
    [FileStatus.FileDeleted, 'D', 'Deleted', 'negative'],
    [FileStatus.FileRenamed, 'R', 'Renamed', 'accent'],
    [FileStatus.FileCopied, 'C', 'Copied', 'accent'],
    [FileStatus.FileUntracked, '?', 'Untracked', 'warning'],
    [FileStatus.FileIgnored, 'I', 'Ignored', 'neutral'],
    [FileStatus.FileConflict, '!', 'Conflict', 'negative'],
  ] as const)('maps enum %s and its status code consistently', (status, code, label, tone) => {
    expect(fileStatusPresentation(status)).toMatchObject({ code, label, tone })
    expect(fileStatusPresentation(code)).toEqual(fileStatusPresentation(status))
  })
  it('uses explicit unknown status and accepts the legacy unchanged marker', () => {
    expect(fileStatusPresentation(999 as FileStatus)).toMatchObject({ label: 'Unknown status', tone: 'neutral' })
    expect(fileStatusPresentation('future')).toEqual(fileStatusPresentation(999 as FileStatus))
    expect(fileStatusPresentation('·')).toEqual(fileStatusPresentation(FileStatus.FileUnchanged))
  })
})

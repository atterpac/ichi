import { describe, expect, it } from 'vitest'
import { FileStatus, StatusEntry } from '../bindings/github.com/atterpac/ichi/internal/git'
import { buildChangeList, changeRows, changeTreeScope, fallbackChangeKey, indexPaths } from '../components/status/changeTreeModel'

const entry = (Path: string, overrides: Partial<StatusEntry> = {}) => new StatusEntry({ Path, WorkStatus: FileStatus.FileModified, ...overrides })
const options = { grouped: true, collapsedSections: new Set<'staged'>(), collapsedDirs: new Set<string>() }

describe('change tree model', () => {
  it('keeps partially staged selections distinct and excludes conflicts from staging', () => {
    const groups = changeRows([
      entry('partial.ts', { IndexStatus: FileStatus.FileAdded }),
      entry('conflict.ts', { IsConflict: true }),
      entry('new.ts', { IsUntracked: true }),
    ])
    expect(groups.unstaged.map(row => row.key)).toEqual(['u:partial.ts', 'u:new.ts'])
    expect(groups.staged.map(row => row.key)).toEqual(['s:partial.ts'])
    expect(groups.conflicts.map(row => row.key)).toEqual(['c:conflict.ts'])
    expect(groups.unstaged[1]?.label).toBe('?')
  })

  it('compacts directory chains and assigns cursor indices only to visible files', () => {
    const groups = changeRows([entry('src/deep/b.ts'), entry('src/deep/a.ts'), entry('README.md')])
    const model = buildChangeList(groups, { ...options, collapsedDirs: new Set(['unstaged:src/deep']) })
    expect(model.visible.map(row => row.path)).toEqual(['README.md'])
    expect(model.sections[0]?.groups?.[0]).toMatchObject({ kind: 'dir', label: 'src/deep', collapsed: true, count: 2 })
    expect(model.sections[0]?.groups?.[model.sections[0]!.groups!.length - 1]).toMatchObject({ kind: 'file', index: 0, parentKey: 'dir:unstaged:.' })
    expect(buildChangeList(groups, { ...options, collapsedSections: new Set(['unstaged']) }).visible).toEqual([])
  })

  it('resolves directory targets even when collapsed, without including root siblings', () => {
    const groups = changeRows([entry('src/a.ts'), entry('src-old/b.ts'), entry('README.md')])
    expect(changeTreeScope('dir:unstaged:src', groups)?.targets.map(row => row.path)).toEqual(['src/a.ts'])
    expect(changeTreeScope('dir:unstaged:.', groups)?.targets.map(row => row.path)).toEqual(['README.md'])
    expect(changeTreeScope('section:unstaged', groups)?.targets).toHaveLength(3)
    expect(changeTreeScope('u:src/a.ts', groups)).toBeNull()
  })

  it('stages both rename paths, deduplicating them, without including a copy source', () => {
    const groups = changeRows([
      entry('new.ts', { OldPath: 'old.ts', WorkStatus: FileStatus.FileRenamed }),
      entry('copy.ts', { OldPath: 'old.ts', WorkStatus: FileStatus.FileCopied }),
    ])
    expect(indexPaths([...groups.unstaged, groups.unstaged[0]!])).toEqual(['old.ts', 'new.ts', 'copy.ts'])
  })

  it('restores the same key, then the nearest surviving row in the same section', () => {
    const groups = changeRows([entry('a.ts'), entry('b.ts'), entry('c.ts'), entry('staged.ts', { IndexStatus: FileStatus.FileAdded, WorkStatus: FileStatus.FileUnchanged })])
    const previous = [...groups.unstaged, ...groups.staged]
    expect(fallbackChangeKey(previous, previous, 'u:b.ts')).toBe('u:b.ts')
    expect(fallbackChangeKey(previous, previous.filter(row => row.path !== 'b.ts'), 'u:b.ts')).toBe('u:c.ts')
    expect(fallbackChangeKey(previous, [previous[0]!], 'u:b.ts')).toBe('u:a.ts')
    expect(fallbackChangeKey(previous, groups.staged, 'u:b.ts')).toBeUndefined()
  })
})

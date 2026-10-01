import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorktreeSnapshot, RepoInfo } from '../bindings/github.com/atterpac/ichi/desktop/services'
import { FileDiff, WorktreeSummary } from '../bindings/github.com/atterpac/ichi/internal/git'
import { changesCacheGeneration, invalidateChangesSnapshots, peekChangesSnapshot, saveChangesSnapshot } from '../components/status/changesSnapshotCache'
const snapshot = (path: string) => new WorktreeSnapshot({ Info: new RepoInfo({ Path: path }), Summary: new WorktreeSummary() })
const save = (path: string, version = changesCacheGeneration(), diff: FileDiff | null = null) => saveChangesSnapshot(path, snapshot(path), 'u:file', diff, version)
beforeEach(invalidateChangesSnapshots)
describe('Changes navigation cache', () => {
  it('isolates repositories and retains at most four with LRU eviction', () => {
    for (const path of ['a','b','c','d']) save(path)
    expect(peekChangesSnapshot('missing')).toBeNull()
    peekChangesSnapshot('a')
    save('e')
    expect(peekChangesSnapshot('b')).toBeNull()
    expect(peekChangesSnapshot('a')?.selection).toBe('u:file')
    saveChangesSnapshot('wrong', snapshot('a'), '', null, changesCacheGeneration())
    expect(peekChangesSnapshot('wrong')).toBeNull()
  })
  it('expires old data and rejects writes from invalidated generations', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
    try {
      save('a')
      clock.mockReturnValue(61_001)
      expect(peekChangesSnapshot('a')).toBeNull()
      const generation = changesCacheGeneration()
      save('b')
      invalidateChangesSnapshots()
      save('a', generation)
      expect(peekChangesSnapshot('a')).toBeNull()
      expect(peekChangesSnapshot('b')).toBeNull()
    } finally { clock.mockRestore() }
  })
  it('bounds retained bytes globally and skips oversized previews', () => {
    const large = new FileDiff({ Path: 'x'.repeat(2_200_000) })
    save('a', changesCacheGeneration(), large)
    save('b', changesCacheGeneration(), large)
    expect(peekChangesSnapshot('a')).toBeNull()
    expect(peekChangesSnapshot('b')).not.toBeNull()
    save('huge', changesCacheGeneration(), new FileDiff({ Path: 'x'.repeat(5_000_000) }))
    expect(peekChangesSnapshot('huge')).toBeNull()
  })
})

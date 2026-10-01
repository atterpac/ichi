import { describe, expect, it, vi } from 'vitest'
import { FileDiff } from '../bindings/github.com/atterpac/ichi/internal/git'
import { createFileDiffCache, type DiffTarget } from '../components/status/fileDiffCache'

const target = (path: string, staged = false): DiffTarget => ({
  path,
  oldPath: '',
  staged,
  untracked: false,
})
const patch = (path: string) => new FileDiff({ Path: path })

describe('selected file diff cache', () => {
  it('deduplicates reads, caches empty patches, and separates index/worktree versions', async () => {
    const read = vi.fn<(row: DiffTarget) => Promise<FileDiff | null>>(async (row) =>
      row.staged ? null : patch(row.path),
    )
    const cache = createFileDiffCache(read)
    const a = target('file')
    await Promise.all([cache.get(a), cache.get(a)])
    await cache.get(a)
    await cache.get(target('file', true))
    await cache.get(target('file', true))
    expect(read).toHaveBeenCalledTimes(2)
    expect(cache.peek(target('file', true))).toBeNull()
  })

  it('bounds retained entries and bytes, with LRU eviction', async () => {
    const read = vi.fn<(row: DiffTarget) => Promise<FileDiff | null>>(async (row) =>
      patch(row.path),
    )
    const cache = createFileDiffCache(read, 2, 1024)
    await cache.get(target('a'))
    await cache.get(target('b'))
    cache.peek(target('a'))
    await cache.get(target('c'))
    expect(cache.peek(target('b'))).toBeUndefined()
    expect(cache.peek(target('a'))).toBeDefined()
    const limited = createFileDiffCache(read, 40, 300)
    await limited.get(target('a'))
    await limited.get(target('b'))
    expect(limited.peek(target('a'))).toBeUndefined()
    await limited.get(target('x'.repeat(500)))
    expect(limited.peek(target('x'.repeat(500)))).toBeUndefined()
  })

  it('does not repopulate a refreshed cache from an older response', async () => {
    let finish!: (value: FileDiff) => void
    const read = vi
      .fn<(row: DiffTarget) => Promise<FileDiff>>()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce(patch('new'))
    const cache = createFileDiffCache(read)
    const old = cache.get(target('a'))
    await Promise.resolve()
    cache.clear()
    const fresh = await cache.get(target('a'))
    finish(patch('old'))
    await old
    expect(cache.peek(target('a'))).toBe(fresh)
    expect(fresh?.Path).toBe('new')
  })

  it('retries errors instead of caching them', async () => {
    const read = vi
      .fn<(row: DiffTarget) => Promise<FileDiff>>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(patch('a'))
    const cache = createFileDiffCache(read)
    await expect(cache.get(target('a'))).rejects.toThrow('failed')
    await expect(cache.get(target('a'))).resolves.toMatchObject({ Path: 'a' })
  })
})

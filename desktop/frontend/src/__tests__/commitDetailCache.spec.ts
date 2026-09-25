import { describe, it, expect, vi } from 'vitest'
import { createCommitDetailCache } from '../components/graph/commitDetailCache'
import { CommitDetail } from '../bindings/github.com/atterpac/ichi/internal/git'

describe('commit detail cache', () => {
  it('shares pending requests and evicts the least recently used entry', async () => {
    const fetch = vi.fn(async (hash: string) => new CommitDetail({ Hash: hash }))
    const cache = createCommitDetailCache(fetch, 2)
    const first = cache.get('a')
    expect(cache.get('a')).toBe(first)
    await first
    await cache.get('b')
    cache.peek('a')
    await cache.get('c')
    expect(cache.peek('b')).toBeNull()
    expect(cache.peek('a')?.Hash).toBe('a')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
  it('expires mutable metadata and does not retain failures', async () => {
    let now = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const fetch = vi.fn(async () => new CommitDetail())
      const cache = createCommitDetailCache(fetch, 2, 100)
      await cache.get('a')
      now = 101
      expect(cache.peek('a')).toBeNull()
      fetch.mockRejectedValueOnce(new Error('unavailable'))
      await expect(cache.get('a')).rejects.toThrow('unavailable')
      await cache.get('a')
      expect(fetch).toHaveBeenCalledTimes(3)
    } finally {
      clock.mockRestore()
    }
  })
  it('does not populate a new cache generation from an old request', async () => {
    let resolve!: (value: CommitDetail) => void
    const cache = createCommitDetailCache(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = cache.get('a')
    await Promise.resolve()
    cache.clear()
    resolve(new CommitDetail({ Hash: 'a' }))
    await pending
    expect(cache.peek('a')).toBeNull()
  })
})

import { describe, it, expect, vi } from 'vitest'
import {
  clearSharedCommitDetails,
  createCommitDetailCache,
} from '../components/graph/commitDetailCache'
import { CommitDetail } from '../bindings/github.com/atterpac/ichi/internal/git'
import { ChangedFile } from '../bindings/github.com/atterpac/ichi/internal/git'

describe('commit detail cache', () => {
  it('keeps an 8,000-file immutable commit across minute-long revisits within the byte budget', async () => {
    let now = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const detail = new CommitDetail({ Hash: 'large', Files: Array.from({ length: 8000 }, (_, index) =>
      new ChangedFile({ Path: `src/file-${index}.ts`, Insertions: 250 })) })
    const fetch = vi.fn<(hash: string) => Promise<CommitDetail>>(async () => detail)
    const cache = createCommitDetailCache(fetch)
    try {
      await cache.get('large')
      now = 120_000
      expect(await cache.get('large')).toBe(detail)
      expect(fetch).toHaveBeenCalledOnce()
    } finally { cache.clear(); clock.mockRestore() }
  })
  it('shares pending requests and evicts the least recently used entry', async () => {
    const fetch = vi.fn<(hash: string) => Promise<CommitDetail>>(
      async (hash) => new CommitDetail({ Hash: hash }),
    )
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
  it('supports explicit expiry and does not retain failures', async () => {
    let now = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const fetch = vi.fn<() => Promise<CommitDetail>>(async () => new CommitDetail())
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

it('reuses core data across views while isolating repository scopes', async () => {
  const fetch = vi.fn<(hash: string) => Promise<CommitDetail>>(
    async (hash) => new CommitDetail({ Hash: hash }),
  )
  const a = createCommitDetailCache(fetch, 80, Infinity, () => '/repo-a')
  a.clear()
  await a.get('same')
  a.cancelPending()
  const revisit = createCommitDetailCache(fetch, 80, Infinity, () => '/repo-a')
  await revisit.get('same')
  expect(fetch).toHaveBeenCalledTimes(1)
  const b = createCommitDetailCache(fetch, 80, Infinity, () => '/repo-b')
  expect(b.peek('same')).toBeNull()
  await b.get('same')
  expect(fetch).toHaveBeenCalledTimes(2)
  b.clear()
})

it('cancels obsolete work and prevents late responses from filling the cache', async () => {
  let resolve!: (detail: CommitDetail) => void
  const cancel = vi.fn<() => void>()
  const fetch = vi.fn<() => Promise<CommitDetail> & { cancel: () => void }>(() =>
    Object.assign(
      new Promise<CommitDetail>((done) => {
        resolve = done
      }),
      { cancel },
    ),
  )
  const cache = createCommitDetailCache(fetch)
  const old = cache.get('old')
  await Promise.resolve()
  cache.cancelPending()
  expect(cancel).toHaveBeenCalledOnce()
  resolve(new CommitDetail({ Hash: 'old' }))
  await old
  expect(cache.peek('old')).toBeNull()
  // A cancelled read of this hash can be requested again.
  const retry = cache.get('old')
  await Promise.resolve()
  resolve(new CommitDetail({ Hash: 'old' }))
  await retry
  expect(cache.peek('old')?.Hash).toBe('old')
})

it('rejects oversized entries and evicts by retained bytes', async () => {
  const small = new CommitDetail({ Hash: 'a' })
  const bytes = JSON.stringify(small).length * 2
  const fetch = vi.fn<(hash: string) => Promise<CommitDetail>>(
    async (hash: string) =>
      new CommitDetail({ Hash: hash, Body: hash === 'large' ? 'x'.repeat(5000) : '' }),
  )
  const cache = createCommitDetailCache(fetch, 80, Infinity, undefined, bytes + 10)
  await cache.get('a')
  await cache.get('b')
  expect(cache.peek('a')).toBeNull()
  expect(cache.peek('b')?.Hash).toBe('b')
  await cache.get('large')
  expect(cache.peek('large')).toBeNull()
  expect(cache.peek('b')).not.toBeNull()
})

it('invalidates only the refreshed repository', async () => {
  const fetch = async (hash: string) => new CommitDetail({ Hash: hash })
  const a = createCommitDetailCache(fetch, 80, 60_000, () => '/refresh-a')
  const b = createCommitDetailCache(fetch, 80, 60_000, () => '/refresh-b')
  a.clear()
  await a.get('same')
  await b.get('same')
  a.clearScope()
  expect(a.peek('same')).toBeNull()
  expect(b.peek('same')).not.toBeNull()
  b.clear()
})

it('does not repopulate app-wide data after disposal from another view’s pending response', async () => {
  let finish!: (detail: CommitDetail) => void
  const cache = createCommitDetailCache(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    80,
    Infinity,
    () => '/disposing',
  )
  const reading = cache.get('old')
  await Promise.resolve()
  clearSharedCommitDetails()
  finish(new CommitDetail({ Hash: 'old' }))
  await reading
  expect(cache.peek('old')).toBeNull()
})

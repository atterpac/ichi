import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { navigationGeneration, invalidateNavigationSnapshots, peekNavigationSnapshot, saveNavigationSnapshot } from '../composables/navigationSnapshots'

beforeEach(() => invalidateNavigationSnapshots())
afterEach(() => vi.useRealTimers())
const save = (path: string, selection = 'main', version = navigationGeneration()) =>
  saveNavigationSnapshot('branches', path, { branches: [], selection }, version)

it('isolates repositories and refuses invalidated reads or missing repository keys', () => {
  const version = navigationGeneration()
  save('/a'); save('/b', 'topic')
  expect(peekNavigationSnapshot('branches', '/a')?.selection).toBe('main')
  expect(peekNavigationSnapshot('branches', '/b')?.selection).toBe('topic')
  invalidateNavigationSnapshots()
  save('/a', 'old', version); save('')
  expect(peekNavigationSnapshot('branches', '/a')).toBeNull()
  expect(peekNavigationSnapshot('branches', '')).toBeNull()
})

it('expires snapshots after sixty seconds without extending their lifetime on reads', () => {
  vi.useFakeTimers()
  save('/a')
  vi.advanceTimersByTime(59_000)
  expect(peekNavigationSnapshot('branches', '/a')).not.toBeNull()
  vi.advanceTimersByTime(1_000)
  expect(peekNavigationSnapshot('branches', '/a')).toBeNull()
})

it('evicts least recently used snapshots at eight entries and rejects oversized data', () => {
  for (let i = 0; i < 8; i++) save(`/${i}`)
  peekNavigationSnapshot('branches', '/0')
  save('/8')
  expect(peekNavigationSnapshot('branches', '/1')).toBeNull()
  expect(peekNavigationSnapshot('branches', '/0')).not.toBeNull()
  save('/huge', 'x'.repeat(6 * 1024 * 1024))
  expect(peekNavigationSnapshot('branches', '/huge')).toBeNull()
})

it('bounds aggregate bytes as well as entry count', () => {
  save('/a', 'a'.repeat(3 * 1024 * 1024))
  save('/b', 'b'.repeat(3 * 1024 * 1024))
  expect(peekNavigationSnapshot('branches', '/a')).toBeNull()
  expect(peekNavigationSnapshot('branches', '/b')).not.toBeNull()
})

it('isolates graph limits and refuses mismatched repository data', () => {
  const snapshot = { info: { Path: '/a' }, layout: { Rows: [] }, selection: 'abc' } as unknown as Parameters<typeof saveNavigationSnapshot<'graph'>>[2]
  saveNavigationSnapshot('graph', '/a', snapshot, navigationGeneration(), 500)
  expect(peekNavigationSnapshot('graph', '/a', 500)?.selection).toBe('abc')
  expect(peekNavigationSnapshot('graph', '/a', 1000)).toBeNull()
  saveNavigationSnapshot('graph', '/b', snapshot, navigationGeneration(), 500)
  expect(peekNavigationSnapshot('graph', '/b', 500)).toBeNull()
})

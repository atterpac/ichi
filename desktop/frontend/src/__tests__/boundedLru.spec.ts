import { describe, expect, it } from 'vitest'
import { createBoundedLru } from '../composables/boundedLru'

describe('bounded completed-data LRU', () => {
  it('promotes reads, replaces sizes, and shares entry and byte budgets', () => {
    const cache = createBoundedLru<string, string>({
      maxEntries: 3,
      maxBytes: 6,
      sizeOf: (value) => value.length,
    })
    cache.set('a', 'aa')
    cache.set('b', 'bb')
    cache.set('c', 'cc')
    expect(cache.get('a')).toBe('aa')
    cache.set('d', 'dd')
    expect(cache.get('b')).toBeUndefined()
    cache.set('a', 'aaaa')
    expect(cache.get('c')).toBeUndefined()
    expect(cache.get('d')).toBe('dd')
    expect(cache.get('a')).toBe('aaaa')
    cache.delete('a')
    cache.set('e', 'eeee')
    expect(cache.get('d')).toBe('dd')
    cache.deleteWhere((key) => key === 'e')
    cache.set('f', 'ffff')
    expect(cache.get('d')).toBe('dd')
    cache.clear()
    cache.set('g', '123456')
    expect(cache.get('g')).toBe('123456')
  })

  it('expires at the boundary, retains fixed deadlines on promotion, and evicts expired data first', () => {
    let now = 0
    const cache = createBoundedLru<string, string>({
      maxEntries: 2,
      maxBytes: 2,
      sizeOf: (value) => value.length,
      ttl: 10,
      now: () => now,
    })
    cache.set('a', 'a')
    now = 5
    cache.set('b', 'b')
    cache.get('a')
    now = 10
    cache.set('c', 'c')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe('b')
    now = 15
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('c')).toBe('c')
  })

  it('rejects oversize replacements and disabled budgets without retaining obsolete values', () => {
    const cache = createBoundedLru<string, string | null>({
      maxEntries: 2,
      maxBytes: 4,
      sizeOf: (value) => value?.length ?? 0,
    })
    cache.set('a', 'a')
    cache.set('b', null)
    cache.set('a', '12345')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeNull()
    cache.set('c', 'c', { maxEntries: 0, maxBytes: 4 })
    expect(cache.get('c')).toBeUndefined()
    cache.set('c', 'c', { maxEntries: 2, maxBytes: 0 })
    expect(cache.get('c')).toBeUndefined()
  })
})

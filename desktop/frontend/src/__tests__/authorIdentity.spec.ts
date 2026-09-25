import { describe, expect, it, vi } from 'vitest'
import { resolveCommitAvatarHash } from '../components/graph/authorIdentity'
const lookup = vi.hoisted(() => vi.fn())
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({ GraphService: { AuthorAvatarHashes: lookup } }))

describe('shared author attribution', () => {
  it('batches author displays and reuses commit identities', async () => {
    const first = 'a'.repeat(40), second = 'b'.repeat(40)
    lookup.mockResolvedValue({ [first]: 'one', [second]: 'two' })
    const requests = [resolveCommitAvatarHash(first), resolveCommitAvatarHash(second), resolveCommitAvatarHash(first)]
    expect(await Promise.all(requests)).toEqual(['one', 'two', 'one'])
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith([first, second])
    expect(await resolveCommitAvatarHash(first)).toBe('one')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(await resolveCommitAvatarHash('0'.repeat(40))).toBe('')
  })
})

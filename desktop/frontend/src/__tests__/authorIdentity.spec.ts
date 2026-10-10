import { describe, expect, it, vi } from 'vitest'
import { resolveCommitAvatarURL } from '../components/graph/authorIdentity'
const lookup = vi.hoisted(() => vi.fn<(commits: string[]) => Promise<Record<string, string>>>())
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  GraphService: { AuthorAvatarURLs: lookup },
}))

describe('shared author attribution', () => {
  it('batches author displays and reuses commit identities', async () => {
    const first = 'a'.repeat(40),
      second = 'b'.repeat(40)
    lookup.mockResolvedValue({ [first]: 'one', [second]: 'two' })
    const requests = [
      resolveCommitAvatarURL(first),
      resolveCommitAvatarURL(second),
      resolveCommitAvatarURL(first),
    ]
    expect(await Promise.all(requests)).toEqual(['one', 'two', 'one'])
    expect(lookup).toHaveBeenCalledExactlyOnceWith([first, second])
    expect(await resolveCommitAvatarURL(first)).toBe('one')
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(await resolveCommitAvatarURL('0'.repeat(40))).toBe('')
  })
})

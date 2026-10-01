import { afterEach, describe, expect, it, vi } from 'vitest'
import { authorInitials, gravatarURL, loadAuthorAvatar } from '../components/graph/authorAvatars'

afterEach(() => vi.unstubAllGlobals())

describe('author avatars', () => {
  it('creates local initials for missing images and only accepts hashed identifiers', () => {
    expect(authorInitials('Ada Lovelace')).toBe('AL')
    expect(authorInitials('alice')).toBe('AL')
    expect(authorInitials('')).toBe('?')
    expect(gravatarURL('author@example.com')).toBeNull()
    expect(gravatarURL('a'.repeat(64))).toBe(`https://www.gravatar.com/avatar/${'a'.repeat(64)}?s=64&d=404&r=g`)
  })

  it('deduplicates image loads and caches missing avatars', async () => {
    let image: { onerror: (() => void) | null; src: string; referrerPolicy: string }
    const constructor = vi.fn<() => { onerror: (() => void) | null; src: string; referrerPolicy: string }>(function () {
      image = { onerror: null, src: '', referrerPolicy: '' }
      return image
    })
    vi.stubGlobal('Image', constructor)
    const first = loadAuthorAvatar('b'.repeat(64))
    const second = loadAuthorAvatar('b'.repeat(64))
    expect(second).toBe(first)
    await Promise.resolve()
    expect(constructor).toHaveBeenCalledTimes(1)
    expect(image!.referrerPolicy).toBe('no-referrer')
    image!.onerror!()
    expect(await first).toBeNull()
    expect(await loadAuthorAvatar('b'.repeat(64))).toBeNull()
    expect(constructor).toHaveBeenCalledTimes(1)
  })
})

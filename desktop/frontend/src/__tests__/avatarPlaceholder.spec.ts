import { describe, expect, it } from 'vitest'
import { isPlaceholderStyle, placeholderStyles, placeholderSvg } from '../components/common/avatarPlaceholder'
import { avatarSvg } from '../sandbox/avatars/generate'

describe('production avatar placeholders', () => {
  it('offers the approved styles and rejects obsolete or malformed settings', () => {
    expect(placeholderStyles.map(style => style.id)).toEqual(['relay', 'spore', 'lumen', 'alley', 'aurora'])
    expect(isPlaceholderStyle('aurora')).toBe(true)
    for (const value of ['wisp', 'sprite', null, undefined, {}, 1]) expect(isPlaceholderStyle(value)).toBe(false)
  })
  it('matches the demo for every production style', () => {
    for (const { id } of placeholderStyles) {
      expect(placeholderSvg('Alex Chen', id)).toBe(avatarSvg('Alex Chen', id))
    }
  })
})

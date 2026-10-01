import { describe, expect, it } from 'vitest'
import { isPlaceholderStyle, placeholderStyles, placeholderSvg } from '../components/common/avatarPlaceholder'
import { avatarSvg } from '../sandbox/avatars/generate'

describe('production avatar placeholders', () => {
  it('offers the approved styles and rejects obsolete or malformed settings', () => {
    expect(placeholderStyles.map(style => style.id)).toEqual(['pixel', 'truchet', 'bauhaus', 'topo', 'face'])
    expect(isPlaceholderStyle('face')).toBe(true)
    for (const value of ['aurora', 'spore', 'wisp', 'sprite', null, undefined, {}, 1]) expect(isPlaceholderStyle(value)).toBe(false)
  })
  it('falls back to the default style for settings saved before a style was retired', () => {
    expect(placeholderSvg('Alex Chen', 'spore' as never)).toBe(placeholderSvg('Alex Chen', 'face'))
  })
  it('produces distinct, valid, mask-edged SVG per style and identity', () => {
    for (const { id } of placeholderStyles) {
      const svg = placeholderSvg('Alex Chen', id)
      expect(placeholderSvg('Alex Chen', id)).toBe(svg)
      expect(placeholderSvg('Mira Chen', id)).not.toBe(svg)
      expect(svg).not.toMatch(/NaN|Infinity|undefined/)
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror')).toBeNull()
      expect(doc.querySelector('mask')).not.toBeNull()
    }
  })
  it('matches the demo for every production style', () => {
    for (const { id } of placeholderStyles) {
      expect(placeholderSvg('Alex Chen', id)).toBe(avatarSvg('Alex Chen', id))
    }
  })
})

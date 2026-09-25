import { describe, expect, it, vi } from 'vitest'
import { drawPlaceholder, isPlaceholderStyle, placeholderStyles, placeholderSvg } from '../components/common/avatarPlaceholder'
import { avatarSvg } from '../sandbox/avatars/generate'

describe('production avatar placeholders', () => {
  it('offers only the four approved choices and rejects obsolete or malformed settings', () => {
    expect(placeholderStyles.map(style => style.id)).toEqual(['relay', 'spore', 'lumen', 'alley'])
    for (const value of ['wisp', 'sprite', null, undefined, {}, 1]) expect(isPlaceholderStyle(value)).toBe(false)
  })
  it('matches the demo and renders bounded colored pixels on graph canvases', () => {
    for (const { id } of placeholderStyles) {
      expect(placeholderSvg('Alex Chen', id)).toBe(avatarSvg('Alex Chen', id))
      const fillRect = vi.fn<(x: number, y: number, width: number, height: number) => void>()
      const ctx = { fillRect, fillStyle: '' } as unknown as CanvasRenderingContext2D
      drawPlaceholder(ctx, 'Alex Chen', id, 10, 20, 20)
      expect(fillRect.mock.calls.length).toBeGreaterThan(50)
      for (const [x, y, width, height] of fillRect.mock.calls as number[][]) {
        expect(x).toBeGreaterThanOrEqual(10)
        expect(y).toBeGreaterThanOrEqual(20)
        expect(x! + width!).toBeLessThanOrEqual(30)
        expect(y! + height!).toBeLessThanOrEqual(40)
      }
    }
  })
})

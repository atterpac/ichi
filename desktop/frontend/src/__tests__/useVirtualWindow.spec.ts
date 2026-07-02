import { describe, expect, it } from 'vitest'
import { computeWindow } from '../composables/useVirtualWindow'

describe('computeWindow', () => {
  it('renders from the top with overscan below', () => {
    const w = computeWindow(0, 600, 20, 10_000, 15)
    expect(w.start).toBe(0)
    expect(w.end).toBe(30 + 15)
    expect(w.offsetY).toBe(0)
    expect(w.totalHeight).toBe(200_000)
  })

  it('windows the middle of the list with overscan both sides', () => {
    const w = computeWindow(10_000, 600, 20, 10_000, 15)
    expect(w.start).toBe(500 - 15)
    expect(w.end).toBe(530 + 15)
    expect(w.offsetY).toBe((500 - 15) * 20)
  })

  it('clamps at the end of the list', () => {
    const w = computeWindow(199_400, 600, 20, 10_000, 15)
    expect(w.end).toBe(10_000)
    expect(w.start).toBeLessThan(10_000)
  })

  it('handles empty lists', () => {
    const w = computeWindow(0, 600, 20, 0, 15)
    expect(w.start).toBe(0)
    expect(w.end).toBe(0)
    expect(w.totalHeight).toBe(0)
  })

  it('handles fractional scroll offsets', () => {
    const w = computeWindow(1234.5, 600, 20, 1000, 5)
    expect(w.start).toBe(Math.floor(1234.5 / 20) - 5)
    expect(w.offsetY).toBe(w.start * 20)
  })
})

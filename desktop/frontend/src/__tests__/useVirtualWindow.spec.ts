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

it('clamps a stale scroll position after the history shrinks', () => {
  expect(computeWindow(100_000, 600, 28, 3, 8)).toEqual({ start: 0, end: 3, offsetY: 0, totalHeight: 84 })
  expect(computeWindow(100_000, 600, 28, 0, 8)).toEqual({ start: 0, end: 0, offsetY: 0, totalHeight: 0 })
})

it('cleans up scroll listeners and queued frames when a late-mounted container is removed', async () => {
  const { defineComponent, ref, nextTick } = await import('vue')
  const { mount } = await import('@vue/test-utils')
  const { vi } = await import('vitest')
  const { useVirtualWindow } = await import('../composables/useVirtualWindow')
  const frames = new Map<number, FrameRequestCallback>()
  const cancel = vi.fn((id: number) => { frames.delete(id) })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(1, callback); return 1 })
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const show = ref(false)
  const component = defineComponent({
    setup() {
      const container = ref<HTMLElement | null>(null)
      const virtual = useVirtualWindow({ container, count: 500, rowHeight: 20 })
      return { show, container, window: virtual.window, jump: virtual.scrollToRow }
    },
    template: '<div v-if="show" ref="container">{{ window.start }}</div>',
  })
  const wrapper = mount(component)
  try {
    show.value = true
    await nextTick()
    wrapper.vm.jump(400)
    await nextTick()
    expect(Number(wrapper.text())).toBeGreaterThan(300)
    const container = wrapper.get('div').element
    container.dispatchEvent(new Event('scroll'))
    expect(frames.size).toBe(1)
    show.value = false
    await nextTick()
    expect(cancel).toHaveBeenCalledWith(1)
    expect(frames.size).toBe(0)
    container.dispatchEvent(new Event('scroll'))
    expect(frames.size).toBe(0)
  } finally { wrapper.unmount(); vi.unstubAllGlobals() }
})

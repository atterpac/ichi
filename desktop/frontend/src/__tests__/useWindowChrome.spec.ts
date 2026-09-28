import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useWindowChrome } from '../composables/useWindowChrome'

const native = vi.hoisted(() => ({
  mac: true,
  fullscreen: vi.fn<() => Promise<boolean>>(),
  listeners: new Map<string, () => void>(),
}))
vi.mock('@wailsio/runtime', () => ({
  System: { IsMac: () => native.mac },
  Window: { IsFullscreen: () => native.fullscreen() },
  Events: { On: (name: string, callback: () => void) => {
    native.listeners.set(name, callback)
    return () => native.listeners.delete(name)
  } },
}))
const Host = defineComponent({
  setup: useWindowChrome,
  template: '<div :data-inset="reserveTrafficLights" />',
})
afterEach(() => { native.mac = true; native.fullscreen.mockReset(); native.listeners.clear() })

describe('native window control spacing', () => {
  it('removes the macOS inset in fullscreen and restores it on exit', async () => {
    native.fullscreen.mockResolvedValue(false)
    const wrapper = mount(Host)
    await flushPromises()
    expect(wrapper.attributes('data-inset')).toBe('true')
    native.fullscreen.mockResolvedValue(true)
    native.listeners.get('common:WindowFullscreen')!()
    await flushPromises()
    expect(wrapper.attributes('data-inset')).toBe('false')
    native.fullscreen.mockResolvedValue(false)
    native.listeners.get('common:WindowUnFullscreen')!()
    await flushPromises()
    expect(wrapper.attributes('data-inset')).toBe('true')
    wrapper.unmount()
    expect(native.listeners.size).toBe(0)
  })

  it('handles a window that starts in fullscreen', async () => {
    native.fullscreen.mockResolvedValue(true)
    const wrapper = mount(Host)
    await flushPromises()
    expect(wrapper.attributes('data-inset')).toBe('false')
    wrapper.unmount()
  })

  it('does not reserve space on other platforms', async () => {
    native.mac = false
    const wrapper = mount(Host)
    await flushPromises()
    expect(wrapper.attributes('data-inset')).toBe('false')
    expect(native.fullscreen).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores a stale startup query after a fullscreen event', async () => {
    let resolveInitial!: (value: boolean) => void
    native.fullscreen.mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve }))
      .mockResolvedValue(true)
    const wrapper = mount(Host)
    native.listeners.get('common:WindowFullscreen')!()
    await flushPromises()
    resolveInitial(false)
    await flushPromises()
    expect(wrapper.attributes('data-inset')).toBe('false')
    wrapper.unmount()
  })
})

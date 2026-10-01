import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ToastSettings from '../components/overlays/ToastSettings.vue'
import ToastViewport from '../components/overlays/ToastViewport.vue'
import { usePreferences, usePreferenceBindings } from '../customization/usePreferences'
import { useToasts, notify, dismissToast } from '../composables/useToasts'

const settings = usePreferenceBindings()
const { toasts } = useToasts()
const wrappers: ReturnType<typeof mount>[] = []
const mountSettings = () => {
  const wrapper = mount(ToastSettings)
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers()

  settings['developer.enabled'] = false
  settings['notifications.style'] = 'dock'
})
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers.length = 0
  while (toasts.length) dismissToast(toasts[0]!.id)
  settings['developer.enabled'] = false
  settings['notifications.style'] = 'dock'
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Toast developer playground', () => {
  it('gates testing behind developer mode and saves the selected design', async () => {
    const wrapper = mountSettings()
    expect(wrapper.find('.toast-designs').exists()).toBe(false)
    await wrapper.find('[role=switch]').trigger('click')
    expect(wrapper.findAll('.toast-design')).toHaveLength(4)
    await wrapper.findAll('.toast-design-choice')[3]!.trigger('click')
    await flushPromises()
    expect(settings['notifications.style']).toBe('bulletin')
    expect(usePreferences().snapshot().user['notifications.style']).toBe('bulletin')
  })

  it('tests tones, actions and persistent duration using the live viewport', async () => {
    settings['developer.enabled'] = true
    const wrapper = mountSettings()
    const viewport = mount(ToastViewport, { global: { stubs: { Teleport: true } } })
    wrappers.push(viewport)
    const selects = wrapper.findAll('select')
    await selects[0]!.setValue('danger')
    await selects[1]!.setValue('long')
    await selects[2]!.setValue('0')
    await wrapper.findAll('.toast-test-buttons button')[0]!.trigger('click')
    expect(toasts[0]?.tone).toBe('danger')
    expect(toasts[0]?.message).toContain('longer sample')
    vi.advanceTimersByTime(20000)
    expect(toasts).toHaveLength(1)
    settings['notifications.style'] = 'capsule'
    await flushPromises()
    expect(viewport.find('.toast-capsule').exists()).toBe(true)
    expect(viewport.find('.toast-placement-capsule').exists()).toBe(true)
    await viewport.find('.toast-action').trigger('click')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.title).toBe('Sample action completed')
    await viewport.find('.toast-close').trigger('click')
    expect(toasts).toHaveLength(0)
  })

  it('clears only samples after reopening settings and can test a full stack', async () => {
    settings['developer.enabled'] = true
    const wrapper = mountSettings()
    await wrapper.findAll('.toast-test-buttons button')[1]!.trigger('click')
    expect(new Set(toasts.map(t => t.tone)).size).toBe(4)
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    const real = notify({ title: 'Real notification', duration: 0 })
    const reopened = mountSettings()
    await reopened.findAll('.toast-test-buttons button')[2]!.trigger('click')
    expect(toasts.map(t => t.id)).toEqual([real])
    await reopened.findAll('.toast-test-buttons button')[0]!.trigger('click')
    await reopened.find('[role=switch]').trigger('click')
    expect(toasts.map(t => t.id)).toEqual([real])
  })

  it('expires timed samples', async () => {
    settings['developer.enabled'] = true
    const wrapper = mountSettings()
    await wrapper.findAll('select')[2]!.setValue('2000')
    await wrapper.findAll('.toast-test-buttons button')[0]!.trigger('click')
    vi.advanceTimersByTime(1999)
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts).toHaveLength(0)
  })
})

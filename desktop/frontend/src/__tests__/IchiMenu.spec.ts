import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Browser, System } from '@wailsio/runtime'
import IchiMenu from '../components/shell/IchiMenu.vue'

vi.mock('@wailsio/runtime', () => ({ Browser: { OpenURL: vi.fn<(url: string) => Promise<void>>() }, System: { IsDesktop: vi.fn<() => boolean>(() => true) } }))
afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = '' })

describe('Ichi resources', () => {
  it('contains focus, closes with Escape, and restores the invoking button', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()
    const wrapper = mount(IchiMenu, { attachTo: document.body })
    await flushPromises()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close About Ichi')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }))
    expect(document.activeElement).toBe(wrapper.findAll('a').slice(-1)[0]?.element)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    expect(document.activeElement).toBe(trigger)
  })

  it('opens release notes in the desktop browser and reports launch errors', async () => {
    vi.mocked(Browser.OpenURL).mockRejectedValueOnce(new Error('Unavailable'))
    const wrapper = mount(IchiMenu)
    await wrapper.find('a').trigger('click')
    await flushPromises()
    expect(Browser.OpenURL).toHaveBeenCalledWith('https://github.com/atterpac/ichi/releases')
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not open your browser')
    wrapper.unmount()
  })

  it('leaves browser-preview links native and dismisses on outside click', async () => {
    vi.mocked(System.IsDesktop).mockReturnValueOnce(false)
    const wrapper = mount(IchiMenu)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.find('a').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(Browser.OpenURL).not.toHaveBeenCalled()
    await wrapper.find('.ichi-menu-backdrop').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})

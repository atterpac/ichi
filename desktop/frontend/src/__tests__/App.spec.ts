import { describe, it, expect, vi } from 'vitest'
vi.mock('../composables/useGitProfiles', () => ({ useGitProfiles: () => ({ state: { profiles: [], warnings: [], syncing: false, syncError: '', error: '', loading: false }, refresh: async () => {}, ready: async () => {}, sync: async () => {}, effective: async () => {} }) }))
import { nextTick } from 'vue'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import { useShellSettings } from '../composables/useShellSettings'

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
}

describe('App', () => {
  it('allows global navigation from buttons and Escape returns to the previous view', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const button = wrapper.findAll('.primary-nav button')[2]!
    await button.trigger('click')
    await button.trigger('keydown', { key: 'g' })
    expect(wrapper.find('.graph-view').exists()).toBe(true)
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.branches-view').exists()).toBe(true)
    wrapper.unmount()
  })

  it('cycles visible panes with F6 even from a text field', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const panes = [document.createElement('section'), document.createElement('section')]
    for (const pane of panes) {
      pane.tabIndex = 0
      pane.dataset.keyboardPane = ''
      pane.getClientRects = () => [{ width: 10, height: 10 }] as unknown as DOMRectList
      wrapper.find('.main-island').element.appendChild(pane)
    }
    const input = document.createElement('input')
    panes[0]!.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(panes[1])
    panes[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(panes[0])
    wrapper.unmount()
  })

  it('mounts renders properly', () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.text()).toContain('Commit Graph')
    expect(wrapper.find('.main-island').exists()).toBe(true)
    expect(wrapper.find('.modeline').exists()).toBe(true)
    wrapper.unmount()
  })

  it('navigates with header buttons and restores the inspector position', async () => {
    const settings = useShellSettings()
    settings.graphDetailPosition = 'bottom'
    const wrapper = mount(App, { attachTo: document.body })
    const toggle = wrapper.find('[aria-controls="commit-inspector"]')
    await toggle.trigger('click')
    expect(settings.graphDetailPosition).toBe('hidden')
    await toggle.trigger('click')
    expect(settings.graphDetailPosition).toBe('bottom')
    await wrapper.findAll('.primary-nav button')[2]!.trigger('click')
    expect(wrapper.find('.primary-nav [aria-current="page"]').text()).toContain('Branches')
    expect(wrapper.find('.branches-view').exists()).toBe(true)
    expect(wrapper.find('[aria-controls="commit-inspector"]').exists()).toBe(false)
    await wrapper.findAll('.primary-nav button')[0]!.trigger('click')
    expect(wrapper.find('.graph-view').exists()).toBe(true)
    wrapper.unmount()
    settings.graphDetailPosition = 'right'
  })

  it('submits the header search and keeps the settings cog', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.find('.titlebar-search input').setValue('graph')
    await wrapper.find('form[role="search"]').trigger('submit')
    expect(wrapper.find('.finderbar').exists()).toBe(true)
    expect((wrapper.find('.fb-query').element as HTMLInputElement).value).toBe('graph')
    expect(wrapper.find('.topbar [aria-label="Settings"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens which-key on space and jumps to the chorded view', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('.whichkey').exists()).toBe(false)

    pressKey(' ')
    await nextTick()
    expect(wrapper.find('.whichkey').exists()).toBe(true)

    pressKey('b')
    await nextTick()
    expect(wrapper.find('.whichkey').exists()).toBe(false)
    expect(wrapper.text()).toContain('Branches')
    wrapper.unmount()
  })

  it('opens the finder omnibar on ctrl+p and closes on escape', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('.finderbar').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true }))
    await nextTick()
    expect(wrapper.find('.finderbar').exists()).toBe(true)
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.finderbar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('dismisses which-key on escape without changing views', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    pressKey(' ')
    await nextTick()
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.whichkey').exists()).toBe(false)
    expect(wrapper.text()).toContain('Commit Graph')
    wrapper.unmount()
  })
  it('opens Pocket with Ctrl+R and opens workspace settings from its footer', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true }))
    await nextTick()
    expect(wrapper.find('.pocket-panel').exists()).toBe(true)
    await wrapper.find('.pocket-panel footer button:last-child').trigger('click')
    expect(wrapper.find('.workspace-settings').exists()).toBe(true)
    expect(wrapper.find('.pocket-panel').exists()).toBe(false)
    wrapper.unmount()
  })

})

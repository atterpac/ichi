import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
}

describe('App', () => {
  it('mounts renders properly', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Commit Graph')
    expect(wrapper.find('.main-island').exists()).toBe(true)
    expect(wrapper.find('.modeline').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens which-key on space and jumps to the chorded view', async () => {
    const wrapper = mount(App)
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

  it('dismisses which-key on escape without changing views', async () => {
    const wrapper = mount(App)
    pressKey(' ')
    await nextTick()
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.whichkey').exists()).toBe(false)
    expect(wrapper.text()).toContain('Commit Graph')
    wrapper.unmount()
  })
})

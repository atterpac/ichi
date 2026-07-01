import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('mounts renders properly', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Commit Graph')
    expect(wrapper.find('.ichi-sidebar').exists()).toBe(true)
    expect(wrapper.find('.main-island').exists()).toBe(true)
  })
})

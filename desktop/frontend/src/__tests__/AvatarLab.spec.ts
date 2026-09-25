import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AvatarLab from '../sandbox/avatars/AvatarLab.vue'
import { avatarStyles, avatarSvg } from '../sandbox/avatars/generate'

describe('deterministic avatars', () => {
  for (const style of avatarStyles) {
    it(`${style.name} is repeatable, varies by identity, and produces valid isolated SVG`, () => {
      const first = avatarSvg('atterpac', style.id)
      expect(avatarSvg('atterpac', style.id)).toBe(first)
      expect(avatarSvg('another-person', style.id)).not.toBe(first)
      const svg = new DOMParser().parseFromString(first, 'image/svg+xml')
      expect(svg.querySelector('parsererror')).toBeNull()
      expect(svg.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 100 100')
      expect(first).not.toMatch(/NaN|Infinity|undefined/)
      expect(avatarSvg('<script>alert(1)</script>', style.id)).not.toContain('<script>')
      expect(avatarSvg('', style.id)).toContain('<svg')
    })
  }
  it('updates all six previews and the selected style in commit context', async () => {
    const wrapper = mount(AvatarLab)
    expect(wrapper.findAll('.style-card')).toHaveLength(4)
    await wrapper.findAll('.collection-tabs button')[1]!.trigger('click')
    expect(wrapper.findAll('.style-card')).toHaveLength(6)
    const before = wrapper.get('.hero-avatar svg').html()
    await wrapper.get('[aria-label="Avatar input"]').setValue('mira.chen')
    expect(wrapper.get('.hero-avatar svg').html()).not.toBe(before)
    await wrapper.get('[aria-label="Select Herbarium"]').trigger('click')
    expect(wrapper.get('.context-intro h2').text()).toContain('Herbarium')
    expect(wrapper.get('.preview-row .avatar-mark').attributes('aria-label')).toContain(
      'plant avatar for mira.chen',
    )
    wrapper.unmount()
  })
})

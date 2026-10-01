import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PreferencesPanel from '../components/overlays/PreferencesPanel.vue'
import { usePreferences } from '../customization/usePreferences'
import { emptyPreferences } from '../customization/document'

beforeEach(() => usePreferences().resetCategory())
describe('searchable preferences', () => {
  it('searches aliases, changes settings, and shows reset provenance', async () => {
    const wrapper = mount(PreferencesPanel)
    try {
      await wrapper.get('[aria-label="Search settings"]').setValue('zoom')
      expect(wrapper.findAll('.preference-row')).toHaveLength(1)
      const row = wrapper.get('[data-preference="appearance.textScale"]')
      expect(row.text()).toContain('App default')
      await row.get('input').setValue('110')
      expect(usePreferences().values.value['appearance.textScale']).toBe(110)
      expect(row.text()).toContain('Your override')
      await row.get('[aria-label="Reset Text scale (%)"]').trigger('click')
      expect(usePreferences().values.value['appearance.textScale']).toBe(100)
      expect(row.text()).toContain('App default')
    } finally {
      wrapper.unmount()
    }
  })
  it('previews imported changes and applies only after the action', async () => {
    const wrapper = mount(PreferencesPanel)
    try {
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Import settings')!
        .trigger('click')
      const document = emptyPreferences()
      document.user['graph.limit'] = 250
      await wrapper.get('textarea').setValue(JSON.stringify(document))
      expect(wrapper.get('.preference-import').text()).toContain('History limit: 120 → 250')
      expect(usePreferences().values.value['graph.limit']).toBe(120)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Apply import')!
        .trigger('click')
      expect(usePreferences().values.value['graph.limit']).toBe(250)
      expect(wrapper.find('.preference-import').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})

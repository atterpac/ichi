import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FileHeatmap from '../components/common/FileHeatmap.vue'

describe('large file heatmaps', () => {
  it('bounds DOM segments while preserving totals and individual keyboard selections', async () => {
    const wrapper = mount(FileHeatmap, { props: {
      files: Array.from({ length: 8000 }, (_, index) => ({ path: `file-${index}.ts`, added: 250, removed: 0, known: true })),
    } })
    try {
      expect(wrapper.findAll('.map-segment')).toHaveLength(160)
      expect(wrapper.get('.map-caption').text()).toContain('250 / 2000000 lines')
      expect(wrapper.get('.map-segment').attributes('aria-label')).toContain('Files 1–50: 12500 additions')
      await wrapper.get('.map-segment').trigger('keydown', { key: 'ArrowRight' })
      expect(wrapper.emitted('select')?.[0]).toEqual(['file-1.ts'])
      await wrapper.setProps({ selectedPath: 'file-1.ts' })
      await wrapper.get('.map-segment').trigger('keydown', { key: 'ArrowRight' })
      expect(wrapper.emitted('select')?.[1]).toEqual(['file-2.ts'])
      await wrapper.get('.map-segment').trigger('keydown', { key: 'End' })
      expect(wrapper.emitted('select')?.[2]).toEqual(['file-7999.ts'])
      await wrapper.setProps({ selectedPath: 'file-7999.ts' })
      const buttons = wrapper.findAll('.map-segment')
      const last = buttons[buttons.length - 1]!
      expect(last.attributes('aria-pressed')).toBe('true')
      await last.trigger('keydown', { key: 'Home' })
      expect(wrapper.emitted('select')?.[3]).toEqual(['file-0.ts'])
    } finally { wrapper.unmount() }
  })
})

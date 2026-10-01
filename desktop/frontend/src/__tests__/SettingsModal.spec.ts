import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import SettingsModal from '../components/overlays/SettingsModal.vue'
import { THEMES } from '../theme/themes'
import { usePreferences } from '../customization/usePreferences'

beforeEach(() => usePreferences().resetCategory())
const mountSettings = (initialCategory: 'appearance' | 'graph' | 'diff') =>
  mount(SettingsModal, {
    props: { initialCategory },
    global: { stubs: { GraphPreview: true, WorkspaceSettings: true, ToastSettings: true } },
  })

describe('visual settings', () => {
  it('shows every theme without a disclosure and applies a selected palette', async () => {
    const wrapper = mountSettings('appearance')
    try {
      const themes = wrapper.findAll('.theme-chip')
      expect(themes).toHaveLength(THEMES.length)
      expect(wrapper.find('.set-disclosure').exists()).toBe(false)
      await themes[1]!.trigger('click')
      expect(usePreferences().values.value['appearance.theme']).toBe(THEMES[1]!.id)
      expect(themes[1]!.attributes('aria-checked')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })
  it('applies illustrated diff choices to the preferences used by the diff view', async () => {
    const wrapper = mountSettings('diff')
    try {
      await wrapper.get('[aria-label="Diff layout"]').findAll('button')[1]!.trigger('click')
      await wrapper.get('[aria-label="Row density"]').findAll('button')[2]!.trigger('click')
      expect(usePreferences().values.value['diff.layout']).toBe('split')
      expect(usePreferences().values.value['diff.density']).toBe('relaxed')
      expect(
        wrapper.get('[aria-label="Diff layout"]').findAll('button')[1]!.attributes('aria-pressed'),
      ).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })
  it('applies graph spacing and panel placement independently', async () => {
    const wrapper = mountSettings('graph')
    try {
      await wrapper.get('[aria-label="Row density"]').findAll('button')[2]!.trigger('click')
      await wrapper.get('[aria-label="Details panel"]').findAll('button')[1]!.trigger('click')
      expect(usePreferences().values.value['graph.rowDensity']).toBe('spacious')
      expect(usePreferences().values.value['graph.detailPosition']).toBe('bottom')
    } finally {
      wrapper.unmount()
    }
  })
  it('keeps unapplied ref edits when switching settings sections', async () => {
    const wrapper = mountSettings('appearance')
    try {
      const category = (label: string) =>
        wrapper.findAll('.set-catitem').find((button) => button.text() === label)!
      await category('Ref labels').trigger('click')
      await flushPromises()
      await wrapper
        .get('[aria-label="compact format preset"] [data-format="{{.Branch}}"]')
        .trigger('click')
      await category('Appearance').trigger('click')
      await category('Ref labels').trigger('click')
      expect(
        wrapper
          .get('[aria-label="compact format preset"] [data-format="{{.Branch}}"]')
          .attributes('aria-pressed'),
      ).toBe('true')
      expect(usePreferences().values.value['graph.refLabels'].kinds.remote.compact).toBe(
        '{{.Name}}',
      )
    } finally {
      wrapper.unmount()
    }
  })
  it('filters the theme gallery without changing the selected theme', async () => {
    const wrapper = mountSettings('appearance')
    try {
      const selected = usePreferences().values.value['appearance.theme']
      const filters = wrapper.get('[aria-label="Theme brightness"]')
      await filters
        .findAll('button')
        .find((button) => button.text() === 'Light')!
        .trigger('click')
      expect(wrapper.findAll('.theme-chip')).toHaveLength(
        THEMES.filter((theme) => theme.light).length,
      )
      expect(usePreferences().values.value['appearance.theme']).toBe(selected)
      await filters
        .findAll('button')
        .find((button) => button.text() === 'All')!
        .trigger('click')
      expect(wrapper.findAll('.theme-chip')).toHaveLength(THEMES.length)
    } finally {
      wrapper.unmount()
    }
  })
  it('searches from the rail and returns to a category with its search cleared', async () => {
    const wrapper = mountSettings('appearance')
    try {
      await wrapper.get('[aria-label="Search settings"]').setValue('zoom')
      expect(wrapper.get('#settings-title').text()).toBe('Search results')
      expect(wrapper.findAll('.preference-row')).toHaveLength(1)
      expect(wrapper.find('[data-preference="appearance.textScale"]').exists()).toBe(true)
      await wrapper
        .findAll('.set-catitem')
        .find((button) => button.text() === 'Graph')!
        .trigger('click')
      expect(wrapper.get('#settings-title').text()).toBe('Graph')
      expect(
        (wrapper.get('[aria-label="Search settings"]').element as HTMLInputElement).value,
      ).toBe('')
      expect(wrapper.find('.graph-settings-preview').exists()).toBe(true)
    } finally {
      wrapper.unmount()
    }
  })
  it('exposes typography controls separately and retains applied values', async () => {
    const wrapper = mountSettings('appearance')
    try {
      await wrapper
        .get('[aria-label="Appearance sections"]')
        .findAll('button')
        .find((button) => button.text() === 'Typography')!
        .trigger('click')
      expect(wrapper.find('.theme-chip-grid').exists()).toBe(false)
      await wrapper.get('input[type="range"]').setValue('110')
      expect(usePreferences().values.value['appearance.textScale']).toBe(110)
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Back to workspace')!
        .trigger('click')
      expect(wrapper.emitted('close')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })
})

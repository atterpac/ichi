import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FontSettings from '../components/overlays/FontSettings.vue'
import { fontChoices } from '../components/overlays/fontCatalog'
import { usePreferences } from '../customization/usePreferences'
const api = vi.hoisted(() => ({
  list: vi.fn<() => Promise<{ Family: string; Monospace: boolean }[]>>(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services/preferencesservice', () => ({
  ListSystemFonts: api.list,
}))
vi.mock('@wailsio/runtime', async (original) => ({
  ...(await original<typeof import('@wailsio/runtime')>()),
  System: { IsDesktop: () => true },
}))
beforeEach(() => {
  usePreferences().resetCategory()
  api.list.mockReset()
  api.list.mockResolvedValue([
    { Family: 'System Sans Test', Monospace: false },
    { Family: 'System Mono Test', Monospace: true },
  ])
})
it('uses grouped selectors and restricts code choices to monospaced fonts', async () => {
  const wrapper = mount(FontSettings)
  try {
    await flushPromises()
    expect(wrapper.get('[aria-label="Interface font"]').element.tagName).toBe('SELECT')
    expect(wrapper.get('[aria-label="Code font"]').text()).toContain('System Mono Test')
    expect(wrapper.get('[aria-label="Code font"]').text()).not.toContain('System Sans Test')
    await wrapper.get('[aria-label="Code font"]').setValue('Fira Code Variable')
    expect(usePreferences().values.value['appearance.codeFont']).toBe('Fira Code Variable')
  } finally {
    wrapper.unmount()
  }
})
it('preserves saved fonts while filtering and deduplicates bundled/system families', () => {
  const choices = fontChoices(
    [{ Family: 'JetBrains Mono', Monospace: true }],
    true,
    'Custom Mono',
    'no match',
  )
  expect(choices.map((font) => font.family)).toEqual(['Custom Mono'])
  expect(
    fontChoices([{ Family: 'JetBrains Mono', Monospace: true }], true, 'JetBrains Mono', '').filter(
      (font) => font.family === 'JetBrains Mono',
    ),
  ).toHaveLength(1)
})
it('refreshes installed families without changing selection and retains bundled fonts on errors', async () => {
  const wrapper = mount(FontSettings)
  try {
    await flushPromises()
    api.list.mockResolvedValueOnce([{ Family: 'Newly Installed', Monospace: true }])
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Refresh system fonts')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="Code font"]').text()).toContain('Newly Installed')
    expect(usePreferences().values.value['appearance.codeFont']).toBe('JetBrains Mono')
    api.list.mockRejectedValueOnce(new Error('unavailable'))
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Refresh system fonts')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Bundled fonts remain available')
    expect(wrapper.get('[aria-label="Interface font"]').text()).toContain('Inter')
  } finally {
    wrapper.unmount()
  }
})

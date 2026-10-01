import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RefLabel from '../components/common/RefLabel.vue'
import RefLabelEditor from '../components/overlays/RefLabelEditor.vue'
import { usePreferences } from '../customization/usePreferences'
import {
  defaultRefLabels,
  refPresentation,
  validateRefLabels,
  type RefLabelConfig,
} from '../customization/refLabels'
import { parsePreferences, emptyPreferences } from '../customization/document'

vi.mock('@wailsio/runtime', () => ({ System: { IsDesktop: () => false } }))

const config = (): RefLabelConfig => JSON.parse(JSON.stringify(defaultRefLabels))
beforeEach(() => usePreferences().resetCategory())
describe('custom ref labels', () => {
  it('distinguishes two cloud remotes and retains nested branch paths and complete accessible names', async () => {
    const prefs = config()
    prefs.remotes.origin = { icon: 'fork', compact: '{{.Branch}}', expanded: '{{.Name}}' }
    prefs.remotes.upstream = { icon: 'cloud', compact: '{{.Branch}}', expanded: '{{.Name}}' }
    usePreferences().set('graph.refLabels', prefs)
    const origin = mount(RefLabel, { props: { name: 'origin/feature/topic', kind: 'remote' } })
    const upstream = mount(RefLabel, { props: { name: 'upstream/feature/topic', kind: 'remote' } })
    expect(origin.get('.ref-name').text()).toBe('feature/topic')
    expect(upstream.get('.ref-name').text()).toBe('feature/topic')
    expect(origin.get('svg').html()).not.toBe(upstream.get('svg').html())
    expect(origin.attributes('title')).toBe('origin/feature/topic')
    expect(origin.get('.ref-sr').text()).toBe('origin/feature/topic')
    await origin.setProps({ expanded: true })
    expect(origin.get('.ref-name').text()).toBe('origin/feature/topic')
    origin.unmount()
    upstream.unmount()
  })
  it('matches the longest explicitly configured remote name and validates imports', () => {
    const prefs = config()
    prefs.remotes['team/origin'] = { icon: 'server', compact: '{{.Branch}}', expanded: '{{.Name}}' }
    const result = refPresentation(prefs, 'team/origin/feature/a', 'remote')
    expect(result.request.Remote).toBe('team/origin')
    expect(result.request.Branch).toBe('feature/a')
    expect(validateRefLabels({ ...prefs, remotes: { origin: { icon: 'unknown' } } })).toContain(
      'supported ref icon',
    )
    const document = emptyPreferences()
    document.user['graph.refLabels'] = prefs
    expect(
      parsePreferences(JSON.stringify(document), true).document.user['graph.refLabels'],
    ).toEqual(prefs)
    expect(validateRefLabels(null)).toContain('Expected')
  })
  it('previews remote edits without applying them, then saves through the shared preference store', async () => {
    const wrapper = mount(RefLabelEditor)
    await flushPromises()
    await wrapper.get('[aria-label="Edit origin"]').trigger('click')
    await wrapper.get('[aria-label="Fork"]').trigger('click')
    await wrapper
      .get('[aria-label="compact format preset"] [data-format="{{.Branch}}"]')
      .trigger('click')
    await flushPromises()
    expect(wrapper.get('.ref-samples').text()).toContain('feature/search')
    expect(usePreferences().values.value['graph.refLabels'].remotes.origin).toBeUndefined()
    const apply = wrapper.findAll('button').find((b) => b.text() === 'Apply ref labels')!
    expect(apply.attributes('disabled')).toBeUndefined()
    await apply.trigger('click')
    await nextTick()
    expect(usePreferences().values.value['graph.refLabels'].remotes.origin?.icon).toBe('fork')
    expect(usePreferences().values.value['graph.refLabels'].remotes.origin?.compact).toBe(
      '{{.Branch}}',
    )
    wrapper.unmount()
  })
  it('keeps unresolved custom templates out of saved settings and discards the draft', async () => {
    const wrapper = mount(RefLabelEditor)
    await flushPromises()
    await wrapper.get('#ref-format-compact').setValue('{{.Missing}}')
    await flushPromises()
    await vi.waitFor(() => expect(wrapper.find('[role="alert"]').exists()).toBe(true))
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === 'Apply ref labels')!
        .attributes('disabled'),
    ).toBeDefined()
    expect(usePreferences().values.value['graph.refLabels'].kinds.remote.compact).toBe('{{.Name}}')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Discard edits')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect((wrapper.get('#ref-format-compact').element as HTMLInputElement).value).toBe('{{.Name}}')
    wrapper.unmount()
  })
  it('edits compact and expanded text independently for the selected remote', async () => {
    const wrapper = mount(RefLabelEditor)
    try {
      await wrapper.get('[aria-label="Edit upstream"]').trigger('click')
      await wrapper
        .get('[aria-label="compact format preset"] [data-format="{{.Branch}}"]')
        .trigger('click')
      await wrapper.get('[aria-label="Label mode"]').findAll('button')[1]!.trigger('click')
      expect(
        wrapper
          .get('[aria-label="expanded format preset"] [data-format="{{.Name}}"]')
          .attributes('aria-pressed'),
      ).toBe('true')
      await wrapper
        .get('[aria-label="expanded format preset"] [data-format="{{.Branch}} · {{.Remote}}"]')
        .trigger('click')
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Apply ref labels')!
        .trigger('click')
      const saved = usePreferences().values.value['graph.refLabels']
      expect(saved.remotes.upstream?.compact).toBe('{{.Branch}}')
      expect(saved.remotes.upstream?.expanded).toBe('{{.Branch}} · {{.Remote}}')
      expect(saved.remotes.origin).toBeUndefined()
      expect(saved.kinds.remote.compact).toBe('{{.Name}}')
    } finally {
      wrapper.unmount()
    }
  })
  it('adds a remote in place and can return it to the shared style', async () => {
    const wrapper = mount(RefLabelEditor)
    try {
      await wrapper.get('[aria-label="New remote name"]').setValue('team/origin')
      await wrapper.get('.remote-add').trigger('submit')
      expect(wrapper.get('[aria-label="Edit team/origin"]').attributes('aria-pressed')).toBe('true')
      await wrapper.get('[aria-label="Fork"]').trigger('click')
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Use shared style')!
        .trigger('click')
      expect(wrapper.get('[aria-label="Cloud"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('[aria-label="Edit team/origin"]').exists()).toBe(true)
      await wrapper
        .get('[aria-label="Remote style"]')
        .findAll('button')
        .find((b) => b.text() === 'All remotes')!
        .trigger('click')
      await wrapper.get('[aria-label="Dot"]').trigger('click')
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Apply ref labels')!
        .trigger('click')
      expect(
        usePreferences().values.value['graph.refLabels'].remotes['team/origin'],
      ).toBeUndefined()
      expect(usePreferences().values.value['graph.refLabels'].kinds.remote.icon).toBe('dot')
    } finally {
      wrapper.unmount()
    }
  })
  it('selects a scope without creating edits and keeps branch edits out of remote styles', async () => {
    const wrapper = mount(RefLabelEditor)
    try {
      await wrapper.get('[aria-label="Edit origin"]').trigger('click')
      await flushPromises()
      expect(
        wrapper
          .findAll('button')
          .find((b) => b.text() === 'Apply ref labels')!
          .attributes('disabled'),
      ).toBeDefined()
      await wrapper.get('[aria-label="Fork"]').trigger('click')
      await wrapper
        .get('[aria-label="Label type"]')
        .findAll('button')
        .find((b) => b.text() === 'Local branches')!
        .trigger('click')
      await wrapper.get('[aria-label="Pin"]').trigger('click')
      await flushPromises()
      await wrapper
        .findAll('button')
        .find((b) => b.text() === 'Apply ref labels')!
        .trigger('click')
      const saved = usePreferences().values.value['graph.refLabels']
      expect(saved.kinds.branch.icon).toBe('pin')
      expect(saved.remotes.origin?.icon).toBe('fork')
      expect(saved.kinds.remote.icon).toBe('cloud')
    } finally {
      wrapper.unmount()
    }
  })
})

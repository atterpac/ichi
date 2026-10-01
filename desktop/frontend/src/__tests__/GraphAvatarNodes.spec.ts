import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GraphSvg from '../components/graph/GraphSvg.vue'
import { usePreferenceBindings } from '../customization/usePreferences'
import type { GraphLayoutRow } from '../bindings/github.com/atterpac/ichi/desktop/services'

const settings = usePreferenceBindings()
const rows = ['head-node', 'merge-node', 'node', 'unstaged-node', 'stash-node'].map(
  (kind, index) => ({
    Commit: { Hash: String(index), Author: `Author ${index}` },
    Lanes: [{ Glyphs: [{ Kind: 'empty' }, { Kind: kind, ColorID: index }] }],
  }),
) as GraphLayoutRow[]
beforeEach(() => {
  settings['graph.authorAvatars'] = true
})
afterEach(() => {
  settings['graph.authorAvatars'] = true
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Graph avatar nodes', () => {
  it('keeps the band endpoint fixed while rails and portraits scroll', async () => {
    const wrapper = mount(GraphSvg, {
      props: {
        rows: [rows[2]!],
        laneCount: 10,
        rowHeight: 42,
        viewportWidth: 160,
        scrollOffset: 0,
      },
      global: { stubs: { AuthorAvatar: true } },
    })
    expect(wrapper.find('.graph-band-edge').attributes('x')).toBe('158')
    expect(wrapper.find('.graph-band-edge').attributes('height')).toBe('38')
    expect(wrapper.find('.graph-avatar-node').attributes('style')).toContain('left: 23px')
    await wrapper.setProps({ scrollOffset: 30 })
    expect(wrapper.find('.graph-lanes').attributes('transform')).toBe('translate(-30 0)')
    expect(wrapper.find('.graph-band-edge').attributes('x')).toBe('158')
    expect(wrapper.find('.graph-band-edge').attributes('height')).toBe('38')
    expect(wrapper.find('.graph-avatar-node').attributes('style')).toContain('left: -7px')
    expect(wrapper.find('.graph-svg').attributes('style')).toContain('width: 160px')
    wrapper.unmount()
  })

  it('places portraits on commit nodes while retaining special markers', async () => {
    const wrapper = mount(GraphSvg, {
      props: { rows, laneCount: 1, rowHeight: 42 },
      global: { stubs: { AuthorAvatar: true } },
    })
    const nodes = wrapper.findAll('.graph-avatar-node')
    expect(nodes).toHaveLength(3)
    expect(nodes[0]!.classes()).toContain('head')
    expect(nodes[1]!.classes()).toContain('merge')
    expect(nodes[0]!.attributes('style')).toContain('left: 23px')
    expect(nodes[1]!.attributes('style')).toContain('top: 63px')
    expect(wrapper.findAll('author-avatar-stub')[2]!.attributes('name')).toBe('Author 2')
    settings['graph.authorAvatars'] = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.graph-avatar-node').exists()).toBe(false)
    wrapper.unmount()
  })
})

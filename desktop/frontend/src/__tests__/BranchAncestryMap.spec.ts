import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BranchAncestryMap from '../components/refs/BranchAncestryMap.vue'
import type { Branch } from '../bindings/github.com/atterpac/ichi/internal/git'

const { load, compare } = vi.hoisted(() => ({ load: vi.fn<(ref: string, limit: number) => Promise<unknown>>(), compare: vi.fn<(from: string, to: string) => Promise<unknown>>() }))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  GraphService: { LoadBranchGraph: load },
  RefService: { BranchDivergence: compare },
}))
const main = { Name: 'main', IsRemote: false } as Branch
const feature = { Name: 'feature' } as Branch
const graph = (hash = 'feature-tip', parents = ['base-full']) => ({
  Rows: [
    { Commit: { Hash: hash, ShortHash: hash, Message: 'Feature work', Parents: parents }, Lanes: [] },
    { Commit: { Hash: 'base-full', ShortHash: 'base', Message: 'Shared history', Parents: [] }, Lanes: [] },
  ], LaneCount: 2,
})
const mountMap = () => mount(BranchAncestryMap, {
  props: { branches: [main, feature], selected: feature },
  global: { stubs: { GraphSvg: true } },
})
beforeEach(() => {
  load.mockReset().mockResolvedValue(graph())
  compare.mockReset().mockResolvedValue({ Base: 'base', AheadA: 2, AheadB: 1 })
})

describe('BranchAncestryMap', () => {
  it('loads selected ancestry, marks its shared base and opens commits', async () => {
    const wrapper = mountMap()
    await flushPromises()
    expect(load).toHaveBeenCalledWith('feature', 80)
    expect(compare).toHaveBeenCalledWith('main', 'feature')
    expect(wrapper.find('.merge-base').text()).toContain('base with main')
    expect(wrapper.findAll('.branch-commit-row')).toHaveLength(2)
    await wrapper.find('.branch-commit-row').trigger('click')
    expect(wrapper.emitted('open')?.[0]).toEqual(['feature-tip'])
    wrapper.unmount()
  })

  it('does not invent a shared ancestor outside loaded history and allows expansion', async () => {
    compare.mockResolvedValue({ Base: 'older', AheadA: 3, AheadB: 200 })
    load.mockResolvedValue(graph('tip', ['unloaded']))
    const wrapper = mountMap()
    await flushPromises()
    expect(wrapper.find('.merge-base').exists()).toBe(false)
    expect(wrapper.text()).toContain('outside these 2 commits')
    await wrapper.find('footer button').trigger('click')
    await flushPromises()
    expect(load).toHaveBeenLastCalledWith('feature', 160)
    wrapper.unmount()
  })

  it('ignores stale responses when selection changes', async () => {
    let resolveOld!: (value: ReturnType<typeof graph>) => void
    load.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const wrapper = mountMap()
    await wrapper.setProps({ selected: main })
    await flushPromises()
    resolveOld(graph('old-tip'))
    await flushPromises()
    expect(wrapper.text()).not.toContain('old-tip')
    expect(load).toHaveBeenLastCalledWith('main', 80)
    wrapper.unmount()
  })

  it('supports retry and keeps comparison failures distinct from unrelated history', async () => {
    load.mockRejectedValueOnce(new Error('History unavailable'))
    const wrapper = mountMap()
    await flushPromises()
    expect(wrapper.find('[role=alert]').text()).toContain('History unavailable')
    compare.mockRejectedValue(new Error('Comparison unavailable'))
    await wrapper.find('[role=alert] button').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.branch-commit-row')).toHaveLength(2)
    expect(wrapper.text()).toContain('Connection to main unavailable')
    expect(wrapper.text()).not.toContain('No common ancestor')
    wrapper.unmount()
  })
})

describe('virtual branch history', () => {
  const many = (count: number) => ({
    LaneCount: 1,
    Rows: Array.from({ length: count }, (_, index) => ({
      Commit: { Hash: `commit-${index}`, ShortHash: `${index}`, Message: `History ${index}`, Author: 'Author', Parents: [`commit-${index + 1}`], Decorations: [] },
      Lanes: [{ Glyphs: [{ Kind: 'empty' }, { Kind: 'node', ColorID: 0, ConnectTop: index > 0, ConnectBottom: true }, { Kind: 'empty' }] }],
      Routes: [],
    })),
  })
  async function virtualMap(count = 500) {
    load.mockResolvedValue(many(count))
    compare.mockResolvedValue({ Base: 'commit-200' })
    const wrapper = mount(BranchAncestryMap, {
      props: { branches: [main, feature], selected: feature }, attachTo: document.body,
      global: { stubs: { AuthorAvatar: true } },
    })
    await flushPromises()
    return wrapper
  }
  it('bounds rows and SVG together while preserving badges and coordinates', async () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(330)
    const wrapper = await virtualMap()
    try {
      expect(wrapper.findAll('.branch-commit-row')).toHaveLength(16)
      expect(wrapper.findAll('[data-graph-row]')).toHaveLength(16)
      expect(wrapper.get('.branch-history-content').attributes('style')).toContain('22000px')
      expect(wrapper.text()).not.toContain('outside these') // Base is loaded but offscreen.
      const pane = wrapper.get('.branch-history-scroll')
      pane.element.scrollTop = 8800
      await pane.trigger('scroll')
      await new Promise(resolve => setTimeout(resolve, 30))
      await flushPromises()
      expect(wrapper.findAll('.branch-commit-row')).toHaveLength(24)
      expect(wrapper.findAll('[data-graph-row]')).toHaveLength(24)
      expect(wrapper.get('[data-branch-index="192"]').attributes('style')).toContain('top: 8448px')
      expect(wrapper.get('[data-graph-row="commit-192"]').attributes('transform')).toBe('translate(0 8448)')
      expect(wrapper.get('.merge-base').text()).toContain('base with main')
      expect(wrapper.findAll('.branch-commit-badge').some(badge => badge.text() === 'tip')).toBe(false)
      await wrapper.get('[data-branch-index="200"]').trigger('click')
      expect(wrapper.emitted('open')?.[0]).toEqual(['commit-200'])
    } finally { wrapper.unmount(); measure.mockRestore() }
  })

  it('navigates to offscreen rows and retains keyboard ownership after wheel scrolling', async () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(330)
    const wrapper = await virtualMap()
    try {
      const pane = wrapper.get('.branch-history-scroll')
      ;(pane.element as HTMLElement).focus()
      await pane.trigger('keydown', { key: 'End' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('[data-branch-index="499"]').element)
      await wrapper.get('[data-branch-index="499"]').trigger('keydown', { key: 'ArrowUp' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('[data-branch-index="498"]').element)
      pane.element.scrollTop = 0
      await pane.trigger('scroll')
      await new Promise(resolve => setTimeout(resolve, 30))
      await flushPromises()
      expect(document.activeElement).toBe(pane.element)
      await pane.trigger('keydown', { key: 'Home' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('[data-branch-index="0"]').element)
    } finally { wrapper.unmount(); measure.mockRestore() }
  })

  it('preserves position and loaded rows during expansion and a failed expansion', async () => {
    const measure = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(330)
    const wrapper = await virtualMap(80)
    try {
      const pane = wrapper.get('.branch-history-scroll').element
      pane.scrollTop = 2000
      pane.scrollLeft = 100
      let complete!: (value: ReturnType<typeof many>) => void
      load.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
      await wrapper.get('footer button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.branch-history-scroll').element).toBe(pane)
      expect(wrapper.get('footer button').attributes('disabled')).toBeDefined()
      complete(many(160))
      await flushPromises()
      expect(pane.scrollTop).toBe(2000)
      expect(pane.scrollLeft).toBe(100)
      load.mockRejectedValueOnce(new Error('Read failed'))
      await wrapper.get('footer button').trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('Read failed')
      expect(wrapper.get('.branch-history-scroll').element).toBe(pane)
      expect(wrapper.text()).toContain('160 commits')
      await wrapper.setProps({ selected: main })
      await flushPromises()
      expect(load).toHaveBeenLastCalledWith('main', 80)
      expect(wrapper.get('.branch-history-scroll').element.scrollTop).toBe(0)
    } finally { wrapper.unmount(); measure.mockRestore() }
  })
})

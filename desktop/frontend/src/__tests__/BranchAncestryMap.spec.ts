import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BranchAncestryMap from '../components/refs/BranchAncestryMap.vue'
import type { Branch } from '../bindings/github.com/atterpac/ichi/internal/git'

const { load, compare } = vi.hoisted(() => ({ load: vi.fn(), compare: vi.fn() }))
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
  global: { stubs: { GraphCanvas: true } },
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

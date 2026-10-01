import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import RefCluster from '../components/graph/RefCluster.vue'

describe('graph ref labels', () => {
  it('keeps the current branch visible on a shared commit and exposes all ref names', () => {
    const wrapper = mount(RefCluster, {
      props: {
        decorations: [
          { Name: 'v1.2', Kind: 'tag', IsHead: false },
          { Name: 'origin/main', Kind: 'remote', IsHead: false },
          { Name: 'main', Kind: 'branch', IsHead: true },
        ],
      },
    })
    expect(wrapper.find('.ref-name').text()).toBe('main')
    expect(wrapper.find('.ref-overflow').text()).toBe('+2')
    expect(wrapper.find('.ref-label').attributes('title')).toContain('origin/main')
    expect(wrapper.text()).toContain('current branch')
  })
  it('prefers a local branch to a remote and forwards activation to its owner', async () => {
    const wrapper = mount(RefCluster, {
      props: {
        decorations: [
          { Name: 'origin/topic', Kind: 'remote', IsHead: false },
          { Name: 'topic', Kind: 'branch', IsHead: false },
        ],
      },
    })
    expect(wrapper.find('.ref-name').text()).toBe('topic')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})

describe('expanding shared commit refs', () => {
  afterEach(() => vi.useRealTimers())
  const decorations = ['main', 'release', 'feature/one', 'feature/two'].map((Name, index) => ({
    Name,
    Kind: 'branch',
    IsHead: index === 0,
  }))

  it('expands all four branch names after a short hover and keeps click actions available', async () => {
    vi.useFakeTimers()
    const wrapper = mount(RefCluster, { props: { decorations } })
    expect(wrapper.find('.ref-overflow').text()).toBe('+3')
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await wrapper.trigger('pointerenter')
    await vi.advanceTimersByTimeAsync(249)
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.findAll('.ref-expanded .ref-name').map((name) => name.text())).toEqual(
      decorations.map((ref) => ref.Name),
    )
    expect(wrapper.find('.ref-compact').attributes('aria-hidden')).toBe('true')
    await wrapper.find('.ref-expanded .ref-label').trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    await wrapper.trigger('pointerleave')
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    wrapper.unmount()
  })

  it('cancels a passing hover and shares one delay between the row and its tag', async () => {
    vi.useFakeTimers()
    const wrapper = mount(RefCluster, { props: { decorations, rowHovered: true } })
    await vi.advanceTimersByTimeAsync(100)
    await wrapper.setProps({ rowHovered: false })
    await vi.advanceTimersByTimeAsync(250)
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await wrapper.setProps({ rowHovered: true })
    await vi.advanceTimersByTimeAsync(200)
    await wrapper.trigger('pointerenter')
    await vi.advanceTimersByTimeAsync(50)
    expect(wrapper.find('.ref-expanded').exists()).toBe(true)
    wrapper.unmount()
  })

  it('lets keyboard reveal override hover without leaving a stale hovered stack', async () => {
    const wrapper = mount(RefCluster, { props: { decorations } })
    await wrapper.trigger('pointerenter')
    await wrapper.setProps({ hoverEnabled: false })
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await wrapper.setProps({ expanded: true })
    expect(wrapper.findAll('.ref-expanded .ref-label')).toHaveLength(4)
    await wrapper.setProps({ expanded: false })
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    wrapper.unmount()
  })
})

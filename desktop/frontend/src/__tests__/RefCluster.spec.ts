import { describe, expect, it } from 'vitest'
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

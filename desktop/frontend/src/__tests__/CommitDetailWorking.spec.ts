import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import CommitDetailPanel from '../components/graph/CommitDetail.vue'
import {
  Commit,
  CommitDetail,
  ChangedFile,
  StatusEntry,
} from '../bindings/github.com/atterpac/ichi/internal/git'
function preview(entries: StatusEntry[]) {
  return mount(CommitDetailPanel, {
    props: {
      commit: new Commit({ Hash: '__ichi_working_changes__' }),
      detail: null,
      loading: false,
      error: '',
      repo: null,
      workingEntries: entries,
    },
  })
}
describe('working tree inspector', () => {
  it('selects from the directory list, keeping partial files in a single row, without a map', async () => {
    const wrapper = preview([
      new StatusEntry({ Path: 'src/partial.ts', WorkStatus: 1, IndexStatus: 1 }),
      new StatusEntry({ Path: 'new.ts', IsUntracked: true }),
      new StatusEntry({ Path: 'conflict.ts', IsConflict: true, WorkStatus: 1, IndexStatus: 1 }),
    ])
    expect(wrapper.findAll('.heat-file')).toHaveLength(3)
    expect(wrapper.find('.map-section').exists()).toBe(false)
    expect(wrapper.text()).toContain('Partially staged')
    await wrapper.findAll('.heat-file').find(row => row.text().includes('partial.ts'))!.trigger('click')
    expect(wrapper.find('.heat-file.selected').text()).toContain('partial.ts')
    await wrapper.find('.pane-footer button').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['status', 'u:src/partial.ts'])
    wrapper.unmount()
  })
  it('links the map to a long list and reopens a collapsed directory', async () => {
    const wrapper = preview([
      new StatusEntry({ Path: 'src/partial.ts', WorkStatus: 1, IndexStatus: 1 }),
      ...Array.from({ length: 20 }, (_, i) => new StatusEntry({ Path: `lib/f${String(i).padStart(2, '0')}.ts`, WorkStatus: 1 })),
    ])
    const segments = wrapper.findAll('.map-segment')
    expect(segments).toHaveLength(21)
    const partial = segments.findIndex(segment => segment.attributes('aria-label')?.includes('partial.ts'))
    const dir = wrapper.findAll('.directory-toggle').find(toggle => toggle.text().includes('src'))!
    await dir.trigger('click')
    expect(dir.attributes('aria-expanded')).toBe('false')
    await segments[partial]!.trigger('click')
    expect(dir.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.heat-file.selected').text()).toContain('partial.ts')
    wrapper.unmount()
  })
  it('shows a clean state and allows the caller to refresh', async () => {
    const wrapper = preview([])
    expect(wrapper.text()).toContain('Working tree is clean')
    await wrapper.findAll('.pane-footer button')[1]!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })

  it('skips the map when the list is short enough to scan', () => {
    const wrapper = mount(CommitDetailPanel, {
      props: {
        commit: new Commit({ Hash: 'abc' }),
        detail: new CommitDetail({ Files: [new ChangedFile({ Path: 'a.ts', Insertions: 1 })] }),
        loading: false,
        error: '',
        repo: null,
      },
    })
    expect(wrapper.find('.file-heatmap').exists()).toBe(false)
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('committed files heatmap', () => {
  it('shows the map for long lists, reveals files beyond ten, and reviews in the commit', async () => {
    const wrapper = mount(CommitDetailPanel, {
      props: {
        commit: new Commit({ Hash: 'abc' }),
        detail: new CommitDetail({
          Files: Array.from(
            { length: 24 },
            (_, i) =>
              new ChangedFile({
                Path: `src/file${String(i).padStart(2, '0')}.ts`,
                Insertions: i + 1,
                Deletions: 1,
              }),
          ),
        }),
        loading: false,
        error: '',
        repo: null,
      },
    })
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(10)
    await wrapper.findAll('.map-segment')[23]!.trigger('click')
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(24)
    expect(wrapper.find('.detail-file-row.heat-selected').text()).toContain('file23.ts')
    expect(wrapper.emitted('navigate')).toBeUndefined()
    await wrapper.find('.detail-file-row.heat-selected').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['diff', 'abc', 'src/file23.ts'])
    await wrapper.findAll('.map-segment')[23]!.trigger('keydown', { key: 'Home' })
    expect(wrapper.findAll('.map-segment')[0]!.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('skips the map when the list is short enough to scan', () => {
    const wrapper = mount(CommitDetailPanel, {
      props: {
        commit: new Commit({ Hash: 'abc' }),
        detail: new CommitDetail({ Files: [new ChangedFile({ Path: 'a.ts', Insertions: 1 })] }),
        loading: false,
        error: '',
        repo: null,
      },
    })
    expect(wrapper.find('.file-heatmap').exists()).toBe(false)
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(1)
    wrapper.unmount()
  })
})

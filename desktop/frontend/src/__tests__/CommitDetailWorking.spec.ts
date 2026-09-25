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
  it('links the heatmap and directory list, keeping partial files in a single row', async () => {
    const wrapper = preview([
      new StatusEntry({ Path: 'src/partial.ts', WorkStatus: 1, IndexStatus: 1 }),
      new StatusEntry({ Path: 'new.ts', IsUntracked: true }),
      new StatusEntry({ Path: 'conflict.ts', IsConflict: true, WorkStatus: 1, IndexStatus: 1 }),
    ])
    expect(wrapper.findAll('.heat-file')).toHaveLength(3)
    expect(wrapper.text()).toContain('Partially staged')
    await wrapper.findAll('.map-segment')[2]!.trigger('click')
    expect(wrapper.find('.heat-file.selected').text()).toContain('partial.ts')
    await wrapper.find('.pane-footer button').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['status', 'u:src/partial.ts'])
    const dir = wrapper.findAll('.directory-toggle')[1]!
    await dir.trigger('click')
    expect(dir.attributes('aria-expanded')).toBe('false')
    await wrapper.findAll('.map-segment')[2]!.trigger('click')
    expect(dir.attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })
  it('shows a clean state and allows the caller to refresh', async () => {
    const wrapper = preview([])
    expect(wrapper.text()).toContain('Working tree is clean')
    await wrapper.findAll('.pane-footer button')[1]!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('committed files heatmap', () => {
  it('reveals files beyond the initial ten and preserves file history navigation', async () => {
    const wrapper = mount(CommitDetailPanel, {
      props: {
        commit: new Commit({ Hash: 'abc' }),
        detail: new CommitDetail({
          Files: Array.from(
            { length: 12 },
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
    await wrapper.findAll('.map-segment')[11]!.trigger('click')
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(12)
    expect(wrapper.find('.detail-file-row.heat-selected').text()).toContain('file11.ts')
    expect(wrapper.emitted('navigate')).toBeUndefined()
    await wrapper.find('.detail-file-row.heat-selected').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['file-log', 'src/file11.ts'])
    await wrapper.findAll('.map-segment')[11]!.trigger('keydown', { key: 'Home' })
    expect(wrapper.findAll('.map-segment')[0]!.attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })
})

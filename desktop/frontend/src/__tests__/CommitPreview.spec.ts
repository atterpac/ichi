import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CommitPreview from '../components/graph/CommitPreview.vue'
import { ChangedFile, FileDiff, DiffHunk, DiffLine, LineType } from '../bindings/github.com/atterpac/ichi/internal/git'
const { between, root } = vi.hoisted(() => ({ between: vi.fn(), root: vi.fn() }))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({ DiffService: { DiffBetweenFile: between, FileDiff: root } }))
const file = new ChangedFile({ Path: 'src/a.ts', OldPath: 'old.ts' })
const patch = (text: string) => new FileDiff({ Path: file.Path, Hunks: [new DiffHunk({ Lines: Array.from({ length: 20 }, (_, i) => new DiffLine({ Content: text, Type: LineType.LineAdded, NewLineNo: i + 1 })) })] })
beforeEach(() => { vi.resetAllMocks() })
describe('commit preview', () => {
  it('compares against the first parent, bounds rendering, and opens full review', async () => {
    between.mockResolvedValue(patch('added'))
    const wrapper = mount(CommitPreview, { props: { hash: 'commit', parent: 'base', file } })
    await flushPromises()
    expect(between).toHaveBeenCalledWith('base', 'commit', 'src/a.ts', 'old.ts')
    expect(wrapper.findAll('.commit-preview-line')).toHaveLength(12)
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('review')).toEqual([['src/a.ts']])
    wrapper.unmount()
  })
  it('ignores late results after selection changes', async () => {
    let finish!: (value: FileDiff) => void
    between.mockReturnValueOnce(new Promise<FileDiff>(resolve => { finish = resolve })).mockResolvedValueOnce(patch('current'))
    const wrapper = mount(CommitPreview, { props: { hash: 'old', parent: 'base', file } })
    await wrapper.setProps({ hash: 'new' })
    await flushPromises()
    finish(patch('stale'))
    await flushPromises()
    expect(wrapper.text()).toContain('current')
    expect(wrapper.text()).not.toContain('stale')
    wrapper.unmount()
  })
  it('handles root commits and skips binary reads', async () => {
    root.mockResolvedValue([patch('root')])
    const wrapper = mount(CommitPreview, { props: { hash: 'root', file } })
    await flushPromises()
    expect(root).toHaveBeenCalledWith('root', file.Path)
    await wrapper.setProps({ file: new ChangedFile({ Path: 'image.png', Binary: true }) })
    expect(wrapper.text()).toContain('Binary file')
    expect(root).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

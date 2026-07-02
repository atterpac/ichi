import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DiffView from '../components/diff/DiffView.vue'
import { useShellSettings } from '../composables/useShellSettings'
import { LineType, type FileDiff } from '../bindings/github.com/atterpac/ichi/internal/git'

const line = (type: LineType, content: string, oldNo: number, newNo: number) => ({
  Type: type,
  Content: content,
  OldLineNo: oldNo,
  NewLineNo: newNo,
  Selected: false,
})

const diff = {
  Path: 'src/thing.ts',
  OldPath: '',
  Binary: false,
  NewFile: false,
  Deleted: false,
  Hunks: [
    {
      Header: '@@ -1,3 +1,3 @@',
      OldStart: 1,
      OldCount: 3,
      NewStart: 1,
      NewCount: 3,
      Lines: [
        line(LineType.LineContext, 'top', 1, 1),
        line(LineType.LineRemoved, 'old two', 2, 0),
        line(LineType.LineAdded, 'new two', 0, 2),
      ],
      Selected: false,
      Expanded: true,
    },
    {
      Header: '@@ -10,2 +10,2 @@',
      OldStart: 10,
      OldCount: 2,
      NewStart: 10,
      NewCount: 2,
      Lines: [
        line(LineType.LineContext, 'ten', 10, 10),
        line(LineType.LineAdded, 'eleven', 0, 11),
      ],
      Selected: false,
      Expanded: true,
    },
  ],
} as unknown as FileDiff

const content = Array.from({ length: 14 }, (_, i) => `file line ${i + 1}`).join('\n')

describe('DiffView', () => {
  afterEach(() => {
    useShellSettings().diffLayout = 'unified'
  })

  it('shows a collapsed gap between hunks and expands it from file content', async () => {
    const load = vi.fn<() => Promise<string>>(() => Promise.resolve(content))
    const wrapper = mount(DiffView, { props: { diff, loadFileContent: load } })
    await flushPromises()

    const gaps = wrapper.findAll('.diff-gap')
    expect(gaps.map((g) => g.text())).toEqual(['··· 6 unchanged lines', '··· expand to end of file'])

    await gaps[0]!.trigger('click')
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(1)
    const contents = wrapper.findAll('.diff-line .line-content').map((el) => el.text())
    for (let n = 4; n <= 9; n++) expect(contents).toContain(`file line ${n}`)
    expect(wrapper.findAll('.diff-gap')).toHaveLength(1)

    await wrapper.find('.diff-gap').trigger('click')
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.diff-line .line-content').map((el) => el.text())).toContain('file line 13')
    wrapper.unmount()
  })

  it('changes-only layout hides context lines and gaps', async () => {
    useShellSettings().diffLayout = 'changes'
    const wrapper = mount(DiffView, { props: { diff, loadFileContent: () => Promise.resolve(content) } })
    await flushPromises()
    const contents = wrapper.findAll('.diff-line .line-content').map((el) => el.text())
    expect(contents).toEqual(['old two', 'new two', 'eleven'])
    expect(wrapper.findAll('.diff-gap')).toHaveLength(0)
    wrapper.unmount()
  })

  it('inline layout merges modified pairs into one row with del/ins spans', async () => {
    useShellSettings().diffLayout = 'inline'
    const wrapper = mount(DiffView, { props: { diff } })
    await flushPromises()
    const merged = wrapper.find('.diff-merged')
    expect(merged.exists()).toBe(true)
    expect(merged.find('del').text()).toBe('old')
    expect(merged.find('ins').text()).toBe('new')
    expect(merged.text()).toContain('two')
    wrapper.unmount()
  })

  it('t cycles through the layouts', async () => {
    const wrapper = mount(DiffView, { props: { diff } })
    await flushPromises()
    const order: string[] = []
    for (let i = 0; i < 5; i++) {
      await wrapper.find('.diff-view').trigger('keydown', { key: 't' })
      order.push(useShellSettings().diffLayout)
    }
    expect(order).toEqual(['split', 'inline', 'changes', 'result', 'unified'])
    wrapper.unmount()
  })

  it('result layout renders the new side with deletion markers', async () => {
    useShellSettings().diffLayout = 'result'
    const wrapper = mount(DiffView, { props: { diff } })
    await flushPromises()
    const contents = wrapper.findAll('.diff-line .line-content').map((el) => el.text())
    expect(contents).toContain('new two')
    expect(contents).not.toContain('old two')
    expect(wrapper.find('.diff-delmark').text()).toContain('1 removed line')
    wrapper.unmount()
  })

  it('edits the active hunk result-side lines', async () => {
    const wrapper = mount(DiffView, { props: { diff } })
    await flushPromises()

    await wrapper.find('.diff-view').trigger('keydown', { key: 'e' })
    await flushPromises()

    const editor = wrapper.find('textarea.diff-edit-textarea')
    expect(editor.exists()).toBe(true)
    expect((editor.element as HTMLTextAreaElement).value).toBe('top\nnew two')

    await editor.setValue('top\nedited two\ninserted')
    await editor.trigger('keydown', { key: 'Enter', ctrlKey: true })

    expect(wrapper.emitted('editHunk')?.[0]?.[1]).toEqual(['top', 'edited two', 'inserted'])
    wrapper.unmount()
  })
})

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
  it('leaves line mode before leaving the pane and ignores control/input staging keys', async () => {
    const wrapper = mount(DiffView, { props: { diff }, slots: { head: '<select><option>Split</option></select>' } })
    await wrapper.trigger('keydown', { key: 'v' })
    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('exit')).toBeUndefined()
    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('exit')).toHaveLength(1)
    await wrapper.trigger('keydown', { key: 's', ctrlKey: true })
    await wrapper.find('select').trigger('keydown', { key: 's' })
    expect(wrapper.emitted('stageHunk')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not offer or emit edit and staging actions for historical diffs', async () => {
    const wrapper = mount(DiffView, { props: { diff, readOnly: true } })
    for (const key of ['s', 'S', 'v', 'e']) await wrapper.trigger('keydown', { key })
    expect(wrapper.emitted('stageFile')).toBeUndefined()
    expect(wrapper.emitted('stageHunk')).toBeUndefined()
    expect(wrapper.find('.diff-edit-textarea').exists()).toBe(false)
    expect(wrapper.find('.hunk-stage-hint').exists()).toBe(false)
    await wrapper.trigger('keydown', { key: 'h' })
    expect(wrapper.emitted('exit')).toHaveLength(1)
    wrapper.unmount()
  })

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

describe('Changes cursor review', () => {
  it('keeps an inline draft mounted while scrolling outside its virtual window', async () => {
    const lines = Array.from({ length: 200 }, (_, index) => line(LineType.LineContext, `line ${index}`, index + 1, index + 1))
    const longDiff = { ...diff, Hunks: [{ ...diff.Hunks[0], Lines: lines }] } as unknown as FileDiff
    const wrapper = mount(DiffView, { props: { diff: longDiff, cursorReview: true } })
    await wrapper.trigger('keydown', { key: 'e' })
    const editor = wrapper.get('.diff-inline-editor').element
    await wrapper.get('.diff-inline-editor').setValue('keep draft')
    const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 0 })
    wrapper.element.scrollTop = 2600
    await wrapper.trigger('scroll')
    await flushPromises()
    expect(wrapper.get('.diff-inline-editor').element).toBe(editor)
    expect((editor as HTMLInputElement).value).toBe('keep draft')
    expect(wrapper.findAll('.diff-line').length).toBeLessThan(100)
    await wrapper.get('.diff-inline-editor').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('editHunk')).toBeUndefined()
    frame.mockRestore()
    wrapper.unmount()
  })

  it('uses unified line navigation independently of settings, with hunk jumps and search', async () => {
    useShellSettings().diffLayout = 'split'
    const wrapper = mount(DiffView, { props: { diff, cursorReview: true } })
    await flushPromises()
    const current = () => wrapper.find('.line-cursor').text()
    expect(wrapper.classes()).toContain('layout-unified')
    expect(current()).toContain('top')
    await wrapper.trigger('keydown', { key: 'j' })
    expect(current()).toContain('old two')
    await wrapper.trigger('keydown', { key: 'j' })
    expect(current()).toContain('new two')
    await wrapper.trigger('keydown', { key: ']' })
    expect(current()).toContain('ten')
    await wrapper.trigger('keydown', { key: 'G' })
    expect(current()).toContain('eleven')
    await wrapper.trigger('keydown', { key: '/' })
    await wrapper.get('[aria-label="Search diff"]').setValue('old two')
    await wrapper.get('.cursor-review-actions form').trigger('submit')
    expect(current()).toContain('old two')
    expect(wrapper.find('.hunk-stage-hint').exists()).toBe(false)
    wrapper.unmount()
    useShellSettings().diffLayout = 'unified'
  })

  it('edits a line in place and sends the complete result hunk, including an empty line', async () => {
    const wrapper = mount(DiffView, { props: { diff, cursorReview: true }, attachTo: document.body })
    await wrapper.trigger('keydown', { key: 'j' })
    await wrapper.trigger('keydown', { key: 'e' })
    expect(wrapper.find('.diff-inline-editor').exists()).toBe(false)
    await wrapper.trigger('keydown', { key: 'j' })
    await wrapper.trigger('keydown', { key: 'e' })
    await flushPromises()
    const editor = wrapper.get('.line-cursor .diff-inline-editor')
    expect(wrapper.findAll('.diff-hunk')).toHaveLength(2)
    expect(wrapper.findAll('.diff-line')).toHaveLength(5)
    expect(document.activeElement).toBe(editor.element)
    await editor.setValue('')
    await editor.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(wrapper.emitted('editHunk')).toBeUndefined()
    await editor.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('editHunk')?.[0]?.[1]).toEqual(['top', ''])
    expect(document.activeElement).toBe(wrapper.element)
    wrapper.unmount()
  })

  it('stages a visual range from the cursor and cancels draft edits on refresh', async () => {
    const wrapper = mount(DiffView, { props: { diff, cursorReview: true } })
    await wrapper.trigger('keydown', { key: 'j' })
    await wrapper.trigger('keydown', { key: 'v' })
    await wrapper.trigger('keydown', { key: 'j' })
    await wrapper.trigger('keydown', { key: 's' })
    expect((wrapper.emitted('stageLines')?.[0]?.[1] as unknown[])).toHaveLength(2)
    await wrapper.trigger('keydown', { key: 'e' })
    await wrapper.get('.diff-inline-editor').setValue('draft')
    await wrapper.setProps({ diff: { ...diff, Hunks: [...diff.Hunks] } })
    expect(wrapper.find('.diff-inline-editor').exists()).toBe(false)
    expect(wrapper.emitted('editHunk')).toBeUndefined()
    await wrapper.setProps({ staged: true })
    await wrapper.trigger('keydown', { key: 'e' })
    expect(wrapper.find('.diff-inline-editor').exists()).toBe(false)
    wrapper.unmount()
  })
})


describe('full-file editing', () => {
  it('opens the full-file editor at the double-clicked diff line', async () => {
    const loadEditorFile = vi.fn(async () => content)
    const wrapper = mount(DiffView, {
      props: { diff, cursorReview: true, loadEditorFile, saveEditorFile: vi.fn() },
      global: { stubs: { FileEditor: { props: ['line'], template: '<div class="editor-stub" :data-line="line" />' } } },
    })
    const target = wrapper.findAll('.diff-line').find(row => row.text().includes('eleven'))!
    await target.trigger('click')
    expect(loadEditorFile).not.toHaveBeenCalled()
    await target.get('.line-content').trigger('dblclick')
    await flushPromises()
    expect(loadEditorFile).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.editor-stub').attributes('data-line')).toBe('11')
    wrapper.unmount()
  })

  it.each([{ staged: true }, { readOnly: true }])('does not double-click edit a protected diff %j', async protection => {
    const loadEditorFile = vi.fn(async () => content)
    const wrapper = mount(DiffView, { props: { diff, cursorReview: true, loadEditorFile, saveEditorFile: vi.fn(), ...protection } })
    await wrapper.get('.diff-line .line-content').trigger('dblclick')
    await flushPromises()
    expect(loadEditorFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('rejects oversized buffers without leaving the diff', async () => {
    const wrapper = mount(DiffView, { props: { diff, loadEditorFile: async () => 'x'.repeat(1024 * 1024 + 1), saveEditorFile: vi.fn() } })
    await wrapper.trigger('keydown', { key: 'e' })
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('1 MiB')
    expect(wrapper.find('.file-editor').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores a pending file load after switching files', async () => {
    let resolve!: (value: string) => void
    const load = new Promise<string>(r => { resolve = r })
    const wrapper = mount(DiffView, { props: { diff, loadEditorFile: () => load, saveEditorFile: vi.fn() } })
    await wrapper.trigger('keydown', { key: 'e' })
    await wrapper.setProps({ diff: { ...diff, Path: 'another.ts' } as FileDiff })
    resolve('old file')
    await flushPromises()
    expect(wrapper.find('.file-editor').exists()).toBe(false)
    expect(wrapper.emitted('modechange')).toBeUndefined()
    wrapper.unmount()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { EditorView } from '@codemirror/view'
import { getCM, Vim } from '@replit/codemirror-vim'
import FileEditor from '../components/diff/FileEditor.vue'
import { repoSwitchBlocker } from '../composables/useRepoSwitchGuard'

// jsdom has no text layout; CodeMirror measures DOM ranges on animation frames.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers.length = 0 })
function editor(save = vi.fn<(original: string, content: string) => Promise<void>>().mockResolvedValue(undefined), content = 'one\r\ntwo\r\nthree') {
  const wrapper = mount(FileEditor, { props: { content, line: 2, save }, attachTo: document.body })
  wrappers.push(wrapper)
  const view = EditorView.findFromDOM(wrapper.get('.cm-editor').element as HTMLElement)!
  return { wrapper, view, cm: getCM(view)! as Parameters<typeof Vim.handleEx>[0], save }
}

describe('Vim file editor', () => {
  it('opens at the requested line; visual line deletion, insert and Escape work; saves CRLF', async () => {
    const { wrapper, view, cm, save } = editor()
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2)
    Vim.handleKey(cm, 'V', 'user')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('VISUAL LINE')
    expect(wrapper.classes()).toContain('is-visual')
    expect(wrapper.text()).toContain('Selection active')
    Vim.handleKey(cm, 'd', 'user')
    expect(view.state.doc.toString()).toBe('one\nthree')
    expect(repoSwitchBlocker()).toContain('Save or close')
    Vim.handleKey(cm, 'i', 'user')
    await flushPromises()
    expect(wrapper.text()).toContain('INSERT')
    expect(wrapper.classes()).not.toContain('is-visual')
    Vim.handleKey(cm, '<Esc>', 'user')
    expect(wrapper.emitted('close')).toBeUndefined()
    Vim.handleEx(cm, 'w')
    await flushPromises()
    expect(save).toHaveBeenCalledWith('one\r\ntwo\r\nthree', 'one\r\nthree')
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('saved')?.[0]).toEqual([{ close: false }])
    expect(repoSwitchBlocker()).toBe('')
  })
  it('keeps the buffer on save failure and requires deliberate discard', async () => {
    const { wrapper, view, cm } = editor(vi.fn<(original: string, content: string) => Promise<void>>().mockRejectedValue(new Error('changed on disk')))
    Vim.handleKey(cm, 'd', 'user'); Vim.handleKey(cm, 'd', 'user')
    Vim.handleEx(cm, 'w')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('changed on disk')
    expect(view.state.doc.toString()).toBe('one\nthree')
    expect(repoSwitchBlocker()).toContain('Save or close')
    expect(wrapper.emitted('saved')).toBeUndefined()
    Vim.handleEx(cm, 'q')
    await flushPromises()
    expect(wrapper.text()).toContain('Discard unsaved changes?')
    expect(wrapper.emitted('close')).toBeUndefined()
    Vim.handleEx(cm, 'q!')
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('uses the last successful write as the baseline for repeated writes and clean quit', async () => {
    const { wrapper, view, cm, save } = editor()
    view.dispatch({ changes: { from: 0, to: 3, insert: 'first' } })
    Vim.handleEx(cm, 'w')
    await flushPromises()
    expect(repoSwitchBlocker()).toBe('')
    view.dispatch({ changes: { from: 0, to: 5, insert: 'second' } })
    expect(repoSwitchBlocker()).toContain('Save or close')
    Vim.handleEx(cm, 'w')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith('first\r\ntwo\r\nthree', 'second\r\ntwo\r\nthree')
    Vim.handleEx(cm, 'q')
    await flushPromises()
    expect(wrapper.text()).not.toContain('Discard unsaved changes?')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('signals close intent only after a successful write-quit', async () => {
    const save = vi.fn<(original: string, content: string) => Promise<void>>().mockRejectedValueOnce(new Error('disk write failed')).mockResolvedValue(undefined)
    const { wrapper, view, cm } = editor(save)
    view.dispatch({ changes: { from: 0, to: 3, insert: 'changed' } })
    Vim.handleEx(cm, 'wq')
    await flushPromises()
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(repoSwitchBlocker()).toContain('Save or close')
    Vim.handleEx(cm, 'wq')
    await flushPromises()
    expect(wrapper.emitted('saved')).toEqual([[{ close: true }]])
    expect(repoSwitchBlocker()).toBe('')
    expect(save).toHaveBeenLastCalledWith('one\r\ntwo\r\nthree', 'changed\r\ntwo\r\nthree')
  })
})

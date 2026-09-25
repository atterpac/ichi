import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { EditorView } from '@codemirror/view'
import { getCM, Vim } from '@replit/codemirror-vim'
import FileEditor from '../components/diff/FileEditor.vue'

// jsdom has no text layout; CodeMirror measures DOM ranges on animation frames.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()

const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.forEach(w => w.unmount()); wrappers.length = 0 })
function editor(save = vi.fn().mockResolvedValue(undefined), content = 'one\r\ntwo\r\nthree') {
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
  })
  it('keeps the buffer on save failure and requires deliberate discard', async () => {
    const { wrapper, view, cm } = editor(vi.fn().mockRejectedValue(new Error('changed on disk')))
    Vim.handleKey(cm, 'd', 'user'); Vim.handleKey(cm, 'd', 'user')
    Vim.handleEx(cm, 'w')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('changed on disk')
    expect(view.state.doc.toString()).toBe('one\nthree')
    expect(wrapper.emitted('saved')).toBeUndefined()
    Vim.handleEx(cm, 'q')
    await flushPromises()
    expect(wrapper.text()).toContain('Discard unsaved changes?')
    expect(wrapper.emitted('close')).toBeUndefined()
    Vim.handleEx(cm, 'q!')
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ReviewLab from '../sandbox/ReviewLab.vue'

let wrapper: VueWrapper
afterEach(() => {
  wrapper?.unmount()
  document.documentElement.className = ''
})
function setup() {
  wrapper = mount(ReviewLab, { attachTo: document.body })
  return wrapper
}
async function key(value: string, options = {}) {
  await wrapper.get('.code-surface').trigger('keydown', { key: value, ...options })
}
function cursor() {
  return wrapper.find('.code-line.current')
}

describe('Review lab interactions', () => {
  it('moves by line and hunk, preserves file position, and ignores modified shortcuts', async () => {
    setup()
    await key('j')
    expect(cursor().attributes('data-line-id')).toBe('cursor-1')
    await key('j', { ctrlKey: true })
    expect(cursor().attributes('data-line-id')).toBe('cursor-1')
    await key(']')
    expect(cursor().attributes('data-line-id')).toBe('advance-1')
    await wrapper.findAll('.file-button')[1]!.trigger('click')
    await wrapper.findAll('.file-button')[0]!.trigger('click')
    expect(cursor().attributes('data-line-id')).toBe('advance-1')
    await key('G')
    expect(cursor().attributes('data-line-id')).toBe('restore-5')
    await key('g')
    await key('g')
    expect(cursor().attributes('data-line-id')).toBe('cursor-0')
  })

  it('maps removed lines to a surviving editor target and handles whole-file deletion', async () => {
    setup()
    await key('j')
    await key('o')
    expect(wrapper.get('.handoff code').text()).toBe('src/review/session.ts:13')
    expect(wrapper.get('.handoff').text()).toContain('Removed line')
    await wrapper.findAll('.file-button')[2]!.trigger('click')
    await key('o')
    expect(wrapper.find('.handoff').exists()).toBe(false)
    expect(wrapper.get('.lab-notice').text()).toContain('No editable working-tree target')
  })

  it('edits sample context while preserving the old side and invalidating review', async () => {
    setup()
    await key('r')
    await key('e')
    const input = wrapper.get('input[aria-label="Edit sample line"]')
    expect(cursor().find('.line-editor').exists()).toBe(true)
    expect(wrapper.findAll('.hunk-block')).toHaveLength(3)
    expect(wrapper.findAll('.code-line')).toHaveLength(20)
    expect(document.activeElement).toBe(input.element)
    await wrapper.get('[data-line-id="cursor-3"]').trigger('click')
    expect(cursor().attributes('data-line-id')).toBe('cursor-0')
    await input.trigger('keydown', { key: 'j' })
    expect(cursor().attributes('data-line-id')).toBe('cursor-0')
    await input.setValue('export function openFile(path: string, restore = true) {')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('.code-line.del')[0]!.text()).toContain(
      'export function openFile(path: string) {',
    )
    expect(cursor().classes()).toContain('add')
    expect(cursor().text()).toContain('restore = true')
    expect(wrapper.get('progress').attributes('value')).toBe('0')
    await key('e')
    await wrapper.get('.line-editor').setValue('discard this edit')
    await wrapper.get('.line-editor').trigger('keydown', { key: 'Escape' })
    expect(cursor().text()).toContain('restore = true')
    expect(document.activeElement).toBe(wrapper.get('.code-surface').element)
  })

  it('reviews every hunk across files and reports completion', async () => {
    setup()
    await wrapper.findAll('.concepts button')[1]!.trigger('click')
    expect(wrapper.findAll('.hunk-block')).toHaveLength(1)
    for (let i = 0; i < 6; i++) await key('Enter')
    expect(wrapper.get('progress').attributes('value')).toBe('6')
    expect(wrapper.get('.lab-notice').text()).toContain('Review complete')
  })

  it('switches result sides and provides a before view for deleted files', async () => {
    setup()
    await wrapper.findAll('.concepts button')[2]!.trigger('click')
    expect(wrapper.findAll('.code-line.del')).toHaveLength(0)
    await key('b')
    expect(wrapper.findAll('.code-line.add')).toHaveLength(0)
    await key('e')
    expect(wrapper.find('.line-editor').exists()).toBe(false)
    await wrapper.findAll('.file-button')[2]!.trigger('click')
    expect(wrapper.find('.empty-result').exists()).toBe(true)
    await key('b')
    expect(wrapper.findAll('.code-line.del')).toHaveLength(3)
  })

  it('searches, advances matches, and restores code focus', async () => {
    setup()
    await key('/')
    await wrapper.get('input[aria-label="Search visible code"]').setValue('cursor.value')
    await wrapper.get('.search-bar').trigger('submit')
    expect(cursor().attributes('data-line-id')).toBe('cursor-2')
    await key('n')
    expect(cursor().attributes('data-line-id')).toBe('cursor-3')
    expect(document.activeElement).toBe(wrapper.get('.code-surface').element)
  })
})

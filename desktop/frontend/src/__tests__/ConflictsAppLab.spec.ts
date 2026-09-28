import { afterEach, describe, expect, it } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ConflictsAppLab from '../sandbox/operations/ConflictsAppLab.vue'
let wrapper: VueWrapper
function setup() {
  wrapper = mount(ConflictsAppLab, { attachTo: document.body })
}
async function click(text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(button).toBeDefined()
  await button!.trigger('click')
}
afterEach(() => {
  if (wrapper?.exists()) wrapper.unmount()
})
describe('Conflict workspace using app components', () => {
  it('resolves every sample file and completes the rebase', async () => {
    setup()
    expect(wrapper.find('.ichi-shell .main-island .primary-nav').exists()).toBe(true)
    await click('Combine changes')
    await click('Save and stage')
    await click('Keep both tests')
    await click('Save and stage')
    await click('Keep deletion')
    await click('Save and stage')
    await click('Continue rebase')
    expect(wrapper.get('.native-finished').text()).toContain('Rebase complete')
    expect(wrapper.get('.repo-dirty').text()).toBe('clean')
  })
  it('filters files, navigates with the keyboard, and keeps controls when the inspector is collapsed', async () => {
    setup()
    await wrapper.get('input[aria-label="Filter conflict files"]').setValue('legacy')
    expect(wrapper.findAll('.native-file-row')).toHaveLength(1)
    await wrapper.get('.native-files').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('.diff-file-path').text()).toContain('legacy-storage.ts')
    await wrapper.get('button[aria-label="Toggle operation details"]').trigger('click')
    expect(wrapper.find('.native-inspector').exists()).toBe(false)
    expect(wrapper.get('.native-collapsed-actions').text()).toContain('Continue rebase')
    await click('Abort rebase…')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'current conflict resolutions will be discarded',
    )
    document.querySelector<HTMLButtonElement>('.operation-primary')!.click()
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.native-finished').text()).toContain('Rebase aborted')
  })
  it('switches theme locally and restores the document theme on unmount', async () => {
    const previous = document.documentElement.className
    setup()
    await wrapper.get('select[aria-label="Preview theme"]').setValue('ichi-light')
    expect(document.documentElement.classList.contains('theme-ichi-light')).toBe(true)
    wrapper.unmount()
    expect(document.documentElement.className).toBe(previous)
  })
})

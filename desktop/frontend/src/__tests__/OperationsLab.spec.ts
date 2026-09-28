import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import OperationsLab from '../sandbox/operations/OperationsLab.vue'
let wrapper: VueWrapper
function setup() {
  wrapper = mount(OperationsLab, { attachTo: document.body })
  return wrapper
}
async function click(text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(button, `button: ${text}`).toBeDefined()
  await button!.trigger('click')
}
afterEach(() => wrapper?.unmount())
describe('Operations example flows', () => {
  it('resolves text and deletion conflicts before allowing continuation', async () => {
    setup()
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text().includes('Continue rebase'))!
        .attributes('disabled'),
    ).toBeDefined()
    await click('Combine changes')
    await click('Save and stage')
    expect(wrapper.get('.file-heading').text()).toContain('session.test.ts')
    await click('Keep both tests')
    await click('Save and stage')
    expect(wrapper.get('.file-heading').text()).toContain('legacy-storage.ts')
    await click('Keep deletion')
    await click('Save and stage')
    await click('Continue rebase')
    expect(wrapper.text()).toContain('Your rebase is complete.')
  })
  it('invalidates staging after edits and prevents staging conflict markers', async () => {
    setup()
    await click('Use main')
    await click('Save and stage')
    await wrapper.findAll('.file-item')[0]!.trigger('click')
    await wrapper.get('textarea').setValue('<<<<<<< unresolved\nexample')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text().includes('Save and stage'))!
        .attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.findAll('.file-item')[0]!.text()).not.toContain('Resolved & staged')
    await wrapper.get('textarea').setValue('resolved manually')
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text().includes('Save and stage'))!
        .attributes('disabled'),
    ).toBeUndefined()
  })
  it('connects rebase planning to both paused and clean completion states', async () => {
    setup()
    await click('Plan a rebase')
    await wrapper.get('select[aria-label="Action for a83e2c1"]').setValue('fixup')
    expect(wrapper.get('[role="alert"]').text()).toContain('start with Pick or Reword')
    await wrapper.get('select[aria-label="Action for a83e2c1"]').setValue('pick')
    await click('Start example rebase')
    expect(wrapper.text()).toContain('Rebase paused')
    await click('Plan a rebase')
    await wrapper.get('select[aria-label="Action for c72f8a6"]').setValue('drop')
    await click('Start example rebase')
    expect(wrapper.text()).toContain('Your rebase is complete.')
  })
  it('confirms abort, preserves a recovery point, and creates a branch without switching', async () => {
    setup()
    await click('Abort rebase…')
    expect(wrapper.get('[role="dialog"]').text()).toContain(
      'Resolutions made during this example rebase will be discarded',
    )
    await wrapper.get('.danger-button').trigger('click')
    expect(wrapper.text()).toContain('Rebase aborted. Work restored.')
    await click('Recover your work')
    await wrapper.get('input[aria-label="Recovery branch name"]').setValue('recovery/test')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Recovered into recovery/test')
    expect(wrapper.get('.repo-bar').text()).toContain('feature/session')
    await click('Open recovered branch')
    expect(wrapper.get('.repo-bar').text()).toContain('recovery/test')
    await click('Reset')
    expect(wrapper.get('.repo-bar').text()).toContain('feature/session')
  })
  it('supports cancelling a dialog with Escape and returning focus', async () => {
    setup()
    const abort = wrapper.findAll('button').find((b) => b.text() === 'Abort rebase…')!
    ;(abort.element as HTMLButtonElement).focus()
    await abort.trigger('click')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(abort.element)
  })
  it.each(['Result first', 'Inline decisions', 'Resolution board'])(
    'completes resolution through the %s layout',
    async (layout) => {
      setup()
      await click(layout)
      await click('Combine changes')
      await click('Save and stage')
      await click('Keep both tests')
      await click('Save and stage')
      await click('Keep deletion')
      await click('Save and stage')
      await click('Continue rebase')
      expect(wrapper.text()).toContain('Your rebase is complete.')
    },
  )

  it('preserves edited results and staging across conflict designs', async () => {
    setup()
    await click('Combine changes')
    await wrapper.get('textarea[aria-label="Resolved file contents"]').setValue('custom resolution')
    await click('Result first')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('custom resolution')
    await click('Save and stage')
    await click('Resolution board')
    expect(wrapper.findAll('.resolution-card')[0]!.text()).toContain('STAGED')
    await wrapper.findAll('.resolution-card')[0]!.trigger('click')
    await click('Inline decisions')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('custom resolution')
    await wrapper.get('textarea').setValue('revised resolution')
    await click('Resolution board')
    expect(wrapper.findAll('.resolution-card')[0]!.text()).toContain('READY FOR REVIEW')
    expect(wrapper.findAll('.resolution-card')[0]!.text()).not.toContain('STAGED')
  })
})

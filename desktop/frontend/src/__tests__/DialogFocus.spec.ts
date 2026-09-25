import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OperationConfirmModal from '../components/overlays/OperationConfirmModal.vue'

describe('dialog keyboard focus', () => {
  it('focuses fields, wraps Tab, closes on Escape, and restores the opener', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mount(OperationConfirmModal, {
      attachTo: document.body,
      props: {
        request: {
          title: 'Create branch?',
          message: 'Choose a name',
          confirmLabel: 'Create',
          inputs: [{ id: 'name', label: 'Name', value: 'feature/ui', required: true }],
          onConfirm: () => {},
        },
      },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(document.activeElement?.tagName).toBe('INPUT')
    const last = wrapper.find('.operation-primary')
    ;(last.element as HTMLButtonElement).focus()
    await last.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(wrapper.find('.operation-close').element)
    await wrapper.find('.operation-close').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last.element)
    await last.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

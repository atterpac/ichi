import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import OperationConfirmModal from '../components/overlays/OperationConfirmModal.vue'

it('keeps the dialog open and requires a second click before stashing', async () => {
  const recover = vi.fn().mockResolvedValue(undefined)
  const wrapper = mount(OperationConfirmModal, {
    props: { request: {
      title: 'New branch', message: 'Create branch', confirmLabel: 'Create',
      inputs: [{ id: 'name', label: 'Branch name', value: 'topic' }],
      onConfirm: vi.fn().mockRejectedValue(new Error('would be overwritten')),
      recovery: () => ({ message: 'Save your changes in Stashes.', label: 'Stash changes and switch', run: recover }),
    } },
    global: { stubs: { Teleport: true } },
  })
  await wrapper.get('.operation-primary').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Save your changes in Stashes.')
  expect(wrapper.get('.operation-primary').text()).toContain('Stash changes and switch')
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(recover).not.toHaveBeenCalled()
  await wrapper.get('.operation-primary').trigger('click')
  await flushPromises()
  expect(recover).toHaveBeenCalledOnce()
  expect(wrapper.emitted('close')).toHaveLength(1)
  wrapper.unmount()
})

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UiButton from '../components/common/UiButton.vue'
import UiInput from '../components/common/UiInput.vue'
import UiIconButton from '../components/common/UiIconButton.vue'

describe('shared control behavior', () => {
  it('blocks repeated actions while loading, even with disabled=false', async () => {
    const wrapper = mount(UiButton, { props: { loading: true, disabled: false } })
    expect(wrapper.element.disabled).toBe(true)
    expect(wrapper.attributes('aria-busy')).toBe('true')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
    await wrapper.setProps({ loading: false })
    expect(wrapper.element.disabled).toBe(false)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    wrapper.unmount()
  })

  it('retains native submit behavior when used as a form action', () => {
    const wrapper = mount(UiButton, { attrs: { type: 'submit' } })
    expect(wrapper.element.type).toBe('submit')
    wrapper.unmount()
  })

  it('forwards input attributes, emits text, and supports imperative focus', async () => {
    const wrapper = mount(UiInput, {
      attachTo: document.body,
      props: { modelValue: 'main', invalid: true },
      attrs: { 'aria-label': 'Branch name', maxlength: 40, required: true },
    })
    expect(wrapper.element.value).toBe('main')
    expect(wrapper.element.maxLength).toBe(40)
    expect(wrapper.element.required).toBe(true)
    expect(wrapper.attributes('aria-invalid')).toBe('true')
    await wrapper.setValue('feature/ui')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['feature/ui'])
    wrapper.vm.focus()
    expect(document.activeElement).toBe(wrapper.element)
    wrapper.unmount()
  })

  it('keeps an accessible label and disabled behavior on icon actions', async () => {
    const wrapper = mount(UiIconButton, {
      props: { label: 'Copy hash', size: 'sm' },
      attrs: { disabled: true },
    })
    expect(wrapper.attributes('aria-label')).toBe('Copy hash')
    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
    wrapper.unmount()
  })
})

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffCode from '../components/diff/DiffCode.vue'
describe('diff code highlighting', () => {
  it('preserves the exact source and word-diff range across token boundaries', () => {
    const content = 'const value = "hello" // note'
    const wrapper = mount(DiffCode, { props: { content, path: 'sample.ts', highlight: [6, 21] } })
    expect(wrapper.findAll('span, mark').map(token => token.element.textContent).join('')).toBe(content)
    expect(wrapper.findAll('mark').map(mark => mark.element.textContent).join('')).toBe(content.slice(6, 21))
    expect(wrapper.get('.syntax-keyword').text()).toBe('const')
    expect(wrapper.get('.syntax-comment').text()).toBe('// note')
    wrapper.unmount()
  })
  it('renders markup as text and leaves unknown file types uncolored', () => {
    const content = '<script>alert("hello")</script>'
    const wrapper = mount(DiffCode, { props: { content, path: 'notes.txt' } })
    expect(wrapper.findAll('span, mark').map(token => token.element.textContent).join('')).toBe(content)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('[class^="syntax-"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import MarkdownBody from '../components/pr/MarkdownBody.vue'
import { renderMarkdown } from '../components/pr/markdown'

const baseUrl = 'https://github.com/owner/repo/blob/abc123/'
const repoUrl = 'https://github.com/owner/repo'
function render(body: string) {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(body, baseUrl, repoUrl)
  return root
}
describe('PR Markdown', () => {
  it('renders GFM semantics and keeps task checkboxes read-only', () => {
    const root = render(
      '# Heading\n\n**Bold** and *emphasis* with ~~removed~~ and `inline()`\n\n> Quote\n\n- [x] Complete\n- [ ] Pending\n\n| Name | Value |\n| --- | --- |\n| One | Two |\n\n<details><summary>More</summary>Extra context</details>',
    )
    for (const selector of [
      'h1',
      'strong',
      'em',
      'del',
      'code',
      'blockquote',
      'ul',
      'table',
      'details summary',
    ])
      expect(root.querySelector(selector)).not.toBeNull()
    expect(root.querySelectorAll('input:disabled')).toHaveLength(2)
    expect(root.querySelector('input')?.checked).toBe(true)
  })
  it('highlights code, labels suggestions, and preserves unknown-language code literally', () => {
    const root = render(
      '```ts\nconst answer = 42;\n```\n\n```suggestion\nreturn answer\n```\n\n```unknown\n<script>unsafe()</script>\n```',
    )
    expect(root.querySelector('.hljs-keyword')?.textContent).toBe('const')
    expect(root.textContent).toContain('Suggested change')
    expect(root.querySelectorAll('pre code')[2]?.textContent).toBe('<script>unsafe()</script>')
    expect(root.querySelector('script')).toBeNull()
    expect(root.querySelectorAll('.md-copy-code')).toHaveLength(3)
  })
  it('strips executable HTML, styles, forged controls, and unsafe links/images', () => {
    const root = render(
      '<script>alert(1)</script><iframe src="https://example.com"></iframe><img src="x" onerror="alert(1)"><a href="javascript:alert(1)" onclick="bad()">bad</a><a href="file:///etc/passwd">file</a><div class="operation-backdrop" style="position:fixed">overlay</div><button class="md-copy-code">fake</button><input type="text" value="spoof">',
    )
    expect(
      root.querySelector(
        'script,iframe,button,input,[style],[onerror],[onclick],.operation-backdrop',
      ),
    ).toBeNull()
    expect(root.querySelector('a')).toBeNull()
    expect(root.innerHTML).not.toContain('javascript:')
    expect(root.innerHTML).not.toContain('file:///')
  })
  it('links mentions and issue references in prose while leaving code unchanged', () => {
    const root = render('Thanks @alice, see #42 and `@bob #5`.\n\n```txt\n@carol #7\n```')
    expect([...root.querySelectorAll('a')].map((a) => a.href)).toEqual([
      'https://github.com/alice',
      'https://github.com/owner/repo/issues/42',
    ])
    expect(root.querySelector('pre code')?.textContent).toBe('@carol #7')
  })
  it('resolves relative links against the PR head and prevents in-app navigation', async () => {
    const wrapper = mount(MarkdownBody, {
      props: { body: '[Source](src/main.go)', baseUrl, repoUrl },
    })
    await wrapper.get('a').trigger('click')
    expect(wrapper.emitted('open')).toEqual([
      ['https://github.com/owner/repo/blob/abc123/src/main.go'],
    ])
    wrapper.unmount()
  })
  it('copies the original code text without highlighting markup', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = mount(MarkdownBody, { props: { body: '```js\nconst value = "<tag>";\n```' } })
    await wrapper.get('.md-copy-code').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('const value = "<tag>";')
    expect(wrapper.get('[role="status"]').text()).toBe('Code copied.')
    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})

import { Marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
const parser = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? '').split(/\s/)[0]?.toLowerCase() ?? ''
      let content = escape(text)
      if (text.length <= 20000 && language && hljs.getLanguage(language)) {
        try {
          content = hljs.highlight(text, { language, ignoreIllegals: true }).value
        } catch {
          /* Preserve readable code for unsupported syntax. */
        }
      }
      return `<pre><code class="language-${escape(language)}">${content}</code></pre>`
    },
  },
})

export function safeMarkdownURL(value: string, baseUrl?: string): string | undefined {
  if (!value.trim()) return undefined
  try {
    const url = new URL(value, baseUrl || undefined)
    if (url.protocol === 'https:') return url.href
  } catch {
    /* Unsafe or incomplete URLs remain plain text. */
  }
}

/** Parse Markdown, sanitize all untrusted HTML, then add controls using DOM APIs. */
export function renderMarkdown(body: string, baseUrl?: string, repoUrl?: string): string {
  const fragment = DOMPurify.sanitize(parser.parse(body, { async: false }), {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'b',
      'em',
      'i',
      'del',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'pre',
      'code',
      'span',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'input',
      'details',
      'summary',
      'kbd',
      'sup',
      'sub',
    ],
    ALLOWED_ATTR: [
      'href',
      'src',
      'alt',
      'title',
      'class',
      'type',
      'checked',
      'disabled',
      'start',
      'align',
      'colspan',
      'rowspan',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })
  const root = document.createElement('div')
  root.append(fragment)
  for (const element of root.querySelectorAll('[class]')) {
    element.className = [...element.classList]
      .filter((name) => /^(?:hljs(?:-[a-z0-9_-]+)?|language-[a-z0-9_+-]*)$/i.test(name))
      .join(' ')
  }
  for (const input of root.querySelectorAll('input')) {
    if (input.type !== 'checkbox') input.remove()
    else {
      input.disabled = true
      input.setAttribute('aria-label', input.checked ? 'Completed task' : 'Incomplete task')
    }
  }
  for (const link of root.querySelectorAll('a')) {
    const url = safeMarkdownURL(link.getAttribute('href') ?? '', baseUrl)
    if (!url) {
      link.replaceWith(...link.childNodes)
      continue
    }
    link.href = url
    link.rel = 'noopener noreferrer'
  }
  for (const img of root.querySelectorAll('img')) {
    const url = safeMarkdownURL(img.getAttribute('src') ?? '', baseUrl)
    if (!url) {
      img.replaceWith(document.createTextNode(img.alt))
      continue
    }
    const source = new URL(url)
    if (source.hostname === 'github.com' && source.pathname.includes('/blob/'))
      source.searchParams.set('raw', 'true')
    img.src = source.href
    img.loading = 'lazy'
    img.referrerPolicy = 'no-referrer'
  }
  // GitHub references are linked only in prose, never inside code or existing links.
  if (repoUrl && /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(repoUrl)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    for (const node of nodes) {
      if (node.parentElement?.closest('a,pre,code,kbd')) continue
      const text = node.data
      const matches = [...text.matchAll(/(^|[\s(])(@[a-z\d](?:[a-z\d-]*[a-z\d])?|#\d+)\b/gi)]
      if (!matches.length) continue
      const replacement = document.createDocumentFragment()
      let offset = 0
      for (const match of matches) {
        const start = match.index! + match[1]!.length
        replacement.append(document.createTextNode(text.slice(offset, start)))
        const link = document.createElement('a')
        link.textContent = match[2]!
        link.href = match[2]!.startsWith('@')
          ? `https://github.com/${match[2]!.slice(1)}`
          : `${repoUrl}/issues/${match[2]!.slice(1)}`
        link.rel = 'noopener noreferrer'
        replacement.append(link)
        offset = start + match[2]!.length
      }
      replacement.append(document.createTextNode(text.slice(offset)))
      node.replaceWith(replacement)
    }
  }
  for (const pre of root.querySelectorAll('pre')) {
    const code = pre.querySelector('code')
    if (!code) continue
    const language =
      [...code.classList].find((name) => name.startsWith('language-'))?.slice(9) ?? ''
    const wrapper = document.createElement('figure')
    wrapper.className = 'md-code-block'
    const header = document.createElement('figcaption')
    const label = document.createElement('span')
    label.textContent = language === 'suggestion' ? 'Suggested change' : language || 'Code'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.textContent = 'Copy'
    copy.className = 'md-copy-code'
    copy.setAttribute('aria-label', 'Copy code')
    header.append(label, copy)
    pre.replaceWith(wrapper)
    wrapper.append(header, pre)
    pre.tabIndex = 0
    pre.setAttribute('aria-label', `${label.textContent} block`)
  }
  for (const table of root.querySelectorAll('table')) {
    const scroller = document.createElement('div')
    scroller.className = 'md-table'
    scroller.tabIndex = 0
    scroller.setAttribute('role', 'region')
    scroller.setAttribute('aria-label', 'Comment table')
    table.replaceWith(scroller)
    scroller.append(table)
  }
  return root.innerHTML
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FinderBar from '../components/shell/FinderBar.vue'
import { useWorkspaces } from '../composables/useWorkspaces'
import { useGitProfiles } from '../composables/useGitProfiles'
import { finderHistory } from '../components/shell/finderHistory'

vi.mock('@wailsio/runtime', () => ({ Events: { On: vi.fn<(...args: unknown[]) => () => void>(() => () => {}) } }))
vi.mock('../composables/useGitProfiles', () => { const state = { profiles: [], error: '' }; return { useGitProfiles: () => ({ state, ready: async () => {}, effective: async () => {} }) } })
const openRepo = vi.fn<(path: string) => Promise<{ Path: string; Name: string | undefined }>>(async (path: string) => ({ Path: path, Name: path.split('/').pop() }))
const checkoutBranch = vi.fn<(name: string, create: boolean) => Promise<void>>(() => Promise.resolve())
const searchCommits = vi.fn<() => Promise<{ Hash: string; ShortHash: string; Message: string }[]>>(() =>
  Promise.resolve([{ Hash: '0ba44b3aaaa', ShortHash: '0ba44b3', Message: 'first iteration of the diff view' }]),
)
const listFiles = vi.fn<() => Promise<string[]>>(() => Promise.resolve(['src/components/diff/DiffView.vue', 'src/theme/shell.css']))

const branch = (over: Record<string, unknown>) => ({
  Name: '',
  IsRemote: false,
  IsCurrent: false,
  IsTracking: false,
  Upstream: '',
  Ahead: 0,
  Behind: 0,
  LastCommit: '',
  LastMsg: '',
  ...over,
})

vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: { Info: async () => null, Open: (path: string) => openRepo(path) },
  RefService: {
    ListBranches: () =>
      Promise.resolve([
        branch({ Name: 'main', IsCurrent: true }),
        branch({ Name: 'feature/diff-view', Ahead: 4 }),
      ]),
    CheckoutBranch: (name: string, create: boolean) => checkoutBranch(name, create),
    DeleteBranch: () => Promise.resolve(),
  },
  GraphService: {
    SearchCommits: () => searchCommits(),
  },
  InspectService: { WorkingFilePreview: async () => ({ Content: 'export const preview = true', Binary: false, Truncated: false }) },
  SearchService: {
    Capabilities: async () => ({ ContentAvailable: true }),
    Files: async (query: string) => ({ Matches: (await listFiles()).filter(path => path.toLowerCase().includes(query.toLowerCase())).map(Path => ({ Path, Score: 0 })), Total: 2 }),
    Content: async () => ({ Matches: [{ Path: 'src/theme/shell.css', Line: 7, Column: 1, Text: 'preview content match' }], Truncated: false }),
  },
}))

function press(key: string, opts: KeyboardEventInit = {}) {
  (document.activeElement ?? window).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }))
}

async function mountBar(initialQuery = '') {
  const wrapper = mount(FinderBar, { props: { initialQuery }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('FinderBar', () => {
  it('finds and opens the Diff page without a search prefix', async () => {
    const wrapper = await mountBar('diff')
    try {
      const result = wrapper.get('[aria-label="view: Diff"]')
      await result.trigger('click')
      expect(wrapper.emitted('navigate')?.[0]).toEqual(['diff'])
    } finally { wrapper.unmount() }
  })
  it('searches contents through g: and opens the matching file', async () => {
    vi.useFakeTimers()
    const wrapper = await mountBar('g:preview')
    try {
      await vi.advanceTimersByTimeAsync(200)
      expect(wrapper.text()).toContain('preview content match')
      expect(wrapper.text()).toContain('src/theme/shell.css:7')
      await wrapper.get('.fb-row').trigger('click')
      expect(wrapper.emitted('navigate')?.[0]).toEqual(['blame', 'src/theme/shell.css'])
    } finally { wrapper.unmount() }
  })
  beforeEach(() => {
    useWorkspaces().state.repos = []
    useWorkspaces().state.workspaces = [{ id: 'personal', name: 'Personal', color: '#aabbcc' }]
    useGitProfiles().state.profiles = []
    openRepo.mockClear()
    checkoutBranch.mockClear()
    searchCommits.mockClear()
    listFiles.mockClear()
    finderHistory.searches = []
    finderHistory.files = []
  })
  afterEach(() => { vi.useRealTimers() })

  it('opens one focused search input with suggested navigation', async () => {
    const wrapper = await mountBar()
    try {
      expect(document.activeElement).toBe(wrapper.get('input').element)
      expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
      expect(wrapper.find('.fb-scopes').exists()).toBe(false)
      expect(wrapper.findAll('.fb-row').every(row => row.attributes('aria-label')?.startsWith('view:'))).toBe(true)
      expect(listFiles).toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
  it('searches all sources from a submitted header query', async () => {
    vi.useFakeTimers()
    const wrapper = await mountBar('diff')
    try {
      await vi.advanceTimersByTimeAsync(200)
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('diff')
      expect(wrapper.text()).toContain('feature/diff-view')
      expect(wrapper.text()).toContain('DiffView.vue')
      expect(wrapper.text()).toContain('src/components/diff/')
      expect(searchCommits).toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
  it('accepts a pasted prefix and inspects a branch without checking it out', async () => {
    const wrapper = await mountBar()
    try {
      await wrapper.get('input').setValue('b:di')
      await flushPromises()
      expect(wrapper.get('.fb-scope-chip').text()).toContain('b:')
      expect((wrapper.get('input').element as HTMLInputElement).value).toBe('di')
      press('Enter')
      await flushPromises()
      expect(checkoutBranch).not.toHaveBeenCalled()
      expect(wrapper.emitted('navigate')?.[0]).toEqual(['branches', 'feature/diff-view'])
      expect(wrapper.emitted('close')).toBeTruthy()
    } finally { wrapper.unmount() }
  })
  it('suggests optional prefixes and previews files on demand', async () => {
    const wrapper = await mountBar('f')
    try {
      expect(wrapper.get('.fb-prefixes').text()).toContain('f:')
      await wrapper.get('.fb-prefixes button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fb-scope-chip').text()).toContain('f:')
      expect(wrapper.find('.fb-preview').exists()).toBe(false)
      await wrapper.get('.fb-preview-toggle').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fb-preview').text()).toContain('export const preview = true')
      press('ArrowLeft')
      await flushPromises()
      expect(wrapper.find('.fb-preview').exists()).toBe(false)
      expect(document.activeElement).toBe(wrapper.get('input').element)
    } finally { wrapper.unmount() }
  })
  it('does not offer create or delete mutations from branch search', async () => {
    const wrapper = await mountBar('b:fix/new-thing')
    try {
      expect(wrapper.findAll('.fb-row')).toHaveLength(0)
      press('Enter')
      expect(checkoutBranch).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
  it('moves down through visible results and activates the selected view', async () => {
    const wrapper = await mountBar()
    try {
      const rows = wrapper.findAll('.fb-row')
      const expectedLabel = rows[1]!.get('.fb-label').text()
      press('ArrowDown')
      await flushPromises()
      expect(wrapper.get('.fb-row.sel .fb-label').text()).toBe(expectedLabel)
      expect(wrapper.get('input').attributes('aria-activedescendant')).toBe(rows[1]!.attributes('id'))
      press('ArrowUp')
      await flushPromises()
      expect(wrapper.get('.fb-row.sel .fb-label').text()).toBe(rows[0]!.get('.fb-label').text())
      await wrapper.get('input').setValue('v:bran')
      await flushPromises()
      press('Enter')
      expect(wrapper.emitted('navigate')?.[0]).toEqual(['branches'])
    } finally { wrapper.unmount() }
  })
  it('returns to All on empty Backspace and closes immediately on Escape', async () => {
    const wrapper = await mountBar('f:')
    try {
      press('Backspace')
      await flushPromises()
      expect(wrapper.find('.fb-scope-chip').exists()).toBe(false)
      await wrapper.get('input').setValue('anything')
      press('Escape')
      expect(wrapper.emitted('close')).toBeTruthy()
    } finally { wrapper.unmount() }
  })
  it('keeps native editing shortcuts and IME while blocking shell key handlers', async () => {
    const wrapper = await mountBar()
    const shellKey = vi.fn<(event: KeyboardEvent) => void>()
    window.addEventListener('keydown', shellKey)
    try {
      const input = wrapper.get('input').element
      for (const options of [{ key: 'a', ctrlKey: true }, { key: 'v', metaKey: true }, { key: 'ArrowLeft' }, { key: 'Enter', isComposing: true }]) {
        const event = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true })
        input.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      expect(shellKey).not.toHaveBeenCalled()
      expect(wrapper.emitted('navigate')).toBeFalsy()
    } finally { window.removeEventListener('keydown', shellKey); wrapper.unmount() }
  })
  it('debounces commit search and jumps to graph', async () => {
    vi.useFakeTimers()
    const wrapper = await mountBar('c:di')
    try {
      await vi.advanceTimersByTimeAsync(200)
      expect(searchCommits).toHaveBeenCalledTimes(1)
      expect(wrapper.get('.fb-row .fb-label').text()).toContain('first iteration')
      press('Enter')
      expect(wrapper.emitted('navigate')?.[0]).toEqual(['graph', '0ba44b3aaaa'])
    } finally { wrapper.unmount() }
  })
  it('ignores stale commit responses after the query changes', async () => {
    vi.useFakeTimers()
    let resolve!: (value: Awaited<ReturnType<typeof searchCommits>>) => void
    searchCommits.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = await mountBar('c:old')
    try {
      await vi.advanceTimersByTimeAsync(200)
      await wrapper.get('input').setValue('new')
      resolve([{ Hash: 'old', ShortHash: 'old', Message: 'stale result' }])
      await flushPromises()
      expect(wrapper.text()).not.toContain('stale result')
      await vi.advanceTimersByTimeAsync(200)
      expect(wrapper.text()).toContain('first iteration')
    } finally { wrapper.unmount() }
  })
  it('shows recent searches and files on reopening and restores focus', async () => {
    const launcher = document.createElement('button')
    document.body.append(launcher)
    launcher.focus()
    const first = await mountBar('f:shell')
    press('Enter')
    expect(first.emitted('navigate')?.[0]).toEqual(['file-log', 'src/theme/shell.css'])
    first.unmount()
    expect(document.activeElement).toBe(launcher)
    const second = await mountBar()
    try {
      expect(second.text()).toContain('f:shell')
      expect(second.text()).toContain('shell.css')
      await second.get('[aria-label="search: f:shell"]').trigger('click')
      await flushPromises()
      expect(second.get('.fb-scope-chip').text()).toContain('f:')
      expect((second.get('input').element as HTMLInputElement).value).toBe('shell')
    } finally { second.unmount(); launcher.remove() }
  })
  it('finds a repository by path and opens it from r: search', async () => {
    useWorkspaces().saveRepo('/projects/relay', 'Relay API', 'personal')
    const wrapper = await mountBar('r:projects/relay')
    try {
      expect(wrapper.find('.fb-row').text()).toContain('Relay API')
      press('Enter')
      await flushPromises()
      expect(openRepo).toHaveBeenCalledWith('/projects/relay')
      expect(wrapper.emitted('close')).toHaveLength(1)
    } finally { wrapper.unmount() }
  })
  it('narrows workspace results to repositories and profiles open assignment settings', async () => {
    const ws = useWorkspaces()
    ws.saveRepo('/projects/relay', 'Relay', 'personal')
    const wrapper = await mountBar('w:Personal')
    try {
      press('Enter'); await flushPromises()
      expect(wrapper.get('.fb-scope-chip').text()).toContain('r:')
      expect(wrapper.text()).toContain('Workspace: Personal')
      expect(wrapper.text()).toContain('Relay')
    } finally { wrapper.unmount() }
    useGitProfiles().state.profiles = [{ ID: '/work.gitconfig', Label: 'Work', Name: 'Work User', Email: 'work@example.test', Source: '/work.gitconfig', SigningEnabled: 'false', TagSigningEnabled: 'false', SigningKey: '', SigningFormat: 'openpgp' }]
    const profile = await mountBar('p:work@example.test')
    try {
      expect(profile.text()).toContain('Work User')
      press('Enter'); await flushPromises()
      expect(profile.emitted('profile')).toEqual([['/work.gitconfig']])
    } finally { profile.unmount() }
  })

})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FinderBar from '../components/shell/FinderBar.vue'
import { useShellSettings } from '../composables/useShellSettings'

const checkoutBranch = vi.fn<(name: string, create: boolean) => Promise<void>>(() => Promise.resolve())
const searchCommits = vi.fn(() =>
  Promise.resolve([{ Hash: '0ba44b3aaaa', ShortHash: '0ba44b3', Message: 'first iteration of the diff view' }]),
)
const listFiles = vi.fn(() => Promise.resolve(['src/components/diff/DiffView.vue', 'src/theme/shell.css']))

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
    SearchCommits: (q: string, n: number) => searchCommits(),
  },
  CompletionService: {
    ListFiles: () => listFiles(),
  },
}))

function press(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...opts }))
}

async function type(text: string) {
  for (const ch of text) press(ch)
  await flushPromises()
}

async function mountBar() {
  const wrapper = mount(FinderBar, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

describe('FinderBar', () => {
  beforeEach(() => {
    checkoutBranch.mockClear()
    searchCommits.mockClear()
    listFiles.mockClear()
  })

  afterEach(() => {
    useShellSettings().finderUnified = false
  })

  it('searches all sources from a submitted header query without changing the saved mode', async () => {
    useShellSettings().finderUnified = false
    vi.useFakeTimers()
    const wrapper = mount(FinderBar, { props: { initialQuery: 'diff' }, attachTo: document.body })
    try {
      await flushPromises()
      await vi.advanceTimersByTimeAsync(200)
      await flushPromises()
      expect(wrapper.find('.fb-query').text()).toBe('diff')
      expect(wrapper.text()).toContain('feature/diff-view')
      expect(wrapper.text()).toContain('src/components/diff/DiffView.vue')
      expect(searchCommits).toHaveBeenCalled()
      expect(useShellSettings().finderUnified).toBe(false)
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('shows the four modes at root and locks one on its key', async () => {
    const wrapper = await mountBar()
    const rows = wrapper.findAll('.fb-row')
    expect(rows.map((r) => r.find('.fb-label').text())).toEqual(['Branches', 'Commits', 'Files', 'Views'])
    expect(wrapper.find('.fb-badge').text()).toBe('find›')

    press('b')
    await flushPromises()
    expect(wrapper.find('.fb-badge').text()).toBe('branch›')
    expect(wrapper.findAll('.fb-row').map((r) => r.find('.fb-label').text())).toEqual(['main', 'feature/diff-view'])
    wrapper.unmount()
  })

  it('filters branches and checks out on enter', async () => {
    const wrapper = await mountBar()
    press('b')
    await type('di')
    const rows = wrapper.findAll('.fb-row')
    expect(rows[0]!.text()).toContain('feature/diff-view')
    press('Enter')
    await flushPromises()
    expect(checkoutBranch).toHaveBeenCalledWith('feature/diff-view', false)
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('offers create-from-query when nothing matches exactly', async () => {
    const wrapper = await mountBar()
    press('b')
    await type('fix/new-thing')
    const create = wrapper.findAll('.fb-row').find((r) => r.classes().includes('create'))
    expect(create).toBeTruthy()
    expect(create!.text()).toContain('create branch “fix/new-thing”')
    wrapper.unmount()
  })

  it('navigates on view mode enter', async () => {
    const wrapper = await mountBar()
    press('v')
    await type('bran')
    press('Enter')
    await flushPromises()
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['branches'])
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('loads files lazily and backspace returns to root, esc closes', async () => {
    const wrapper = await mountBar()
    press('f')
    await flushPromises()
    expect(listFiles).toHaveBeenCalled()
    await type('shell')
    expect(wrapper.find('.fb-row .fb-label').text()).toContain('shell.css')

    for (let i = 0; i < 'shell'.length; i++) press('Backspace')
    press('Backspace')
    await flushPromises()
    expect(wrapper.find('.fb-badge').text()).toBe('find›')

    press('Escape')
    await flushPromises()
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('swallows keys so nothing reaches shell nav while open', async () => {
    const wrapper = await mountBar()
    const g = new KeyboardEvent('keydown', { key: 'g', cancelable: true })
    window.dispatchEvent(g)
    expect(g.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('unified: typing at root searches all kinds grouped by type', async () => {
    useShellSettings().finderUnified = true
    const wrapper = await mountBar()
    // files load eagerly in unified mode
    expect(listFiles).toHaveBeenCalled()
    // mode rows still show at empty query, with prefix-style hints
    expect(wrapper.findAll('.fb-row kbd')[0]!.text()).toBe('b:')

    await type('di')
    const kinds = wrapper.findAll('.fb-row').map((r) => r.find('.fb-kind').exists() ? r.find('.fb-kind').text() : 'mode')
    expect(kinds).toContain('view')
    expect(kinds).toContain('branch')
    expect(kinds).toContain('file')
    // grouped: kinds are contiguous, separators mark group starts
    expect(wrapper.findAll('.fb-row.group-start').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('feature/diff-view')
    expect(wrapper.text()).toContain('DiffView.vue')
    wrapper.unmount()
  })

  it('unified: b: prefix locks branch mode', async () => {
    useShellSettings().finderUnified = true
    const wrapper = await mountBar()
    await type('b:di')
    expect(wrapper.find('.fb-badge').text()).toBe('branch›')
    expect(wrapper.findAll('.fb-row')[0]!.text()).toContain('feature/diff-view')
    wrapper.unmount()
  })

  it('debounces commit search and jumps to graph on enter', async () => {
    vi.useFakeTimers()
    const wrapper = mount(FinderBar, { attachTo: document.body })
    await vi.runAllTimersAsync()
    press('c')
    press('d')
    press('i')
    await vi.advanceTimersByTimeAsync(200)
    expect(searchCommits).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.fb-row .fb-label').text()).toContain('first iteration')
    press('Enter')
    await vi.runAllTimersAsync()
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['graph', '0ba44b3aaaa'])
    vi.useRealTimers()
    wrapper.unmount()
  })
})

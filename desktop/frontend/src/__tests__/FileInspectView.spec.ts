import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import DiffView from '../components/diff/DiffView.vue'
import FileInspectView from '../components/inspect/FileInspectView.vue'
import { useShellSettings } from '../composables/useShellSettings'
import { useFileInspect } from '../composables/useFileInspect'

const fileLog = vi.fn((file: string, limit: number) =>
  Promise.resolve([
    { Hash: 'a'.repeat(40), ShortHash: 'aaaaaaa', Subject: 'fix: rail alignment', Author: 'atterpac', Date: '3 days ago', Insertions: 9, Deletions: 2 },
    { Hash: 'b'.repeat(40), ShortHash: 'bbbbbbb', Subject: 'feat: commit limit', Author: 'mika', Date: '3 weeks ago', Insertions: 4, Deletions: 1 },
    { Hash: 'c'.repeat(40), ShortHash: 'ccccccc', Subject: 'first iteration', Author: 'atterpac', Date: '4 months ago', Insertions: 120, Deletions: 0 },
  ]),
)
const blame = vi.fn(() =>
  Promise.resolve([
    { Hash: 'a'.repeat(40), ShortHash: 'aaaaaaa', Author: 'atterpac', AuthorMail: '', Date: '1700000000', LineNumber: 1, OrigLine: 1, Content: 'package git' },
    { Hash: 'a'.repeat(40), ShortHash: 'aaaaaaa', Author: 'atterpac', AuthorMail: '', Date: '1700000000', LineNumber: 2, OrigLine: 2, Content: '' },
    { Hash: 'b'.repeat(40), ShortHash: 'bbbbbbb', Author: 'mika', AuthorMail: '', Date: '1690000000', LineNumber: 3, OrigLine: 3, Content: 'import "fmt"' },
  ]),
)
const blameAtCommit = vi.fn((file: string, hash: string) => blame())
const fileDiff = vi.fn(() => Promise.resolve('raw-diff'))
const parseDiff = vi.fn(() => Promise.resolve([{ Path: 'internal/git/commits.go', Hunks: [] }]))

vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  InspectService: {
    FileLog: (file: string, limit: number) => fileLog(file, limit),
    Blame: () => blame(),
    BlameAtCommit: (file: string, hash: string) => blameAtCommit(file, hash),
    FileContent: () => Promise.resolve(''),
    WorkingFileContent: () => Promise.resolve(''),
  },
  DiffService: {
    FileDiff: () => fileDiff(),
    ParseDiff: () => parseDiff(),
  },
}))

async function mountView(props: Record<string, unknown> = {}) {
  const wrapper = mount(FileInspectView, {
    props: { focusFile: 'internal/git/commits.go', ...props },
    global: { stubs: { DiffView: true } },
  })
  await flushPromises()
  return wrapper
}

describe('FileInspectView', () => {
  beforeEach(() => {
    fileLog.mockClear()
    blame.mockClear()
    blameAtCommit.mockClear()
    fileDiff.mockClear()
    useFileInspect().file = ''
    useShellSettings().inspectMode = 'log'
    useShellSettings().inspectScrubber = false
  })

  it('returns focus to history when the diff emits exit', async () => {
    const wrapper = mount(FileInspectView, { props: { focusFile: 'internal/git/commits.go' }, attachTo: document.body, global: { stubs: { DiffView: true } } })
    await flushPromises()
    wrapper.findComponent(DiffView).vm.$emit('exit')
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.find('.fi-rail').element)
    wrapper.unmount()
  })

  it('shows an empty state without a file', async () => {
    const wrapper = mount(FileInspectView, { global: { stubs: { DiffView: true } } })
    await flushPromises()
    expect(wrapper.find('.inspect-empty').exists()).toBe(true)
    wrapper.unmount()
  })

  it('loads the file log, selects the newest commit, and fetches its diff', async () => {
    const wrapper = await mountView()
    expect(fileLog).toHaveBeenCalledWith('internal/git/commits.go', 300)
    const rows = wrapper.findAll('.fi-commit')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.classes()).toContain('sel')
    expect(rows[0]!.text()).toContain('fix: rail alignment')
    expect(fileDiff).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders grouped blame runs in blame mode', async () => {
    useShellSettings().inspectMode = 'blame'
    const wrapper = await mountView({ modeHint: 'blame' })
    expect(blame).toHaveBeenCalled()
    const lines = wrapper.findAll('.fi-bl')
    expect(lines).toHaveLength(3)
    // first run spans two lines but labels only the first
    const gutters = wrapper.findAll('.fi-bl-gutter')
    expect(gutters[0]!.text()).toContain('aaaaaaa')
    expect(gutters[1]!.text()).toBe('')
    expect(gutters[2]!.text()).toContain('bbbbbbb')
    wrapper.unmount()
  })

  it('re-blames at the selected commit from the blame footer', async () => {
    useShellSettings().inspectMode = 'blame'
    const wrapper = await mountView({ modeHint: 'blame' })
    const footButtons = wrapper.findAll('.fi-blame-foot button')
    await footButtons[0]!.trigger('click')
    await flushPromises()
    expect(blameAtCommit).toHaveBeenCalledWith('internal/git/commits.go', 'a'.repeat(40))
    expect(wrapper.find('.fi-blame-at').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows history, blame, and commit detail together in inspector mode', async () => {
    useShellSettings().inspectMode = 'inspector'
    const wrapper = await mountView()
    expect(wrapper.find('.fi-rail').exists()).toBe(true)
    expect(wrapper.findAll('.fi-bl').length).toBeGreaterThan(0)
    const detail = wrapper.find('.fi-detail')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('fix: rail alignment')
    expect(detail.text()).toContain('atterpac')
    wrapper.unmount()
  })

  it('renders scrubber dots when enabled and steps selection with arrows', async () => {
    useShellSettings().inspectScrubber = true
    const wrapper = await mountView()
    const dots = wrapper.findAll('.fi-scrub-dot')
    expect(dots).toHaveLength(3)
    const scrubber = wrapper.find('.fi-scrubber')
    await scrubber.trigger('keydown.left')
    await flushPromises()
    expect(wrapper.findAll('.fi-commit')[1]!.classes()).toContain('sel')
    expect(wrapper.find('.fi-scrub-label').text()).toContain('bbbbbbb')
    wrapper.unmount()
  })

  it('moves the rail selection with vim j/k and opens the commit in graph on enter', async () => {
    const wrapper = await mountView()
    const rail = wrapper.find('.fi-rail')
    await rail.trigger('keydown', { key: 'j' })
    expect(wrapper.findAll('.fi-commit')[1]!.classes()).toContain('sel')
    await rail.trigger('keydown', { key: 'k' })
    expect(wrapper.findAll('.fi-commit')[0]!.classes()).toContain('sel')
    await rail.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['graph', 'a'.repeat(40)])
    wrapper.unmount()
  })

  it('re-blames at the rail cursor commit with b and switches to blame mode', async () => {
    const wrapper = await mountView()
    const rail = wrapper.find('.fi-rail')
    await rail.trigger('keydown', { key: 'j' })
    await rail.trigger('keydown', { key: 'b' })
    await flushPromises()
    expect(useShellSettings().inspectMode).toBe('blame')
    expect(blameAtCommit).toHaveBeenCalledWith('internal/git/commits.go', 'b'.repeat(40))
    wrapper.unmount()
  })

  it('selects a blame line commit with vim enter in the ledger', async () => {
    useShellSettings().inspectMode = 'blame'
    const wrapper = await mountView({ modeHint: 'blame' })
    const ledger = wrapper.find('.fi-blame')
    await ledger.trigger('keydown', { key: 'j' })
    await ledger.trigger('keydown', { key: 'j' })
    await ledger.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.find('.fi-blame-foot').text()).toContain('bbbbbbb')
    wrapper.unmount()
  })

  it('emits navigate to graph for the selected commit from inspector detail', async () => {
    useShellSettings().inspectMode = 'inspector'
    const wrapper = await mountView()
    const buttons = wrapper.findAll('.fi-actions button')
    await buttons[0]!.trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['graph', 'a'.repeat(40)])
    wrapper.unmount()
  })
})

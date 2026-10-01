import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { clearSharedCommitDetails } from '../components/graph/commitDetailCache'
import { invalidateNavigationSnapshots, peekNavigationSnapshot } from '../composables/navigationSnapshots'
import GraphView from '../components/graph/GraphView.vue'
import GraphSvg from '../components/graph/GraphSvg.vue'
import { usePreferences, usePreferenceBindings } from '../customization/usePreferences'

const stashOps = vi.hoisted(() => ({
  commit: vi.fn<(message: string) => Promise<void>>(), push: vi.fn<(message: string, untracked: boolean) => Promise<void>>(),
  apply: vi.fn<(index: number) => Promise<void>>(), pop: vi.fn<(index: number) => Promise<void>>(), drop: vi.fn<(index: number) => Promise<void>>(),
}))
const worktree = vi.hoisted(() => ({ stagedFiles: 0 }))
const { loadCommit, loadMetadata, push, repoInfo, layoutStarted, summary, customLayout } = vi.hoisted(() => ({
  customLayout: vi.fn<() => unknown>(), loadMetadata: vi.fn<(...args: unknown[]) => Promise<unknown>>(), loadCommit: vi.fn<(...args: unknown[]) => Promise<unknown>>(), push: vi.fn<() => Promise<void>>(), repoInfo: vi.fn<() => Promise<unknown>>(), layoutStarted: vi.fn<() => void>(), summary: vi.fn<() => Promise<unknown>>(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: { Info: repoInfo },
  StashService: { StashPush: stashOps.push, StashApplyIndex: stashOps.apply, StashPopIndex: stashOps.pop, StashDropIndex: stashOps.drop },
  WorktreeService: { Commit: stashOps.commit, Summary: async () => ({ Summary: await summary(), Info: { Branch: 'main', Ahead: 0, Behind: 0, Staged: { Files: worktree.stagedFiles, Insertions: 0, Deletions: 0 }, Unstaged: { Insertions: 7, Deletions: 2 } } }) },
  RemoteService: { HasUpstream: async () => true, Push: push },
  GraphService: {
    LoadGraphLayout: async () => {
      layoutStarted()
      const custom = customLayout()
      if (custom) return { ...await custom as object, Info: await repoInfo() }
      return {
        Info: await repoInfo(),
        LaneCount: 1,
        Rows: [
          {
            Lanes: [],
            Commit: {
              Hash: 'abcdef1234567890',
              ShortHash: 'abcdef1',
              Message: 'Refine the inspector',
              Author: 'Alex Chen',
              Date: '2026-09-24T12:00:00Z',
              Decorations: ['main', 'release', 'feature/one', 'feature/two'].map((Name, index) => ({ Name, Kind: 'branch', IsHead: index === 0 })),
              Refs: [],
            },
          },
          {
            Lanes: [],
            Commit: {
              Hash: 'second1234567890', ShortHash: 'second1', Message: 'Earlier commit',
              Author: 'Sam Rivera', Date: '2026-09-23T12:00:00Z', Decorations: [{ Name: 'older', Kind: 'branch', IsHead: false }, { Name: 'origin/older', Kind: 'remote', IsHead: false }], Refs: [],
            },
          },
        ],
      }
    },
    LoadCommit: loadCommit,
    LoadCommitMetadata: loadMetadata,
  },
}))
const detail = {
  Subject: 'Refine the inspector',
  Body: 'More readable commit details.',
  Author: 'Alex Chen',
  AuthorEmail: 'alex@example.com',
  AuthorDate: '2026-09-24T12:00:00Z',
  Stats: { FilesChanged: 1, Insertions: 8, Deletions: 2 },
  Files: [{ Status: 0, Path: 'src/theme/graph.css', Insertions: 8, Deletions: 2 }],
  Branches: ['main'],
  GPGStatus: { Signed: false },
}
async function mountView() {
  const wrapper = mount(GraphView, {
    attachTo: document.body,
    global: { stubs: { Teleport: true, GraphSvg: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  invalidateNavigationSnapshots()
  Element.prototype.scrollIntoView = vi.fn<() => void>()
  clearSharedCommitDetails()
  loadMetadata.mockReset().mockResolvedValue({ Branches: ['main'], GPGStatus: { Signed: false } })
  repoInfo.mockReset().mockResolvedValue({ Branch: 'main', Ahead: 2, Behind: 0 })
  layoutStarted.mockClear()
  customLayout.mockReset()
  loadCommit.mockReset().mockResolvedValue(detail)
  push.mockReset().mockResolvedValue(undefined)
  Object.assign(usePreferenceBindings(), {
    'graph.detailPosition': 'right',
    'graph.detailShowAuthorDate': true,
    'graph.detailHash': 'full',
    'graph.rowDensity': 'comfortable',
  })
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Graph inspector refresh', () => {
  it('focuses the graph on launch so commit navigation works immediately', async () => {
    const wrapper = await mountView()
    try {
      expect(document.activeElement).toBe(wrapper.get('.commit-list').element)
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
      await flushPromises()
      expect(wrapper.get('.commit-row.selected').attributes('data-commit-hash')).toBe('second1234567890')
    } finally { wrapper.unmount() }
  })

  it('waits for startup syncing to finish before focusing the graph', async () => {
    const wrapper = mount(GraphView, {
      props: { focusBlocked: true }, attachTo: document.body,
      global: { stubs: { Teleport: true, GraphSvg: true } },
    })
    try {
      await flushPromises()
      expect(document.activeElement).toBe(document.body)
      await wrapper.setProps({ focusBlocked: false })
      expect(document.activeElement).toBe(wrapper.get('.commit-list').element)
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      await wrapper.setProps({ focusBlocked: true })
      await wrapper.setProps({ focusBlocked: false })
      expect(document.activeElement).toBe(input)
    } finally { wrapper.unmount() }
  })

  it('keeps focus on a control chosen while the graph was loading', async () => {
    let finish!: (value: { Branch: string }) => void
    repoInfo.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const wrapper = await mountView()
    try {
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      finish({ Branch: 'main' })
      await flushPromises()
      expect(document.activeElement).toBe(input)
    } finally { wrapper.unmount() }
  })

  it('loads working-tree counts from summaries without patch APIs', async () => {
    repoInfo.mockResolvedValue({ Branch: 'main', Ahead: 0, Behind: 0, Staged: { Insertions: 0, Deletions: 0 }, Unstaged: { Insertions: 7, Deletions: 2 } })
    summary.mockResolvedValue({
      Entries: [{ Path: 'summary-only.txt', IndexStatus: 0, WorkStatus: 1, IsUntracked: false, IsConflict: false }],
      Working: [{ Path: 'summary-only.txt', Added: 7, Deleted: 2, Binary: false }], Staged: [],
    })
    summary.mockClear()
    const wrapper = mount(GraphView, {
      props: { focusHash: '__ichi_working_changes__' },
      global: { stubs: { Teleport: true, GraphSvg: true } },
    })
    try {
      await flushPromises()
      expect(summary).toHaveBeenCalledTimes(1)
      expect(repoInfo).toHaveBeenCalledTimes(1) // Initial graph load only; working pane reuses Summary.Info.
      expect(wrapper.text()).toContain('summary-only.txt')
      expect(wrapper.text()).toContain('+7')
    } finally { wrapper.unmount() }
  })
  it('loads graph layout while repository info is still pending', async () => {
    let finish!: (value: { Branch: string }) => void
    repoInfo.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const wrapper = await mountView()
    try {
      expect(layoutStarted).toHaveBeenCalledTimes(1)
      expect(wrapper.text()).toContain('Loading history')
      finish({ Branch: 'main' })
      await flushPromises()
      expect(wrapper.findAll('.commit-row')).toHaveLength(2)
    } finally { wrapper.unmount() }
  })
  it('reveals the hovered commit refs, and follows the selection while Shift is held', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const wrapper = await mountView()
    const rows = wrapper.findAll<HTMLButtonElement>('.commit-row')
    rows.forEach(row => { row.element.scrollIntoView = vi.fn<() => void>() })
    await rows[0]!.trigger('pointerenter')
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    expect(rows[0]!.findAll('.ref-expanded .ref-label')).toHaveLength(4)
    await rows[0]!.trigger('pointerleave')
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    rows[0]!.element.focus()
    await rows[0]!.trigger('keydown', { key: 'Shift', shiftKey: true })
    expect(rows[0]!.findAll('.ref-expanded .ref-label')).toHaveLength(4)
    await rows[0]!.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await flushPromises()
    expect(rows[0]!.find('.ref-expanded').exists()).toBe(false)
    expect(rows[1]!.findAll('.ref-expanded .ref-label')).toHaveLength(2)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await rows[1]!.trigger('keydown', { key: 'Shift', shiftKey: true })
    window.dispatchEvent(new Event('blur'))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    await rows[1]!.trigger('keydown', { key: 'Shift', shiftKey: true })
    wrapper.find<HTMLElement>('#commit-inspector').element.focus()
    await flushPromises()
    expect(wrapper.find('.ref-expanded').exists()).toBe(false)
    wrapper.unmount()
  })

  it('moves focus and selection together after clicking, then restores hover on pointer movement', async () => {
    const wrapper = await mountView()
    const rows = wrapper.findAll<HTMLButtonElement>('.commit-row')
    rows.forEach(row => { row.element.scrollIntoView = vi.fn<() => void>() })
    rows[0]!.element.focus()
    await rows[0]!.trigger('click')
    await rows[0]!.trigger('keydown', { key: 'j' })
    await flushPromises()
    expect(document.activeElement).toBe(rows[1]!.element)
    expect(wrapper.findAll('.commit-row.selected')).toHaveLength(1)
    expect(rows[1]!.classes()).toContain('selected')
    expect(rows[0]!.attributes('tabindex')).toBe('-1')
    expect(wrapper.find('.commit-list').classes()).toContain('keyboard-navigation')
    await rows[1]!.trigger('keydown', { key: 'ArrowUp' })
    await flushPromises()
    expect(document.activeElement).toBe(rows[0]!.element)
    expect(rows[0]!.classes()).toContain('selected')
    await wrapper.find('.commit-list').trigger('pointermove')
    expect(wrapper.find('.commit-list').classes()).not.toContain('keyboard-navigation')
    wrapper.unmount()
  })

  it('scrolls lanes independently of the message column and supports Shift-wheel', async () => {
    const wrapper = await mountView()
    const scroller = wrapper.find<HTMLElement>('.graph-lane-scroll')
    Object.defineProperty(scroller.element, 'scrollWidth', { value: 480, configurable: true })
    Object.defineProperty(scroller.element, 'clientWidth', { value: 160, configurable: true })
    scroller.element.scrollLeft = 60
    await scroller.trigger('scroll')
    expect(wrapper.findComponent(GraphSvg).props('scrollOffset')).toBe(60)
    expect(wrapper.findComponent(GraphSvg).props('viewportWidth')).toBe(160)
    expect(wrapper.find<HTMLElement>('.commit-list').element.scrollLeft).toBe(0)
    wrapper.find('.commit-rail').element.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, shiftKey: true, bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(GraphSvg).props('scrollOffset')).toBe(90)
    wrapper.find('.commit-rail').element.dispatchEvent(new WheelEvent('wheel', { deltaY: 30, bubbles: true, cancelable: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent(GraphSvg).props('scrollOffset')).toBe(90)
    expect(wrapper.find('.commit-subject').text()).toBe('Refine the inspector')
    wrapper.unmount()
  })

  it('tabs directly to changed files and returns to the graph with Shift+Tab or Escape', async () => {
    const wrapper = await mountView()
    await wrapper.find('.commit-list').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(wrapper.get('.detail-file-row').element)
    await wrapper.get('.detail-file-row').trigger('keydown', { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(wrapper.get('.commit-list').element)
    await wrapper.find('.commit-list').trigger('keydown', { key: 'Tab' })
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(wrapper.find('.commit-list').element)
    wrapper.unmount()
  })

  it('opens the selected commit diff with Enter instead of focusing the inspector', async () => {
    const wrapper = await mountView()
    try {
      await wrapper.get('.commit-list').trigger('keydown', { key: 'j' })
      await flushPromises()
      await wrapper.get('.commit-row.selected').trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('navigate')).toEqual([['diff', 'second1234567890']])
    } finally { wrapper.unmount() }
  })

  it('reveals a hidden inspector with Tab and focuses the files after loading', async () => {
    usePreferenceBindings()['graph.detailPosition'] = 'hidden'
    let finish!: (value: typeof detail) => void
    loadCommit.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const wrapper = await mountView()
    try {
      await wrapper.get('.commit-list').trigger('keydown', { key: 'Tab' })
      await flushPromises()
      expect(usePreferenceBindings()['graph.detailPosition']).toBe('right')
      finish(detail)
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('.detail-file-row').element)
    } finally { wrapper.unmount() }
  })

  it('keeps file navigation keyboard-accessible and loads metadata only when Details opens', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.detail-author').text()).toBe('Alex Chen')
    expect(wrapper.find('#commit-files-panel').isVisible()).toBe(true)
    await wrapper.find('.detail-file-row').trigger('keydown', { key: 'l' })
    expect(wrapper.emitted('navigate')).toBeUndefined()
    await wrapper.find('.detail-file-row').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['diff', 'abcdef1234567890', 'src/theme/graph.css'])
    expect(wrapper.find('.detail-sha').text()).toContain('abcdef1234567890')
    const refs = wrapper.findAll('.detail-refs [role="listitem"]')
    expect(refs).toHaveLength(4)
    expect(refs[0]!.text()).toContain('main (current branch)')
    expect(refs[3]!.text()).toContain('feature/two')
    expect(wrapper.find('#commit-metadata-panel').exists()).toBe(false)
    expect(loadMetadata).not.toHaveBeenCalled()
    await wrapper.find('.detail-info-toggle').trigger('click')
    await flushPromises()
    expect(wrapper.find('.detail-info-toggle').attributes('aria-expanded')).toBe('true')
    expect(loadMetadata).toHaveBeenCalled()
    expect(wrapper.find('#commit-metadata-panel').text()).toContain('alex@example.com')
    expect(wrapper.find('#commit-metadata-panel .detail-chip').text()).toBe('main')
    expect(wrapper.find('#commit-files-panel').isVisible()).toBe(true)
    await wrapper.find('.detail-info-toggle').trigger('click')
    expect(wrapper.find('#commit-metadata-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('names working changes in the graph row, then commits or stashes them', async () => {
    Object.values(stashOps).forEach(fn => fn.mockReset().mockResolvedValue(undefined))
    worktree.stagedFiles = 2
    repoInfo.mockResolvedValue({ Branch: 'main', Ahead: 0, Behind: 0, Staged: { Files: 2 } })
    customLayout.mockReturnValue({ LaneCount: 1, Rows: [
      { Lanes: [], Commit: { Hash: '__ichi_working_changes__', ShortHash: 'work', Message: 'Working Changes', Author: 'worktree', Date: '2026-09-30T12:00:00Z', Refs: [], Decorations: [] } },
      { Lanes: [], Commit: { Hash: 'abcdef1234567890', ShortHash: 'abcdef1', Message: 'Refine the inspector', Author: 'Alex Chen', Date: '2026-09-24T12:00:00Z', Refs: [], Decorations: [] } },
    ] })
    summary.mockResolvedValue({ Entries: [], Working: [], Staged: [] })
    const wrapper = await mountView()
    try {
      const row = wrapper.get('.commit-row.working')
      expect(row.element.tagName).toBe('DIV')
      const input = row.get<HTMLInputElement>('.wip-input')
      await input.setValue('Polish the graph')
      await input.trigger('keydown', { key: 'j' })
      expect(wrapper.get('.commit-row.selected').classes()).toContain('working')
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(stashOps.commit).toHaveBeenCalledWith('Polish the graph')
      expect(wrapper.get<HTMLInputElement>('.wip-input').element.value).toBe('')
      await wrapper.get('.wip-input').setValue('Shelve the spike')
      await wrapper.get('.wip-input').trigger('keydown', { key: 'Enter', altKey: true })
      await flushPromises()
      expect(stashOps.push).toHaveBeenCalledWith('Shelve the spike', true)
    } finally { wrapper.unmount(); worktree.stagedFiles = 0 }
  })

  it('keeps Commit unavailable until something is staged', async () => {
    repoInfo.mockResolvedValue({ Branch: 'main', Ahead: 0, Behind: 0, Staged: { Files: 0 } })
    customLayout.mockReturnValue({ LaneCount: 1, Rows: [
      { Lanes: [], Commit: { Hash: '__ichi_working_changes__', ShortHash: 'work', Message: 'Working Changes', Author: 'worktree', Date: '2026-09-30T12:00:00Z', Refs: [], Decorations: [] } },
    ] })
    summary.mockResolvedValue({ Entries: [], Working: [], Staged: [] })
    const wrapper = await mountView()
    try {
      await wrapper.get('.wip-input').setValue('Not yet')
      const [commit, stash] = wrapper.findAll('.wip-action')
      expect(commit!.attributes('disabled')).toBeDefined()
      expect(commit!.attributes('title')).toContain('Stage files')
      expect(stash!.attributes('disabled')).toBeUndefined()
    } finally { wrapper.unmount() }
  })

  it('offers apply, pop, and a confirmed drop for a selected stash', async () => {
    Object.values(stashOps).forEach(fn => fn.mockReset().mockResolvedValue(undefined))
    customLayout.mockReturnValue({ LaneCount: 2, Rows: [
      { Lanes: [], Commit: { Hash: 'stash1234567890', ShortHash: 'stash12', Message: 'On main: shelved spike', Author: 'Alex Chen', Date: '2026-09-25T12:00:00Z', IsStash: true, Parents: ['abcdef1234567890'], Refs: ['stash@{1}'], Decorations: [] } },
      { Lanes: [], Commit: { Hash: 'abcdef1234567890', ShortHash: 'abcdef1', Message: 'Refine the inspector', Author: 'Alex Chen', Date: '2026-09-24T12:00:00Z', Refs: [], Decorations: [] } },
    ] })
    loadCommit.mockResolvedValue({ ...detail, Subject: 'On main: shelved spike', Parents: ['abcdef1234567890', 'index000', 'untracked0'] })
    const wrapper = await mountView()
    try {
      expect(wrapper.find('.commit-row.stash').exists()).toBe(true)
      expect(wrapper.findAll('.detail-parents button')).toHaveLength(1)
      const footer = () => wrapper.findAll('.detail-footer button')
      expect(footer().map(button => button.text())).toEqual(['Apply', 'Pop', 'Drop'])
      await footer()[0]!.trigger('click')
      await flushPromises()
      expect(stashOps.apply).toHaveBeenCalledWith(1)
      await wrapper.findAll('.detail-footer button')[2]!.trigger('click')
      await flushPromises()
      expect(stashOps.drop).not.toHaveBeenCalled()
      expect(wrapper.get('.operation-confirm').text()).toContain('stash@{1}')
      await wrapper.findAll('.operation-confirm button').find(button => button.text() === 'Drop')!.trigger('click')
      await flushPromises()
      expect(stashOps.drop).toHaveBeenCalledWith(1)
    } finally { wrapper.unmount() }
  })

  it('tabs to working files and enters Changes from the working row', async () => {
    summary.mockResolvedValue({
      Entries: [{ Path: 'work.txt', IndexStatus: 0, WorkStatus: 1, IsUntracked: false, IsConflict: false }],
      Working: [{ Path: 'work.txt', Added: 1, Deleted: 0, Binary: false }], Staged: [],
    })
    const wrapper = mount(GraphView, { props: { focusHash: '__ichi_working_changes__' }, attachTo: document.body,
      global: { stubs: { Teleport: true, GraphSvg: true } } })
    try {
      await flushPromises()
      await wrapper.get('.commit-list').trigger('keydown', { key: 'Tab' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('.heat-file.selected').element)
      await wrapper.get('.heat-file.selected').trigger('keydown', { key: 'l' })
      expect(wrapper.emitted('navigate')).toBeUndefined()
      await wrapper.get('.heat-file.selected').trigger('keydown', { key: 'Tab', shiftKey: true })
      await wrapper.get('.commit-list').trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('navigate')).toEqual([['status', '']])
    } finally { wrapper.unmount() }
  })

  it('shows the selected header while details load and reuses visited commits', async () => {
    let resolve!: (value: typeof detail) => void
    loadCommit.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const wrapper = await mountView()
    expect(wrapper.find('.detail-head').text()).toContain('Refine the inspector')
    expect(wrapper.find('.detail-loading').exists()).toBe(true)
    expect(wrapper.find('#commit-files-panel').exists()).toBe(false)
    resolve(detail)
    await flushPromises()
    await wrapper.setProps({ focusHash: 'other-commit' })
    await flushPromises()
    await wrapper.setProps({ focusHash: 'abcdef1234567890' })
    await flushPromises()
    expect(loadCommit.mock.calls.filter(([hash]) => hash === 'abcdef1234567890')).toHaveLength(1)
    expect(wrapper.find('.detail-loading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('honors density, author visibility, and hidden inspector preferences', async () => {
    const wrapper = await mountView()
    const settings = usePreferenceBindings()
    expect(wrapper.find('.commit-list').attributes('style')).toContain('28px')
    settings['graph.rowDensity'] = 'compact'
    settings['graph.detailShowAuthorDate'] = false
    await flushPromises()
    expect(wrapper.find('.commit-list').attributes('style')).toContain('24px')
    expect(wrapper.find('.detail-person').exists()).toBe(false)
    settings['graph.detailPosition'] = 'hidden'
    await flushPromises()
    expect(wrapper.find('.commit-detail').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves detail errors without showing a misleading empty file list', async () => {
    loadCommit.mockRejectedValueOnce(new Error('Commit unavailable'))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Commit unavailable')
    expect(wrapper.find('#commit-files-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the existing push confirmation without pushing immediately', async () => {
    const wrapper = await mountView()
    await wrapper.find('[title="Push current branch"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Push current branch?')
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('refreshes the graph after failed push and retains the confirmation error for retry', async () => {
    const wrapper = await mountView()
    await wrapper.find('[title="Push current branch"]').trigger('click')
    await flushPromises()
    layoutStarted.mockClear()
    push.mockRejectedValueOnce(new Error('remote rejected after updating refs'))
    await wrapper.find('.operation-primary').trigger('click')
    await flushPromises()
    expect(layoutStarted).toHaveBeenCalledOnce()
    expect(wrapper.find('.operation-confirm').text()).toContain('remote rejected after updating refs')
    expect(wrapper.find('.operation-primary').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
  it('expands grouped files without losing precise counts or rename paths', async () => {
    loadCommit.mockResolvedValueOnce({
      ...detail,
      Files: Array.from({ length: 12 }, (_, i) => ({
        Status: i === 0 ? 4 : 2,
        Path: `src/ui/file-${String(i).padStart(2, '0')}.vue`,
        OldPath: i === 0 ? 'old/location.vue' : '',
        Insertions: 12,
        Deletions: 3,
      })),
    })
    const wrapper = await mountView()
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(10)
    expect(wrapper.find('.detail-file-group h4').text()).toBe('src/ui/')
    expect(wrapper.text()).toContain('old/location.vue')
    await wrapper.find('.detail-show-files').trigger('click')
    expect(wrapper.findAll('.detail-file-row')).toHaveLength(12)
    expect(wrapper.find('.file-delta').text()).toContain('+12−3')
    await wrapper.findAll('.detail-file-row')[11]!.trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['diff', 'abcdef1234567890', 'src/ui/file-11.vue'])
    wrapper.unmount()
  })

  it('loads a parent outside the graph without retaining the old selection or heading', async () => {
    loadCommit.mockResolvedValueOnce({
      ...detail,
      Parents: ['parent123456789'],
      ParentSubjects: ['Earlier work'],
    })
    const wrapper = await mountView()
    loadCommit.mockResolvedValueOnce({
      ...detail,
      Hash: 'parent123456789',
      ShortHash: 'parent1',
      Subject: 'Earlier work',
      Parents: [],
    })
    await wrapper.find('.detail-parents button').trigger('click')
    await flushPromises()
    expect(loadCommit).toHaveBeenLastCalledWith('parent123456789')
    expect(wrapper.find('.detail-head h3').text()).toBe('Earlier work')
    expect(wrapper.find('.detail-sha').text()).toContain('parent123456789')
    expect(wrapper.find('.commit-row.selected').exists()).toBe(false)
    await wrapper.find('.commit-row').trigger('click')
    await flushPromises()
    expect(loadCommit.mock.calls.filter(([hash]) => hash === 'abcdef1234567890')).toHaveLength(1)
    expect(wrapper.find('.detail-head h3').text()).toBe('Refine the inspector')
    expect(wrapper.find('.commit-row.selected').exists()).toBe(true)
    wrapper.unmount()
  })

  it('bounds the inspector DOM for 8,000 files, preserves keyboard access, and reuses the commit on revisits', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    loadCommit.mockResolvedValueOnce({ ...detail,
      Stats: { FilesChanged: 8000, Insertions: 2_000_000, Deletions: 0 },
      Files: Array.from({ length: 8000 }, (_, index) => ({ Path: `src/file-${String(index).padStart(4, '0')}.ts`, Status: 2, OldPath: '', Binary: false, Insertions: 250, Deletions: 0 })),
    })
    const wrapper = await mountView()
    try {
      expect(wrapper.findAll('.map-segment').length).toBeLessThanOrEqual(160)
      expect(wrapper.findAll('.detail-file-row').length).toBeLessThan(100)
      expect(wrapper.get('.detail-summary').text()).toContain('+2000000')
      await wrapper.get('.commit-list').trigger('keydown', { key: 'Tab' })
      await wrapper.get('.detail-file-row.heat-selected').trigger('keydown', { key: 'End' })
      await flushPromises()
      expect(wrapper.get('.detail-file-row.heat-selected').text()).toContain('file-7999.ts')
      expect(document.activeElement).toBe(wrapper.get('.detail-file-row.heat-selected').element)
      await wrapper.get('.commit-row.selected').trigger('pointerenter')
      await wrapper.get('.commit-row.selected').trigger('pointerleave')
      await vi.advanceTimersByTimeAsync(300)
      expect(loadCommit).toHaveBeenCalledOnce()
      await wrapper.setProps({ focusHash: 'second1234567890' })
      await flushPromises()
      await wrapper.setProps({ focusHash: 'abcdef1234567890' })
      await flushPromises()
      expect(loadCommit.mock.calls.filter(([hash]) => hash === 'abcdef1234567890')).toHaveLength(1)
      expect(wrapper.findAll('.detail-file-row').length).toBeLessThan(100)
    } finally { wrapper.unmount() }
  })

  it('resizes by keyboard and persists a bounded inspector width', async () => {
    const wrapper = await mountView()

    const handle = wrapper.find('[role="separator"]')
    await handle.trigger('keydown', { key: 'Home' })
    expect(usePreferenceBindings()['graph.detailWidth']).toBe(320)
    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(usePreferenceBindings()['graph.detailWidth']).toBe(336)
    expect(usePreferences().snapshot().user['graph.detailWidth']).toBe(336)
    await handle.trigger('keydown', { key: 'End' })
    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(usePreferenceBindings()['graph.detailWidth']).toBe(640)
    wrapper.unmount()
  })

  it('routes footer actions through existing confirmation dialogs', async () => {
    const wrapper = await mountView()
    await wrapper.findAll('.detail-footer button')[1]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.operation-confirm').text()).toContain('Cherry-pick')
    expect(wrapper.find('.operation-confirm').text()).toContain('abcdef1')
    wrapper.unmount()
  })
})

describe('commit detail scheduling', () => {
  it('defers mutable metadata to Details and refreshes it when reopened', async () => {
    const wrapper = await mountView()
    try {
      expect(loadMetadata).not.toHaveBeenCalled()
      await wrapper.get('.detail-info-toggle').trigger('click')
      await flushPromises()
      expect(loadMetadata).toHaveBeenCalledTimes(1)
      expect(wrapper.get('#commit-metadata-panel').text()).toContain('Unsigned')
      await wrapper.get('.detail-info-toggle').trigger('click')
      loadMetadata.mockResolvedValue({ Branches: ['new-branch'], GPGStatus: { Signed: true, Valid: true } })
      await wrapper.get('.detail-info-toggle').trigger('click')
      await flushPromises()
      expect(loadMetadata).toHaveBeenCalledTimes(2)
      expect(wrapper.get('#commit-metadata-panel').text()).toContain('new-branch')
    } finally { wrapper.unmount() }
  })

  it('keeps core details available when metadata fails, with a separate retry', async () => {
    loadMetadata.mockRejectedValueOnce(new Error('verification unavailable'))
    const wrapper = await mountView()
    try {
      await wrapper.get('.detail-info-toggle').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('verification unavailable')
      expect(wrapper.text()).toContain('alex@example.com')
      expect(wrapper.get('#commit-metadata-panel').text()).not.toContain('Unsigned')
      await wrapper.findAll('button').find(button => button.text() === 'Retry')!.trigger('click')
      await flushPromises()
      expect(loadMetadata).toHaveBeenCalledTimes(2)
      expect(loadCommit).toHaveBeenCalledTimes(1)
    } finally { wrapper.unmount() }
  })

  it('reuses the bounded core cache after leaving and returning to Graph', async () => {
    const first = await mountView()
    first.unmount()
    const second = await mountView()
    try { expect(loadCommit).toHaveBeenCalledTimes(1) }
    finally { second.unmount() }
  })

  it('does no core or speculative reads while the inspector is hidden', async () => {
    vi.useFakeTimers()
    usePreferenceBindings()['graph.detailPosition'] = 'hidden'
    const wrapper = await mountView()
    try {
      await vi.advanceTimersByTimeAsync(1000)
      expect(loadCommit).not.toHaveBeenCalled()
      usePreferenceBindings()['graph.detailPosition'] = 'right'
      await flushPromises()
      expect(loadCommit).toHaveBeenCalledOnce()
    } finally { wrapper.unmount() }
  })

  it('cancels speculative work before starting a newly selected commit', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn<() => void>()
    let finish!: (value: typeof detail) => void
    loadCommit.mockResolvedValueOnce(detail).mockImplementationOnce(() =>
      Object.assign(new Promise(resolve => { finish = resolve }), { cancel }))
    const wrapper = await mountView()
    try {
      await vi.advanceTimersByTimeAsync(250)
      expect(loadCommit).toHaveBeenCalledTimes(2)
      expect(loadCommit).toHaveBeenLastCalledWith('second1234567890')
      await wrapper.setProps({ focusHash: 'third1234567890' })
      await flushPromises()
      expect(cancel).toHaveBeenCalledOnce()
      expect(loadCommit).toHaveBeenLastCalledWith('third1234567890')
      finish({ ...detail, Subject: 'Stale speculative content' })
      await flushPromises()
      expect(wrapper.text()).not.toContain('Stale speculative content')
    } finally { wrapper.unmount() }
  })

  it('cancels stale foreground and metadata reads on navigation and disposal', async () => {
    const cancelCore = vi.fn<() => void>()
    let finishCore!: (value: typeof detail) => void
    loadCommit.mockImplementationOnce(() => Object.assign(new Promise(resolve => { finishCore = resolve }), { cancel: cancelCore }))
    const wrapper = await mountView()
    const cancelMetadata = vi.fn<() => void>()
    let finishMetadata!: (value: unknown) => void
    try {
      await wrapper.setProps({ focusHash: 'second1234567890' })
      await flushPromises()
      expect(cancelCore).toHaveBeenCalledOnce()
      finishCore({ ...detail, Subject: 'Obsolete selection' })
      await flushPromises()
      expect(wrapper.text()).not.toContain('Obsolete selection')
      loadMetadata.mockImplementationOnce(() => Object.assign(new Promise(resolve => { finishMetadata = resolve }), { cancel: cancelMetadata }))
      await wrapper.get('.detail-info-toggle').trigger('click')
      await flushPromises()
      expect(wrapper.get('#commit-metadata-panel').text()).toContain('Checking…')
      expect(wrapper.get('#commit-metadata-panel').text()).not.toContain('Unsigned')
    } finally { wrapper.unmount() }
    expect(cancelMetadata).toHaveBeenCalledOnce()
    finishMetadata({ Branches: [], GPGStatus: { Signed: false } })
    await flushPromises()
  })
})

describe('virtualized history', () => {
  let viewportHeight = 326
  let observers: Array<() => void>
  beforeEach(() => {
    viewportHeight = 326
    observers = []
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function(this: HTMLElement) {
      return this.classList.contains('commit-list') ? viewportHeight : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function(this: HTMLElement) {
      return this.classList.contains('commit-table-head') ? 28 : this.classList.contains('graph-lane-footer') ? 18 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function(this: HTMLElement) {
      return this.classList.contains('commit-list-canvas') ? 40 : 0
    })
    vi.stubGlobal('ResizeObserver', class {
      callback: () => void
      constructor(callback: () => void) { this.callback = callback; observers.push(callback) }
      observe() {}
      disconnect() { observers = observers.filter(callback => callback !== this.callback) }
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0))
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    usePreferenceBindings()['graph.detailPosition'] = 'hidden'
    customLayout.mockImplementation(() => ({
      LaneCount: 2,
      Rows: Array.from({ length: 500 }, (_, index) => ({
        Commit: {
          Hash: `commit-${index}`, ShortHash: `${index}`, Message: `Subject ${index}`,
          Author: 'Author', Date: '2026-09-29T12:00:00Z', Parents: index < 499 ? [`commit-${index + 1}`] : [],
          Decorations: [], Refs: [],
        },
        Lanes: [{ Glyphs: [{ Kind: 'empty' }, { Kind: 'node', ColorID: 0, ConnectTop: index > 0, ConnectBottom: index < 499 }, { Kind: 'empty' }] }],
        Routes: [],
      })),
    }))
  })
  afterEach(() => { vi.restoreAllMocks() })

  async function history(focusHash?: string) {
    const wrapper = mount(GraphView, {
      props: { focusHash }, attachTo: document.body,
      global: { stubs: { Teleport: true, AuthorAvatar: true } },
    })
    await flushPromises()
    return wrapper
  }

  it('bounds both button and SVG counts and keeps global coordinates when scrolling', async () => {
    const wrapper = await history()
    try {
      expect(wrapper.findAll('.commit-row')).toHaveLength(18)
      expect(wrapper.findAll('[data-graph-row]')).toHaveLength(18)
      expect(wrapper.get('.commit-list-canvas').attributes('style')).toContain('14000px')
      expect(wrapper.get('.graph-rails').attributes('height')).toBe('14000')
      const list = wrapper.get('.commit-list').element
      list.scrollTop = 5612 // content row 200 at the bottom of the sticky header
      await wrapper.get('.commit-list').trigger('scroll')
      await new Promise(resolve => setTimeout(resolve, 5))
      await flushPromises()
      expect(wrapper.findAll('.commit-row')).toHaveLength(26)
      const first = wrapper.findAll('.commit-row')[0]!
      expect(first.attributes('data-row-index')).toBe('192')
      expect(first.attributes('style')).toContain('top: 5376px')
      expect(wrapper.get('[data-graph-row="commit-192"]').attributes('transform')).toBe('translate(0 5376)')
      expect(wrapper.find('[data-row-index="0"]').exists()).toBe(false)
      list.scrollTop = 14000
      await wrapper.get('.commit-list').trigger('scroll')
      await new Promise(resolve => setTimeout(resolve, 5))
      await flushPromises()
      expect(wrapper.find('[data-row-index="499"]').exists()).toBe(true)
      expect(wrapper.findAll('.commit-row').length).toBeLessThanOrEqual(26)
    } finally { wrapper.unmount() }
  })

  it('mounts and focuses offscreen keyboard targets, with a menu on the correct row', async () => {
    const wrapper = await history()
    try {
      const list = wrapper.get('.commit-list')
      ;(list.element as HTMLElement).focus()
      await list.trigger('keydown', { key: 'G' })
      await flushPromises()
      const last = wrapper.get('[data-row-index="499"]')
      expect(last.classes()).toContain('selected')
      expect(document.activeElement).toBe(last.element)
      expect((list.element as HTMLElement).scrollTop).toBe(13732)
      await last.trigger('keydown', { key: 'k' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('[data-row-index="498"]').element)
      await wrapper.get('[data-row-index="498"]').trigger('keydown', { key: 'r' })
      await flushPromises()
      expect(wrapper.text()).toContain('Copy SHA')
    } finally { wrapper.unmount() }
  })

  it('lands finder targets offscreen and handles density, resize, and shorter reloads', async () => {
    const wrapper = await history('commit-350')
    try {
      expect(wrapper.get('[data-row-index="350"]').classes()).toContain('selected')
      usePreferenceBindings()['graph.rowDensity'] = 'compact'
      await flushPromises()
      expect(wrapper.get('[data-row-index="350"]').attributes('style')).toContain('top: 8400px')
      expect(wrapper.get('[data-graph-row="commit-350"]').attributes('transform')).toBe('translate(0 8400)')
      viewportHeight = 566
      for (const resize of observers) resize()
      await flushPromises()
      expect(wrapper.findAll('.commit-row').length).toBeLessThanOrEqual(39)
      expect(wrapper.findAll('.commit-row').length).toBeGreaterThan(26)
      customLayout.mockReturnValue({ LaneCount: 1, Rows: [(customLayout() as { Rows: object[] }).Rows[0]] })
      usePreferenceBindings()['graph.limit'] = 250
      await flushPromises()
      expect(wrapper.findAll('.commit-row')).toHaveLength(1)
      expect(wrapper.get('[data-row-index="0"]').attributes('data-commit-hash')).toBe('commit-0')
    } finally { wrapper.unmount(); usePreferenceBindings()['graph.limit'] = 120 }
  })

  it('keeps keyboard input on the list when wheel scrolling unmounts the focused row', async () => {
    const wrapper = await history()
    try {
      const first = wrapper.get('[data-row-index="0"]')
      ;(first.element as HTMLElement).focus()
      const list = wrapper.get('.commit-list')
      list.element.scrollTop = 5600
      await list.trigger('scroll')
      await new Promise(resolve => setTimeout(resolve, 5))
      await flushPromises()
      expect(document.activeElement).toBe(list.element)
      await list.trigger('keydown', { key: 'j' })
      await flushPromises()
      expect(wrapper.get('[data-row-index="1"]').classes()).toContain('selected')
      expect(document.activeElement).toBe(wrapper.get('[data-row-index="1"]').element)
    } finally { wrapper.unmount() }
  })
})


it('restores graph rows during revalidation and retains the commit core cache', async () => {
  repoInfo.mockResolvedValue({ Path: '/repo', Branch: 'main', Ahead: 0, Behind: 0 })
  const options = { props: { repositoryPath: '/repo' }, attachTo: document.body, global: { stubs: { Teleport: true, GraphSvg: true } } }
  const first = mount(GraphView, options)
  await flushPromises()
  await first.setProps({ focusHash: 'second1234567890' })
  await flushPromises()
  first.unmount()
  const calls = loadCommit.mock.calls.length
  let finish!: (value: unknown) => void
  customLayout.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const second = mount(GraphView, options)
  await flushPromises()
  expect(second.findAll('.commit-row')).toHaveLength(2)
  expect(second.get('.graph-grid').attributes()).toHaveProperty('inert')
  expect(second.get('.commit-row.selected').text()).toContain('Earlier commit')
  expect(loadCommit).toHaveBeenCalledTimes(calls)
  finish({ LaneCount: 1, Rows: [{ Lanes: [], Commit: { Hash: 'second1234567890', ShortHash: 'second1', Message: 'Earlier commit', Author: 'Sam', Date: '2026-09-23', Decorations: [], Refs: [] } }] })
  await flushPromises()
  expect(second.findAll('.commit-row')).toHaveLength(1)
  expect(second.get('.graph-grid').attributes()).not.toHaveProperty('inert')
  expect(loadCommit).toHaveBeenCalledTimes(calls)
  second.unmount()
})


it('retries graph reads invalidated while pending and discards unfinished navigation snapshots', async () => {
  repoInfo.mockResolvedValue({ Path: '/repo', Branch: 'main', Ahead: 0, Behind: 0 })
  let finish!: (value: unknown) => void
  customLayout.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const options = { props: { repositoryPath: '/repo' }, global: { stubs: { Teleport: true, GraphSvg: true } } }
  const wrapper = mount(GraphView, options)
  await flushPromises()
  invalidateNavigationSnapshots()
  finish({ LaneCount: 1, Rows: [] })
  await flushPromises()
  expect(layoutStarted).toHaveBeenCalledTimes(2)
  expect(wrapper.findAll('.commit-row')).toHaveLength(2)
  wrapper.unmount()
  customLayout.mockReturnValueOnce(new Promise(() => {}))
  const unfinished = mount(GraphView, options)
  await flushPromises()
  unfinished.unmount()
  expect(peekNavigationSnapshot('graph', '/repo', usePreferenceBindings()['graph.limit'])).toBeNull()
})

describe('commit copy shortcuts', () => {
  function clipboard() {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    return writeText
  }

  it('copies the full SHA with y and the preferred branch with yy', async () => {
    const writeText = clipboard()
    const wrapper = await mountView()
    await wrapper.get('.commit-list').trigger('keydown', { key: 'y' })
    expect(writeText).toHaveBeenLastCalledWith('abcdef1234567890')
    await wrapper.get('.commit-list').trigger('keydown', { key: 'y' })
    expect(writeText).toHaveBeenLastCalledWith('main')
    wrapper.unmount()
  })

  it('uses the hovered commit instead of the selected commit, including body focus', async () => {
    const writeText = clipboard()
    const wrapper = await mountView()
    await wrapper.findAll('.commit-row')[1]!.trigger('pointerenter')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
    expect(writeText).toHaveBeenLastCalledWith('second1234567890')
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
    expect(writeText).toHaveBeenLastCalledWith('older')
    wrapper.unmount()
    writeText.mockClear()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y' }))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('ignores repeats and modifiers and resets yy after its deadline or a different key', async () => {
    const writeText = clipboard()
    const wrapper = await mountView()
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const list = wrapper.get('.commit-list')
    await list.trigger('keydown', { key: 'y', ctrlKey: true })
    expect(writeText).not.toHaveBeenCalled()
    await list.trigger('keydown', { key: 'y' })
    await list.trigger('keydown', { key: 'y', repeat: true })
    expect(writeText).toHaveBeenCalledTimes(1)
    now.mockReturnValue(1600)
    await list.trigger('keydown', { key: 'y' })
    expect(writeText).toHaveBeenLastCalledWith('abcdef1234567890')
    await list.trigger('keydown', { key: 'Escape' })
    await list.trigger('keydown', { key: 'y' })
    expect(writeText).toHaveBeenLastCalledWith('abcdef1234567890')
    await list.trigger('keydown', { key: '/' })
    await list.trigger('keydown', { key: 'y' })
    expect(writeText).toHaveBeenCalledTimes(3)
    now.mockRestore()
    wrapper.unmount()
  })

  it('does not intercept typing while a commit is hovered', async () => {
    const writeText = clipboard()
    const wrapper = await mountView()
    await wrapper.findAll('.commit-row')[0]!.trigger('pointerenter')
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', bubbles: true }))
    expect(writeText).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

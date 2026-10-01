import { describe, it, expect, vi } from 'vitest'
const { bridgeOverrides } = vi.hoisted(() => ({ bridgeOverrides: new Map<string, (...args: unknown[]) => Promise<unknown>>() }))
// These tests exercise shell navigation without a native Wails server. Keep
// bridge failures local instead of starting HTTP requests that outlive a view.
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => [name,
    name.endsWith('Service') && value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).map(method => [method, (...args: unknown[]) => bridgeOverrides.get(`${name}.${method}`)?.(...args) ?? Promise.reject(new Error('Desktop bridge unavailable in shell tests'))]))
      : value,
  ]))
})
vi.mock('../composables/useGitProfiles', () => ({ useGitProfiles: () => ({ state: { profiles: [], warnings: [], syncing: false, syncError: '', error: '', loading: false }, refresh: async () => {}, ready: async () => {}, sync: async () => {}, effective: async () => {} }) }))
import { nextTick } from 'vue'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import CommitDiffView from '../components/diff/CommitDiffView.vue'
import { GraphLayout, GraphLayoutRow, RepoInfo } from '../bindings/github.com/atterpac/ichi/desktop/services'
import { ChangedFile, Commit, CommitDetail, FileDiff, LineType } from '../bindings/github.com/atterpac/ichi/internal/git'
import { clearSharedCommitDetails } from '../components/graph/commitDetailCache'
import { invalidateNavigationSnapshots } from '../composables/navigationSnapshots'
import { usePreferenceBindings } from '../customization/usePreferences'

function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }))
}

describe('App', () => {
  it('renders the selected commit patch after Enter on a real graph row', async () => {
    clearSharedCommitDetails()
    invalidateNavigationSnapshots()
    const info = new RepoInfo({ Path: '/repo', Branch: 'main' })
    const commit = new Commit({ Hash: 'a'.repeat(40), ShortHash: 'aaaaaaa', Message: 'Review this commit', Author: 'Alex', Parents: ['b'.repeat(40)] })
    const detail = new CommitDetail({ Hash: commit.Hash, ShortHash: commit.ShortHash, Subject: commit.Message,
      Parents: commit.Parents, Files: [new ChangedFile({ Path: 'app.ts', Insertions: 1 })] })
    bridgeOverrides.set('GraphService.LoadGraphLayout', async () => new GraphLayout({ Info: info, LaneCount: 1,
      Rows: [new GraphLayoutRow({ Commit: commit, Lanes: [] })] }))
    bridgeOverrides.set('GraphService.LoadCommit', async () => detail)
    bridgeOverrides.set('DiffService.DiffBetweenFile', async () => FileDiff.createFrom({ Path: 'app.ts', Hunks: [{
      Header: '@@ -0,0 +1 @@', OldStart: 0, OldCount: 0, NewStart: 1, NewCount: 1,
      Lines: [{ Type: LineType.LineAdded, Content: 'rendered committed change', NewLineNo: 1, OldLineNo: 0 }],
    }] }))
    const wrapper = mount(App, { attachTo: document.body, global: { stubs: { GraphSvg: true } } })
    try {
      await flushPromises()
      await wrapper.get('.commit-row.selected').trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(wrapper.getComponent(CommitDiffView).props('focusHash')).toBe(commit.Hash)
      expect(wrapper.get('.commit-file-row.selected').text()).toContain('app.ts')
      expect(wrapper.get('.diff-view').text()).toContain('rendered committed change')
      expect(wrapper.find('.view-placeholder').exists()).toBe(false)
      expect(wrapper.findAll('.primary-nav button').find(button => button.text().startsWith('Diff'))?.attributes('aria-current')).toBe('page')
      await wrapper.get('.commit-diff-header button').trigger('click')
      await flushPromises()
      expect(wrapper.get('.commit-row.selected').attributes('data-commit-hash')).toBe(commit.Hash)
    } finally { wrapper.unmount(); bridgeOverrides.clear(); clearSharedCommitDetails(); invalidateNavigationSnapshots() }
  })

  it('opens the Diff page from the visible Go to menu', async () => {
    vi.useFakeTimers()
    const wrapper = mount(App, { attachTo: document.body })
    try {
      pressKey(' ')
      await vi.advanceTimersByTimeAsync(250)
      const diff = wrapper.findAll('.whichkey button').find(button => button.text().startsWith('Diff'))!
      expect(diff.exists()).toBe(true)
      await diff.trigger('click')
      await flushPromises()
      expect(wrapper.find('.commit-diff-view').exists()).toBe(true)
      expect(wrapper.find('.view-placeholder').exists()).toBe(false)
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('opens a commit and file in Diff and returns to the same graph commit', async () => {
    const graph = {
      name: 'GraphView', props: ['focusHash'], emits: ['navigate'],
      template: `<section class="graph-view"><button class="commit-row selected" data-commit-hash="commit-a" @click="$emit('navigate', 'diff', 'commit-a', 'src/b.ts')">Review commit</button></section>`,
    }
    const wrapper = mount(App, { attachTo: document.body, global: { stubs: { GraphView: graph } } })
    try {
      await wrapper.get('.commit-row').trigger('click')
      await flushPromises()
      expect(wrapper.getComponent(CommitDiffView).props('focusHash')).toBe('commit-a')
      expect(wrapper.getComponent(CommitDiffView).props('focusFile')).toBe('src/b.ts')
      await wrapper.get('.commit-diff-header button').trigger('click')
      expect(wrapper.getComponent({ name: 'GraphView' }).props('focusHash')).toBe('commit-a')
    } finally { wrapper.unmount() }
  })
  it('opens main search with slash from a view but allows typing slash in inputs', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    try {
      const input = wrapper.get('.titlebar-search input')
      await input.trigger('keydown', { key: '/' })
      expect(wrapper.find('.finderbar').exists()).toBe(false)
      await wrapper.get('.graph-view').trigger('keydown', { key: '/' })
      await flushPromises()
      expect(wrapper.find('.finderbar').exists()).toBe(true)
      expect(wrapper.find('.fb-query').element).toBe(document.activeElement)
    } finally { wrapper.unmount() }
  })

  it('returns from settings to the mounted repository view', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    try {
      const graph = wrapper.get('.graph-view').element
      await wrapper.get('.topbar [aria-label="Settings"]').trigger('click')
      expect(wrapper.find('.settings-workspace').exists()).toBe(true)
      expect(wrapper.get('.body-shell').attributes('inert')).toBeDefined()
      await wrapper.findAll('button').find(b => b.text() === 'Back to workspace')!.trigger('click')
      expect(wrapper.find('.settings-workspace').exists()).toBe(false)
      expect(wrapper.get('.graph-view').element).toBe(graph)
      expect(wrapper.get('.body-shell').attributes('inert')).toBeUndefined()
    } finally { wrapper.unmount() }
  })

  it('opens the conflict demo from Settings without a repository and exits', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    try {
      await wrapper.get('.topbar [aria-label="Settings"]').trigger('click')
      await wrapper.findAll('.set-catitem').find(b => b.text() === 'Developer')!.trigger('click')
      await wrapper.findAll('button').find(b => b.text().includes('Open conflict demo'))!.trigger('click')
      await flushPromises()
      expect(wrapper.find('.settings-modal').exists()).toBe(false)
      expect(wrapper.findAll('.native-file-row')).toHaveLength(2)
      expect(wrapper.get('.conflicts-view').text()).toContain('Your repositories are untouched')
      await wrapper.findAll('button').find(b => b.text() === 'Exit demo')!.trigger('click')
      expect(wrapper.find('.graph-view').exists()).toBe(true)
    } finally { wrapper.unmount() }
  })

  it('allows global navigation from buttons and Escape returns to the previous view', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const button = wrapper.findAll('.primary-nav button')[2]!
    await button.trigger('click')
    await button.trigger('keydown', { key: 'g' })
    expect(wrapper.find('.graph-view').exists()).toBe(true)
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.branches-view').exists()).toBe(true)
    wrapper.unmount()
  })

  it('cycles visible panes with F6 even from a text field', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    const panes = [document.createElement('section'), document.createElement('section')]
    for (const pane of panes) {
      pane.tabIndex = 0
      pane.dataset.keyboardPane = ''
      pane.getClientRects = () => [{ width: 10, height: 10 }] as unknown as DOMRectList
      wrapper.find('.main-island').element.appendChild(pane)
    }
    const input = document.createElement('input')
    panes[0]!.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(panes[1])
    panes[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(panes[0])
    wrapper.unmount()
  })

  it('mounts renders properly', () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.text()).toContain('Commit Graph')
    expect(wrapper.find('.main-island').exists()).toBe(true)
    expect(wrapper.find('.modeline').exists()).toBe(true)
    wrapper.unmount()
  })

  it('navigates with header buttons and restores the inspector position', async () => {
    const settings = usePreferenceBindings()
    settings['graph.detailPosition'] = 'bottom'
    const wrapper = mount(App, { attachTo: document.body })
    const toggle = wrapper.find('[aria-controls="commit-inspector"]')
    await toggle.trigger('click')
    expect(settings['graph.detailPosition']).toBe('hidden')
    await toggle.trigger('click')
    expect(settings['graph.detailPosition']).toBe('bottom')
    await wrapper.findAll('.primary-nav button')[2]!.trigger('click')
    expect(wrapper.find('.primary-nav [aria-current="page"]').text()).toContain('Branches')
    expect(wrapper.find('.branches-view').exists()).toBe(true)
    expect(wrapper.find('[aria-controls="commit-inspector"]').exists()).toBe(false)
    await wrapper.findAll('.primary-nav button')[0]!.trigger('click')
    expect(wrapper.find('.graph-view').exists()).toBe(true)
    wrapper.unmount()
    settings['graph.detailPosition'] = 'right'
  })

  it('submits the header search and keeps the settings cog', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.find('.titlebar-search input').setValue('graph')
    await wrapper.find('form[role="search"]').trigger('submit')
    expect(wrapper.find('.finderbar').exists()).toBe(true)
    expect((wrapper.find('.fb-query').element as HTMLInputElement).value).toBe('graph')
    expect(wrapper.find('.topbar [aria-label="Settings"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('delays quick navigation while keeping chords immediate', async () => {
    vi.useFakeTimers()
    const wrapper = mount(App, { attachTo: document.body })
    try {
      pressKey(' ')
      await nextTick()
      expect(wrapper.find('.whichkey').exists()).toBe(false)
      pressKey('b')
      await nextTick()
      expect(wrapper.find('.branches-view').exists()).toBe(true)
      await vi.advanceTimersByTimeAsync(250)
      expect(wrapper.find('.whichkey').exists()).toBe(false)
      pressKey(' ')
      await vi.advanceTimersByTimeAsync(250)
      expect(wrapper.find('.whichkey').exists()).toBe(true)
      pressKey('Escape')
      await nextTick()
      expect(wrapper.find('.whichkey').exists()).toBe(false)
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('opens the finder omnibar on ctrl+p and closes on escape', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    expect(wrapper.find('.finderbar').exists()).toBe(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true }))
    await nextTick()
    expect(wrapper.find('.finderbar').exists()).toBe(true)
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.finderbar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('dismisses which-key on escape without changing views', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    pressKey(' ')
    await nextTick()
    pressKey('Escape')
    await nextTick()
    expect(wrapper.find('.whichkey').exists()).toBe(false)
    expect(wrapper.text()).toContain('Commit Graph')
    wrapper.unmount()
  })
  it('opens Pocket with Ctrl+R and opens workspace settings from its footer', async () => {
    const wrapper = mount(App, { attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true }))
    await nextTick()
    expect(wrapper.find('.pocket-panel').exists()).toBe(true)
    await wrapper.find('.pocket-panel footer button:last-child').trigger('click')
    expect(wrapper.find('.workspace-settings').exists()).toBe(true)
    expect(wrapper.find('.pocket-panel').exists()).toBe(false)
    wrapper.unmount()
  })

})

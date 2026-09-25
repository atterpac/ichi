import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import GraphView from '../components/graph/GraphView.vue'
import { useShellSettings } from '../composables/useShellSettings'

const { loadCommit, push } = vi.hoisted(() => ({ loadCommit: vi.fn(), push: vi.fn() }))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: { Info: async () => ({ Branch: 'main', Ahead: 2, Behind: 0 }) },
  RemoteService: { HasUpstream: async () => true, Push: push },
  GraphService: {
    LoadGraphLayout: async () => ({
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
            Decorations: [],
            Refs: [],
          },
        },
      ],
    }),
    LoadCommit: loadCommit,
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
    global: { stubs: { Teleport: true, GraphCanvas: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  loadCommit.mockReset().mockResolvedValue(detail)
  push.mockReset().mockResolvedValue(undefined)
  Object.assign(useShellSettings(), {
    graphDetailPosition: 'right',
    graphDetailShowAuthorDate: true,
    graphDetailHash: 'full',
    graphRowDensity: 'comfortable',
  })
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('Graph inspector refresh', () => {
  it('enters the inspector with l and returns to the graph with Escape', async () => {
    const wrapper = await mountView()
    await wrapper.find('.commit-list').trigger('keydown', { key: 'l' })
    expect(wrapper.find('#commit-inspector').element.contains(document.activeElement)).toBe(true)
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(wrapper.find('.commit-list').element)
    wrapper.unmount()
  })

  it('keeps file navigation and full metadata available through keyboard-accessible tabs', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.detail-author').text()).toBe('Alex Chen')
    expect(wrapper.find('#commit-files-panel').isVisible()).toBe(true)
    await wrapper.find('.detail-file-row').trigger('click')
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['file-log', 'src/theme/graph.css'])
    await wrapper.find('#commit-files-tab').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('#commit-metadata-tab').attributes('aria-selected')).toBe('true')
    expect(document.activeElement?.id).toBe('commit-metadata-tab')
    expect(wrapper.find('.detail-sha').text()).toContain('abcdef1234567890')
    expect(wrapper.find('#commit-metadata-panel').text()).toContain('alex@example.com')
    expect(wrapper.find('#commit-files-panel').isVisible()).toBe(false)
    await wrapper.find('#commit-metadata-tab').trigger('keydown', { key: 'Home' })
    expect(wrapper.find('#commit-files-panel').isVisible()).toBe(true)
    wrapper.unmount()
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
    const settings = useShellSettings()
    expect(wrapper.find('.commit-list').attributes('style')).toContain('42px')
    settings.graphRowDensity = 'compact'
    settings.graphDetailShowAuthorDate = false
    await flushPromises()
    expect(wrapper.find('.commit-list').attributes('style')).toContain('34px')
    expect(wrapper.find('.detail-person').exists()).toBe(false)
    settings.graphDetailPosition = 'hidden'
    await flushPromises()
    expect(wrapper.find('.commit-detail').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves detail errors without showing a misleading empty file list', async () => {
    loadCommit.mockRejectedValueOnce(new Error('Commit unavailable'))
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('Commit unavailable')
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
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
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['file-log', 'src/ui/file-11.vue'])
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

  it('resizes by keyboard and persists a bounded inspector width', async () => {
    const wrapper = await mountView()
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    const handle = wrapper.find('[role="separator"]')
    await handle.trigger('keydown', { key: 'Home' })
    expect(useShellSettings().graphDetailWidth).toBe(320)
    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(useShellSettings().graphDetailWidth).toBe(336)
    expect(JSON.parse(localStorage.getItem('ichi.desktop.settings')!).graphDetailWidth).toBe(336)
    await handle.trigger('keydown', { key: 'End' })
    await handle.trigger('keydown', { key: 'ArrowLeft' })
    expect(useShellSettings().graphDetailWidth).toBe(640)
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

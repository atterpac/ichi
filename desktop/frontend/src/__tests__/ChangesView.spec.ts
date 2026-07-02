import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ChangesView from '../components/status/ChangesView.vue'
import { useShellSettings } from '../composables/useShellSettings'
import { FileStatus, LineType } from '../bindings/github.com/atterpac/ichi/internal/git'

const workingDiff = vi.fn<() => Promise<string>>(() => Promise.resolve('raw-diff'))
const stageFile = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())
const unstageFile = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())
const commit = vi.fn<(message: string) => Promise<void>>(() => Promise.resolve())

const entry = (over: Record<string, unknown>) => ({
  Path: '',
  OldPath: '',
  IndexStatus: FileStatus.FileUnchanged,
  WorkStatus: FileStatus.FileUnchanged,
  IsStaged: false,
  IsUntracked: false,
  IsConflict: false,
  ...over,
})

let statusEntries = [
  entry({ Path: 'src/app.ts', WorkStatus: FileStatus.FileModified }),
  entry({ Path: 'notes.md', IsUntracked: true, WorkStatus: FileStatus.FileUntracked }),
  entry({ Path: 'src/new.ts', IndexStatus: FileStatus.FileAdded, IsStaged: true }),
]

vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  WorktreeService: {
    Status: () => Promise.resolve(statusEntries),
    StageFile: (path: string) => stageFile(path),
    UnstageFile: (path: string) => unstageFile(path),
    StageAll: () => Promise.resolve(),
    Commit: (message: string) => commit(message),
    CommitAmend: () => Promise.resolve(),
    DiscardFileChanges: () => Promise.resolve(),
  },
  RepoService: {
    Info: () => Promise.resolve({ Branch: 'main', Ahead: 0, Behind: 0, HasUncommitted: true }),
  },
  DiffService: {
    WorkingDiff: () => workingDiff(),
    StagedDiff: () => Promise.resolve('raw-diff'),
    ParseDiff: () =>
      Promise.resolve([
        {
          Path: 'src/app.ts',
          OldPath: '',
          Hunks: [
            {
              Header: '@@ -1,2 +1,2 @@',
              Lines: [
                { Type: LineType.LineContext, Content: 'unchanged', OldLineNo: 1, NewLineNo: 1 },
                { Type: LineType.LineRemoved, Content: 'old line', OldLineNo: 2, NewLineNo: 0 },
                { Type: LineType.LineAdded, Content: 'new line', OldLineNo: 0, NewLineNo: 2 },
              ],
            },
          ],
        },
      ]),
    StageHunk: () => Promise.resolve(),
    UnstageHunk: () => Promise.resolve(),
    StageLines: () => Promise.resolve(),
    UnstageLines: () => Promise.resolve(),
  },
  InspectService: {
    WorkingFileContent: () => Promise.resolve('line one\nline two'),
  },
  GraphService: {
    GetCommitMessage: () => Promise.resolve('prev subject\n\nprev body'),
  },
}))

async function mountView() {
  const wrapper = mount(ChangesView, {
    attachTo: document.body,
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('ChangesView', () => {
  beforeEach(() => {
    stageFile.mockClear()
    unstageFile.mockClear()
    commit.mockClear()
  })

  afterEach(() => {
    useShellSettings().changesGroupByDir = 'auto'
  })

  it('sets a status color per row', async () => {
    const wrapper = await mountView()
    const rows = wrapper.findAll('.change-row')
    expect(rows[0]!.attributes('style')).toContain('--status-color: var(--orange)')
    expect(rows[1]!.attributes('style')).toContain('--status-color: var(--text-mut)')
    expect(rows[2]!.attributes('style')).toContain('--status-color: var(--green)')
    wrapper.unmount()
  })

  it('renders unstaged and staged sections with filename-first rows and deltas', async () => {
    const wrapper = await mountView()
    expect(wrapper.findAll('.section-label').map((s) => s.text())).toEqual(['Unstaged', 'Staged'])
    expect(wrapper.findAll('.changes-section .section-count').map((s) => s.text())).toEqual(['2', '1'])
    const rows = wrapper.findAll('.change-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]!.find('.change-name').text()).toBe('app.ts')
    expect(rows[0]!.find('.change-dir').text()).toBe('src')
    expect(rows[0]!.find('.d-add').text()).toBe('+1')
    expect(rows[0]!.find('.d-del').text()).toBe('-1')
    expect(rows[1]!.find('.change-name').text()).toBe('notes.md')
    expect(rows[1]!.find('.d-new').text()).toBe('new')
    expect(rows[2]!.find('.change-name').text()).toBe('new.ts')
    wrapper.unmount()
  })

  it('collapses a section on header toggle', async () => {
    const wrapper = await mountView()
    await wrapper.findAll('.section-toggle')[0]!.trigger('click')
    expect(wrapper.findAll('.change-row')).toHaveLength(1)
    await wrapper.findAll('.section-toggle')[1]!.trigger('click')
    expect(wrapper.findAll('.change-row')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Working tree clean')
    expect(wrapper.findAll('.changes-section')).toHaveLength(2)
    await wrapper.findAll('.section-toggle')[0]!.trigger('click')
    await wrapper.findAll('.section-toggle')[1]!.trigger('click')
    expect(wrapper.findAll('.change-row')).toHaveLength(3)
    wrapper.unmount()
  })

  it('groups rows by directory when grouping is always on', async () => {
    useShellSettings().changesGroupByDir = 'always'
    const wrapper = await mountView()
    const dirs = wrapper.findAll('.change-dir-row .change-dir-path').map((d) => d.text())
    expect(dirs).toEqual(['src', '.', 'src'])
    expect(wrapper.findAll('.change-row.grouped')).toHaveLength(3)
    await wrapper.findAll('.change-dir-row')[0]!.trigger('click')
    expect(wrapper.findAll('.change-row')).toHaveLength(2)
    wrapper.unmount()
  })

  it('T toggles between tree and flat file list', async () => {
    const wrapper = await mountView()
    const files = wrapper.find('.changes-files')
    expect(wrapper.findAll('.change-dir-row')).toHaveLength(0)
    await files.trigger('keydown', { key: 'T' })
    expect(useShellSettings().changesGroupByDir).toBe('always')
    expect(wrapper.findAll('.change-dir-row').length).toBeGreaterThan(0)
    await files.trigger('keydown', { key: 'T' })
    expect(useShellSettings().changesGroupByDir).toBe('never')
    expect(wrapper.findAll('.change-dir-row')).toHaveLength(0)
    wrapper.unmount()
  })

  it('shows a conflicts section and navigates instead of staging', async () => {
    const saved = statusEntries
    statusEntries = [
      entry({ Path: 'src/clash.ts', IsConflict: true, WorkStatus: FileStatus.FileConflict }),
      ...saved,
    ]
    const wrapper = await mountView()
    expect(wrapper.find('.section-conflicts .section-label').text()).toBe('Conflicts')
    await wrapper.find('.changes-files').trigger('keydown', { key: 's' })
    expect(stageFile).not.toHaveBeenCalled()
    await wrapper.find('.changes-files').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('navigate')).toEqual([['conflicts']])
    statusEntries = saved
    wrapper.unmount()
  })

  it('stages the file under the cursor on s', async () => {
    const wrapper = await mountView()
    await wrapper.find('.changes-files').trigger('keydown', { key: 's' })
    expect(stageFile).toHaveBeenCalledWith('src/app.ts')
    wrapper.unmount()
  })

  it('unstages a staged row on s (toggle)', async () => {
    const wrapper = await mountView()
    const files = wrapper.find('.changes-files')
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 's' })
    expect(unstageFile).toHaveBeenCalledWith('src/new.ts')
    wrapper.unmount()
  })

  it('serves diffs from the batch cache — no fetch per cursor move', async () => {
    workingDiff.mockClear()
    const wrapper = await mountView()
    expect(workingDiff).toHaveBeenCalledTimes(1)
    const files = wrapper.find('.changes-files')
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 'k' })
    await files.trigger('keydown', { key: 'k' })
    expect(workingDiff).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders the diff for the cursor row', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.diff-hunk').exists()).toBe(true)
    expect(wrapper.findAll('.diff-line.add')).toHaveLength(1)
    expect(wrapper.findAll('.diff-line.del')).toHaveLength(1)
    wrapper.unmount()
  })

  it('commits with Ctrl+Enter from the summary input', async () => {
    const wrapper = await mountView()
    const input = wrapper.find('.commit-summary input')
    await input.setValue('feat: add changes view')
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(commit).toHaveBeenCalledWith('feat: add changes view')
    wrapper.unmount()
  })

  it('expands the commit bar on focus and collapses when focus leaves empty', async () => {
    const wrapper = await mountView()
    const bodyArea = wrapper.find('.commit-body')
    expect(bodyArea.attributes('style')).toContain('display: none')
    await wrapper.find('.commit-summary input').trigger('focusin')
    expect(bodyArea.attributes('style') ?? '').not.toContain('display: none')
    await wrapper.find('.changes-files').trigger('focusin')
    await wrapper.find('.commit-bar').trigger('focusout', { relatedTarget: wrapper.find('.changes-files').element })
    expect(bodyArea.attributes('style')).toContain('display: none')
    wrapper.unmount()
  })

  it('disables commit when nothing is staged and summary is empty', async () => {
    statusEntries = [entry({ Path: 'src/app.ts', WorkStatus: FileStatus.FileModified })]
    const wrapper = await mountView()
    const btn = wrapper.find('.commit-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

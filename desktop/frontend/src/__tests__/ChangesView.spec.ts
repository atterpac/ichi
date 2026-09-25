import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { EditorView } from '@codemirror/view'
import { Vim, getCM } from '@replit/codemirror-vim'
import OperationConfirmModal from '../components/overlays/OperationConfirmModal.vue'
import ChangesView from '../components/status/ChangesView.vue'
import { useShellSettings } from '../composables/useShellSettings'
import { FileStatus, LineType } from '../bindings/github.com/atterpac/ichi/internal/git'

Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
const saveEditorFile = vi.fn().mockResolvedValue(undefined)

const workingDiff = vi.fn<() => Promise<string>>(() => Promise.resolve('raw-diff'))
const applyHunkEdit = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
const stageFile = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())
const unstageFile = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())
const discardFile = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())
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
    DiscardFileChanges: (path: string) => discardFile(path),
  },
  RepoService: {
    Info: () => Promise.resolve({ Branch: 'main', Ahead: 0, Behind: 0, HasUncommitted: true }),
  },
  DiffService: {
    LoadEditorFile: () => Promise.resolve('unchanged\nnew line\noutside hunk\n'),
    SaveEditorFile: (...args: unknown[]) => saveEditorFile(...args),
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
    ApplyHunkEdit: (...args: unknown[]) => applyHunkEdit(...args),
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
  it('opens the full file and returns to the diff after saving', async () => {
    saveEditorFile.mockClear()
    const wrapper = await mountView()
    const pane = wrapper.get('.changes-diff')
    expect(pane.classes()).toContain('cursor-review')
    expect(wrapper.find('[aria-label="Diff layout"]').exists()).toBe(false)
    await pane.trigger('keydown', { key: 'e' })
    await flushPromises()
    const view = EditorView.findFromDOM(wrapper.get('.cm-editor').element as HTMLElement)!
    expect(view.state.doc.toString()).toContain('outside hunk')
    view.dispatch({ changes: { from: 0, to: 9, insert: 'edited context' } })
    Vim.handleEx(getCM(view)! as Parameters<typeof Vim.handleEx>[0], 'w')
    await flushPromises()
    expect(saveEditorFile).toHaveBeenCalledWith('src/app.ts', 'unchanged\nnew line\noutside hunk\n', 'edited context\nnew line\noutside hunk\n')
    expect(wrapper.find('.cm-editor').exists()).toBe(false)
    expect(wrapper.find('.diff-spacer').exists()).toBe(true)
    wrapper.unmount()
  })

  it('enters the diff and returns to the file list with Escape or Left', async () => {
    const wrapper = await mountView()
    // Enter through the actual list handler, then send keys to browser focus.
    const pane = wrapper.find('[data-keyboard-pane]')
    await pane.trigger('keydown', { key: 'l' })
    await flushPromises()
    expect(document.activeElement?.classList.contains('diff-view')).toBe(true)
    await wrapper.find('.diff-view').trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(pane.element)
    await pane.trigger('keydown', { key: 'l' })
    await flushPromises()
    await wrapper.find('.diff-view').trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(pane.element)
    await pane.trigger('keydown', { key: 's', ctrlKey: true })
    expect(stageFile).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  beforeEach(() => {
    stageFile.mockClear()
    unstageFile.mockClear()
    commit.mockClear()
    discardFile.mockClear()
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
    expect(wrapper.findAll('.changes-section .section-count').map((s) => s.text())).toEqual([
      '2',
      '1',
    ])
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

  it('uses h/l for tree containers and Enter to open the diff', async () => {
    useShellSettings().changesGroupByDir = 'always'
    const wrapper = await mountView()
    const files = wrapper.get('.changes-files')
    ;(files.element as HTMLElement).focus()
    await files.trigger('keydown', { key: 'l' })
    expect(document.activeElement).toBe(files.element)
    await files.trigger('keydown', { key: 'h' })
    const directory = wrapper.findAll('.change-dir-row')[0]!
    expect(directory.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(directory.element)
    await directory.trigger('keydown', { key: 'l' })
    expect(directory.attributes('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(directory.element)
    await directory.trigger('keydown', { key: 'l' })
    const file = wrapper.findAll('.change-row')[0]!
    expect(document.activeElement).toBe(file.element)
    await file.trigger('keydown', { key: 'l' })
    expect(document.activeElement).toBe(file.element)
    await file.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.diff-view').element)
    wrapper.unmount()
  })

  it('navigates tree headers and reopens fully collapsed sections', async () => {
    useShellSettings().changesGroupByDir = 'always'
    const wrapper = await mountView()
    const sections = wrapper.findAll('.section-toggle')
    for (const section of sections) await section.trigger('click')
    expect(wrapper.findAll('.change-row')).toHaveLength(0)
    await sections[0]!.trigger('keydown', { key: 'j' })
    expect(document.activeElement).toBe(sections[1]!.element)
    await sections[1]!.trigger('keydown', { key: 'k' })
    expect(document.activeElement).toBe(sections[0]!.element)
    await sections[0]!.trigger('keydown', { key: 'l' })
    expect(sections[0]!.attributes('aria-expanded')).toBe('true')
    await sections[0]!.trigger('keydown', { key: 'l' })
    const directory = wrapper.findAll('.change-dir-row')[0]!
    expect(document.activeElement).toBe(directory.element)
    await directory.trigger('keydown', { key: 'h' })
    expect(directory.attributes('aria-expanded')).toBe('false')
    await directory.trigger('keydown', { key: 'h' })
    expect(document.activeElement).toBe(sections[0]!.element)
    wrapper.unmount()
  })

  it('skips every hidden child after collapsing a group from a deep file cursor', async () => {
    const originalEntries = statusEntries
    useShellSettings().changesGroupByDir = 'always'
    statusEntries = [
      ...Array.from({ length: 12 }, (_, i) => entry({ Path: `many/file${i}.ts`, WorkStatus: FileStatus.FileModified })),
      entry({ Path: 'next/file.ts', WorkStatus: FileStatus.FileModified }),
    ]
    const wrapper = await mountView()
    const files = wrapper.get('.changes-files')
    await wrapper.findAll('.change-row')[11]!.trigger('click')
    await files.trigger('keydown', { key: 'h' })
    await flushPromises()
    const dirs = wrapper.findAll('.change-dir-row')
    expect(wrapper.findAll('.change-row')).toHaveLength(1)
    expect(dirs[0]!.classes()).toContain('selected')
    expect(wrapper.findAll('.change-row.selected')).toHaveLength(0)
    // Key events routed through the pane must still use the collapsed tree
    // cursor, rather than the old file index (now clamped to the remaining file).
    await files.trigger('keydown', { key: 'j' })
    expect(document.activeElement).toBe(dirs[1]!.element)
    expect(dirs[1]!.classes()).toContain('selected')
    await files.trigger('keydown', { key: 'k' })
    expect(document.activeElement).toBe(dirs[0]!.element)
    await files.trigger('keydown', { key: 'l' })
    expect(wrapper.findAll('.change-row')).toHaveLength(13)
    wrapper.unmount()
    statusEntries = originalEntries
  })

  it('stages collapsed folder descendants without touching siblings or staged files', async () => {
    const original = statusEntries
    useShellSettings().changesGroupByDir = 'always'
    statusEntries = [
      entry({ Path: 'src/main.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/lib/deep.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src-other/file.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/staged.ts', IndexStatus: FileStatus.FileModified, IsStaged: true }),
    ]
    const wrapper = await mountView()
    try {
      const folder = wrapper.get('[data-tree-key="dir:unstaged:src"]')
      await folder.trigger('click')
      await folder.trigger('keydown', { key: 's' })
      await flushPromises()
      expect(stageFile.mock.calls.map(([path]) => path)).toEqual(['src/main.ts', 'src/lib/deep.ts'])
      expect(unstageFile).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(folder.element)
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('unstages an entire collapsed staged section', async () => {
    const original = statusEntries
    useShellSettings().changesGroupByDir = 'always'
    statusEntries = [
      entry({ Path: 'src/a.ts', IndexStatus: FileStatus.FileModified, IsStaged: true }),
      entry({ Path: 'other/b.ts', IndexStatus: FileStatus.FileModified, IsStaged: true }),
      entry({ Path: 'working.ts', WorkStatus: FileStatus.FileModified }),
    ]
    const wrapper = await mountView()
    try {
      const section = wrapper.get('[data-tree-key="section:staged"]')
      await section.trigger('click')
      await section.trigger('keydown', { key: 'u' })
      await flushPromises()
      expect(unstageFile.mock.calls.map(([path]) => path)).toEqual(['src/a.ts', 'other/b.ts'])
      unstageFile.mockClear()
      await section.trigger('keydown', { key: 's' })
      await flushPromises()
      expect(unstageFile).toHaveBeenCalledTimes(2)
      expect(stageFile).not.toHaveBeenCalled()
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('confirms all folder discards once and includes untracked descendants', async () => {
    const original = statusEntries
    const confirm = useShellSettings().confirmDestructiveActions
    useShellSettings().changesGroupByDir = 'always'
    useShellSettings().confirmDestructiveActions = true
    statusEntries = [
      entry({ Path: 'src/a.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/deep/new.ts', IsUntracked: true, WorkStatus: FileStatus.FileUntracked }),
      entry({ Path: 'other/b.ts', WorkStatus: FileStatus.FileModified }),
    ]
    const wrapper = await mountView()
    try {
      const folder = wrapper.get('[data-tree-key="dir:unstaged:src"]')
      await folder.trigger('click')
      await folder.trigger('keydown', { key: 'x' })
      expect(discardFile).not.toHaveBeenCalled()
      const dialog = wrapper.getComponent(OperationConfirmModal)
      const request = dialog.props('request')
      expect(request.details?.map(item => item.value)).toEqual(['src/a.ts', 'src/deep/new.ts'])
      expect(request.message).toContain('1 untracked files will be deleted')
      await request.onConfirm({})
      await flushPromises()
      expect(discardFile.mock.calls.map(([path]) => path)).toEqual(['src/a.ts', 'src/deep/new.ts'])
    } finally { wrapper.unmount(); statusEntries = original; useShellSettings().confirmDestructiveActions = confirm }
  })

  it('refreshes the folded group after a partially failed discard', async () => {
    const original = statusEntries
    const settings = useShellSettings()
    const grouping = settings.changesGroupByDir
    const confirm = settings.confirmDestructiveActions
    settings.changesGroupByDir = 'always'
    settings.confirmDestructiveActions = true
    statusEntries = [
      entry({ Path: 'src/a.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/b.ts', IsUntracked: true, WorkStatus: FileStatus.FileUntracked }),
    ]
    discardFile.mockImplementationOnce(async () => { statusEntries = statusEntries.slice(1) })
    discardFile.mockRejectedValueOnce(new Error('file locked'))
    const wrapper = await mountView()
    try {
      const folder = wrapper.get('[data-tree-key="dir:unstaged:src"]')
      await folder.trigger('click')
      await folder.trigger('keydown', { key: 'x' })
      await wrapper.getComponent(OperationConfirmModal).props('request').onConfirm({})
      await flushPromises()
      await wrapper.get('[data-tree-key="dir:unstaged:src"]').trigger('click')
      expect(wrapper.find('[data-tree-key="u:src/a.ts"]').exists()).toBe(false)
      expect(wrapper.find('[data-tree-key="u:src/b.ts"]').exists()).toBe(true)
    } finally {
      wrapper.unmount()
      statusEntries = original
      settings.changesGroupByDir = grouping
      settings.confirmDestructiveActions = confirm
    }
  })

  it('nests directories before direct files and keeps the correct parent for navigation', async () => {
    const original = statusEntries
    useShellSettings().changesGroupByDir = 'always'
    statusEntries = [
      entry({ Path: 'some/path/frontend/root.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'some/path/frontend/nested/child.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'some/path/frontend/nested/deeper/leaf.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'root.txt', WorkStatus: FileStatus.FileModified }),
    ]
    const wrapper = await mountView()
    try {
      const tree = wrapper.findAll('.change-dir-row, .change-row')
      expect(tree.map(item => item.attributes('data-tree-key'))).toEqual([
        'dir:unstaged:some/path/frontend',
        'dir:unstaged:some/path/frontend/nested',
        'dir:unstaged:some/path/frontend/nested/deeper',
        'u:some/path/frontend/nested/deeper/leaf.ts',
        'u:some/path/frontend/nested/child.ts',
        'u:some/path/frontend/root.ts',
        'dir:unstaged:.',
        'u:root.txt',
      ])
      expect(wrapper.findAll('.change-dir-path').map(item => item.text())).toEqual(['some/path/frontend', 'nested', 'deeper', '.'])
      const parent = wrapper.get('[data-tree-key="dir:unstaged:some/path/frontend"]')
      const nested = wrapper.get('[data-tree-key="dir:unstaged:some/path/frontend/nested"]')
      expect(parent.get('.section-count').text()).toBe('3')
      await nested.trigger('keydown', { key: 'h' })
      expect(wrapper.findAll('.change-row').map(item => item.attributes('title'))).toEqual(['some/path/frontend/root.ts', 'root.txt'])
      await nested.trigger('keydown', { key: 'j' })
      const rootFile = wrapper.get('[data-tree-key="u:some/path/frontend/root.ts"]')
      expect(document.activeElement).toBe(rootFile.element)
      // The previous visible directory is nested/, but this file belongs to frontend/.
      await rootFile.trigger('keydown', { key: 'h' })
      expect(parent.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(parent.element)
      expect(wrapper.findAll('.change-row')).toHaveLength(1)
      await parent.trigger('keydown', { key: 'l' })
      expect(wrapper.get('[data-tree-key="dir:unstaged:some/path/frontend/nested"]').attributes('aria-expanded')).toBe('false')
      expect(wrapper.findAll('.change-row')).toHaveLength(2)
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('keeps both sections visible when the worktree is clean', async () => {
    const original = statusEntries
    statusEntries = []
    const wrapper = await mountView()
    try {
      expect(wrapper.findAll('.section-label').map(item => item.text())).toEqual(['Unstaged', 'Staged'])
      expect(wrapper.findAll('.changes-section .section-count').map(item => item.text())).toEqual(['0', '0'])
      expect(wrapper.text()).toContain('Working tree clean')
      expect(wrapper.get('.changes-selection-footer').text()).toContain('Select a file or folder')
      expect(wrapper.findAll('.changes-selection-footer button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('shows the entire collapsed folder scope in the footer and stages it from there', async () => {
    const original = statusEntries
    useShellSettings().changesGroupByDir = 'always'
    statusEntries = [
      entry({ Path: 'src/a.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/nested/b.ts', WorkStatus: FileStatus.FileModified }),
    ]
    const wrapper = await mountView()
    try {
      await wrapper.get('[data-tree-key="dir:unstaged:src"]').trigger('click')
      const footer = wrapper.get('.changes-selection-footer')
      expect(footer.get('.changes-selection-path').text()).toBe('src')
      expect(footer.text()).toContain('Stage all 2 files')
      expect(wrapper.findAll('.change-row')).toHaveLength(0)
      await footer.findAll('button')[0]!.trigger('click')
      await flushPromises()
      expect(stageFile.mock.calls.map(([path]) => path)).toEqual(['src/a.ts', 'src/nested/b.ts'])
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('keeps selection on the next working file as staging moves files between sections', async () => {
    const original = statusEntries
    useShellSettings().changesGroupByDir = 'always'
    statusEntries = [
      entry({ Path: 'src/a.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/b.ts', WorkStatus: FileStatus.FileModified }),
    ]
    stageFile.mockImplementation(async path => {
      statusEntries = statusEntries.map(item => item.Path === path ? entry({ Path: path, IndexStatus: FileStatus.FileModified, IsStaged: true }) : item)
    })
    const wrapper = await mountView()
    try {
      await wrapper.get('[data-tree-key="u:src/a.ts"]').trigger('click')
      await wrapper.get('.changes-files').trigger('keydown', { key: 's' })
      await flushPromises()
      expect(wrapper.get('.changes-selection-path').text()).toBe('src/b.ts')
      expect(wrapper.get('[data-tree-key="u:src/b.ts"]').classes()).toContain('selected')
      expect(document.activeElement).toBe(wrapper.get('[data-tree-key="u:src/b.ts"]').element)
      await wrapper.get('[data-tree-key="u:src/b.ts"]').trigger('keydown', { key: 's' })
      await flushPromises()
      expect(wrapper.get('[data-tree-key="section:unstaged"]').classes()).toContain('selected')
      expect(wrapper.get('.changes-selection-path').text()).toBe('Unstaged')
      expect(wrapper.text()).toContain('No unstaged files')
    } finally { wrapper.unmount(); statusEntries = original; stageFile.mockImplementation(async () => {}) }
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

  it('keeps the review-desk description visible and submits the full message', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.commit-body').isVisible()).toBe(true)
    await wrapper.find('.commit-summary input').setValue('Refine review desk')
    await wrapper.find('.commit-body').setValue('Keep the diff and commit form available together.')
    await wrapper.find('form.commit-bar').trigger('submit')
    await flushPromises()
    expect(commit).toHaveBeenCalledWith(
      'Refine review desk\n\nKeep the diff and commit form available together.',
    )
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

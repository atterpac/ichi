import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { EditorView } from '@codemirror/view'
import { Vim, getCM } from '@replit/codemirror-vim'
import OperationConfirmModal from '../components/overlays/OperationConfirmModal.vue'
import { invalidateChangesSnapshots } from '../components/status/changesSnapshotCache'
import ChangesView from '../components/status/ChangesView.vue'
import DiffView from '../components/diff/DiffView.vue'
import { useToasts } from '../composables/useToasts'
import { usePreferenceBindings } from '../customization/usePreferences'
import { FileStatus, LineType } from '../bindings/github.com/atterpac/ichi/internal/git'

Range.prototype.getClientRects = () => [] as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
const workingFileContent = vi.fn<(path: string) => Promise<string>>(() => Promise.resolve('working content'))
const indexFileContent = vi.fn<(path: string) => Promise<string>>(() => Promise.resolve('index content'))
const workingFilePreview = vi.fn<(path: string) => Promise<{ Content: string; Truncated: boolean; Binary: boolean }>>(() => Promise.resolve({ Content: 'line one\nline two', Truncated: false, Binary: false }))
const saveEditorFile = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined)

const parsedDiff = [
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
]
const worktreeFile = vi.fn<(path: string, oldPath: string, staged: boolean) => Promise<(typeof parsedDiff)[number]>>((path: string, _oldPath: string, _staged: boolean) => Promise.resolve({ ...parsedDiff[0]!, Path: path }))
const summarySnapshot = () => Promise.resolve({ Entries: statusEntries, Working: [{ Path: 'src/app.ts', Added: 1, Deleted: 1, Binary: false }], Staged: [{ Path: 'src/new.ts', Added: 1, Deleted: 1, Binary: false }] })
const readSummary = vi.fn<typeof summarySnapshot>(summarySnapshot)
const applyHunkEdit = vi.fn<(...args: unknown[]) => Promise<void>>(() => Promise.resolve())
const stageFiles = vi.fn<(paths: string[]) => Promise<void>>(() => Promise.resolve())
const unstageFiles = vi.fn<(paths: string[]) => Promise<void>>(() => Promise.resolve())
const discardSnapshot = async (paths: string[]) => ({ Completed: paths, FailedPath: '', Error: '', Remaining: [] as string[] })
const discardFiles = vi.fn<typeof discardSnapshot>(discardSnapshot)
const commit = vi.fn<(message: string) => Promise<void>>(() => Promise.resolve())
const getCommitMessage = vi.fn<() => Promise<string>>(() => Promise.resolve('prev subject\n\nprev body'))

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
    Summary: async () => ({ Summary: await readSummary(), Info: { Path: '/repo', Branch: 'main', Ahead: 0, Behind: 0, HasUncommitted: true } }),
    StageFiles: (paths: string[]) => stageFiles(paths),
    UnstageFiles: (paths: string[]) => unstageFiles(paths),
    StageAll: () => Promise.resolve(),
    Commit: (message: string) => commit(message),
    CommitAmend: () => Promise.resolve(),
    DiscardFiles: (paths: string[]) => discardFiles(paths),
  },
  RepoService: {
    Info: () => { throw new Error('Changes must reuse info from Summary') },
  },
  DiffService: {
    LoadEditorFile: () => Promise.resolve('unchanged\nnew line\noutside hunk\n'),
    SaveEditorFile: (...args: unknown[]) => saveEditorFile(...args),
    WorktreeFile: (path: string, oldPath: string, staged: boolean) => worktreeFile(path, oldPath, staged),
    ApplyHunkEdit: (...args: unknown[]) => applyHunkEdit(...args),
    StageHunk: () => Promise.resolve(),
    UnstageHunk: () => Promise.resolve(),
    StageLines: () => Promise.resolve(),
    UnstageLines: () => Promise.resolve(),
  },
  InspectService: {
    WorkingFileContent: (path: string) => workingFileContent(path),
    IndexFileContent: (path: string) => indexFileContent(path),
    WorkingFilePreview: (path: string) => workingFilePreview(path),
  },
  GraphService: {
    GetCommitMessage: () => getCommitMessage(),
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
  it('windows a large changes list and reaches offscreen files by keyboard', async () => {
    const saved = statusEntries
    statusEntries = Array.from({ length: 10000 }, (_, index) => entry({ Path: `file-${String(index).padStart(5, '0')}.txt`, WorkStatus: FileStatus.FileModified }))
    usePreferenceBindings()['changes.groupByDir'] = 'never'
    const wrapper = await mountView()
    try {
      expect(wrapper.findAll('.change-row').length).toBeLessThan(100)
      await wrapper.get('.changes-files').trigger('keydown', { key: 'G' })
      await flushPromises()
      expect(wrapper.get('.change-row.selected').text()).toContain('file-09999.txt')
      expect(wrapper.findAll('.change-row').length).toBeLessThan(100)
    } finally { wrapper.unmount(); statusEntries = saved }
  })
  it('reads context gaps from the worktree or index to match the selected patch', async () => {
    workingFileContent.mockClear()
    indexFileContent.mockClear()
    const wrapper = await mountView()
    try {
      const loadWorking = wrapper.getComponent(DiffView).props('loadFileContent')!
      expect(await loadWorking()).toBe('working content')
      expect(workingFileContent).toHaveBeenCalledExactlyOnceWith('src/app.ts')
      expect(indexFileContent).not.toHaveBeenCalled()
      await wrapper.findAll('.change-row').find(row => row.text().includes('new.ts'))!.trigger('click')
      await flushPromises()
      const loadIndex = wrapper.getComponent(DiffView).props('loadFileContent')!
      expect(await loadIndex()).toBe('index content')
      expect(indexFileContent).toHaveBeenCalledExactlyOnceWith('src/new.ts')
    } finally { wrapper.unmount() }
  })

  it('uses bounded preview metadata for an untracked binary instead of a full text read', async () => {
    workingFileContent.mockClear()
    workingFilePreview.mockClear().mockResolvedValueOnce({ Content: '', Truncated: false, Binary: true })
    const wrapper = await mountView()
    try {
      await wrapper.findAll('.change-row').find(row => row.text().includes('notes.md'))!.trigger('click')
      await flushPromises()
      expect(workingFilePreview).toHaveBeenCalledExactlyOnceWith('notes.md')
      expect(workingFileContent).not.toHaveBeenCalled()
      expect(wrapper.getComponent(DiffView).props('diff')).toMatchObject({ Path: 'notes.md', Binary: true, Hunks: [] })
    } finally { wrapper.unmount() }
  })

  it('reports a failed patch read instead of treating it as an empty diff', async () => {
    worktreeFile.mockRejectedValueOnce(new Error('patch read failed'))
    const wrapper = await mountView()
    try {
      expect(wrapper.find('.changes-files').exists()).toBe(true)
      expect(wrapper.text()).toContain('patch read failed')
      await wrapper.findAll('button').find(button => button.text() === 'Retry')!.trigger('click')
      await flushPromises()
      expect(wrapper.find('.diff-hunk').exists()).toBe(true)
    } finally { wrapper.unmount() }
  })
  it('shows a large file list and summary counts while only its selected patch is pending', async () => {
    const saved = statusEntries
    statusEntries = Array.from({ length: 200 }, (_, i) => entry({ Path: `file-${i}.txt`, WorkStatus: FileStatus.FileModified }))
    usePreferenceBindings()['changes.groupByDir'] = 'never'
    let finish!: (value: typeof parsedDiff[0]) => void
    worktreeFile.mockClear().mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const wrapper = await mountView()
    try {
      expect(wrapper.find('.changes-files').exists()).toBe(true)
      expect(wrapper.text()).toContain('file-199.txt')
      expect(wrapper.text()).toContain('Loading diff...')
      expect(worktreeFile).toHaveBeenCalledTimes(1)
      expect(worktreeFile).toHaveBeenCalledWith('file-0.txt', '', false)
      finish({ ...parsedDiff[0]!, Path: 'file-0.txt' })
      await flushPromises()
    } finally { wrapper.unmount(); statusEntries = saved }
  })
  it('skips intermediate selections while a patch is in flight and ignores its stale result', async () => {
    const saved = statusEntries
    statusEntries = ['a', 'b', 'c'].map(Path => entry({ Path, WorkStatus: FileStatus.FileModified }))
    let finish!: (value: typeof parsedDiff[0]) => void
    worktreeFile.mockClear().mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const wrapper = await mountView()
    try {
      const files = wrapper.get('.changes-files')
      await files.trigger('keydown', { key: 'j' })
      await files.trigger('keydown', { key: 'j' })
      expect(worktreeFile).toHaveBeenCalledTimes(1)
      finish({ ...parsedDiff[0]!, Path: 'a' })
      await flushPromises()
      expect(worktreeFile.mock.calls.map(call => call[0])).toEqual(['a', 'c'])
      expect(wrapper.get('.diff-file-path').text()).toBe('c')
    } finally { wrapper.unmount(); statusEntries = saved }
  })
  it('discards a pending patch on refresh even when the file counts are unchanged', async () => {
    let finish!: (value: typeof parsedDiff[0]) => void
    worktreeFile.mockClear().mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    const wrapper = await mountView()
    try {
      await wrapper.get('.changes-files').trigger('keydown', { key: 'r' })
      await flushPromises()
      finish({ ...parsedDiff[0]!, Path: 'stale-file' })
      await flushPromises()
      expect(worktreeFile).toHaveBeenCalledTimes(2)
      expect(wrapper.get('.diff-file-path').text()).toBe('src/app.ts')
      expect(wrapper.text()).not.toContain('stale-file')
    } finally { wrapper.unmount() }
  })
  it('reports summary failures without starting a patch read', async () => {
    readSummary.mockRejectedValueOnce(new Error('status failed'))
    worktreeFile.mockClear()
    const wrapper = await mountView()
    try {
      expect(wrapper.text()).toContain('Unable to load worktree')
      expect(wrapper.text()).toContain('status failed')
      expect(worktreeFile).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
  it('clears the summary and description when amend is unchecked', async () => {
    const wrapper = await mountView()
    try {
      const toggle = wrapper.get('.commit-amend input')
      const summary = wrapper.get<HTMLInputElement>('[aria-label="Commit summary"]')
      const body = wrapper.get<HTMLTextAreaElement>('[aria-label="Commit description"]')
      await toggle.setValue(true)
      await flushPromises()
      expect(summary.element.value).toBe('prev subject')
      expect(body.element.value).toBe('prev body')
      await toggle.setValue(false)
      expect(summary.element.value).toBe('')
      expect(body.element.value).toBe('')
    } finally { wrapper.unmount() }
  })

  it('ignores an old amend request after toggling amend off and on again', async () => {
    let resolve!: (message: string) => void
    getCommitMessage.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const wrapper = await mountView()
    try {
      const toggle = wrapper.get('.commit-amend input')
      await toggle.setValue(true)
      await toggle.setValue(false)
      resolve('stale subject\n\nstale body')
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('[aria-label="Commit summary"]').element.value).toBe('')
      expect(wrapper.get<HTMLTextAreaElement>('[aria-label="Commit description"]').element.value).toBe('')
      await toggle.setValue(true)
      await flushPromises()
      expect(wrapper.get<HTMLInputElement>('[aria-label="Commit summary"]').element.value).toBe('prev subject')
    } finally { wrapper.unmount() }
  })

  it('keeps the full file open after write and refreshes the diff after write-quit', async () => {
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
    expect(wrapper.find('.cm-editor').exists()).toBe(true)
    view.dispatch({ changes: { from: 0, to: 14, insert: 'second edit' } })
    Vim.handleEx(getCM(view)! as Parameters<typeof Vim.handleEx>[0], 'wq')
    await flushPromises()
    expect(saveEditorFile).toHaveBeenLastCalledWith('src/app.ts', 'edited context\nnew line\noutside hunk\n', 'second edit\nnew line\noutside hunk\n')
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
    expect(stageFiles).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  beforeEach(() => {
    stageFiles.mockClear()
    unstageFiles.mockClear()
    commit.mockClear()
    discardFiles.mockClear()
  })

  afterEach(() => {
    usePreferenceBindings()['changes.groupByDir'] = 'auto'
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
    expect(rows[0]!.find('.d-del').text()).toBe('−1')
    expect(rows.map(row => row.get('.file-status').attributes('aria-label'))).toEqual([
      'Modified', 'Untracked', 'Added',
    ])
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
    usePreferenceBindings()['changes.groupByDir'] = 'always'
    const wrapper = await mountView()
    const dirs = wrapper.findAll('.change-dir-row .change-dir-path').map((d) => d.text())
    expect(dirs).toEqual(['src', '.', 'src'])
    expect(wrapper.findAll('.change-row.grouped')).toHaveLength(3)
    await wrapper.findAll('.change-dir-row')[0]!.trigger('click')
    expect(wrapper.findAll('.change-row')).toHaveLength(2)
    wrapper.unmount()
  })

  it('uses h/l for tree containers and Enter to open the diff', async () => {
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
      expect(stageFiles).toHaveBeenCalledExactlyOnceWith(['src/main.ts', 'src/lib/deep.ts'])
      expect(unstageFiles).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(folder.element)
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('unstages an entire collapsed staged section', async () => {
    const original = statusEntries
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
      expect(unstageFiles).toHaveBeenCalledExactlyOnceWith(['src/a.ts', 'other/b.ts'])
      unstageFiles.mockClear()
      await section.trigger('keydown', { key: 's' })
      await flushPromises()
      expect(unstageFiles).toHaveBeenCalledTimes(1)
      expect(stageFiles).not.toHaveBeenCalled()
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('confirms all folder discards once and includes untracked descendants', async () => {
    const original = statusEntries
    const confirm = usePreferenceBindings()['operations.confirmDestructive']
    usePreferenceBindings()['changes.groupByDir'] = 'always'
    usePreferenceBindings()['operations.confirmDestructive'] = true
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
      expect(discardFiles).not.toHaveBeenCalled()
      const dialog = wrapper.getComponent(OperationConfirmModal)
      const request = dialog.props('request')
      expect(request.details?.map(item => item.value)).toEqual(['src/a.ts', 'src/deep/new.ts'])
      expect(request.message).toContain('1 untracked files will be deleted')
      await request.onConfirm({})
      await flushPromises()
      expect(discardFiles).toHaveBeenCalledExactlyOnceWith(['src/a.ts', 'src/deep/new.ts'])
    } finally { wrapper.unmount(); statusEntries = original; usePreferenceBindings()['operations.confirmDestructive'] = confirm }
  })

  it('refreshes the folded group after a partially failed discard', async () => {
    const original = statusEntries
    const settings = usePreferenceBindings()
    const grouping = settings['changes.groupByDir']
    const confirm = settings['operations.confirmDestructive']
    settings['changes.groupByDir'] = 'always'
    settings['operations.confirmDestructive'] = true
    statusEntries = [
      entry({ Path: 'src/a.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/b.ts', IsUntracked: true, WorkStatus: FileStatus.FileUntracked }),
    ]
    discardFiles.mockImplementationOnce(async paths => {
      statusEntries = statusEntries.slice(1)
      return { Completed: [paths[0]!], FailedPath: paths[1]!, Error: 'file locked', Remaining: paths.slice(2) }
    })
    const wrapper = await mountView()
    try {
      readSummary.mockClear()
      const folder = wrapper.get('[data-tree-key="dir:unstaged:src"]')
      await folder.trigger('click')
      await folder.trigger('keydown', { key: 'x' })
      await wrapper.getComponent(OperationConfirmModal).props('request').onConfirm({})
      await flushPromises()
      await wrapper.get('[data-tree-key="dir:unstaged:src"]').trigger('click')
      expect(wrapper.find('[data-tree-key="u:src/a.ts"]').exists()).toBe(false)
      expect(wrapper.find('[data-tree-key="u:src/b.ts"]').exists()).toBe(true)
      expect(readSummary).toHaveBeenCalledTimes(1)
      const toasts = useToasts().toasts
      const message = toasts[toasts.length - 1]?.message
      expect(message).toContain('1 files discarded (src/a.ts)')
      expect(message).toContain('Failed on src/b.ts: file locked')
    } finally {
      wrapper.unmount()
      statusEntries = original
      settings['changes.groupByDir'] = grouping
      settings['operations.confirmDestructive'] = confirm
    }
  })

  it('nests directories before direct files and keeps the correct parent for navigation', async () => {
    const original = statusEntries
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
    usePreferenceBindings()['changes.groupByDir'] = 'always'
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
      expect(stageFiles.mock.calls.flatMap(([paths]) => paths)).toEqual(['src/a.ts', 'src/nested/b.ts'])
    } finally { wrapper.unmount(); statusEntries = original }
  })

  it('keeps selection on the next working file as staging moves files between sections', async () => {
    const original = statusEntries
    usePreferenceBindings()['changes.groupByDir'] = 'always'
    statusEntries = [
      entry({ Path: 'src/a.ts', WorkStatus: FileStatus.FileModified }),
      entry({ Path: 'src/b.ts', WorkStatus: FileStatus.FileModified }),
    ]
    stageFiles.mockImplementation(async paths => {
      statusEntries = statusEntries.map(item => paths.includes(item.Path) ? entry({ Path: item.Path, IndexStatus: FileStatus.FileModified, IsStaged: true }) : item)
    })
    const wrapper = await mountView()
    try {
      expect(wrapper.get('.pane-staged').classes()).toContain('is-empty')
      expect(wrapper.get('.changes-section-resizer').attributes('disabled')).toBeDefined()
      await wrapper.get('[data-tree-key="u:src/a.ts"]').trigger('click')
      await wrapper.get('.changes-files').trigger('keydown', { key: 's' })
      await flushPromises()
      expect(wrapper.get('.pane-staged').classes()).not.toContain('is-empty')
      expect(wrapper.get('.changes-section-resizer').attributes('disabled')).toBeUndefined()
      expect(wrapper.get('.changes-selection-path').text()).toBe('src/b.ts')
      expect(wrapper.get('[data-tree-key="u:src/b.ts"]').classes()).toContain('selected')
      expect(document.activeElement).toBe(wrapper.get('[data-tree-key="u:src/b.ts"]').element)
      await wrapper.get('[data-tree-key="u:src/b.ts"]').trigger('keydown', { key: 's' })
      await flushPromises()
      expect(wrapper.get('[data-tree-key="section:unstaged"]').classes()).toContain('selected')
      expect(wrapper.get('.changes-selection-path').text()).toBe('Unstaged')
      expect(wrapper.text()).toContain('No unstaged files')
      expect(wrapper.get('.pane-unstaged').classes()).toContain('is-empty')
      expect(wrapper.get('.changes-section-resizer').attributes('disabled')).toBeDefined()
    } finally { wrapper.unmount(); statusEntries = original; stageFiles.mockImplementation(async () => {}) }
  })

  it('T toggles between tree and flat file list', async () => {
    const wrapper = await mountView()
    const files = wrapper.find('.changes-files')
    expect(wrapper.findAll('.change-dir-row')).toHaveLength(0)
    await files.trigger('keydown', { key: 'T' })
    expect(usePreferenceBindings()['changes.groupByDir']).toBe('always')
    expect(wrapper.findAll('.change-dir-row').length).toBeGreaterThan(0)
    await files.trigger('keydown', { key: 'T' })
    expect(usePreferenceBindings()['changes.groupByDir']).toBe('never')
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
    expect(stageFiles).not.toHaveBeenCalled()
    await wrapper.find('.changes-files').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('navigate')).toEqual([['conflicts', 'src/clash.ts']])
    statusEntries = saved
    wrapper.unmount()
  })

  it('stages the file under the cursor on s', async () => {
    const wrapper = await mountView()
    await wrapper.find('.changes-files').trigger('keydown', { key: 's' })
    expect(stageFiles).toHaveBeenCalledWith(['src/app.ts'])
    wrapper.unmount()
  })

  it('unstages a staged row on s (toggle)', async () => {
    const wrapper = await mountView()
    const files = wrapper.find('.changes-files')
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 's' })
    expect(unstageFiles).toHaveBeenCalledWith(['src/new.ts'])
    wrapper.unmount()
  })

  it('reuses a selected-file patch when returning to the same row', async () => {
    worktreeFile.mockClear()
    const wrapper = await mountView()
    expect(worktreeFile).toHaveBeenCalledTimes(1)
    const files = wrapper.find('.changes-files')
    await files.trigger('keydown', { key: 'j' })
    await files.trigger('keydown', { key: 'j' })
    await flushPromises()
    await files.trigger('keydown', { key: 'k' })
    await files.trigger('keydown', { key: 'k' })
    await flushPromises()
    expect(worktreeFile).toHaveBeenCalledTimes(2)
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

it('batches a hundred selected files and refreshes once even when staging fails', async () => {
  const original = statusEntries
  const settings = usePreferenceBindings()
  const grouping = settings['changes.groupByDir']
  settings['changes.groupByDir'] = 'always'
  statusEntries = Array.from({ length: 100 }, (_, i) => entry({ Path: `batch/file-${i}.txt`, WorkStatus: FileStatus.FileModified }))
  const wrapper = await mountView()
  try {
    stageFiles.mockClear().mockRejectedValueOnce(new Error('index locked'))
    readSummary.mockClear()
    const folder = wrapper.get('[data-tree-key="dir:unstaged:batch"]')
    await folder.trigger('keydown', { key: 's' })
    await flushPromises()
    expect(stageFiles).toHaveBeenCalledExactlyOnceWith(statusEntries.map(item => item.Path))
    expect(readSummary).toHaveBeenCalledTimes(1)
    // Failure clears the busy state and permits a second batch attempt.
    await wrapper.get('[data-tree-key="dir:unstaged:batch"]').trigger('keydown', { key: 's' })
    await flushPromises()
    expect(stageFiles).toHaveBeenCalledTimes(2)
    expect(readSummary).toHaveBeenCalledTimes(2)
  } finally { wrapper.unmount(); statusEntries = original; settings['changes.groupByDir'] = grouping }
})

it('unstages both sides of a rename in one request', async () => {
  const original = statusEntries
  statusEntries = [entry({ Path: 'new name', OldPath: 'old name', IndexStatus: FileStatus.FileRenamed, IsStaged: true })]
  const wrapper = await mountView()
  try {
    unstageFiles.mockClear()
    readSummary.mockClear()
    await wrapper.get('[data-tree-key="section:staged"]').trigger('keydown', { key: 'u' })
    await flushPromises()
    expect(unstageFiles).toHaveBeenCalledExactlyOnceWith(['old name', 'new name'])
    expect(readSummary).toHaveBeenCalledTimes(1)
  } finally { wrapper.unmount(); statusEntries = original }
})

it('shows a cached preview on return, blocks actions, and rereads equal-count patches', async () => {
  invalidateChangesSnapshots()
  const options = { props: { repositoryPath: '/repo' }, attachTo: document.body, global: { stubs: { Teleport: true } } }
  const first = mount(ChangesView, options)
  await flushPromises()
  expect(first.text()).toContain('new line')
  first.unmount()
  let complete!: (value: Awaited<ReturnType<typeof readSummary>>) => void
  const freshSummary = await readSummary()
  readSummary.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  const second = mount(ChangesView, options)
  try {
    await flushPromises()
    expect(second.text()).toContain('new line')
    expect(second.text()).toContain('Checking latest changes')
    expect(second.get('.changes-grid').attributes('inert')).toBeDefined()
    stageFiles.mockClear()
    await second.get('.changes-files').trigger('keydown', { key: 's' })
    await flushPromises()
    expect(stageFiles).not.toHaveBeenCalled()
    worktreeFile.mockClear().mockResolvedValueOnce({ ...parsedDiff[0]!, Hunks: [{ ...parsedDiff[0]!.Hunks[0]!, Lines: [{ Type: LineType.LineAdded, Content: 'externally changed', OldLineNo: 0, NewLineNo: 1 }] }] } as typeof parsedDiff[0])
    complete(freshSummary)
    await flushPromises()
    expect(second.get('.changes-grid').attributes('inert')).toBeUndefined()
    expect(worktreeFile).toHaveBeenCalledTimes(1)
    expect(second.text()).toContain('externally changed')
  } finally { second.unmount(); invalidateChangesSnapshots() }
})

it('never restores another repository preview', async () => {
  invalidateChangesSnapshots()
  const first = mount(ChangesView, { props: { repositoryPath: '/repo' }, global: { stubs: { Teleport: true } } })
  await flushPromises()
  first.unmount()
  const fresh = await readSummary()
  let complete!: (value: typeof fresh) => void
  readSummary.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  const second = mount(ChangesView, { props: { repositoryPath: '/different' }, global: { stubs: { Teleport: true } } })
  try {
    await flushPromises()
    expect(second.text()).toContain('Loading worktree')
    expect(second.find('.changes-grid').exists()).toBe(false)
    complete(fresh)
    await flushPromises()
  } finally { second.unmount(); invalidateChangesSnapshots() }
})

it('retries a snapshot invalidated by a mutation while its read was pending', async () => {
  invalidateChangesSnapshots()
  const fresh = await readSummary()
  let complete!: (value: typeof fresh) => void
  readSummary.mockClear().mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  const wrapper = mount(ChangesView, { global: { stubs: { Teleport: true } } })
  try {
    await flushPromises()
    invalidateChangesSnapshots()
    complete({ ...fresh, Entries: [entry({ Path: 'stale-only.txt', WorkStatus: FileStatus.FileModified })] })
    await flushPromises()
    expect(readSummary).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('stale-only.txt')
    expect(wrapper.text()).toContain('app.ts')
  } finally { wrapper.unmount(); invalidateChangesSnapshots() }
})

it('discards a hundred explicit folder descendants with one request and one refresh', async () => {
  const original = statusEntries
  const settings = usePreferenceBindings()
  const grouping = settings['changes.groupByDir']
  const confirm = settings['operations.confirmDestructive']
  settings['changes.groupByDir'] = 'always'
  settings['operations.confirmDestructive'] = false
  statusEntries = Array.from({ length: 100 }, (_, i) => entry({ Path: `batch/file-${i}.txt`, WorkStatus: FileStatus.FileModified }))
  const wrapper = await mountView()
  try {
    discardFiles.mockClear()
    readSummary.mockClear()
    await wrapper.get('[data-tree-key="dir:unstaged:batch"]').trigger('keydown', { key: 'x' })
    await flushPromises()
    expect(discardFiles).toHaveBeenCalledExactlyOnceWith(statusEntries.map(item => item.Path))
    expect(readSummary).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount(); statusEntries = original
    settings['changes.groupByDir'] = grouping; settings['operations.confirmDestructive'] = confirm
  }
})

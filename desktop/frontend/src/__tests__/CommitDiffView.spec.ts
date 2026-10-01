import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CommitDiffView from '../components/diff/CommitDiffView.vue'
import DiffView from '../components/diff/DiffView.vue'
import {
  clearSharedCommitDetails,
  createCommitDetailCache,
} from '../components/graph/commitDetailCache'
import {
  ChangedFile,
  CommitDetail,
  CommitStats,
  FileDiff,
  FileStatus,
  LineType,
} from '../bindings/github.com/atterpac/ichi/internal/git'

const { loadCommit, between, rootDiff, content } = vi.hoisted(() => ({
  loadCommit: vi.fn<(hash: string) => Promise<CommitDetail | null>>(),
  between:
    vi.fn<(from: string, to: string, path: string, oldPath: string) => Promise<FileDiff | null>>(),
  rootDiff: vi.fn<(hash: string, path: string) => Promise<FileDiff[]>>(),
  content: vi.fn<(hash: string, path: string) => Promise<string>>(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  GraphService: { LoadCommit: loadCommit },
  DiffService: { DiffBetweenFile: between, FileDiff: rootDiff },
  InspectService: { FileContent: content },
}))
function patch(path: string) {
  return FileDiff.createFrom({
    Path: path,
    Hunks: [
      {
        Header: '@@ -1 +1 @@',
        OldStart: 1,
        OldCount: 1,
        NewStart: 1,
        NewCount: 1,
        Lines: [
          { Type: LineType.LineRemoved, Content: `old ${path}`, OldLineNo: 1, NewLineNo: 0 },
          { Type: LineType.LineAdded, Content: `new ${path}`, OldLineNo: 0, NewLineNo: 1 },
        ],
      },
    ],
  })
}
const commit = (overrides: Partial<CommitDetail> = {}) =>
  new CommitDetail({
    Hash: 'commit-a',
    ShortHash: 'a123456',
    Subject: 'Update app',
    Parents: ['parent-a'],
    Stats: new CommitStats({ FilesChanged: 2, Insertions: 2, Deletions: 2 }),
    Files: [
      new ChangedFile({
        Path: 'src/b.ts',
        Status: FileStatus.FileModified,
        Insertions: 1,
        Deletions: 1,
      }),
      new ChangedFile({
        Path: 'src/a.ts',
        Status: FileStatus.FileModified,
        Insertions: 1,
        Deletions: 1,
      }),
    ],
    ...overrides,
  })
async function mountView(
  props: { focusHash?: string; focusFile?: string; repositoryPath?: string } = {
    focusHash: 'commit-a',
  },
) {
  const wrapper = mount(CommitDiffView, { props, attachTo: document.body })
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  clearSharedCommitDetails()
  Element.prototype.scrollIntoView = vi.fn<() => void>()
  loadCommit.mockReset().mockResolvedValue(commit())
  between
    .mockReset()
    .mockImplementation((_from: string, _to: string, path: string) => Promise.resolve(patch(path)))
  rootDiff
    .mockReset()
    .mockImplementation((_hash: string, path: string) => Promise.resolve([patch(path)]))
  content.mockReset().mockResolvedValue('committed content')
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('commit diff navigation', () => {
  it('lists one set of changed files with a read-only selected patch', async () => {
    const wrapper = await mountView()
    try {
      expect(loadCommit).toHaveBeenCalledWith('commit-a')
      expect(wrapper.get('.commit-diff-header').text()).toContain('Update app')
      expect(wrapper.findAll('.commit-file-row').map((row) => row.attributes('title'))).toEqual([
        'src/a.ts',
        'src/b.ts',
      ])
      expect(between).toHaveBeenCalledExactlyOnceWith('parent-a', 'commit-a', 'src/a.ts', '')
      expect(document.activeElement).toBe(wrapper.get('.commit-file-row.selected').element)
      const renderer = wrapper.getComponent(DiffView)
      expect(renderer.props('readOnly')).toBe(true)
      expect(wrapper.find('.commit-bar').exists()).toBe(false)
      expect(wrapper.find('.hunk-stage-hint').exists()).toBe(false)
      for (const key of ['s', 'S', 'e', 'v']) await renderer.trigger('keydown', { key })
      expect(renderer.emitted('stageHunk')).toBeUndefined()
      expect(renderer.emitted('stageFile')).toBeUndefined()
    } finally {
      wrapper.unmount()
    }
  })

  it('moves between files and patches with Tab/Enter and returns through Escape', async () => {
    const wrapper = await mountView()
    try {
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'j' })
      await flushPromises()
      expect(wrapper.get('.commit-file-row.selected').attributes('title')).toBe('src/b.ts')
      expect(wrapper.get('.diff-view').text()).toContain('new src/b.ts')
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'Tab' })
      expect(document.activeElement).toBe(wrapper.get('.diff-view').element)
      await wrapper.get('.diff-view').trigger('keydown', { key: 'Tab', shiftKey: true })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('.commit-file-row.selected').element)
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'Enter' })
      await wrapper.get('.diff-view').trigger('keydown', { key: 'Escape' })
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('.commit-file-row.selected').element)
      expect(wrapper.emitted('back')).toBeUndefined()
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'k' })
      await flushPromises()
      expect(between).toHaveBeenCalledTimes(2)
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'Escape' })
      expect(wrapper.emitted('back')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps Enter focus on the diff while a patch loads', async () => {
    let finish!: (diff: FileDiff) => void
    between.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const wrapper = await mountView()
    try {
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'Enter' })
      expect(document.activeElement).toBe(wrapper.get('.commit-patch').element)
      finish(patch('src/a.ts'))
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('.diff-view').element)
    } finally {
      wrapper.unmount()
    }
  })

  it('opens a requested renamed file against the merge first parent and reads committed context', async () => {
    loadCommit.mockResolvedValue(
      commit({
        Parents: ['first-parent', 'second-parent'],
        Files: [
          new ChangedFile({
            Path: 'new [name].ts',
            OldPath: 'old name.ts',
            Status: FileStatus.FileRenamed,
          }),
        ],
      }),
    )
    const wrapper = await mountView({ focusHash: 'commit-a', focusFile: 'new [name].ts' })
    try {
      expect(between).toHaveBeenCalledExactlyOnceWith(
        'first-parent',
        'commit-a',
        'new [name].ts',
        'old name.ts',
      )
      expect(wrapper.get('.commit-comparison').text()).toContain('First parent')
      await wrapper.getComponent(DiffView).props('loadFileContent')!()
      expect(content).toHaveBeenCalledExactlyOnceWith('commit-a', 'new [name].ts')
    } finally {
      wrapper.unmount()
    }
  })

  it('handles initial commits, deleted files and binary files', async () => {
    loadCommit.mockResolvedValue(commit({ Parents: [] }))
    let wrapper = await mountView()
    try {
      expect(rootDiff).toHaveBeenCalledExactlyOnceWith('commit-a', 'src/a.ts')
      expect(between).not.toHaveBeenCalled()
      expect(wrapper.get('.commit-comparison').text()).toBe('Initial commit')
    } finally {
      wrapper.unmount()
    }
    clearSharedCommitDetails()
    loadCommit.mockResolvedValue(commit())
    between.mockResolvedValue(
      new FileDiff({ Path: 'src/a.ts', Deleted: true, Hunks: patch('src/a.ts').Hunks }),
    )
    wrapper = await mountView()
    try {
      expect(wrapper.getComponent(DiffView).props('loadFileContent')).toBeNull()
    } finally {
      wrapper.unmount()
    }
    between.mockResolvedValue(new FileDiff({ Path: 'src/a.ts', Binary: true }))
    wrapper = await mountView()
    try {
      expect(wrapper.text()).toContain('Binary file')
      expect(content).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })

  it('reuses graph commit details but clears patches when the commit changes', async () => {
    await createCommitDetailCache(loadCommit, 80, 60_000, () => '/repo').get('commit-a')
    const wrapper = await mountView({
      focusHash: 'commit-a',
      repositoryPath: '/repo',
      focusFile: 'src/b.ts',
    })
    try {
      expect(loadCommit).toHaveBeenCalledTimes(1)
      expect(between).toHaveBeenCalledExactlyOnceWith('parent-a', 'commit-a', 'src/b.ts', '')
      loadCommit.mockResolvedValue(commit({ Hash: 'commit-b', Parents: ['parent-b'] }))
      await wrapper.setProps({ focusHash: 'commit-b' })
      await flushPromises()
      expect(between).toHaveBeenLastCalledWith('parent-b', 'commit-b', 'src/b.ts', '')
    } finally {
      wrapper.unmount()
    }
  })

  it('cancels superseded patch requests and rejects their late results', async () => {
    let finish!: (diff: FileDiff) => void
    const cancel = vi.fn<() => void>()
    between.mockImplementationOnce(() =>
      Object.assign(
        new Promise<FileDiff | null>((resolve) => {
          finish = resolve
        }),
        { cancel },
      ),
    )
    const wrapper = await mountView()
    try {
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'j' })
      await flushPromises()
      expect(cancel).toHaveBeenCalledOnce()
      expect(wrapper.get('.diff-view').text()).toContain('new src/b.ts')
      finish(patch('src/a.ts'))
      await flushPromises()
      expect(wrapper.get('.diff-view').text()).toContain('new src/b.ts')
    } finally {
      wrapper.unmount()
    }
  })

  it('windows large commit file lists and reaches offscreen files by keyboard', async () => {
    loadCommit.mockResolvedValue(
      commit({
        Files: Array.from(
          { length: 3000 },
          (_, index) => new ChangedFile({ Path: `file-${String(index).padStart(4, '0')}.ts` }),
        ),
      }),
    )
    const wrapper = await mountView()
    try {
      expect(wrapper.findAll('.commit-file-row').length).toBeLessThan(100)
      await wrapper.get('.commit-file-row.selected').trigger('keydown', { key: 'G' })
      await flushPromises()
      expect(wrapper.get('.commit-file-row.selected').attributes('title')).toBe('file-2999.ts')
      expect(document.activeElement).toBe(wrapper.get('.commit-file-row.selected').element)
      expect(between).toHaveBeenLastCalledWith('parent-a', 'commit-a', 'file-2999.ts', '')
    } finally {
      wrapper.unmount()
    }
  })

  it('retries failures and renders empty commits without patch requests', async () => {
    loadCommit
      .mockRejectedValueOnce(new Error('missing commit'))
      .mockResolvedValue(commit({ Files: [] }))
    const wrapper = await mountView()
    try {
      expect(wrapper.text()).toContain('missing commit')
      await wrapper.get('.surface-state-action').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain('No changed files')
      expect(between).not.toHaveBeenCalled()
      expect(rootDiff).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
    }
  })

  it('loads the current HEAD each time rather than caching a moving ref', async () => {
    const first = await mountView({})
    first.unmount()
    loadCommit.mockResolvedValue(commit({ Hash: 'commit-b', Parents: ['parent-b'] }))
    const second = await mountView({})
    try {
      expect(loadCommit.mock.calls).toEqual([['HEAD'], ['HEAD']])
      expect(between).toHaveBeenLastCalledWith('parent-b', 'commit-b', 'src/a.ts', '')
    } finally {
      second.unmount()
    }
  })

  it('cancels pending details when leaving the view', async () => {
    let finish!: (detail: CommitDetail) => void
    const cancel = vi.fn<() => void>()
    loadCommit.mockImplementationOnce(() =>
      Object.assign(
        new Promise<CommitDetail>((resolve) => {
          finish = resolve
        }),
        { cancel },
      ),
    )
    const wrapper = await mountView()
    wrapper.unmount()
    expect(cancel).toHaveBeenCalledOnce()
    finish(commit())
    await flushPromises()
    expect(between).not.toHaveBeenCalled()
  })
})

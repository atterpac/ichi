import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BranchesView from '../components/refs/BranchesView.vue'
import { useShellSettings } from '../composables/useShellSettings'

const checkoutBranch = vi.fn<(name: string, create: boolean) => Promise<void>>(() => Promise.resolve())
const deleteBranch = vi.fn<(name: string, force: boolean) => Promise<void>>(() => Promise.resolve())
const fetchAll = vi.fn<() => Promise<void>>(() => Promise.resolve())
const logRef = vi.fn((ref: string, limit: number) =>
  Promise.resolve([
    { Hash: 'abc1234', Subject: 'tip subject', When: '2 hours ago' },
    { Hash: 'bbb2222', Subject: 'older commit', When: '3 days ago' },
  ]),
)
const diffFiles = vi.fn((a: string, b: string) =>
  Promise.resolve([
    { Path: 'src/components/diff/DiffView.vue', Added: 400, Deleted: 60 },
    { Path: 'src/theme/shell.css', Added: 120, Deleted: 40 },
  ]),
)

const branchDivergence = vi.fn((a: string, b: string) =>
  Promise.resolve({ Base: 'aaa1111', BaseMsg: 'base subject', AheadA: 2, AheadB: 5 }),
)

const branch = (over: Record<string, unknown>) => ({
  Name: '',
  IsRemote: false,
  IsCurrent: false,
  IsTracking: false,
  Upstream: '',
  Ahead: 0,
  Behind: 0,
  LastCommit: 'abc1234',
  LastMsg: 'a commit',
  ...over,
})

vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RefService: {
    ListBranches: () =>
      Promise.resolve([
        branch({ Name: 'main', IsCurrent: true, IsTracking: true, Upstream: 'origin/main', Ahead: 2 }),
        branch({ Name: 'feature/diff-view', Behind: 3 }),
        branch({ Name: 'feature/graph-styles' }),
        branch({ Name: 'origin/main', IsRemote: true }),
      ]),
    CheckoutBranch: (name: string, create: boolean) => checkoutBranch(name, create),
    DeleteBranch: (name: string, force: boolean) => deleteBranch(name, force),
    DeleteRemoteBranch: () => Promise.resolve(),
    CreateBranchAt: () => Promise.resolve(),
    RenameBranch: () => Promise.resolve(),
    MergeBranch: () => Promise.resolve(),
    RebaseBranch: () => Promise.resolve(),
    BranchDivergence: (a: string, b: string) => branchDivergence(a, b),
    LogRef: (ref: string, limit: number) => logRef(ref, limit),
    DiffFiles: (a: string, b: string) => diffFiles(a, b),
  },
  GraphService: {
    LoadBranchGraph: () => Promise.resolve({ Rows: [], LaneCount: 1 }),
    LoadGraph: () => Promise.resolve({ Commits: [
      { Hash: 'abc1234', ShortHash: 'abc1234', Message: 'tip', Parents: ['bbb2222'] },
      { Hash: 'bbb2222', ShortHash: 'bbb2222', Message: 'base', Parents: [] },
    ] }),
  },
  DiffService: {
    DiffBetween: () => Promise.resolve(''),
    ParseDiff: () => Promise.resolve([]),
  },
  RemoteService: {
    FetchAll: () => fetchAll(),
  },
}))

async function mountView() {
  const wrapper = mount(BranchesView, {
    attachTo: document.body,
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

describe('BranchesView', () => {
  beforeEach(() => {
    checkoutBranch.mockClear()
    deleteBranch.mockClear()
    fetchAll.mockClear()
    logRef.mockClear()
    diffFiles.mockClear()
  })

  afterEach(() => {
    useShellSettings().branchesGrouped = false
    useShellSettings().branchesDetailVisible = true
  })

  it('renders local and remote sections with sync chips', async () => {
    const wrapper = await mountView()
    const rows = wrapper.findAll('.branch-row')
    expect(rows).toHaveLength(4)
    expect(rows[0]!.text()).toContain('main')
    expect(rows[0]!.find('.branch-cur.on').exists()).toBe(true)
    expect(rows[0]!.find('.branch-chip.ahead').text()).toBe('↑2')
    expect(rows[1]!.find('.branch-chip.behind').text()).toBe('↓3')
    expect(wrapper.findAll('.branch-sect')[1]!.text()).toContain('Remote')
    wrapper.unmount()
  })

  it('filters branches and focuses the graph on the selected branch', async () => {
    const wrapper = await mountView()
    await wrapper.find('[aria-label="Filter branches"]').setValue('diff-view')
    await flushPromises()
    expect(wrapper.findAll('.branch-row')).toHaveLength(1)
    expect(wrapper.find('[aria-label="Selected branch graph"]').text()).toContain('feature/diff-view')
    expect(wrapper.find('.bd-name').text()).toContain('feature/diff-view')
    wrapper.unmount()
  })

  it('compares against the chosen baseline', async () => {
    const wrapper = await mountView()
    await wrapper.find('[aria-label="Compare against"]').setValue('feature/graph-styles')
    await flushPromises()
    expect(diffFiles).toHaveBeenCalledWith('feature/graph-styles', 'main')
    wrapper.unmount()
  })

  it('checks out the selected branch on enter', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'j' })
    await list.trigger('keydown', { key: 'Enter' })
    expect(checkoutBranch).toHaveBeenCalledWith('feature/diff-view', false)
    wrapper.unmount()
  })

  it('checks out remote branches by short name', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'G' })
    await list.trigger('keydown', { key: 'Enter' })
    expect(checkoutBranch).toHaveBeenCalledWith('main', false)
    wrapper.unmount()
  })

  it('asks for confirmation before deleting, then deletes', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'j' })
    await list.trigger('keydown', { key: 'd' })
    expect(wrapper.text()).toContain('Delete local branch feature/diff-view')
    expect(deleteBranch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('blocks deleting the checked-out branch', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'd' })
    expect(wrapper.text()).not.toContain('Delete local branch main')
    expect(deleteBranch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('fetches on f', async () => {
    const wrapper = await mountView()
    await wrapper.find('.branches-list').trigger('keydown', { key: 'f' })
    expect(fetchAll).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('focuses the filter field on / and returns to the list on Enter', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    const input = wrapper.find<HTMLInputElement>('input[aria-label="Filter branches"]')
    await list.trigger('keydown', { key: '/' })
    expect(document.activeElement).toBe(input.element)
    expect(wrapper.find('.vim-cmdline').exists()).toBe(false)
    await input.trigger('keydown', { key: 'Enter' })
    expect(document.activeElement).toBe(list.element)
    wrapper.unmount()
  })

  it('lets g bubble to the shell for graph nav while consuming list keys', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list').element

    const g = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
    list.dispatchEvent(g)
    expect(g.defaultPrevented).toBe(false)

    const j = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true })
    list.dispatchEvent(j)
    expect(j.defaultPrevented).toBe(true)
    wrapper.unmount()
  })

  it('groups shared prefixes on t and folds them with h', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')

    await list.trigger('keydown', { key: 't' })
    const groups = wrapper.findAll('.branch-group')
    expect(groups.map((g) => g.text())).toEqual(['feature/2', 'origin/1'])
    // children render short names, indented
    const children = wrapper.findAll('.branch-row.child')
    expect(children.map((c) => c.find('.branch-name').text())).toEqual(['diff-view', 'graph-styles', 'main'])

    // fold feature/ from one of its children: cursor 1 = group, 2 = first child
    await list.trigger('keydown', { key: 'j' })
    await list.trigger('keydown', { key: 'j' })
    await list.trigger('keydown', { key: 'h' })
    expect(wrapper.findAll('.branch-row.child')).toHaveLength(1)
    expect(wrapper.find('.branch-group .disclosure-icon').classes()).not.toContain('expanded')

    // singletons stay flat
    expect(wrapper.findAll('.branch-row:not(.child)')[0]!.text()).toContain('main')
    wrapper.unmount()
  })

  it('shows file details and upstream divergence without duplicate commit history', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const pane = wrapper.find('.branch-detail')
    expect(pane.exists()).toBe(true)
    expect(pane.find('.bd-name').text()).toContain('main')
    expect(pane.find('.bd-current').exists()).toBe(true)

    expect(pane.text()).toContain('Changed files')
    expect(pane.text()).not.toContain('Recent commits')
    expect(logRef).not.toHaveBeenCalled()
    expect(pane.find('.bd-churn').exists()).toBe(false)

    // main is ↑2 ↓0 and tracking, so the divergence bar renders ahead-only
    expect(pane.find('.bd-div').exists()).toBe(true)
    expect(pane.find('.bd-div .bd-subhead').text()).toContain('sync · origin/main')
    expect(pane.find('.bd-div-labels .ahead-label').text()).toContain('↑2 to push')
    expect(pane.find('.bd-div-track i.ahead').exists()).toBe(true)
    expect(pane.find('.bd-div-track i.behind').exists()).toBe(false)

    // current branch shows only the Graph button; a non-current one adds the verbs
    expect(pane.findAll('.ui-button').length).toBe(1)
    expect(pane.find('.ui-button').text()).toContain('Graph')
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'j' })
    await flushPromises()
    expect(wrapper.find('.bd-name').text()).toContain('feature/diff-view')
    expect(wrapper.findAll('.ui-button').length).toBeGreaterThan(0)
    // no upstream -> no sync bar
    expect(wrapper.find('.bd-div').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows changed files immediately for other branches', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    await list.trigger('keydown', { key: 'j' })
    await flushPromises()
    expect(branchDivergence).toHaveBeenCalledWith('main', 'feature/diff-view')
    expect(diffFiles).toHaveBeenCalledWith('main', 'feature/diff-view')

    // file change list vs current: rows with numeric deltas and a total
    const churn = wrapper.find('.bd-churn')
    expect(churn.exists()).toBe(true)
    expect(churn.find('.bd-subhead').text()).toContain('Diff · vs main')
    const fileRows = churn.findAll('.bd-churn-row')
    expect(fileRows).toHaveLength(2)
    expect(fileRows[0]!.text()).toContain('DiffView.vue')
    expect(fileRows[0]!.find('.bd-churn-delta .add').text()).toBe('+400')
    expect(fileRows[0]!.find('.bd-churn-delta .del').text()).toBe('−60')
    expect(churn.find('.bd-churn-total').text()).toBe('2 files · +520 −100')
    wrapper.unmount()
  })

  it('hides the detail pane on i and persists the choice', async () => {
    const wrapper = await mountView()
    const list = wrapper.find('.branches-list')
    expect(wrapper.find('.branch-detail').exists()).toBe(true)
    await list.trigger('keydown', { key: 'i' })
    expect(wrapper.find('.branch-detail').exists()).toBe(false)
    expect(useShellSettings().branchesDetailVisible).toBe(false)
    await list.trigger('keydown', { key: 'i' })
    expect(wrapper.find('.branch-detail').exists()).toBe(true)
    wrapper.unmount()
  })
})

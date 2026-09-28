import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import {
  ConflictDocument,
  ConflictVersion,
  ConflictWorkspace,
  ConflictEntry,
} from '../bindings/github.com/atterpac/ichi/desktop/services/models'
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  resolve: vi.fn(),
  control: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  ConflictService: {
    LoadConflict: mocks.load,
    ResolveConflict: mocks.resolve,
    ControlConflict: mocks.control,
  },
}))
const repo = reactive({ info: { Path: '/repo' }, switching: false, revision: 0 })
vi.mock('../composables/useRepoStatus', () => ({ useRepoStatus: () => repo }))
const state = reactive({ data: null as ConflictWorkspace | null, error: '', loading: false })
vi.mock('../composables/useConflictWorkspace', () => ({
  useConflictWorkspace: () => ({ state, refresh: mocks.refresh }),
}))
import ConflictsView from '../components/conflicts/ConflictsView.vue'
const content =
  'auto-merged context\n<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> topic\nafter\n'
function doc() {
  return new ConflictDocument({
    RepoPath: '/repo',
    Path: 'file.txt',
    Token: 'snapshot',
    MarkerSize: 7,
    Exists: true,
    Editable: true,
    Result: content,
    Base: new ConflictVersion({ Exists: true, Editable: true, Content: 'base\n' }),
    Current: new ConflictVersion({ Exists: true, Editable: true, Content: 'whole current\n' }),
    Incoming: new ConflictVersion({ Exists: true, Editable: true, Content: 'whole incoming\n' }),
  })
}
let wrapper: VueWrapper
async function setup(props = {}) {
  wrapper = mount(ConflictsView, { props, attachTo: document.body })
  await flushPromises()
}
async function click(text: string) {
  const button = wrapper.findAll('button').find((b) => b.text().includes(text))
  expect(button).toBeDefined()
  await button!.trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  state.data = new ConflictWorkspace({
    RepoPath: '/repo',
    Token: 'operation',
    Kind: 'rebase',
    Branch: 'topic',
    CurrentLabel: 'Rebased version (HEAD)',
    IncomingLabel: 'Commit being replayed',
    Commit: '1234567890abcdef',
    Files: [new ConflictEntry({ Path: 'file.txt', Kind: 'Both modified' })],
    Staged: [],
    Steps: [],
    Step: 1,
    Total: 2,
  })
  mocks.load.mockResolvedValue(doc())
  mocks.refresh.mockResolvedValue(undefined)
  mocks.resolve.mockImplementation(async () => {
    state.data!.Files = []
    state.data!.Staged = ['file.txt']
  })
  mocks.control.mockResolvedValue(undefined)
})
afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
})
describe('Real conflict view', () => {
  it('resolves a region without dropping surrounding work, stages it, then continues', async () => {
    await setup()
    expect(wrapper.get('textarea').element).toBeDefined()
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text().includes('Save and stage'))!
        .attributes('disabled'),
    ).toBeDefined()
    await wrapper.findAll('.native-version')[1]!.get('button').trigger('click')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'auto-merged context\nincoming\nafter\n',
    )
    await click('Save and stage')
    expect(mocks.resolve).toHaveBeenCalledWith(
      '/repo',
      'file.txt',
      'snapshot',
      'edit',
      'auto-merged context\nincoming\nafter\n',
    )
    await click('Continue rebase')
    expect(mocks.control).toHaveBeenCalledWith('/repo', 'operation', 'continue')
  })
  it('keeps drafts on stale-file failures and protects navigation', async () => {
    await setup()
    await wrapper.get('textarea').setValue('my draft')
    mocks.resolve.mockRejectedValueOnce(new Error('File changed externally; reload before saving'))
    await click('Save and stage')
    expect(wrapper.get('[role="alert"]').text()).toContain('changed externally')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('my draft')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect((wrapper.vm as unknown as { canLeave(): boolean }).canLeave()).toBe(false)
    await click('Reload file')
    expect(mocks.load).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalled()
  })
  it('uses explicit whole-file choices for binary data', async () => {
    const binary = doc()
    binary.Editable = false
    binary.Result = ''
    binary.Current.Editable = false
    binary.Incoming.Editable = false
    mocks.load.mockResolvedValue(binary)
    await setup()
    expect(wrapper.find('textarea').exists()).toBe(false)
    await wrapper.findAll('.native-version')[1]!.get('button').trigger('click')
    await click('Save and stage')
    expect(mocks.resolve).toHaveBeenCalledWith(
      '/repo',
      'file.txt',
      'snapshot',
      'incoming',
      'whole incoming\n',
    )
  })
  it('opens the requested file and preserves separate drafts when switching files', async () => {
    state.data!.Files.push(new ConflictEntry({ Path: 'other.txt', Kind: 'Both modified' }))
    mocks.load.mockImplementation(
      async (_root, path) => new ConflictDocument({ ...doc(), Path: path }),
    )
    await setup({ focusFile: 'other.txt' })
    expect(wrapper.get('.diff-file-path').text()).toBe('other.txt')
    await wrapper.get('textarea').setValue('other draft')
    await wrapper.findAll('.native-file-row')[0]!.trigger('click')
    await flushPromises()
    await wrapper.get('textarea').setValue('first draft')
    await wrapper.findAll('.native-file-row')[1]!.trigger('click')
    await flushPromises()
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('other draft')
  })
})

describe('Conflict demo', () => {
  it('resolves and reviews sample files, completes and restarts without Git calls', async () => {
    await setup({ demo: true })
    expect(wrapper.text()).toContain('Conflict demo')
    expect(wrapper.findAll('.native-file-row')).toHaveLength(2)
    for (let i = 0; i < 2; i++) {
      await wrapper.findAll('.native-version')[1]!.get('button').trigger('click')
      await click('Save and stage')
    }
    await click('Review')
    expect(wrapper.get('.demo-staged-review').text()).toContain('accent: "blue"')
    expect(wrapper.get('.demo-staged-review').text()).toContain('A thoughtful home')
    await click('Continue rebase')
    expect(wrapper.text()).toContain('Git operation complete.')
    await click('Restart demo')
    expect(wrapper.findAll('.native-file-row')).toHaveLength(2)
    expect(wrapper.get('textarea').element.value).toContain('<<<<<<< HEAD')
    expect(mocks.load).not.toHaveBeenCalled()
    expect(mocks.resolve).not.toHaveBeenCalled()
    expect(mocks.control).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})

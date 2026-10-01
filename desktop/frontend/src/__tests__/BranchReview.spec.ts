import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BranchReview from '../components/review/BranchReview.vue'
import { Branch, FileDiff, DiffHunk } from '../bindings/github.com/atterpac/ichi/internal/git'
import {
  ReviewSnapshot,
  ReviewWalkthrough,
} from '../bindings/github.com/atterpac/ichi/desktop/services/models'
import { usePreferenceBindings } from '../customization/usePreferences'

const api = vi.hoisted(() => ({
  compare: vi.fn<(base: string, head: string) => Promise<ReviewSnapshot | null>>(),
  generate:
    vi.fn<
      (
        id: string,
        options: { Backend: string; Model: string; Focus: string },
      ) => Promise<ReviewWalkthrough | null>
    >(),
  outdated: vi.fn<(id: string) => Promise<boolean>>(),
  reveal: vi.fn<(index: number, focus: boolean) => Promise<void>>(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services/reviewservice', () => ({
  Compare: api.compare,
  Generate: api.generate,
  IsOutdated: api.outdated,
}))
const snapshot = () =>
  new ReviewSnapshot({
    ID: 'snapshot',
    BaseBranch: 'main',
    HeadBranch: 'feature',
    BaseCommit: 'base123456',
    HeadCommit: 'head123456',
    MergeBase: 'merge123456',
    Files: [
      new FileDiff({ Path: 'auth.go', Hunks: [new DiffHunk(), new DiffHunk()] }),
      new FileDiff({ Path: 'test.go', Hunks: [new DiffHunk()] }),
    ],
    FileDetails: ['', ''],
    References: [
      { ID: 'one', FileIndex: 0, HunkIndex: 0, Label: 'auth.go first hunk' },
      { ID: 'two', FileIndex: 0, HunkIndex: 1, Label: 'auth.go second hunk' },
      { ID: 'three', FileIndex: 1, HunkIndex: 0, Label: 'test.go first hunk' },
    ],
  })
const tour = () =>
  new ReviewWalkthrough({
    snapshotId: 'snapshot',
    summary: 'Refresh tokens safely.',
    steps: [
      {
        title: 'Refresh tokens',
        explanation: 'An expired token triggers a refresh.',
        diffRefs: ['two', 'three'],
      },
      {
        title: 'Test refresh',
        explanation: 'A test covers the new behavior.',
        diffRefs: ['three'],
      },
    ],
  })
let wrapper: VueWrapper
async function openReview() {
  wrapper = mount(BranchReview, {
    props: {
      branches: [new Branch({ Name: 'main' }), new Branch({ Name: 'feature' })],
      defaultBase: 'main',
      defaultHead: 'feature',
      repositoryPath: '/repo',
    },
    attachTo: document.body,
    global: {
      stubs: {
        Teleport: true,
        DiffView: defineComponent({
          props: ['diff', 'readOnly'],
          setup(_, { expose }) {
            expose({ revealHunk: api.reveal })
          },
          template: '<div class="diff-stub">{{ diff.Path }}</div>',
        }),
      },
    },
  })
  await flushPromises()
  return wrapper
}
async function click(text: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === text)!
    .trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  api.compare.mockResolvedValue(snapshot())
  api.generate.mockResolvedValue(tour())
  api.outdated.mockResolvedValue(false)
  usePreferenceBindings()['review.backend'] = 'codex'
  usePreferenceBindings()['review.codexModel'] = ''
})
afterEach(() => {
  wrapper?.unmount()
})

describe('BranchReview', () => {
  it('explains an empty comparison and lets the user reverse it', async () => {
    api.compare.mockResolvedValueOnce(
      new ReviewSnapshot({ ...snapshot(), Files: [], References: [] }),
    )
    await openReview()
    await click('Load comparison')
    expect(wrapper.get('#review-generation-reason').text()).toContain('Try swapping base and head')
    await click('Swap branches')
    await click('Load comparison')
    expect(api.compare).toHaveBeenLastCalledWith('feature', 'main')
    expect(wrapper.get('#review-generation-reason').text()).toBe('Ready to generate a tour.')
    await click('Generate tour')
    expect(api.generate).toHaveBeenCalledOnce()
  })

  it('explains when Ollama needs a model instead of silently disabling generation', async () => {
    usePreferenceBindings()['review.backend'] = 'ollama'
    usePreferenceBindings()['review.ollamaModel'] = ''
    await openReview()
    await click('Load comparison')
    expect(wrapper.get('#review-generation-reason').text()).toContain(
      'Enter an installed Ollama model',
    )
  })

  it('loads the chosen branches before generating and navigates exact cross-file hunks', async () => {
    await openReview()
    expect(api.generate).not.toHaveBeenCalled()
    await click('Load comparison')
    expect(api.compare).toHaveBeenCalledWith('main', 'feature')
    expect(wrapper.text()).toContain('auth.go')
    await click('Generate tour')
    expect(api.generate).toHaveBeenCalledWith('snapshot', {
      Backend: 'codex',
      Model: '',
      Focus: '',
      RunID: expect.any(String),
    })
    expect(api.reveal).toHaveBeenLastCalledWith(1, false)
    expect(wrapper.get('.review-explanation').text()).toContain('An expired token')
    expect(wrapper.text()).toContain('2 / 3 change sections linked')
    expect(wrapper.text()).toContain('0 / 2 steps reviewed')
    await wrapper.get('.review-target select').setValue('three')
    await flushPromises()
    expect(wrapper.get('.diff-stub').text()).toBe('test.go')
    expect(api.reveal).toHaveBeenLastCalledWith(0, false)
    await click('Mark reviewed')
    expect(wrapper.text()).toContain('1 / 2 steps reviewed')
    await click('All changes (3)')
    await wrapper.get('.review-uncovered input').setValue(true)
    expect(wrapper.findAll('.review-target option')).toHaveLength(1)
    expect(wrapper.get('.review-target option').attributes('value')).toBe('one')
  })

  it('cancels generation and ignores a late successful response', async () => {
    let resolve!: (value: ReviewWalkthrough) => void
    const cancel = vi.fn<() => void>()
    api.generate.mockReturnValue(
      Object.assign(
        new Promise<ReviewWalkthrough>((done) => {
          resolve = done
        }),
        { cancel },
      ),
    )
    await openReview()
    await click('Load comparison')
    await click('Generate tour')
    await click('Cancel')
    expect(cancel).toHaveBeenCalledOnce()
    resolve(tour())
    await flushPromises()
    expect(wrapper.find('.review-summary').exists()).toBe(false)
    expect(wrapper.text()).toContain('Cancelled')
    expect(wrapper.find('.diff-stub').exists()).toBe(true)
  })

  it('retains real diffs on model failure and reports outdated snapshots', async () => {
    api.generate.mockRejectedValueOnce(new Error('invalid diff reference'))
    api.outdated.mockResolvedValue(true)
    await openReview()
    await click('Load comparison')
    await click('Generate tour')
    expect(wrapper.get('[role="alert"]').text()).toContain('invalid diff reference')
    expect(wrapper.find('.diff-stub').exists()).toBe(true)
    await click('Generate tour')
    expect(wrapper.text()).toContain('Branches have changed')
    expect(wrapper.text()).toContain('Head head1234')
  })

  it('keeps batched comparisons generatable and resets when branch selection changes', async () => {
    api.compare.mockResolvedValue(
      new ReviewSnapshot({
        ...snapshot(),
        GenerationNote: 'This comparison will be analyzed in 3 parts.',
        AnalysisBatches: 3,
      }),
    )
    await openReview()
    await click('Load comparison')
    expect(
      wrapper
        .findAll('button')
        .find((button) => button.text() === 'Generate tour')!
        .attributes('disabled'),
    ).toBeUndefined()
    expect(wrapper.text()).toContain('Ready to analyze 3 parts')
    expect(wrapper.find('.diff-stub').exists()).toBe(true)
    await wrapper.findAll('select')[0]!.setValue('feature')
    expect(wrapper.find('.diff-stub').exists()).toBe(false)
    expect(wrapper.text()).toContain('Choose two branches')
  })

  it('cancels an outstanding comparison on close', async () => {
    const cancel = vi.fn<() => void>()
    api.compare.mockReturnValue(Object.assign(new Promise<ReviewSnapshot>(() => {}), { cancel }))
    await openReview()
    await click('Load comparison')
    wrapper.unmount()
    expect(cancel).toHaveBeenCalledOnce()
  })
})

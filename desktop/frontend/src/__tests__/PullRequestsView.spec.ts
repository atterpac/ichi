import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import PullRequestsView from '../components/pr/PullRequestsView.vue'
import {
  PRState,
  PullRequest,
  User,
  Discussion,
  DiscussionComment,
  DiscussionReview,
  ReviewThread,
  Check,
  CheckStatus,
  CheckConclusion,
  type ListPRsOpts,
} from '../bindings/github.com/atterpac/ichi/internal/remote'
import { PRProviderStatus } from '../bindings/github.com/atterpac/ichi/desktop/services/models'
import { FileDiff } from '../bindings/github.com/atterpac/ichi/internal/git'
const api = vi.hoisted(() => ({
  remotes: vi.fn<() => Promise<string[]>>(),
  status: vi.fn<(remote: string) => Promise<PRProviderStatus>>(),
  list: vi.fn<(remote: string, opts: ListPRsOpts) => Promise<PullRequest[]>>(),
  detail: vi.fn<(remote: string, id: number) => Promise<PullRequest>>(),
  discussion: vi.fn<(remote: string, id: number) => Promise<Discussion>>(),
  checks: vi.fn<(remote: string, id: number) => Promise<Check[]>>(),
  patches: vi.fn<(remote: string, id: number) => Promise<FileDiff[]>>(),
  open: vi.fn<(url: string) => Promise<void>>(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: { ListRemotes: api.remotes },
  PRService: {
    ProviderStatus: api.status,
    ListPRs: api.list,
    GetPR: api.detail,
    GetDiscussion: api.discussion,
    GetChecks: api.checks,
    GetPRPatches: api.patches,
  },
}))
vi.mock('@wailsio/runtime', async (original) => ({
  ...(await original<typeof import('@wailsio/runtime')>()),
  Browser: { OpenURL: api.open },
}))
const first = new PullRequest({
  Number: 7,
  Title: 'Improve review flow',
  HeadBranch: 'feature/review',
  HeadSHA: 'test-head',
  BaseBranch: 'main',
  Author: new User({ Login: 'alice' }),
  State: PRState.PROpen,
  URL: 'https://github.com/owner/repo/pull/7',
})
const second = new PullRequest({ ...first, Number: 8, Title: 'Another PR' })
let wrapper: VueWrapper
async function start() {
  wrapper = mount(PullRequestsView, {
    global: {
      stubs: {
        DiffView: { props: ['diff'], template: '<div class="mock-diff">{{ diff.Path }}</div>' },
      },
    },
  })
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  api.remotes.mockResolvedValue(['origin', 'upstream'])
  api.status.mockResolvedValue(
    new PRProviderStatus({ Ready: true, Login: 'alice', Repo: 'owner/repo' }),
  )
  api.list.mockResolvedValue([first, second])
  api.detail.mockImplementation((_remote, id) => Promise.resolve(id === 7 ? first : second))
  api.discussion.mockResolvedValue(
    new Discussion({
      Comments: [
        new DiscussionComment({
          ID: 'c',
          Author: 'bob',
          Body: 'General conversation',
          CreatedAt: '2026-01-01T12:00:00Z',
        }),
      ],
      Reviews: [
        new DiscussionReview({
          ID: 'r',
          Author: 'carol',
          State: 'CHANGES_REQUESTED',
          Body: 'Please fix this',
          CreatedAt: '2026-01-02T12:00:00Z',
        }),
      ],
      Threads: [
        new ReviewThread({
          ID: 't',
          Path: 'src/main.go',
          Line: 3,
          Comments: [
            new DiscussionComment({ ID: 'root', Author: 'bob', Body: 'Root comment' }),
            new DiscussionComment({ ID: 'reply', Author: 'alice', Body: 'Thread reply' }),
          ],
        }),
        new ReviewThread({
          ID: 'old',
          Path: 'old.go',
          Resolved: true,
          Outdated: true,
          Comments: [],
        }),
      ],
    }),
  )
  api.checks.mockResolvedValue([])
  api.patches.mockResolvedValue([new FileDiff({ Path: 'src/main.go' })])
})
afterEach(() => {
  wrapper?.unmount()
})
it('shows the CLI identity and complete discussion with separate review decisions and thread replies', async () => {
  await start()
  expect(wrapper.text()).toContain('owner/repo')
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text().startsWith('Conversation'))!
    .trigger('click')
  for (const text of [
    'General conversation',
    'Requested changes',
    'Please fix this',
    'Root comment',
    'Thread reply',
    'Resolved',
    'Outdated',
  ])
    expect(wrapper.text()).toContain(text)
  expect(api.patches).toHaveBeenCalledExactlyOnceWith('origin', 7, 'test-head')
  await wrapper.get('[aria-label="Filter review threads"]').setValue('unresolved')
  expect(wrapper.findAll('.review-thread')).toHaveLength(1)
})
it('opens the selected thread file and keeps the thread alongside its diff', async () => {
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  await wrapper.get('.thread-context button').trigger('click')
  await flushPromises()
  expect(api.patches).toHaveBeenCalledExactlyOnceWith('origin', 7, 'test-head')
  expect(wrapper.get('.mock-diff').text()).toBe('src/main.go')
  expect(wrapper.get('.pr-inspector').text()).toContain('Thread reply')
})
it('does not fetch PRs when authentication needs attention', async () => {
  api.status.mockResolvedValue(new PRProviderStatus({ Ready: false, Message: 'Please sign in' }))
  await start()
  expect(wrapper.text()).toContain('gh auth login --hostname github.com')
  expect(api.list).not.toHaveBeenCalled()
})
it('keeps discussion visible when checks fail and offers retry on discussion failure', async () => {
  api.checks.mockRejectedValue(new Error('Checks unavailable'))
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text().startsWith('Conversation'))!
    .trigger('click')
  expect(wrapper.text()).toContain('Checks unavailable')
  expect(wrapper.text()).toContain('General conversation')
  api.discussion.mockRejectedValue(new Error('Rate limited'))
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Refresh')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Could not load discussion')
  expect(wrapper.text()).toContain('Rate limited')
})
it('ignores a delayed response after another PR is selected', async () => {
  let resolve!: (value: Discussion) => void
  api.discussion.mockImplementationOnce(
    () =>
      new Promise<Discussion>((r) => {
        resolve = r
      }),
  )
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Pull requests')!
    .trigger('click')
  await wrapper.findAll('.pr-row')[1]!.trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  resolve(
    new Discussion({ Comments: [new DiscussionComment({ ID: 'stale', Body: 'STALE CONTENT' })] }),
  )
  await flushPromises()
  expect(wrapper.text()).toContain('Another PR')
  expect(wrapper.text()).not.toContain('STALE CONTENT')
})
it('clears selection on remote change and passes the All state explicitly', async () => {
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  await wrapper.get('[aria-label="GitHub remote"]').setValue('upstream')
  await flushPromises()
  expect(wrapper.find('.pr-conversation').exists()).toBe(false)
  await wrapper.get('[aria-label="Pull request state"]').setValue('all')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith('upstream', {
    State: 'all',
    Author: '',
    Search: 'sort:updated-desc',
    Limit: 50,
  })
})

it('opens the files first and summarizes collapsed CI below the file list without calling failures a pass', async () => {
  api.checks.mockResolvedValue([
    new Check({
      Name: 'Tests',
      Status: CheckStatus.CheckCompleted,
      Conclusion: CheckConclusion.CheckSuccess,
    }),
    new Check({
      Name: 'Build',
      Status: CheckStatus.CheckCompleted,
      Conclusion: CheckConclusion.CheckFailure,
    }),
    new Check({ Name: 'Lint', Status: CheckStatus.CheckInProgress }),
  ])
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  expect(wrapper.get('.mock-diff').text()).toBe('src/main.go')
  const sections = wrapper.findAll('.pr-inspector-scroll > section')
  expect(sections[0]!.text()).toContain('Changed files')
  expect(sections[1]!.classes()).toContain('pr-ci')
  expect(wrapper.get('.pr-ci details').attributes('open')).toBeUndefined()
  expect(wrapper.get('.ci-summary').text()).toContain('67% complete')
  expect(wrapper.get('.ci-summary').text()).toContain('1 passed · 1 failed · 1 pending')
  expect(wrapper.get('progress').attributes('value')).toBe('2')
  expect(wrapper.get('progress').attributes('max')).toBe('3')
})

it('shows no percentage when no CI checks are reported', async () => {
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  expect(wrapper.get('.ci-summary').text()).toContain('No checks reported')
  expect(wrapper.find('progress').exists()).toBe(false)
})

it('keeps cancelled and skipped checks distinct from passing checks', async () => {
  api.checks.mockResolvedValue([
    new Check({
      Name: 'Skipped',
      Status: CheckStatus.CheckCompleted,
      Conclusion: CheckConclusion.CheckSkipped,
    }),
    new Check({
      Name: 'Cancelled',
      Status: CheckStatus.CheckCompleted,
      Conclusion: CheckConclusion.CheckCancelled,
    }),
  ])
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  expect(wrapper.get('.ci-summary').text()).toContain('100% complete')
  expect(wrapper.get('.ci-summary').text()).toContain('1 skipped · 1 cancelled')
  expect(wrapper.get('.ci-summary').text()).not.toContain('passed')
})
it('searches GitHub by author and label and clears filters', async () => {
  api.list.mockResolvedValue([new PullRequest({ ...first, Labels: ['bug'] }), second])
  await start()
  await wrapper.get('.filter-toggle').trigger('click')
  await wrapper.findAll('.filter-popover input')[0]!.setValue('alice')
  await wrapper.findAll('.filter-popover input')[1]!.setValue('bug')
  await wrapper.get('.filter-popover').trigger('submit')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    expect.objectContaining({ Search: 'author:alice label:"bug" sort:updated-desc' }),
  )
  await wrapper.get('.filter-toggle').trigger('click')
  await wrapper.get('.filter-popover button[type="button"]').trigger('click')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    expect.objectContaining({ Search: 'sort:updated-desc' }),
  )
})
it('switches PRs through the compact list and exposes review status and file thread counts', async () => {
  await start()
  await wrapper.get('.pr-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  expect(wrapper.get('.review-summary').text()).toContain('Changes requested')
  expect(wrapper.get('.file-thread-count').attributes('aria-label')).toContain(
    '1 unresolved threads in src/main.go',
  )
  await wrapper.get('[aria-label="Toggle item list"]').trigger('click')
  await wrapper.findAll('.rail-rows button')[1]!.trigger('click')
  await flushPromises()
  expect(api.detail).toHaveBeenLastCalledWith('origin', 8)
  expect(wrapper.get('.pr-heading').text()).toContain('Another PR')
})
it('previews rows, navigates with arrows, opens with Enter and restores selection on Escape', async () => {
  await start()
  await wrapper.get('.pr-row').trigger('click')
  expect(api.detail).not.toHaveBeenCalled()
  await wrapper.get('.pr-row').trigger('keydown', { key: 'ArrowDown' })
  expect(wrapper.get('.inbox-preview h2').text()).toBe('Another PR')
  const rows = wrapper.get('.inbox-rows').element as HTMLElement
  rows.scrollTop = 180
  await wrapper.get('.inbox-rows').trigger('scroll')
  await wrapper.get('.inbox-row[aria-pressed="true"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(api.detail).toHaveBeenLastCalledWith('origin', 8)
  await wrapper.get('.pr-main').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(wrapper.get('.inbox-row[aria-pressed="true"]').attributes('data-number')).toBe('8')
  expect((wrapper.get('.inbox-rows').element as HTMLElement).scrollTop).toBe(180)
})
it('searches and sorts all repository PRs with the signed-in identity', async () => {
  await start()
  await wrapper.get('[aria-label="Inbox scope"]').setValue('attention')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    expect.objectContaining({ Search: 'review-requested:alice sort:updated-desc' }),
  )
  await wrapper.get('[aria-label="Sort results"]').setValue('created-desc')
  await flushPromises()
  await wrapper.get('input[aria-label="Filter pull requests"]').setValue('fix label:bug')
  await wrapper.get('.pr-filters').trigger('submit')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    expect.objectContaining({ Search: 'fix label:bug review-requested:alice sort:created-desc' }),
  )
})

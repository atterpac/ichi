import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import IssuesView from '../components/issues/IssuesView.vue'
import { Issue, DiscussionComment } from '../bindings/github.com/atterpac/ichi/internal/remote'
import { PRProviderStatus } from '../bindings/github.com/atterpac/ichi/desktop/services/models'
const api = vi.hoisted(() => ({
  remotes: vi.fn(),
  status: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  open: vi.fn(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: { ListRemotes: api.remotes },
  IssueService: { ProviderStatus: api.status, List: api.list, Get: api.get },
}))
vi.mock('@wailsio/runtime', async (original) => ({
  ...(await original<typeof import('@wailsio/runtime')>()),
  Browser: { OpenURL: api.open },
}))
const first = new Issue({
  Number: 12,
  Title: 'Fix layout',
  State: 'open',
  Author: 'alice',
  Body: '**Description**',
  CreatedAt: '2026-10-01T00:00:00Z',
  UpdatedAt: '2026-10-02T00:00:00Z',
  URL: 'https://github.com/owner/repo/issues/12',
  Labels: ['bug'],
  Assignees: ['bob'],
  Milestone: 'v1',
})
let wrapper: VueWrapper
async function start() {
  wrapper = mount(IssuesView)
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  api.remotes.mockResolvedValue(['origin', 'upstream'])
  api.status.mockResolvedValue(
    new PRProviderStatus({ Ready: true, Provider: 'github', Repo: 'owner/repo', Login: 'alice' }),
  )
  api.list.mockResolvedValue([first])
  api.get.mockResolvedValue(
    new Issue({
      ...first,
      Comments: [
        new DiscussionComment({
          ID: 'c1',
          Author: 'bob',
          Body: '## Reply\n```ts\nconst n = 1\n```',
          CreatedAt: first.CreatedAt,
          URL: first.URL + '#issuecomment-1',
        }),
      ],
    }),
  )
})
afterEach(() => wrapper?.unmount())
it('loads issues and renders rich conversation with metadata on the right', async () => {
  await start()
  expect(api.list).toHaveBeenCalledWith('origin', 'open', 'sort:updated-desc', 50)
  await wrapper.get('.issue-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  expect(wrapper.get('.markdown-body strong').text()).toBe('Description')
  expect(wrapper.find('.conversation pre code').text()).toContain('const n = 1')
  expect(wrapper.get('aside').text()).toContain('bob')
  expect(wrapper.get('aside').text()).toContain('v1')
  expect(wrapper.get('.conversation').text()).toContain('Reply')
})
it('searches all repository issues on submit and changes state on selection', async () => {
  await start()
  await wrapper.get('input').setValue('label:bug author:bob')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    'open',
    'label:bug author:bob sort:updated-desc',
    50,
  )
  await wrapper.get('[aria-label="Issue state"]').setValue('closed')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    'closed',
    'label:bug author:bob sort:updated-desc',
    50,
  )
})
it('does not expose stale conversation when switching remotes', async () => {
  let resolve!: (value: Issue) => void
  api.get.mockImplementation(
    () =>
      new Promise<Issue>((r) => {
        resolve = r
      }),
  )
  await start()
  await wrapper.get('.issue-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await wrapper.get('select[aria-label="GitHub remote"]').setValue('upstream')
  await flushPromises()
  resolve(new Issue({ ...first, Title: 'Stale detail' }))
  await flushPromises()
  expect(wrapper.find('.issue-detail').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Stale detail')
  expect(api.list).toHaveBeenLastCalledWith('upstream', 'open', 'sort:updated-desc', 50)
})
it('provides auth guidance and avoids listing when disconnected', async () => {
  api.status.mockResolvedValue(
    new PRProviderStatus({ Ready: false, Provider: 'github', Message: 'Not signed in' }),
  )
  await start()
  expect(wrapper.text()).toContain('gh auth login --hostname github.com')
  expect(api.list).not.toHaveBeenCalled()
})
it('shows failures rather than an empty conversation and retries', async () => {
  api.get.mockRejectedValueOnce(new Error('Rate limited'))
  await start()
  await wrapper.get('.issue-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Rate limited')
  expect(wrapper.text()).not.toContain('No comments yet')
  const retry = wrapper.findAll('button').find((b) => b.text() === 'Retry')!
  await retry.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Reply')
})
it('handles repositories without remotes', async () => {
  api.remotes.mockResolvedValue([])
  await start()
  expect(wrapper.text()).toContain('No remote configured')
  expect(api.status).not.toHaveBeenCalled()
})
it('ignores an older list response after a newer state request', async () => {
  let resolve!: (value: Issue[]) => void
  api.list
    .mockImplementationOnce(
      () =>
        new Promise<Issue[]>((r) => {
          resolve = r
        }),
    )
    .mockResolvedValue([])
  await start()
  await wrapper.get('[aria-label="Issue state"]').setValue('closed')
  await flushPromises()
  resolve([first])
  await flushPromises()
  expect(wrapper.text()).toContain('No matching issues')
  expect(wrapper.find('.issue-row').exists()).toBe(false)
})
it('keeps the loaded list available while switching issues and preserves the search on return', async () => {
  const second = new Issue({ ...first, Number: 13, Title: 'Second issue' })
  api.list.mockResolvedValue([first, second])
  api.get.mockImplementation((_remote: string, number: number) =>
    Promise.resolve(number === 13 ? second : first),
  )
  await start()
  await wrapper.get('input[aria-label="Search issues"]').setValue('layout')
  await wrapper.get('.issue-row').trigger('click')
  await wrapper.get('.inbox-open').trigger('click')
  await flushPromises()
  await wrapper.get('[aria-label="Toggle item list"]').trigger('click')
  await wrapper.findAll('.rail-rows button')[1]!.trigger('click')
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('Second issue')
  expect(wrapper.get('.rail-rows button[aria-current]').text()).toContain('Second issue')
  await wrapper.get('.remote-toolbar .back').trigger('click')
  await flushPromises()
  expect((wrapper.get('input[aria-label="Search issues"]').element as HTMLInputElement).value).toBe(
    'layout',
  )
})
it('applies author, assignee and multiword label filters to the GitHub search', async () => {
  await start()
  await wrapper.get('.filter-toggle').trigger('click')
  const fields = wrapper.findAll('.filter-popover input')
  await fields[0]!.setValue('alice')
  await fields[1]!.setValue('bob')
  await fields[2]!.setValue('help wanted')
  await wrapper.get('.filter-popover').trigger('submit')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    'open',
    'sort:updated-desc author:alice label:"help wanted" assignee:bob',
    50,
  )
  expect(wrapper.get('.filter-toggle').text()).toContain('3')
})
it('previews without fetching detail and sends scopes and sorting to GitHub', async () => {
  await start()
  await wrapper.get('.issue-row').trigger('click')
  expect(api.get).not.toHaveBeenCalled()
  expect(wrapper.get('[aria-label="Selection preview"]').text()).toContain('Fix layout')
  await wrapper.get('[aria-label="Inbox scope"]').setValue('attention')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith(
    'origin',
    'open',
    'assignee:alice sort:updated-desc',
    50,
  )
  await wrapper.get('[aria-label="Sort results"]').setValue('created-asc')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith('origin', 'open', 'assignee:alice sort:created-asc', 50)
  await wrapper.get('[aria-label="Inbox scope"]').setValue('mine')
  await flushPromises()
  expect(api.list).toHaveBeenLastCalledWith('origin', 'open', 'author:alice sort:created-asc', 50)
})

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ContributorProfile from '../components/people/ContributorProfile.vue'
import { githubLogin, profile, cachedContributions } from '../components/people/profile'
const api = vi.hoisted(() => ({
  local: vi.fn(),
  commits: vi.fn(),
  prs: vi.fn(),
  status: vi.fn(),
  detail: vi.fn(),
  remotes: vi.fn(),
  open: vi.fn(),
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  GraphService: { AuthorHistory: api.local, LoadCommit: api.detail },
  RepoService: { ListRemotes: api.remotes },
  PRService: { ContributorCommits: api.commits, ListPRs: api.prs, ProviderStatus: api.status },
}))
vi.mock('@wailsio/runtime', async (original) => ({
  ...(await original<typeof import('@wailsio/runtime')>()),
  Browser: { OpenURL: api.open },
}))
let wrapper: VueWrapper | undefined
beforeEach(() => {
  vi.clearAllMocks()
  api.remotes.mockResolvedValue(['origin'])
  api.status.mockResolvedValue({ Ready: true, Repo: 'test/repo', Login: 'viewer' })
  api.prs.mockResolvedValue([])
  api.commits.mockResolvedValue([])
  api.local.mockResolvedValue([])
})
afterEach(() => {
  wrapper?.unmount()
  profile.value = null
})
it('loads all-state authored PRs lazily when opened and provides review navigation', async () => {
  wrapper = mount(ContributorProfile, {
    props: { person: { name: 'Alice', login: 'alice', remote: 'upstream' } },
    global: {
      stubs: {
        Teleport: true,
        PullRequestsView: {
          props: ['initialAuthor', 'initialReviewer', 'initialRemote'],
          template: '<div class="filtered">{{initialReviewer}} {{initialRemote}}</div>',
        },
      },
    },
  })
  await flushPromises()
  expect(api.prs).toHaveBeenCalledWith(
    'upstream',
    expect.objectContaining({ State: 'all', Search: 'author:alice sort:updated-desc', Limit: 3 }),
  )
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'View reviews')!
    .trigger('click')
  await flushPromises()
  expect(wrapper.get('.filtered').text()).toBe('alice upstream')
})
it('keeps ordinary Git authors local rather than guessing a GitHub login', async () => {
  wrapper = mount(ContributorProfile, {
    props: { person: { name: 'Alice', email: 'alice@example.com' } },
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  expect(api.local).toHaveBeenCalledWith('alice@example.com', 30)
  expect(api.prs).not.toHaveBeenCalled()
  expect(api.commits).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Local Git author')
})
it('recognizes only GitHub noreply identities', () => {
  expect(githubLogin('123+leaanthony@users.noreply.github.com')).toBe('leaanthony')
  expect(githubLogin('leaanthony@example.com')).toBe('')
})
it('caches successful reads by context and does not retain failures', async () => {
  const read = vi.fn().mockResolvedValue(['one'])
  await cachedContributions('test-cache-one', read)
  await cachedContributions('test-cache-one', read)
  expect(read).toHaveBeenCalledTimes(1)
  await cachedContributions('test-cache-two', read)
  expect(read).toHaveBeenCalledTimes(2)
  const fail = vi.fn().mockRejectedValue(new Error('offline'))
  await expect(cachedContributions('failed-read', fail)).rejects.toThrow('offline')
  await expect(cachedContributions('failed-read', fail)).rejects.toThrow('offline')
  expect(fail).toHaveBeenCalledTimes(2)
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
const mocks = vi.hoisted(() => ({
  info: vi.fn<() => Promise<{ Path: string; Branch?: string }>>(),
  open: vi.fn<(path: string) => Promise<{ Path: string }>>(),
  on: vi.fn<(name: string, callback: () => void) => () => void>(),
}))
vi.mock('@wailsio/runtime', () => ({ Events: { On: mocks.on } }))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: { Info: mocks.info, Open: mocks.open },
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
describe('repository switching', () => {
  it('coalesces synchronous refreshes and starts a new read after completion', async () => {
    mocks.info.mockResolvedValue({ Path: '/current' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await Promise.all([api.refreshRepoStatus(), api.refreshRepoStatus()])
    expect(mocks.info).toHaveBeenCalledTimes(1)
    expect(state.info?.Path).toBe('/current')
    await api.refreshRepoStatus()
    expect(mocks.info).toHaveBeenCalledTimes(2)
  })
  it('queues a fresh read when a mutation arrives during an older read', async () => {
    let finish!: (value: { Path: string }) => void
    mocks.info
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ Path: '/fresh' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await flushPromises()
    const done = api.refreshRepoStatus()
    finish({ Path: '/stale' })
    await done
    expect(mocks.info).toHaveBeenCalledTimes(2)
    expect(state.info?.Path).toBe('/fresh')
  })
  it('can retry a failed snapshot', async () => {
    mocks.info
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValueOnce({ Path: '/retry' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await flushPromises()
    expect(state.error).toBe('read failed')
    await api.refreshRepoStatus()
    expect(state.info?.Path).toBe('/retry')
    expect(state.error).toBe('')
  })
  it('ignores a late status response from the previous repository', async () => {
    let finish!: (value: { Path: string }) => void
    mocks.info.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    mocks.open.mockResolvedValue({ Path: '/new' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await flushPromises()
    await api.switchRepository('/new')
    finish({ Path: '/old' })
    await flushPromises()
    expect(state.info?.Path).toBe('/new')
    expect(state.switching).toBe(false)
  })
  it('refreshes the new repository without waiting for an old repository read', async () => {
    let finish!: (value: { Path: string }) => void
    mocks.info
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ Path: '/new', Branch: 'updated' })
    mocks.open.mockResolvedValue({ Path: '/new' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await flushPromises()
    await api.switchRepository('/new')
    await api.refreshRepoStatus()
    expect(state.info?.Branch).toBe('updated')
    finish({ Path: '/old' })
    await flushPromises()
    expect(state.info?.Branch).toBe('updated')
    expect(state.info?.Path).toBe('/new')
  })
  it('keeps the active repo after an invalid path and permits retry', async () => {
    mocks.info.mockResolvedValue({ Path: '/current' })
    mocks.open
      .mockRejectedValueOnce(new Error('not a Git working tree'))
      .mockResolvedValueOnce({ Path: '/next' })
    const api = await import('../composables/useRepoStatus')
    const state = api.useRepoStatus()
    await flushPromises()
    await expect(api.switchRepository('/missing')).rejects.toThrow('not a Git')
    expect(state.info?.Path).toBe('/current')
    expect(state.switching).toBe(false)
    await api.switchRepository('/next')
    expect(state.info?.Path).toBe('/next')
  })
  it('removes unsaved-edit guards when their owning view unmounts', async () => {
    const { useRepoSwitchGuard, repoSwitchBlocker } =
      await import('../composables/useRepoSwitchGuard')
    const wrapper = mount(
      defineComponent({
        setup() {
          useRepoSwitchGuard(() => 'Save your edit')
          return () => null
        },
      }),
    )
    expect(repoSwitchBlocker()).toBe('Save your edit')
    wrapper.unmount()
    expect(repoSwitchBlocker()).toBe('')
  })
})

it('invalidates retained navigation previews on mutations and repository switching', async () => {
  mocks.info.mockResolvedValue({ Path: '/current' })
  mocks.open.mockResolvedValue({ Path: '/next' })
  const api = await import('../composables/useRepoStatus')
  const cache = await import('../components/status/changesSnapshotCache')
  const navigation = await import('../composables/navigationSnapshots')
  api.useRepoStatus()
  await flushPromises()
  const snapshot = {
    Info: { Path: '/current' },
    Summary: { Entries: [], Working: [], Staged: [] },
  } as unknown as Parameters<typeof cache.saveChangesSnapshot>[1]
  const save = () => {
    cache.saveChangesSnapshot('/current', snapshot, '', null, cache.changesCacheGeneration())
    navigation.saveNavigationSnapshot(
      'branches',
      '/current',
      { branches: [], selection: '' },
      navigation.navigationGeneration(),
    )
  }
  save()
  expect(cache.peekChangesSnapshot('/current')).not.toBeNull()
  expect(navigation.peekNavigationSnapshot('branches', '/current')).not.toBeNull()
  const mutation = mocks.on.mock.calls.find(([name]) => name === 'git:status-changed')![1]
  mutation()
  expect(cache.peekChangesSnapshot('/current')).toBeNull()
  expect(navigation.peekNavigationSnapshot('branches', '/current')).toBeNull()
  await flushPromises()
  save()
  await api.switchRepository('/next')
  expect(cache.peekChangesSnapshot('/current')).toBeNull()
  expect(navigation.peekNavigationSnapshot('branches', '/current')).toBeNull()
})

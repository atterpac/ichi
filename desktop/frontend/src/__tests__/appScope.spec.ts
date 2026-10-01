import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'

const mocks = vi.hoisted(() => ({
  info: vi.fn<() => Promise<{ Path: string }>>(),
  open: vi.fn<(path: string) => Promise<{ Path: string }>>(),
  workspace: vi.fn<() => Promise<{ RepoPath: string; Kind: string; Files: { Path: string }[] }>>(),
  profiles: vi.fn<(files: string[]) => Promise<{ Profiles: never[]; Warnings: string[] }>>(),
  syncProfiles: vi.fn<(assignments: Record<string, string>) => Promise<void>>(),
  effectiveProfile: vi.fn<() => Promise<null>>(),
  events: new Map<string, Set<() => void>>(),
}))
vi.mock('@wailsio/runtime', () => ({
  System: { IsDesktop: () => false },
  Events: {
    On(name: string, callback: () => void) {
      const callbacks = mocks.events.get(name) ?? new Set()
      mocks.events.set(name, callbacks)
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    },
  },
}))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RepoService: {
    Info: mocks.info,
    Open: mocks.open,
    ListGitProfiles: mocks.profiles,
    SyncWorkspaceProfiles: mocks.syncProfiles,
    RepositoryProfile: mocks.effectiveProfile,
  },
  ConflictService: { Workspace: mocks.workspace },
}))

let dispose: (() => void) | undefined
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.events.clear()
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: vi.fn<(key: string, value: string) => void>((key, value) => {
      saved.set(key, value)
    }),
  })
  mocks.info.mockResolvedValue({ Path: '/repo' })
  mocks.workspace.mockResolvedValue({ RepoPath: '/repo', Kind: '', Files: [] })
  mocks.profiles.mockResolvedValue({ Profiles: [], Warnings: [] })
  mocks.syncProfiles.mockResolvedValue(undefined)
  mocks.effectiveProfile.mockResolvedValue(null)
})
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  dispose?.()
  dispose = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function appScope() {
  const scope = await import('../composables/appScope')
  dispose = scope.disposeAppScope
  await scope.initializeAppScope()
  await flushPromises()
  return scope
}

describe('window-wide store lifetime', () => {
  it('starts once, disposes subscriptions and persistence, and remounts without duplicate owners', async () => {
    const storage = vi.mocked(localStorage.setItem)
    const scope = await appScope()
    await scope.initializeAppScope()
    const repoApi = await import('../composables/useRepoStatus')
    const workspaces = await import('../composables/useWorkspaces')
    const first = workspaces.useWorkspaces()
    repoApi.useRepoStatus()
    expect(mocks.info).toHaveBeenCalledOnce()
    expect(mocks.events.get('git:status-changed')?.size).toBe(1)
    expect(mocks.events.get('git:repo-changed')?.size).toBe(1)
    first.state.workspaces[0]!.name = 'Saved'
    expect(storage).toHaveBeenCalledOnce()
    scope.disposeAppScope()
    scope.disposeAppScope()
    expect(mocks.events.get('git:repo-changed')?.size).toBe(0)
    first.state.workspaces[0]!.name = 'Disposed edit'
    expect(storage).toHaveBeenCalledOnce()
    await scope.initializeAppScope()
    await flushPromises()
    expect(workspaces.useWorkspaces().state.workspaces[0]!.name).toBe('Saved')
    first.state.workspaces[0]!.name = 'Remounted'
    expect(storage).toHaveBeenCalledTimes(2)
    expect(mocks.info).toHaveBeenCalledTimes(2)
    expect(mocks.events.get('git:repo-changed')?.size).toBe(1)
  })

  it('does not start workspace persistence by importing the app or profile store', async () => {
    const read = vi.spyOn(localStorage, 'getItem')
    const scope = await import('../composables/appScope')
    dispose = scope.disposeAppScope
    await import('../composables/useGitProfiles')
    expect(read).not.toHaveBeenCalled()
    await scope.initializeAppScope()
    expect(read).toHaveBeenCalledOnce()
  })

  it('rejects status responses from an earlier lifetime without waiting for them on remount', async () => {
    let finish!: (info: { Path: string }) => void
    mocks.info
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ Path: '/new-lifetime' })
    const scope = await appScope()
    scope.disposeAppScope()
    await scope.initializeAppScope()
    await flushPromises()
    const { useRepoStatus } = await import('../composables/useRepoStatus')
    const status = useRepoStatus()
    expect(status.info?.Path).toBe('/new-lifetime')
    finish({ Path: '/obsolete-lifetime' })
    await flushPromises()
    expect(status.info?.Path).toBe('/new-lifetime')
  })

  it('owns appearance effects and clears preview/context state on app disposal', async () => {
    document.documentElement.style.setProperty('--accent', '#123456')
    const scope = await appScope()
    const { usePreferences } = await import('../customization/usePreferences')
    const preferences = usePreferences()
    preferences.set('graph.limit', 400, 'repository', '/repo')
    preferences.setContext({ repository: '/repo' })
    const preview = preferences.beginPreview()
    preview.set('appearance.accent', '#abcdef')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#abcdef')
    scope.disposeAppScope()
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#123456')
    expect(preferences.values.value['graph.limit']).toBe(120)
    expect(() => preview.set('graph.limit', 600)).toThrow('closed')
    await scope.initializeAppScope()
    expect(usePreferences().values.value['appearance.accent']).toBe('')
    scope.disposeAppScope()
    document.documentElement.style.removeProperty('--accent')
  })

  it('shares lazy conflict subscriptions and clears transient data after the last consumer leaves', async () => {
    await appScope()
    const intervals = vi.spyOn(globalThis, 'setInterval')
    const clearInterval = vi.spyOn(globalThis, 'clearInterval')
    mocks.workspace.mockResolvedValue({
      RepoPath: '/repo',
      Kind: 'merge',
      Files: [{ Path: 'file' }],
    })
    const { useConflictWorkspace } = await import('../composables/useConflictWorkspace')
    let workspace!: ReturnType<typeof useConflictWorkspace>
    const Consumer = defineComponent({
      setup() {
        workspace = useConflictWorkspace()
        return () => null
      },
    })
    const first = mount(Consumer)
    const second = mount(Consumer)
    wrappers.push(first, second)
    await flushPromises()
    expect(mocks.workspace).toHaveBeenCalledOnce()
    expect(intervals).toHaveBeenCalledOnce()
    expect(mocks.events.get('git:repo-changed')?.size).toBe(2)
    expect(workspace.active.value).toBe(true)
    first.unmount()
    expect(mocks.events.get('git:repo-changed')?.size).toBe(2)
    expect(clearInterval).not.toHaveBeenCalled()
    second.unmount()
    wrappers.splice(0)
    expect(mocks.events.get('git:repo-changed')?.size).toBe(1)
    expect(workspace.state.data).toBeNull()
    expect(workspace.state.loading).toBe(false)
    expect(workspace.active.value).toBe(false)
    expect(clearInterval).toHaveBeenCalledOnce()
  })

  it('remounts conflicts immediately while an obsolete request remains in flight', async () => {
    const scope = await appScope()
    let finish!: (data: { RepoPath: string; Kind: string; Files: [] }) => void
    mocks.workspace
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ RepoPath: '/repo', Kind: '', Files: [] })
    const { useConflictWorkspace } = await import('../composables/useConflictWorkspace')
    let workspace!: ReturnType<typeof useConflictWorkspace>
    const Consumer = defineComponent({
      setup() {
        workspace = useConflictWorkspace()
        return () => null
      },
    })
    const old = mount(Consumer)
    await flushPromises()
    scope.disposeAppScope()
    await scope.initializeAppScope()
    const fresh = mount(Consumer)
    wrappers.push(old, fresh)
    old.unmount() // A previous lifetime's unmount must not release the new consumer.
    await flushPromises()
    expect(mocks.workspace).toHaveBeenCalledTimes(2)
    expect(workspace.state.loading).toBe(false)
    finish({ RepoPath: '/repo', Kind: 'obsolete merge', Files: [] })
    await flushPromises()
    expect(workspace.state.data?.Kind).toBe('')
    expect(mocks.events.get('git:repo-changed')?.size).toBe(2)
  })

  it('keeps profile watchers after the first component unmounts and stops them with the app', async () => {
    const scope = await appScope()
    const { useGitProfiles } = await import('../composables/useGitProfiles')
    const { useWorkspaces } = await import('../composables/useWorkspaces')
    const workspaces = useWorkspaces()
    workspaces.rememberRepo('/repo', 'repo')
    const Consumer = defineComponent({
      setup() {
        useGitProfiles()
        return () => null
      },
    })
    const first = mount(Consumer)
    await flushPromises()
    expect(mocks.syncProfiles).toHaveBeenCalledTimes(1)
    first.unmount()
    workspaces.state.workspaces[0]!.profileId = 'global'
    await flushPromises()
    expect(mocks.syncProfiles).toHaveBeenCalledTimes(2)
    expect(mocks.syncProfiles).toHaveBeenLastCalledWith({ '/repo': 'global' })
    scope.disposeAppScope()
    workspaces.state.workspaces[0]!.profileId = 'disposed edit'
    await flushPromises()
    expect(mocks.syncProfiles).toHaveBeenCalledTimes(2)
    await scope.initializeAppScope()
    wrappers.push(mount(Consumer), mount(Consumer))
    await flushPromises()
    expect(mocks.syncProfiles).toHaveBeenCalledTimes(3)
    expect(mocks.syncProfiles).toHaveBeenLastCalledWith({ '/repo': 'global' })
  })

  it('starts a conflict read for the new repository without waiting on the old one', async () => {
    await appScope()
    let finish!: (data: { RepoPath: string; Kind: string; Files: [] }) => void
    mocks.workspace
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      .mockResolvedValueOnce({ RepoPath: '/next', Kind: '', Files: [] })
    mocks.open.mockResolvedValue({ Path: '/next' })
    const { useConflictWorkspace } = await import('../composables/useConflictWorkspace')
    const { switchRepository } = await import('../composables/useRepoStatus')
    let workspace!: ReturnType<typeof useConflictWorkspace>
    wrappers.push(
      mount(
        defineComponent({
          setup() {
            workspace = useConflictWorkspace()
            return () => null
          },
        }),
      ),
    )
    await flushPromises()
    await switchRepository('/next')
    await flushPromises()
    expect(mocks.workspace).toHaveBeenCalledTimes(2)
    expect(workspace.state.data?.RepoPath).toBe('/next')
    finish({ RepoPath: '/repo', Kind: 'old merge', Files: [] })
    await flushPromises()
    expect(workspace.state.data?.RepoPath).toBe('/next')
    expect(workspace.state.loading).toBe(false)
  })

  it('clears app-owned toast timers and callbacks on disposal', async () => {
    const scope = await appScope()
    const { useToasts } = await import('../composables/useToasts')
    const clear = vi.spyOn(window, 'clearTimeout')
    const toasts = useToasts()
    const action = vi.fn<() => void>()
    toasts.notify({ title: 'Pending', onAction: action, duration: 60_000 })
    expect(toasts.toasts).toHaveLength(1)
    scope.disposeAppScope()
    expect(toasts.toasts).toHaveLength(0)
    expect(clear).toHaveBeenCalledOnce()
    expect(action).not.toHaveBeenCalled()
  })

  it('serializes remounted profile mutations behind an already submitted backend write', async () => {
    const scope = await appScope()
    const { useGitProfiles } = await import('../composables/useGitProfiles')
    const { useWorkspaces } = await import('../composables/useWorkspaces')
    const workspaces = useWorkspaces()
    workspaces.rememberRepo('/repo', 'repo')
    await useGitProfiles().ready()
    let finish!: () => void
    mocks.syncProfiles.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    workspaces.state.workspaces[0]!.profileId = 'old'
    await flushPromises()
    expect(mocks.syncProfiles).toHaveBeenCalledTimes(2)
    scope.disposeAppScope()
    await scope.initializeAppScope()
    const profiles = useGitProfiles()
    workspaces.state.workspaces[0]!.profileId = 'new'
    await flushPromises()
    expect(mocks.syncProfiles).toHaveBeenCalledTimes(2)
    expect(profiles.state.syncing).toBe(true)
    finish()
    await profiles.ready()
    expect(mocks.syncProfiles).toHaveBeenLastCalledWith({ '/repo': 'new' })
    expect(profiles.state.syncing).toBe(false)
    // The old write cannot refresh transient UI state in the new lifetime.
    expect(mocks.effectiveProfile).toHaveBeenCalledTimes(3)
  })
})

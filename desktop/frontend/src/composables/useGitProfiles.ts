import { computed, effectScope, reactive, watch, type EffectScope } from 'vue'
import { RepoService, type GitProfile } from '../bindings/github.com/atterpac/ichi/desktop/services'
import { useWorkspaces } from './useWorkspaces'
import { repoSwitchBlocker } from './useRepoSwitchGuard'
let ws: ReturnType<typeof useWorkspaces>
const initialState = () => ({
  profiles: [] as GitProfile[],
  warnings: [] as string[],
  loading: false,
  error: '',
  syncing: false,
  syncError: '',
  effective: null as GitProfile | null,
})
const state = reactive(initialState())
let started = false
let scope: EffectScope | undefined
let generation = 0
let effectiveVersion = 0
let queue = Promise.resolve()
let pending = 0
let catalogVersion = 0
const projection = computed(() =>
  Object.fromEntries(
    ws.state.repos.flatMap((r) => {
      const id = ws.state.workspaces.find((w) => w.id === r.workspace)?.profileId
      return id ? [[r.path, id]] : []
    }),
  ),
)
async function refresh() {
  if (!started) return
  const version = ++catalogVersion
  state.loading = true
  state.error = ''
  try {
    const catalog = await RepoService.ListGitProfiles(ws.state.profileFiles)
    if (version !== catalogVersion) return
    state.profiles = catalog.Profiles
    state.warnings = catalog.Warnings
  } catch (e) {
    if (version === catalogVersion) state.error = errorText(e)
  } finally {
    if (version === catalogVersion) state.loading = false
  }
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}
async function effective() {
  if (!started) return
  const version = ++effectiveVersion
  const lifetime = generation
  try {
    const profile = await RepoService.RepositoryProfile()
    if (lifetime === generation && version === effectiveVersion) state.effective = profile
  } catch {
    if (lifetime === generation && version === effectiveVersion) state.effective = null
  }
}
function sync() {
  if (!started) return Promise.resolve()
  const lifetime = generation
  const assignments = { ...projection.value }
  pending++
  state.syncing = true
  queue = queue
    .catch(() => {})
    .then(async () => {
      if (lifetime !== generation) return
      try {
        await RepoService.SyncWorkspaceProfiles(assignments)
        if (lifetime !== generation) return
        state.syncError = ''
        await effective()
      } catch (e) {
        if (lifetime !== generation) return
        state.syncError = errorText(e)
        throw e
      } finally {
        if (lifetime === generation) {
          pending--
          state.syncing = pending > 0
        }
      }
    })
  void queue.catch(() => {})
  return queue
}
async function assign(workspace: string, id: string) {
  const lifetime = generation
  const blocker = repoSwitchBlocker()
  if (blocker) throw new Error(blocker)
  const target = ws.state.workspaces.find((w) => w.id === workspace)
  if (!target) throw new Error('Workspace no longer exists.')
  const previous = target.profileId
  target.profileId = id
  // The synchronous projection watcher enqueues this assignment.
  try {
    await queue
  } catch (e) {
    if (lifetime !== generation) throw e
    target.profileId = previous
    await queue.catch(() => {})
    throw e
  }
}
async function registerFile(path: string) {
  const lifetime = generation
  path = path.trim()
  if (!path) throw new Error('Enter a Git config file path.')
  const catalog = await RepoService.ListGitProfiles([path])
  if (lifetime !== generation) return
  const profile = catalog.Profiles.find(
    (p) => p.ID !== 'global' && (p.Source === path || p.Source.endsWith(path.replace(/^~\//, '/'))),
  )
  if (!profile)
    throw new Error(catalog.Warnings.join('\n') || 'No identity found in that config file.')
  if (!ws.state.profileFiles.includes(profile.Source)) ws.state.profileFiles.push(profile.Source)
  await refresh()
}
export function startGitProfiles() {
  if (!started) {
    ws = useWorkspaces()
    started = true
    scope = effectScope(true)
    scope.run(() => {
      watch(
        () => JSON.stringify(projection.value),
        () => {
          void sync().catch(() => {})
        },
        { immediate: true, flush: 'sync' },
      )
      watch(
        () => ws.state.profileFiles.slice(),
        () => {
          void refresh()
        },
      )
    })
    void refresh()
  }
}
export function disposeGitProfiles() {
  scope?.stop()
  scope = undefined
  started = false
  generation++
  catalogVersion++
  effectiveVersion++
  pending = 0
  Object.assign(state, initialState())
  // Keep the mutation chain: a new lifetime must follow an already submitted
  // backend sync rather than allowing that old write to overwrite a newer one.
}
export function useGitProfiles() {
  startGitProfiles()
  return { state, refresh, sync, effective, assign, registerFile, ready: () => queue }
}

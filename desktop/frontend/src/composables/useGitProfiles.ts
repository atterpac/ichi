import { computed, reactive, watch } from 'vue'
import { RepoService, type GitProfile } from '../bindings/github.com/atterpac/ichi/desktop/services'
import { useWorkspaces } from './useWorkspaces'
import { repoSwitchBlocker } from './useRepoSwitchGuard'
const ws = useWorkspaces()
const state = reactive({
  profiles: [] as GitProfile[],
  warnings: [] as string[],
  loading: false,
  error: '',
  syncing: false,
  syncError: '',
  effective: null as GitProfile | null,
})
let started = false
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
  try {
    state.effective = await RepoService.RepositoryProfile()
  } catch {
    state.effective = null
  }
}
function sync() {
  const assignments = { ...projection.value }
  pending++
  state.syncing = true
  queue = queue
    .catch(() => {})
    .then(async () => {
      try {
        await RepoService.SyncWorkspaceProfiles(assignments)
        state.syncError = ''
        await effective()
      } catch (e) {
        state.syncError = errorText(e)
        throw e
      } finally {
        pending--
        state.syncing = pending > 0
      }
    })
  void queue.catch(() => {})
  return queue
}
async function assign(workspace: string, id: string) {
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
    target.profileId = previous
    await queue.catch(() => {})
    throw e
  }
}
async function registerFile(path: string) {
  path = path.trim()
  if (!path) throw new Error('Enter a Git config file path.')
  const catalog = await RepoService.ListGitProfiles([path])
  const profile = catalog.Profiles.find(
    (p) => p.ID !== 'global' && (p.Source === path || p.Source.endsWith(path.replace(/^~\//, '/'))),
  )
  if (!profile)
    throw new Error(catalog.Warnings.join('\n') || 'No identity found in that config file.')
  if (!ws.state.profileFiles.includes(profile.Source)) ws.state.profileFiles.push(profile.Source)
  await refresh()
}
export function useGitProfiles() {
  if (!started) {
    started = true
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
    void refresh()
  }
  return { state, refresh, sync, effective, assign, registerFile, ready: () => queue }
}

import { invalidateNavigationSnapshots } from './navigationSnapshots'
import { invalidateChangesSnapshots } from '../components/status/changesSnapshotCache'
import { reactive, readonly } from 'vue'
import { Events } from '@wailsio/runtime'
import { RepoService } from '../bindings/github.com/atterpac/ichi/desktop/services'
import type { RepoInfo } from '../bindings/github.com/atterpac/ichi/desktop/services'

// Single source of truth for repo-wide status (branch, ahead/behind, change and
// stash counts). Loads once, then stays fresh by listening to the backend's
// git:status-changed / git:repo-changed events — the same signals every mutating
// service emits. Views that mutate state don't need to poke it; the event does.

const state = reactive<{
  info: RepoInfo | null
  error: string
  switching: boolean
  revision: number
}>({
  info: null,
  error: '',
  switching: false,
  revision: 0,
})
let generation = 0
let repoEpoch = 0

let started = false
let stopEvents: (() => void)[] = []
let pending: Promise<void> | null = null
let queued = false

async function readRepoStatus(request: number) {
  try {
    const info = await RepoService.Info()
    if (request !== generation) return
    state.info = info
    state.error = ''
  } catch (err) {
    if (request !== generation) return
    state.error = err instanceof Error ? err.message : String(err)
  }
}

export function refreshRepoStatus(): Promise<void> {
  if (state.switching) return Promise.resolve()
  generation++
  queued = true
  // Start on a microtask so the two synchronous mutation events share a read.
  // An event arriving during a read schedules a fresh snapshot after it.
  if (!pending) {
    const epoch = repoEpoch
    const request: Promise<void> = Promise.resolve()
      .then(async () => {
        while (queued && !state.switching && epoch === repoEpoch) {
          queued = false
          await readRepoStatus(generation)
        }
      })
      .finally(() => {
        if (pending !== request) return
        pending = null
        if (queued && !state.switching) return refreshRepoStatus()
      })
    pending = request
  }
  return pending
}

/** One store per application window; the app scope owns its event lifetime. */
export function startRepoStatus() {
  if (!started) {
    started = true
    const changed = () => {
      invalidateChangesSnapshots()
      invalidateNavigationSnapshots()
      void refreshRepoStatus()
    }
    stopEvents = [Events.On('git:status-changed', changed), Events.On('git:repo-changed', changed)]
    void refreshRepoStatus()
  }
}

export function disposeRepoStatus() {
  for (const stop of stopEvents) stop?.()
  stopEvents = []
  started = false
  generation++
  repoEpoch++
  queued = false
  pending = null
  Object.assign(state, { info: null, error: '', switching: false, revision: 0 })
}

export function useRepoStatus() {
  startRepoStatus()
  return readonly(state)
}

/** Replace status only after Open succeeds; older refreshes cannot overwrite the new repo. */
export async function switchRepository(path: string): Promise<RepoInfo> {
  if (state.switching) throw new Error('A repository is already opening.')
  invalidateChangesSnapshots()
  invalidateNavigationSnapshots()
  state.switching = true
  queued = false
  const epoch = ++repoEpoch
  pending = null
  generation++
  try {
    const info = await RepoService.Open(path)
    if (epoch !== repoEpoch)
      throw new Error('The application closed while the repository was opening.')
    if (!info) throw new Error('The repository could not be opened.')
    state.info = info
    state.revision++
    state.error = ''
    return info
  } finally {
    if (epoch === repoEpoch) state.switching = false
  }
}

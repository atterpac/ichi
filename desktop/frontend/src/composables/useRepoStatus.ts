import { reactive, readonly } from 'vue'
import { Events } from '@wailsio/runtime'
import { RepoService } from '../bindings/github.com/atterpac/ichi/desktop/services'
import type { RepoInfo } from '../bindings/github.com/atterpac/ichi/desktop/services'

// Single source of truth for repo-wide status (branch, ahead/behind, change and
// stash counts). Loads once, then stays fresh by listening to the backend's
// git:status-changed / git:repo-changed events — the same signals every mutating
// service emits. Views that mutate state don't need to poke it; the event does.

const state = reactive<{ info: RepoInfo | null; error: string; switching: boolean; revision: number }>({
  info: null,
  error: '',
  switching: false,
  revision: 0,
})
let generation = 0

let started = false

export async function refreshRepoStatus() {
  if (state.switching) return
  const request = ++generation
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

/** Reactive repo status. First caller wires the event subscription and kicks a load. */
export function useRepoStatus() {
  if (!started) {
    started = true
    Events.On('git:status-changed', () => void refreshRepoStatus())
    Events.On('git:repo-changed', () => void refreshRepoStatus())
    void refreshRepoStatus()
  }
  return readonly(state)
}

/** Replace status only after Open succeeds; older refreshes cannot overwrite the new repo. */
export async function switchRepository(path: string): Promise<RepoInfo> {
  if (state.switching) throw new Error('A repository is already opening.')
  state.switching = true
  generation++
  try {
    const info = await RepoService.Open(path)
    if (!info) throw new Error('The repository could not be opened.')
    state.info = info
    state.revision++
    state.error = ''
    return info
  } finally {
    state.switching = false
  }
}

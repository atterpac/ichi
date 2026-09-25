import { reactive, readonly } from 'vue'
import { Events } from '@wailsio/runtime'
import { RepoService } from '../bindings/github.com/atterpac/ichi/desktop/services'
import type { RepoInfo } from '../bindings/github.com/atterpac/ichi/desktop/services'

// Single source of truth for repo-wide status (branch, ahead/behind, change and
// stash counts). Loads once, then stays fresh by listening to the backend's
// git:status-changed / git:repo-changed events — the same signals every mutating
// service emits. Views that mutate state don't need to poke it; the event does.

const state = reactive<{ info: RepoInfo | null; error: string }>({ info: null, error: '' })

let started = false

export async function refreshRepoStatus() {
  try {
    state.info = await RepoService.Info()
    state.error = ''
  } catch (err) {
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

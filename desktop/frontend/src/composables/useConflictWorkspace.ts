import {
  computed,
  effectScope,
  onBeforeUnmount,
  onMounted,
  reactive,
  watch,
  type EffectScope,
} from 'vue'
import { Events } from '@wailsio/runtime'
import {
  ConflictService,
  type ConflictWorkspace,
} from '../bindings/github.com/atterpac/ichi/desktop/services'
import { useRepoStatus } from './useRepoStatus'
const state = reactive({ data: null as ConflictWorkspace | null, error: '', loading: false })
let consumers = 0
let scope: EffectScope | undefined
let stopEvents: (() => void) | undefined
let timer: ReturnType<typeof setInterval> | undefined
let pending: Promise<void> | null = null
let queued = false
let epoch = 0
let lifetime = 0
async function readWorkspace() {
  const repo = useRepoStatus()
  const path = repo.info?.Path
  const generation = epoch
  if (!path || repo.switching) {
    state.data = null
    state.error = ''
    state.loading = false
    return
  }
  state.loading = true
  try {
    const data = await ConflictService.Workspace()
    if (generation !== epoch || repo.info?.Path !== path || repo.switching) return
    state.data = data?.RepoPath === path ? data : null
    state.error = ''
  } catch (e) {
    if (generation === epoch && repo.info?.Path === path && !repo.switching)
      state.error = e instanceof Error ? e.message : String(e)
  } finally {
    if (generation === epoch) state.loading = false
  }
}
// Coalesce subscribers and wait for any refresh queued by a mutation's event.
function refresh(): Promise<void> {
  if (!consumers) return Promise.resolve()
  queued = true
  if (!pending) {
    const generation = epoch
    const request = Promise.resolve()
      .then(async () => {
        while (queued && generation === epoch && consumers > 0) {
          queued = false
          await readWorkspace()
        }
      })
      .finally(() => {
        if (pending === request) pending = null
      })
    pending = request
  }
  return pending
}
function focused() {
  void refresh()
}
export function useConflictWorkspace() {
  const repo = useRepoStatus()
  let mountedLifetime: number | undefined
  onMounted(() => {
    mountedLifetime = lifetime
    if (consumers++ > 0) return
    scope = effectScope(true)
    scope.run(() =>
      watch(
        () => [repo.info?.Path, repo.switching],
        () => {
          epoch++
          queued = false
          pending = null
          state.data = null
          state.error = ''
          state.loading = false
          if (!repo.switching) void refresh()
        },
        { immediate: true },
      ),
    )
    stopEvents = Events.On('git:repo-changed', focused)
    window.addEventListener('focus', focused)
    timer = setInterval(() => {
      if (document.visibilityState !== 'hidden' && (state.data?.Kind || state.data?.Files.length))
        void refresh()
    }, 5000)
  })
  onBeforeUnmount(() => {
    if (mountedLifetime !== lifetime) return
    if (--consumers > 0) return
    disposeConflictWorkspace()
  })
  return {
    state,
    refresh,
    active: computed(() => !!state.data?.Kind || !!state.data?.Files.length),
  }
}

/** App disposal also releases lazy consumers and their transient view data. */
export function disposeConflictWorkspace() {
  consumers = 0
  lifetime++
  epoch++
  queued = false
  pending = null
  scope?.stop()
  scope = undefined
  stopEvents?.()
  stopEvents = undefined
  clearInterval(timer)
  timer = undefined
  window.removeEventListener('focus', focused)
  Object.assign(state, { data: null, error: '', loading: false })
}

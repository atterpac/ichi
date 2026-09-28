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
  queued = true
  if (!pending)
    pending = (async () => {
      while (queued) {
        queued = false
        await readWorkspace()
      }
    })().finally(() => {
      pending = null
    })
  return pending
}
function focused() {
  void refresh()
}
export function useConflictWorkspace() {
  const repo = useRepoStatus()
  onMounted(() => {
    if (consumers++ > 0) return
    scope = effectScope(true)
    scope.run(() =>
      watch(
        () => [repo.info?.Path, repo.switching],
        () => {
          void refresh()
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
    if (--consumers > 0) return
    epoch++
    scope?.stop()
    stopEvents?.()
    clearInterval(timer)
    window.removeEventListener('focus', focused)
    state.loading = false
  })
  return {
    state,
    refresh,
    active: computed(() => !!state.data?.Kind || !!state.data?.Files.length),
  }
}

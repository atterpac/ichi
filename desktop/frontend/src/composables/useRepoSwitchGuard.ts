import { onBeforeUnmount } from 'vue'
const guards = new Set<() => string>()
export function useRepoSwitchGuard(guard: () => string) {
  guards.add(guard)
  onBeforeUnmount(() => guards.delete(guard))
}
export function repoSwitchBlocker() {
  for (const guard of guards) {
    const reason = guard()
    if (reason) return reason
  }
  return ''
}

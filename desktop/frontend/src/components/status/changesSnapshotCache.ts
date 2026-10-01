import { markRaw } from 'vue'
import type { WorktreeSnapshot } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { estimateDiffBytes } from './fileDiffCache'
import { createBoundedLru } from '../../composables/boundedLru'

type Preview = { snapshot: WorktreeSnapshot; selection: string; diff: FileDiff | null }
// Completed view data only: no mounted components, fetch closures, or listeners.
const entries = createBoundedLru<string, Preview>({
  maxEntries: 4,
  maxBytes: 8 * 1024 * 1024,
  ttl: 60_000,
  sizeOf: ({ snapshot, diff }) =>
    JSON.stringify(snapshot).length * 2 +
    (snapshot.Summary?.Entries.length ?? 0) * 128 +
    estimateDiffBytes(diff),
})
let generation = 0
export const changesCacheGeneration = () => generation
export function invalidateChangesSnapshots() {
  generation++
  entries.clear()
}
export function forgetChangesSnapshot(path: string) {
  entries.delete(path)
}
export function peekChangesSnapshot(path: string) {
  return entries.get(path) ?? null
}
export function saveChangesSnapshot(
  path: string,
  snapshot: WorktreeSnapshot,
  selection: string,
  diff: FileDiff | null,
  version: number,
) {
  if (!path || snapshot.Info?.Path !== path || version !== generation) return
  entries.set(path, { snapshot: markRaw(snapshot), selection, diff: diff ? markRaw(diff) : null })
}

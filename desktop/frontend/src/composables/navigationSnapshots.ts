import { markRaw } from 'vue'
import type { GraphLayout, RepoInfo } from '../bindings/github.com/atterpac/ichi/desktop/services'
import type { Branch } from '../bindings/github.com/atterpac/ichi/internal/git'
import { createBoundedLru } from './boundedLru'

type Snapshots = {
  graph: { info: RepoInfo; layout: GraphLayout; selection: string }
  branches: { branches: Branch[]; selection: string }
}
// Data only; shared budget across graph limits, views and repositories.
const entries = createBoundedLru<string, Snapshots[keyof Snapshots]>({
  maxEntries: 8,
  maxBytes: 16 * 1024 * 1024,
  ttl: 60_000,
  sizeOf: (value) => JSON.stringify(value).length * 3 + 512,
})
let generation = 0
export const navigationGeneration = () => generation
export function invalidateNavigationSnapshots() {
  generation++
  entries.clear()
}
const key = (kind: keyof Snapshots, path: string, variant: number) =>
  JSON.stringify([kind, path, variant])
export function forgetNavigationSnapshot(kind: keyof Snapshots, path: string, variant = 0) {
  entries.delete(key(kind, path, variant))
}
export function peekNavigationSnapshot<K extends keyof Snapshots>(
  kind: K,
  path: string,
  variant = 0,
): Snapshots[K] | null {
  if (!path) return null
  const id = key(kind, path, variant)
  return (entries.get(id) as Snapshots[K] | undefined) ?? null
}
export function saveNavigationSnapshot<K extends keyof Snapshots>(
  kind: K,
  path: string,
  value: Snapshots[K],
  version: number,
  variant = 0,
) {
  if (!path || version !== generation) return
  if ('info' in value && value.info.Path !== path) return
  const id = key(kind, path, variant)
  entries.set(id, markRaw(value))
}

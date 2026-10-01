import { markRaw } from 'vue'
import type { CommitDetail } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { createBoundedLru } from '../../composables/boundedLru'

type Cancellable<T> = Promise<T> & { cancel?: () => void }
const detailBytes = (detail: CommitDetail) =>
  JSON.stringify(detail).length * 2 + (detail.Files?.length ?? 0) * 128
const detailStore = () =>
  createBoundedLru<string, CommitDetail>({
    maxEntries: 80,
    maxBytes: 8 * 1024 * 1024,
    sizeOf: detailBytes,
  })
// One bounded store across repositories and view instances. Only immutable core
// details belong here; mutable refs and signature trust are fetched on demand.
const sharedEntries = detailStore()
let sharedGeneration = 0
export function clearSharedCommitDetails() {
  sharedGeneration++
  sharedEntries.clear()
}

export function createCommitDetailCache(
  fetch: (hash: string) => Cancellable<CommitDetail | null>,
  limit = 80,
  ttl = Infinity,
  scope?: () => string,
  maxBytes = 8 * 1024 * 1024,
) {
  const entries = scope ? sharedEntries : detailStore()
  const pending = new Map<string, { promise: Promise<CommitDetail | null>; cancel: () => void }>()
  let generation = 0
  const keyFor = (hash: string) => (scope ? JSON.stringify([scope(), hash]) : hash)
  function peek(hash: string) {
    const key = keyFor(hash)
    return entries.get(key) ?? null
  }
  function get(hash: string): Promise<CommitDetail | null> {
    const key = keyFor(hash)
    const cached = peek(hash)
    if (cached) return Promise.resolve(cached)
    const existing = pending.get(key)
    if (existing) return existing.promise
    const version = generation
    const sharedVersion = sharedGeneration
    let active: Cancellable<CommitDetail | null> | undefined
    const promise = Promise.resolve()
      .then(() => {
        if (version !== generation) return null
        active = fetch(hash)
        return active
      })
      .then((detail) => {
        if (detail && version === generation && (!scope || sharedVersion === sharedGeneration))
          entries.set(key, markRaw(detail), { maxEntries: limit, maxBytes, ttl })
        return detail
      })
      .finally(() => {
        if (pending.get(key)?.promise === promise) pending.delete(key)
      })
    pending.set(key, { promise, cancel: () => active?.cancel?.() })
    return promise
  }
  function cancelPending() {
    generation++
    for (const request of pending.values()) request.cancel()
    pending.clear()
  }
  function clearScope() {
    cancelPending()
    if (!scope) {
      entries.clear()
      return
    }
    const current = scope()
    entries.deleteWhere((key) => JSON.parse(key)[0] === current)
  }
  function clear() {
    cancelPending()
    if (scope) clearSharedCommitDetails()
    else entries.clear()
  }
  return { peek, get, clear, clearScope, cancelPending }
}

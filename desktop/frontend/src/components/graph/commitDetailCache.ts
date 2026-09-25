import type { CommitDetail } from '../../bindings/github.com/atterpac/ichi/internal/git'

// View-local LRU: refs/signature trust can change even though commit contents cannot.
export function createCommitDetailCache(
  fetch: (hash: string) => Promise<CommitDetail | null>,
  limit = 80,
  ttl = 60_000,
) {
  const entries = new Map<string, { detail: CommitDetail; expires: number }>()
  const pending = new Map<string, Promise<CommitDetail | null>>()
  let generation = 0
  function peek(hash: string) {
    const entry = entries.get(hash)
    if (!entry) return null
    entries.delete(hash)
    if (entry.expires <= Date.now()) return null
    entries.set(hash, entry)
    return entry.detail
  }
  function get(hash: string): Promise<CommitDetail | null> {
    const cached = peek(hash)
    if (cached) return Promise.resolve(cached)
    const existing = pending.get(hash)
    if (existing) return existing
    const version = generation
    const request = Promise.resolve()
      .then(() => fetch(hash))
      .then((detail) => {
        if (detail && version === generation) {
          entries.set(hash, { detail, expires: Date.now() + ttl })
          while (entries.size > limit) entries.delete(entries.keys().next().value!)
        }
        return detail
      })
      .finally(() => {
        if (pending.get(hash) === request) pending.delete(hash)
      })
    pending.set(hash, request)
    return request
  }
  function clear() {
    generation++
    entries.clear()
    pending.clear()
  }
  return { peek, get, clear }
}

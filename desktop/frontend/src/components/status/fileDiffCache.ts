import type { FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { createBoundedLru } from '../../composables/boundedLru'

type CancelableRead = Promise<FileDiff | null> & { cancel?: () => boolean }
type BridgeRead = Promise<FileDiff | null> & { cancel?: () => void }

export type DiffTarget = { path: string; oldPath: string; staged: boolean; untracked: boolean }

// View-local LRU for immutable patches. The caller clears it on each status
// refresh; equal numstat counts do not prove a file's contents are unchanged.
export function createFileDiffCache(
  fetch: (target: DiffTarget) => Promise<FileDiff | null>,
  maxEntries = 40,
  maxBytes = 8 * 1024 * 1024,
) {
  const entries = createBoundedLru<string, FileDiff | null>({
    maxEntries,
    maxBytes,
    sizeOf: estimateDiffBytes,
  })
  const pending = new Map<string, CancelableRead>()
  let generation = 0
  const key = (target: DiffTarget) =>
    JSON.stringify([target.staged, target.untracked, target.path, target.oldPath])
  function peek(target: DiffTarget): FileDiff | null | undefined {
    const id = key(target)
    return entries.get(id)
  }
  function get(target: DiffTarget): CancelableRead {
    const cached = peek(target)
    if (cached !== undefined) return Promise.resolve(cached)
    const id = key(target)
    const existing = pending.get(id)
    if (existing) return existing
    const version = generation
    let active: BridgeRead | undefined
    let cancelled = false
    let rejectAbort: (reason: Error) => void = () => {}
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject })
    const task = Promise.resolve().then(() => {
      if (cancelled) throw new Error('Request cancelled')
      active = fetch(target)
      return active
    })
    const request: CancelableRead = Promise.race([task, aborted])
      .then((diff) => {
        // Approximate retained UTF-16 text plus line/hunk object overhead. A
        // single oversized preview can be displayed, but is not retained here.
        if (!cancelled && version === generation) entries.set(id, diff)
        return diff
      })
      .finally(() => {
        if (pending.get(id) === request) pending.delete(id)
      })
    request.cancel = () => {
      if (active && !active.cancel) return false
      cancelled = true
      active?.cancel?.()
      rejectAbort(new Error('Request cancelled'))
      if (pending.get(id) === request) pending.delete(id)
      return true
    }
    pending.set(id, request)
    return request
  }
  function clear() {
    generation++
    entries.clear()
    for (const request of pending.values()) request.cancel?.()
    pending.clear()
  }
  return { peek, get, clear }
}

export function estimateDiffBytes(diff: FileDiff | null) {
  if (!diff) return 64
  let bytes = 256 + 2 * ((diff.Path?.length ?? 0) + (diff.OldPath?.length ?? 0))
  for (const hunk of diff.Hunks) {
    if (!hunk) continue
    bytes += 128 + 2 * (hunk.Header?.length ?? 0)
    for (const line of hunk.Lines) {
      if (line) bytes += 96 + 2 * line.Content.length
    }
  }
  return bytes
}

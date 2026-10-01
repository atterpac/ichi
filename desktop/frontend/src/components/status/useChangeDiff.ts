import { markRaw, onScopeDispose, ref, watch, type Ref } from 'vue'
import { LineType, FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'
import { createFileDiffCache, type DiffTarget } from './fileDiffCache'

const UNTRACKED_PREVIEW_LINES = 400

/** Untracked files use the same renderer with a bounded all-added preview. */
export function untrackedPreview(path: string, content: string, flags: { binary?: boolean; truncated?: boolean } = {}): FileDiff {
  if (flags.binary) return markRaw(new FileDiff({ Path: path, Binary: true, NewFile: true }))
  const all = content.split('\n')
  const lines = all.slice(0, UNTRACKED_PREVIEW_LINES).map((Content, index) => ({
    Type: LineType.LineAdded, Content, OldLineNo: 0, NewLineNo: index + 1, Selected: false,
  }))
  if (flags.truncated || all.length > UNTRACKED_PREVIEW_LINES) lines.push({
    Type: LineType.LineContext,
    Content: flags.truncated ? '… preview truncated' : `… preview truncated (${(all.length - UNTRACKED_PREVIEW_LINES).toLocaleString()} more lines)`,
    OldLineNo: 0, NewLineNo: 0, Selected: false,
  })
  return markRaw({
    Path: path, OldPath: '', Binary: false, NewFile: true, Deleted: false,
    Hunks: [{ Header: 'new file', OldStart: 0, OldCount: 0, NewStart: 1, NewCount: lines.length, Lines: lines, Selected: false, Expanded: true }],
  } as FileDiff)
}

/** Owns patch requests, coalescing rapid selections and rejecting stale results. */
export function useChangeDiff(options: {
  row: Ref<(DiffTarget & { conflict: boolean }) | undefined>
  refreshing: Ref<boolean>
  running: Ref<boolean>
  showingCached: Ref<boolean>
  statusError: Ref<string>
  fetch: (target: DiffTarget) => Promise<FileDiff | null>
}) {
  const diff = ref<FileDiff | null>(null)
  const loading = ref(false)
  const error = ref('')
  const retryVersion = ref(0)
  const cache = createFileDiffCache(options.fetch)
  let alive = true
  let generation = 0
  let desired: { row: DiffTarget; generation: number } | null = null
  let reading = false
  let active: (Promise<FileDiff | null> & { cancel?: () => boolean }) | undefined

  async function read() {
    if (reading) return
    reading = true
    try {
      while (desired && alive) {
        const request = desired
        desired = null
        try {
          active = cache.get(request.row)
          const result = await active
          if (request.generation === generation && alive) diff.value = result ? markRaw(result) : null
        } catch (cause) {
          if (request.generation === generation && alive) error.value = cause instanceof Error ? cause.message : String(cause)
        } finally {
          active = undefined
          if (request.generation === generation && alive) loading.value = false
        }
      }
    } finally { reading = false }
  }

  watch([options.row, options.refreshing, options.running, retryVersion, options.statusError], ([row, refreshing, running]) => {
    const version = ++generation
    active?.cancel?.()
    desired = null
    if (refreshing && options.showingCached.value) return
    diff.value = null
    error.value = ''
    loading.value = false
    if (!row || row.conflict || refreshing || running || options.statusError.value || !alive) return
    const cached = cache.peek(row)
    if (cached !== undefined) { diff.value = cached ? markRaw(cached) : null; return }
    loading.value = true
    desired = { row, generation: version }
    void read()
  }, { flush: 'post' })

  onScopeDispose(() => { alive = false; generation++; desired = null; cache.clear() })
  return { diff, loading, error, clear: cache.clear, retry: () => retryVersion.value++ }
}

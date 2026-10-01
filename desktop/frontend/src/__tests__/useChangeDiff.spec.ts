import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { FileDiff } from '../bindings/github.com/atterpac/ichi/internal/git'
import { untrackedPreview, useChangeDiff } from '../components/status/useChangeDiff'
import type { DiffTarget } from '../components/status/fileDiffCache'

const target = (path: string) => ({ path, oldPath: '', staged: false, untracked: false, conflict: false })
const patch = (Path: string) => new FileDiff({ Path })
function setup(fetch: (row: DiffTarget) => Promise<FileDiff | null>) {
  const scope = effectScope()
  const row = ref<ReturnType<typeof target> | undefined>()
  const result = scope.run(() => useChangeDiff({ row, fetch, refreshing: ref(false), running: ref(false), showingCached: ref(false), statusError: ref('') }))!
  return { scope, row, ...result }
}

describe('change patch loading', () => {
  it('cancels a superseded bridge read and starts the latest selection immediately', async () => {
    const cancel = vi.fn<() => void>()
    const fetch = vi.fn<(row: DiffTarget) => Promise<FileDiff | null>>()
      .mockReturnValueOnce(Object.assign(new Promise<FileDiff | null>(() => {}), { cancel }))
      .mockImplementation(row => Promise.resolve(patch(row.path)))
    const view = setup(fetch)
    try {
      view.row.value = target('slow')
      await flushPromises()
      view.row.value = target('latest')
      await flushPromises()
      expect(cancel).toHaveBeenCalledOnce()
      expect(fetch.mock.calls.map(([row]) => row.path)).toEqual(['slow', 'latest'])
      expect(view.diff.value?.Path).toBe('latest')
      expect(view.error.value).toBe('')
    } finally { view.scope.stop() }
  })
  it('coalesces rapid selections and never displays an old request', async () => {
    let finish!: (diff: FileDiff) => void
    const fetch = vi.fn<(row: DiffTarget) => Promise<FileDiff | null>>()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockImplementation(row => Promise.resolve(patch(row.path)))
    const view = setup(fetch)
    view.row.value = target('first')
    await flushPromises()
    view.row.value = target('skipped')
    await nextTick()
    view.row.value = target('last')
    await nextTick()
    finish(patch('first'))
    await flushPromises()
    expect(fetch.mock.calls.map(([row]) => row.path)).toEqual(['first', 'last'])
    expect(view.diff.value?.Path).toBe('last')
    expect(view.loading.value).toBe(false)
    view.scope.stop()
  })
  it('shows read errors, retries them, and ignores results after disposal', async () => {
    let finish!: (diff: FileDiff) => void
    const fetch = vi.fn<(row: DiffTarget) => Promise<FileDiff | null>>()
      .mockRejectedValueOnce(new Error('patch unavailable'))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const view = setup(fetch)
    view.row.value = target('file')
    await flushPromises()
    expect(view.error.value).toBe('patch unavailable')
    expect(view.loading.value).toBe(false)
    view.retry()
    await flushPromises()
    expect(view.error.value).toBe('')
    view.scope.stop()
    finish(patch('file'))
    await flushPromises()
    expect(view.diff.value).toBeNull()
  })
  it('bounds untracked previews and reserves the final row for truncation feedback', () => {
    const diff = untrackedPreview('new.txt', Array.from({ length: 450 }, (_, i) => `line ${i}`).join('\n'))
    expect(diff.NewFile).toBe(true)
    expect(diff.Hunks[0]?.Lines).toHaveLength(401)
    expect(diff.Hunks[0]?.Lines[400]?.Content).toContain('50 more lines')
    expect(diff.Hunks[0]?.Lines[400]?.NewLineNo).toBe(0)
  })
  it('preserves backend truncation and binary metadata without treating binary as empty text', () => {
    expect(untrackedPreview('large.txt', 'bounded content', { truncated: true }).Hunks[0]?.Lines[1]?.Content).toBe('… preview truncated')
    const binary = untrackedPreview('image.png', '', { binary: true })
    expect(binary.Binary).toBe(true)
    expect(binary.Hunks).toEqual([])
  })
})

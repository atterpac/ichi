import { effectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGitOperation } from '../composables/useGitOperation'

const notify = vi.hoisted(() => vi.fn<(input: { tone: string; title: string; message?: string }) => void>())
vi.mock('../composables/useToasts', () => ({ notify }))
afterEach(() => notify.mockClear())

describe('Git operation lifecycle', () => {
  it('refreshes after a partial failure, clears busy, and preserves failure feedback', async () => {
    const scope = effectScope()
    let state = 'before'
    const refresh = vi.fn<() => Promise<void>>(async () => { expect(state).toBe('partially changed') })
    const operation = scope.run(() => useGitOperation({ refresh }))!
    const success = await operation.run(async () => { state = 'partially changed'; throw new Error('merge conflicts') }, { failure: 'Merge failed' })
    expect(success).toBe(false)
    expect(refresh).toHaveBeenCalledOnce()
    expect(operation.busy.value).toBe(false)
    expect(notify).toHaveBeenCalledWith({ tone: 'danger', title: 'Merge failed', message: 'merge conflicts' })
    scope.stop()
  })
  it('serializes attempts through refresh and still clears busy if refresh fails', async () => {
    let finish!: () => void
    const scope = effectScope()
    const refresh = vi.fn<() => Promise<void>>(() => new Promise<void>(resolve => { finish = resolve }))
    const operation = scope.run(() => useGitOperation({ refresh }))!
    const pending = operation.run(async () => {})
    await Promise.resolve()
    const duplicate = vi.fn<() => Promise<void>>(async () => {})
    expect(await operation.run(duplicate)).toBe(false)
    expect(duplicate).not.toHaveBeenCalled()
    expect(operation.busy.value).toBe(true)
    finish()
    await pending
    await operation.run(async () => {}, {}, async () => { throw new Error('refresh unavailable') })
    expect(operation.busy.value).toBe(false)
    expect(notify).toHaveBeenCalledWith({ tone: 'danger', title: 'Refresh failed', message: 'refresh unavailable' })
    scope.stop()
  })
  it('does not refresh or report an operation completed after the view is disposed', async () => {
    let finish!: () => void
    const scope = effectScope()
    const refresh = vi.fn<() => Promise<void>>(async () => {})
    const operation = scope.run(() => useGitOperation({ refresh }))!
    const pending = operation.run(() => new Promise<void>(resolve => { finish = resolve }), { success: 'Saved' })
    scope.stop()
    finish()
    await pending
    expect(refresh).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(operation.busy.value).toBe(false)
  })
})

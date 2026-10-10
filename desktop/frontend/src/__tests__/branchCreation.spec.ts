import { beforeEach, expect, it, vi } from 'vitest'
import { branchCreation } from '../composables/branchCreation'
const ops = vi.hoisted(() => ({ create: vi.fn(), checkout: vi.fn(), stash: vi.fn() }))
vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RefService: { CreateBranchAt: ops.create, CheckoutBranch: ops.checkout },
  StashService: { StashPush: ops.stash },
}))
beforeEach(() => { vi.resetAllMocks() })
const blocked = { message: 'local changes would be overwritten by checkout' }
it('offers explicit stash recovery after creation and never creates the branch twice', async () => {
  ops.checkout.mockRejectedValueOnce(blocked)
  const request = branchCreation('main', async op => { await op() })
  await expect(request.onConfirm({ name: ' topic ' })).rejects.toThrow('would be overwritten')
  expect(ops.stash).not.toHaveBeenCalled()
  const recovery = request.recovery!(blocked)!
  expect(recovery.label).toBe('Stash changes and switch')
  await recovery.run()
  expect(ops.create).toHaveBeenCalledExactlyOnceWith('topic', 'main')
  expect(ops.stash).toHaveBeenCalledExactlyOnceWith('ichi: switch to topic', true)
  expect(ops.checkout).toHaveBeenLastCalledWith('topic', false)
})
it('does not create duplicate stashes when checkout fails again', async () => {
  ops.checkout.mockRejectedValueOnce(blocked).mockRejectedValueOnce(new Error('locked'))
  const request = branchCreation('main', async op => { await op() })
  await expect(request.onConfirm({ name: 'topic' })).rejects.toMatchObject({ message: expect.stringContaining('would be overwritten') })
  await expect(request.recovery!(blocked)!.run()).rejects.toThrow('locked')
  const retry = request.recovery!(new Error('locked'))!
  expect(retry.label).toBe('Retry switch')
  await retry.run()
  expect(ops.stash).toHaveBeenCalledTimes(1)
  expect(ops.create).toHaveBeenCalledTimes(1)
})
it('does not stash on a creation failure or switch after a stash failure', async () => {
  ops.create.mockRejectedValueOnce(blocked)
  const request = branchCreation('main', async op => { await op() })
  await expect(request.onConfirm({ name: 'topic' })).rejects.toMatchObject({ message: expect.stringContaining('would be overwritten') })
  expect(request.recovery!(blocked)).toBeUndefined()
  ops.checkout.mockRejectedValueOnce(blocked)
  await expect(request.onConfirm({ name: 'topic' })).rejects.toMatchObject({ message: expect.stringContaining('would be overwritten') })
  ops.stash.mockRejectedValueOnce(new Error('stash failed'))
  await expect(request.recovery!(blocked)!.run()).rejects.toThrow('stash failed')
  expect(ops.checkout).toHaveBeenCalledTimes(1)
})

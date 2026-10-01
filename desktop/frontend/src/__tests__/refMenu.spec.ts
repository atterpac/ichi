import { beforeEach, describe, expect, it, vi } from 'vitest'
import { commitRefActions } from '../components/graph/refMenu'
import type { OperationConfirmRequest } from '../components/overlays/OperationConfirmModal.vue'
import { flushPromises } from '@vue/test-utils'
import { Commit } from '../bindings/github.com/atterpac/ichi/internal/git'

const revert = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
const resetSoft = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
const resetHard = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
const mergeBranch = vi.fn<(value: string) => Promise<void>>(() => Promise.resolve())
const deleteBranch = vi.fn<(name: string, flag: boolean) => Promise<void>>(() => Promise.resolve())
const checkoutBranch = vi.fn<(name: string, flag: boolean) => Promise<void>>(() =>
  Promise.resolve(),
)

vi.mock('../bindings/github.com/atterpac/ichi/desktop/services', () => ({
  RefService: {
    Checkout: () => Promise.resolve(),
    CheckoutBranch: (n: string, c: boolean) => checkoutBranch(n, c),
    CreateBranchAt: () => Promise.resolve(),
    CherryPick: () => Promise.resolve(),
    Revert: (h: string) => revert(h),
    CreateTag: () => Promise.resolve(),
    ResetSoft: (h: string) => resetSoft(h),
    ResetMixed: () => Promise.resolve(),
    ResetHard: (h: string) => resetHard(h),
    MergeBranch: (n: string) => mergeBranch(n),
    RebaseBranch: () => Promise.resolve(),
    DeleteBranch: (n: string, f: boolean) => deleteBranch(n, f),
  },
}))

function commit(over: Record<string, unknown> = {}) {
  return new Commit({
    Hash: 'a1b2c3d0000',
    ShortHash: 'a1b2c3d',
    Message: 'wire up ref decorations',
    Refs: [],
    Decorations: [],
    ...over,
  })
}

let confirmed: OperationConfirmRequest | null
const deps = {
  currentBranch: 'main',
  run: (fn: () => Promise<void>) => void fn(),
  confirm: (req: OperationConfirmRequest) => {
    confirmed = req
  },
}

const labels = (items: ReturnType<typeof commitRefActions>) =>
  items.filter((i) => !i.separator).map((i) => i.label)
const byId = (items: ReturnType<typeof commitRefActions>, id: string) =>
  items.find((i) => i.id === id)

describe('commitRefActions', () => {
  beforeEach(() => {
    resetSoft.mockClear()
    resetHard.mockClear()
    mergeBranch.mockClear()
    deleteBranch.mockClear()
    checkoutBranch.mockClear()
    confirmed = null
  })

  it('consumes a reported direct-action failure while confirmation failures reach their dialog', async () => {
    const failure = new Error('partial Git operation failed')
    const run = vi.fn<() => Promise<void>>().mockRejectedValue(failure)
    const items = commitRefActions(commit(), { ...deps, run })
    expect(byId(items, 'checkout-detached')?.action?.()).toBeUndefined()
    await flushPromises()
    byId(items, 'cherry-pick')?.action?.()
    await expect(confirmed!.onConfirm({})).rejects.toThrow(failure)
  })

  it('offers commit-scoped verbs on a ref-less commit, no ref verbs', () => {
    const items = commitRefActions(commit(), deps)
    const ls = labels(items).join(' | ')
    expect(ls).toContain('Create branch here…')
    expect(ls).toContain('Reset main here · soft')
    expect(ls).toContain('Cherry-pick onto main')
    expect(ls).not.toContain('Merge')
    expect(ls).not.toContain('Delete')
  })

  it('soft reset runs immediately against the commit hash', () => {
    const items = commitRefActions(commit(), deps)
    byId(items, 'reset-soft')!.action!()
    expect(resetSoft).toHaveBeenCalledWith('a1b2c3d0000')
  })

  it('hard reset is danger and routes through confirm', () => {
    const items = commitRefActions(commit(), deps)
    const hard = byId(items, 'reset-hard')!
    expect(hard.danger).toBe(true)
    expect(hard.shortcut).toBe('H')
    hard.action!()
    expect(resetHard).not.toHaveBeenCalled()
    confirmed!.onConfirm({})
    expect(resetHard).toHaveBeenCalledWith('a1b2c3d0000')
  })

  it('adds per-branch merge/rebase/delete for a non-current local branch, skips the current one', () => {
    const items = commitRefActions(
      commit({
        Decorations: [
          { Name: 'main', Kind: 'branch', IsHead: true },
          { Name: 'feature/graph-refs', Kind: 'branch', IsHead: false },
        ],
      }),
      deps,
    )
    const merge = byId(items, 'merge:feature/graph-refs')!
    expect(merge).toBeTruthy()
    const parts = merge.labelParts as Array<string | Record<string, unknown>>
    expect(parts[0]).toBe('Merge ')
    // source ref = a non-current branch → per-name colour chip
    expect(parts[1]).toMatchObject({ chip: 'feature/graph-refs', kind: 'branch', head: false })
    expect(typeof (parts[1] as Record<string, string>).colorVar).toBe('string')
    // target = current branch → accent (no per-name colour)
    expect(parts[3]).toEqual({ chip: 'main', kind: 'branch', head: true })
    expect(byId(items, 'del:feature/graph-refs')).toBeTruthy()
    // the current branch (main) gets no merge/delete of itself
    expect(byId(items, 'merge:main')).toBeFalsy()
    expect(byId(items, 'del:main')).toBeFalsy()
    byId(items, 'del:feature/graph-refs')!.action!()
    confirmed!.onConfirm({})
    expect(deleteBranch).toHaveBeenCalledWith('feature/graph-refs', false)
  })

  it('gives each local branch a stable per-name colour; remotes/tags keep their kind', () => {
    const chipOf = (id: string, items: ReturnType<typeof commitRefActions>) =>
      byId(items, id)!.labelParts!.find((p) => typeof p === 'object')!
    const decs = [
      { Name: 'topic', Kind: 'branch', IsHead: false },
      { Name: 'origin/main', Kind: 'remote', IsHead: false },
    ]
    const a = commitRefActions(commit({ Decorations: decs }), deps)
    const b = commitRefActions(commit({ Decorations: decs }), deps)
    // deterministic: same name → same colour across builds
    expect(chipOf('co:topic', a).colorVar).toBe(chipOf('co:topic', b).colorVar)
    expect(chipOf('co:topic', a).colorVar).toMatch(/^--/)
    // remote keeps its semantic kind, no per-name override
    expect(chipOf('co-remote:origin/main', a).colorVar).toBeUndefined()
  })

  it('checks out a remote decoration by its short name', () => {
    const items = commitRefActions(
      commit({ Decorations: [{ Name: 'origin/main', Kind: 'remote', IsHead: false }] }),
      deps,
    )
    byId(items, 'co-remote:origin/main')!.action!()
    expect(checkoutBranch).toHaveBeenCalledWith('main', false)
  })
  it('requires confirmation before reverting a commit', () => {
    revert.mockClear()
    const item = byId(commitRefActions(commit(), deps), 'revert')!
    item.action!()
    expect(revert).not.toHaveBeenCalled()
    expect(confirmed!.title).toBe('Revert commit?')
    confirmed!.onConfirm({})
    expect(revert).toHaveBeenCalledWith('a1b2c3d0000')
  })

  it('uses the graph lane for a visible ref and disables unsupported merge reverts', () => {
    const items = commitRefActions(
      commit({ IsMerge: true, Decorations: [{ Name: 'topic', Kind: 'branch', IsHead: false }] }),
      { ...deps, laneColorForRef: () => '--lane-3' },
    )
    expect(byId(items, 'co:topic')!.labelParts).toContainEqual({
      chip: 'topic',
      kind: 'branch',
      head: false,
      colorVar: '--lane-3',
    })
    expect(byId(items, 'revert')!.disabled).toBe(true)
  })
})

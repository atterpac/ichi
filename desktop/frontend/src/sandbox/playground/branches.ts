/**
 * Shared mock data + row builders for the branch-page design exploration.
 * One realistic repo's worth of branches: fresh work, drifted features,
 * merged leftovers, dead spikes, and remote-only refs — enough variety that
 * every design has something to show off.
 */
import type { GraphRow, GraphSettings } from './graph'

/** fixed render settings for the mock graphs (matches app defaults, rounded bends) */
export const DEFAULT_GRAPH: GraphSettings = {
  canvas: 'classic',
  bend: 'rounded',
  collision: 'cross',
  glyph: 'semantic',
  density: 'comfortable',
}

export interface Branch {
  name: string
  tip: string
  subject: string
  author: string
  /** relative age label */
  age: string
  /** 0 = fresh, 1 = dead */
  ageScore: number
  ahead: number
  behind: number
  upstream: 'tracking' | 'gone' | 'none' | 'remote-only'
  merged: boolean
  current?: boolean
}

export const BRANCHES: Branch[] = [
  { name: 'main', tip: '9a1a579', subject: 'Restore graph focus after a command-opened modal', author: 'atterpac', age: '2d', ageScore: 0.1, ahead: 0, behind: 0, upstream: 'tracking', merged: false },
  { name: 'atterpac/gui', tip: '2aa2b1c', subject: 'desktop: graph canvas styles', author: 'atterpac', age: '2h', ageScore: 0.02, ahead: 6, behind: 0, upstream: 'tracking', merged: false, current: true },
  { name: 'fix/detail-panel-focus', tip: 'c41d9e2', subject: 'fix: return focus to graph row on close', author: 'atterpac', age: '5h', ageScore: 0.04, ahead: 1, behind: 0, upstream: 'tracking', merged: false },
  { name: 'feature/blame-heat', tip: '7f20b11', subject: 'blame: age-tinted line gutter', author: 'atterpac', age: '12h', ageScore: 0.06, ahead: 5, behind: 3, upstream: 'tracking', merged: false },
  { name: 'feature/graph-settings', tip: 'e88c4a0', subject: 'graph: collision style previews', author: 'atterpac', age: '1d', ageScore: 0.08, ahead: 4, behind: 2, upstream: 'tracking', merged: false },
  { name: 'feature/onboarding', tip: '51b7d93', subject: 'onboarding: git-tree progress rail', author: 'atterpac', age: '3d', ageScore: 0.12, ahead: 9, behind: 5, upstream: 'none', merged: false },
  { name: 'feature/keychords', tip: 'a9e3f77', subject: 'keys: chord timeout setting', author: 'atterpac', age: '4d', ageScore: 0.15, ahead: 3, behind: 1, upstream: 'tracking', merged: false },
  { name: 'atterpac/optimizations', tip: '6261595', subject: 'perf: batch row layout passes', author: 'atterpac', age: '1w', ageScore: 0.25, ahead: 0, behind: 0, upstream: 'tracking', merged: true },
  { name: 'fix/toast-overlap', tip: 'b3d08c5', subject: 'fix: stack toasts above detail panel', author: 'atterpac', age: '2w', ageScore: 0.35, ahead: 2, behind: 7, upstream: 'gone', merged: false },
  { name: 'chore/deps-june', tip: '04f7a2e', subject: 'chore: bump vite + wails', author: 'atterpac', age: '3w', ageScore: 0.42, ahead: 1, behind: 12, upstream: 'tracking', merged: false },
  { name: 'feature/theme-port', tip: 'dd10c48', subject: 'theme: port dado palettes', author: 'atterpac', age: '4w', ageScore: 0.5, ahead: 0, behind: 0, upstream: 'gone', merged: true },
  { name: 'fix/rebase-abort', tip: '3c9e1b0', subject: 'fix: surface abort on failed rebase', author: 'atterpac', age: '6w', ageScore: 0.58, ahead: 0, behind: 0, upstream: 'gone', merged: true },
  { name: 'spike/gpu-graph', tip: 'f0a2d67', subject: 'spike: webgpu graph renderer', author: 'atterpac', age: '5mo', ageScore: 0.85, ahead: 2, behind: 41, upstream: 'none', merged: false },
  { name: 'spike/wasm-diff', tip: '88e01c3', subject: 'spike: wasm myers diff', author: 'atterpac', age: '8mo', ageScore: 0.95, ahead: 14, behind: 63, upstream: 'none', merged: false },
  { name: 'release/v0.4', tip: '1e6b8d4', subject: 'release: v0.4.0', author: 'atterpac', age: '2w', ageScore: 0.35, ahead: 0, behind: 9, upstream: 'remote-only', merged: false },
  { name: 'feature/pr-view', tip: '9d47e0a', subject: 'prs: checks + review state', author: 'galaxy-bot', age: '6d', ageScore: 0.2, ahead: 7, behind: 4, upstream: 'remote-only', merged: false },
]

export type BranchState = 'active' | 'ahead' | 'merged' | 'stale' | 'remote-only'

export function stateOf(branch: Branch): BranchState {
  if (branch.current || branch.name === 'main') return 'active'
  if (branch.upstream === 'remote-only') return 'remote-only'
  if (branch.merged) return 'merged'
  if (branch.ageScore >= 0.7) return 'stale'
  if (branch.ahead > 0) return 'ahead'
  return 'active'
}

export const STATE_LABELS: Record<BranchState, string> = {
  active: 'Active',
  ahead: 'In flight',
  merged: 'Merged — safe to delete',
  stale: 'Stale',
  'remote-only': 'Remote only',
}

/** `feature/foo` → { group: 'feature', rest: 'foo' }; bare names get group '·' */
export function splitName(name: string): { group: string; rest: string } {
  const slash = name.indexOf('/')
  if (slash < 0) return { group: '·', rest: name }
  return { group: name.slice(0, slash), rest: name.slice(slash + 1) }
}

/* ------------------------------------------------- topology skeleton */

export interface TopologyLabel {
  branch: Branch
}

export interface Topology {
  rows: GraphRow[]
  labels: TopologyLabel[]
  cols: number
}

/**
 * Subway-map skeleton: main is the trunk in column 0, every other branch is
 * one row — a fork node on the trunk, an arm whose length scales with how
 * far ahead the branch is, and a tip glyph (diamond = merged, big = HEAD).
 */
export function buildTopology(branches: Branch[]): Topology {
  const main = branches.find((b) => b.name === 'main')
  const rest = branches
    .filter((b) => b.name !== 'main')
    .sort((a, b) => a.ageScore - b.ageScore)

  const rows: GraphRow[] = []
  const labels: TopologyLabel[] = []
  let maxCol = 2

  if (main) {
    rows.push([{ c: 0, kind: 'node', color: 0, cb: true }])
    labels.push({ branch: main })
  }

  rest.forEach((branch, i) => {
    const armLen = 1 + Math.min(3, Math.ceil(branch.ahead / 5))
    const tipCol = armLen + 1
    maxCol = Math.max(maxCol, tipCol)
    const color = 1 + (i % 4)
    const isLast = i === rest.length - 1

    const cells: GraphRow = [{ c: 0, kind: 'node', color: 0, ct: true, cb: !isLast }]
    for (let arm = 1; arm <= armLen; arm++) {
      cells.push({ c: arm, kind: 'horizontal', color })
    }
    cells.push({
      c: tipCol,
      kind: branch.current ? 'head-node' : branch.merged ? 'merge-node' : 'node',
      color,
    })
    rows.push(cells)
    labels.push({ branch })
  })

  return { rows, labels, cols: maxCol + 1 }
}

/* ------------------------------------------------- detail strip */

export interface DetailLabel {
  msg: string
  sha?: string
  kind: 'main' | 'tip' | 'work' | 'fork' | 'base'
}

export function buildDetail(branch: Branch): { rows: GraphRow[]; labels: DetailLabel[] } {
  const rows: GraphRow[] = []
  const labels: DetailLabel[] = []

  rows.push([{ c: 0, kind: 'node', color: 0, cb: true }])
  labels.push({
    msg: branch.behind > 0 ? `main — ${branch.behind} newer commit${branch.behind === 1 ? '' : 's'}` : 'main — even with fork',
    kind: 'main',
  })

  const work = Math.max(1, Math.min(branch.ahead, 4))
  for (let i = 0; i < work; i++) {
    rows.push([
      { c: 0, kind: 'vertical', color: 0 },
      { c: 2, kind: i === 0 && branch.current ? 'head-node' : 'node', color: 1, ct: i > 0, cb: true },
    ])
    if (i === 0) {
      labels.push({ msg: branch.subject, sha: branch.tip, kind: 'tip' })
    } else if (i === work - 1 && branch.ahead > work) {
      labels.push({ msg: `… ${branch.ahead - work + 1} earlier commits`, kind: 'work' })
    } else {
      labels.push({ msg: `${splitName(branch.name).rest}: incremental work`, kind: 'work' })
    }
  }

  rows.push([
    { c: 0, kind: 'node', color: 0, ct: true, cb: true },
    { c: 1, kind: 'horizontal', color: 1 },
    { c: 2, kind: 'bot-right', color: 1 },
  ])
  labels.push({ msg: 'fork point', kind: 'fork' })

  rows.push([{ c: 0, kind: 'node', color: 0, ct: true }])
  labels.push({ msg: 'main history', kind: 'base' })

  return { rows, labels }
}

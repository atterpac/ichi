// Builds the branch / reset / ref action rows for a commit's context menu.
// Extracted from GraphView so the action model is unit-testable and shared by
// the right-click menu and the `r` keybind — both open the same ContextMenu.
import {
  PhCheck,
  PhCherries,
  PhClockCounterClockwise,
  PhGitBranch,
  PhGitMerge,
  PhTag,
  PhTrash,
} from '@phosphor-icons/vue'
import type { ContextMenuItem, MenuChip } from '../overlays/ContextMenu.vue'
import type { OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
import { RefService } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import type { Commit, RefDecoration } from '../../bindings/github.com/atterpac/ichi/internal/git'

export interface RefMenuDeps {
  currentBranch: string
  laneColorForRef?: (name: string) => string | undefined
  /** wraps a git call: run it, reload the graph, toast (GraphView.runRef). */
  run: (fn: () => Promise<void>) => void
  /** opens the shared confirm modal (GraphView.openOperation). */
  confirm: (req: OperationConfirmRequest) => void
}

const shortRemote = (name: string) => {
  const i = name.indexOf('/')
  return i >= 0 ? name.slice(i + 1) : name
}

// Deterministic per-name chip colour: local branches get a stable, varied hue
// from the name (independent of the graph lane, so we don't collapse many
// branches onto the same colour). Different names may still collide after five.
const BRANCH_CHIP_VARS = ['--lane-0', '--lane-1', '--lane-2', '--lane-3', '--lane-4']
function branchColorVar(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return BRANCH_CHIP_VARS[Math.abs(h) % BRANCH_CHIP_VARS.length]!
}

/**
 * Actionable rows for a commit: commit-scoped verbs (branch here, reset,
 * cherry-pick) always appear so they work on any commit; per-branch verbs
 * (merge, rebase, delete) are appended for each local branch sitting on it.
 */
export function commitRefActions(commit: Commit, deps: RefMenuDeps): ContextMenuItem[] {
  const cur = deps.currentBranch || 'HEAD'
  // Prefer the visible graph lane; refs outside that window retain a stable fallback.
  const chip = (d: RefDecoration, text = d.Name): MenuChip => ({
    chip: text,
    kind: d.Kind as MenuChip['kind'],
    head: d.IsHead,
    ...(d.Kind !== 'tag' && deps.laneColorForRef?.(d.Name)
      ? { colorVar: deps.laneColorForRef(d.Name) }
      : d.Kind === 'branch' && !d.IsHead
        ? { colorVar: branchColorVar(d.Name) }
        : {}),
  })
  // The current branch is itself a target in merge/rebase/reset/cherry-pick —
  // shown as an accent chip (or a HEAD chip when detached).
  const curChip: MenuChip = deps.currentBranch
    ? {
        chip: deps.currentBranch,
        kind: 'branch',
        head: true,
        colorVar: deps.laneColorForRef?.(deps.currentBranch),
      }
    : { chip: 'HEAD', kind: 'head' }
  const decorations = commit.Decorations ?? []
  const isCurrent = (d: RefDecoration) =>
    d.Kind === 'branch' && (d.IsHead || d.Name === deps.currentBranch)

  const items: ContextMenuItem[] = [
    {
      id: 'checkout-detached',
      label: 'Checkout commit (detached)',
      shortcut: 'o',
      icon: PhCheck,
      action: () => deps.run(() => RefService.Checkout(commit.Hash)),
    },
    {
      id: 'branch-here',
      label: 'Create branch here…',
      shortcut: 'n',
      icon: PhGitBranch,
      action: () =>
        deps.confirm({
          title: 'New branch',
          message: `Create a branch at ${commit.ShortHash} and check it out.`,
          confirmLabel: 'Create',
          target: `${commit.ShortHash} ${commit.Message}`,
          icon: PhGitBranch,
          inputs: [
            {
              id: 'name',
              label: 'Branch name',
              placeholder: 'feature/…',
              required: true,
              pattern: '^[^\\s]+$',
            },
          ],
          onConfirm: ({ name }) =>
            deps.run(async () => {
              await RefService.CreateBranchAt(name!.trim(), commit.Hash)
              await RefService.CheckoutBranch(name!.trim(), false)
            }),
        }),
    },
    {
      id: 'cherry-pick',
      label: `Cherry-pick onto ${cur}`,
      labelParts: ['Cherry-pick onto ', curChip],
      shortcut: 'p',
      icon: PhCherries,
      action: () =>
        deps.confirm({
          title: 'Cherry-pick',
          message: `Apply ${commit.ShortHash} on top of ${cur}.`,
          confirmLabel: 'Cherry-pick',
          target: `${commit.ShortHash} ${commit.Message}`,
          tone: 'warning',
          icon: PhCherries,
          onConfirm: () => deps.run(() => RefService.CherryPick(commit.Hash)),
        }),
    },
    {
      id: 'revert',
      label: commit.IsMerge ? 'Revert merge (requires mainline)' : 'Revert commit…',
      disabled: commit.IsMerge,
      icon: PhClockCounterClockwise,
      action: () =>
        deps.confirm({
          title: 'Revert commit?',
          message: `Create a new commit that undoes ${commit.ShortHash}.`,
          confirmLabel: 'Revert',
          target: `${commit.ShortHash} ${commit.Message}`,
          tone: 'warning',
          onConfirm: () => deps.run(() => RefService.Revert(commit.Hash)),
        }),
    },
    {
      id: 'tag-here',
      label: 'Create tag…',
      icon: PhTag,
      action: () =>
        deps.confirm({
          title: 'New tag',
          message: `Create a lightweight tag at ${commit.ShortHash}.`,
          confirmLabel: 'Create tag',
          target: `${commit.ShortHash} ${commit.Message}`,
          icon: PhTag,
          inputs: [
            {
              id: 'name',
              label: 'Tag name',
              placeholder: 'v1.0.0',
              required: true,
              pattern: '^[^\\s]+$',
            },
          ],
          onConfirm: ({ name }) =>
            deps.run(() => RefService.CreateTag(name!.trim(), commit.Hash, '')),
        }),
    },
    { separator: true },
    {
      id: 'reset-soft',
      label: `Reset ${cur} here · soft`,
      labelParts: ['Reset ', curChip, ' here · soft'],
      shortcut: 's',
      icon: PhClockCounterClockwise,
      action: () => deps.run(() => RefService.ResetSoft(commit.Hash)),
    },
    {
      id: 'reset-mixed',
      label: `Reset ${cur} here · mixed`,
      labelParts: ['Reset ', curChip, ' here · mixed'],
      shortcut: 'i',
      icon: PhClockCounterClockwise,
      action: () => deps.run(() => RefService.ResetMixed(commit.Hash)),
    },
    {
      id: 'reset-hard',
      label: `Reset ${cur} here · hard`,
      labelParts: ['Reset ', curChip, ' here · hard'],
      shortcut: 'H',
      icon: PhClockCounterClockwise,
      danger: true,
      action: () =>
        deps.confirm({
          title: 'Hard reset',
          message: `Move ${cur} to ${commit.ShortHash} and discard all uncommitted changes. This cannot be undone.`,
          confirmLabel: 'Hard reset',
          target: `${commit.ShortHash} ${commit.Message}`,
          tone: 'danger',
          onConfirm: () => deps.run(() => RefService.ResetHard(commit.Hash)),
        }),
    },
  ]

  // Per-ref verbs for each branch / remote sitting on this commit.
  for (const d of decorations) {
    if (d.Kind === 'remote') {
      const name = shortRemote(d.Name)
      items.push(
        { separator: true },
        {
          id: `co-remote:${d.Name}`,
          label: `Checkout ${name}`,
          labelParts: ['Checkout ', chip(d, name)],
          icon: PhCheck,
          action: () => deps.run(() => RefService.CheckoutBranch(name, false)),
        },
      )
      continue
    }
    if (d.Kind !== 'branch' || isCurrent(d)) continue
    items.push(
      { separator: true },
      {
        id: `co:${d.Name}`,
        label: `Checkout ${d.Name}`,
        labelParts: ['Checkout ', chip(d)],
        icon: PhCheck,
        action: () => deps.run(() => RefService.CheckoutBranch(d.Name, false)),
      },
      {
        id: `merge:${d.Name}`,
        label: `Merge ${d.Name} into ${cur}`,
        labelParts: ['Merge ', chip(d), ' into ', curChip],
        icon: PhGitMerge,
        action: () =>
          deps.confirm({
            title: 'Merge branch',
            message: `Merge ${d.Name} into ${cur}.`,
            confirmLabel: 'Merge',
            target: `${d.Name} → ${cur}`,
            tone: 'warning',
            icon: PhGitMerge,
            onConfirm: () => deps.run(() => RefService.MergeBranch(d.Name)),
          }),
      },
      {
        id: `rebase:${d.Name}`,
        label: `Rebase ${cur} onto ${d.Name}`,
        labelParts: ['Rebase ', curChip, ' onto ', chip(d)],
        icon: PhGitMerge,
        action: () =>
          deps.confirm({
            title: 'Rebase branch',
            message: `Rebase ${cur} onto ${d.Name}.`,
            confirmLabel: 'Rebase',
            target: `${cur} → ${d.Name}`,
            tone: 'warning',
            onConfirm: () => deps.run(() => RefService.RebaseBranch(d.Name)),
          }),
      },
      {
        id: `del:${d.Name}`,
        label: `Delete ${d.Name}`,
        labelParts: ['Delete ', chip(d)],
        icon: PhTrash,
        danger: true,
        action: () =>
          deps.confirm({
            title: 'Delete branch',
            message: `Delete local branch ${d.Name}.`,
            confirmLabel: 'Delete',
            target: d.Name,
            tone: 'danger',
            onConfirm: () => deps.run(() => RefService.DeleteBranch(d.Name, false)),
          }),
      },
    )
  }

  return items
}

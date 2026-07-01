/**
 * Git operation catalog — drives every modal design in the playground.
 * Each op is one confirm/deny prompt the client might raise.
 */
export type Tone = 'normal' | 'caution' | 'danger'

export interface Op {
  id: string
  verb: string // action word for the confirm button, e.g. "Cherry-pick"
  title: string // headline question
  summary: string // one-line plain-language description
  tone: Tone
  target: string // the thing acted on (branch / commit / etc.)
  command: string // the literal git command that will run
  meta: { label: string; value: string }[] // context rows
  confirmLabel: string
  cancelLabel: string
}

export const OPS: Record<string, Op> = {
  cherry: {
    id: 'cherry',
    verb: 'Cherry-pick',
    title: 'Cherry-pick commit onto this branch?',
    summary: 'Apply the changes from a single commit onto atterpac/gui.',
    tone: 'normal',
    target: '9a1a579',
    command: 'git cherry-pick 9a1a579',
    meta: [
      { label: 'Commit', value: '9a1a579 Restore graph focus' },
      { label: 'Onto', value: 'atterpac/gui' },
      { label: 'Author', value: 'atterpac' },
      { label: 'Files', value: '2 changed · +18 −4' },
    ],
    confirmLabel: 'Cherry-pick',
    cancelLabel: 'Cancel',
  },
  merge: {
    id: 'merge',
    verb: 'Merge',
    title: 'Merge feature/graph into main?',
    summary: 'Combine feature/graph into main with a merge commit.',
    tone: 'normal',
    target: 'feature/graph',
    command: 'git merge --no-ff feature/graph',
    meta: [
      { label: 'Source', value: 'feature/graph' },
      { label: 'Into', value: 'main' },
      { label: 'Ahead', value: '12 commits' },
      { label: 'Conflicts', value: 'none detected' },
    ],
    confirmLabel: 'Merge',
    cancelLabel: 'Cancel',
  },
  rebase: {
    id: 'rebase',
    verb: 'Rebase',
    title: 'Rebase atterpac/gui onto main?',
    summary: 'Replay 12 commits on top of main. History will be rewritten.',
    tone: 'caution',
    target: 'main',
    command: 'git rebase main',
    meta: [
      { label: 'Branch', value: 'atterpac/gui' },
      { label: 'Onto', value: 'main' },
      { label: 'Replays', value: '12 commits' },
      { label: 'Rewrites', value: 'local history' },
    ],
    confirmLabel: 'Rebase',
    cancelLabel: 'Cancel',
  },
  discard: {
    id: 'discard',
    verb: 'Discard',
    title: 'Discard all local changes?',
    summary: 'Permanently drop uncommitted edits in 4 files. Cannot be undone.',
    tone: 'danger',
    target: '4 files',
    command: 'git checkout -- .',
    meta: [
      { label: 'Files', value: '4 modified · 1 deleted' },
      { label: 'Lines', value: '−212 will be lost' },
      { label: 'Recoverable', value: 'no' },
    ],
    confirmLabel: 'Discard changes',
    cancelLabel: 'Keep',
  },
  forcepush: {
    id: 'forcepush',
    verb: 'Force-push',
    title: 'Force-push to origin/atterpac/gui?',
    summary: 'Overwrite the remote branch with your local history.',
    tone: 'danger',
    target: 'origin/atterpac/gui',
    command: 'git push --force-with-lease origin atterpac/gui',
    meta: [
      { label: 'Remote', value: 'origin/atterpac/gui' },
      { label: 'Overwrites', value: '3 remote commits' },
      { label: 'Affects', value: 'anyone tracking' },
    ],
    confirmLabel: 'Force-push',
    cancelLabel: 'Cancel',
  },
  deletebranch: {
    id: 'deletebranch',
    verb: 'Delete',
    title: 'Delete branch feature/old-graph?',
    summary: 'Remove the local branch. Unmerged commits may be lost.',
    tone: 'danger',
    target: 'feature/old-graph',
    command: 'git branch -D feature/old-graph',
    meta: [
      { label: 'Branch', value: 'feature/old-graph' },
      { label: 'Unmerged', value: '5 commits' },
      { label: 'Recoverable', value: 'reflog only' },
    ],
    confirmLabel: 'Delete branch',
    cancelLabel: 'Cancel',
  },
}

export const OP_IDS = Object.keys(OPS)

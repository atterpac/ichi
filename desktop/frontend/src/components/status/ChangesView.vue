<script setup lang="ts">
import UiInput from '../common/UiInput.vue'
import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'
import { type Component, computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import DiffView from '../diff/DiffView.vue'
import SurfaceState from '../common/SurfaceState.vue'
import { isEditable, isModified } from '../../composables/keyboard'
import UiButton from '../common/UiButton.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../overlays/OperationConfirmModal.vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { notify } from '../../composables/useToasts'
import { useVimList } from '../../composables/useVimList'
import {
  DiffService,
  GraphService,
  InspectService,
  RepoService,
  WorktreeService,
  type RepoInfo,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import {
  FileStatus,
  LineType,
  type DiffHunk,
  type DiffLine,
  type FileDiff,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'
import { PhCaretRight, PhGitCommit, PhMinus, PhPlus, PhTreeStructure, PhPencilSimple, PhArrowRight, PhCopy, PhWarning } from '@phosphor-icons/vue'

const props = defineProps<{
  focusCommit?: boolean
  /** row key (`c:`/`s:`/`u:` + path) to land the cursor on */
  focusKey?: string
}>()

const emit = defineEmits<{
  navigate: [view: string, focus?: string]
}>()

type ChangeRow = {
  key: string
  path: string
  oldPath: string
  name: string
  dir: string
  staged: boolean
  untracked: boolean
  conflict: boolean
  label: string
}

const loading = ref(true)
const error = ref('')
const entries = ref<StatusEntry[]>([])
const repo = ref<RepoInfo | null>(null)
const settings = useShellSettings()
const pendingOperation = ref<OperationConfirmRequest | null>(null)

function statusLabel(status: FileStatus) {
  switch (status) {
    case FileStatus.FileAdded:
      return 'A'
    case FileStatus.FileDeleted:
      return 'D'
    case FileStatus.FileRenamed:
      return 'R'
    case FileStatus.FileCopied:
      return 'C'
    case FileStatus.FileConflict:
      return '!'
    case FileStatus.FileModified:
    default:
      return 'M'
  }
}

function toRow(entry: StatusEntry, staged: boolean, conflict = false): ChangeRow {
  const name = entry.Path.split('/').pop() ?? entry.Path
  return {
    key: `${conflict ? 'c' : staged ? 's' : 'u'}:${entry.Path}`,
    path: entry.Path,
    oldPath: entry.OldPath,
    name,
    dir: entry.Path.slice(0, entry.Path.length - name.length).replace(/\/$/, ''),
    staged,
    untracked: entry.IsUntracked,
    conflict,
    label: conflict
      ? '!'
      : staged
        ? statusLabel(entry.IndexStatus)
        : entry.IsUntracked
          ? '?'
          : statusLabel(entry.WorkStatus),
  }
}

const conflictRows = computed(() =>
  entries.value.filter((e) => e.IsConflict).map((e) => toRow(e, false, true)),
)
const unstagedRows = computed(() =>
  entries.value
    .filter((e) => !e.IsConflict && (e.IsUntracked || e.WorkStatus !== FileStatus.FileUnchanged))
    .map((e) => toRow(e, false)),
)
const stagedRows = computed(() =>
  entries.value
    .filter((e) => !e.IsConflict && !e.IsUntracked && e.IndexStatus !== FileStatus.FileUnchanged)
    .map((e) => toRow(e, true)),
)
const allRowCount = computed(
  () => conflictRows.value.length + unstagedRows.value.length + stagedRows.value.length,
)

/* ---- list view-model: sections → optional dir groups → visible rows ----
   The vim cursor runs over exactly the rows the template renders, so
   collapse state and grouping are resolved here, in render order. */

type SectionId = 'conflicts' | 'unstaged' | 'staged'
type FileItem = { row: ChangeRow; index: number }
type TreeItem =
  | { kind: 'dir'; dir: string; label: string; key: string; collapsed: boolean; count: number; depth: number; parentKey: string }
  | (FileItem & { kind: 'file'; key: string; depth: number; parentKey: string })
type DirectoryNode = { path: string; name: string; children: Map<string, DirectoryNode>; files: ChangeRow[]; count: number }
type SectionVM = {
  id: SectionId
  label: string
  count: number
  collapsed: boolean
  bulk: 'stage' | 'unstage' | null
  groups: TreeItem[] | null
  flat: FileItem[] | null
}

const collapsedSections = ref<Set<SectionId>>(new Set())
const collapsedDirs = ref<Set<string>>(new Set())
const treeCursorKey = ref<string | null>(null)

const groupingActive = computed(() => {
  if (settings.changesGroupByDir === 'always') return true
  if (settings.changesGroupByDir === 'never') return false
  return allRowCount.value > 15
})

/** flip tree ⇄ flat; resolves 'auto' to an explicit choice */
function toggleGrouping() {
  treeCursorKey.value = null
  settings.changesGroupByDir = groupingActive.value ? 'never' : 'always'
}

const listModel = computed(() => {
  const sections: SectionVM[] = []
  const visible: ChangeRow[] = []

  const buildSection = (
    id: SectionId,
    label: string,
    sectionRows: ChangeRow[],
    bulk: SectionVM['bulk'],
  ) => {
    if (!sectionRows.length && id === 'conflicts') return
    const collapsed = collapsedSections.value.has(id)
    const vm: SectionVM = {
      id,
      label,
      count: sectionRows.length,
      collapsed,
      bulk,
      groups: null,
      flat: null,
    }
    if (!collapsed) {
      if (groupingActive.value && id !== 'conflicts') {
        const root: DirectoryNode = { path: '', name: '.', children: new Map(), files: [], count: 0 }
        for (const row of sectionRows) {
          let node = root
          node.count++
          for (const name of row.dir.split('/').filter(Boolean)) {
            if (!node.children.has(name)) node.children.set(name, {
              path: node.path ? `${node.path}/${name}` : name,
              name, children: new Map(), files: [], count: 0,
            })
            node = node.children.get(name)!
            node.count++
          }
          node.files.push(row)
        }
        const tree: TreeItem[] = []
        const appendDirectory = (initial: DirectoryNode, depth: number, parentKey: string) => {
          let node = initial
          let label = node.name
          // Compact directory-only chains without hiding a branch or direct file.
          while (!node.files.length && node.children.size === 1) {
            node = [...node.children.values()][0]!
            label += `/${node.name}`
          }
          const dir = node.path || '.'
          const key = `${id}:${dir}`
          const collapsed = collapsedDirs.value.has(key)
          tree.push({ kind: 'dir', dir, label, key, collapsed, count: node.count, depth, parentKey })
          if (collapsed) return
          for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
            appendDirectory(child, depth + 1, `dir:${key}`)
          }
          for (const row of [...node.files].sort((a, b) => a.name.localeCompare(b.name))) {
            tree.push({ kind: 'file', row, index: visible.length, key: row.key, depth: depth + 1, parentKey: `dir:${key}` })
            visible.push(row)
          }
        }
        for (const child of [...root.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
          appendDirectory(child, 0, `section:${id}`)
        }
        // Repository-root files follow every directory, in their own fold.
        if (root.files.length) appendDirectory({ ...root, children: new Map(), count: root.files.length }, 0, `section:${id}`)
        vm.groups = tree
      } else {
        vm.flat = sectionRows.map((row) => {
          const item = { row, index: visible.length }
          visible.push(row)
          return item
        })
      }
    }
    sections.push(vm)
  }

  buildSection('conflicts', 'Conflicts', conflictRows.value, null)
  buildSection('unstaged', 'Unstaged', unstagedRows.value, 'stage')
  buildSection('staged', 'Staged', stagedRows.value, 'unstage')
  return { sections, visible }
})

const rows = computed(() => listModel.value.visible)
const currentRow = computed<ChangeRow | undefined>(() => rows.value[vim.cursor.value])
const conflictSection = computed(
  () => listModel.value.sections.find((section) => section.id === 'conflicts') ?? null,
)
const splitSections = computed(() =>
  (['unstaged', 'staged'] as const)
    .map((id) => listModel.value.sections.find((section) => section.id === id))
    .filter((section): section is SectionVM => !!section),
)

function toggleSection(id: SectionId) {
  if (groupingActive.value) { treeCursorKey.value = `section:${id}`; vim.mode.value = 'normal' }
  const next = new Set(collapsedSections.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedSections.value = next
}

function toggleDir(key: string) {
  treeCursorKey.value = `dir:${key}`
  vim.mode.value = 'normal'
  const next = new Set(collapsedDirs.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedDirs.value = next
}

/* per-file +/− deltas straight from the already-loaded diff maps */
const deltas = computed(() => {
  const out = new Map<string, { ins: number; del: number }>()
  const tally = (map: Map<string, FileDiff>, prefix: string) => {
    for (const [path, diff] of map) {
      let ins = 0
      let del = 0
      for (const hunk of diff.Hunks) {
        for (const line of hunk?.Lines ?? []) {
          if (line?.Type === LineType.LineAdded) ins++
          else if (line?.Type === LineType.LineRemoved) del++
        }
      }
      out.set(`${prefix}:${path}`, { ins, del })
    }
  }
  tally(workingDiffs.value, 'u')
  tally(stagedDiffs.value, 's')
  return out
})

function isBinaryRow(row: ChangeRow) {
  return (row.staged ? stagedDiffs.value : workingDiffs.value).get(row.path)?.Binary ?? false
}

function deltaFor(row: ChangeRow) {
  if (row.conflict || row.untracked || isBinaryRow(row)) return null
  return deltas.value.get(`${row.staged ? 's' : 'u'}:${row.path}`) ?? null
}

const STATUS_ICONS: Record<string, { icon: Component; label: string }> = {
  M: { icon: PhPencilSimple, label: 'Modified' },
  A: { icon: PhPlus, label: 'Added' },
  D: { icon: PhMinus, label: 'Deleted' },
  R: { icon: PhArrowRight, label: 'Renamed' },
  C: { icon: PhCopy, label: 'Copied' },
  '?': { icon: PhPlus, label: 'Untracked' },
  '!': { icon: PhWarning, label: 'Conflict' },
}
function statusIcon(label: string) { return STATUS_ICONS[label] ?? STATUS_ICONS.M! }

/** Per-status tone consumed by the status icons via --status-color. */
const STATUS_COLORS: Record<string, string> = {
  M: 'var(--orange)',
  A: 'var(--green)',
  D: 'var(--red)',
  R: 'var(--purple)',
  C: 'var(--cyan)',
  '?': 'var(--text-mut)',
  '!': 'var(--red)',
}

function statusColor(label: string) {
  return STATUS_COLORS[label] ?? 'var(--accent)'
}

async function loadStatus() {
  try {
    const [status, info] = await Promise.all([
      WorktreeService.Status(),
      RepoService.Info(),
      loadDiffMaps(),
    ])
    entries.value = status ?? []
    repo.value = info
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

/** reload status, keeping the cursor on the same row when it still exists */
async function refresh(preferKey?: string) {
  const key = preferKey ?? currentRow.value?.key
  const previousTreeKey = treeCursorKey.value
  const previous = rows.value.slice()
  const oldIndex = previous.findIndex(row => row.key === key)
  const oldRow = previous[oldIndex]
  const candidates = oldRow ? [...previous.slice(oldIndex + 1), ...previous.slice(0, oldIndex).reverse()]
    .filter(row => row.staged === oldRow.staged && row.conflict === oldRow.conflict).map(row => row.key) : []
  const listHadFocus = !!listEl.value?.contains(document.activeElement)
  await loadStatus()
  if (groupingActive.value && treeScope(previousTreeKey)) return
  const remainingKey = [key, ...candidates].find(candidate => rows.value.some(row => row.key === candidate))
  if (remainingKey) {
    vim.moveTo(rows.value.findIndex(row => row.key === remainingKey))
    if (groupingActive.value) treeCursorKey.value = remainingKey
  } else if (groupingActive.value && oldRow) {
    treeCursorKey.value = `section:${oldRow.conflict ? 'conflicts' : oldRow.staged ? 'staged' : 'unstaged'}`
  }
  if (listHadFocus) {
    await nextTick()
    const selected = [...(listEl.value?.querySelectorAll<HTMLElement>('[data-tree-key]') ?? [])].find(item => item.dataset.treeKey === treeCursorKey.value)
    if (groupingActive.value && selected) selected.focus({ preventScroll: true })
    else listEl.value?.focus({ preventScroll: true })
  }
}

// ---- staging actions --------------------------------------------------

const runningOperations = ref(0)
async function run(op: () => Promise<void>, preferKey?: string) {
  runningOperations.value++
  try {
    await op()
  } catch (err) {
    notify({
      tone: 'danger',
      title: 'Operation failed',
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    try { await refresh(preferKey) } finally { runningOperations.value-- }
  }
}

function stageRow(row: ChangeRow) {
  if (row.staged || row.conflict) return
  void run(async () => {
    await WorktreeService.StageFile(row.path)
  })
}

function unstageRow(row: ChangeRow) {
  if (!row.staged || row.conflict) return
  void run(async () => {
    await WorktreeService.UnstageFile(row.path)
  })
}

function toggleRow(row: ChangeRow) {
  if (row.conflict) return
  if (row.staged) unstageRow(row)
  else stageRow(row)
}

function stageRows(targets: ChangeRow[]) {
  const unstaged = targets.filter((row) => !row.staged && !row.conflict)
  if (!unstaged.length) {
    targets.forEach(unstageRow)
    return
  }
  void run(async () => {
    for (const row of unstaged) await WorktreeService.StageFile(row.path)
  })
}

function discardRow(row: ChangeRow) {
  if (row.staged || row.conflict) return
  const doDiscard = () =>
    run(async () => {
      await WorktreeService.DiscardFileChanges(row.path)
    })
  if (!settings.confirmDestructiveActions) {
    void doDiscard()
    return
  }
  pendingOperation.value = {
    title: 'Discard changes?',
    message: row.untracked
      ? 'This untracked file will be deleted from the worktree.'
      : 'Uncommitted changes to this file will be lost. This cannot be undone.',
    confirmLabel: 'Discard',
    target: row.path,
    tone: 'danger',
    onConfirm: doDiscard,
  }
}

// ---- file list navigation ---------------------------------------------

const listEl = ref<HTMLElement | null>(null)
const vim = useVimList(rows, {
  autoListen: false,
  text: (row) => row.path,
  onAction(action, payload) {
    const row = payload.items[0]
    if (action === 'open' && row) {
      if (row.conflict) emit('navigate', 'conflicts', row.path)
      else void focusDiff()
    }
    if (action === 'delete' && row) discardRow(row)
  },
})

const treeActionBusy = ref(false)

function treeScope(key: string | null) {
  const match = /^(section|dir):(conflicts|unstaged|staged)(?::(.*))?$/.exec(key ?? '')
  if (!match) return null
  const section = match[2] as SectionId
  const dir = match[3]
  const source = section === 'conflicts' ? conflictRows.value : section === 'staged' ? stagedRows.value : unstagedRows.value
  const targets = source.filter(row => match[1] === 'section' || dir === '.' || row.path.startsWith(`${dir}/`))
  return { section, dir, targets, path: dir === '.' ? 'Repository root' : dir ?? (section === 'staged' ? 'Staged' : section === 'unstaged' ? 'Unstaged' : 'Conflicts') }
}

const selectedScope = computed(() => groupingActive.value ? treeScope(treeCursorKey.value) : null)
const selectionDetails = computed(() => {
  const scope = selectedScope.value
  const row = currentRow.value
  const targets = scope?.targets ?? (row ? [row] : [])
  const staged = scope ? scope.section === 'staged' : !!row?.staged
  const conflict = scope ? scope.section === 'conflicts' : !!row?.conflict
  const count = targets.length
  return {
    path: scope?.path ?? row?.path ?? 'Select a file or folder',
    count,
    stageLabel: `${staged ? 'Unstage' : 'Stage'} ${scope ? `all ${count} ${count === 1 ? 'file' : 'files'}` : 'file'}`,
    canStage: count > 0 && !conflict && !treeActionBusy.value,
    canDiscard: count > 0 && !staged && !conflict && !treeActionBusy.value,
    hint: scope ? 'h/l collapse/expand' : conflict ? 'Enter resolve conflict' : 'Enter open diff',
  }
})

function selectionAction(action: 's' | 'x') {
  if (selectedScope.value && treeCursorKey.value) actOnTree(treeCursorKey.value, action)
  else if (currentRow.value) {
    if (action === 's') toggleRow(currentRow.value)
    else discardRow(currentRow.value)
  }
}

const totalDelta = computed(() => [...deltas.value.values()].reduce((sum, delta) => ({ ins: sum.ins + delta.ins, del: sum.del + delta.del }), { ins: 0, del: 0 }))

function actOnTree(key: string, action: 's' | 'u' | 'a' | 'x') {
  if (treeActionBusy.value) return
  const scope = treeScope(key)
  if (!scope || scope.section === 'conflicts') return
  const { targets, section } = scope
  const operation = action === 's' ? (section === 'staged' ? 'u' : 'a') : action
  const eligible = targets.filter(row => operation === 'u' ? row.staged : !row.staged)
  if (!eligible.length) return
  const apply = async () => {
    if (treeActionBusy.value) return
    treeActionBusy.value = true
    try {
      await run(async () => {
        for (const row of eligible) {
          if (operation === 'u') await WorktreeService.UnstageFile(row.path)
          else if (operation === 'x') await WorktreeService.DiscardFileChanges(row.path)
          else await WorktreeService.StageFile(row.path)
        }
      })
      await nextTick()
      const items = [...(listEl.value?.querySelectorAll<HTMLElement>('[data-tree-key]') ?? [])]
      const next = items.find(item => item.dataset.treeKey === key)
        ?? items.find(item => item.dataset.treeKey === `section:${section}`)
        ?? items[0]
      treeCursorKey.value = next?.dataset.treeKey ?? null
      if (next) next.focus()
      else listEl.value?.focus()
    } finally { treeActionBusy.value = false }
  }
  if (operation === 'x' && settings.confirmDestructiveActions) {
    const untracked = eligible.filter(row => row.untracked).length
    pendingOperation.value = {
      title: 'Discard folder changes?',
      message: `Discard uncommitted changes in ${eligible.length} files, including collapsed subfolders? This cannot be undone.${untracked ? ` ${untracked} untracked files will be deleted.` : ''}`,
      target: scope.path,
      details: eligible.map(row => ({ label: row.untracked ? 'Delete' : 'Discard', value: row.path })),
      confirmLabel: 'Discard all',
      tone: 'danger',
      onConfirm: apply,
    }
  } else void apply()
}

// Tree containers participate in keyboard navigation alongside file rows.
function handleTreeKey(event: KeyboardEvent): boolean {
  if (!groupingActive.value || !listEl.value) return false
  const items = [...listEl.value.querySelectorAll<HTMLElement>('.section-toggle, .change-dir-row, .change-row')]
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('.section-toggle, .change-dir-row, .change-row') : null
  const current = target ?? items.find(item => item.dataset.treeKey === treeCursorKey.value) ?? items.find(item => item.dataset.fileIndex === String(vim.cursor.value)) ?? items[0]
  if (!current) return false
  const focusItem = (item: HTMLElement | undefined) => {
    if (!item) return
    treeCursorKey.value = item.dataset.treeKey ?? null
    if (item.dataset.fileIndex !== undefined) vim.moveTo(Number(item.dataset.fileIndex))
    item.focus()
    item.scrollIntoView?.({ block: 'nearest' })
  }
  const index = items.indexOf(current)
  const container = current.matches('.section-toggle, .change-dir-row')
  const section = current.closest('.changes-pane')?.querySelector<HTMLElement>('.section-toggle') ?? undefined
  const parent = items.find(item => item.dataset.treeKey === current.dataset.treeParent) ?? section
  switch (event.key) {
    case 's': case 'u': case 'a': case 'x':
      if (!container) return false
      actOnTree(current.dataset.treeKey ?? '', event.key)
      return true
    case 'j': case 'ArrowDown':
    case 'k': case 'ArrowUp':
      if (vim.mode.value !== 'normal') return false
      focusItem(items[Math.max(0, Math.min(items.length - 1, index + (['j', 'ArrowDown'].includes(event.key) ? 1 : -1)))])
      return true
    case 'h': case 'ArrowLeft':
      if (container && current.getAttribute('aria-expanded') === 'true') { current.click(); focusItem(current) }
      else if (parent && parent !== current) {
        if (!container && parent.getAttribute('aria-expanded') === 'true') parent.click()
        focusItem(parent)
      }
      return true
    case 'l': case 'ArrowRight':
      if (container) {
        if (current.getAttribute('aria-expanded') === 'false') current.click()
        else focusItem(items[index + 1])
      }
      return true
    case 'Enter':
      if (container) { current.click(); return true }
      if (current.dataset.fileIndex !== undefined) vim.moveTo(Number(current.dataset.fileIndex))
      return false
    default:
      // File operations must not act on a hidden or unrelated file when a
      // container has focus. Search and view toggles still belong to the list.
      return container && ['d', 'v', 'V', 'y'].includes(event.key)
  }
}

function handleFileListKey(event: KeyboardEvent) {
  const before = vim.cursor.value
  const handled = vim.handleKey(event)
  if (groupingActive.value && vim.cursor.value !== before) {
    treeCursorKey.value = rows.value[vim.cursor.value]?.key ?? null
    listEl.value?.focus()
  }
  return handled
}

function onListKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target)) return
  if (isModified(event)) { if (handleFileListKey(event)) event.preventDefault(); return }
  if (vim.search.active.value) {
    if (handleFileListKey(event)) event.preventDefault()
    return
  }
  if (handleTreeKey(event)) { event.preventDefault(); event.stopPropagation(); return }
  // 'g' belongs to global nav (graph) — let it bubble to the shell instead of
  // feeding vim's gg motion. G still jumps to the bottom of the list.
  if (event.key === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) return

  if (event.key === 'Escape' && vim.mode.value === 'normal') return
  const row = currentRow.value
  switch (event.key) {
    case 's':
      if (vim.mode.value === 'visual' && vim.selection.value) {
        const [lo, hi] = vim.selection.value
        stageRows(rows.value.slice(lo, hi + 1))
        vim.mode.value = 'normal'
      } else if (row) {
        toggleRow(row)
      }
      event.preventDefault()
      return
    case 'u':
      if (row) unstageRow(row)
      event.preventDefault()
      return
    case 'a':
      void run(async () => {
        await WorktreeService.StageAll()
      })
      event.preventDefault()
      return
    case 'x':
      if (row) discardRow(row)
      event.preventDefault()
      return
    case 'c':
      focusCommitBox()
      event.preventDefault()
      return
    case 'l':
    case 'ArrowRight':
      void focusDiff()
      event.preventDefault()
      return
    case 'r':
      void refresh()
      event.preventDefault()
      return
    case 'T':
      toggleGrouping()
      event.preventDefault()
      return
  }
  if (handleFileListKey(event)) event.preventDefault()
}

function scrollToCursor() {
  if (groupingActive.value && treeCursorKey.value) {
    const current = [...(listEl.value?.querySelectorAll<HTMLElement>('[data-tree-key]') ?? [])].find(item => item.dataset.treeKey === treeCursorKey.value)
    if (current) { current.scrollIntoView?.({ block: 'nearest' }); return }
  }
  const items = listEl.value?.querySelectorAll<HTMLElement>('.change-row')
  items?.[vim.cursor.value]?.scrollIntoView?.({ block: 'nearest' })
}

watch(
  () => vim.cursor.value,
  () => void nextTick(scrollToCursor),
)

function selectRow(index: number) {
  treeCursorKey.value = rows.value[index]?.key ?? null
  vim.moveTo(index)
  listEl.value?.focus()
}

function isFileSelected(index: number) {
  if (groupingActive.value && treeCursorKey.value?.match(/^(section|dir):/)) return false
  return vim.isSelected(index)
}

function onTreeFocus(event: FocusEvent) {
  const item = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-tree-key]') : null
  if (groupingActive.value && item) {
    treeCursorKey.value = item.dataset.treeKey ?? null
    if (item.dataset.fileIndex !== undefined) vim.moveTo(Number(item.dataset.fileIndex))
  }
  onFocusList()
}

// ---- diff pane ---------------------------------------------------------

const diffView = ref<InstanceType<typeof DiffView> | null>(null)
const diffLoading = ref(false)
const diffError = ref('')
const untrackedContent = ref<string | null>(null)

/* Perf instrumentation — logs fetch/parse/render timings and payload sizes
   to the webview console. Grep for [ichi:perf]; remove once diff perf is
   settled. */
function perfLog(label: string, data: Record<string, unknown>) {
  console.log('[ichi:perf]', label, data)
}

/** log once the DOM for the current change has actually been painted */
function perfLogAfterRender(label: string, start: number, data: Record<string, unknown>) {
  void nextTick(() => {
    const finish = () =>
      perfLog(label, { ...data, ms: Math.round((performance.now() - start) * 10) / 10 })
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish)
    else finish()
  })
}

/* All working/staged diffs are fetched in two batched git calls on every
   status (re)load and served from these maps — cursor movement never
   touches the backend. Contents are markRaw: diff data is immutable, so
   proxying thousands of line objects is pure overhead. */
const workingDiffs = ref<Map<string, FileDiff>>(new Map())
const stagedDiffs = ref<Map<string, FileDiff>>(new Map())
const untrackedCache = new Map<string, string>()

async function parseDiffMap(raw: string): Promise<Map<string, FileDiff>> {
  const map = new Map<string, FileDiff>()
  if (!raw.trim()) return map
  const parsed = await DiffService.ParseDiff(raw)
  for (const diff of parsed ?? []) {
    if (diff) map.set(diff.Path, markRaw(diff))
  }
  return map
}

function mapLineCount(map: Map<string, FileDiff>) {
  let lines = 0
  for (const diff of map.values()) {
    for (const hunk of diff.Hunks) lines += hunk?.Lines.length ?? 0
  }
  return lines
}

async function loadDiffMaps() {
  const start = performance.now()
  const [workingRaw, stagedRaw] = await Promise.all([
    DiffService.WorkingDiff().catch(() => ''),
    DiffService.StagedDiff().catch(() => ''),
  ])
  const fetched = performance.now()
  const [working, staged] = await Promise.all([parseDiffMap(workingRaw), parseDiffMap(stagedRaw)])
  workingDiffs.value = working
  stagedDiffs.value = staged
  untrackedCache.clear()
  perfLog('batch diff load', {
    fetchMs: Math.round(fetched - start),
    parseMs: Math.round(performance.now() - fetched),
    workingKB: Math.round(workingRaw.length / 1024),
    stagedKB: Math.round(stagedRaw.length / 1024),
    workingFiles: working.size,
    stagedFiles: staged.size,
    workingLines: mapLineCount(working),
    stagedLines: mapLineCount(staged),
  })
}

const fileDiff = computed<FileDiff | null>(() => {
  const row = currentRow.value
  if (!row) return null
  const map = row.staged ? stagedDiffs.value : workingDiffs.value
  return map.get(row.path) ?? null
})

const UNTRACKED_PREVIEW_LINES = 400

/** untracked files render through DiffView as a synthetic all-added diff */
function makeUntrackedDiff(path: string, content: string): FileDiff {
  const all = content.split('\n')
  const lines = all.slice(0, UNTRACKED_PREVIEW_LINES).map((raw, index) => ({
    Type: LineType.LineAdded,
    Content: raw,
    OldLineNo: 0,
    NewLineNo: index + 1,
    Selected: false,
  }))
  if (all.length > UNTRACKED_PREVIEW_LINES) {
    lines.push({
      Type: LineType.LineContext,
      Content: `… preview truncated (${(all.length - UNTRACKED_PREVIEW_LINES).toLocaleString()} more lines)`,
      OldLineNo: 0,
      NewLineNo: 0,
      Selected: false,
    })
  }
  return markRaw({
    Path: path,
    OldPath: '',
    Binary: false,
    NewFile: true,
    Deleted: false,
    Hunks: [
      {
        Header: 'new file',
        OldStart: 0,
        OldCount: 0,
        NewStart: 1,
        NewCount: lines.length,
        Lines: lines,
        Selected: false,
        Expanded: true,
      },
    ],
  } as unknown as FileDiff)
}

const untrackedDiff = computed<FileDiff | null>(() => {
  const row = currentRow.value
  if (!row || untrackedContent.value === null) return null
  return makeUntrackedDiff(row.path, untrackedContent.value)
})

const displayDiff = computed<FileDiff | null>(() => fileDiff.value ?? untrackedDiff.value)
const isUntrackedPreview = computed(() => !fileDiff.value && untrackedDiff.value !== null)

/* Untracked files can't ride the batch diff, so their content loads lazily:
   debounced past held-key traversal, cancellable, and cached per path. */
type CancellableRequest = Promise<string> & { cancel?: () => void }
let untrackedTimer: ReturnType<typeof setTimeout> | undefined
let untrackedInflight: CancellableRequest | null = null

watch(currentRow, (row) => {
  const start = performance.now()
  clearTimeout(untrackedTimer)
  untrackedInflight?.cancel?.()
  untrackedInflight = null
  diffError.value = ''
  untrackedContent.value = null
  diffLoading.value = false
  if (row && fileDiff.value) {
    let totalLines = 0
    let totalChars = 0
    let maxLineChars = 0
    for (const hunk of fileDiff.value.Hunks) {
      for (const line of hunk?.Lines ?? []) {
        if (!line) continue
        totalLines++
        totalChars += line.Content.length
        if (line.Content.length > maxLineChars) maxLineChars = line.Content.length
      }
    }
    perfLogAfterRender('cursor → diff render', start, {
      path: row.path,
      staged: row.staged,
      hunks: fileDiff.value.Hunks.length,
      totalLines,
      totalKB: Math.round(totalChars / 1024),
      maxLineChars,
    })
  }
  if (!row?.untracked || fileDiff.value) return

  const cached = untrackedCache.get(row.path)
  if (cached !== undefined) {
    untrackedContent.value = cached
    return
  }
  diffLoading.value = true
  untrackedTimer = setTimeout(() => {
    const fetchStart = performance.now()
    const request = InspectService.WorkingFileContent(row.path) as CancellableRequest
    untrackedInflight = request
    request
      .then((content) => {
        if (currentRow.value?.key !== row.key) return
        untrackedCache.set(row.path, content)
        untrackedContent.value = content
        diffLoading.value = false
        perfLog('untracked fetch', {
          path: row.path,
          kb: Math.round(content.length / 1024),
          ms: Math.round(performance.now() - fetchStart),
        })
      })
      .catch((err) => {
        if (currentRow.value?.key !== row.key) return
        diffError.value = err instanceof Error ? err.message : String(err)
        diffLoading.value = false
      })
      .finally(() => {
        if (untrackedInflight === request) untrackedInflight = null
      })
  }, 80)
})

onUnmounted(() => {
  clearTimeout(untrackedTimer)
  untrackedInflight?.cancel?.()
})

async function focusDiff() {
  await nextTick()
  if (displayDiff.value) diffView.value?.focus()
}

async function onStageHunk(hunk: DiffHunk) {
  const row = currentRow.value
  if (!row) return
  await run(async () => {
    if (row.staged) await DiffService.UnstageHunk(row.path, hunk)
    else await DiffService.StageHunk(row.path, hunk)
  }, row.key)
  if (!displayDiff.value) listEl.value?.focus()
}

async function onStageLines(hunk: DiffHunk, lines: DiffLine[]) {
  const row = currentRow.value
  if (!row) return
  await run(async () => {
    if (row.staged) await DiffService.UnstageLines(row.path, hunk, lines)
    else await DiffService.StageLines(row.path, hunk, lines)
  }, row.key)
  if (!displayDiff.value) listEl.value?.focus()
}

async function onEditHunk(hunk: DiffHunk, replacement: string[]) {
  const row = currentRow.value
  if (!row || row.staged || isUntrackedPreview.value) return
  await run(async () => {
    await DiffService.ApplyHunkEdit(row.path, hunk, replacement)
  }, row.key)
  await focusDiff()
}

function onStageFile() {
  const row = currentRow.value
  if (row) toggleRow(row)
  listEl.value?.focus()
}

function runBulk(bulk: 'stage' | 'unstage') {
  void run(async () => {
    if (bulk === 'stage') await WorktreeService.StageAll()
    else await WorktreeService.UnstageAll()
  })
}

/** context-gap expansion reads the index-side content of the current file */
function loadCurrentFileContent(): Promise<string> {
  const path = currentRow.value?.path
  if (!path) return Promise.resolve('')
  return InspectService.WorkingFileContent(path)
}

function loadEditorFile(): Promise<string> {
  const path = currentRow.value?.path
  if (!path) return Promise.reject(new Error('No file selected'))
  return DiffService.LoadEditorFile(path)
}

async function saveEditorFile(original: string, content: string) {
  const row = currentRow.value
  if (!row || row.staged) throw new Error('No working file selected')
  await DiffService.SaveEditorFile(row.path, original, content)
  await refresh(row.key)
}

// ---- commit box ---------------------------------------------------------

const summaryEl = ref<InstanceType<typeof UiInput> | null>(null)
const summary = ref('')
const body = ref('')
const amend = ref(false)
const committing = ref(false)
useRepoSwitchGuard(() => committing.value || treeActionBusy.value || runningOperations.value > 0 ? 'Wait for the Git operation to finish.' : summary.value.trim() || body.value.trim() ? 'Finish or clear your commit message before switching repositories.' : '')

const canCommit = computed(
  () => summary.value.trim().length > 0 && (stagedRows.value.length > 0 || amend.value),
)

function focusCommitBox() {
  summaryEl.value?.focus()
}

watch(amend, async (on, _previous, onCleanup) => {
  if (!on) {
    summary.value = ''
    body.value = ''
    return
  }
  if (summary.value.trim()) return
  let cancelled = false
  onCleanup(() => { cancelled = true })
  try {
    const message = await GraphService.GetCommitMessage('HEAD')
    if (cancelled || !amend.value || summary.value.trim()) return
    const [first = '', ...rest] = message.split('\n')
    summary.value = first
    body.value = rest.join('\n').trim()
  } catch {
    /* no HEAD yet — leave the box empty */
  }
})

async function commit() {
  if (!canCommit.value || committing.value) return
  const message = body.value.trim()
    ? `${summary.value.trim()}\n\n${body.value.trim()}`
    : summary.value.trim()
  committing.value = true
  try {
    if (amend.value) await WorktreeService.CommitAmend(message)
    else await WorktreeService.Commit(message)
    notify({
      tone: 'success',
      title: amend.value ? 'Commit amended' : 'Commit created',
      message: summary.value.trim(),
    })
    summary.value = ''
    body.value = ''
    amend.value = false
    await refresh()
    listEl.value?.focus()
  } catch (err) {
    notify({
      tone: 'danger',
      title: 'Commit failed',
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    committing.value = false
  }
}

function onComposerKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isModified(event)) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); listEl.value?.focus() }
}
function onCommitKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void commit()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    listEl.value?.focus()
  }
}

// ---- modeline ------------------------------------------------------------

function onFocusList() {
  setModeline({
    mode: 'NORMAL',
    hints: groupingActive.value ? 'h/l collapse/expand · ⏎ diff · s stage/unstage tree · u unstage · x discard · T flat' : 's stage · u unstage · a all · x discard · ⏎ diff · c commit · T tree',
  })
}
function onFocusDiff() {
  onDiffModeChange(diffView.value?.getMode() ?? 'hunk')
}
function onDiffModeChange(mode: 'hunk' | 'visual' | 'edit') {
  if (mode === 'visual')
    setModeline({ mode: 'VISUAL', hints: '' })
  else if (mode === 'edit') setModeline({ mode: 'EDIT', hints: '' })
  else
    setModeline({
      mode: 'NORMAL',
      hints: '',
    })
}
function onFocusCommit() {
  setModeline({ mode: 'COMMIT', hints: '⌃⏎ commit · esc back' })
}

onUnmounted(resetModeline)

// ---- lifecycle ------------------------------------------------------------

onMounted(async () => {
  await loadStatus()
  if (props.focusKey) {
    const index = rows.value.findIndex((row) => row.key === props.focusKey)
    if (index >= 0) vim.moveTo(index)
  }
  await nextTick()
  if (props.focusCommit) focusCommitBox()
  else listEl.value?.focus()
})

const headerCounts = computed(() => {
  const parts: string[] = []
  if (conflictRows.value.length) parts.push(`${conflictRows.value.length} conflicts`)
  if (unstagedRows.value.length) parts.push(`${unstagedRows.value.length} unstaged`)
  if (stagedRows.value.length) parts.push(`${stagedRows.value.length} staged`)
  return parts
})

const CHANGE_LIST_MIN_WIDTH = 220
const CHANGE_LIST_MAX_WIDTH = 520
const changeListWidth = ref(270)
const changesGridStyle = computed(() => ({
  '--changes-left-w': `${changeListWidth.value}px`,
}))
let resizeStartX = 0
let resizeStartWidth = 0

function clampChangeListWidth(width: number) {
  return Math.max(CHANGE_LIST_MIN_WIDTH, Math.min(CHANGE_LIST_MAX_WIDTH, width))
}

function resizeListKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || isModified(event)) return
  event.preventDefault()
  changeListWidth.value = event.key === 'Home' ? CHANGE_LIST_MIN_WIDTH : event.key === 'End' ? CHANGE_LIST_MAX_WIDTH : clampChangeListWidth(changeListWidth.value + (event.key === 'ArrowRight' ? 16 : -16))
}
function onChangeListResizeMove(event: PointerEvent) {
  changeListWidth.value = clampChangeListWidth(resizeStartWidth + event.clientX - resizeStartX)
}

function endChangeListResize() {
  window.removeEventListener('pointermove', onChangeListResizeMove)
  window.removeEventListener('pointerup', endChangeListResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function startChangeListResize(event: PointerEvent) {
  resizeStartX = event.clientX
  resizeStartWidth = changeListWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onChangeListResizeMove)
  window.addEventListener('pointerup', endChangeListResize, { once: true })
}

onUnmounted(endChangeListResize)

const sectionSplit = ref(55)
const sectionStack = ref<HTMLElement | null>(null)
const sectionsResizable = computed(() => splitSections.value.every(section => !section.collapsed && section.count > 0))
function clampSectionSplit(value: number) { return Math.max(15, Math.min(85, value)) }
function resizeSectionsKey(event: KeyboardEvent) {
  event.stopPropagation()
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || isModified(event)) return
  event.preventDefault()
  sectionSplit.value = event.key === 'Home' ? 15 : event.key === 'End' ? 85
    : clampSectionSplit(sectionSplit.value + (event.key === 'ArrowDown' ? 5 : -5))
}
function startSectionResize(event: PointerEvent) {
  if (event.button !== 0 || !sectionsResizable.value) return
  const handle = event.currentTarget as HTMLElement
  handle.setPointerCapture(event.pointerId)
}
function moveSectionResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  if (!handle.hasPointerCapture(event.pointerId) || !sectionsResizable.value) return
  const bounds = sectionStack.value?.getBoundingClientRect()
  if (!bounds?.height) return
  sectionSplit.value = clampSectionSplit((event.clientY - bounds.top) / bounds.height * 100)
}
function endSectionResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
}

const summaryLimit = 50
</script>

<template>
  <div class="changes-view">
    <Teleport defer to="#view-header-context">
      <span v-for="part in headerCounts" :key="part" class="header-meta">{{ part }}</span>
      <UiButton
        size="sm"
        icon-only
        :active="groupingActive"
        :title="groupingActive ? 'Flat file list (T)' : 'Group by directory (T)'"
        :aria-pressed="groupingActive"
        @click="toggleGrouping"
      >
        <PhTreeStructure :size="16" weight="bold" />
      </UiButton>
      <UiButton size="sm" title="Focus commit message" @click="focusCommitBox">
        <PhGitCommit :size="16" weight="bold" />
        Commit
      </UiButton>
    </Teleport>

    <SurfaceState
      v-if="loading"
      tone="loading"
      title="Loading worktree"
      message="Reading staged and unstaged changes."
    />
    <SurfaceState
      v-else-if="error"
      tone="error"
      title="Unable to load worktree"
      :message="error"
      action-label="Retry"
      @action="refresh()"
    />

    <div v-else class="changes-grid" :style="changesGridStyle">
      <div class="changes-left">
        <header class="changes-tree-heading">
          <span>Changes</span>
          <span class="change-delta"><em class="d-add">+{{ totalDelta.ins }}</em><em class="d-del">−{{ totalDelta.del }}</em></span>
        </header>
        <section
          ref="listEl"
          class="changes-files"
          tabindex="0"
          aria-label="Changed files"
          @keydown="onListKey"
          data-keyboard-pane
          @focusin="onTreeFocus"
        >
          <p v-if="!allRowCount" class="changes-section-empty">Working tree clean</p>

          <div v-if="conflictSection" class="changes-pane conflicts-pane">
            <div class="changes-section section-conflicts">
              <button
                class="section-toggle"
                data-tree-key="section:conflicts"
                :class="{ selected: treeCursorKey === 'section:conflicts' }"
                :aria-expanded="!conflictSection.collapsed"
                type="button"
                @click="toggleSection(conflictSection.id)"
              >
                <PhCaretRight class="section-chevron disclosure-icon" :class="{ expanded: !conflictSection.collapsed }" :size="12" weight="bold" aria-hidden="true" />
                <span class="section-label">{{ conflictSection.label }}</span>
                <i class="section-count">{{ conflictSection.count }}</i>
              </button>
            </div>

            <div v-if="!conflictSection.collapsed" class="changes-section-files">
              <button
                v-for="item in conflictSection.flat"
                :key="item.row.key"
                        :data-file-index="item.index"
                        :data-tree-key="item.row.key"
                class="change-row"
                :class="{ selected: isFileSelected(item.index), conflict: item.row.conflict }"
                :style="{ '--status-color': statusColor(item.row.label) }"
                type="button"
                :title="item.row.oldPath ? `${item.row.oldPath} → ${item.row.path}` : item.row.path"
                @click="emit('navigate', 'conflicts', item.row.path)"
              >
                <span class="file-status" role="img" :aria-label="statusIcon(item.row.label).label" :title="statusIcon(item.row.label).label"><component :is="statusIcon(item.row.label).icon" :size="14" weight="bold" aria-hidden="true" /></span>
                <span class="change-file-label"
                  ><span class="change-name">{{ item.row.name }}</span
                  ><span v-if="item.row.dir" class="change-dir">{{ item.row.dir }}</span></span
                >
              </button>
            </div>
          </div>

          <div ref="sectionStack" class="changes-stack">
            <template v-for="section in splitSections" :key="section.id">
              <button v-if="section.id === 'staged'" class="changes-section-resizer" type="button"
                role="separator" aria-label="Resize staged and unstaged sections" aria-orientation="horizontal"
                :aria-valuenow="sectionSplit" :aria-valuemin="15" :aria-valuemax="85" :disabled="!sectionsResizable"
                @keydown="resizeSectionsKey" @pointerdown.prevent.stop="startSectionResize"
                @pointermove="moveSectionResize" @pointerup="endSectionResize" @pointercancel="endSectionResize"
                @dblclick="sectionSplit = 55" />
              <div class="changes-pane" :class="[`pane-${section.id}`, { 'is-collapsed': section.collapsed, 'is-empty': !section.count }]"
                :style="{ flexGrow: section.collapsed || !section.count ? 0 : section.id === 'unstaged' ? sectionSplit : 100 - sectionSplit }">
                <div class="changes-section" :class="`section-${section.id}`">
                  <button class="section-toggle" :data-tree-key="`section:${section.id}`" :class="{ selected: treeCursorKey === `section:${section.id}` }" :aria-expanded="!section.collapsed" type="button" @click="toggleSection(section.id)">
                    <PhCaretRight class="section-chevron disclosure-icon" :class="{ expanded: !section.collapsed }" :size="12" weight="bold" aria-hidden="true" />
                    <span class="section-label">{{ section.label }}</span>
                    <i class="section-count">{{ section.count }}</i>
                  </button>
                  <button
                    v-if="section.bulk && section.count && !section.collapsed"
                    class="section-action"
                    type="button"
                    @click="runBulk(section.bulk)"
                  >
                    {{ section.bulk === 'stage' ? 'Stage all' : 'Unstage all' }}
                  </button>
                </div>

                <div v-if="!section.collapsed" class="changes-section-files" :aria-label="`${section.label} files`">
                <p v-if="!section.count" class="changes-section-empty">{{ section.id === 'staged' ? 'No staged files' : 'No unstaged files' }}</p>
                <template v-if="!section.collapsed">
                  <template v-if="section.groups">
                    <template v-for="item in section.groups" :key="item.key">
                      <button v-if="item.kind === 'dir'" class="change-dir-row" :data-tree-key="`dir:${item.key}`" :data-tree-parent="item.parentKey" :style="{ '--tree-depth': item.depth }" :title="item.dir" :class="{ selected: treeCursorKey === `dir:${item.key}` }" :aria-expanded="!item.collapsed" type="button" @click="toggleDir(item.key)">
                        <PhCaretRight class="section-chevron disclosure-icon" :class="{ expanded: !item.collapsed }" :size="12" weight="bold" aria-hidden="true" />
                        <span class="change-tree-guides" aria-hidden="true"><i v-for="level in item.depth" :key="level" :style="{ left: `${(level - 1) * 12 + 12}px` }" /></span>
                        <span class="change-dir-path">{{ item.label }}</span>
                        <i class="section-count">{{ item.count }}</i>
                      </button>
                      <button
                        v-else
                        :data-file-index="item.index"
                        :data-tree-key="item.row.key"
                        :data-tree-parent="item.parentKey"
                        class="change-row grouped"
                        :class="{
                          selected: isFileSelected(item.index),
                          conflict: item.row.conflict,
                        }"
                        :style="{ '--status-color': statusColor(item.row.label), '--tree-depth': item.depth }"
                        type="button"
                        :title="
                          item.row.oldPath
                            ? `${item.row.oldPath} → ${item.row.path}`
                            : item.row.path
                        "
                        @click="selectRow(item.index)"
                      >
                        <span class="change-tree-guides" aria-hidden="true"><i v-for="level in item.depth" :key="level" :style="{ left: `${(level - 1) * 12 + 12}px` }" /></span>
                        <span class="file-status" role="img" :aria-label="statusIcon(item.row.label).label" :title="statusIcon(item.row.label).label"><component :is="statusIcon(item.row.label).icon" :size="14" weight="bold" aria-hidden="true" /></span>
                        <span class="change-name">{{ item.row.name }}</span>
                        <span v-if="deltaFor(item.row)" class="change-delta">
                          <em class="d-add">+{{ deltaFor(item.row)!.ins }}</em>
                          <em class="d-del">−{{ deltaFor(item.row)!.del }}</em>
                        </span>
                        <span v-else-if="isBinaryRow(item.row)" class="change-delta">binary</span>
                        <span v-else-if="item.row.untracked" class="change-delta"
                          ><em class="d-new">new</em></span
                        >
                        <span
                          class="change-hover-action"
                          :class="item.row.staged ? 'unstage-action' : 'stage-action'"
                          :title="item.row.staged ? 'Unstage' : 'Stage'"
                          @click.stop="toggleRow(item.row)"
                        >
                          <PhMinus v-if="item.row.staged" :size="16" weight="bold" />
                          <PhPlus v-else :size="16" weight="bold" />
                        </span>
                      </button>
                    </template>
                  </template>

                  <template v-else-if="section.flat">
                    <button
                      v-for="item in section.flat"
                      :key="item.row.key"
                        :data-file-index="item.index"
                        :data-tree-key="item.row.key"
                      class="change-row"
                      :class="{ selected: isFileSelected(item.index), conflict: item.row.conflict }"
                      :style="{ '--status-color': statusColor(item.row.label) }"
                      type="button"
                      :title="
                        item.row.oldPath ? `${item.row.oldPath} → ${item.row.path}` : item.row.path
                      "
                      @click="selectRow(item.index)"
                    >
                      <span class="file-status" role="img" :aria-label="statusIcon(item.row.label).label" :title="statusIcon(item.row.label).label"><component :is="statusIcon(item.row.label).icon" :size="14" weight="bold" aria-hidden="true" /></span>
                      <span class="change-file-label"
                        ><span class="change-name">{{ item.row.name }}</span
                        ><span v-if="item.row.dir" class="change-dir">{{
                          item.row.dir
                        }}</span></span
                      >
                      <span v-if="deltaFor(item.row)" class="change-delta">
                        <em class="d-add">+{{ deltaFor(item.row)!.ins }}</em>
                        <em class="d-del">−{{ deltaFor(item.row)!.del }}</em>
                      </span>
                      <span v-else-if="isBinaryRow(item.row)" class="change-delta">binary</span>
                      <span v-else-if="item.row.untracked" class="change-delta"
                        ><em class="d-new">new</em></span
                      >
                      <span
                        class="change-hover-action"
                        :class="item.row.staged ? 'unstage-action' : 'stage-action'"
                        :title="item.row.staged ? 'Unstage' : 'Stage'"
                        @click.stop="toggleRow(item.row)"
                      >
                        <PhMinus v-if="item.row.staged" :size="16" weight="bold" />
                        <PhPlus v-else :size="16" weight="bold" />
                      </span>
                    </button>
                  </template>
                </template>
                </div>
              </div>
            </template>
          </div>
        </section>
        <footer class="changes-selection-footer" aria-label="Selected change actions">
          <div class="changes-selection-path" :title="selectionDetails.path">{{ selectionDetails.path }}</div>
          <div class="changes-selection-summary">{{ selectionDetails.count }} {{ selectionDetails.count === 1 ? 'file' : 'files' }} · {{ selectionDetails.hint }}</div>
          <div class="changes-selection-actions">
            <UiButton size="sm" :disabled="!selectionDetails.canStage" @click="selectionAction('s')"><kbd>s</kbd>{{ selectionDetails.stageLabel }}</UiButton>
            <UiButton size="sm" variant="ghost" class="is-danger" :disabled="!selectionDetails.canDiscard" @click="selectionAction('x')"><kbd>x</kbd>Discard{{ selectedScope ? ' all' : '' }}</UiButton>
          </div>
        </footer>
      </div>

      <button
        class="changes-resizer"
        type="button"
        aria-label="Resize changes list" role="separator" aria-orientation="vertical"
        :aria-valuemin="CHANGE_LIST_MIN_WIDTH" :aria-valuemax="CHANGE_LIST_MAX_WIDTH" :aria-valuenow="changeListWidth"
        @keydown="resizeListKey"
        title="Resize changes list"
        @pointerdown.prevent="startChangeListResize"
      />

      <DiffView
        ref="diffView"
        class="changes-diff"
        cursor-review
        :diff="displayDiff"
        :staged="currentRow?.staged ?? false"
        :file-level-only="isUntrackedPreview"
        :load-file-content="loadCurrentFileContent"
        :load-editor-file="loadEditorFile"
        :save-editor-file="saveEditorFile"
        @stage-hunk="onStageHunk"
        @stage-lines="onStageLines"
        @edit-hunk="onEditHunk"
        @stage-file="onStageFile"
        @exit="listEl?.focus()"
        @modechange="onDiffModeChange"
        @focusin="onFocusDiff"
      >
        <template #head>
          <div
            v-if="currentRow && displayDiff"
            class="diff-file-head"
            :style="{ '--status-color': statusColor(currentRow.label) }"
          >
            <span class="file-status" role="img" :aria-label="statusIcon(currentRow.label).label" :title="statusIcon(currentRow.label).label"><component :is="statusIcon(currentRow.label).icon" :size="14" weight="bold" aria-hidden="true" /></span>
            <span class="diff-file-path">{{ currentRow.path }}</span>
            <span v-if="currentRow.staged" class="diff-side">staged</span>
            <span v-else-if="isUntrackedPreview" class="diff-side">untracked</span>
            <UiButton size="sm" class="diff-stage-file" @click="onStageFile">{{
              currentRow.staged ? 'Unstage file' : 'Stage file'
            }}</UiButton>

          </div>
        </template>
        <template #empty>
          <template v-if="diffLoading">Loading diff...</template>
          <template v-else-if="diffError">{{ diffError }}</template>
          <template v-else>{{
            currentRow ? 'No diff to show.' : 'Select a file to preview its diff.'
          }}</template>
        </template>
      </DiffView>

      <form
        class="commit-bar"
        aria-label="Create commit"
        tabindex="0" data-keyboard-pane @focus.self="focusCommitBox"
        @keydown="onComposerKey"
        @focusin="onFocusCommit"
        @submit.prevent="commit"
      >
        <header class="commit-panel-head">
          <h2>Next commit</h2>
          <span
            >{{ stagedRows.length }} staged {{ stagedRows.length === 1 ? 'file' : 'files' }}</span
          >
        </header>
        <label class="commit-field"
          ><span>Summary</span>
          <div class="commit-summary">
            <UiInput
              size="lg"
              ref="summaryEl"
              v-model="summary"
              type="text"
              placeholder="Describe your changes"
              aria-label="Commit summary"
              :maxlength="200"
              :disabled="committing"
              @keydown="onCommitKey"
            />
            <span
              v-if="summary.length"
              class="commit-count"
              :class="{ over: summary.length > summaryLimit }"
              >{{ summary.length }}</span
            >
          </div></label
        >
        <label class="commit-field"
          ><span>Description <small>optional</small></span
          ><textarea
            v-model="body"
            class="commit-body ui-field"
            aria-label="Commit description"
            placeholder="Why was this change needed?"
            rows="7"
            :disabled="committing"
            @keydown="onCommitKey"
          />
        </label>
        <label class="commit-amend"
          ><input v-model="amend" type="checkbox" :disabled="committing" />Amend last commit</label
        >
        <p class="commit-note">
          {{
            amend
              ? 'Update the previous commit with this message and any staged changes.'
              : 'Only staged changes go into this commit.'
          }}
        </p>
        <UiButton
          type="submit"
          class="commit-btn"
          :disabled="!canCommit || committing"
          variant="primary"
          size="lg"
          :loading="committing"
          >{{
            committing
              ? 'Committing…'
              : amend
                ? 'Amend commit'
                : `Commit ${stagedRows.length} ${stagedRows.length === 1 ? 'file' : 'files'}`
          }}<kbd>⌃⏎</kbd></UiButton
        >
      </form>
    </div>

    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>

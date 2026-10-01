<script setup lang="ts">
import WindowedList from '../common/WindowedList.vue'
import UiInput from '../common/UiInput.vue'
import FileStatusIcon from '../common/FileStatusIcon.vue'
import { changesCacheGeneration, forgetChangesSnapshot, invalidateChangesSnapshots, peekChangesSnapshot, saveChangesSnapshot } from './changesSnapshotCache'
import { buildChangeList, changeRows, changeTreeScope, fallbackChangeKey, indexPaths, type ChangeRow, type SectionId, type SectionVM } from './changeTreeModel'
import { fileStatusPresentation } from '../common/fileStatusPresentation'
import { useGitOperation } from '../../composables/useGitOperation'
import { untrackedPreview, useChangeDiff } from './useChangeDiff'
import { summaryDeltas, type WorktreeDeltas } from '../graph/worktreeHeat'
import { useRepoSwitchGuard } from '../../composables/useRepoSwitchGuard'
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import DiffView from '../diff/DiffView.vue'
import SurfaceState from '../common/SurfaceState.vue'
import { isEditable, isModified } from '../../composables/keyboard'
import UiButton from '../common/UiButton.vue'
import OperationConfirmModal, {
  type OperationConfirmRequest,
} from '../overlays/OperationConfirmModal.vue'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { setModeline, resetModeline } from '../../composables/useModeline'
import { useVimList } from '../../composables/useVimList'
import {
  DiffService,
  GraphService,
  InspectService,
  WorktreeService,
  type RepoInfo,
  type WorktreeSnapshot,
} from '../../bindings/github.com/atterpac/ichi/desktop/services'
import {
  type DiffHunk,
  type DiffLine,
  type StatusEntry,
} from '../../bindings/github.com/atterpac/ichi/internal/git'
import { PhCaretRight, PhGitCommit, PhMinus, PhPlus, PhTreeStructure } from '@phosphor-icons/vue'

const props = defineProps<{
  repositoryPath?: string
  focusCommit?: boolean
  /** row key (`c:`/`s:`/`u:` + path) to land the cursor on */
  focusKey?: string
}>()

const emit = defineEmits<{
  navigate: [view: string, focus?: string]
}>()

const loading = ref(true)
const error = ref('')
const entries = ref<StatusEntry[]>([])
const repo = ref<RepoInfo | null>(null)
const settings = usePreferenceBindings()
const pendingOperation = ref<OperationConfirmRequest | null>(null)

const rowGroups = computed(() => changeRows(entries.value))
const conflictRows = computed(() => rowGroups.value.conflicts)
const unstagedRows = computed(() => rowGroups.value.unstaged)
const stagedRows = computed(() => rowGroups.value.staged)
const allRowCount = computed(
  () => conflictRows.value.length + unstagedRows.value.length + stagedRows.value.length,
)

/* ---- list view-model: sections → optional dir groups → visible rows ----
   The vim cursor runs over exactly the rows the template renders, so
   collapse state and grouping are resolved here, in render order. */

const collapsedSections = ref<Set<SectionId>>(new Set())
const collapsedDirs = ref<Set<string>>(new Set())
const treeCursorKey = ref<string | null>(null)

const groupingActive = computed(() => {
  if (settings['changes.groupByDir'] === 'always') return true
  if (settings['changes.groupByDir'] === 'never') return false
  return allRowCount.value > 15
})

/** flip tree ⇄ flat; resolves 'auto' to an explicit choice */
function toggleGrouping() {
  treeCursorKey.value = null
  settings['changes.groupByDir'] = groupingActive.value ? 'never' : 'always'
}

const listModel = computed(() => buildChangeList(rowGroups.value, {
  grouped: groupingActive.value,
  collapsedSections: collapsedSections.value,
  collapsedDirs: collapsedDirs.value,
}))

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

const counts = ref<WorktreeDeltas>({})
const deltas = computed(() => {
  const out = new Map<string, { ins: number; del: number }>()
  for (const row of [...unstagedRows.value, ...stagedRows.value]) {
    const delta = counts.value[row.key]
    if (!row.untracked && delta && !delta.binary) out.set(row.key, { ins: delta.added, del: delta.removed })
  }
  return out
})

function isBinaryRow(row: ChangeRow) {
  return counts.value[row.key]?.binary ?? false
}

function deltaFor(row: ChangeRow) {
  if (row.conflict || row.untracked || isBinaryRow(row)) return null
  return deltas.value.get(row.key) ?? null
}

function statusColor(label: string) { return fileStatusPresentation(label).color }

const statusRefreshing = ref(false)
const showingCached = ref(false)
let loadedSnapshot: WorktreeSnapshot | null = null
let snapshotGeneration = changesCacheGeneration()
let statusRequest = 0
async function loadStatus() {
  const request = ++statusRequest
  statusRefreshing.value = true
  clearPatches()
  forgetChangesSnapshot(props.repositoryPath ?? '')
  const cacheVersion = changesCacheGeneration()
  try {
    const snapshot = await WorktreeService.Summary()
    if (request !== statusRequest || disposed) return
    if (cacheVersion !== changesCacheGeneration()) { await loadStatus(); return }
    loadedSnapshot = snapshot
    snapshotGeneration = cacheVersion
    entries.value = snapshot?.Summary?.Entries ?? []
    counts.value = summaryDeltas(snapshot?.Summary?.Working ?? [], snapshot?.Summary?.Staged ?? [])
    repo.value = snapshot?.Info ?? null
    error.value = ''
  } catch (err) {
    if (request === statusRequest && !disposed) error.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (request === statusRequest && !disposed) {
      showingCached.value = false
      loading.value = false
      statusRefreshing.value = false
    }
  }
}

/** reload status, keeping the cursor on the same row when it still exists */
async function refresh(preferKey?: string) {
  const key = preferKey ?? currentRow.value?.key
  const previousTreeKey = treeCursorKey.value
  const previous = rows.value.slice()
  const oldIndex = previous.findIndex(row => row.key === key)
  const oldRow = previous[oldIndex]
  const listHadFocus = !!listEl.value?.contains(document.activeElement)
  await loadStatus()
  if (groupingActive.value && treeScope(previousTreeKey)) return
  const remainingKey = fallbackChangeKey(previous, rows.value, key)
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

const { busy: runningOperations, run: runOperation } = useGitOperation({
  refresh: () => refresh(),
  blocked: () => statusRefreshing.value || committing.value,
  invalidate: invalidateChangesSnapshots,
})
async function run(op: () => Promise<void>, preferKey?: string) {
  await runOperation(op, {}, () => refresh(preferKey))
}

function stageRow(row: ChangeRow) {
  if (row.staged || row.conflict) return
  void run(async () => {
    await WorktreeService.StageFiles(indexPaths([row]))
  })
}

function unstageRow(row: ChangeRow) {
  if (!row.staged || row.conflict) return
  void run(async () => {
    await WorktreeService.UnstageFiles(indexPaths([row]))
  })
}

function toggleRow(row: ChangeRow) {
  if (row.conflict) return
  if (row.staged) unstageRow(row)
  else stageRow(row)
}


function stageRows(targets: ChangeRow[]) {
  const unstaged = targets.filter(row => !row.staged && !row.conflict)
  const staged = targets.filter(row => row.staged && !row.conflict)
  if (unstaged.length) void run(() => WorktreeService.StageFiles(indexPaths(unstaged)))
  else if (staged.length) void run(() => WorktreeService.UnstageFiles(indexPaths(staged)))
}

async function discardPaths(paths: string[]) {
  const result = await WorktreeService.DiscardFiles(paths)
  if (!result) throw new Error('Discard result unavailable')
  if (result.Error) {
    const completed = result.Completed ?? []
    const completedNames = completed.slice(0, 5).join(', ') + (completed.length > 5 ? ', …' : '')
    throw new Error(`${completed.length} files discarded${completedNames ? ` (${completedNames})` : ''}. Failed on ${result.FailedPath}: ${result.Error}. ${result.Remaining?.length ?? 0} files not attempted.`)
  }
}

function discardRow(row: ChangeRow) {
  if (row.staged || row.conflict) return
  const doDiscard = () =>
    run(async () => {
      await discardPaths([row.path])
    })
  if (!settings['operations.confirmDestructive']) {
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

function treeScope(key: string | null) { return changeTreeScope(key, rowGroups.value) }

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
        if (operation === 'u') await WorktreeService.UnstageFiles(indexPaths(eligible))
        else if (operation === 'x') {
          await discardPaths(eligible.map(row => row.path))
        } else await WorktreeService.StageFiles(indexPaths(eligible))
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
  if (operation === 'x' && settings['operations.confirmDestructive']) {
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

type TreeNavItem = { key: string; parent: string; section: SectionId; container: boolean; collapsed: boolean; index?: number; toggle: () => void }
const treeNav = computed<TreeNavItem[]>(() => listModel.value.sections.flatMap(section => {
  const items: TreeNavItem[] = [{ key: `section:${section.id}`, parent: '', section: section.id, container: true, collapsed: section.collapsed, toggle: () => toggleSection(section.id) }]
  for (const item of section.groups ?? section.flat ?? []) {
    if ('kind' in item && item.kind === 'dir') {
      items.push({ key: `dir:${item.key}`, parent: item.parentKey, section: section.id, container: true, collapsed: item.collapsed, toggle: () => toggleDir(item.key) })
    } else {
      items.push({ key: item.row.key, parent: 'parentKey' in item ? item.parentKey : `section:${section.id}`, section: section.id, container: false, collapsed: false, index: item.index, toggle: () => {} })
    }
  }
  return items
}))
const sectionWindows: Partial<Record<SectionId, { scrollToIndex: (index: number) => void }>> = {}
function setSectionWindow(id: SectionId, instance: unknown) {
  if (instance) sectionWindows[id] = instance as { scrollToIndex: (index: number) => void }
  else delete sectionWindows[id]
}
function changeItemKey(item: { key?: string; row?: ChangeRow }) { return item.key ?? item.row!.key }
async function scrollChangeKey(key: string | null, focus = false) {
  const item = treeNav.value.find(item => item.key === key)
  if (!item) return
  if (!key?.startsWith('section:')) {
    const section = listModel.value.sections.find(section => section.id === item.section)!
    const index = (section.groups ?? section.flat ?? []).findIndex(item => changeItemKey(item) === key || `dir:${changeItemKey(item)}` === key)
    sectionWindows[item.section]?.scrollToIndex(index)
  }
  await nextTick()
  const element = [...(listEl.value?.querySelectorAll<HTMLElement>('[data-tree-key]') ?? [])].find(element => element.dataset.treeKey === key)
  if (focus) element?.focus()
  element?.scrollIntoView?.({ block: 'nearest' })
}

// Navigation uses the complete model; offscreen rows need no mounted DOM node.
function handleTreeKey(event: KeyboardEvent): boolean {
  if (!groupingActive.value || !listEl.value) return false
  const items = treeNav.value
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-tree-key]') : null
  const current = items.find(item => item.key === target?.dataset.treeKey)
    ?? items.find(item => item.key === treeCursorKey.value)
    ?? items.find(item => item.index === vim.cursor.value) ?? items[0]
  if (!current) return false
  const focusItem = (item: TreeNavItem | undefined) => {
    if (!item) return
    treeCursorKey.value = item.key
    if (item.index !== undefined) vim.moveTo(item.index)
    void scrollChangeKey(item.key, true)
  }
  const index = items.indexOf(current)
  const parent = items.find(item => item.key === current.parent)
  switch (event.key) {
    case 's': case 'u': case 'a': case 'x':
      if (!current.container) return false
      actOnTree(current.key, event.key)
      return true
    case 'j': case 'ArrowDown': case 'k': case 'ArrowUp':
      if (vim.mode.value !== 'normal') return false
      focusItem(items[Math.max(0, Math.min(items.length - 1, index + (['j', 'ArrowDown'].includes(event.key) ? 1 : -1)))])
      return true
    case 'h': case 'ArrowLeft':
      if (current.container && !current.collapsed) { current.toggle(); focusItem(current) }
      else if (parent) {
        if (!current.container && !parent.collapsed) parent.toggle()
        focusItem(parent)
      }
      return true
    case 'l': case 'ArrowRight':
      if (current.container) {
        if (current.collapsed) current.toggle()
        else focusItem(items[index + 1])
      }
      return true
    case 'Enter':
      if (current.container) { current.toggle(); return true }
      if (current.index !== undefined) vim.moveTo(current.index)
      return false
    default: return current.container && ['d', 'v', 'V', 'y'].includes(event.key)
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
  void scrollChangeKey(groupingActive.value && treeCursorKey.value ? treeCursorKey.value : rows.value[vim.cursor.value]?.key ?? null)
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
let disposed = false
const { diff: fileDiff, loading: diffLoading, error: diffError, clear: clearPatches, retry: retryPatch } = useChangeDiff({
  row: currentRow,
  refreshing: statusRefreshing,
  running: runningOperations,
  showingCached,
  statusError: error,
  async fetch(row) {
    if (row.untracked) {
      const preview = await InspectService.WorkingFilePreview(row.path)
      if (!preview) throw new Error('File preview unavailable')
      return untrackedPreview(row.path, preview.Content, { truncated: preview.Truncated, binary: preview.Binary })
    }
    const diff = await DiffService.WorktreeFile(row.path, row.oldPath, row.staged)
    return diff ? markRaw(diff) : null
  },
})
const displayDiff = computed(() => fileDiff.value)
const isUntrackedPreview = computed(() => !!currentRow.value?.untracked && !!fileDiff.value)

onUnmounted(() => {
  if (loadedSnapshot && !statusRefreshing.value && !runningOperations.value && !committing.value && !error.value && !diffLoading.value && !diffError.value) {
    saveChangesSnapshot(props.repositoryPath ?? '', loadedSnapshot, currentRow.value?.key ?? '', fileDiff.value, snapshotGeneration)
  }
  disposed = true
  statusRequest++
  clearPatches()
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

/** Context gaps must read the same new side as the selected patch. */
function loadCurrentFileContent(): Promise<string> {
  const path = currentRow.value?.path
  if (!path) return Promise.resolve('')
  return currentRow.value?.staged ? InspectService.IndexFileContent(path) : InspectService.WorkingFileContent(path)
}

function loadEditorFile(): Promise<string> {
  const path = currentRow.value?.path
  if (!path) return Promise.reject(new Error('No file selected'))
  return DiffService.LoadEditorFile(path)
}

async function saveEditorFile(original: string, content: string) {
  if (statusRefreshing.value) throw new Error('Wait for the worktree refresh to finish')
  invalidateChangesSnapshots()
  const row = currentRow.value
  if (!row || row.staged) throw new Error('No working file selected')
  await DiffService.SaveEditorFile(row.path, original, content)
  // Keep the editor mounted across save-only writes. Refresh when it closes.
  clearPatches()
}

async function onFileEditorClosed(saved: boolean) {
  if (saved) await refresh(currentRow.value?.key)
}

// ---- commit box ---------------------------------------------------------

const summaryEl = ref<InstanceType<typeof UiInput> | null>(null)
const summary = ref('')
const body = ref('')
const amend = ref(false)
const committing = ref(false)
useRepoSwitchGuard(() => committing.value || treeActionBusy.value || runningOperations.value ? 'Wait for the Git operation to finish.' : summary.value.trim() || body.value.trim() ? 'Finish or clear your commit message before switching repositories.' : '')

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
  const success = { title: amend.value ? 'Commit amended' : 'Commit created', message: summary.value.trim() }
  const message = body.value.trim()
    ? `${summary.value.trim()}\n\n${body.value.trim()}`
    : summary.value.trim()
  try {
    const succeeded = await runOperation(async () => {
      committing.value = true
      if (amend.value) await WorktreeService.CommitAmend(message)
      else await WorktreeService.Commit(message)
      summary.value = ''
      body.value = ''
      amend.value = false
    }, { success, failure: 'Commit failed' })
    if (succeeded) listEl.value?.focus()
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
  const cached = peekChangesSnapshot(props.repositoryPath ?? '')
  if (cached) {
    showingCached.value = true
    entries.value = cached.snapshot.Summary?.Entries ?? []
    counts.value = summaryDeltas(cached.snapshot.Summary?.Working ?? [], cached.snapshot.Summary?.Staged ?? [])
    repo.value = cached.snapshot.Info
    const index = rows.value.findIndex(row => row.key === (props.focusKey ?? cached.selection))
    if (index >= 0) { vim.moveTo(index); treeCursorKey.value = rows.value[index]!.key }
    fileDiff.value = currentRow.value?.key === cached.selection ? cached.diff : null
    loading.value = false
  }
  await refresh(props.focusKey ?? cached?.selection)
  if (disposed) return
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

    <div v-else class="changes-grid" :style="changesGridStyle" :inert="showingCached || undefined" :aria-busy="statusRefreshing">
      <span v-if="showingCached" role="status" style="position: absolute; z-index: 5; background: var(--surface-panel); padding: 4px 8px">Checking latest changes…</span>
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

            <WindowedList v-if="!conflictSection.collapsed" :ref="instance => setSectionWindow('conflicts', instance)" class="changes-section-files" :items="conflictSection.flat ?? []" :row-height="40" :key-of="changeItemKey">
              <template #default="{ item }">
              <button
                        :data-file-index="item.index"
                        :data-tree-key="item.row.key"
                class="change-row"
                :class="{ selected: isFileSelected(item.index), conflict: item.row.conflict }"
                :style="{ '--status-color': statusColor(item.row.label) }"
                type="button"
                :title="item.row.oldPath ? `${item.row.oldPath} → ${item.row.path}` : item.row.path"
                @click="emit('navigate', 'conflicts', item.row.path)"
              >
                <FileStatusIcon class="file-status" :status="item.row.label" />
                <span class="change-file-label"
                  ><span class="change-name">{{ item.row.name }}</span
                  ><span v-if="item.row.dir" class="change-dir">{{ item.row.dir }}</span></span
                >
              </button>
              </template>
            </WindowedList>
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

                <WindowedList v-if="!section.collapsed && section.groups" :ref="instance => setSectionWindow(section.id, instance)" class="changes-section-files" :aria-label="`${section.label} files`"
                  :items="section.groups" :row-height="28" :key-of="changeItemKey">
                  <template #empty><p class="changes-section-empty">{{ section.id === 'staged' ? 'No staged files' : 'No unstaged files' }}</p></template>
                  <template #default="{ item }">
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
                        <FileStatusIcon class="file-status" :status="item.row.label" />
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
                </WindowedList>
                <WindowedList v-else-if="!section.collapsed" :ref="instance => setSectionWindow(section.id, instance)" class="changes-section-files" :aria-label="`${section.label} files`"
                  :items="section.flat ?? []" :row-height="40" :key-of="changeItemKey">
                  <template #empty><p class="changes-section-empty">{{ section.id === 'staged' ? 'No staged files' : 'No unstaged files' }}</p></template>
                  <template #default="{ item }">                    <button
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
                      <FileStatusIcon class="file-status" :status="item.row.label" />
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
                </WindowedList>
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
        :read-only="showingCached"
        :diff="displayDiff"
        :staged="currentRow?.staged ?? false"
        :file-level-only="isUntrackedPreview"
        :load-file-content="loadCurrentFileContent"
        :load-editor-file="loadEditorFile"
        :save-editor-file="saveEditorFile"
        @file-editor-closed="onFileEditorClosed"
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
            <FileStatusIcon class="file-status" :status="currentRow.label" />
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
          <template v-else-if="diffError">{{ diffError }} <UiButton size="sm" @click="retryPatch">Retry</UiButton></template>
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

<script setup lang="ts">
import { computed, markRaw, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import DiffView from '../diff/DiffView.vue'
import OperationConfirmModal, { type OperationConfirmRequest } from '../overlays/OperationConfirmModal.vue'
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
import { PhCheck, PhGitCommit, PhMinus, PhPlus, PhTreeStructure } from '@phosphor-icons/vue'

const props = defineProps<{
  focusCommit?: boolean
}>()

const emit = defineEmits<{
  navigate: [view: string]
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
    case FileStatus.FileAdded: return 'A'
    case FileStatus.FileDeleted: return 'D'
    case FileStatus.FileRenamed: return 'R'
    case FileStatus.FileCopied: return 'C'
    case FileStatus.FileConflict: return '!'
    case FileStatus.FileModified:
    default: return 'M'
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
    label: conflict ? '!' : staged ? statusLabel(entry.IndexStatus) : entry.IsUntracked ? '?' : statusLabel(entry.WorkStatus),
  }
}

const conflictRows = computed(() => entries.value.filter((e) => e.IsConflict).map((e) => toRow(e, false, true)))
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
const allRowCount = computed(() => conflictRows.value.length + unstagedRows.value.length + stagedRows.value.length)

/* ---- list view-model: sections → optional dir groups → visible rows ----
   The vim cursor runs over exactly the rows the template renders, so
   collapse state and grouping are resolved here, in render order. */

type SectionId = 'conflicts' | 'unstaged' | 'staged'
type FileItem = { row: ChangeRow; index: number }
type DirGroup = { dir: string; key: string; collapsed: boolean; count: number; files: FileItem[] }
type SectionVM = {
  id: SectionId
  label: string
  count: number
  collapsed: boolean
  bulk: 'stage' | 'unstage' | null
  groups: DirGroup[] | null
  flat: FileItem[] | null
}

const collapsedSections = ref<Set<SectionId>>(new Set())
const collapsedDirs = ref<Set<string>>(new Set())

const groupingActive = computed(() => {
  if (settings.changesGroupByDir === 'always') return true
  if (settings.changesGroupByDir === 'never') return false
  return allRowCount.value > 15
})

/** flip tree ⇄ flat; resolves 'auto' to an explicit choice */
function toggleGrouping() {
  settings.changesGroupByDir = groupingActive.value ? 'never' : 'always'
}

const listModel = computed(() => {
  const sections: SectionVM[] = []
  const visible: ChangeRow[] = []

  const buildSection = (id: SectionId, label: string, sectionRows: ChangeRow[], bulk: SectionVM['bulk']) => {
    if (!sectionRows.length) return
    const collapsed = collapsedSections.value.has(id)
    const vm: SectionVM = { id, label, count: sectionRows.length, collapsed, bulk, groups: null, flat: null }
    if (!collapsed) {
      if (groupingActive.value && id !== 'conflicts') {
        const byDir = new Map<string, ChangeRow[]>()
        for (const row of sectionRows) {
          const dir = row.dir || '.'
          if (!byDir.has(dir)) byDir.set(dir, [])
          byDir.get(dir)!.push(row)
        }
        vm.groups = [...byDir.entries()].map(([dir, files]) => {
          const key = `${id}:${dir}`
          const dirCollapsed = collapsedDirs.value.has(key)
          const items: FileItem[] = []
          if (!dirCollapsed) {
            for (const row of files) {
              items.push({ row, index: visible.length })
              visible.push(row)
            }
          }
          return { dir, key, collapsed: dirCollapsed, count: files.length, files: items }
        })
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
const conflictSection = computed(() => listModel.value.sections.find((section) => section.id === 'conflicts') ?? null)
const splitSections = computed(() =>
  (['unstaged', 'staged'] as const)
    .map((id) => listModel.value.sections.find((section) => section.id === id))
    .filter((section): section is SectionVM => !!section),
)

function toggleSection(id: SectionId) {
  const next = new Set(collapsedSections.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedSections.value = next
}

function toggleDir(key: string) {
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

function deltaFor(row: ChangeRow) {
  if (row.conflict || row.untracked) return null
  return deltas.value.get(`${row.staged ? 's' : 'u'}:${row.path}`) ?? null
}

/** per-status tone consumed by the status letters via --status-color */
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
  await loadStatus()
  if (!key) return
  const index = rows.value.findIndex((row) => row.key === key)
  if (index >= 0) vim.moveTo(index)
}

// ---- staging actions --------------------------------------------------

async function run(op: () => Promise<void>, preferKey?: string) {
  try {
    await op()
    await refresh(preferKey)
  } catch (err) {
    notify({ tone: 'danger', title: 'Operation failed', message: err instanceof Error ? err.message : String(err) })
  }
}

function stageRow(row: ChangeRow) {
  if (row.staged || row.conflict) return
  void run(async () => { await WorktreeService.StageFile(row.path) })
}

function unstageRow(row: ChangeRow) {
  if (!row.staged || row.conflict) return
  void run(async () => { await WorktreeService.UnstageFile(row.path) })
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
  const doDiscard = () => run(async () => { await WorktreeService.DiscardFileChanges(row.path) })
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
      if (row.conflict) emit('navigate', 'conflicts')
      else void focusDiff()
    }
    if (action === 'delete' && row) discardRow(row)
  },
})

function onListKey(event: KeyboardEvent) {
  if (vim.search.active.value) {
    if (vim.handleKey(event)) event.preventDefault()
    return
  }
  // 'g' belongs to global nav (graph) — let it bubble to the shell instead of
  // feeding vim's gg motion. G still jumps to the bottom of the list.
  if (event.key === 'g' && !event.ctrlKey && !event.metaKey && !event.altKey) return

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
      void run(async () => { await WorktreeService.StageAll() })
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
  if (vim.handleKey(event)) event.preventDefault()
}

function scrollToCursor() {
  const items = listEl.value?.querySelectorAll<HTMLElement>('.change-row')
  items?.[vim.cursor.value]?.scrollIntoView?.({ block: 'nearest' })
}

watch(() => vim.cursor.value, () => void nextTick(scrollToCursor))

function selectRow(index: number) {
  vim.moveTo(index)
  listEl.value?.focus()
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
    const finish = () => perfLog(label, { ...data, ms: Math.round((performance.now() - start) * 10) / 10 })
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

// ---- commit box ---------------------------------------------------------

const summaryEl = ref<HTMLInputElement | null>(null)
const commitBarEl = ref<HTMLElement | null>(null)
const summary = ref('')
const body = ref('')
const amend = ref(false)
const committing = ref(false)
const commitFocused = ref(false)

const canCommit = computed(() => summary.value.trim().length > 0 && (stagedRows.value.length > 0 || amend.value))
const commitExpanded = computed(() => commitFocused.value || body.value.trim().length > 0)

function onCommitFocusOut(event: FocusEvent) {
  if (!commitBarEl.value?.contains(event.relatedTarget as Node)) commitFocused.value = false
}

function focusCommitBox() {
  summaryEl.value?.focus()
}

watch(amend, async (on) => {
  if (!on || summary.value.trim()) return
  try {
    const message = await GraphService.GetCommitMessage('HEAD')
    const [first = '', ...rest] = message.split('\n')
    summary.value = first
    body.value = rest.join('\n').trim()
  } catch {
    /* no HEAD yet — leave the box empty */
  }
})

async function commit() {
  if (!canCommit.value || committing.value) return
  const message = body.value.trim() ? `${summary.value.trim()}\n\n${body.value.trim()}` : summary.value.trim()
  committing.value = true
  try {
    if (amend.value) await WorktreeService.CommitAmend(message)
    else await WorktreeService.Commit(message)
    notify({ tone: 'success', title: amend.value ? 'Commit amended' : 'Commit created', message: summary.value.trim() })
    summary.value = ''
    body.value = ''
    amend.value = false
    await refresh()
    listEl.value?.focus()
  } catch (err) {
    notify({ tone: 'danger', title: 'Commit failed', message: err instanceof Error ? err.message : String(err) })
  } finally {
    committing.value = false
  }
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
  setModeline({ mode: 'NORMAL', hints: 's stage · u unstage · a all · x discard · ⏎ diff · c commit · T tree' })
}
function onFocusDiff() {
  onDiffModeChange('hunk')
}
function onDiffModeChange(mode: 'hunk' | 'visual' | 'edit') {
  if (mode === 'visual') setModeline({ mode: 'VISUAL', hints: 'j/k extend · s stage lines · esc back' })
  else if (mode === 'edit') setModeline({ mode: 'EDIT', hints: '⌃⏎ save · ⌃S save · esc cancel' })
  else setModeline({ mode: 'HUNK', hints: 'j/k hunk · s stage hunk · v lines · e edit · S file · t layout · esc back' })
}
function onFocusCommit() {
  setModeline({ mode: 'COMMIT', hints: '⌃⏎ commit · esc back' })
}

onUnmounted(resetModeline)

// ---- lifecycle ------------------------------------------------------------

onMounted(async () => {
  await loadStatus()
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
const changeListWidth = ref(300)
const changesGridStyle = computed(() => ({
  '--changes-left-w': `${changeListWidth.value}px`,
}))
const changesStackEl = ref<HTMLElement | null>(null)
const unstagedPaneRatio = ref(62)
const changesStackStyle = computed(() => ({
  gridTemplateRows: splitSections.value.length > 1
    ? `minmax(96px, ${unstagedPaneRatio.value}fr) 5px minmax(96px, ${100 - unstagedPaneRatio.value}fr)`
    : 'minmax(0, 1fr)',
}))

let resizeStartX = 0
let resizeStartWidth = 0
let stackResizeStartY = 0
let stackResizeStartRatio = 0

function clampChangeListWidth(width: number) {
  return Math.max(CHANGE_LIST_MIN_WIDTH, Math.min(CHANGE_LIST_MAX_WIDTH, width))
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

function onStackResizeMove(event: PointerEvent) {
  const height = changesStackEl.value?.getBoundingClientRect().height ?? 0
  if (height <= 0) return
  const delta = ((event.clientY - stackResizeStartY) / height) * 100
  unstagedPaneRatio.value = Math.max(25, Math.min(75, stackResizeStartRatio + delta))
}

function endStackResize() {
  window.removeEventListener('pointermove', onStackResizeMove)
  window.removeEventListener('pointerup', endStackResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function startStackResize(event: PointerEvent) {
  stackResizeStartY = event.clientY
  stackResizeStartRatio = unstagedPaneRatio.value
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onStackResizeMove)
  window.addEventListener('pointerup', endStackResize, { once: true })
}

onUnmounted(endChangeListResize)
onUnmounted(endStackResize)

const summaryLimit = 50
</script>

<template>
  <div class="changes-view">
    <Teleport defer to="#view-header-context">
      <span v-for="part in headerCounts" :key="part" class="header-meta">{{ part }}</span>
      <button
        class="graph-toolbar-action icon-only"
        :class="{ active: groupingActive }"
        type="button"
        :title="groupingActive ? 'Flat file list (T)' : 'Group by directory (T)'"
        :aria-pressed="groupingActive"
        @click="toggleGrouping"
      >
        <PhTreeStructure :size="14" weight="bold" />
      </button>
      <button class="graph-toolbar-action" type="button" title="Focus commit message" @click="focusCommitBox">
        <PhGitCommit :size="14" weight="bold" />
        Commit
      </button>
    </Teleport>

    <div v-if="loading" class="graph-state">Loading status...</div>
    <div v-else-if="error" class="graph-state error">
      <strong>Unable to load status</strong>
      <span>{{ error }}</span>
    </div>
    <div v-else-if="!allRowCount" class="graph-state">
      <PhCheck :size="28" weight="bold" class="clean-icon" />
      <strong>Working tree clean</strong>
      <span>{{ repo?.Branch || 'detached' }} · nothing to commit</span>
    </div>

    <div v-else class="changes-grid" :style="changesGridStyle">
      <div class="changes-left">
        <section
          ref="listEl"
          class="changes-files"
          tabindex="0"
          aria-label="Changed files"
          @keydown="onListKey"
          @focusin="onFocusList"
        >
          <div v-if="vim.search.active.value" class="vim-cmdline">
            /{{ vim.search.query.value }}<span class="vim-caret">▌</span>
          </div>

          <div v-if="conflictSection" class="changes-pane conflicts-pane">
            <div class="changes-section section-conflicts">
              <button class="section-toggle" type="button" @click="toggleSection(conflictSection.id)">
                <span class="section-chevron">{{ conflictSection.collapsed ? '▸' : '▾' }}</span>
                <span class="section-label">{{ conflictSection.label }}</span>
                <i class="section-count">{{ conflictSection.count }}</i>
              </button>
            </div>

            <template v-if="!conflictSection.collapsed">
              <button
                v-for="item in conflictSection.flat"
                :key="item.row.key"
                class="change-row"
                :class="{ selected: vim.isSelected(item.index), conflict: item.row.conflict }"
                :style="{ '--status-color': statusColor(item.row.label) }"
                type="button"
                :title="item.row.oldPath ? `${item.row.oldPath} → ${item.row.path}` : item.row.path"
                @click="emit('navigate', 'conflicts')"
              >
                <span class="file-status">{{ item.row.label }}</span>
                <span class="change-name">{{ item.row.name }}</span>
                <span v-if="item.row.dir" class="change-dir">{{ item.row.dir }}</span>
              </button>
            </template>
          </div>

          <div ref="changesStackEl" class="changes-stack" :style="changesStackStyle">
            <template v-for="section in splitSections" :key="section.id">
              <button
                v-if="section.id === 'staged' && splitSections.length > 1"
                class="changes-stack-resizer"
                type="button"
                aria-label="Resize staged and unstaged lists"
                title="Resize staged and unstaged lists"
                @pointerdown.prevent="startStackResize"
              />

              <div class="changes-pane" :class="`pane-${section.id}`">
                <div class="changes-section" :class="`section-${section.id}`">
                  <button class="section-toggle" type="button" @click="toggleSection(section.id)">
                    <span class="section-chevron">{{ section.collapsed ? '▸' : '▾' }}</span>
                    <span class="section-label">{{ section.label }}</span>
                    <i class="section-count">{{ section.count }}</i>
                  </button>
                  <button
                    v-if="section.bulk && !section.collapsed"
                    class="section-action"
                    type="button"
                    @click="runBulk(section.bulk)"
                  >
                    {{ section.bulk }} all
                  </button>
                </div>

                <template v-if="!section.collapsed">
                  <template v-if="section.groups">
                    <template v-for="group in section.groups" :key="group.key">
                      <button class="change-dir-row" type="button" @click="toggleDir(group.key)">
                        <span class="section-chevron">{{ group.collapsed ? '▸' : '▾' }}</span>
                        <span class="change-dir-path">{{ group.dir }}</span>
                        <i class="section-count">{{ group.count }}</i>
                      </button>
                      <button
                        v-for="item in group.files"
                        :key="item.row.key"
                        class="change-row grouped"
                        :class="{ selected: vim.isSelected(item.index), conflict: item.row.conflict }"
                        :style="{ '--status-color': statusColor(item.row.label) }"
                        type="button"
                        :title="item.row.oldPath ? `${item.row.oldPath} → ${item.row.path}` : item.row.path"
                        @click="selectRow(item.index)"
                      >
                        <span class="file-status">{{ item.row.label }}</span>
                        <span class="change-name">{{ item.row.name }}</span>
                        <span v-if="deltaFor(item.row)" class="change-delta">
                          <em class="d-add">+{{ deltaFor(item.row)!.ins }}</em>
                          <em class="d-del">-{{ deltaFor(item.row)!.del }}</em>
                        </span>
                        <span v-else-if="item.row.untracked" class="change-delta"><em class="d-new">new</em></span>
                        <span
                          class="change-hover-action"
                          :class="item.row.staged ? 'unstage-action' : 'stage-action'"
                          :title="item.row.staged ? 'Unstage' : 'Stage'"
                          @click.stop="toggleRow(item.row)"
                        >
                          <PhMinus v-if="item.row.staged" :size="12" weight="bold" />
                          <PhPlus v-else :size="12" weight="bold" />
                        </span>
                      </button>
                    </template>
                  </template>

                  <template v-else-if="section.flat">
                    <button
                      v-for="item in section.flat"
                      :key="item.row.key"
                      class="change-row"
                      :class="{ selected: vim.isSelected(item.index), conflict: item.row.conflict }"
                      :style="{ '--status-color': statusColor(item.row.label) }"
                      type="button"
                      :title="item.row.oldPath ? `${item.row.oldPath} → ${item.row.path}` : item.row.path"
                      @click="selectRow(item.index)"
                    >
                      <span class="file-status">{{ item.row.label }}</span>
                      <span class="change-name">{{ item.row.name }}</span>
                      <span v-if="item.row.dir" class="change-dir">{{ item.row.dir }}</span>
                      <span v-if="deltaFor(item.row)" class="change-delta">
                        <em class="d-add">+{{ deltaFor(item.row)!.ins }}</em>
                        <em class="d-del">-{{ deltaFor(item.row)!.del }}</em>
                      </span>
                      <span v-else-if="item.row.untracked" class="change-delta"><em class="d-new">new</em></span>
                      <span
                        class="change-hover-action"
                        :class="item.row.staged ? 'unstage-action' : 'stage-action'"
                        :title="item.row.staged ? 'Unstage' : 'Stage'"
                        @click.stop="toggleRow(item.row)"
                      >
                        <PhMinus v-if="item.row.staged" :size="12" weight="bold" />
                        <PhPlus v-else :size="12" weight="bold" />
                      </span>
                    </button>
                  </template>
                </template>
              </div>
            </template>
          </div>
        </section>

      </div>

      <button
        class="changes-resizer"
        type="button"
        aria-label="Resize changes list"
        title="Resize changes list"
        @pointerdown.prevent="startChangeListResize"
      />

      <DiffView
        ref="diffView"
        class="changes-diff"
        :diff="displayDiff"
        :staged="currentRow?.staged ?? false"
        :file-level-only="isUntrackedPreview"
        :load-file-content="loadCurrentFileContent"
        @stage-hunk="onStageHunk"
        @stage-lines="onStageLines"
        @edit-hunk="onEditHunk"
        @stage-file="onStageFile"
        @exit="listEl?.focus()"
        @modechange="onDiffModeChange"
        @focusin="onFocusDiff"
      >
        <template #head>
          <div v-if="currentRow && displayDiff" class="diff-file-head" :style="{ '--status-color': statusColor(currentRow.label) }">
            <span class="file-status">{{ currentRow.label }}</span>
            <span class="diff-file-path">{{ currentRow.path }}</span>
            <span v-if="currentRow.staged" class="diff-side">staged</span>
            <span v-else-if="isUntrackedPreview" class="diff-side">untracked</span>
            <select v-model="settings.diffLayout" class="layout-select" aria-label="Diff layout" title="Diff layout (t cycles)">
              <option value="unified">Unified</option>
              <option value="split">Split</option>
              <option value="inline">Inline</option>
              <option value="changes">Changes</option>
              <option value="result">Result</option>
            </select>
          </div>
        </template>
        <template #empty>
          <template v-if="diffLoading">Loading diff...</template>
          <template v-else-if="diffError">{{ diffError }}</template>
          <template v-else>{{ currentRow ? 'No diff to show.' : 'Select a file to preview its diff.' }}</template>
        </template>
      </DiffView>

      <div
        ref="commitBarEl"
        class="commit-bar"
        :class="{ expanded: commitExpanded }"
        @focusin="commitFocused = true; onFocusCommit()"
        @focusout="onCommitFocusOut"
      >
        <div class="commit-bar-row">
          <label class="commit-amend">
            <input v-model="amend" type="checkbox" />
            Amend
          </label>
          <div class="commit-summary">
            <input
              ref="summaryEl"
              v-model="summary"
              type="text"
              placeholder="Commit summary"
              :maxlength="200"
              @keydown="onCommitKey"
            />
            <span
              v-if="summary.length"
              class="commit-count"
              :class="{ over: summary.length > summaryLimit }"
            >{{ summary.length }}</span>
          </div>
          <button class="commit-btn" type="button" :disabled="!canCommit || committing" @click="commit">
            {{ committing ? 'Committing...' : amend ? 'Amend' : 'Commit' }}
            <kbd>⌃⏎</kbd>
          </button>
        </div>
        <textarea
          v-show="commitExpanded"
          v-model="body"
          class="commit-body"
          placeholder="Description (optional)"
          rows="3"
          @keydown="onCommitKey"
        />
      </div>
    </div>

    <OperationConfirmModal
      v-if="pendingOperation"
      :request="pendingOperation"
      @close="pendingOperation = null"
    />
  </div>
</template>

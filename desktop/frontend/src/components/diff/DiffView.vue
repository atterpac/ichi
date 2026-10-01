<script setup lang="ts">
import { isEditable, isModified } from '../../composables/keyboard'
import FileEditor from './FileEditor.vue'
import UiButton from '../common/UiButton.vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { usePreferenceBindings } from '../../customization/usePreferences'
import { useVirtualWindow } from '../../composables/useVirtualWindow'
import { LineType, type DiffHunk, type DiffLine, type FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{
  diff: FileDiff | null
  loadEditorFile?: () => Promise<string>
  saveEditorFile?: (original: string, content: string) => Promise<void>
  staged?: boolean
  readOnly?: boolean
  cursorReview?: boolean
  /** whole-file staging only (untracked previews) — hunk/line ops disabled */
  fileLevelOnly?: boolean
  /**
   * Full "new side" content of the file, fetched lazily to expand the
   * unchanged context between hunks. Context outside hunks is identical on
   * both sides of the diff, so index content works for working and staged.
   */
  loadFileContent?: (() => Promise<string>) | null
}>()

const emit = defineEmits<{
  stageHunk: [hunk: DiffHunk]
  stageLines: [hunk: DiffHunk, lines: DiffLine[]]
  stageFile: []
  editHunk: [hunk: DiffHunk, replacement: string[]]
  fileEditorClosed: [saved: boolean]
  exit: []
  modechange: [mode: 'hunk' | 'visual' | 'edit']
}>()

const settings = usePreferenceBindings()

const MAX_LINE_CHARS = 1000
const MAX_EDIT_LINES = 300
const MAX_EDIT_CHARS = 30000
const LARGE_DIFF_LINES = 5000
const DENSITY_HEIGHTS = { compact: 17, comfortable: 20, relaxed: 24 } as const

const CURSOR_DENSITY_HEIGHTS = { compact: 22, comfortable: 26, relaxed: 30 } as const
const rowHeight = computed(() => props.cursorReview ? CURSOR_DENSITY_HEIGHTS[settings['diff.density']] : DENSITY_HEIGHTS[settings['diff.density']])
const layout = computed(() => props.cursorReview ? 'unified' : settings['diff.layout'])

const LAYOUT_CYCLE = ['unified', 'split', 'inline', 'changes', 'result'] as const

function cycleLayout() {
  const index = LAYOUT_CYCLE.indexOf(layout.value)
  settings['diff.layout'] = LAYOUT_CYCLE[(index + 1) % LAYOUT_CYCLE.length]!
}

const container = ref<HTMLElement | null>(null)
const hunkIndex = ref(0)
const lineMode = ref(false)
const lineCursor = ref(0)
const lineAnchor = ref(0)
const cursorRow = ref(0)
const searchOpen = ref(false)
const searchQuery = ref('')
let pendingG = 0
const forceLarge = ref(false)
const fileEditor = ref<InstanceType<typeof FileEditor> | null>(null)
const fileBuffer = ref<string | null>(null)
let fileWasSaved = false
const fileEditorLine = ref(1)
const fileEditorLineOffset = ref(0)
const editorLoading = ref(false)
const editorError = ref('')
let editorRequest = 0
onBeforeUnmount(() => { editorRequest++; contentGeneration++ })
const editMode = ref(false)
const editValue = ref('')
const editTextArea = ref<HTMLTextAreaElement | null>(null)
const editLineNoEl = ref<HTMLElement | null>(null)

const hunks = computed(() => (props.diff?.Hunks ?? []).filter((hunk): hunk is DiffHunk => hunk !== null))
const activeHunk = computed<DiffHunk | undefined>(() => hunks.value[hunkIndex.value])

const stageableTypes = new Set<LineType>([LineType.LineAdded, LineType.LineRemoved])

function hunkLines(hunk: DiffHunk | undefined): DiffLine[] {
  return (hunk?.Lines ?? []).filter((line): line is DiffLine => line !== null)
}

function hunkEditLines(hunk: DiffHunk | undefined): string[] {
  return hunkLines(hunk).filter((line) => line.Type !== LineType.LineRemoved).map((line) => line.Content)
}

const totalLines = computed(() => hunks.value.reduce((sum, hunk) => sum + hunkLines(hunk).length, 0))
const gateVisible = computed(() => totalLines.value > LARGE_DIFF_LINES && !forceLarge.value)
const hasContent = computed(() => hunks.value.length > 0)
const canEditActive = computed(() => {
  if (props.readOnly || props.staged || props.fileLevelOnly || props.diff?.Deleted || props.diff?.Binary || gateVisible.value) return false
  if (props.loadEditorFile && props.saveEditorFile) return true
  const lines = hunkEditLines(activeHunk.value)
  return lines.length <= MAX_EDIT_LINES && lines.join('\n').length <= MAX_EDIT_CHARS
})
const editLineNumbers = computed(() => {
  const start = activeHunk.value?.NewStart ?? 1
  const count = Math.max(1, editValue.value.split('\n').length)
  return Array.from({ length: count }, (_, index) => start + index)
})

const lineStagingEnabled = computed(() => layout.value === 'unified' && !props.readOnly && !props.fileLevelOnly)

/* ---- expandable context between hunks -------------------------------- */

const expandedGaps = ref<Set<string>>(new Set())
const fileLines = ref<string[] | null>(null)
let contentLoading = false
let contentGeneration = 0
const contextError = ref('')
let failedGap: string | null = null

const gapsEnabled = computed(() => layout.value !== 'changes' && !props.fileLevelOnly && !!props.loadFileContent)

async function expandGap(id: string) {
  if (!props.loadFileContent) return
  const request = contentGeneration
  if (!fileLines.value && !contentLoading) {
    contentLoading = true
    contextError.value = ''
    failedGap = null
    try {
      const content = await props.loadFileContent()
      if (request !== contentGeneration) return
      fileLines.value = content.split('\n')
    } catch (error) {
      if (request === contentGeneration) {
        contextError.value = error instanceof Error ? error.message : String(error)
        failedGap = id
      }
    } finally {
      if (request === contentGeneration) contentLoading = false
    }
  }
  if (request === contentGeneration && fileLines.value) expandedGaps.value = new Set([...expandedGaps.value, id])
}

function retryContext() {
  if (failedGap) void expandGap(failedGap)
}

watch([() => props.diff, () => props.staged, () => props.loadFileContent], () => {
  contentGeneration++
  contentLoading = false
  contextError.value = ''
  failedGap = null
  fileLines.value = null
  expandedGaps.value = new Set()
})

/** synthesize a context DiffLine for an expanded gap row */
function contextCell(newLineNo: number, oldLineNo: number): LineCell | null {
  const raw = fileLines.value?.[newLineNo - 1]
  if (raw === undefined) return null
  const line = {
    Type: LineType.LineContext,
    Content: raw,
    OldLineNo: oldLineNo,
    NewLineNo: newLineNo,
    Selected: false,
  } as DiffLine
  return makeCell(line, -1, -1, null)
}

/* ---- cells + word-diff -------------------------------------------------- */

type LineCell = {
  line: DiffLine
  hunkIndex: number
  lineIndex: number
  content: string
  truncatedChars: number
  /** [start, end) char range that differs from the paired line */
  hl: [number, number] | null
}

type MergedCell = {
  hunkIndex: number
  old: DiffLine
  new: DiffLine
  prefix: string
  del: string
  ins: string
  suffix: string
}

type Row =
  | { kind: 'hunk'; hunkIndex: number; header: string }
  | { kind: 'line'; cell: LineCell }
  | { kind: 'pair'; left: LineCell | null; right: LineCell | null }
  | { kind: 'merged'; cell: MergedCell }
  | { kind: 'delmark'; count: number }
  | { kind: 'gap'; id: string; count: number | null; oldStart: number; newStart: number }

/** common-prefix/suffix trim — the changed middle of each side of a pair */
function charDiffRanges(a: string, b: string): [[number, number], [number, number]] {
  let prefix = 0
  const maxPrefix = Math.min(a.length, b.length)
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++
  let endA = a.length
  let endB = b.length
  while (endA > prefix && endB > prefix && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  return [[prefix, endA], [prefix, endB]]
}

function makeCell(line: DiffLine, hunkIdx: number, lineIdx: number, hl: [number, number] | null): LineCell {
  const over = line.Content.length - MAX_LINE_CHARS
  return {
    line,
    hunkIndex: hunkIdx,
    lineIndex: lineIdx,
    content: over > 0 ? line.Content.slice(0, MAX_LINE_CHARS) : line.Content,
    truncatedChars: Math.max(0, over),
    hl,
  }
}

/** pair removed/added runs within a hunk for split layout + word highlights */
function pairRuns(lines: DiffLine[]): Map<DiffLine, DiffLine> {
  const pairs = new Map<DiffLine, DiffLine>()
  let i = 0
  while (i < lines.length) {
    if (lines[i]!.Type !== LineType.LineRemoved) {
      i++
      continue
    }
    const removed: DiffLine[] = []
    while (i < lines.length && lines[i]!.Type === LineType.LineRemoved) removed.push(lines[i++]!)
    const added: DiffLine[] = []
    while (i < lines.length && lines[i]!.Type === LineType.LineAdded) added.push(lines[i++]!)
    for (let k = 0; k < Math.min(removed.length, added.length); k++) {
      pairs.set(removed[k]!, added[k]!)
      pairs.set(added[k]!, removed[k]!)
    }
  }
  return pairs
}

function highlightFor(line: DiffLine, pairs: Map<DiffLine, DiffLine>): [number, number] | null {
  if (!settings['diff.wordHighlights']) return null
  const other = pairs.get(line)
  if (!other) return null
  if (line.Content.length > MAX_LINE_CHARS || other.Content.length > MAX_LINE_CHARS) return null
  const [ra, rb] = charDiffRanges(
    line.Type === LineType.LineRemoved ? line.Content : other.Content,
    line.Type === LineType.LineRemoved ? other.Content : line.Content,
  )
  const range = line.Type === LineType.LineRemoved ? ra : rb
  return range[0] < range[1] ? range : null
}

function makeMerged(hunkIdx: number, oldLine: DiffLine, newLine: DiffLine): MergedCell {
  const [ra, rb] = charDiffRanges(oldLine.Content, newLine.Content)
  return {
    hunkIndex: hunkIdx,
    old: oldLine,
    new: newLine,
    prefix: newLine.Content.slice(0, rb[0]),
    del: oldLine.Content.slice(ra[0], ra[1]),
    ins: newLine.Content.slice(rb[0], rb[1]),
    suffix: newLine.Content.slice(rb[1]),
  }
}

/* ---- row building -------------------------------------------------------- */

const rowData = computed(() => {
  const mode = layout.value
  const rows: Row[] = []
  const hunkRowStart: number[] = []

  let prevOld = 1
  let prevNew = 1

  const pushGap = (id: string, count: number | null, oldStart: number, newStart: number) => {
    if (!gapsEnabled.value) return
    if (count !== null && count <= 0) return
    if (expandedGaps.value.has(id) && fileLines.value && count !== null) {
      for (let n = 0; n < count; n++) {
        const cell = contextCell(newStart + n, oldStart + n)
        if (!cell) break
        if (mode === 'split') rows.push({ kind: 'pair', left: cell, right: cell })
        else rows.push({ kind: 'line', cell })
      }
      return
    }
    rows.push({ kind: 'gap', id, count, oldStart, newStart })
  }

  hunks.value.forEach((hunk, hunkIdx) => {
    if (Number.isFinite(hunk.NewStart) && hunk.NewStart > prevNew) {
      pushGap(`gap-${hunkIdx}`, hunk.NewStart - prevNew, prevOld, prevNew)
    }
    hunkRowStart.push(rows.length)
    rows.push({ kind: 'hunk', hunkIndex: hunkIdx, header: hunk.Header })
    prevNew = hunk.NewStart + hunk.NewCount
    prevOld = hunk.OldStart + hunk.OldCount

    const lines = hunkLines(hunk)
    const pairs = pairRuns(lines)
    const cellOf = (idx: number) => makeCell(lines[idx]!, hunkIdx, idx, highlightFor(lines[idx]!, pairs))

    if (mode === 'unified') {
      lines.forEach((line, lineIdx) => {
        rows.push({ kind: 'line', cell: makeCell(line, hunkIdx, lineIdx, highlightFor(line, pairs)) })
      })
      return
    }

    if (mode === 'changes') {
      lines.forEach((line, lineIdx) => {
        if (line.Type === LineType.LineContext) return
        rows.push({ kind: 'line', cell: makeCell(line, hunkIdx, lineIdx, highlightFor(line, pairs)) })
      })
      return
    }

    if (mode === 'result') {
      let i = 0
      while (i < lines.length) {
        const line = lines[i]!
        if (line.Type === LineType.LineRemoved) {
          let count = 0
          while (i < lines.length && lines[i]!.Type === LineType.LineRemoved) {
            count++
            i++
          }
          rows.push({ kind: 'delmark', count })
          continue
        }
        rows.push({ kind: 'line', cell: cellOf(i) })
        i++
      }
      return
    }

    if (mode === 'inline') {
      let i = 0
      while (i < lines.length) {
        const line = lines[i]!
        if (line.Type !== LineType.LineRemoved) {
          rows.push({ kind: 'line', cell: cellOf(i) })
          i++
          continue
        }
        const removed: number[] = []
        while (i < lines.length && lines[i]!.Type === LineType.LineRemoved) removed.push(i++)
        const added: number[] = []
        while (i < lines.length && lines[i]!.Type === LineType.LineAdded) added.push(i++)
        const span = Math.max(removed.length, added.length)
        for (let k = 0; k < span; k++) {
          const oldIdx = removed[k]
          const newIdx = added[k]
          const oldLine = oldIdx === undefined ? undefined : lines[oldIdx]!
          const newLine = newIdx === undefined ? undefined : lines[newIdx]!
          if (
            oldLine && newLine &&
            oldLine.Content.length <= MAX_LINE_CHARS && newLine.Content.length <= MAX_LINE_CHARS
          ) {
            rows.push({ kind: 'merged', cell: makeMerged(hunkIdx, oldLine, newLine) })
          } else {
            if (oldIdx !== undefined) rows.push({ kind: 'line', cell: cellOf(oldIdx) })
            if (newIdx !== undefined) rows.push({ kind: 'line', cell: cellOf(newIdx) })
          }
        }
      }
      return
    }

    // split: paired rows over removed/added runs
    let i = 0
    while (i < lines.length) {
      const line = lines[i]!
      if (line.Type === LineType.LineContext) {
        const cell = makeCell(line, hunkIdx, i, null)
        rows.push({ kind: 'pair', left: cell, right: cell })
        i++
        continue
      }
      const removed: number[] = []
      while (i < lines.length && lines[i]!.Type === LineType.LineRemoved) removed.push(i++)
      const added: number[] = []
      while (i < lines.length && lines[i]!.Type === LineType.LineAdded) added.push(i++)

      const span = Math.max(removed.length, added.length)
      for (let k = 0; k < span; k++) {
        const leftIdx = removed[k]
        const rightIdx = added[k]
        rows.push({
          kind: 'pair',
          left: leftIdx === undefined ? null : cellOf(leftIdx),
          right: rightIdx === undefined ? null : cellOf(rightIdx),
        })
      }
    }
  })

  // trailing context — length unknown until the file content is loaded
  if (hunks.value.length && Number.isFinite(prevNew)) {
    const trailing = fileLines.value ? fileLines.value.length - (prevNew - 1) : null
    pushGap('gap-end', trailing, prevOld, prevNew)
  }

  return { rows, hunkRowStart }
})

const { window: vwindow, scrollToRow } = useVirtualWindow({
  count: () => (gateVisible.value ? 0 : rowData.value.rows.length),
  rowHeight,
  container,
})

const slice = computed(() => {
  const window = vwindow.value
  const rows = rowData.value.rows.slice(window.start, window.end).map((row, offset) => ({ row, index: window.start + offset, pinned: false }))
  // Keep an active input mounted if its row scrolls outside the virtual window.
  if (props.cursorReview && editMode.value && (cursorRow.value < window.start || cursorRow.value >= window.end)) {
    const row = rowData.value.rows[cursorRow.value]
    if (row) rows.push({ row, index: cursorRow.value, pinned: true })
  }
  return rows
})

const cursorCell = computed(() => {
  const row = rowData.value.rows[cursorRow.value]
  return row?.kind === 'line' ? row.cell : null
})
const canEditCursor = computed(() => canEditActive.value && !!cursorCell.value &&
  cursorCell.value.hunkIndex >= 0 && cursorCell.value.line.Type !== LineType.LineRemoved &&
  !cursorCell.value.truncatedChars)

function openSearch() {
  searchOpen.value = true
  void nextTick(() => container.value?.querySelector<HTMLInputElement>('.cursor-search')?.focus())
}
function closeSearch() {
  searchOpen.value = false
  container.value?.focus({ preventScroll: true })
}
function findNext() {
  if (!searchQuery.value) return
  const rows = rowData.value.rows
  for (let step = 1; step <= rows.length; step++) {
    const index = (cursorRow.value + step) % rows.length
    const row = rows[index]
    if (row?.kind === 'line' && row.cell.content.toLowerCase().includes(searchQuery.value.toLowerCase())) {
      closeSearch()
      selectCursor(index)
      return
    }
  }
}
function selectCursor(index: number) {
  if (editMode.value) return
  const row = rowData.value.rows[index]
  if (row?.kind !== 'line') return
  if (lineMode.value && row.cell.hunkIndex !== hunkIndex.value) return
  cursorRow.value = index
  hunkIndex.value = row.cell.hunkIndex
  lineCursor.value = row.cell.lineIndex
  if (!lineMode.value) lineAnchor.value = lineCursor.value
  container.value?.focus({ preventScroll: true })
  // Account for the sticky file header when bringing a row into view.
  const el = container.value
  const head = (el?.querySelector('.diff-file-head')?.getBoundingClientRect().height ?? 0) + (el?.querySelector('.cursor-review-actions')?.getBoundingClientRect().height ?? 0)
  if (el) {
    const top = index * rowHeight.value
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowHeight.value > el.scrollTop + el.clientHeight - head) {
      el.scrollTop = Math.max(0, top + rowHeight.value - el.clientHeight + head)
    }
  }
}
function moveCursor(direction: number) {
  for (let i = cursorRow.value + direction; i >= 0 && i < rowData.value.rows.length; i += direction) {
    if (rowData.value.rows[i]?.kind === 'line') { selectCursor(i); return }
  }
}
function jumpHunk(index: number) {
  if (editMode.value) return
  if (!props.cursorReview) { hunkIndex.value = index; container.value?.focus({ preventScroll: true }); return }
  const target = Math.max(0, Math.min(hunks.value.length - 1, index))
  const row = rowData.value.rows.findIndex(item => item.kind === 'line' && item.cell.hunkIndex === target)
  if (row >= 0) selectCursor(row)
}
watch(rowData, (data) => {
  if (!props.cursorReview) return
  const index = data.rows.findIndex(row => row.kind === 'line' && row.cell.hunkIndex === hunkIndex.value && row.cell.lineIndex === lineCursor.value)
  cursorRow.value = index >= 0 ? index : Math.max(0, data.rows.findIndex(row => row.kind === 'line'))
  const cell = cursorCell.value
  if (cell) { hunkIndex.value = cell.hunkIndex; lineCursor.value = cell.lineIndex }
}, { immediate: true })

/* ---- selection / keyboard ------------------------------------------------ */

const lineSelection = computed<[number, number]>(() => [
  Math.min(lineAnchor.value, lineCursor.value),
  Math.max(lineAnchor.value, lineCursor.value),
])

function isLineSelected(hunkIdx: number, lineIdx: number) {
  if (!lineMode.value || hunkIdx !== hunkIndex.value) return false
  const [lo, hi] = lineSelection.value
  return lineIdx >= lo && lineIdx <= hi
}

function scrollToHunk() {
  scrollToRow(rowData.value.hunkRowStart[hunkIndex.value] ?? 0)
}

function scrollToLine() {
  if (props.cursorReview) {
    const index = rowData.value.rows.findIndex(row => row.kind === 'line' && row.cell.hunkIndex === hunkIndex.value && row.cell.lineIndex === lineCursor.value)
    if (index >= 0) selectCursor(index)
  } else scrollToRow((rowData.value.hunkRowStart[hunkIndex.value] ?? 0) + 1 + lineCursor.value)
}

function enterLineMode() {
  if (!lineStagingEnabled.value) return
  const lines = hunkLines(activeHunk.value)
  if (!lines.length) return
  const first = lines.findIndex((line) => stageableTypes.has(line.Type))
  lineMode.value = true
  if (!props.cursorReview) lineCursor.value = Math.max(0, first)
  lineAnchor.value = lineCursor.value
  emit('modechange', 'visual')
}

function leaveLineMode() {
  lineMode.value = false
  emit('modechange', 'hunk')
}

async function editDiffLine(index: number) {
  if (editMode.value || editorLoading.value || props.readOnly || props.staged) return
  if (lineMode.value) leaveLineMode()
  selectCursor(index)
  // Let the clicked row's highlight settle before measuring its screen position.
  await nextTick()
  await enterEditMode()
}

async function enterEditMode() {
  if (props.loadEditorFile && props.saveEditorFile) {
    if (!canEditActive.value || editorLoading.value || editMode.value) return
    const request = ++editorRequest
    editorLoading.value = true
    editorError.value = ''
    const selectedRow = container.value?.querySelector('.diff-line.line-cursor') ?? container.value?.querySelector('.diff-hunk.active')
    const actions = container.value?.querySelector('.cursor-review-actions')
    const lineOffset = selectedRow && actions ? Math.max(0, selectedRow.getBoundingClientRect().top - actions.getBoundingClientRect().bottom) : 0
    const line = cursorCell.value?.line.NewLineNo || activeHunk.value?.NewStart || 1
    try {
      const content = await props.loadEditorFile()
      if (request !== editorRequest) return
      if (new TextEncoder().encode(content).length > 1024 * 1024 || content.split('\n').length > 20000) throw new Error('Editing is limited to 1 MiB and 20,000 lines.')
      fileWasSaved = false
      fileBuffer.value = content
      fileEditorLine.value = line
      fileEditorLineOffset.value = lineOffset
      lineMode.value = false
      editMode.value = true
      emit('modechange', 'edit')
      await nextTick()
      if (container.value) container.value.scrollTop = 0
    } catch (err) { if (request === editorRequest) editorError.value = String(err) }
    finally { if (request === editorRequest) editorLoading.value = false }
    return
  }
  if (!canEditActive.value || !activeHunk.value) return
  if (props.cursorReview && !canEditCursor.value) return
  lineMode.value = false
  searchOpen.value = false
  editValue.value = props.cursorReview ? cursorCell.value!.line.Content : hunkEditLines(activeHunk.value).join('\n')
  editMode.value = true
  emit('modechange', 'edit')
  void nextTick(focusEditor)
}

function leaveEditMode() {
  const wasFile = fileBuffer.value !== null
  fileBuffer.value = null
  editMode.value = false
  emit('modechange', 'hunk')
  if (wasFile) { emit('fileEditorClosed', fileWasSaved); fileWasSaved = false }
  void nextTick(() => { container.value?.focus(); if (wasFile) scrollToLine() })
}

function onFileSaved(intent: { close: boolean }) {
  fileWasSaved = true
  if (intent.close) leaveEditMode()
}

function saveEditMode() {
  const hunk = activeHunk.value
  if (!hunk) return
  if (!canEditActive.value) return
  const replacement = props.cursorReview ? hunkLines(hunk).filter(line => line.Type !== LineType.LineRemoved).map(line => line === cursorCell.value?.line ? editValue.value : line.Content) : editValue.value === '' ? [] : editValue.value.split('\n')
  editMode.value = false
  emit('modechange', 'hunk')
  emit('editHunk', hunk, replacement)
  void nextTick(() => container.value?.focus({ preventScroll: true }))
}

function onEditKey(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    leaveEditMode()
    return
  }
  if ((props.cursorReview && event.key === 'Enter') || (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) || (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey))) {
    event.preventDefault()
    saveEditMode()
  }
}

function syncEditScroll() {
  if (editTextArea.value && editLineNoEl.value) editLineNoEl.value.scrollTop = editTextArea.value.scrollTop
}

function stageActive() {
  if (props.fileLevelOnly || gateVisible.value) {
    emit('stageFile')
    return
  }
  const hunk = activeHunk.value
  if (hunk) emit('stageHunk', hunk)
}

function stageSelectedLines() {
  const hunk = activeHunk.value
  if (!hunk) return
  const [lo, hi] = lineSelection.value
  const lines = hunkLines(hunk)
    .slice(lo, hi + 1)
    .filter((line) => stageableTypes.has(line.Type))
  if (!lines.length) return
  leaveLineMode()
  emit('stageLines', hunk, lines)
}

function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || isEditable(event.target) || isModified(event)) return
  const key = event.key
  if (props.readOnly && ['s', 'S', 'v', 'e'].includes(key)) { event.preventDefault(); return }
  if (editMode.value) return
  if (props.cursorReview && !lineMode.value) {
    let handled = true
    switch (key) {
      case 'j': case 'ArrowDown': moveCursor(1); break
      case 'k': case 'ArrowUp': moveCursor(-1); break
      case ']': jumpHunk(hunkIndex.value + 1); break
      case '[': jumpHunk(hunkIndex.value - 1); break
      case 'g':
        if (Date.now() - pendingG < 600) selectCursor(rowData.value.rows.findIndex(row => row.kind === 'line'))
        pendingG = Date.now(); break
      case 'G': {
        let last = rowData.value.rows.length - 1
        while (last >= 0 && rowData.value.rows[last]?.kind !== 'line') last--
        selectCursor(last); break
      }
      case '/': openSearch(); break
      case 'n': findNext(); break
      case 'Escape': if (searchOpen.value) closeSearch(); else emit('exit'); break
      case 't': break
      default: handled = false
    }
    if (key !== 'g') pendingG = 0
    if (handled) { event.preventDefault(); return }
  }
  if (lineMode.value) {
    const max = hunkLines(activeHunk.value).length - 1
    switch (key) {
      case 'j': case 'ArrowDown':
        lineCursor.value = Math.min(max, lineCursor.value + 1)
        scrollToLine()
        break
      case 'k': case 'ArrowUp':
        lineCursor.value = Math.max(0, lineCursor.value - 1)
        scrollToLine()
        break
      case 's':
        stageSelectedLines()
        break
      case 'v': case 'Escape': case 'h': case 'ArrowLeft':
        leaveLineMode()
        break
      default:
        return
    }
    event.preventDefault()
    return
  }
  switch (key) {
    case 'j': case 'ArrowDown':
      hunkIndex.value = Math.min(hunks.value.length - 1, hunkIndex.value + 1)
      scrollToHunk()
      break
    case 'k': case 'ArrowUp':
      hunkIndex.value = Math.max(0, hunkIndex.value - 1)
      scrollToHunk()
      break
    case 's':
      stageActive()
      break
    case 'S':
      emit('stageFile')
      break
    case 'v':
      enterLineMode()
      break
    case 'e':
      enterEditMode()
      break
    case 't':
      cycleLayout()
      break
    case 'h': case 'Escape': case 'ArrowLeft':
      emit('exit')
      break
    default:
      return
  }
  event.preventDefault()
}

// new file under the cursor → reset; same file refreshed → just clamp
watch([() => props.diff?.Path, () => props.staged], () => {
  editorRequest++
  editorLoading.value = false
  editorError.value = ''
  fileBuffer.value = null
  searchOpen.value = false
  searchQuery.value = ''
  hunkIndex.value = 0
  lineCursor.value = 0
  cursorRow.value = Math.max(0, rowData.value.rows.findIndex(row => row.kind === 'line'))
  lineMode.value = false
  editMode.value = false
  forceLarge.value = false
  if (container.value) container.value.scrollTop = 0
})

watch(hunks, (list) => {
  if (editMode.value && fileBuffer.value === null) leaveEditMode()
  if (lineMode.value) leaveLineMode()
  lineCursor.value = Math.min(lineCursor.value, Math.max(0, hunkLines(list[hunkIndex.value]).length - 1))
  hunkIndex.value = Math.min(hunkIndex.value, Math.max(0, list.length - 1))
})

function focusEditor() {
  if (!editMode.value) return
  if (fileBuffer.value !== null) { fileEditor.value?.focus(); return }
  if (props.cursorReview) container.value?.querySelector<HTMLInputElement>('.diff-inline-editor')?.focus({ preventScroll: true })
  else editTextArea.value?.focus()
}
function focus() {
  container.value?.focus()
  focusEditor()
}

async function revealHunk(index: number, takeFocus = true) {
  if (!Number.isInteger(index) || index < 0 || index >= hunks.value.length || editMode.value) return
  forceLarge.value = true
  hunkIndex.value = index
  await nextTick()
  scrollToHunk()
  if (takeFocus) focus()
}

defineExpose({ focus, revealHunk, hasContent, getMode: () => editMode.value ? 'edit' as const : lineMode.value ? 'visual' as const : 'hunk' as const })

const stageVerb = computed(() => (props.staged ? 'unstage' : 'stage'))
const editHint = computed(() => canEditActive.value ? ' · e edit' : '')
</script>

<template>
  <section
    ref="container"
    class="diff-view"
    :class="[`layout-${layout}`, { 'cursor-review': cursorReview, 'editing-file': fileBuffer !== null }]"
    :style="{ '--diff-row-h': `${rowHeight}px` }"
    tabindex="0"
    aria-label="Diff"
    data-keyboard-pane
    @keydown="onKey" @focus.self="focusEditor"
  >
    <slot name="head" />

    <FileEditor v-if="fileBuffer !== null && saveEditorFile" ref="fileEditor" :content="fileBuffer" :line="fileEditorLine" :line-offset="fileEditorLineOffset" :save="saveEditorFile" @close="leaveEditMode" @saved="onFileSaved" />
    <div v-if="editorError" role="alert" class="diff-state">{{ editorError }}</div>
    <div v-if="contextError" role="alert" class="diff-state">Unable to load unchanged lines: {{ contextError }} <UiButton size="sm" @click="retryContext">Retry</UiButton></div>
    <div v-if="editorLoading" role="status">Opening file…</div>
    <div v-if="fileBuffer === null && cursorReview && hasContent && !gateVisible" class="cursor-review-actions">
      <span>{{ editMode ? 'EDIT' : lineMode ? 'VISUAL' : 'NORMAL' }}</span>
      <template v-if="editMode">
        <UiButton size="sm" variant="ghost" @click="leaveEditMode">Cancel</UiButton>
        <UiButton size="sm" variant="primary" @click="saveEditMode">Save</UiButton>
      </template>
      <template v-else>
        <form v-if="searchOpen" @submit.prevent="findNext"><input v-model="searchQuery" class="cursor-search ui-field" aria-label="Search diff" @keydown.esc.stop.prevent="closeSearch" /></form>
        <UiButton size="sm" variant="ghost" title="Find in diff (/)" @click="openSearch">Find</UiButton>
        <UiButton size="sm" variant="ghost" :disabled="!canEditCursor" @click="enterEditMode">{{ loadEditorFile ? 'Edit file' : 'Edit line' }}</UiButton>
        <UiButton v-if="!readOnly && !fileLevelOnly" size="sm" variant="ghost" :disabled="!activeHunk" @click="lineMode ? stageSelectedLines() : stageActive()">{{ staged ? 'Unstage' : 'Stage' }} {{ lineMode ? 'lines' : 'hunk' }}</UiButton>
      </template>
    </div>
    <template v-if="fileBuffer === null">
    <div v-if="!hasContent" class="diff-state">
      <slot name="empty">No diff to show.</slot>
    </div>

    <div v-else-if="gateVisible" class="diff-gate">
      <strong>Large diff</strong>
      <span>{{ totalLines.toLocaleString() }} lines across {{ hunks.length }} hunks</span>
      <div class="diff-gate-actions">
        <UiButton @click="forceLarge = true">Load anyway</UiButton>
        <span v-if="!readOnly" class="diff-gate-hint"><kbd>s</kbd> {{ stageVerb }} entire file</span>
      </div>
    </div>

    <div v-else-if="editMode && !cursorReview" class="diff-edit-panel">
      <div class="diff-hunk active">
        <span class="hunk-header-text">{{ activeHunk?.Header }}</span>
        <span class="hunk-stage-hint"><kbd>⌃⏎</kbd> save</span>
      </div>
      <textarea
        ref="editTextArea"
        v-model="editValue"
        class="diff-edit-textarea"
        spellcheck="false"
        @scroll="syncEditScroll"
        @keydown.stop="onEditKey"
      /><pre ref="editLineNoEl" class="diff-edit-line-nos" aria-hidden="true">{{ editLineNumbers.join('\n') }}</pre>
    </div>

    <div v-else class="diff-spacer" :style="{ height: `${vwindow.totalHeight}px` }">
      <div class="diff-rows" :style="{ transform: `translateY(${vwindow.offsetY}px)` }">
        <template v-for="{ row, index, pinned } in slice" :key="index">
          <button
            v-if="row.kind === 'gap'"
            class="diff-gap"
            type="button"
            :disabled="!props.loadFileContent"
            @click="expandGap(row.id)"
          >
            ··· {{ row.count === null ? 'expand to end of file' : `${row.count.toLocaleString()} unchanged ${row.count === 1 ? 'line' : 'lines'}` }}
          </button>

          <div
            v-else-if="row.kind === 'hunk'"
            class="diff-hunk"
            :class="{ active: row.hunkIndex === hunkIndex }"
            @click="jumpHunk(row.hunkIndex)"
          >
            <span class="hunk-header-text">{{ row.header }}</span>
            <span v-if="!cursorReview && !props.readOnly && !props.fileLevelOnly" class="hunk-stage-hint"><kbd>s</kbd> {{ stageVerb }} hunk{{ row.hunkIndex === hunkIndex ? editHint : '' }}</span>
          </div>

          <div v-else-if="row.kind === 'delmark'" class="diff-delmark">
            − {{ row.count }} removed {{ row.count === 1 ? 'line' : 'lines' }}
          </div>

          <div v-else-if="row.kind === 'merged'" class="diff-line diff-merged" :class="{ 'in-active-hunk': row.cell.hunkIndex === hunkIndex }">
            <span class="line-no">{{ row.cell.old.OldLineNo || '' }}</span>
            <span class="line-no">{{ row.cell.new.NewLineNo || '' }}</span>
            <span class="line-sign">~</span>
            <span class="line-content">{{ row.cell.prefix }}<del v-if="row.cell.del">{{ row.cell.del }}</del><ins v-if="row.cell.ins">{{ row.cell.ins }}</ins>{{ row.cell.suffix }}</span>
          </div>

          <div
            v-else-if="row.kind === 'line'"
            class="diff-line"
            :class="{
              add: row.cell.line.Type === LineType.LineAdded,
              del: row.cell.line.Type === LineType.LineRemoved,
              'in-active-hunk': row.cell.hunkIndex === hunkIndex,
              'line-selected': isLineSelected(row.cell.hunkIndex, row.cell.lineIndex),
              'line-cursor': cursorReview ? index === cursorRow : lineMode && row.cell.hunkIndex === hunkIndex && row.cell.lineIndex === lineCursor,
            }"
            :style="pinned ? { position: 'absolute', top: `${index * rowHeight - vwindow.offsetY}px`, width: '100%' } : undefined"
            :aria-current="cursorReview && index === cursorRow ? 'true' : undefined"
            @click="cursorReview && selectCursor(index)"
            @dblclick.stop.prevent="editDiffLine(index)"
          >
            <span v-if="cursorReview" class="diff-cursor-marker" aria-hidden="true">{{ index === cursorRow ? '›' : '' }}</span>
            <span class="line-no">{{ row.cell.line.OldLineNo || '' }}</span>
            <span class="line-no">{{ row.cell.line.NewLineNo || '' }}</span>
            <span class="line-sign">{{ row.cell.line.Type === LineType.LineAdded ? '+' : row.cell.line.Type === LineType.LineRemoved ? '-' : ' ' }}</span>
            <input v-if="cursorReview && editMode && index === cursorRow"
              v-model="editValue" class="diff-inline-editor" aria-label="Edit line" spellcheck="false" autocomplete="off"
              :style="{ minWidth: `${Math.max(editValue.length, row.cell.content.length, 20) + 2}ch` }"
              :maxlength="MAX_LINE_CHARS" @click.stop @keydown.stop="onEditKey" />
            <span v-else class="line-content">
              <template v-if="row.cell.hl">{{ row.cell.content.slice(0, row.cell.hl[0]) }}<mark>{{ row.cell.content.slice(row.cell.hl[0], row.cell.hl[1]) }}</mark>{{ row.cell.content.slice(row.cell.hl[1]) }}</template>
              <template v-else>{{ row.cell.content }}</template>
              <i v-if="row.cell.truncatedChars" class="line-truncated">… +{{ row.cell.truncatedChars.toLocaleString() }} chars</i>
            </span>
          </div>

          <div v-else-if="row.kind === 'pair'" class="diff-line split-pair">
            <span class="line-no">{{ row.left?.line.OldLineNo || '' }}</span>
            <span
              class="split-cell"
              :class="{ del: row.left && row.left.line.Type === LineType.LineRemoved, filler: !row.left }"
            >
              <template v-if="row.left?.hl">{{ row.left.content.slice(0, row.left.hl[0]) }}<mark>{{ row.left.content.slice(row.left.hl[0], row.left.hl[1]) }}</mark>{{ row.left.content.slice(row.left.hl[1]) }}</template>
              <template v-else>{{ row.left?.content ?? '' }}</template>
            </span>
            <span class="line-no">{{ row.right?.line.NewLineNo || '' }}</span>
            <span
              class="split-cell"
              :class="{ add: row.right && row.right.line.Type === LineType.LineAdded, filler: !row.right }"
            >
              <template v-if="row.right?.hl">{{ row.right.content.slice(0, row.right.hl[0]) }}<mark>{{ row.right.content.slice(row.right.hl[0], row.right.hl[1]) }}</mark>{{ row.right.content.slice(row.right.hl[1]) }}</template>
              <template v-else>{{ row.right?.content ?? '' }}</template>
            </span>
          </div>
        </template>
      </div>
    </div>
    </template>
  </section>
</template>

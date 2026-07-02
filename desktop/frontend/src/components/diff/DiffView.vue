<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useShellSettings } from '../../composables/useShellSettings'
import { useVirtualWindow } from '../../composables/useVirtualWindow'
import { LineType, type DiffHunk, type DiffLine, type FileDiff } from '../../bindings/github.com/atterpac/ichi/internal/git'

const props = defineProps<{
  diff: FileDiff | null
  staged?: boolean
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
  exit: []
  modechange: [mode: 'hunk' | 'visual' | 'edit']
}>()

const settings = useShellSettings()

const MAX_LINE_CHARS = 1000
const MAX_EDIT_LINES = 300
const MAX_EDIT_CHARS = 30000
const LARGE_DIFF_LINES = 5000
const DENSITY_HEIGHTS = { compact: 17, comfortable: 20, relaxed: 24 } as const

const rowHeight = computed(() => DENSITY_HEIGHTS[settings.diffDensity])
const layout = computed(() => settings.diffLayout)

const LAYOUT_CYCLE = ['unified', 'split', 'inline', 'changes', 'result'] as const

function cycleLayout() {
  const index = LAYOUT_CYCLE.indexOf(layout.value)
  settings.diffLayout = LAYOUT_CYCLE[(index + 1) % LAYOUT_CYCLE.length]!
}

const container = ref<HTMLElement | null>(null)
const hunkIndex = ref(0)
const lineMode = ref(false)
const lineCursor = ref(0)
const lineAnchor = ref(0)
const forceLarge = ref(false)
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
  if (props.staged || props.fileLevelOnly || props.diff?.Deleted || props.diff?.Binary || gateVisible.value) return false
  const lines = hunkEditLines(activeHunk.value)
  return lines.length <= MAX_EDIT_LINES && lines.join('\n').length <= MAX_EDIT_CHARS
})
const editLineNumbers = computed(() => {
  const start = activeHunk.value?.NewStart ?? 1
  const count = Math.max(1, editValue.value.split('\n').length)
  return Array.from({ length: count }, (_, index) => start + index)
})

const lineStagingEnabled = computed(() => layout.value === 'unified' && !props.fileLevelOnly)

/* ---- expandable context between hunks -------------------------------- */

const expandedGaps = ref<Set<string>>(new Set())
const fileLines = ref<string[] | null>(null)
let contentLoading = false

const gapsEnabled = computed(() => layout.value !== 'changes' && !props.fileLevelOnly && !!props.loadFileContent)

async function expandGap(id: string) {
  if (!props.loadFileContent) return
  if (!fileLines.value && !contentLoading) {
    contentLoading = true
    try {
      fileLines.value = (await props.loadFileContent()).split('\n')
    } catch {
      /* context expansion is best-effort; the diff itself is unaffected */
    } finally {
      contentLoading = false
    }
  }
  if (fileLines.value) expandedGaps.value = new Set([...expandedGaps.value, id])
}

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
  if (!settings.diffWordHighlights) return null
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

const slice = computed(() => rowData.value.rows.slice(vwindow.value.start, vwindow.value.end))

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
  scrollToRow((rowData.value.hunkRowStart[hunkIndex.value] ?? 0) + 1 + lineCursor.value)
}

function enterLineMode() {
  if (!lineStagingEnabled.value) return
  const lines = hunkLines(activeHunk.value)
  if (!lines.length) return
  const first = lines.findIndex((line) => stageableTypes.has(line.Type))
  lineMode.value = true
  lineCursor.value = Math.max(0, first)
  lineAnchor.value = lineCursor.value
  emit('modechange', 'visual')
}

function leaveLineMode() {
  lineMode.value = false
  emit('modechange', 'hunk')
}

function enterEditMode() {
  if (!canEditActive.value || !activeHunk.value) return
  lineMode.value = false
  editValue.value = hunkEditLines(activeHunk.value).join('\n')
  editMode.value = true
  emit('modechange', 'edit')
  void nextTick(() => editTextArea.value?.focus())
}

function leaveEditMode() {
  editMode.value = false
  emit('modechange', 'hunk')
  void nextTick(() => container.value?.focus())
}

function saveEditMode() {
  const hunk = activeHunk.value
  if (!hunk) return
  const replacement = editValue.value === '' ? [] : editValue.value.split('\n')
  editMode.value = false
  emit('modechange', 'hunk')
  emit('editHunk', hunk, replacement)
}

function onEditKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    leaveEditMode()
    return
  }
  if ((event.key === 'Enter' && (event.ctrlKey || event.metaKey)) || (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey))) {
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
  const key = event.key
  if (editMode.value) return
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
      case 'v': case 'Escape':
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
    case 'h': case 'Escape':
      emit('exit')
      break
    default:
      return
  }
  event.preventDefault()
}

// new file under the cursor → reset; same file refreshed → just clamp
watch(() => props.diff?.Path, () => {
  hunkIndex.value = 0
  lineMode.value = false
  editMode.value = false
  forceLarge.value = false
  expandedGaps.value = new Set()
  fileLines.value = null
  if (container.value) container.value.scrollTop = 0
})

watch(hunks, (list) => {
  hunkIndex.value = Math.min(hunkIndex.value, Math.max(0, list.length - 1))
})

function focus() {
  container.value?.focus()
}

defineExpose({ focus, hasContent })

const stageVerb = computed(() => (props.staged ? 'unstage' : 'stage'))
const editHint = computed(() => canEditActive.value ? ' · e edit' : '')
</script>

<template>
  <section
    ref="container"
    class="diff-view"
    :class="`layout-${layout}`"
    :style="{ '--diff-row-h': `${rowHeight}px` }"
    tabindex="0"
    aria-label="Diff"
    @keydown="onKey"
  >
    <slot name="head" />

    <div v-if="!hasContent" class="diff-state">
      <slot name="empty">No diff to show.</slot>
    </div>

    <div v-else-if="gateVisible" class="diff-gate">
      <strong>Large diff</strong>
      <span>{{ totalLines.toLocaleString() }} lines across {{ hunks.length }} hunks</span>
      <div class="diff-gate-actions">
        <button type="button" @click="forceLarge = true">Load anyway</button>
        <span class="diff-gate-hint"><kbd>s</kbd> {{ stageVerb }} entire file</span>
      </div>
    </div>

    <div v-else-if="editMode" class="diff-edit-panel">
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
        <template v-for="(row, i) in slice" :key="vwindow.start + i">
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
            @click="hunkIndex = row.hunkIndex"
          >
            <span class="hunk-header-text">{{ row.header }}</span>
            <span v-if="!props.fileLevelOnly" class="hunk-stage-hint"><kbd>s</kbd> {{ stageVerb }} hunk{{ row.hunkIndex === hunkIndex ? editHint : '' }}</span>
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
              'line-cursor': lineMode && row.cell.hunkIndex === hunkIndex && row.cell.lineIndex === lineCursor,
            }"
          >
            <span class="line-no">{{ row.cell.line.OldLineNo || '' }}</span>
            <span class="line-no">{{ row.cell.line.NewLineNo || '' }}</span>
            <span class="line-sign">{{ row.cell.line.Type === LineType.LineAdded ? '+' : row.cell.line.Type === LineType.LineRemoved ? '-' : ' ' }}</span>
            <span class="line-content">
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
  </section>
</template>

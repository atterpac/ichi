<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { editorLine, reviewSamples, type ReviewLine } from './review-samples'

type Mode = 'cursor' | 'focus' | 'lens'
const concepts: { id: Mode; title: string; description: string }[] = [
  {
    id: 'cursor',
    title: '01 / Cursor review',
    description:
      'A continuous diff with a persistent line cursor. Move through code; keep every action within reach.',
  },
  {
    id: 'focus',
    title: '02 / Hunk focus',
    description:
      'One change at a time. Mark it reviewed, move forward, and keep a visible trail of what remains.',
  },
  {
    id: 'lens',
    title: '03 / Result lens',
    description:
      'Read the resulting code. Toggle the active hunk to its original version to understand what changed.',
  },
]
const mode = ref<Mode>('cursor')
const theme = ref('tokyonight-night')
watch(
  theme,
  (value, previous) => {
    if (previous) document.documentElement.classList.remove(`theme-${previous}`)
    document.documentElement.classList.add(`theme-${value}`)
  },
  { immediate: true },
)
const files = ref(reviewSamples())
const fileIndex = ref(0)
const hunkIndex = ref(0)
const lineId = ref(files.value[0]!.hunks[0]!.lines[0]!.id)
const before = ref(false)
const reviewed = ref(new Set<string>())
const positions = new Map<string, { hunk: number; line: string }>()
const surface = ref<HTMLElement>()
const searchInput = ref<HTMLInputElement>()
const editing = ref(false)
const editText = ref('')
const searching = ref(false)
const query = ref('')
const handoff = ref(false)
const notice = ref('Click a line or focus the code, then use j / k to start reviewing.')
const file = computed(() => files.value[fileIndex.value]!)
const hunk = computed(() => file.value.hunks[hunkIndex.value]!)
const current = computed(() => hunk.value.lines.find((line) => line.id === lineId.value))
const description = computed(() => concepts.find((item) => item.id === mode.value)!.description)
const totalHunks = computed(() => files.value.reduce((total, item) => total + item.hunks.length, 0))
const targetLine = computed(() => (current.value ? editorLine(hunk.value, current.value) : null))
const canEdit = computed(
  () => !!current.value && current.value.next !== null && !(mode.value === 'lens' && before.value),
)
const canOpen = computed(
  () => targetLine.value !== null && !(mode.value === 'lens' && before.value),
)
const visibleHunks = computed(() => (mode.value === 'cursor' ? file.value.hunks : [hunk.value]))
function visibleLines(lines: ReviewLine[]) {
  return mode.value !== 'lens'
    ? lines
    : lines.filter((line) => (before.value ? line.kind !== 'add' : line.kind !== 'del'))
}
const rows = computed(() =>
  visibleHunks.value.flatMap((item) =>
    visibleLines(item.lines).map((line) => ({ hunk: item, line })),
  ),
)
const matches = computed(() =>
  query.value
    ? rows.value.filter((row) => row.line.text.toLowerCase().includes(query.value.toLowerCase()))
    : [],
)

function focusCode() {
  void nextTick(() => surface.value?.focus({ preventScroll: true }))
}
function reveal() {
  void nextTick(() =>
    surface.value
      ?.querySelector('.code-line.current')
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }),
  )
}
function selectLine(hunkId: string, id: string) {
  if (editing.value) return
  hunkIndex.value = file.value.hunks.findIndex((item) => item.id === hunkId)
  lineId.value = id
  handoff.value = false
  focusCode()
  reveal()
}
function selectHunk(index: number) {
  hunkIndex.value = Math.max(0, Math.min(file.value.hunks.length - 1, index))
  const lines = visibleLines(hunk.value.lines)
  lineId.value = (lines.find((line) => line.kind !== 'context') ?? lines[0])?.id ?? ''
  handoff.value = false
  focusCode()
  reveal()
}
function selectFile(index: number) {
  positions.set(file.value.path, { hunk: hunkIndex.value, line: lineId.value })
  fileIndex.value = index
  before.value = false
  const saved = positions.get(file.value.path)
  hunkIndex.value = saved?.hunk ?? 0
  lineId.value = saved?.line ?? hunk.value.lines[0]!.id
  handoff.value = false
  query.value = ''
  normalizeCursor()
}
function normalizeCursor() {
  if (!rows.value.some((row) => row.line.id === lineId.value))
    lineId.value = rows.value[0]?.line.id ?? ''
  focusCode()
  reveal()
}
function setMode(value: Mode) {
  mode.value = value
  before.value = false
  handoff.value = false
  normalizeCursor()
}
function toggleBefore() {
  before.value = !before.value
  handoff.value = false
  normalizeCursor()
}
function move(amount: number) {
  const index = rows.value.findIndex((row) => row.line.id === lineId.value)
  const row = rows.value[Math.max(0, Math.min(rows.value.length - 1, index + amount))]
  if (row) selectLine(row.hunk.id, row.line.id)
}
function markReviewed(advance = false) {
  const id = hunk.value.id
  if (!advance && reviewed.value.has(id)) reviewed.value.delete(id)
  else reviewed.value.add(id)
  notice.value = reviewed.value.has(id)
    ? `Reviewed: ${hunk.value.title}`
    : `Reopened: ${hunk.value.title}`
  if (advance) {
    const all = files.value.flatMap((item, fi) =>
      item.hunks.map((part, hi) => ({ fi, hi, id: part.id })),
    )
    const index = all.findIndex((item) => item.id === id)
    const next = [...all.slice(index + 1), ...all.slice(0, index)].find(
      (item) => !reviewed.value.has(item.id),
    )
    if (next) {
      selectFile(next.fi)
      selectHunk(next.hi)
    } else notice.value = 'Review complete. All sample hunks are reviewed.'
  }
  focusCode()
}
function beginEdit() {
  if (!canEdit.value) {
    notice.value = 'Select a line in the resulting code to edit.'
    return
  }
  editing.value = true
  searching.value = false
  handoff.value = false
  editText.value = current.value!.text
  void nextTick(() =>
    surface.value?.querySelector<HTMLInputElement>('.line-editor')?.focus({ preventScroll: true }),
  )
}
function cancelEdit() {
  editing.value = false
  focusCode()
}
function onEditKey(event: KeyboardEvent) {
  if (event.isComposing) return
  if (event.key === 'Enter') {
    event.preventDefault()
    saveEdit()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}
function saveEdit() {
  const line = current.value
  if (!line) return
  if (editText.value !== line.text) {
    // Preserve the original line when editing unchanged context.
    if (line.kind === 'context') {
      const index = hunk.value.lines.indexOf(line)
      hunk.value.lines.splice(index, 0, {
        ...line,
        id: `${line.id}-original`,
        kind: 'del',
        next: null,
      })
      line.old = null
      line.kind = 'add'
    }
    line.text = editText.value
    reviewed.value.delete(hunk.value.id)
    notice.value = 'Line updated in the sample. This hunk needs review again.'
  }
  editing.value = false
  focusCode()
}
function openEditor() {
  if (!canOpen.value) {
    notice.value = 'No editable working-tree target on this side of the diff.'
    return
  }
  handoff.value = !handoff.value
  focusCode()
}
function nextMatch() {
  if (!matches.value.length) {
    notice.value = 'No matching lines in this view.'
    return
  }
  const index = rows.value.findIndex((row) => row.line.id === lineId.value)
  const next = matches.value.find((row) => rows.value.indexOf(row) > index) ?? matches.value[0]!
  selectLine(next.hunk.id, next.line.id)
}
function closeSearch() {
  searching.value = false
  focusCode()
}
function submitSearch() {
  closeSearch()
  nextMatch()
}
function closeHandoff() {
  handoff.value = false
  focusCode()
}
function startSearch() {
  searching.value = true
  void nextTick(() => searchInput.value?.focus())
}
function reset() {
  files.value = reviewSamples()
  reviewed.value.clear()
  positions.clear()
  fileIndex.value = 0
  hunkIndex.value = 0
  before.value = false
  handoff.value = false
  query.value = ''
  selectHunk(0)
  notice.value = 'Sample reset.'
}
let pendingG = 0
function onKey(event: KeyboardEvent) {
  if (
    editing.value ||
    event.target !== surface.value ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.isComposing
  )
    return
  switch (event.key) {
    case 'j':
    case 'ArrowDown':
      move(1)
      break
    case 'k':
    case 'ArrowUp':
      move(-1)
      break
    case ']':
      selectHunk(hunkIndex.value + 1)
      break
    case '[':
      selectHunk(hunkIndex.value - 1)
      break
    case 'g':
      if (Date.now() - pendingG < 600) {
        move(-rows.value.length)
        pendingG = 0
      } else pendingG = Date.now()
      break
    case 'G':
      move(rows.value.length)
      break
    case 'r':
      markReviewed()
      break
    case 'Enter':
      markReviewed(true)
      break
    case 'e':
      beginEdit()
      break
    case 'o':
      openEditor()
      break
    case '/':
      startSearch()
      break
    case 'n':
      nextMatch()
      break
    case 'b':
      if (mode.value === 'lens') toggleBefore()
      break
    case 'Escape':
      handoff.value = false
      query.value = ''
      break
    default:
      return
  }
  if (event.key !== 'g') pendingG = 0
  event.preventDefault()
  event.stopPropagation()
}
</script>

<template>
  <main class="review-lab">
    <header class="lab-intro">
      <div>
        <p class="eyebrow">ICHI / INTERACTION LAB 001</p>
        <h1>Find your flow in the diff.</h1>
        <p>Three review experiments. Real keyboard controls. Disposable sample code.</p>
      </div>
      <div class="intro-tools">
        <select v-model="theme" aria-label="Sandbox theme">
          <option value="tokyonight-night">Tokyo Night</option>
          <option value="atterpac">Atterpac</option>
          <option value="ayu-light">Light</option></select
        ><button :disabled="editing" @click="reset">Reset sample</button>
      </div>
    </header>

    <nav class="concepts" aria-label="Review experiments">
      <button
        v-for="concept in concepts"
        :key="concept.id"
        :aria-pressed="mode === concept.id"
        :disabled="editing"
        @click="setMode(concept.id)"
      >
        <span>{{ concept.title }}</span
        ><small>{{
          concept.id === 'cursor'
            ? 'Follow the line'
            : concept.id === 'focus'
              ? 'Finish one thought'
              : 'Read what ships'
        }}</small>
      </button>
    </nav>
    <p class="concept-description">{{ description }}</p>

    <section class="workstation" aria-label="Code review sandbox">
      <header class="workstation-bar">
        <strong>ichi <span>/ review-workflow</span></strong
        ><span class="sample-label">SANDBOX · NO DISK WRITES</span
        ><span>{{ reviewed.size }} / {{ totalHunks }} reviewed</span
        ><progress :value="reviewed.size" :max="totalHunks" aria-label="Review progress" />
      </header>
      <div class="workspace">
        <aside class="review-rail">
          <p class="rail-label">
            CHANGES <span>{{ files.length }}</span>
          </p>
          <button
            v-for="(entry, index) in files"
            :key="entry.path"
            class="file-button"
            :aria-pressed="fileIndex === index"
            :disabled="editing"
            @click="selectFile(index)"
          >
            <span class="file-status">{{ index === 2 ? 'D' : 'M' }}</span
            ><span
              >{{ entry.path.split('/').pop()
              }}<small>{{ entry.path.slice(0, entry.path.lastIndexOf('/')) }}</small></span
            ><span class="file-count"
              >{{ entry.hunks.filter((part) => reviewed.has(part.id)).length }}/{{
                entry.hunks.length
              }}</span
            >
          </button>
          <div class="hunk-list">
            <p class="rail-label">REVIEW TRAIL</p>
            <button
              v-for="(part, index) in file.hunks"
              :key="part.id"
              :aria-pressed="hunkIndex === index"
              :disabled="editing"
              @click="selectHunk(index)"
            >
              <span class="review-check" :class="{ done: reviewed.has(part.id) }">{{
                reviewed.has(part.id) ? '✓' : String(index + 1).padStart(2, '0')
              }}</span
              ><span>{{ part.title }}</span>
            </button>
          </div>
          <p class="rail-note">{{ file.summary }}</p>
          <div class="rail-bottom">
            <span class="cursor-dot" /> Review marks are separate from staging.
          </div>
        </aside>

        <section class="reader">
          <header class="reader-header">
            <div>
              <p class="eyebrow">
                WORKING TREE
                <span>/ {{ mode === 'lens' ? (before ? 'BEFORE' : 'AFTER') : 'UNIFIED' }}</span>
              </p>
              <h2>{{ file.path }}</h2>
            </div>
            <button
              v-if="mode === 'lens'"
              :disabled="editing"
              :aria-pressed="before"
              @click="toggleBefore"
            >
              <kbd>b</kbd> {{ before ? 'Show after' : 'Show before' }}
            </button>
          </header>
          <div class="action-bar">
            <span>Hunk {{ hunkIndex + 1 }} of {{ file.hunks.length }}</span>
            <div>
              <button :disabled="editing || !canEdit" @click="beginEdit">
                <kbd>e</kbd> Edit line</button
              ><button :disabled="editing || !canOpen" @click="openEditor">
                <kbd>o</kbd> $EDITOR</button
              ><button
                :disabled="editing"
                :aria-pressed="reviewed.has(hunk.id)"
                @click="markReviewed()"
              >
                <kbd>r</kbd> {{ reviewed.has(hunk.id) ? 'Reviewed ✓' : 'Mark reviewed' }}
              </button>
            </div>
          </div>

          <form v-if="searching" class="search-bar" @submit.prevent="submitSearch">
            <span>/</span
            ><input
              ref="searchInput"
              v-model="query"
              aria-label="Search visible code"
              placeholder="Find in this view…"
              @keydown.esc.prevent="closeSearch"
            /><span>{{ matches.length }} matches</span><button type="submit">Find</button
            ><button type="button" @click="closeSearch">Close</button>
          </form>

          <div
            ref="surface"
            class="code-surface"
            tabindex="0"
            role="region"
            aria-label="Interactive diff. J and K move lines. Brackets move hunks."
            @keydown="onKey"
          >
            <section v-for="part in visibleHunks" :key="part.id" class="hunk-block">
              <header class="hunk-header">
                <span>{{ reviewed.has(part.id) ? '✓' : '○' }}</span
                ><strong>{{ part.title }}</strong
                ><span>L{{ part.start }}</span>
              </header>
              <div v-if="!visibleLines(part.lines).length" class="empty-result">
                This file is removed in the result.
                <button @click="toggleBefore">Show before</button>
              </div>
              <div
                v-for="line in visibleLines(part.lines)"
                :key="line.id"
                class="code-line"
                :class="[
                  line.kind,
                  {
                    current: line.id === lineId,
                    'is-editing': editing && line.id === lineId,
                    match: query && line.text.toLowerCase().includes(query.toLowerCase()),
                  },
                ]"
                :data-line-id="line.id"
                :aria-current="line.id === lineId ? 'true' : undefined"
                @click="selectLine(part.id, line.id)"
              >
                <span class="cursor-marker">{{ line.id === lineId ? '›' : '' }}</span
                ><span class="line-number">{{
                  mode === 'lens' ? (before ? line.old : line.next) : line.old
                }}</span
                ><span v-if="mode !== 'lens'" class="line-number">{{ line.next }}</span
                ><span class="line-sign">{{
                  line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''
                }}</span
                ><input
                  v-if="editing && line.id === lineId"
                  v-model="editText"
                  class="line-editor"
                  :style="{ minWidth: `${Math.max(line.text.length, editText.length, 20) + 2}ch` }"
                  aria-label="Edit sample line"
                  aria-describedby="inline-edit-hint"
                  spellcheck="false"
                  autocomplete="off"
                  @click.stop
                  @keydown.stop="onEditKey"
                /><code v-else>{{ line.text || ' ' }}</code>
              </div>
            </section>
            <div class="end-of-diff">
              <span />{{ mode === 'cursor' ? 'End of file diff' : 'End of hunk' }}<span />
            </div>
          </div>

          <div v-if="handoff" class="handoff" role="status">
            <strong>Editor handoff preview</strong><code>{{ file.path }}:{{ targetLine }}</code
            ><span
              >{{
                current?.kind === 'del'
                  ? 'Removed line → nearest surviving working-tree line. '
                  : ''
              }}Desktop integration would open $EDITOR here with an editor-specific line argument.
              No editor was launched.</span
            ><button @click="closeHandoff">Dismiss</button>
          </div>
          <footer class="reader-footer">
            <span
              ><b>{{ editing ? 'EDIT' : 'NORMAL' }}</b>
              {{
                current
                  ? `old ${current.old ?? '—'} → new ${current.next ?? '—'}`
                  : 'No result lines'
              }}</span
            >
            <div v-if="editing" class="inline-edit-actions">
              <span id="inline-edit-hint">Enter saves · Esc cancels</span>
              <button @click="cancelEdit">Cancel</button>
              <button @click="saveEdit">Save sample <kbd>↵</kbd></button>
            </div>
            <button v-else @click="markReviewed(true)">Review &amp; next <kbd>↵</kbd></button>
          </footer>
        </section>
      </div>
      <footer class="key-bar">
        <span><kbd>j</kbd><kbd>k</kbd> lines</span><span><kbd>[</kbd><kbd>]</kbd> hunks</span
        ><span><kbd>gg</kbd><kbd>G</kbd> first / last</span
        ><button :disabled="editing" @click="startSearch">
          <kbd>/</kbd> search <kbd>n</kbd> next</button
        ><span><kbd>e</kbd> edit</span><span><kbd>o</kbd> editor</span
        ><span><kbd>r</kbd> reviewed</span>
      </footer>
    </section>
    <p class="lab-notice" role="status" aria-live="polite">{{ notice }}</p>
    <p class="lab-caption">
      Try it: move to a changed line → edit it → mark the hunk reviewed → switch experiments. Your
      place and sample edits carry across.
    </p>
  </main>
</template>

<style scoped>
.review-lab {
  min-height: 100vh;
  padding: 32px clamp(16px, 4vw, 64px);
  background: var(--bg);
  color: var(--text);
  font: 13px/1.5 var(--font-ui);
}
.lab-intro,
.intro-tools,
.workstation-bar,
.reader-header,
.action-bar,
.action-bar > div,
.reader-footer,
.key-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lab-intro {
  justify-content: space-between;
  margin-bottom: 28px;
}
.eyebrow {
  margin: 0;
  font: 10px/1.5 var(--font-mono);
  letter-spacing: 0.1em;
  color: var(--text-mut);
}
h1 {
  font-size: 28px;
  letter-spacing: -0.9px;
  font-weight: 500;
  margin: 8px 0;
}
.lab-intro p:last-child {
  margin: 0;
  color: var(--text-dim);
}
button,
select {
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface-panel);
  color: var(--text-dim);
  padding: 6px 10px;
}
button:hover {
  background: var(--hover);
  color: var(--text);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.concepts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.concepts button {
  text-align: left;
  padding: 14px 18px;
  border-radius: 7px;
  background: transparent;
}
.concepts span {
  display: block;
  color: var(--text);
  font-weight: 500;
}
.concepts small {
  display: block;
  color: var(--text-mut);
  margin-top: 4px;
}
.concepts button[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--selected);
}
.concept-description {
  color: var(--text-dim);
  margin: 16px 0 20px;
  min-height: 20px;
}
.workstation {
  border: 1px solid var(--border-2);
  border-radius: 9px;
  overflow: hidden;
  background: var(--surface-panel);
}
.workstation-bar {
  padding: 11px 16px;
  border-bottom: 1px solid var(--border);
  font: 11px var(--font-mono);
}
.workstation-bar strong {
  flex: 1;
  font-weight: 500;
}
.workstation-bar span {
  color: var(--text-mut);
}
.sample-label {
  font-size: 9px;
  letter-spacing: 0.06em;
}
progress {
  width: 70px;
  height: 4px;
  accent-color: var(--accent);
}
.workspace {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
}
.review-rail {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background: var(--surface-base);
}
.rail-label {
  display: flex;
  justify-content: space-between;
  color: var(--text-mut);
  margin: 20px 18px 12px;
  font: 10px var(--font-mono);
  letter-spacing: 0.1em;
}
.file-button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 0;
  text-align: left;
  background: transparent;
  font: 12px var(--font-mono);
}
.file-button[aria-pressed='true'] {
  background: var(--selected);
  border-left-color: var(--accent);
  color: var(--text);
}
.file-button small {
  display: block;
  margin-top: 6px;
  color: var(--text-mut);
  font-size: 10px;
}
.file-status {
  color: var(--text-mut);
  font-size: 10px;
}
.file-count {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-mut);
}
.hunk-list {
  margin-top: 16px;
  border-top: 1px solid var(--border);
}
.hunk-list button {
  display: flex;
  gap: 12px;
  text-align: left;
  width: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 10px 18px;
  font-size: 12px;
}
.hunk-list button[aria-pressed='true'] {
  color: var(--accent-text);
}
.review-check {
  flex: none;
  font: 11px/18px var(--font-mono);
  color: var(--text-mut);
}
.review-check.done {
  color: var(--positive-text);
}
.rail-note {
  padding: 8px 18px;
  color: var(--text-mut);
  font-size: 12px;
}
.rail-bottom {
  margin-top: auto;
  padding: 24px 18px;
  color: var(--text-mut);
  font-size: 11px;
}
.cursor-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  margin-right: 5px;
}
.reader {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-base);
}
.reader-header {
  justify-content: space-between;
  padding: 20px 24px 16px;
}
.reader-header h2 {
  font: 13px var(--font-mono);
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.reader-header .eyebrow span {
  color: var(--accent-text);
}
.action-bar {
  justify-content: space-between;
  padding: 10px 20px;
  border-block: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-mut);
}
.action-bar button {
  border-color: transparent;
  background: transparent;
  padding: 4px 6px;
  font-size: 11px;
}
.action-bar button[aria-pressed='true'] {
  color: var(--positive-text);
}
.code-surface {
  height: 460px;
  overflow: auto;
  position: relative;
  padding: 8px 0 0;
  outline: none;
}
.code-surface:focus-visible {
  outline: 1px solid var(--accent-line);
  outline-offset: -1px;
}
.hunk-block {
  min-width: max-content;
}
.hunk-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 24px 10px;
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.hunk-header strong {
  color: var(--text-dim);
  font-weight: 400;
}
.hunk-header span:last-child {
  margin-left: auto;
  padding-right: 12px;
}
.code-line {
  display: flex;
  min-height: 26px;
  align-items: center;
  padding-right: 28px;
  font: 12px/26px var(--font-mono);
  cursor: text;
  border-left: 2px solid transparent;
}
.code-line:hover {
  background: var(--hover);
}
.code-line.current {
  background: var(--selected);
  border-left-color: var(--accent);
}
.code-line.match code {
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-underline-offset: 4px;
}
.cursor-marker {
  flex: 0 0 20px;
  text-align: center;
  color: var(--accent-text);
  font-size: 18px;
}
.line-number {
  flex: 0 0 38px;
  padding-right: 10px;
  text-align: right;
  color: var(--text-mut);
  font-size: 10px;
  user-select: none;
}
.line-sign {
  flex: 0 0 24px;
  text-align: center;
  user-select: none;
}
.code-line code {
  font: inherit;
  white-space: pre;
  color: var(--text-dim);
  padding: 0 8px;
}
.code-line.add .line-sign {
  color: var(--positive-text);
}
.code-line.del .line-sign {
  color: var(--negative-text);
}
.code-line.add code {
  background: color-mix(in srgb, var(--positive-text) 7%, transparent);
  color: var(--text);
}
.code-line.del code {
  background: color-mix(in srgb, var(--negative-text) 7%, transparent);
}
.end-of-diff {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: center;
  margin: 32px;
  color: var(--text-mut);
  font: 10px var(--font-mono);
}
.end-of-diff span {
  height: 1px;
  width: 45px;
  background: var(--border);
}
.empty-result {
  padding: 30px;
  color: var(--text-mut);
}
.reader-footer {
  margin-top: auto;
  justify-content: space-between;
  border-top: 1px solid var(--border);
  padding: 10px 20px;
  font: 10px var(--font-mono);
  color: var(--text-mut);
}
.reader-footer b {
  color: var(--accent-text);
  font-weight: 500;
  margin-right: 14px;
}
.reader-footer button {
  font: 11px var(--font-ui);
}
.key-bar {
  padding: 10px 16px;
  gap: 22px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  color: var(--text-mut);
  font-size: 11px;
}
.key-bar button {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 11px;
}
kbd {
  font-size: 10px;
  border: 0;
  background: transparent;
  padding: 0;
  min-width: 15px;
  color: var(--text-dim);
}
.lab-notice {
  min-height: 20px;
  margin: 14px 0 0;
  color: var(--accent-text);
  font: 11px/1.5 var(--font-mono);
}
.lab-caption {
  color: var(--text-mut);
  font-size: 12px;
  margin: 10px 0;
}
.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
}
.search-bar input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  color: var(--text);
  padding: 5px;
}
.search-bar span {
  color: var(--text-mut);
  font: 11px var(--font-mono);
}
.code-line.is-editing {
  box-shadow:
    inset 0 -1px var(--accent-line),
    inset 0 1px var(--accent-line);
}
.line-editor {
  flex: 1;
  height: 26px;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  caret-color: var(--accent-text);
  font: inherit;
}
.line-editor:focus-visible {
  outline: none;
}
.inline-edit-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.inline-edit-actions > span {
  color: var(--text-mut);
}
.handoff {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  border-top: 1px solid var(--accent-line);
  padding: 16px 24px;
  background: var(--selected);
  font-size: 12px;
}
.handoff strong {
  font-weight: 500;
}
.handoff code {
  color: var(--accent-text);
  overflow-wrap: anywhere;
}
.handoff > span {
  flex: 1 1 100%;
  color: var(--text-dim);
}
@media (min-width: 1600px) {
  .review-lab {
    padding-inline: max(64px, calc((100vw - 1500px) / 2));
  }
}
@media (max-width: 1000px) {
  .workspace {
    grid-template-columns: 205px minmax(0, 1fr);
  }
  .action-bar {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
  .lab-intro {
    align-items: flex-start;
  }
  .intro-tools {
    flex-direction: column;
    align-items: stretch;
  }
  .sample-label {
    display: none;
  }
}
@media (max-width: 700px) {
  .review-lab {
    padding: 20px 12px;
  }
  h1 {
    font-size: 23px;
  }
  .lab-intro {
    flex-direction: column;
  }
  .intro-tools {
    flex-direction: row;
  }
  .concepts {
    gap: 6px;
  }
  .concepts button {
    padding: 10px;
    font-size: 11px;
  }
  .concepts small {
    display: none;
  }
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }
  .review-rail {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .review-rail > .rail-label,
  .hunk-list,
  .rail-note,
  .rail-bottom {
    display: none;
  }
  .file-button {
    padding: 8px 12px;
  }
  .file-button small {
    display: inline;
    margin-left: 10px;
  }
  .reader-header {
    padding: 16px;
  }
  .key-bar {
    gap: 12px;
  }
  .reader-footer {
    padding: 10px;
  }
  .code-surface {
    height: 380px;
  }
}
</style>

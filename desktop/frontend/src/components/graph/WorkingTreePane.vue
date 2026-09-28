<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { PhCaretRight, PhCheck, PhFolder } from '@phosphor-icons/vue'
import type { StatusEntry } from '../../bindings/github.com/atterpac/ichi/internal/git'
import type { RepoInfo } from '../../bindings/github.com/atterpac/ichi/desktop/services'
import UiButton from '../common/UiButton.vue'
import { worktreeFiles, type WorktreeDeltas } from './worktreeHeat'
const props = defineProps<{
  entries: StatusEntry[]
  deltas: WorktreeDeltas
  repo: RepoInfo | null
}>()
const emit = defineEmits<{ retry: []; navigate: [view: string, focus?: string] }>()
const files = computed(() => worktreeFiles(props.entries, props.deltas))
type WorkFile = ReturnType<typeof worktreeFiles>[number]
const selectedPath = ref('')
const selected = computed(
  () => files.value.find((file) => file.path === selectedPath.value) ?? files.value[0],
)
const collapsed = ref(new Set<string>())
const groups = computed(() => {
  const result = new Map<string, WorkFile[]>()
  for (const file of files.value) {
    if (!result.has(file.dir)) result.set(file.dir, [])
    result.get(file.dir)!.push(file)
  }
  return Array.from(result, ([dir, files]) => ({ dir, files }))
})
const total = computed(() =>
  files.value
    .filter((file) => file.known)
    .reduce((sum, file) => sum + file.added + file.removed, 0),
)
const unknown = computed(() => files.value.filter((file) => !file.known).length)
const staged = computed(() => files.value.filter((file) => file.staged).length)
const conflicts = computed(() => files.value.filter((file) => file.conflict).length)
const additions = computed(
  () => (props.repo?.Staged.Insertions ?? 0) + (props.repo?.Unstaged.Insertions ?? 0),
)
const deletions = computed(
  () => (props.repo?.Staged.Deletions ?? 0) + (props.repo?.Unstaged.Deletions ?? 0),
)
watch(
  files,
  () => {
    if (!files.value.some((file) => file.path === selectedPath.value))
      selectedPath.value =
        files.value.find((file) => file.pending && file.known)?.path ??
        files.value.find((file) => file.pending)?.path ??
        files.value[0]?.path ??
        ''
  },
  { immediate: true },
)
function toggle(dir: string) {
  if (collapsed.value.has(dir)) collapsed.value.delete(dir)
  else collapsed.value.add(dir)
}
const indexOf = (file: WorkFile) => files.value.findIndex((entry) => entry.path === file.path)
async function select(file: WorkFile, reveal = false) {
  selectedPath.value = file.path
  if (reveal) {
    collapsed.value.delete(file.dir)
    await nextTick()
    document
      .getElementById(`working-heat-file-${indexOf(file)}`)
      ?.scrollIntoView({ block: 'nearest' })
  }
}
function mapKey(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? files.value.length - 1
        : Math.max(
            0,
            Math.min(files.value.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
          )
  const file = files.value[next]
  if (file) {
    void select(file, true)
    document.getElementById(`working-heat-segment-${next}`)?.focus()
  }
}
function rowKey(event: KeyboardEvent, index: number) {
  if (['Enter', 'l', 'ArrowRight'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    emit('navigate', 'status', files.value[index]?.key)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const next = Math.max(
    0,
    Math.min(files.value.length - 1, index + (['ArrowDown', 'j'].includes(event.key) ? 1 : -1)),
  )
  const file = files.value[next]
  if (file) {
    void select(file, true).then(() =>
      document.getElementById(`working-heat-file-${next}`)?.focus(),
    )
  }
}
const description = (file: WorkFile) =>
  `${file.path}: ${file.state}, ${file.known ? `${file.added} additions, ${file.removed} deletions` : file.binary ? 'binary' : 'line counts unavailable'}`
</script>

<template>
  <section class="heat-pane" aria-label="Working tree files">
    <header class="pane-head">
      <div class="pane-title">
        <h2>Working tree</h2>
        <span>{{ files.length }} files</span>
      </div>
      <div class="summary">
        <span class="positive">+{{ additions }}</span
        ><span class="negative">−{{ deletions }}</span
        ><span class="summary-meta"
          >{{ staged }} staged<span v-if="conflicts"> · {{ conflicts }} conflict</span></span
        >
      </div>
    </header>
    <template v-if="selected">
      <section class="map-section" aria-label="Changes by file">
        <div class="map-caption">
          <span>Changes by file</span
          ><span v-if="selected.known"
            >{{ selected.added + selected.removed }} / {{ total }} lines</span
          >
        </div>
        <div class="change-map" role="group" aria-label="Select a changed file">
          <button
            v-for="(file, index) in files"
            :id="`working-heat-segment-${index}`"
            :key="file.path"
            class="map-segment"
            :class="{
              selected: selected.path === file.path,
              empty: !file.known || file.added + file.removed === 0,
            }"
            :style="{ flexGrow: file.known ? file.added + file.removed : 0 }"
            :aria-label="description(file)"
            :aria-pressed="selected.path === file.path" :tabindex="selected.path === file.path ? 0 : -1"
            :title="description(file)"
            @click="select(file, true)"
            @keydown="mapKey($event, index)"
          >
            <span />
          </button>
        </div>
        <div class="map-selection">
          <span class="selection-dot" /><span>{{ selected.name }}</span
          ><small>{{ selected.state }}</small>
        </div>
        <p v-if="unknown" class="map-note">
          {{ unknown }} {{ unknown === 1 ? 'file has' : 'files have' }} no line counts; shown at
          minimum width.
        </p>
      </section>
      <div class="heat-files">
        <section v-for="(group, groupIndex) in groups" :key="group.dir" class="directory">
          <button
            class="directory-toggle"
            :aria-expanded="!collapsed.has(group.dir)"
            :aria-controls="`working-heat-group-${groupIndex}`"
            @click="toggle(group.dir)"
          >
            <PhCaretRight weight="bold" :size="12" class="caret" /><PhFolder weight="bold" :size="16" /><span
              :title="group.dir"
              >{{ group.dir === '.' ? 'Repository root' : group.dir }}</span
            ><small>{{ group.files.length }}</small>
          </button>
          <div :id="`working-heat-group-${groupIndex}`" v-show="!collapsed.has(group.dir)">
            <button
              v-for="file in group.files"
              :id="`working-heat-file-${indexOf(file)}`"
              :key="file.path"
              class="heat-file"
              :class="{ selected: selected.path === file.path }"
              :aria-pressed="selected.path === file.path" :tabindex="selected.path === file.path ? 0 : -1"
              :title="`${description(file)} · Double-click or Enter to review`"
              @click="select(file)"
              @dblclick="emit('navigate', 'status', file.key)"
              @keydown="rowKey($event, indexOf(file))"
            >
              <PhCheck weight="bold"
                v-if="file.staged && !file.pending"
                class="file-mark staged"
                :size="14"
                aria-label="Staged"
              /><span
                v-else
                class="file-mark"
                :class="{ conflict: file.conflict }"
                :aria-label="file.state"
                >{{ file.label }}</span
              >
              <span class="heat-name"
                >{{ file.name }}<small v-if="file.oldPath">from {{ file.oldPath }}</small
                ><small v-if="file.staged && file.pending">Partially staged</small></span
              >
              <span class="file-counts"
                ><template v-if="file.known"
                  ><span class="positive">+{{ file.added }}</span
                  ><span class="negative">−{{ file.removed }}</span></template
                ><span v-else class="unknown-count">{{ file.binary ? 'binary' : '—' }}</span></span
              >
            </button>
          </div>
        </section>
      </div>
    </template>
    <p v-else class="empty-tree">Working tree is clean.</p>
    <footer class="pane-footer">
      <UiButton variant="primary" :disabled="!selected" @click="emit('navigate', 'status', selected?.key)"
        >Review selected file</UiButton
      ><UiButton variant="ghost" @click="emit('retry')">Refresh</UiButton>
    </footer>
  </section>
</template>
<style scoped>
.heat-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: var(--surface-raised);
}
.pane-head {
  padding: var(--space-8) var(--space-8) 0;
}
.pane-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-6);
}
.pane-title h2 {
  margin: 0;
  color: var(--head);
  font: var(--font-title);
}
.pane-title > span {
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-ui);
  font-variant-numeric: tabular-nums;
}
.summary {
  display: flex;
  gap: var(--space-4);
  align-items: baseline;
  margin-top: var(--space-3);
  font: var(--fs-sm) var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.summary-meta {
  margin-left: auto;
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-ui);
}
.positive {
  color: var(--positive-text);
}
.negative {
  color: var(--negative-text);
}
.conflict {
  color: var(--negative-text);
}
.map-section {
  padding: var(--space-8) var(--space-8) var(--space-6);
  border-bottom: 1px solid var(--line-faint);
}
.map-caption {
  display: flex;
  justify-content: space-between;
  gap: var(--space-4);
  color: var(--text-mut);
  font: var(--font-label);
  font-variant-numeric: tabular-nums;
}
.change-map {
  overflow-x: auto;
  scrollbar-width: thin;
  display: flex;
  gap: 3px;
  height: 38px;
  margin-top: var(--space-3);
  align-items: stretch;
}
.map-segment {
  height: 28px;
  flex-shrink: 0;
  position: relative;
  flex-basis: 0;
  min-width: 6px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  padding: 7px 0;
  cursor: pointer;
}
.map-segment > span {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: color-mix(in oklab, var(--accent) 28%, var(--surface-raised));
}
.map-segment.empty > span {
  background: var(--border);
}
.map-segment:hover > span {
  background: color-mix(in oklab, var(--accent) 55%, var(--surface-raised));
}
.map-segment.selected > span {
  background: var(--accent);
}
.map-segment.selected::after {
  content: '';
  position: absolute;
  bottom: 1px;
  left: calc(50% - 2px);
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}
.map-segment:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 1px;
}
.map-selection {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
  min-width: 0;
  color: var(--text);
  font: var(--fs-xs) var(--font-mono);
}
.map-selection > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selection-dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.map-selection small {
  flex: none;
  margin-left: auto;
  font: var(--fs-xs) var(--font-ui);
  color: var(--text-mut);
}
.map-note {
  margin: var(--space-4) 0 0;
  color: var(--text-mut);
  font: var(--fs-xs)/1.45 var(--font-ui);
}
.heat-files {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-4) var(--space-4) var(--space-6);
}
.directory + .directory {
  margin-top: var(--space-4);
}
.directory-toggle {
  display: grid;
  grid-template-columns: 12px 14px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  height: var(--control-height-md);
  padding: 0 var(--space-4);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-mono);
  text-align: left;
}
.directory-toggle > svg:nth-child(2) {
  width: 14px;
  height: 14px;
  opacity: 0.8;
}
.directory-toggle > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
  text-align: left;
}
.directory-toggle small {
  font: var(--fs-xs) var(--font-ui);
  font-variant-numeric: tabular-nums;
}
.directory-toggle:hover {
  background: var(--hover);
  color: var(--text-dim);
}
.directory-toggle[aria-expanded='true'] .caret {
  transform: rotate(90deg);
}
.heat-file {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  min-height: 30px;
  padding: var(--space-3) var(--space-4) var(--space-3) var(--space-10);
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-align: left;
}
.heat-file:hover {
  background: var(--hover);
}
.heat-file.selected {
  background: var(--selected);
}
.heat-file.selected .heat-name {
  color: var(--head);
}
.heat-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
  font: var(--fs-sm) var(--font-mono);
}
.heat-name small {
  display: block;
  color: var(--text-mut);
  font: var(--fs-2xs)/1.6 var(--font-ui);
}
.file-mark {
  color: var(--text-mut);
  font: var(--weight-medium) var(--fs-xs) var(--font-mono);
}
.file-mark.staged {
  color: var(--positive-text);
}
.file-mark.conflict {
  color: var(--negative-text);
}
.file-counts {
  display: flex;
  gap: var(--space-3);
  font: var(--fs-xs) var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.unknown-count {
  color: var(--text-mut);
}
.pane-footer {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-6) var(--space-8);
  border-top: 1px solid var(--line-faint);
}
.pane-footer .ui-button:first-child {
  flex: 1;
}
.empty-tree {
  padding: var(--space-8);
  color: var(--text-mut);
  font: var(--fs-sm) var(--font-ui);
}
</style>

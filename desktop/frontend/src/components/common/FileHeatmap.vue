<script setup lang="ts">
import { computed, useId } from 'vue'
export interface HeatFile {
  path: string
  added: number
  removed: number
  known: boolean
}
const props = defineProps<{ files: HeatFile[]; selectedPath?: string }>()
const emit = defineEmits<{ select: [path: string] }>()
const id = useId()
const selected = computed(
  () => props.files.find((f) => f.path === props.selectedPath) ?? props.files[0],
)
const total = computed(() =>
  props.files.reduce((sum, f) => sum + (f.known ? f.added + f.removed : 0), 0),
)
const description = (f: HeatFile) =>
  `${f.path}: ${f.known ? `${f.added} additions, ${f.removed} deletions` : 'no line counts'}`
function key(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? props.files.length - 1
        : Math.max(
            0,
            Math.min(props.files.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)),
          )
  const file = props.files[next]
  if (file) {
    emit('select', file.path)
    document.getElementById(`${id}-${next}`)?.focus()
  }
}
</script>
<template>
  <section v-if="selected" class="file-heatmap" aria-label="Changes by file">
    <div class="map-caption">
      <span>Changes by file</span
      ><span v-if="selected.known"
        >{{ selected.added + selected.removed }} / {{ total }} lines</span
      >
    </div>
    <div class="change-map" role="group" aria-label="Select a changed file">
      <button
        v-for="(file, index) in files"
        :id="`${id}-${index}`"
        :key="file.path"
        type="button"
        class="map-segment"
        :class="{
          selected: selected.path === file.path,
          empty: !file.known || file.added + file.removed === 0,
        }"
        :style="{ flexGrow: file.known ? file.added + file.removed : 0 }"
        :aria-label="description(file)"
        :aria-pressed="selected.path === file.path" :tabindex="selected.path === file.path ? 0 : -1"
        :title="description(file)"
        @click="emit('select', file.path)"
        @keydown="key($event, index)"
      >
        <span />
      </button>
    </div>
    <div class="map-selection" :title="selected.path">
      <span class="selection-dot" /><span>{{ selected.path }}</span>
    </div>
    <p v-if="files.some((f) => !f.known)" class="map-note">
      Files without line counts use minimum width.
    </p>
  </section>
</template>
<style scoped>
.file-heatmap {
  min-width: 0;
  margin: var(--space-8) 0;
}
.map-note {
  color: var(--text-mut);
  font-size: var(--fs-xs);
  margin: var(--space-4) 0 0;
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
  margin-top: 6px;
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
  font: var(--font-data);
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
</style>

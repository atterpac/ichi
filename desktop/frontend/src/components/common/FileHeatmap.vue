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
const MAX_SEGMENTS = 160
const groupSize = computed(() => Math.max(1, Math.ceil(props.files.length / MAX_SEGMENTS)))
const indices = computed(() => new Map(props.files.map((file, index) => [file.path, index])))
const selectedIndex = computed(() => indices.value.get(props.selectedPath ?? '') ?? 0)
const selected = computed(
  () => props.files[selectedIndex.value],
)
const segments = computed(() => {
  const result: { start: number; end: number; added: number; removed: number; unknown: number }[] = []
  for (let start = 0; start < props.files.length; start += groupSize.value) {
    const end = Math.min(props.files.length, start + groupSize.value)
    let added = 0, removed = 0, unknown = 0
    for (let index = start; index < end; index++) {
      const file = props.files[index]!
      if (file.known) { added += file.added; removed += file.removed }
      else unknown++
    }
    result.push({ start, end, added, removed, unknown })
  }
  return result
})
type Segment = (typeof segments.value)[number]
const activeSegment = (segment: Segment) => selectedIndex.value >= segment.start && selectedIndex.value < segment.end
const total = computed(() =>
  props.files.reduce((sum, f) => sum + (f.known ? f.added + f.removed : 0), 0),
)
const description = (f: HeatFile) =>
  `${f.path}: ${f.known ? `${f.added} additions, ${f.removed} deletions` : 'no line counts'}`
function segmentDescription(segment: Segment) {
  if (segment.end - segment.start === 1) return description(props.files[segment.start]!)
  return `Files ${segment.start + 1}–${segment.end}: ${segment.added} additions, ${segment.removed} deletions${segment.unknown ? `; ${segment.unknown} without line counts` : ''}`
}
function key(event: KeyboardEvent, segment: Segment) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented) return
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  const index = activeSegment(segment) ? selectedIndex.value : segment.start
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
    document.getElementById(`${id}-${Math.floor(next / groupSize.value)}`)?.focus()
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
        v-for="(segment, index) in segments"
        :id="`${id}-${index}`"
        :key="segment.start"
        type="button"
        class="map-segment"
        :class="{
          selected: activeSegment(segment),
          empty: segment.added + segment.removed === 0,
        }"
        :style="{ flexGrow: segment.added + segment.removed }"
        :aria-label="segmentDescription(segment)"
        :aria-pressed="activeSegment(segment)" :tabindex="activeSegment(segment) ? 0 : -1"
        :title="segmentDescription(segment)"
        @click="emit('select', files[segment.start]!.path)"
        @keydown="key($event, segment)"
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
    <p v-if="groupSize > 1" class="map-note">{{ files.length }} files grouped into {{ segments.length }} segments. Arrow keys select individual files.</p>
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

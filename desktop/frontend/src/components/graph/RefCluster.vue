<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import RefLabel from '../common/RefLabel.vue'
import type { RefDecoration } from '../../bindings/github.com/atterpac/ichi/internal/git'
const props = withDefaults(
  defineProps<{
    decorations: RefDecoration[]
    expanded?: boolean
    hoverEnabled?: boolean
    rowHovered?: boolean
  }>(),
  { expanded: false, hoverEnabled: true, rowHovered: false },
)
const hovered = ref(false)
const hoverReady = ref(false)
let hoverTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => props.hoverEnabled && (hovered.value || props.rowHovered),
  (active) => {
    clearTimeout(hoverTimer)
    hoverReady.value = false
    if (active)
      hoverTimer = setTimeout(() => {
        hoverReady.value = true
      }, 250)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(hoverTimer))
const isExpanded = computed(
  () => props.decorations.length > 1 && (props.expanded || hoverReady.value),
)
const primary = computed(
  () =>
    props.decorations.find((ref) => ref.IsHead) ??
    props.decorations.find((ref) => ref.Kind === 'branch') ??
    props.decorations.find((ref) => ref.Kind === 'remote') ??
    props.decorations[0],
)
const orderedRefs = computed(() =>
  primary.value
    ? [primary.value, ...props.decorations.filter((decoration) => decoration !== primary.value)]
    : [],
)
const description = computed(
  () =>
    props.decorations.map((ref) => `${ref.Name}${ref.IsHead ? ' (current)' : ''}`).join('\n') +
    '\nHover or hold Shift to show all refs. Click or press r for ref actions',
)
</script>

<template>
  <span
    v-if="primary"
    class="ref-cluster"
    :class="{ 'is-expanded': isExpanded }"
    :title="isExpanded ? undefined : description"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
  >
    <span
      class="ref-compact"
      :class="{ concealed: isExpanded }"
      :aria-hidden="isExpanded || undefined"
    >
      <RefLabel
        :name="primary.Name"
        :kind="primary.Kind"
        :current="primary.IsHead"
        :title="description"
      />
      <span
        v-if="decorations.length > 1"
        class="ref-overflow"
        :aria-label="`${decorations.length - 1} more refs`"
        >+{{ decorations.length - 1 }}</span
      >
    </span>
    <span v-if="isExpanded" class="ref-expanded" role="list" aria-label="Refs on this commit">
      <span
        v-for="decoration in orderedRefs"
        :key="`${decoration.Kind}:${decoration.Name}`"
        role="listitem"
      >
        <RefLabel
          expanded
          :name="decoration.Name"
          :kind="decoration.Kind"
          :current="decoration.IsHead"
        />
      </span>
    </span>
  </span>
</template>

<style scoped>
.ref-cluster {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  cursor: pointer;
}
.ref-compact {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  max-width: 100%;
}
.ref-compact.concealed {
  visibility: hidden;
}
.ref-overflow {
  flex: none;
  color: var(--text-mut);
  font: var(--fs-xs) var(--font-ui);
  font-variant-numeric: tabular-nums;
}
.ref-expanded {
  position: absolute;
  top: -6px;
  left: -6px;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: max-content;
  max-width: min(680px, calc(100cqw - var(--ref-width, 160px) - 24px));
  max-height: min(320px, 60vh);
  overflow: auto;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-panel, var(--surface));
  box-shadow: var(--elev-2);
  text-align: left;
}
.ref-expanded > span {
  display: flex;
  min-width: 0;
  max-width: 100%;
}
.ref-expanded :deep(.ref-label) {
  height: auto;
  min-height: 22px;
}
.ref-expanded :deep(.ref-name) {
  white-space: normal;
  overflow-wrap: anywhere;
}
.ref-cluster:hover .ref-overflow {
  color: var(--text);
}
</style>

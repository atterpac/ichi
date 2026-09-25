<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ additions: number; deletions: number }>()
const counts = computed(() => ({
  added: Number.isFinite(props.additions) ? Math.max(0, props.additions) : 0,
  removed: Number.isFinite(props.deletions) ? Math.max(0, props.deletions) : 0,
}))
const total = computed(() => counts.value.added + counts.value.removed)
// Five equal cells show the addition/deletion ratio, not relative file size.
// A split cell preserves small amounts of either kind without rounding to zero.
const cells = computed(() =>
  Array.from({ length: 5 }, (_, index) => {
    const addedCells = total.value ? (counts.value.added / total.value) * 5 : 0
    return `${Math.max(0, Math.min(1, addedCells - index)) * 100}%`
  }),
)
</script>

<template>
  <span
    class="diff-bar"
    :class="{ 'is-empty': !total }"
    aria-hidden="true"
    :title="`${counts.added} additions, ${counts.removed} deletions · proportion of changed lines`"
  >
    <span v-for="(portion, index) in cells" :key="index" :style="{ '--added-portion': portion }" />
  </span>
</template>

<style scoped>
.diff-bar {
  display: inline-grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 2px;
  width: 38px;
  height: 6px;
  flex: none;
  vertical-align: middle;
}
.diff-bar > span {
  border-radius: 1px;
  background: linear-gradient(
    to right,
    var(--positive-text) 0 var(--added-portion),
    var(--negative-text) var(--added-portion) 100%
  );
}
.diff-bar.is-empty > span {
  background: var(--border-2);
}
</style>
